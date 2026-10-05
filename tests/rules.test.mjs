// Pure rules tests (no server): time-dependent behaviour.
import * as R from '../shared/rules.js';
let bad = 0; const T = (n, c) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (!c) bad++; };
const me = r => ({ role: r }), A = (r, a) => R.apply(S, me(r), a);
const S = R.newGame(false);
// reservation expires after 2 minutes, no other timeout
R.use(S); S.t = 100;
T('reserve', A('ctrl', { type: 'reserve', tid: 'R', rid: '4S' }).ok);
S.t = 100 + 119; T('still reserved at 119s', R.rstate(S.rooms[0]) === 'rsv');
S.t = 100 + 120; T('lapsed at 120s', R.rstate(S.rooms[0]) === 'open' && A('ctrl', { type: 'reserve', tid: 'B', rid: '4S' }).ok);
S.t = 5000; A('ctrl', { type: 'enter', tid: 'B', rid: '4S' }); S.t = 5000 + 3600;
T('game never auto-ends', S.rooms[0].st === 'play' && A('ctrl', { type: 'finish', rid: '4S', results: { B: 'win' } }).ok);
S.t += 9999; A('ctrl', { type: 'ping' }); T('reset never auto-reopens', S.rooms[0].st === 'reset');
// scavenger: 2 per rolling 10 min, 600 cap, no repeats
const give = (q, t) => { S.t = t; const p = A('ctrl', { type: 'publish', f: { kind: 'sidequest', team: 'K', quest: q } }); if (!p.ok) return p; return A('judge', { type: 'done', nid: S.notices[0].id, cid: 'K' }); };
const base = 20000;
T('q1 ok', give('q1', base).ok); T('q2 ok', give('q2', base + 60).ok);
T('3rd within 10 min refused', !give('q3', base + 300).ok);
const inf = R.scavInfo('K'); T('next time = oldest + 600', inf.nextAt === base + 600 && inf.left === 400);
T('rolling, not fixed blocks: ok again at base+600', give('q3', base + 600).ok);
T('two recent (q2 at +60, q3 at +600): base+650 still refused', !give('q4', base + 650).ok);
T('q4 ok at base+660', give('q4', base + 660).ok);
T('q5 ok', give('q5', base + 1300).ok); T('q6 ok (600 reached)', give('q6', base + 1300 + 5).ok);
T('capped: no more points', !give('q7', base + 5000).ok && R.scavInfo('K').capped && S.teams.find(t => t.id === 'K').score === 600);
// undo restores quota and removes the record
const nid = S.notices.find(n => n.q === 'q6').id; A('judge', { type: 'undone', nid, cid: 'K' });
T('undo frees quota', R.scavInfo('K').left === 100 && S.teams.find(t => t.id === 'K').score === 500);
// market: initial 200, threshold 500, carry <= 100, no farming
const S2 = R.newGame(false); R.use(S2); S2.t = 10;
const ap = (r, a) => R.apply(S2, me(r), a);
ap('ctrl', { type: 'enter', tid: 'R', rid: '4S' }); ap('ctrl', { type: 'finish', rid: '4S', results: { R: 'lose' }, picks: { R: 'R-02' } });
T('mengpo-first check-in keeps player in out', ap('mengpo', { type: 'checkin', pid: 'R-02' }).ok && S2.players.find(p => p.id === 'R-02').st === 'out');
T('initiator cannot confirm', !ap('mengpo', { type: 'confirm', pid: 'R-02' }).ok);
T('wuchang confirms -> market 200', ap('wuchang', { type: 'confirm', pid: 'R-02' }).ok && S2.players.find(p => p.id === 'R-02').coins === 200);
ap('mengpo', { type: 'coin', pid: 'R-02', coins: 900 });
T('900 -> carry capped at 100', ap('mengpo', { type: 'coin', pid: 'R-02', coins: 950 }).ok === false);
const sc0 = S2.teams[0].score; ap('mengpo', { type: 'revive', pid: 'R-02' });
T('revive: 500 spent, only 100 returns', S2.teams[0].score === sc0 + 100 && S2.players.find(p => p.id === 'R-02').st === 'alive');
// final: forced entry lists unmet conditions
const t = S2.teams[1]; T('finalMiss lists unmet items (score, suits)', R.finalMiss(t).length === 2);
T('ctrl forces final', ap('ctrl', { type: 'final', tid: t.id, on: true }).ok && t.final);
{ // 房间记录
  const R = await import('../shared/rules.js'); const g = R.newGame ? R.newGame(false) : null;
  if (g) { R.use(g); g.t = 100; const t = g.teams[0]; const rid = R.ROOMS[0].id;
    R.enterRoom(t.id, rid); g.t = 200; const r = R.finishRoom(rid, { [t.id]: 'lose' }, { [t.id]: R.alive(t.id)[0].id });
    const h = t.hist[0]; T('room history records entry/result/out', !!(h && h.rid === rid && h.t0 === 100 && h.t1 === 200 && h.res === 'lose' && h.out)); }
}
{ // 判官直接兑换 Scavenger Hunt
  const G = R.newGame(false); R.use(G); G.t = 50; const J = a => R.apply(G, { role: 'judge' }, a);
  const a1 = J({ type: 'scavredeem', tid: 'C', qid: 'q1' }), a2 = J({ type: 'scavredeem', tid: 'C', qid: 'q1' }), a3 = J({ type: 'scavredeem', tid: 'C', qid: 'custom', title: '自定义题' }), a4 = J({ type: 'scavredeem', tid: 'C', qid: 'q2' });
  T('judge redeems scav: +100, no repeat, window limit 2', a1.ok && !a2.ok && a3.ok && !a4.ok && G.teams.find(t => t.id === 'C').score === 200);
  const P = R.apply(G, { role: 'ctrl' }, { type: 'publish', f: { kind: 'sidequest', team: 'B', quest: 'custom', title: '临时题' } });
  T('custom scavenger publish', P.ok && G.notices[0].title === '临时题');
  T('custom gate publish', R.apply(G, { role: 'ctrl' }, { type: 'publish', f: { kind: '鬼门开', gate: 'custom', title: '临时门' } }).ok);
}
{ // 自定义任务
  const G = R.newGame(false); R.use(G); G.t = 10; const C = a => R.apply(G, { role: 'ctrl' }, a);
  const p = C({ type: 'publish', f: { kind: 'custom', target: 'team', team: 'B', title: '找到三楼的钥匙', body: 'x', reward: 150 } });
  const n = G.notices[0]; const d = R.apply(G, { role: 'judge' }, { type: 'done', nid: n.id, cid: 'B' });
  T('custom task: one team, judge completes, +150', p.ok && n.sub === 'custom' && n.mode === 'each' && d.ok && G.teams.find(t => t.id === 'B').score === 150 && !G.gp);
}
{ // 时间到：暂停预约与入场，已在房间里的不受影响
  const G = R.newGame(false); R.use(G); G.t = 100; const D = a => R.apply(G, { role: 'dealer', rooms: null }, a);
  const e1 = R.apply(G, { role: 'ctrl' }, { type: 'enter', tid: 'R', rid: '4S' });
  G.t = G.dur + 5;
  const r1 = R.apply(G, { role: 'player', pid: 'B-01' }, { type: 'reserve', rid: '8S' });
  const e2 = R.apply(G, { role: 'ctrl' }, { type: 'enter', tid: 'B', rid: '8S' });
  T('time up: reserve and enter refused, team already inside stays', e1.ok && !r1.ok && /时间到/.test(r1.msg) && !e2.ok && /时间到/.test(e2.msg) && G.teams.find(t => t.id === 'R').inRoom === '4S' && R.timeUp());
}
{ // 公告可发给工作人员 / 所有人
  const G = R.newGame(false); R.use(G); G.t = 10; const C = a => R.apply(G, { role: 'ctrl' }, a);
  const a = C({ type: 'publish', f: { kind: '公告', target: 'staff', title: '工作人员集合', body: 'x' } });
  const b = C({ type: 'publish', f: { kind: '公告', target: 'everyone', title: '全员通知', body: 'y' } });
  const c = C({ type: 'publish', f: { kind: 'custom', target: 'staff', title: '不行', body: 'z' } });
  const pv = R.viewFor(G, { role: 'player', pid: 'R-02' });
  T('announce to staff / everyone', a.ok && b.ok && !c.ok && pv.notices.some(n => n.title === '全员通知') && !pv.notices.some(n => n.title === '工作人员集合') && R.staffSees(G.notices[0]) && R.staffSees(G.notices[1]));
}
console.log(bad ? bad + ' FAILED' : 'RULES PASSED'); process.exit(bad ? 1 : 0);
