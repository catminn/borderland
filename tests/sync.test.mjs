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
T('pins generated (42 players + 7 staff)', pins.length === 49);
T('pins unique', new Set(pins.map(p => p.pin)).size === pins.length);
const P = { player: pinOf(p => p.pid === 'B-02'), judge: pinOf(p => p.role === 'judge'), judge2: pins.filter(p => p.role === 'judge')[1].pin,
  dealer: pinOf(p => p.role === 'dealer'), screen: pinOf(p => p.role === 'screen'), mengpo: pinOf(p => p.role === 'mengpo') };

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
{ const tx = await text(player); T('player sees own page', tx.includes('B-02') && tx.includes('蓝队')); }
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
const pub2 = await admin.act({ type: 'publish', f: { kind: '任务', mode: 'first', title: '抢答', body: '', target: 'all', reward: 0, mins: 0 } });
await sleep(300);
const n2 = admin.S.notices.find(n => n.title === '抢答').id;
const j1 = await client(P.judge), j2 = await client(P.judge2);
const [r1, r2] = await Promise.all([j1.act({ type: 'done', nid: n2, cid: 'R' }), j2.act({ type: 'done', nid: n2, cid: 'G' })]);
T('race: exactly one winner', pub2.ok && (r1.ok !== r2.ok));

// permissions
const pc = await client(P.player);
T('player cannot hook', !(await pc.act({ type: 'hook', actor: 'B', pid: 'R-01' })).ok);
T('player cannot use admin', !(await pc.act({ type: 'admin.reset', demo: false })).ok);
T('player view hides log/shop', pc.S.log.length === 0 && pc.S.shop.length === 0);

// dealer -> screen
await dealer.click('[data-a=room][data-v="7H"]'); await dealer.click('[data-a=pick][data-k=pick][data-v=P]'); await dealer.click('[data-a=enter]');
await sleep(500);
T('screen shows room live', (await screen.locator('.rgrid').innerText()).includes('紫队'));

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

T('no page errors', errs.length === 0); if (errs.length) console.log(errs);
console.log(res.join('\n')); console.log(res.filter(x => x.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
await b.close(); [admin, j1, j2, pc].forEach(c => c.close()); process.exit(0);
