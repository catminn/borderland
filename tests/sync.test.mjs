// Multi-device sync test against a running local server (npm run dev). Usage: node tests/sync.test.mjs [baseUrl]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8787', ADMIN = process.env.ADMIN_PIN || '888888';
const res = []; const T = (n, c) => { res.push((c ? 'PASS ' : 'FAIL ') + n); console.log((c ? 'PASS ' : 'FAIL ') + n); };
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
  dealer: pinOf(p => p.role === 'dealer' && p.rooms && p.rooms.includes('8D')), screen: pinOf(p => p.role === 'screen'), mengpo: pinOf(p => p.role === 'mengpo'), wuchang: pinOf(p => p.role === 'wuchang') };

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
await ctrl.fill('#pti', '同步测试任务'); await ctrl.fill('#pb', '内容'); await ctrl.click('[data-a=publish]');
await player.waitForSelector('#modal .dlg', { timeout: 4000 }).catch(() => {});
T('player popup after publish', (await player.locator('#modal').innerText()).includes('同步测试任务'));
await ack(player);

// judge records -> ctrl log + score + broadcast
const nid = admin.S.notices.find(n => n.title === '同步测试任务').id;
const scoreB = admin.S.teams.find(t => t.id === 'B').score;
await judge.click('[data-a=pick][data-k="doneSel.' + nid + '"][data-v=B]'); await judge.click('[data-a=done][data-n="' + nid + '"]');
await sleep(500);
T('gate winner recorded, no points, rooms paused', admin.S.teams.find(t => t.id === 'B').score === scoreB && admin.S.gp && admin.S.gp.win === 'B');
await judge.waitForSelector('[data-a=gateend]', { timeout: 3000 }).catch(() => {});
T('judge page shows the gate reward panel', (await text(judge)).includes('鬼门开奖励'));
await judge.click('[data-a=gateend]'); await sleep(400);
T('gate ended by judge', !admin.S.gp);
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
await admin.act({ type: 'gateend' });

// permissions
const pc = await client(P.player);
T('player cannot hook', !(await pc.act({ type: 'hook', actor: 'B', pid: 'R-01' })).ok);
T('player cannot use admin', !(await pc.act({ type: 'admin.reset', demo: false })).ok);
T('player view: only broadcast log lines, no shop', pc.S.shop.length === 0 && pc.S.log.length > 0 && pc.S.log.every(l => /勾魂|抽签淘汰|孟婆汤|赢下|率先完成/.test(l.text)));

// dealer -> screen
if (await dealer.$('[data-a=room]')) await dealer.click('[data-a=room][data-v="8D"]'); await dealer.click('[data-a=pick][data-k=pick][data-v=C]'); await dealer.click('[data-a=enter]');
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


// ---- rules (2026-10-04 round 2), through the real server ----
await admin.act({ type: 'admin.reset', demo: false });
const dealerOf = room => client(pinOf(p => p.role === 'dealer' && p.rooms[0] === room));
const wc = await client(P.wuchang), mp = await client(P.mengpo), jd = await client(P.judge);
const as1 = await admin.act({ type: 'assign' }); await sleep(200);
T('opening assign puts each of 8 teams in its own room (play)', as1.ok && admin.S.rooms.every(r => r.teams.length === 1 && r.st === 'play') && new Set(admin.S.rooms.map(r => r.teams[0])).size === 8);
T('assign only once', !(await admin.act({ type: 'assign' })).ok);
{ const tid = admin.S.rooms.find(r => r.id === '4S').teams[0], d3 = await dealerOf('4S');
  T('dealer cannot run other rooms', !(await d3.act({ type: 'finish', rid: '8S', results: {} })).ok);
  T('lose needs a picked person', !(await d3.act({ type: 'finish', rid: '4S', results: { [tid]: 'lose' } })).ok);
  T('pick must be on that team', !(await d3.act({ type: 'finish', rid: '4S', results: { [tid]: 'lose' }, picks: { [tid]: 'ZZ-01' } })).ok);
  const victim = tid + '-03';
  { const r = await d3.act({ type: 'finish', rid: '4S', results: { [tid]: 'lose' }, picks: { [tid]: victim } }); await sleep(250);
    T('lose: no points, one eliminated, room goes to reset', r.ok && admin.S.players.find(p => p.id === victim).st === 'out' && admin.S.teams.find(t => t.id === tid).score === 0 && admin.S.rooms.find(r => r.id === '4S').st === 'reset'); }
  T('reset room cannot be reserved or entered', !(await admin.act({ type: 'enter', tid: 'R', rid: '4S' })).ok);
  T('only the dealer of that room sets reset done', !(await (await dealerOf('8S')).act({ type: 'resetdone', rid: '4S' })).ok && (await d3.act({ type: 'resetdone', rid: '4S' })).ok);
  T('team not full cannot enter a room', !(await admin.act({ type: 'enter', tid, rid: '4S' })).ok);
  { const bad = await mp.act({ type: 'pickup', pid: victim }), good = await wc.act({ type: 'pickup', pid: victim }); await sleep(250);
    T('only wuchang picks up', !bad.ok && good.ok && admin.S.players.find(p => p.id === victim).st === 'picked'); }
  { const r = await wc.act({ type: 'checkin', pid: victim }); await sleep(250); const v = admin.S.players.find(p => p.id === victim);
    T('check-in alone keeps the player pending (not yet in the market)', r.ok && v.st === 'picked' && v.chk && !v.chk.ok && !v.inAt); }
  T('cannot confirm your own check-in', !(await wc.act({ type: 'confirm', pid: victim })).ok);
  { const r = await mp.act({ type: 'confirm', pid: victim }); await sleep(250); const v = admin.S.players.find(p => p.id === victim); T('the other side confirms: market, starts with 200', r.ok && v.chk.ok === true && v.st === 'market' && v.coins === 200 && v.inAt != null); }
  await admin.act({ type: 'setscore', tid, v: 500 });
  const mate = await client(pinOf(p => p.pid === tid + '-01')), g = await mate.act({ type: 'donate', pid: victim, amt: 200 }); await sleep(200);
  T('teammate aid is 1:1', g.ok && admin.S.players.find(p => p.id === victim).bail === 200 && admin.S.teams.find(t => t.id === tid).score === 300);
  T('reviving needs 500 (200 + 200 is not enough)', !(await mp.act({ type: 'revive', pid: victim })).ok);
  await mp.act({ type: 'coin', pid: victim, coins: 300 });
  { const r = await mp.act({ type: 'revive', pid: victim }); await sleep(200); T('500 reached: revive at once, no waiting', r.ok && admin.S.players.find(p => p.id === victim).st === 'alive'); }
  T('skill cards are switched off', !(await mp.act({ type: 'buy', kid: 'k1', buyer: victim })).ok);
  mate.close(); d3.close(); }
// reservation by the captain
await admin.act({ type: 'admin.reset', demo: false });
{ const cap = await client(pinOf(p => p.pid === 'B-01')), mate = await client(pinOf(p => p.pid === 'B-03')), cap2 = await client(pinOf(p => p.pid === 'R-01')), d = await dealerOf('4H');
  T('non-captain cannot reserve', !(await mate.act({ type: 'reserve', rid: '4H' })).ok);
  T('captain reserves', (await cap.act({ type: 'reserve', rid: '4H' })).ok); await sleep(200);
  T('big screen data: reserved by B', admin.S.rooms.find(r => r.id === '4H').st === 'rsv' && admin.S.rooms.find(r => r.id === '4H').rt === 'B');
  T('another team cannot take a reserved room', !(await cap2.act({ type: 'reserve', rid: '4H' })).ok && !(await admin.act({ type: 'enter', tid: 'R', rid: '4H' })).ok);
  T('one reservation per team', !(await cap.act({ type: 'reserve', rid: '8H' })).ok);
  T('cancel then rebook', (await cap.act({ type: 'cancelrsv' })).ok && (await cap.act({ type: 'reserve', rid: '4H' })).ok);
  T('ctrl can reassign the captain', (await admin.act({ type: 'setcap', tid: 'B', pid: 'B-03' })).ok && !(await cap.act({ type: 'cancelrsv' })).ok && (await mate.act({ type: 'cancelrsv' })).ok);
  await mate.act({ type: 'reserve', rid: '4H' });
  T('dealer lets the reserving team in', (await d.act({ type: 'enter', tid: 'B', rid: '4H' })).ok); await sleep(200);
  T('room is play', admin.S.rooms.find(r => r.id === '4H').st === 'play');
  T('win pays n*100 once, then the room cannot be reserved again', (await d.act({ type: 'finish', rid: '4H', results: { B: 'win' } })).ok && admin.S.teams.find(t => t.id === 'B') && (await (async () => { await sleep(200); return admin.S.teams.find(t => t.id === 'B').score === 400; })()));
  await d.act({ type: 'resetdone', rid: '4H' });
  T('cleared room is closed to that team, the hard one is not', !(await admin.act({ type: 'enter', tid: 'B', rid: '4H' })).ok && (await admin.act({ type: 'enter', tid: 'B', rid: '8H' })).ok);
  [cap, mate, cap2, d].forEach(c => c.close()); }
await admin.act({ type: 'admin.reset', demo: false });
{ const C = 'C', fin = a => admin.act({ type: 'final', tid: C, on: a });
  const win = async rid => { await admin.act({ type: 'enter', tid: C, rid }); await admin.act({ type: 'finish', rid, results: { [C]: 'win' } }); return admin.act({ type: 'resetdone', rid }); };
  for (const r of ['4S', '8S', '4H']) await win(r);
  const sq = await admin.act({ type: 'publish', f: { kind: 'sidequest', team: 'K', quest: 'q1' } }); await sleep(200);
  const sqn = admin.S.notices.find(n => n.sub === 'side');
  T('sidequest goes to exactly one team, no broadcast', sq.ok && sqn.target === 'team' && sqn.ids.length === 1 && sqn.ids[0] === 'K');
  const jr = await jd.act({ type: 'done', nid: sqn.id, cid: 'K' }); await sleep(200);
  T('sidequest done pays 100 and is not broadcast', jr.ok && !jr.msg.includes('广播') && !admin.S.notices.some(n => n.title.includes('率先完成')) && admin.S.teams.find(t => t.id === 'K').score === 100);
  T('same question cannot be redeemed twice', !(await admin.act({ type: 'publish', f: { kind: 'sidequest', team: 'K', quest: 'q1' } })).ok);
  T('final can be forced by ctrl even with unmet conditions', (await fin(true)).ok);
  await fin(false);
  T('a final team cannot be hooked', (await fin(true)).ok && !(await admin.act({ type: 'hook', actor: 'R', pid: C + '-04' })).ok);
  const gate = await admin.act({ type: 'publish', f: { kind: '鬼门开', title: 'g', body: '', mins: 0 } });
  await sleep(200);
  T('gate publishes to all and pauses the rooms', gate.ok && admin.S.notices.find(n => n.title === 'g').target === 'all' && !!admin.S.gp);
  T('no reservations during the pause', !(await admin.act({ type: 'reserve', tid: 'R', rid: '4C' })).ok);
  const gn = admin.S.notices.find(n => n.title === 'g');
  await jd.act({ type: 'done', nid: gn.id, cid: 'R' }); await sleep(200);
  { const r = await jd.act({ type: 'gatereward', pid: 'G-01' }); await sleep(200);
    T('full winner: reward eliminates a player of another team, gate ends', r.ok && admin.S.players.find(p => p.id === 'G-01').st === 'out' && !admin.S.gp); }
  T('duration can be set', (await admin.act({ type: 'setdur', secs: 5400 })).ok && (await sleep(200), admin.S.dur === 5400)); }
[wc, mp, jd].forEach(c => c.close());

// ---- 展示模式 PIN (set by the developer) ----
{ const DEV = process.env.DEV_PIN || '777777';
  const j = await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin: DEV }) });
  if (j.ok) {
    const dv = await client(DEV);
    T('dev sees demoCfg', dv.me.role === 'dev' && Array.isArray(dv.me.demoCfg) && dv.me.demoCfg.length === 0);
    T('demo pin must be 6 digits', !(await dv.act({ type: 'dev.setdemo', pin: '12', mode: 'server', write: false })).ok);
    T('demo pin cannot reuse another pin', !(await dv.act({ type: 'dev.setdemo', pin: ADMIN, mode: 'server', write: false })).ok);
    T('admin cannot set demo', !(await admin.act({ type: 'dev.setdemo', pin: '135790', mode: 'server', write: false })).ok);
    T('dev sets demo (server, read-only)', (await dv.act({ type: 'dev.setdemo', pin: '135790', mode: 'server', write: false })).ok);
    const dm = await client('135790');
    T('demo login me', dm.me.role === 'dev' && dm.me.demo && dm.me.dmode === 'server' && !dm.me.dwrite && !dm.me.demoCfg);
    T('demo read-only blocks actions', !(await dm.act({ type: 'setscore', tid: 'R', v: 5, as: { role: 'ctrl' } })).ok);
    T('demo cannot change demo pin', !(await dm.act({ type: 'dev.setdemo', pin: '246810', mode: 'server', write: true })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', old: '135790', mode: 'server', write: true }); await sleep(300);
    const dm2 = await client('135790');
    T('demo write works on server', dm2.me.dwrite && (await dm2.act({ type: 'setscore', tid: 'R', v: 123, as: { role: 'ctrl' } })).ok);
    T('demo cannot use admin tools', !(await dm2.act({ type: 'admin.reset', demo: true, as: { role: 'ctrl' } })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', old: '135790', mode: 'local', write: true });
    const dm3 = await client('135790');
    T('local demo mode flag, no server actions', dm3.me.dmode === 'local' && !(await dm3.act({ type: 'setscore', tid: 'R', v: 1, as: { role: 'ctrl' } })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', old: '135790', mode: 'shared', write: true });
    const sa = await client('135790'), sb = await client('135790');
    const realR = admin.S.teams.find(t => t.id === 'R').score;
    T('shared demo: acts on the sandbox', (await sa.act({ type: 'setscore', tid: 'R', v: 4242, as: { role: 'ctrl' } })).ok);
    await sleep(300);
    T('shared demo: second user sees the same game', sb.S.teams.find(t => t.id === 'R').score === 4242);
    T('shared demo does not touch the real game', admin.S.teams.find(t => t.id === 'R').score === realR);
    const realPins = (await admin.act({ type: 'admin.pins' })).data.length;
    const gp = await sa.act({ type: 'admin.genpins', counts: { judge: 1 }, as: { role: 'ctrl' } });
    T('shared demo can generate its own PINs (not login-able, real PIN list untouched)', gp.ok && gp.data.length > 48 && (await admin.act({ type: 'admin.pins' })).data.length === realPins);
    T('shared demo reset', (await sa.act({ type: 'admin.reset', demo: true, as: { role: 'ctrl' } })).ok); await sleep(300);
    T('shared reset reaches the other user', sb.S.teams.find(t => t.id === 'R').score !== 4242);
    const sn = (await sa.act({ type: 'admin.snaps', as: { role: 'ctrl' } })).data;
    T('shared demo restore from backup reaches the other user', sn.length >= 1 && (await sa.act({ type: 'admin.restore', key: sn[0].key, as: { role: 'ctrl' } })).ok && (await sleep(300), sb.S.teams.find(t => t.id === 'R').score === 4242));
    [sa, sb].forEach(c => c.close());
    // several demo PINs, each with its own sandbox
    T('second demo pin (shared, write)', (await dv.act({ type: 'dev.setdemo', pin: '246802', mode: 'shared', write: true })).ok);
    const sc = await client('246802'), sd = await client('135790');
    await sc.act({ type: 'setscore', tid: 'B', v: 777, as: { role: 'ctrl' } }); await sleep(300);
    T('each shared demo pin has its own game', sc.S.teams.find(t => t.id === 'B').score === 777 && sd.S.teams.find(t => t.id === 'B').score !== 777);
    T('delete a demo pin', (await dv.act({ type: 'dev.deldemo', pin: '246802' })).data.every(d => d.pin !== '246802'));
    T('deleted demo pin cannot log in', !(await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin: '246802' }) })).ok);
    [sc, sd].forEach(c => c.close());
    [dv, dm2, dm3].forEach(c => c.close());
  } else console.log('SKIP demo-mode tests: DEV_PIN not set on the server');
}

T('no page errors', errs.length === 0); if (errs.length) console.log(errs);
console.log(res.join('\n')); console.log(res.filter(x => x.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); [admin, j1, j2, pc].forEach(c => c.close()); process.exit(0);
