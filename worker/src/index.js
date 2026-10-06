// 百鬼夜行 · game server.
// One Durable Object ("main") holds the whole game. Every action is applied here, in order, using shared/rules.js,
// then the new state is pushed to every connected screen over WebSocket.
import { DurableObject } from 'cloudflare:workers';
import * as R from '../../shared/rules.js';

const ROLE_NAME = { player: '玩家', dealer: 'Dealer', judge: '判官', mengpo: '孟婆', wuchang: '黑白无常', ctrl: '总控', screen: '大屏', dev: '开发者' };
const STAFF_ROLES = ['dealer', 'judge', 'mengpo', 'wuchang', 'ctrl', 'screen'];
const FIXED = { dealer: 8, wuchang: 1 };   // 8 个房间一人一间；黑白无常只有 1 个人
const SNAP_EVERY = 10, SNAP_KEEP = 30, LOG_KEEP = 1500;
const STATS_KEEP = 360, STATS_EVERY = 60000;   // 统计：在线曲线每分钟一个点，只留最近 6 小时
const SBOX_SNAP_KEEP = 8, SBOX_LOG_KEEP = 300, DEMO_MAX = 30;   // a shared demo game stays small: few backups, short log, capped number of 展示 PINs

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const randHex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
function newPin(taken) {
  for (;;) { const a = new Uint32Array(1); crypto.getRandomValues(a); const p = String(a[0] % 1000000).padStart(6, '0'); if (!taken.has(p)) return p; }
}

// 只取设备大类，不存完整 User-Agent
function device(ua) {
  ua = String(ua || '');
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? '安卓手机' : '安卓平板';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Macintosh/.test(ua)) return '苹果电脑';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return '其他';
}

export class Game extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.acts = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.S = await ctx.storage.get('state');
      this.clock = (await ctx.storage.get('clock')) || { running: false, base: 0, at: Date.now() };
      this.auth = (await ctx.storage.get('auth')) || { pins: {}, sessions: {} };
      this.st = (await ctx.storage.get('stats')) || { rows: {}, fails: 0, lastFail: 0 };   // 统计：每个 PIN 的登录/连接/断线/设备（独立于游戏数据）
      this.ser = (await ctx.storage.get('statsS')) || [];                                  // 统计：在线人数曲线
      if (this.S && R.needsReset(this.S)) { await ctx.storage.put('snap:' + String(Date.now()).padStart(15, '0'), { S: this.S, clock: this.clock, tag: '规则升级前', t: this.S.t || 0 }); this.S = null; this.clock = { running: false, base: 0, at: Date.now() }; await ctx.storage.put('clock', this.clock); }
      if (!this.S) { this.S = R.newGame(false); await this.persist(true); }
      // 展示模式: any number of 展示 PINs {pin: {mode, write}}. 共享 mode = one demo game per PIN (this.Ds), never touching the real game.
      this.Ds = {};
      for (const [k, d] of await ctx.storage.list({ prefix: 'sandbox:' })) { if (d && d.S && !R.needsReset(d.S)) { d.pins = d.pins || {}; d.snaps = d.snaps || []; this.Ds[k.slice(8)] = d; } }   // 演示局的 PIN 要能登录，所以启动时全部读进内存
      if (!this.auth.demos) { this.auth.demos = {}; if (this.auth.demo && this.auth.demo.pin) this.auth.demos[this.auth.demo.pin] = { mode: this.auth.demo.mode, write: this.auth.demo.write }; delete this.auth.demo; await ctx.storage.put('auth', this.auth); }
    });
  }

  // ---------- time & storage ----------
  now() { const c = this.clock; return c.running ? c.base + Math.floor((Date.now() - c.at) / 1000) : c.base; }
  async persist(withAuth) {
    if (this.S.log.length > LOG_KEEP) this.S.log.length = LOG_KEEP;
    await this.ctx.storage.put(withAuth ? { state: this.S, clock: this.clock, auth: this.auth } : { state: this.S, clock: this.clock });
  }
  async getD(pin) {
    if (!this.Ds[pin]) {
      let d = await this.ctx.storage.get('sandbox:' + pin);
      if (!d || R.needsReset(d.S)) { const g = R.newGame(true); d = { S: g, clock: { running: false, base: g.t, at: Date.now() } }; }
      d.pins = d.pins || {}; d.snaps = d.snaps || [];
      await this.ctx.storage.put('sandbox:' + pin, d);
      this.Ds[pin] = d;
    }
    return this.Ds[pin];
  }
  async sandbox(pin, fn) {   // run fn against that 展示 PIN's shared demo game instead of the real one
    const D = await this.getD(pin), keep = { S: this.S, clock: this.clock, auth: this.auth };
    this.realAuth = keep.auth; this.S = D.S; this.clock = D.clock; this.auth = { ...this.auth, pins: D.pins }; this.inSandbox = D;   // this game's own PIN list + backups
    if (!Object.keys(D.pins).length) { this.genPins({ judge: 1, mengpo: 1, ctrl: 1, screen: 1 }); await this.ctx.storage.put('sandbox:' + pin, D); }   // 演示局第一次用：自动生成整套演示 PIN（可登录，进入这一局）
    try { return await fn(); } finally { D.S = this.S; D.clock = this.clock; if (D.S.log.length > SBOX_LOG_KEEP) D.S.log.length = SBOX_LOG_KEEP; this.S = keep.S; this.clock = keep.clock; this.auth = keep.auth; this.inSandbox = null; this.realAuth = null; }
  }
  takenPins() {   // 所有已被占用的 PIN：真实 PIN、展示 PIN、每个演示局的 PIN、管理员/开发者（演示局 PIN 也能登录，所以全局不能重复）
    const t = new Set(Object.keys((this.realAuth || this.auth).pins));
    for (const k of Object.keys(this.auth.pins)) t.add(k);
    for (const k of Object.keys(this.auth.demos || {})) t.add(k);
    for (const D of Object.values(this.Ds)) for (const k of Object.keys(D.pins || {})) t.add(k);
    if (this.env.ADMIN_PIN) t.add(String(this.env.ADMIN_PIN));
    if (this.env.DEV_PIN) t.add(String(this.env.DEV_PIN));
    return t;
  }
  genPins(counts) {
    const pins = this.auth.pins, taken = this.takenPins();
        let made = 0;
        const have = new Set(Object.values(pins).filter(v => v.pid).map(v => v.pid));
        for (const p of this.S.players) if (!have.has(p.id)) { pins[newPin(taken)] = { role: 'player', pid: p.id, label: p.id }; made++; }
        for (const role of STAFF_ROLES) {
          const want = FIXED[role] != null ? FIXED[role] : Math.max(0, Math.min(30, Math.round(+counts[role]) || 0));
          let n = Object.values(pins).filter(v => v.role === role).length;
          while (n < want) { n++; const pin = newPin(taken); taken.add(pin); pins[pin] = { role, label: ROLE_NAME[role] + ' ' + n }; if (role === 'dealer') pins[pin].rooms = []; made++; }
        }
        // One Dealer per room, fixed: the i-th Dealer PIN runs the i-th room. No manual choice.
        const dealers = Object.values(pins).filter(v => v.role === 'dealer');
        dealers.forEach((v, i) => { v.rooms = i < R.ROOMS.length ? [R.ROOMS[i].id] : []; v.label = this.dealerLabel(v.rooms); });
    return made;
  }
  async snapshot(tag) {
    if (this.inSandbox) { const D = this.inSandbox; D.snaps.unshift({ at: Date.now(), t: this.now(), tag, S: JSON.parse(JSON.stringify(this.S)), clock: { ...this.clock } }); D.snaps.length = Math.min(D.snaps.length, SBOX_SNAP_KEEP); return; }
    await this.ctx.storage.put('snap:' + String(Date.now()).padStart(15, '0'), { S: this.S, clock: this.clock, tag, t: this.now() });
    const keys = [...(await this.ctx.storage.list({ prefix: 'snap:', keysOnly: true })).keys()];
    if (keys.length > SNAP_KEEP) await this.ctx.storage.delete(keys.slice(0, keys.length - SNAP_KEEP));
  }

  // ---------- 统计（只有真开发者 PIN 能看，不进游戏数据，重置/恢复不受影响）----------
  keyOf(id) { return id.demo ? '展示' : (id.label || ROLE_NAME[id.role] || '?'); }
  async bump(k, role, kind, ua) {
    try {
      const now = Date.now(), r = this.st.rows[k] || (this.st.rows[k] = { role, logins: 0, conns: 0, drops: 0, first: now, last: 0, devs: {} });
      r.role = role; r.last = now;
      if (kind === 'login') r.logins++; else if (kind === 'conn') r.conns++; else if (kind === 'drop') r.drops++;
      if (ua != null) r.devs[device(ua)] = 1;
      await this.ctx.storage.put('stats', this.st);
    } catch { /* 统计失败不能影响游戏 */ }
  }
  async failLogin() {
    try { this.st.fails = (this.st.fails || 0) + 1; this.st.lastFail = Date.now(); await this.ctx.storage.put('stats', this.st); } catch { /* ignore */ }
  }
  async schedule() { if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + STATS_EVERY); }
  async alarm() {   // 每分钟记一个在线点；没人在线就不记、不再排下一次（下次有人连上时 connect 会重新排）
    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return;
    const roles = {}, teams = {}; let n = 0;
    for (const ws of sockets) {
      const s = this.sessionOf(ws.deserializeAttachment()?.token); if (!s) continue;
      n++; roles[s.role] = (roles[s.role] || 0) + 1;
      if (s.role === 'player' && s.pid) { const t = String(s.pid).split('-')[0]; teams[t] = (teams[t] || 0) + 1; }
    }
    this.ser.push({ at: Date.now(), n, r: roles, k: teams });
    if (this.ser.length > STATS_KEEP) this.ser.splice(0, this.ser.length - STATS_KEEP);
    await this.ctx.storage.put('statsS', this.ser);
    await this.ctx.storage.setAlarm(Date.now() + STATS_EVERY);
  }
  statsData() {
    const online = {}; let total = 0;
    for (const ws of this.ctx.getWebSockets()) { const at = ws.deserializeAttachment(); if (at && at.k) { online[at.k] = (online[at.k] || 0) + 1; total++; } }
    const rows = Object.entries(this.st.rows).map(([k, r]) => ({ k, role: r.role, roleName: ROLE_NAME[r.role] || r.role, logins: r.logins, conns: r.conns, drops: r.drops, first: r.first, last: r.last, devs: Object.keys(r.devs), online: online[k] || 0 }));
    return { now: Date.now(), online: total, fails: this.st.fails || 0, lastFail: this.st.lastFail || 0, rows, series: this.ser };
  }

  // ---------- identity ----------
  identity(pin) {
    if (this.env.ADMIN_PIN && pin === String(this.env.ADMIN_PIN)) return { role: 'ctrl', label: '总控（管理员）' };
    // Developer mode: read-only, sees every page. Only on when the Worker secret DEV_PIN is set.
    if (this.env.DEV_PIN && pin === String(this.env.DEV_PIN)) return { role: 'dev', label: '开发者' };
    // 展示模式 PIN: set by the developer from the page. Same viewpoints as developer mode; 本地 = the browser runs its own demo game, 服务器 = the real game.
    const d = (this.auth.demos || {})[pin];
    if (d) return { role: 'dev', demo: true, dmode: ['local', 'shared'].includes(d.mode) ? d.mode : 'server', dwrite: !!d.write, label: '展示' };
    const real = (this.realAuth || this.auth).pins[pin];
    if (real) return real;
    for (const [box, D] of Object.entries(this.Ds)) {   // 共享演示局里生成的 PIN：登录后进入那一局，按各自角色/玩家身份
      const v = D.pins && D.pins[pin], dm = (this.auth.demos || {})[box];
      if (v && dm && dm.mode === 'shared') return { ...v, sb: box, label: '演示 ' + (v.label || v.pid || '') };
    }
    return null;
  }
  sbKey(s) { return s.sb || (s.demo && s.dmode === 'shared' ? s.pin : null); }
  sessionOf(token) {
    const s = token && this.auth.sessions[token];
    if (!s) return null;
    const id = this.identity(s.pin);
    return id ? { ...id, pin: s.pin } : null;   // PIN reset or deleted -> session no longer valid
  }
  demoList() { return Object.entries(this.auth.demos || {}).map(([pin, v]) => ({ pin, mode: ['local', 'shared'].includes(v.mode) ? v.mode : 'server', write: !!v.write })); }
  me(s) {
    const m = { role: s.role, pid: s.pid || null, label: s.label || ROLE_NAME[s.role], rooms: s.role === 'dealer' && Array.isArray(s.rooms) ? s.rooms : null };
    if (s.demo) { m.demo = true; m.dmode = s.dmode; m.dwrite = s.dwrite; }
    else if (s.role === 'dev') m.demoCfg = this.demoList();
    return m;
  }

  // ---------- HTTP ----------
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/login' && req.method === 'POST') return this.login(req);
    if (url.pathname === '/api/ws') return this.connect(req, url);
    if (url.pathname === '/api/health') return json({ ok: true, t: this.now(), online: this.ctx.getWebSockets().length });
    return json({ error: 'not found' }, 404);
  }

  async login(req) {
    let pin = '';
    try { pin = String((await req.json()).pin || '').trim(); } catch { /* bad body */ }
    const id = /^\d{6}$/.test(pin) ? this.identity(pin) : null;
    if (!id) { await this.failLogin(); return json({ error: 'PIN 不正确' }, 401); }   // no lockout: at the event everyone shares one Wi-Fi address
    const token = randHex(16);
    this.auth.sessions[token] = { pin, at: Date.now() };
    await this.ctx.storage.put('auth', this.auth);
    await this.bump(this.keyOf(id), id.role, 'login', req.headers.get('user-agent'));
    return json({ token, me: this.me(id) });
  }

  async connect(req, url) {
    if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
    const token = url.searchParams.get('token') || '', s = this.sessionOf(token);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    if (!s) { server.close(4001, 'login expired'); return new Response(null, { status: 101, webSocket: client }); }
    const k = this.keyOf(s);
    server.serializeAttachment({ token, k });
    await this.bump(k, s.role, 'conn', req.headers.get('user-agent'));
    await this.schedule();
    const box = this.sbKey(s), D = box ? await this.getD(box) : null;
    if (box && s.demo) await this.sandbox(box, async () => {});   // 展示 PIN 第一次进共享演示局：自动生成整套演示 PIN
    server.send(JSON.stringify({ t: 'hello', me: this.me(s), S: box ? (s.demo ? D.S : R.viewFor(D.S, s)) : R.viewFor(this.S, s), clock: box ? D.clock : this.clock, now: Date.now() }));
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
    const box = this.sbKey(s), shared = !!box;
    try { r = shared ? await this.sandbox(box, () => this.handle(s, m.a || {})) : await this.handle(s, m.a || {}); } catch (e) { r = R.no('服务器出错：' + (e && e.message)); }
    ws.send(JSON.stringify({ t: 'res', id: m.id, ok: !!r.ok, msg: r.msg, data: r.data }));
    if (shared) { if (r.ok && (r.changed !== false || r.auth) && this.Ds[box]) { await this.ctx.storage.put('sandbox:' + box, this.Ds[box]); this.broadcast(box); } }
    else if (r.ok && r.changed !== false) { await this.persist(r.auth); this.broadcast(); }
    else if (r.ok && r.auth) await this.ctx.storage.put('auth', this.auth);
  }
  async webSocketClose(ws, code, reason) {
    const at = ws.deserializeAttachment();   // 服务器自己踢人（4001/4002）和页面正常关闭（1000）不算断线
    if (at && at.k && code !== 1000 && code !== 4001 && code !== 4002 && this.st.rows[at.k]) await this.bump(at.k, this.st.rows[at.k].role, 'drop');
    try { ws.close(code, reason); } catch { /* already closed */ }
  }
  async webSocketError(ws) {
    const at = ws.deserializeAttachment();
    if (at && at.k && this.st.rows[at.k]) await this.bump(at.k, this.st.rows[at.k].role, 'drop');
    try { ws.close(1011, 'error'); } catch { /* already closed */ }
  }

  broadcast(which) {
    const base = { t: 'state', clock: this.clock, now: Date.now() };
    const staff = JSON.stringify({ ...base, S: this.S });
    const sbD = which && this.Ds[which] ? this.Ds[which] : null, sbox = sbD ? JSON.stringify({ t: 'state', clock: sbD.clock, now: Date.now(), S: sbD.S }) : '';
    for (const ws of this.ctx.getWebSockets()) {
      const s = this.sessionOf(ws.deserializeAttachment()?.token);
      if (!s) { try { ws.close(4001, 'login expired'); } catch { /* ignore */ } continue; }
      const box = this.sbKey(s);
      if (box ? box !== which : !!which) continue;   // real-game changes go to real sockets; a shared-demo change goes only to sockets on that 展示 PIN's game
      if (box) { try { ws.send(s.demo || s.role !== 'player' ? sbox : JSON.stringify({ t: 'state', clock: sbD.clock, now: Date.now(), S: R.viewFor(sbD.S, s) })); } catch { /* socket gone */ } continue; }
      try { ws.send(s.role === 'player' ? JSON.stringify({ ...base, S: R.viewFor(this.S, s) }) : staff); } catch { /* socket gone */ }
    }
  }

  async handle(s, a) {
    if (a.type === 'dev.stats' || a.type === 'dev.clearstats') {   // 统计：只有真开发者 PIN（不含展示 PIN），只读也能看
      if (s.role !== 'dev' || s.demo) return R.no('只有开发者能看统计');
      if (a.type === 'dev.clearstats') { this.st = { rows: {}, fails: 0, lastFail: 0 }; this.ser = []; await this.ctx.storage.delete(['stats', 'statsS']); return { ok: true, msg: '统计已清空', changed: false, data: this.statsData() }; }
      return { ok: true, msg: '', changed: false, data: this.statsData() };
    }
    if (a.type === 'dev.setdemo' || a.type === 'dev.deldemo') {   // only the real developer PIN may change the 展示模式 PINs
      if (s.role !== 'dev' || s.demo) return R.no('只有开发者能改展示模式');
      const kick = pin => { for (const ws of this.ctx.getWebSockets()) { const t = this.sessionOf(ws.deserializeAttachment()?.token); if (t && ((t.demo && t.pin === pin) || t.sb === pin)) { try { ws.close(4001, 'demo changed'); } catch { /* ignore */ } } } };
      const done = msg => ({ ok: true, msg, changed: false, auth: true, data: this.demoList() });
      if (a.type === 'dev.deldemo') {
        const pin = String(a.pin || ''); if (!this.auth.demos[pin]) return R.no('没有这个展示 PIN');
        kick(pin); delete this.auth.demos[pin]; delete this.Ds[pin]; await this.ctx.storage.delete('sandbox:' + pin);
        return done('已删除展示 PIN ' + pin);
      }
      const pin = String(a.pin || '').trim(), old = String(a.old || '');
      if (!old && Object.keys(this.auth.demos).length >= DEMO_MAX) return R.no('展示 PIN 最多 ' + DEMO_MAX + ' 个，先删掉不用的');
      if (!/^\d{6}$/.test(pin)) return R.no('展示 PIN 要是 6 位数字');
      if (pin !== old && this.takenPins().has(pin)) return R.no('这个 PIN 已被别的身份用了，换一个');
      if (old && old !== pin && this.auth.demos[old]) { kick(old); delete this.auth.demos[old]; delete this.Ds[old]; await this.ctx.storage.delete('sandbox:' + old); }
      this.auth.demos[pin] = { mode: ['local', 'shared'].includes(a.mode) ? a.mode : 'server', write: !!a.write };
      kick(pin);
      return done('展示模式已保存');
    }
    if (s.demo && (!s.dwrite || s.dmode === 'local')) return R.no(s.dmode === 'local' ? '本地展示模式不连服务器' : '展示模式现在是只读');
    const isDemo = !!s.demo, isShared = !!this.sbKey(s);
    if (s.role === 'dev') { // acts as the viewpoint chosen on the page, only when its 可操作 switch is on
      const as = a.as || {}, roles = ['ctrl', 'dealer', 'judge', 'mengpo', 'screen', 'player'];
      if (!roles.includes(as.role)) return R.no('开发者模式：先打开右上角「可操作」');
      if (as.role === 'player' && !this.S.players.some(p => p.id === as.pid)) return R.no('没有这个玩家');
      s = { role: as.role, pid: as.role === 'player' ? as.pid : null, label: '开发者' };
      delete a.as;
    }
    if (typeof a.type === 'string' && a.type.startsWith('admin.')) {
      if (isDemo && !isShared) return R.no('展示模式不能用总控工具');
      if (s.role !== 'ctrl') return R.no('只有总控能做这个操作');
      return this.admin(a);
    }
    this.S.t = this.now();
    const r = R.apply(this.S, s, a);
    if (r.ok && ++this.acts % SNAP_EVERY === 0) await this.snapshot('auto');
    return r;
  }

  // ---------- 总控 tools ----------
  dealerLabel(rooms) { return 'Dealer ' + (rooms.length ? rooms.map(id => R.ROOMS.find(r => r.id === id).card).join(' ') : '未绑定'); }
  pinList() {
    return Object.entries(this.auth.pins).map(([pin, v]) => ({ pin, role: v.role, roleName: ROLE_NAME[v.role], pid: v.pid || '', label: v.label || '', rooms: v.rooms || null }))
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
        else if (a.op === 'reset') { c.base = 0; c.running = false; c.at = Date.now(); this.S.t = 0; R.use(this.S); R.log('计时重置为 0:00'); }
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
        const made = this.genPins(a.counts || {}), pins = this.auth.pins;
        return ok('新生成 ' + made + ' 个 PIN，共 ' + Object.keys(pins).length + ' 个', { changed: false, auth: true, data: this.pinList() });
      }
      case 'admin.pins': return ok('', { changed: false, data: this.pinList() });
      case 'admin.resetpin': {
        const old = String(a.pin || ''), v = this.auth.pins[old];
        if (!v) return R.no('没有这个 PIN');
        const taken = this.takenPins(), pin = newPin(taken);
        delete this.auth.pins[old]; this.auth.pins[pin] = v;
        for (const [tk, s] of Object.entries(this.auth.sessions)) if (s.pin === old) delete this.auth.sessions[tk];
        this.broadcast();   // closes sockets still logged in with the old PIN
        return ok((v.pid || v.label) + ' 的新 PIN：' + pin, { changed: false, auth: true, data: this.pinList() });
      }
      case 'admin.snaps': {
        if (this.inSandbox) return ok('', { changed: false, data: this.inSandbox.snaps.map(x => ({ key: 's' + x.at, at: x.at, t: x.t, tag: x.tag })) });
        const list = await this.ctx.storage.list({ prefix: 'snap:' });
        return ok('', { changed: false, data: [...list].reverse().map(([key, v]) => ({ key, at: +key.slice(5), t: v.t, tag: v.tag })) });
      }
      case 'admin.restore': {
        if (this.inSandbox) {
          const D = this.inSandbox, x = D.snaps.find(y => 's' + y.at === String(a.key)); if (!x) return R.no('找不到这个备份');
          await this.snapshot('恢复前'); this.S = JSON.parse(JSON.stringify(x.S)); this.clock = { ...x.clock, running: false, base: x.t, at: Date.now() };
          return ok('已恢复到备份（计时暂停，确认无误后再开始）');
        }
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
