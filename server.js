const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_PLAYERS = 10;
const TICK_MS = 50; // 20 updates/sec
const PLAYER_SPEED = 150; // pixels/sec
const ATTACK_RANGE = 62;
const ATTACK_COOLDOWN_MS = 450;

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/public/index.html";
  else if (!urlPath.startsWith("/public/")) urlPath = "/public" + urlPath;

  const safePath = path.normalize(path.join(ROOT, urlPath));
  if (!safePath.startsWith(path.join(ROOT, "public"))) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(safePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(safePath);
    const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const players = new Map();
const world = { width: 1600, height: 1100 };
const mobs = [
  { id: "slime-1", x: 390, y: 320, hp: 30, maxHp: 30, alive: true, respawnAt: 0 },
  { id: "slime-2", x: 520, y: 430, hp: 30, maxHp: 30, alive: true, respawnAt: 0 },
  { id: "slime-3", x: 770, y: 300, hp: 30, maxHp: 30, alive: true, respawnAt: 0 },
  { id: "slime-4", x: 1020, y: 500, hp: 30, maxHp: 30, alive: true, respawnAt: 0 },
  { id: "slime-5", x: 1190, y: 330, hp: 30, maxHp: 30, alive: true, respawnAt: 0 },
  { id: "slime-6", x: 880, y: 760, hp: 30, maxHp: 30, alive: true, respawnAt: 0 }
];

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function snapshot() {
  return {
    type: "state",
    world,
    players: [...players.values()].map(p => ({
      id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
      level: p.level, exp: p.exp, facing: p.facing, attackUntil: p.attackUntil
    })),
    mobs: mobs.map(m => ({ ...m }))
  };
}
function safeName(value) {
  return String(value || "冒險者").replace(/[<>]/g, "").trim().slice(0, 12) || "冒險者";
}
wss.on("connection", (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { type: "notice", text: "目前測試房間已滿（最多 10 人），請稍後再試。" });
    ws.close(); return;
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex");
  const p = { id, ws, name: "冒險者", x: 180 + Math.random()*80, y: 180 + Math.random()*80, hp: 100, maxHp: 100, level: 1, exp: 0, facing: "down", attackUntil: 0, lastAttack: 0, input: { up:false, down:false, left:false, right:false } };
  players.set(id, p);
  send(ws, { type: "welcome", id, maxPlayers: MAX_PLAYERS });
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "hello") p.name = safeName(msg.name);
    if (msg.type === "input") {
      const i = msg.keys || {};
      p.input = { up:!!i.up, down:!!i.down, left:!!i.left, right:!!i.right };
    }
    if (msg.type === "attack") {
      const now = Date.now();
      if (now - p.lastAttack < ATTACK_COOLDOWN_MS) return;
      p.lastAttack = now; p.attackUntil = now + 180;
      // Server validates range and resolves damage; no client-trusted damage values.
      const target = mobs
        .filter(m => m.alive && Math.hypot(m.x - p.x, m.y - p.y) <= ATTACK_RANGE)
        .sort((a,b) => Math.hypot(a.x-p.x,a.y-p.y) - Math.hypot(b.x-p.x,b.y-p.y))[0];
      if (target) {
        target.hp = Math.max(0, target.hp - 10);
        if (target.hp === 0) {
          target.alive = false; target.respawnAt = Date.now() + 8000;
          p.exp += 10;
          if (p.exp >= p.level * 30) { p.exp -= p.level * 30; p.level++; p.maxHp += 10; p.hp = p.maxHp; }
          send(ws, { type: "notice", text: `擊敗史萊姆！獲得 10 經驗值。` });
        } else send(ws, { type: "notice", text: `命中史萊姆！剩餘 HP：${target.hp}` });
      } else {
        send(ws, { type: "notice", text: "附近沒有可攻擊的史萊姆，請靠近一點。" });
      }
    }
  });
  ws.on("close", () => players.delete(id));
  ws.on("error", () => players.delete(id));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  for (const p of players.values()) {
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    if (dx || dy) {
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      p.x = Math.max(32, Math.min(world.width-32, p.x + dx*PLAYER_SPEED*dt));
      p.y = Math.max(32, Math.min(world.height-32, p.y + dy*PLAYER_SPEED*dt));
      p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    }
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt*1.2);
  }
  for (const m of mobs) {
    if (!m.alive && now >= m.respawnAt) { m.alive = true; m.hp = m.maxHp; }
  }
  const data = JSON.stringify(snapshot());
  for (const p of players.values()) if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
}, TICK_MS);

server.listen(PORT, () => console.log(`像素冒險 Online 已啟動：http://localhost:${PORT}`));
