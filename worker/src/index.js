// 百鬼夜行 · game server.
// One Durable Object ("main") holds the whole game. Every action is applied here, in order, using shared/rules.js,
// then the new state is pushed to every connected screen over WebSocket.
import { DurableObject } from 'cloudflare:workers';
import * as R from '../../shared/rules.js';

const ROLE_NAME = { player: '玩家', dealer: 'Dealer', judge: '判官', mengpo: '孟婆', ctrl: '总控', screen: '大屏' };
const STAFF_ROLES = ['dealer', 'judge', 'mengpo', 'ctrl', 'screen'];
const SNAP_EVERY = 10, SNAP_KEEP = 30, LOG_KEEP = 1500;

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const randHex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
function newPin(taken) {
  for (;;) { const a = new Uint32Array(1); crypto.getRandomValues(a); const p = String(a[0] % 1000000).padStart(6, '0'); if (!taken.has(p)) return p; }
}

export class Game extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.fails = new Map(); this.acts = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.S = await ctx.storage.get('state');
      this.clock = (await ctx.storage.get('clock')) || { running: false, base: 0, at: Date.now() };
      this.auth = (await ctx.storage.get('auth')) || { pins: {}, sessions: {} };
      if (!this.S) { this.S = R.newGame(false); await this.persist(true); }
    });
  }

  // ---------- time & storage ----------
  now() { const c = this.clock; return c.running ? c.base + Math.floor((Date.now() - c.at) / 1000) : c.base; }
  async persist(withAuth) {
    if (this.S.log.length > LOG_KEEP) this.S.log.length = LOG_KEEP;
    await this.ctx.storage.put(withAuth ? { state: this.S, clock: this.clock, auth: this.auth } : { state: this.S, clock: this.clock });
  }
  async snapshot(tag) {
    await this.ctx.storage.put('snap:' + String(Date.now()).padStart(15, '0'), { S: this.S, clock: this.clock, tag, t: this.now() });
    const keys = [...(await this.ctx.storage.list({ prefix: 'snap:', keysOnly: true })).keys()];
    if (keys.length > SNAP_KEEP) await this.ctx.storage.delete(keys.slice(0, keys.length - SNAP_KEEP));
  }

  // ---------- identity ----------
  identity(pin) {
    if (this.env.ADMIN_PIN && pin === String(this.env.ADMIN_PIN)) return { role: 'ctrl', label: '总控（管理员）' };
    return this.auth.pins[pin] || null;
  }
  sessionOf(token) {
    const s = token && this.auth.sessions[token];
    if (!s) return null;
    const id = this.identity(s.pin);
    return id ? { ...id, pin: s.pin } : null;   // PIN reset or deleted -> session no longer valid
  }
  me(s) { return { role: s.role, pid: s.pid || null, label: s.label || ROLE_NAME[s.role] }; }

  // ---------- HTTP ----------
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/login' && req.method === 'POST') return this.login(req);
    if (url.pathname === '/api/ws') return this.connect(req, url);
    if (url.pathname === '/api/health') return json({ ok: true, t: this.now(), online: this.ctx.getWebSockets().length });
    return json({ error: 'not found' }, 404);
  }

  async login(req) {
    const ip = req.headers.get('cf-connecting-ip') || 'local', f = this.fails.get(ip);
    if (f && f.n >= 10 && Date.now() < f.until) return json({ error: '尝试次数太多，请 5 分钟后再试' }, 429);
    let pin = '';
    try { pin = String((await req.json()).pin || '').trim(); } catch { /* bad body */ }
    const id = /^\d{6}$/.test(pin) ? this.identity(pin) : null;
    if (!id) {
      const n = f && Date.now() < f.until ? f.n + 1 : 1;
      this.fails.set(ip, { n, until: Date.now() + 5 * 60 * 1000 });
      return json({ error: 'PIN 不正确' }, 401);
    }
    this.fails.delete(ip);
    const token = randHex(16);
    this.auth.sessions[token] = { pin, at: Date.now() };
    await this.ctx.storage.put('auth', this.auth);
    return json({ token, me: this.me(id) });
  }

  connect(req, url) {
    if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
    const token = url.searchParams.get('token') || '', s = this.sessionOf(token);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    if (!s) { server.close(4001, 'login expired'); return new Response(null, { status: 101, webSocket: client }); }
    server.serializeAttachment({ token });
    server.send(JSON.stringify({ t: 'hello', me: this.me(s), S: R.viewFor(this.S, s), clock: this.clock, now: Date.now() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- WebSocket ----------
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const s = this.sessionOf(ws.deserializeAttachment()?.token);
    if (!s) { ws.close(4001, 'login expired'); return; }
    if (m.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', now: Date.now() })); return; }
    if (m.t !== 'act') return;
    let r;
    try { r = await this.handle(s, m.a || {}); } catch (e) { r = R.no('服务器出错：' + (e && e.message)); }
    ws.send(JSON.stringify({ t: 'res', id: m.id, ok: !!r.ok, msg: r.msg, data: r.data }));
    if (r.ok && r.changed !== false) { await this.persist(r.auth); this.broadcast(); }
    else if (r.ok && r.auth) await this.ctx.storage.put('auth', this.auth);
  }
  async webSocketClose(ws, code, reason) { try { ws.close(code, reason); } catch { /* already closed */ } }
  async webSocketError(ws) { try { ws.close(1011, 'error'); } catch { /* already closed */ } }

  broadcast() {
    const base = { t: 'state', clock: this.clock, now: Date.now() };
    const staff = JSON.stringify({ ...base, S: this.S });
    for (const ws of this.ctx.getWebSockets()) {
      const s = this.sessionOf(ws.deserializeAttachment()?.token);
      if (!s) { try { ws.close(4001, 'login expired'); } catch { /* ignore */ } continue; }
      try { ws.send(s.role === 'player' ? JSON.stringify({ ...base, S: R.viewFor(this.S, s) }) : staff); } catch { /* socket gone */ }
    }
  }

  async handle(s, a) {
    if (typeof a.type === 'string' && a.type.startsWith('admin.')) {
      if (s.role !== 'ctrl') return R.no('只有总控能做这个操作');
      return this.admin(a);
    }
    this.S.t = this.now();
    const r = R.apply(this.S, s, a);
    if (r.ok && ++this.acts % SNAP_EVERY === 0) await this.snapshot('auto');
    return r;
  }

  // ---------- 总控 tools ----------
  pinList() {
    return Object.entries(this.auth.pins).map(([pin, v]) => ({ pin, role: v.role, roleName: ROLE_NAME[v.role], pid: v.pid || '', label: v.label || '' }))
      .sort((a, b) => (a.role === 'player') - (b.role === 'player') || (a.pid || a.label).localeCompare(b.pid || b.label, 'zh'));
  }
  async admin(a) {
    const ok = (msg, extra) => ({ ok: true, msg, ...extra });
    switch (a.type) {
      case 'admin.clock': {
        const c = this.clock;
        if (a.op === 'start' && !c.running) { c.running = true; c.at = Date.now(); this.S.t = c.base; R.use(this.S); R.log('计时开始'); }
        else if (a.op === 'pause' && c.running) { c.base = this.now(); c.running = false; c.at = Date.now(); this.S.t = c.base; R.use(this.S); R.log('计时暂停'); }
        else if (a.op === 'set') { c.base = Math.max(0, Math.round(+a.sec) || 0); c.at = Date.now(); }
        else return R.no('计时状态没有变化');
        return ok(c.running ? '计时进行中' : '计时已暂停');
      }
      case 'admin.reset': {
        await this.snapshot('重置前');
        this.S = R.newGame(!!a.demo);
        this.clock = { running: false, base: a.demo ? this.S.t : 0, at: Date.now() };
        return ok(a.demo ? '已载入演示数据（计时暂停）' : '已重置为空白游戏（计时暂停）');
      }
      case 'admin.genpins': {
        const counts = a.counts || {}, pins = this.auth.pins, taken = new Set(Object.keys(pins));
        if (this.env.ADMIN_PIN) taken.add(String(this.env.ADMIN_PIN));
        let made = 0;
        const have = new Set(Object.values(pins).filter(v => v.pid).map(v => v.pid));
        for (const p of this.S.players) if (!have.has(p.id)) { pins[newPin(taken)] = { role: 'player', pid: p.id, label: p.id }; made++; }
        for (const role of STAFF_ROLES) {
          const want = Math.max(0, Math.min(30, Math.round(+counts[role]) || 0));
          let n = Object.values(pins).filter(v => v.role === role).length;
          while (n < want) { n++; const pin = newPin(taken); taken.add(pin); pins[pin] = { role, label: ROLE_NAME[role] + ' ' + n }; made++; }
        }
        return ok('新生成 ' + made + ' 个 PIN，共 ' + Object.keys(pins).length + ' 个', { changed: false, auth: true, data: this.pinList() });
      }
      case 'admin.pins': return ok('', { changed: false, data: this.pinList() });
      case 'admin.resetpin': {
        const old = String(a.pin || ''), v = this.auth.pins[old];
        if (!v) return R.no('没有这个 PIN');
        const taken = new Set(Object.keys(this.auth.pins)), pin = newPin(taken);
        delete this.auth.pins[old]; this.auth.pins[pin] = v;
        for (const [tk, s] of Object.entries(this.auth.sessions)) if (s.pin === old) delete this.auth.sessions[tk];
        this.broadcast();   // closes sockets still logged in with the old PIN
        return ok((v.pid || v.label) + ' 的新 PIN：' + pin, { changed: false, auth: true, data: this.pinList() });
      }
      case 'admin.snaps': {
        const list = await this.ctx.storage.list({ prefix: 'snap:' });
        return ok('', { changed: false, data: [...list].reverse().map(([key, v]) => ({ key, at: +key.slice(5), t: v.t, tag: v.tag })) });
      }
      case 'admin.restore': {
        const snap = await this.ctx.storage.get(String(a.key || ''));
        if (!snap || !String(a.key).startsWith('snap:')) return R.no('找不到这个备份');
        await this.snapshot('恢复前');
        this.S = snap.S; this.clock = { ...snap.clock, running: false, base: snap.t, at: Date.now() };
        return ok('已恢复到备份（计时暂停，确认无误后再开始）');
      }
    }
    return R.no('未知的管理操作');
  }
}

// Local development: one Worker serves both the web pages (assets) and the API.
// In production the pages are on Cloudflare Pages and only /api/* reaches this Worker (see web/functions).
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return env.GAME.get(env.GAME.idFromName('main')).fetch(req);
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
  },
};
