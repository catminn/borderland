// Multi-device sync test against a running local server (npm run dev). Usage: node tests/sync.test.mjs [baseUrl]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8787', ADMIN = process.env.ADMIN_PIN || '888888';
const res = []; const T = (n, c) => { res.push((c ? 'PASS ' : 'FAIL ') + n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A raw WebSocket client (for admin setup and race tests).
async function client(pin) {
  const j = await (await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin }) })).json();
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/api/ws?token=' + j.token);
  let seq = 0, S = null; const wait = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.S) S = m.S; if (m.t === 'res') { wait.get(m.id)?.(m); wait.delete(m.id); } };
  await new Promise(r => ws.onopen = r); await sleep(200);
  return { me: j.me, get S() { return S; }, act: a => new Promise(r => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ t: 'act', id, a })); }), close: () => ws.close() };
}

const admin = await client(ADMIN);
T('admin login', admin.me.role === 'ctrl');
T('load demo', (await admin.act({ type: 'admin.reset', demo: true })).ok);
const gen = await admin.act({ type: 'admin.genpins', counts: { dealer: 2, judge: 2, mengpo: 1, ctrl: 1, screen: 1 } });
const pins = gen.data, pinOf = f => pins.find(f).pin;
T('pins generated (48 players + 8 dealers + 6 other staff incl. 1 wuchang)', pins.length === 48 + 8 + 2 + 1 + 1 + 1 + 1);
T('dealers fixed one room each', pins.filter(p => p.role === 'dealer').every(p => p.rooms.length === 1) && new Set(pins.filter(p => p.role === 'dealer').map(p => p.rooms[0])).size === 8);
T('pins unique', new Set(pins.map(p => p.pin)).size === pins.length);
const P = { player: pinOf(p => p.pid === 'B-02'), judge: pinOf(p => p.role === 'judge'), judge2: pins.filter(p => p.role === 'judge')[1].pin,
  dealer: pinOf(p => p.role === 'dealer' && p.rooms && p.rooms.includes('7H')), screen: pinOf(p => p.role === 'screen'), mengpo: pinOf(p => p.role === 'mengpo'), wuchang: pinOf(p => p.role === 'wuchang') };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
async function page(pin, w = 1100) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/?pin=' + pin); await p.waitForSelector('#conn.free', { timeout: 8000 }); return p;
}
const ack = async p => { for (let i = 0; i < 15 && await p.locator('[data-modal]').count(); i++) await p.locator('[data-modal]').first().click(); };
const text = p => p.locator('#view').innerText();

const ctrl = await page(ADMIN), judge = await page(P.judge), dealer = await page(P.dealer), screen = await page(P.screen), mengpo = await page(P.mengpo);
const player = await page(P.player, 390);
T('roles see only their tabs', (await judge.locator('#tabs').isHidden()) && (await text(judge)).includes('任务判定') && (await text(mengpo)).includes('孟婆买命'));
T('player first page is the big screen', (await text(player)).includes('全场播报'));
await ack(player);
await player.click('[data-a=tab][data-v=player]');
{ const tx = await text(player); T('player sees own page (2nd tab)', tx.includes('B-02') && tx.includes('蓝队')); }
await ack(player);

// ctrl publishes -> player gets a popup
await ctrl.click('[data-a=tab][data-v=ctrl]'); await ctrl.click('[data-a=sub][data-p=ctrl][data-v=pub]');
await ctrl.fill('#prw', '200'); await ctrl.dispatchEvent('#prw', 'change');
await ctrl.fill('#pti', '同步测试任务'); await ctrl.fill('#pb', '内容'); await ctrl.click('[data-a=publish]');
await player.waitForSelector('#modal .dlg', { timeout: 4000 }).catch(() => {});
T('player popup after publish', (await player.locator('#modal').innerText()).includes('同步测试任务'));
await ack(player);

// judge records -> ctrl log + score + broadcast
const nid = admin.S.notices.find(n => n.title === '同步测试任务').id;
const scoreB = admin.S.teams.find(t => t.id === 'B').score;
await judge.click('[data-a=pick][data-k="doneSel.' + nid + '"][data-v=B]'); await judge.click('[data-a=done][data-n="' + nid + '"]');
await sleep(500);
T('reward applied on server', admin.S.teams.find(t => t.id === 'B').score === scoreB + 200);
await ctrl.click('[data-a=sub][data-p=ctrl][data-v=log]');
T('ctrl log updated live', (await text(ctrl)).includes('判官记录 蓝队 率先完成任务「同步测试任务」'));
await player.waitForSelector('#modal .dlg', { timeout: 4000 }).catch(() => {});
T('player gets broadcast', (await player.locator('#modal').innerText()).includes('蓝队率先完成任务'));
await ack(player);

// race: two judges confirm the same first-come task at the same moment
const pub2 = await admin.act({ type: 'publish', f: { kind: '鬼门开', title: '抢答', body: '', reward: 0, mins: 0 } });
await sleep(300);
const n2 = admin.S.notices.find(n => n.title === '抢答').id;
const j1 = await client(P.judge), j2 = await client(P.judge2);
const [r1, r2] = await Promise.all([j1.act({ type: 'done', nid: n2, cid: 'R' }), j2.act({ type: 'done', nid: n2, cid: 'G' })]);
T('race: exactly one winner', pub2.ok && (r1.ok !== r2.ok));

// permissions
const pc = await client(P.player);
T('player cannot hook', !(await pc.act({ type: 'hook', actor: 'B', pid: 'R-01' })).ok);
T('player cannot use admin', !(await pc.act({ type: 'admin.reset', demo: false })).ok);
T('player view: only broadcast log lines, no shop', pc.S.shop.length === 0 && pc.S.log.length > 0 && pc.S.log.every(l => /勾魂|抽签淘汰|孟婆汤|赢下|率先完成/.test(l.text)));

// dealer -> screen
if (await dealer.$('[data-a=room]')) await dealer.click('[data-a=room][data-v="7H"]'); await dealer.click('[data-a=pick][data-k=pick][data-v=C]'); await dealer.click('[data-a=enter]');
await sleep(500);
T('screen shows room live', (await screen.locator('.rgrid').innerText()).includes('青队'));

// clock
await ctrl.click('#clockctl'); await sleep(2200);
const t1 = admin.S && (await ctrl.locator('#clk').innerText()), t2 = await screen.locator('#clk').innerText();
T('clock running and same on screens', t1 === t2 && t1 !== 'T+29:00'); if (t1 !== t2 || t1 === 'T+29:00') console.log('clock', t1, t2);
await ctrl.click('#clockctl');

// typing is not wiped by live updates
await ctrl.click('[data-a=tab][data-v=ctrl]'); await ctrl.click('[data-a=sub][data-p=ctrl][data-v=pub]'); await ctrl.click('#pti'); await ctrl.keyboard.type('正在输入');
await admin.act({ type: 'setscore', tid: 'R', v: 4321 }); await sleep(600);
T('typing survives broadcast', (await ctrl.inputValue('#pti')) === '正在输入');

// wrong PIN + PIN reset kicks the old session
const bad = await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin: '000001' }) });
T('wrong PIN rejected', bad.status === 401);
const old = P.player; const rp = await admin.act({ type: 'admin.resetpin', pin: old });
await player.waitForSelector('#loginf', { timeout: 5000 }).catch(() => {});
T('PIN reset logs player out', rp.ok && await player.locator('#loginf').count() === 1);


// ---- new rules (2026-10-04), through the real server ----
await admin.act({ type: 'admin.reset', demo: false });
const dealerOf = room => client(pinOf(p => p.role === 'dealer' && p.rooms[0] === room));
const wc = await client(P.wuchang), mp = await client(P.mengpo), jd = await client(P.judge);
const as1 = await admin.act({ type: 'assign' }); await sleep(200);
T('opening assign puts each of 8 teams in its own room', as1.ok && admin.S.rooms.every(r => r.teams.length === 1) && new Set(admin.S.rooms.map(r => r.teams[0])).size === 8);
T('assign only once', !(await admin.act({ type: 'assign' })).ok);
{ const tid = admin.S.rooms.find(r => r.id === '3S').teams[0], d3 = await dealerOf('3S');
  T('dealer cannot run other rooms', !(await d3.act({ type: 'finish', rid: '5S', results: {} })).ok);
  T('lose needs a picked person', !(await d3.act({ type: 'finish', rid: '3S', results: { [tid]: 'lose' } })).ok);
  T('pick must be on that team', !(await d3.act({ type: 'finish', rid: '3S', results: { [tid]: 'lose' }, picks: { [tid]: 'ZZ-01' } })).ok);
  const victim = tid + '-03';
  { const r = await d3.act({ type: 'finish', rid: '3S', results: { [tid]: 'lose' }, picks: { [tid]: victim } }); await sleep(250);
    T('lose + pick eliminates that person (even in a 3-card room)', r.ok && admin.S.players.find(p => p.id === victim).st === 'out'); }
  T('team not full cannot enter a room', !(await admin.act({ type: 'enter', tid, rid: '3S' })).ok);
  { const bad = await mp.act({ type: 'pickup', pid: victim }), good = await wc.act({ type: 'pickup', pid: victim }); await sleep(250);
    T('only wuchang picks up', !bad.ok && good.ok && admin.S.players.find(p => p.id === victim).st === 'picked'); }
  { const r = await wc.act({ type: 'checkin', pid: victim }); await sleep(250); const v = admin.S.players.find(p => p.id === victim);
    T('check-in alone keeps the player pending (not yet in the market)', r.ok && v.st === 'picked' && v.chk && !v.chk.ok && !v.inAt); }
  T('cannot confirm your own check-in', !(await wc.act({ type: 'confirm', pid: victim })).ok);
  { const r = await mp.act({ type: 'confirm', pid: victim }); await sleep(250); const v = admin.S.players.find(p => p.id === victim); T('the other side confirms: market clock starts and gives 300', r.ok && v.chk.ok === true && v.st === 'market' && v.coins === 300 && v.inAt != null); }
  await admin.act({ type: 'setscore', tid, v: 500 });
  const mate = await client(pinOf(p => p.pid === tid + '-01')), g = await mate.act({ type: 'donate', pid: victim, amt: 200 }); await sleep(200);
  T('teammate aid is 1:1', g.ok && admin.S.players.find(p => p.id === victim).bail === 200 && admin.S.teams.find(t => t.id === tid).score === 300);
  T('skill cards are switched off', !(await mp.act({ type: 'buy', kid: 'k1', buyer: victim })).ok);
  mate.close(); d3.close(); }
await admin.act({ type: 'admin.reset', demo: false });
{ const C = 'C', fin = a => admin.act({ type: 'final', tid: C, on: a });
  const win = async (rid, extra = {}) => { await admin.act({ type: 'enter', tid: C, rid }); for (const k of Object.keys(extra)) await admin.act({ type: 'enter', tid: k, rid }); return admin.act({ type: 'finish', rid, results: { [C]: 'win', ...extra } }); };
  await win('3S'); await win('4D'); await win('3C');
  T('final needs four suits', !(await fin(true)).ok);
  await win('5H');
  T('final needs 2000 points', !(await fin(true)).ok);
  await admin.act({ type: 'setscore', tid: C, v: 2000 });
  const sq = await admin.act({ type: 'publish', f: { kind: 'sidequest', team: 'K', quest: 'q1', reward: 100 } }); await sleep(200);
  const sqn = admin.S.notices.find(n => n.sub === 'side');
  T('sidequest goes to exactly one team, no broadcast', sq.ok && sqn.target === 'team' && sqn.ids.length === 1 && sqn.ids[0] === 'K');
  const jr = await jd.act({ type: 'done', nid: sqn.id, cid: 'K' }); await sleep(200);
  T('sidequest done pays the team and is not broadcast', jr.ok && !jr.msg.includes('广播') && !admin.S.notices.some(n => n.title.includes('率先完成')) && admin.S.teams.find(t => t.id === 'K').score === 100);
  T('one man short blocks the final', await (async () => { await admin.act({ type: 'hook', actor: 'R', pid: C + '-02', where: '走廊' }); const r = await fin(true); await admin.act({ type: 'admin.reset', demo: false }); return !r.ok; })());
  await win('3S'); await win('4D'); await win('3C'); await win('5H'); await admin.act({ type: 'setscore', tid: C, v: 2000 });
  { const r = await fin(true); await sleep(250); T('final can be opened by ctrl', r.ok && admin.S.teams.find(t => t.id === C).final === true); }
  T('a final team cannot be hooked', !(await admin.act({ type: 'hook', actor: 'R', pid: C + '-04' })).ok);
  const gate = await admin.act({ type: 'publish', f: { kind: '鬼门开', title: 'g', body: '', reward: 0, mins: 0 } });
  await sleep(200);
  T('gate publishes to all', gate.ok && admin.S.notices.find(n => n.title === 'g').target === 'all'); }
[wc, mp, jd].forEach(c => c.close());

// ---- 展示模式 PIN (set by the developer) ----
{ const DEV = process.env.DEV_PIN || '777777';
  const j = await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin: DEV }) });
  if (j.ok) {
    const dv = await client(DEV);
    T('dev sees demoCfg', dv.me.role === 'dev' && dv.me.demoCfg && dv.me.demoCfg.pin === '');
    T('demo pin must be 6 digits', !(await dv.act({ type: 'dev.setdemo', pin: '12', mode: 'server', write: false })).ok);
    T('demo pin cannot reuse another pin', !(await dv.act({ type: 'dev.setdemo', pin: ADMIN, mode: 'server', write: false })).ok);
    T('admin cannot set demo', !(await admin.act({ type: 'dev.setdemo', pin: '135790', mode: 'server', write: false })).ok);
    T('dev sets demo (server, read-only)', (await dv.act({ type: 'dev.setdemo', pin: '135790', mode: 'server', write: false })).ok);
    const dm = await client('135790');
    T('demo login me', dm.me.role === 'dev' && dm.me.demo && dm.me.dmode === 'server' && !dm.me.dwrite && !dm.me.demoCfg);
    T('demo read-only blocks actions', !(await dm.act({ type: 'setscore', tid: 'R', v: 5, as: { role: 'ctrl' } })).ok);
    T('demo cannot change demo pin', !(await dm.act({ type: 'dev.setdemo', pin: '246810', mode: 'server', write: true })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', mode: 'server', write: true }); await sleep(300);
    const dm2 = await client('135790');
    T('demo write works on server', dm2.me.dwrite && (await dm2.act({ type: 'setscore', tid: 'R', v: 123, as: { role: 'ctrl' } })).ok);
    T('demo cannot use admin tools', !(await dm2.act({ type: 'admin.reset', demo: true, as: { role: 'ctrl' } })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', mode: 'local', write: true });
    const dm3 = await client('135790');
    T('local demo mode flag, no server actions', dm3.me.dmode === 'local' && !(await dm3.act({ type: 'setscore', tid: 'R', v: 1, as: { role: 'ctrl' } })).ok);
    await dv.act({ type: 'admin.reset', demo: true });
    [dv, dm2, dm3].forEach(c => c.close());
  } else console.log('SKIP demo-mode tests: DEV_PIN not set on the server');
}

T('no page errors', errs.length === 0); if (errs.length) console.log(errs);
console.log(res.join('\n')); console.log(res.filter(x => x.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); [admin, j1, j2, pc].forEach(c => c.close()); process.exit(0);
