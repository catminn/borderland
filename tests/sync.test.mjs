// Multi-device sync test against a running local server (npm run dev). Usage: node tests/sync.test.mjs [baseUrl]   · v3 个人赛
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
const P_ = id => admin.S.players.find(p => p.id === id);
T('admin login', admin.me.role === 'ctrl');
T('load demo', (await admin.act({ type: 'admin.reset', demo: true })).ok);
const gen = await admin.act({ type: 'admin.genpins', counts: { dealer: 8, wuchang: 1, judge: 2, mengpo: 1, ctrl: 1, screen: 1 } });
const pins = gen.data, pinOf = f => pins.find(f).pin;
T('pins generated (56 players + 8 dealers + 6 other staff)', pins.length === 56 + 8 + 2 + 1 + 1 + 1 + 1);
T('player PINs are labelled with the card number', pins.filter(p => p.role === 'player').every(p => /^\d{3}$/.test(p.pid)));
T('seed (mid) has one finished gate and one running', admin.S.notices.some(n => n.sub === 'gate' && n.gr) && !!admin.S.gp);
const J0 = await client(pinOf(p => p.role === 'judge')), dcache = {}, D = async rid => dcache[rid] || (dcache[rid] = await client(pinOf(p => p.role === 'dealer' && p.rooms[0] === rid)));
T('ctrl cannot do other staff actions', !(await admin.act({ type: 'gateend' })).ok && !(await admin.act({ type: 'enter', rid: '4H', pids: ['006'] })).ok);
await J0.act({ type: 'gateend' }); await sleep(200);
T('dealers fixed one room each', pins.filter(p => p.role === 'dealer').every(p => p.rooms.length === 1) && new Set(pins.filter(p => p.role === 'dealer').map(p => p.rooms[0])).size === 8);
T('pins unique', new Set(pins.map(p => p.pin)).size === pins.length);
const P = { player: pinOf(p => p.pid === '011'), fresh: pinOf(p => p.pid === '050'), judge: pinOf(p => p.role === 'judge'), judge2: pins.filter(p => p.role === 'judge')[1].pin,
  dealer: pinOf(p => p.role === 'dealer' && p.rooms && p.rooms.includes('8C')), screen: pinOf(p => p.role === 'screen'), mengpo: pinOf(p => p.role === 'mengpo'), wuchang: pinOf(p => p.role === 'wuchang') };
{ const g2 = await admin.act({ type: 'admin.genpins', counts: { dealer: 6, wuchang: 1 } }); const l = g2.data; T('dealer count can shrink to 6, wuchang stays 1', l.filter(p => p.role === 'dealer').length === 6 && l.filter(p => p.role === 'wuchang').length === 1); const g3 = await admin.act({ type: 'admin.genpins', counts: { dealer: 8 } }); pins.splice(0, pins.length, ...g3.data); P.dealer = g3.data.find(p => p.role === 'dealer' && p.rooms && p.rooms.includes('8C')).pin; }

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
async function page(pin, w = 1100) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/?pin=' + pin); await p.waitForSelector('#conn.free', { timeout: 8000 }); await sleep(3800); return p;
}
const ack = async p => { for (let i = 0; i < 15 && await p.locator('[data-modal]').count(); i++) await p.locator('[data-modal]').first().click(); };
const text = p => p.locator('#view').innerText();

const ctrl = await page(ADMIN), judge = await page(P.judge), dealer = await page(P.dealer), screen = await page(P.screen), mengpo = await page(P.mengpo);
const player = await page(P.player, 390);
T('roles see only their tabs', (await text(judge)).includes('鬼门开') && (await text(judge)).includes('解谜题') && (await text(mengpo)).includes('孟婆'));
T('player first page is the big screen with the ranking', (await text(player)).includes('全场播报') && (await text(player)).includes('冥币排行'));
await ack(player);
await player.click('[data-a=tab][data-v=player]');
{ const tx = await text(player); T('player sees own page (2nd tab)', tx.includes('011') && tx.includes('黑猫') && tx.includes('晋级资格进度')); }
await ack(player); await ack(ctrl);

// a fresh card asks for a nickname first
{ const fp = await page(P.fresh, 390);
  T('fresh card: nickname page only', (await text(fp)).includes('给自己取个昵称') && await fp.locator('#tabs').isHidden());
  await fp.fill('#nickin', '新来的'); await fp.click('[data-a=setnick]'); await sleep(500);
  T('nickname saved, game opens', P_('050').nick === '新来的' && P_('050').on && !(await text(fp)).includes('给自己取个昵称'));
  await fp.context().close(); }

// judge publishes a gate -> player popup; staff popup (not the big screen)
await judge.click('[data-a=dd][data-v="jg.gate"]'); await judge.click('[data-a=pick][data-k="jg.gate"][data-v=g1]'); await judge.click('[data-a=jgpub]');
await player.waitForSelector('#modal .dlg', { timeout: 4000 }).catch(() => {});
T('player popup after gate publish', (await player.locator('#modal').innerText()).includes('阎王点名'));
await ack(player);
await sleep(300); T('dealer and ctrl also get the gate popup, screen does not', await dealer.locator('[data-modal]').count() > 0 && await ctrl.locator('[data-modal]').count() > 0 && await screen.locator('[data-modal]').count() === 0);
await ack(ctrl); await ack(judge); await ack(dealer); await ack(mengpo);
T('gate does not pause the rooms', (await (await D('4H')).act({ type: 'enter', rid: '4H', pids: ['006'] })).ok);
// judge records the first 3 finishers and gives rewards
const sc11 = P_('011').score;
await judge.fill('#gwin', '11'); await sleep(200); await judge.click('[data-a=gatewin]'); await sleep(400);
T('gate: first finisher recorded by number (11 → 011)', admin.S.gp && admin.S.gp.wins[0] && admin.S.gp.wins[0].pid === '011');
await ack(player);
await judge.click('[data-a=pick][data-k="gr.011.k"][data-v=coin]'); await judge.click('[data-a=gatereward][data-v="011"]'); await sleep(400);
T('gate reward +300 reaches the player', P_('011').score === sc11 + 300 && admin.S.gp.wins[0].rw.k === 'coin');
{ const [r1, r2] = await Promise.all([(await client(P.judge)).act({ type: 'gatewin', pid: '004' }), (await client(P.judge2)).act({ type: 'gatewin', pid: '004' })]);
  T('race: two judges record the same person, exactly one wins', r1.ok !== r2.ok); }
await J0.act({ type: 'gatewin', pid: '006' }); await sleep(200);
T('gate: no 4th finisher', admin.S.gp.wins.length === 3 && !(await J0.act({ type: 'gatewin', pid: '007' })).ok);
await J0.act({ type: 'gatereward', pid: '004', kind: 'suit', arg: '♣' });
const downs = admin.S.players.filter(p => p.st !== 'alive');
{ const r = await J0.act({ type: 'gatereward', pid: '006', kind: 'save', arg: downs[0].id }); await sleep(300);
  T('gate: 3 rewards given → gate ends; save brings someone back', r.ok && !admin.S.gp && P_(downs[0].id).st === 'alive' && P_('004').cards.includes('♣')); }
await ctrl.click('[data-a=sub][data-p=ctrl][data-v=log]');
T('ctrl log updated live', (await text(ctrl)).includes('011 黑猫 第 1 个完成鬼门开'));
await ack(player); await ack(ctrl); await ack(judge); await ack(dealer); await ack(mengpo);

// puzzles via the judge page
await admin.act({ type: 'setbank', rows: [['5', '什么水果最忙', '芒果']] }); await sleep(300);
T('puzzle bank reaches the judge but not dealers', Object.keys(J0.S.bank || {}).length === 1 && !Object.keys((await D('4H')).S.bank || {}).length);
{ await judge.fill('#pzp', '7'); await judge.fill('#pzc', '5'); await sleep(300);
  T('judge sees question and answer after typing the code', (await judge.locator('.pzq').innerText()).includes('芒果'));
  await judge.click('[data-a=puz]'); await sleep(400);
  T('puzzle redeemed by the judge (+100)', P_('007').puz.length === 1 && P_('007').score === 100 && P_('007').puz[0].title.includes('#5')); }

// permissions
const pc = await client(P.player);
T('player cannot settle a room', !(await pc.act({ type: 'finish', rid: '4S', results: {} })).ok);
T('player cannot use admin', !(await pc.act({ type: 'admin.reset', demo: false })).ok);
T('player view: only broadcast log lines', pc.S.log.length > 0 && pc.S.log.every(l => l.b));
T('player view: other players carry no history', pc.S.players.filter(p => p.id !== '011').every(p => !p.hist.length && !p.puz.length));

// dealer: several people enter by number, the screen shows the room live
await ack(dealer);
await dealer.fill('#entin', '12 20'); await sleep(300); await dealer.click('[data-a=enter]'); await sleep(500);
T('dealer lets 2 people in at once', admin.S.rooms.find(r => r.id === '8C').ps.join() === '012,020');
T('screen shows room live', (await screen.locator('.rgrid').innerText()).includes('2 人'));
await dealer.click('[data-a=sub][data-p=dealer][data-v=settle]', { timeout: 1000 }).catch(() => {});
await dealer.click('[data-a=res][data-t="012"][data-v=win]'); await dealer.click('[data-a=res][data-t="020"][data-v=lose]'); await dealer.click('[data-a=finish]'); await sleep(500);
T('dealer settles per person: win pays, lose goes out', P_('012').score === 800 && P_('012').cards.includes('♣') && P_('020').st === 'out');
await ack(ctrl); await ack(judge); await ack(mengpo);

// clock
await ctrl.click('#clockctl'); await sleep(2200);
const t1 = await ctrl.locator('#clk').innerText(), t2 = await screen.locator('#clk').innerText();
T('clock running and same on screens', t1 === t2 && t1 !== 'T+34:00'); if (t1 !== t2 || t1 === 'T+34:00') console.log('clock', t1, t2);
await ctrl.click('#clockctl');

// typing is not wiped by live updates
await ctrl.click('[data-a=sub][data-p=ctrl][data-v=pub]'); await ctrl.click('#pti'); await ctrl.keyboard.type('正在输入');
await admin.act({ type: 'setscore', pid: '001', v: 4321 }); await sleep(600);
T('typing survives broadcast', (await ctrl.inputValue('#pti')) === '正在输入');

// wrong PIN + PIN reset kicks the old session
const bad = await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin: '000001' }) });
T('wrong PIN rejected', bad.status === 401);
const rp = await admin.act({ type: 'admin.resetpin', pin: P.player });
await player.waitForSelector('#loginf', { timeout: 5000 }).catch(() => {});
T('PIN reset logs player out', rp.ok && await player.locator('#loginf').count() === 1);

// ---- 鬼市, through the real server ----
await admin.act({ type: 'admin.reset', demo: false });
const wc = await client(P.wuchang), mp = await client(P.mengpo), jd = await client(P.judge);
const dealerOf = room => client(pinOf(p => p.role === 'dealer' && p.rooms[0] === room));
{ const d4 = await dealerOf('4S');
  T('no start room: anyone can enter any room from the start', (await d4.act({ type: 'enter', rid: '4S', pids: ['001', '009'] })).ok);
  T('dealer cannot run other rooms', !(await d4.act({ type: 'finish', rid: '8S', results: {} })).ok);
  T('every person needs a result', !(await d4.act({ type: 'finish', rid: '4S', results: { '001': 'win' } })).ok);
  await d4.act({ type: 'finish', rid: '4S', results: { '001': 'win', '009': 'lose' } }); await sleep(250);
  T('reset room cannot be entered', !(await (await D('4S')).act({ type: 'enter', rid: '4S', pids: ['017'] })).ok);
  T('only the dealer of that room sets reset done', !(await (await dealerOf('8S')).act({ type: 'resetdone', rid: '4S' })).ok && (await d4.act({ type: 'resetdone', rid: '4S' })).ok);
  const v = '009';
  { const bd = await mp.act({ type: 'pickup', pid: v }), gd = await wc.act({ type: 'pickup', pid: v }); await sleep(250);
    T('only wuchang picks up', !bd.ok && gd.ok && P_(v).st === 'picked'); }
  { const r = await wc.act({ type: 'checkin', pid: v }); await sleep(250); T('check-in alone keeps the player pending', r.ok && P_(v).st === 'picked' && !P_(v).chk.ok); }
  T('cannot confirm your own check-in', !(await wc.act({ type: 'confirm', pid: v })).ok);
  { const r = await mp.act({ type: 'confirm', pid: v }); await sleep(250); T('the other side confirms: market (wallet frozen)', r.ok && P_(v).st === 'market'); }
  T('chips are physical: mengpo cannot record chips', !(await mp.act({ type: 'chips', pid: v, v: 580 })).ok);
  { const sc = P_(v).score, r = await mp.act({ type: 'redeem', pid: v }); await sleep(200); T('self-redeem just unfreezes (no carry-out)', r.ok && P_(v).st === 'alive' && P_(v).score === sc); }
  d4.close(); }

// ---- 晋级 + 拍卖, through the real server and the player phone ----
{ await admin.act({ type: 'admin.clock', op: 'set', sec: 700 });
  const q = async (id, rooms) => { for (const rid of rooms) { const d = await D(rid); await d.act({ type: 'enter', rid, pids: [id] }); await d.act({ type: 'finish', rid, results: { [id]: 'win' } }); await d.act({ type: 'resetdone', rid }); } };
  await q('002', ['8S', '8D', '8C', '4H']); await q('003', ['8H', '4D', '4C', '4S']);
  await sleep(200);
  T('qualification: 4 suits + 2000', R_q('002') && R_q('003') && !R_q('001'));
  await jd.act({ type: 'auc.add', f: { name: '盲盒', start: 100 } }); await jd.act({ type: 'auc.add', f: { name: '大奖', start: 0, big: true } });
  T('judge cannot open before lock', !(await jd.act({ type: 'auc.open', id: 'L1', secs: 60 })).ok);
  T('judge locks the list', (await jd.act({ type: 'lockfinal' })).ok && (await sleep(200), admin.S.fin.length === 2));
  T('judge opens with a countdown; big screen switches', (await jd.act({ type: 'auc.show', id: 'L1' })).ok && (await jd.act({ type: 'auc.open', id: 'L1', secs: 90 })).ok && (await sleep(200), admin.S.auc.screen === 'auction'));
  await admin.act({ type: 'nick', pid: '003', nick: '出价人' });
  const pp = await page(pinOf(p => p.pid === '003'), 390), sp = await page(P.screen, 1100); await ack(pp);
  T('qualified player sees the bid box on the first page', (await text(pp)).includes('你的出价'));
  T('big screen shows the auction', (await text(sp)).includes('鬼市大拍卖') && (await text(sp)).includes('盲盒'));
  await pp.fill('#bidin', '700'); await sleep(200); await pp.click('[data-a=bid]'); await sleep(400);
  T('player bids from the phone', admin.S.auc.lots[0].bids['003'] && admin.S.auc.lots[0].bids['003'].v === 700);
  const c2 = await client(pinOf(p => p.pid === '002'));
  T('player view hides other bids', Object.keys(c2.S.auc.lots[0].bids).length === 0 && c2.S.auc.lots[0].nb === 1);
  { const sc = await client(P.screen); await c2.act({ type: 'bid', id: 'L1', v: 610 }); await sleep(300);
    T('big screen never receives bid amounts (hello + broadcast)', Object.keys(sc.S.auc.lots[0].bids).length === 0 && sc.S.auc.lots[0].nb === 2); sc.close(); }
  T('staff state carries at most 300 log lines', admin.S.log.length <= 300);
  T('unqualified player cannot bid', !(await (await client(pinOf(p => p.pid === '001'))).act({ type: 'bid', id: 'L1', v: 100 })).ok);
  T('judge +30 s / pause / resume', (await jd.act({ type: 'auc.time', op: 'add' })).ok && (await jd.act({ type: 'auc.time', op: 'pause' })).ok && !(await c2.act({ type: 'bid', id: 'L1', v: 650 })).ok && (await jd.act({ type: 'auc.time', op: 'resume' })).ok);
  T('cannot reveal while open', !(await jd.act({ type: 'auc.reveal' })).ok);
  await jd.act({ type: 'auc.time', op: 'close' }); await sleep(300);
  T('big screen: closed, waiting for reveal', (await text(sp)).includes('等待揭晓'));
  await jd.act({ type: 'auc.reveal' }); await sleep(400);
  T('reveal: highest bid wins and pays', admin.S.auc.lots[0].win === '003' && P_('003').score === 2000 - 700);
  T('big screen shows the deal', (await text(sp)).includes('成交'));
  T('void the absent winner → next bidder', (await jd.act({ type: 'auc.void' })).ok && (await sleep(200), admin.S.auc.lots[0].win === '002' && P_('003').score === 2000));
  T('redo resets the lot and refunds', (await jd.act({ type: 'auc.redo' })).ok && (await sleep(200), admin.S.auc.lots[0].st === 'wait' && P_('002').score === 2800));
  T('judge switches the screen back', (await jd.act({ type: 'auc.screen', on: false })).ok && (await sleep(400), (await text(sp)).includes('冥币排行')));
  await pp.context().close(); await sp.context().close(); c2.close(); }
function R_q(id) { const p = P_(id); return p.cards.length === 4 && p.score >= 2000 && p.st === 'alive'; }
T('duration can be set', (await admin.act({ type: 'setdur', secs: 5400 })).ok && (await sleep(200), admin.S.dur === 5400));
{ const r = await admin.act({ type: 'admin.clock', op: 'reset' }); await sleep(200);
  T('clock reset: back to 0:00 and paused', r.ok && admin.S.t === 0 && admin.S.log.some(l => /计时重置/.test(l.text))); }
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
    T('demo read-only blocks actions', !(await dm.act({ type: 'setscore', pid: '001', v: 5, as: { role: 'ctrl' } })).ok);
    T('demo cannot change demo pin', !(await dm.act({ type: 'dev.setdemo', pin: '246810', mode: 'server', write: true })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', old: '135790', mode: 'server', write: true }); await sleep(300);
    const dm2 = await client('135790');
    T('demo write works on server', dm2.me.dwrite && (await dm2.act({ type: 'setscore', pid: '001', v: 123, as: { role: 'ctrl' } })).ok);
    T('demo cannot use admin tools', !(await dm2.act({ type: 'admin.reset', demo: true, as: { role: 'ctrl' } })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', old: '135790', mode: 'local', write: true });
    const dm3 = await client('135790');
    T('local demo mode flag, no server actions', dm3.me.dmode === 'local' && !(await dm3.act({ type: 'setscore', pid: '001', v: 1, as: { role: 'ctrl' } })).ok);
    await dv.act({ type: 'dev.setdemo', pin: '135790', old: '135790', mode: 'shared', write: true });
    const sa = await client('135790'), sb = await client('135790');
    const SC = (c, id) => c.S.players.find(p => p.id === (id || '001')).score, realR = SC(admin);
    T('shared demo: acts on the sandbox', (await sa.act({ type: 'setscore', pid: '001', v: 4242, as: { role: 'ctrl' } })).ok);
    await sleep(300);
    T('shared demo: second user sees the same game', SC(sb) === 4242);
    T('shared demo does not touch the real game', SC(admin) === realR);
    const realPins = (await admin.act({ type: 'admin.pins' })).data.length;
    const pre = await sa.act({ type: 'admin.pins', as: { role: 'ctrl' } });
    T('shared demo already has a full PIN list before generating', pre.ok && pre.data.length >= 56 + 8 + 4);
    const gp = await sa.act({ type: 'admin.genpins', counts: { judge: 1 }, as: { role: 'ctrl' } });
    T('shared demo can generate its own PINs (real PIN list untouched)', gp.ok && gp.data.length > 56 && (await admin.act({ type: 'admin.pins' })).data.length === realPins);
    {   // 演示局里生成的 PIN 能直接登录：进入这一局，按各自角色
      const dp = gp.data, realSet = new Set((await admin.act({ type: 'admin.pins' })).data.map(x => x.pin));
      T('demo PINs do not collide with real PINs', dp.every(x => !realSet.has(x.pin)));
      const pc = dp.find(x => x.role === 'ctrl').pin, pp = dp.find(x => x.pid === '003').pin, pd = dp.find(x => x.role === 'dealer').pin;
      const dc = await client(pc), dpl = await client(pp), ddl = await client(pd);
      T('demo ctrl PIN logs in as ctrl (not dev)', dc.me.role === 'ctrl' && !dc.me.demo);
      T('demo player PIN logs in as that player', dpl.me.role === 'player' && dpl.me.pid === '003');
      T('demo ctrl sees the demo game, not the real one', SC(dc) === SC(sb));
      T('demo ctrl acts in the demo game and others see it', (await dc.act({ type: 'setscore', pid: '001', v: 5151 })).ok && (await sleep(300), SC(sb) === 5151 && SC(dpl) === 5151));
      T('real game untouched by demo ctrl', SC(admin) === realR);
      T('demo player cannot use ctrl tools', !(await dpl.act({ type: 'admin.pins' })).ok && !(await dpl.act({ type: 'setscore', pid: '001', v: 1 })).ok);
      T('demo dealer is bound to its room only', ddl.me.role === 'dealer' && Array.isArray(ddl.me.rooms));
      T('demo ctrl can use ctrl tools', (await dc.act({ type: 'admin.pins' })).ok);
      await dc.act({ type: 'setscore', pid: '001', v: 4242 });
      [dc, dpl, ddl].forEach(c => c.close());
    }
    T('shared demo reset', (await sa.act({ type: 'admin.reset', demo: true, as: { role: 'ctrl' } })).ok); await sleep(300);
    T('shared reset reaches the other user', SC(sb) !== 4242);
    const sn = (await sa.act({ type: 'admin.snaps', as: { role: 'ctrl' } })).data;
    T('shared demo restore from backup reaches the other user', sn.length >= 1 && (await sa.act({ type: 'admin.restore', key: sn[0].key, as: { role: 'ctrl' } })).ok && (await sleep(300), SC(sb) === 4242));
    [sa, sb].forEach(c => c.close());
    // several demo PINs, each with its own sandbox
    T('second demo pin (shared, write)', (await dv.act({ type: 'dev.setdemo', pin: '246802', mode: 'shared', write: true })).ok);
    const sc = await client('246802'), sd = await client('135790');
    await sc.act({ type: 'setscore', pid: '002', v: 777, as: { role: 'ctrl' } }); await sleep(300);
    T('each shared demo pin has its own game', SC(sc, '002') === 777 && SC(sd, '002') !== 777);
    T('delete a demo pin', (await dv.act({ type: 'dev.deldemo', pin: '246802' })).data.every(d => d.pin !== '246802'));
    T('deleted demo pin cannot log in', !(await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin: '246802' }) })).ok);
    // ---- 统计（只有真开发者 PIN）----
    T('stats: admin cannot read', !(await admin.act({ type: 'dev.stats' })).ok);
    const dm4 = await client('135790');   // dm2 was kicked when the demo mode changed; use a fresh demo connection
    T('stats: demo pin cannot read', !(await dm4.act({ type: 'dev.stats' })).ok);
    dm4.close();
    const st0 = (await dv.act({ type: 'dev.stats' }));
    T('stats: dev reads rows + series', st0.ok && Array.isArray(st0.data.rows) && Array.isArray(st0.data.series) && st0.data.online >= 1);
    T('stats: rows record dev and admin logins', st0.data.rows.some(r => r.k === '开发者' && r.role === 'dev' && r.logins >= 1 && r.conns >= 1) && st0.data.rows.some(r => r.role === 'ctrl' && r.logins >= 1));
    T('stats: each demo pin is its own row (末 4 位), role 展示, no full pin stored', ['··5790', '··6802'].every(t => st0.data.rows.some(r => r.k === '展示 ' + t && r.role === 'demo' && r.roleName === '展示')) && st0.data.rows.every(r => !/\d{6}/.test(r.k)));
    T('stats: devices are coarse labels only', st0.data.rows.every(r => r.devs.every(x => x.length < 12)));
    await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin: '000000' }) });
    T('stats: wrong pin counted', (await dv.act({ type: 'dev.stats' })).data.fails === st0.data.fails + 1);
    T('stats: clear', (r => r.ok && r.data.rows.length === 0 && r.data.fails === 0 && r.data.series.length === 0)(await dv.act({ type: 'dev.clearstats' })));
    T('stats: admin cannot clear', !(await admin.act({ type: 'dev.clearstats' })).ok);
    [sc, sd].forEach(c => c.close());
    [dv, dm2, dm3].forEach(c => c.close());
  } else console.log('SKIP demo-mode tests: DEV_PIN not set on the server');
}

T('no page errors', errs.length === 0); if (errs.length) console.log(errs);
console.log(res.join('\n')); console.log(res.filter(x => x.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); [admin, pc].forEach(c => c.close()); process.exit(0);
