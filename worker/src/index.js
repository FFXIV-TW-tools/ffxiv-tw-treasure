/* 藏寶圖多人共享路線 — 房間 API（Cloudflare Durable Object + WebSocket，SQLite-backed）
 * 一房 = 一個 Room DO 實例（idFromName(code)）。
 *   presence = 連線數（getWebSockets，0 storage 寫）
 *   編輯     = **op-based**：client 送操作(add/remove/done/order/clear)，DO 單執行緒序列套用到
 *              權威清單(points)再廣播 → 同時加點不互蓋（vs mit 整份覆蓋會掉點）。
 * 端點：POST /room(產碼+seed) · GET /room/:code(快照,fallback) · GET /room/:code/ws(WebSocket) · GET /health
 */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford（去 I L O U 避混淆）
const MAX_MSG_BYTES = 8 * 1024;       // 單一 op 訊息上限（op 很小，8KB 綽綽）
const MAX_SEED_BYTES = 64 * 1024;     // 建房 seed 上限
const MAX_POINTS = 64;                 // 一房挖掘點上限（8 人 × 數張圖，64 足夠）
const EXPIRE_MS = 6 * 60 * 60 * 1000;  // 房間建立 6 小時後過期（DO alarm 清資料 + 拒新連線）
const OP_RATE_MAX = 25;                // 同 socket op 速率：每窗 25 次
const OP_RATE_WINDOW_MS = 3000;        // 窗口 3s（容許「連點加 8 個」的合法爆發，擋惡意洪水）
const ROOM_RATE_MAX = 10;              // 同 IP 建房上限：每窗 10 次
const ROOM_RATE_WINDOW_MS = 60 * 1000;
const roomRate = new Map();            // ip → {n, reset}（isolate 短命回收兜上界，同 mit 書面豁免）

// Origin 白名單：localhost / 127.0.0.1 / 本工具 pages.dev（含 CF preview 子網域）。host 錨定 ^...$。
function originAllowed(req) {
  const o = req.headers.get("Origin") || "";
  return /^https?:\/\/localhost(:\d+)?$/.test(o) ||
         /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(o) ||
         /^https:\/\/([a-z0-9-]+\.)?ffxiv-tw-treasure\.pages\.dev$/.test(o);
}

// 單一挖掘點驗證（擋畸形 / 欄位污染）
function validatePoint(p) {
  if (!p || typeof p !== "object") return false;
  if (typeof p.key !== "string" || !p.key || p.key.length > 80) return false;
  if (typeof p.owner !== "string" || !p.owner || p.owner.length > 40) return false;
  if (!Number.isInteger(p.map)) return false;
  if (typeof p.x !== "number" || !isFinite(p.x) || p.x < 0 || p.x > 60) return false;
  if (typeof p.y !== "number" || !isFinite(p.y) || p.y < 0 || p.y > 60) return false;
  if (!Number.isInteger(p.item)) return false;
  return true;
}
// 建房 seed 整份 state 驗證（points 陣列、每點合法、不超量）
function validateState(s) {
  if (!s || typeof s !== "object" || !Array.isArray(s.points)) return false;
  if (s.points.length > MAX_POINTS) return false;
  return s.points.every(validatePoint);
}

// op-based 核心：把單一操作套用到 points，回傳「新 points」或 null（null = 無效/no-op，不寫不廣播）。
// 純函式 → 單元測試直接驗（DO 單執行緒序列呼叫它 = 並發加點不互蓋的證明）。
function applyOp(points, op) {
  if (!Array.isArray(points)) points = [];
  if (!op || typeof op !== "object") return null;
  switch (op.t) {
    case "add": {
      if (!validatePoint(op.p)) return null;
      if (points.length >= MAX_POINTS) return null;
      if (points.some((q) => q.key === op.p.key)) return null;   // 同 key 已存在 → no-op（idempotent）
      return points.concat([{
        key: op.p.key, owner: op.p.owner,
        ownerName: typeof op.p.ownerName === "string" ? op.p.ownerName.slice(0, 24) : "",
        map: op.p.map, x: op.p.x, y: op.p.y, item: op.p.item, done: false,
      }]);
    }
    case "remove": {
      if (typeof op.key !== "string") return null;
      const next = points.filter((q) => q.key !== op.key);
      return next.length === points.length ? null : next;
    }
    case "done": {
      if (typeof op.key !== "string") return null;
      let hit = false;
      const next = points.map((q) => (q.key === op.key ? ((hit = true), { ...q, done: !!op.done }) : q));
      return hit ? next : null;
    }
    case "order": {
      if (!Array.isArray(op.keys)) return null;
      const byKey = new Map(points.map((q) => [q.key, q]));
      const ordered = [];
      for (const k of op.keys) { const q = byKey.get(k); if (q) { ordered.push(q); byKey.delete(k); } }
      for (const q of byKey.values()) ordered.push(q);   // 未列到的補後面（不丟）
      return ordered;
    }
    case "clearDone": {
      const next = points.filter((q) => !q.done);
      return next.length === points.length ? null : next;
    }
    case "clear":
      return points.length ? [] : null;
    default:
      return null;
  }
}

function rateLimited(map, key, max, windowMs) {
  if (!key) return false;
  const now = Date.now();
  const e = map.get(key);
  if (!e || now > e.reset) { map.set(key, { n: 1, reset: now + windowMs }); return false; }
  if (e.n >= max) return true;
  e.n++;
  return false;
}

function corsHeaders(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": originAllowed(req) ? o : "https://ffxiv-tw-treasure.pages.dev",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
function json(obj, status, req, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(req), ...(extra || {}) },
  });
}
function genCode() {
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(6))) s += B32[b & 31];
  return s;
}

export default {
  async fetch(req, env) {
    try {
      if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
      const url = new URL(req.url);
      const parts = url.pathname.split("/").filter(Boolean);

      if (parts[0] === "health") return json({ ok: true }, 200, req);
      if (parts[0] !== "room") return json({ error: "not_found" }, 404, req);

      if (parts.length === 1 && req.method === "POST") {
        if (rateLimited(roomRate, req.headers.get("CF-Connecting-IP") || "", ROOM_RATE_MAX, ROOM_RATE_WINDOW_MS)) {
          return json({ error: "rate_limited" }, 429, req);
        }
        const body = await req.text();
        if (body && body.length > MAX_SEED_BYTES) return json({ error: "payload_too_large" }, 413, req);
        let seed = {};
        try { seed = body ? JSON.parse(body) : {}; } catch (e) { return json({ error: "bad_json" }, 400, req); }
        if (seed && seed.state != null && !validateState(seed.state)) return json({ error: "bad_state" }, 400, req);
        const code = genCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        await stub.fetch(new Request("https://do/seed", { method: "POST", body: body || "{}", headers: { "Content-Type": "application/json" } }));
        return json({ code }, 200, req);
      }

      const code = (parts[1] || "").toUpperCase();
      if (!/^[0-9A-Z]{6}$/.test(code)) return json({ error: "bad_code" }, 400, req);
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
    } catch (e) {
      console.error("worker fetch error:", (e && e.stack) || e);
      return json({ error: "server_error" }, 500, req);
    }
  },
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this._opRate = new WeakMap();   // per-socket op 速率窗
  }

  online() { return this.ctx.getWebSockets().length; }

  broadcast(data, except) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) { try { ws.send(data); } catch (e) { /* 已斷 */ } }
    }
  }
  broadcastOnline(exclude) {
    const list = this.ctx.getWebSockets();
    const n = exclude ? list.filter((s) => s !== exclude).length : list.length;
    this.broadcast(JSON.stringify({ t: "online", online: n }), exclude);
  }

  async getPoints() {
    const st = await this.ctx.storage.get("state");
    return (st && Array.isArray(st.points)) ? st.points : [];
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") === "websocket") {
      if (!originAllowed(req)) return new Response("forbidden_origin", { status: 403 });
      const st = await this.ctx.storage.get("state");
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      if (st && st.expiresAt && Date.now() > st.expiresAt) {   // 過期房：清資料 + 通知 + 關
        await this.ctx.storage.deleteAll();
        try { pair[1].send(JSON.stringify({ t: "expired" })); pair[1].close(1000, "expired"); } catch (e) {}
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      const points = (st && Array.isArray(st.points)) ? st.points : [];
      try { pair[1].send(JSON.stringify({ t: "init", points, online: this.online(), expiresAt: (st && st.expiresAt) || 0 })); } catch (e) {}
      this.broadcastOnline();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (req.method === "POST") {   // 建房 seed
      const body = await req.json().catch(() => ({}));
      let seedPoints = [];
      if (body && body.state) {
        if (!validateState(body.state)) return new Response(JSON.stringify({ error: "bad_state" }), { status: 400, headers: { "Content-Type": "application/json" } });
        seedPoints = body.state.points;
      }
      const expiresAt = Date.now() + EXPIRE_MS;
      await this.ctx.storage.put("state", { points: seedPoints, expiresAt });
      await this.ctx.storage.setAlarm(expiresAt);   // 6h 到期 → alarm() 自動清
      return new Response(JSON.stringify({ ok: true, expiresAt }), { headers: { "Content-Type": "application/json" } });
    }
    if (req.method === "GET") {
      return new Response(JSON.stringify({ points: await this.getPoints(), online: this.online() }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  async webSocketMessage(ws, message) {
    if (typeof message === "string" && message.length > MAX_MSG_BYTES) return;
    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; }
    if (msg.t === "ping") { try { ws.send(JSON.stringify({ t: "pong" })); } catch (e) {} return; }

    // per-socket op 速率限制（容許合法爆發、擋洪水）
    const e = this._opRate.get(ws);
    const now = Date.now();
    if (!e || now > e.reset) this._opRate.set(ws, { n: 1, reset: now + OP_RATE_WINDOW_MS });
    else if (e.n >= OP_RATE_MAX) return;   // 超速 → 丟
    else e.n++;

    const st = await this.ctx.storage.get("state");
    if (st && st.expiresAt && now > st.expiresAt) {   // 過期房：拒 op + 通知關閉
      try { ws.send(JSON.stringify({ t: "expired" })); ws.close(1000, "expired"); } catch (e2) {}
      return;
    }
    const points = (st && Array.isArray(st.points)) ? st.points : [];
    const next = applyOp(points, msg);     // 套用到權威清單（DO 單執行緒序列 → 並發 op 不互蓋）
    if (next === null) return;             // 無效 / no-op：不寫不廣播
    try {
      await this.ctx.storage.put("state", { points: next, expiresAt: (st && st.expiresAt) || (Date.now() + EXPIRE_MS) });   // 保留過期時刻
    } catch (storageErr) {
      try { ws.send(JSON.stringify({ t: "error", reason: "storage_failed" })); } catch (e2) {}
      return;
    }
    this.broadcast(JSON.stringify({ t: "state", points: next }));   // 廣播權威結果給全員（含發起者 → 一致）
  }
  async webSocketClose(ws) { try { ws.close(); } catch (e) {} this.broadcastOnline(ws); }
  async webSocketError(ws) { this.broadcastOnline(ws); }
  // 6h 到期：清房間資料 + 通知全員關閉（DO alarm 觸發）
  async alarm() {
    await this.ctx.storage.deleteAll();
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({ t: "expired" })); ws.close(1000, "expired"); } catch (e) {} }
  }
}

// 純函式 export 供單元測試（wrangler 只認 default.fetch + Room class）
export { applyOp, validatePoint, validateState, originAllowed, genCode };
