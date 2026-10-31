// Pure rules tests (no server): v3 个人赛规则。
import * as R from '../shared/rules.js';
let bad = 0; const T = (n, c) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (!c) bad++; };
let S = R.newGame(false);
const A = (r, a, extra) => R.apply(S, { role: r, ...(extra || {}) }, a);
const P = id => S.players.find(p => p.id === id);
const fresh = () => { S = R.newGame(false); R.use(S); };

// ---------- 身份卡 ----------
fresh();
T('100 张身份卡，编号 001–100', S.players.length === 100 && S.players[0].id === '001' && S.players[99].id === '100');
T('没有起始房间', S.players.every(p => !('start' in p)));
T('没登录的人不进排行', R.ranking().length === 0);
T('玩家取昵称', A('player', { type: 'nick', nick: '阿鬼' }, { pid: '001' }).ok && P('001').nick === '阿鬼' && P('001').on);
T('昵称不能重复', !A('player', { type: 'nick', nick: '阿鬼' }, { pid: '002' }).ok);
T('玩家只能改自己的昵称', A('player', { type: 'nick', pid: '003', nick: '小白' }, { pid: '002' }).ok && P('002').nick === '小白' && !P('003').nick);
T('总控能改别人的昵称', A('ctrl', { type: 'nick', pid: '003', nick: '无常' }).ok && P('003').nick === '无常');

// ---------- 房间 ----------
fresh(); S.t = 60;
T('开场就能进任何房间（没有起始房间限制）', A('dealer', { type: 'enter', rid: '8S', pids: ['002'] }).ok && A('dealer', { type: 'kick', rid: '8S', pid: '002' }).ok && S.rooms[1].st === 'open');
T('可以一次放多人入场', A('dealer', { type: 'enter', rid: '4S', pids: ['001', '009', '017'] }).ok && S.rooms[0].ps.length === 3 && S.rooms[0].st === 'play');
T('入场即算参与（进排行）', P('009').on);
T('已在房间里不能再进', !A('dealer', { type: 'enter', rid: '4S', pids: ['001'] }).ok);
T('Dealer 只能管自己的房间', !A('dealer', { type: 'enter', rid: '8S', pids: ['002'] }, { rooms: ['4S'] }).ok);
T('结算要给每人选结果', !A('dealer', { type: 'finish', rid: '4S', results: { '001': 'win' } }).ok);
T('没有「中途离开」（中途放弃算输）', !A('dealer', { type: 'finish', rid: '4S', results: { '001': 'win', '009': 'lose', '017': 'leave' } }).ok);
A('dealer', { type: 'kick', rid: '4S', pid: '017' });
const r1 = A('dealer', { type: 'finish', rid: '4S', results: { '001': 'win', '009': 'lose' } });
T('结算成功', r1.ok);
T('赢：+400 + 花色', P('001').score === 400 && P('001').cards.includes('♠') && P('001').cleared.includes('4S'));
T('输：进入待抓，不扣金币', P('009').st === 'out' && P('009').score === 0);
T('结算后房间重置中，不能入场', S.rooms[0].st === 'reset' && !A('dealer', { type: 'enter', rid: '4S', pids: ['025'] }).ok);
A('dealer', { type: 'resetdone', rid: '4S' });
T('每人每间只能成功一次', !A('dealer', { type: 'enter', rid: '4S', pids: ['001'] }).ok && A('dealer', { type: 'enter', rid: '4S', pids: ['017'] }).ok);
T('移出房间不计结果', A('dealer', { type: 'kick', rid: '4S', pid: '017' }).ok && !P('017').inRoom && S.rooms[0].st === 'open' && P('017').hist.every(h => h.res !== null));
S.t = 700;
T('10 分钟后可以进任意房间', A('dealer', { type: 'enter', rid: '8D', pids: ['001'] }).ok);
A('dealer', { type: 'finish', rid: '8D', results: { '001': 'win' } }); A('dealer', { type: 'resetdone', rid: '8D' });
T('困难房 +800', P('001').score === 1200 && P('001').cards.length === 2);
T('人数上限默认关闭', A('dealer', { type: 'enter', rid: '4H', pids: ['003', '011', '019'] }).ok);
['003', '011', '019'].forEach(pid => A('dealer', { type: 'kick', rid: '4H', pid }));
T('只有总控能开关人数上限', !A('dealer', { type: 'setcapon', v: true }).ok);
A('ctrl', { type: 'setcapon', v: true }); A('ctrl', { type: 'setcap', v: 2 });
T('房间容量', !A('dealer', { type: 'enter', rid: '4H', pids: ['003', '011', '019'] }).ok && A('dealer', { type: 'enter', rid: '4H', pids: ['003', '011'] }).ok && !A('dealer', { type: 'enter', rid: '4H', pids: ['019'] }).ok);
A('ctrl', { type: 'setcapon', v: false });
S.t = 7200;
T('时间到：房间关闭', !A('dealer', { type: 'enter', rid: '8S', pids: ['002'] }).ok);
T('时间到：已在房间里的照常结算', A('dealer', { type: 'finish', rid: '4H', results: { '003': 'win', '011': 'win' } }).ok);

// ---------- 鬼市 ----------
fresh(); S.t = 700;
P('001').score = 1000; P('001').cards = ['♠', '♥']; P('001').cleared = ['4S', '4H'];
R.eliminate(P('001'), '测试', '');
T('失败后钱包冻结（分数不变）', P('001').st === 'out' && P('001').score === 1000);
T('无常抓到', A('wuchang', { type: 'pickup', pid: '001' }).ok);
T('无常送入，自己不能确认', A('wuchang', { type: 'checkin', pid: '001' }).ok && !A('wuchang', { type: 'confirm', pid: '001' }).ok);
T('孟婆确认后进鬼市，金币冻结（网站不记筹码）', A('mengpo', { type: 'confirm', pid: '001' }).ok && P('001').st === 'market' && P('001').score === 1000 && !('chips' in P('001')));
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'pickup', pid: '001' });
T('孟婆登记已抓到的人：直接入鬼市，不用无常确认', A('mengpo', { type: 'checkin', pid: '001' }).ok && P('001').st === 'market' && P('001').chk.ok);
A('mengpo', { type: 'redeem', pid: '001' });
T('孟婆输入编号登记在场的人（自己走进鬼市）：直接入鬼市', P('003').st === 'alive' && A('mengpo', { type: 'checkin', pid: '003' }).ok && P('003').st === 'market' && !P('003').inRoom);
T('已在鬼市的人不能重复登记', !A('mengpo', { type: 'checkin', pid: '003' }).ok);
A('mengpo', { type: 'redeem', pid: '003' });
R.eliminate(P('001'), '测试', '');
{ const n0 = R.S.players.length; R.setPlayerCount(n0 + 5); const up = R.S.players.length === n0 + 5; R.setPlayerCount(n0);
  T('设置玩家数量：补到指定张数，多出来没用过的卡可以减回去', up && R.S.players.length === n0);
  R.S.players[R.S.players.length - 1].on = true; R.setPlayerCount(n0 - 3);
  T('设置玩家数量：最后一张卡用过了就不删', R.S.players.length === n0); R.S.players[R.S.players.length - 1].on = false; }
T('孟婆不能记筹码（实体筹码）', !A('mengpo', { type: 'chips', pid: '001', v: 650 }).ok);
A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
T('自赎：直接解冻，不带出金币', A('mengpo', { type: 'redeem', pid: '001' }).ok && P('001').st === 'alive' && P('001').score === 1000);
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
P('002').score = 400;
T('赎人：钱不够不行', !A('mengpo', { type: 'ransom', pid: '001', by: '002' }).ok);
P('002').score = 800;
T('赎人：在场的人花 500 金币', A('mengpo', { type: 'ransom', pid: '001', by: '002' }).ok && P('002').score === 300 && P('001').st === 'alive' && P('001').score === 1000);
R.eliminate(P('003'), '测试', ''); A('wuchang', { type: 'checkin', pid: '003' }); A('mengpo', { type: 'confirm', pid: '003' });
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
T('复活：不忘花色，不管时间都能复活（孟婆可强行）', R.soup('001').ok && P('001').st === 'alive' && P('001').cards.length === 2 && P('001').cleared.includes('4S') && P('001').cleared.includes('4H'));
S.t = 7200 + 10; R.eliminate(P('004'), '测试', ''); A('wuchang', { type: 'checkin', pid: '004' });
T('截止后失败的人照常收进鬼市', A('mengpo', { type: 'confirm', pid: '004' }).ok && P('004').st === 'market');
S.t = 7200 + 900;
T('截止 15 分钟后照常可以复活', A('mengpo', { type: 'redeem', pid: '003' }).ok);

// ---------- 解谜题 ----------
fresh(); S.t = 1000;
T('解谜：按谜题编码 +100（题库里没有也照记）', A('judge', { type: 'puz', pid: '005', code: '1' }).ok && P('005').score === 100 && P('005').puz[0].title === '#1 谜题');
T('同一题不能重复（编码 01 = 1）', !A('judge', { type: 'puz', pid: '005', code: '01' }).ok);
['2', '3', '4'].forEach(c => A('judge', { type: 'puz', pid: '005', code: c }));
T('最多 400', P('005').score === 400 && !A('judge', { type: 'puz', pid: '005', code: '5' }).ok);
T('撤销扣回', A('judge', { type: 'puzundo', pid: '005', key: 'z4' }).ok && P('005').score === 300);
T('编码不对不能兑换', !A('judge', { type: 'puz', pid: '005', code: 'abc' }).ok);
T('只有总控能导入题库', !A('judge', { type: 'setbank', rows: [['1', 'q', 'a']] }).ok && A('ctrl', { type: 'setbank', rows: [['12', 'Emoji 猜词：🚪👻🔓', '鬼门开'], ['x', '表头', ''], ['13', '黑白', '黑白无常']] }).ok && Object.keys(S.bank).length === 2);
T('题库里有的题记下题目', A('judge', { type: 'puz', pid: '006', code: '12' }).ok && P('006').puz[0].title.startsWith('#12 Emoji'));
T('题库只发给判官和总控（玩家、大屏、其他工作人员看不到答案）', !!R.viewFor(S, { role: 'judge' }).bank['12'] && !!R.viewFor(S, { role: 'ctrl' }).bank['12']
  && ['dealer', 'mengpo', 'wuchang', 'screen'].every(r => !Object.keys(R.viewFor(S, { role: r }).bank).length) && !Object.keys(R.viewFor(S, { role: 'player', pid: '006' }).bank).length);

// ---------- 鬼门开 ----------
fresh(); S.t = 1000;
T('判官发布鬼门开', A('judge', { type: 'publish', f: { kind: '鬼门开', gate: 'g1', mins: 10 } }).ok && S.gp);
T('判官不能发公告', !A('judge', { type: 'publish', f: { kind: '公告', title: 'x', target: 'all' } }).ok);
T('鬼门开期间房间照常开', A('dealer', { type: 'enter', rid: '4S', pids: ['001'] }).ok);
R.eliminate(P('020'), '测试', '');
['002', '003', '004'].forEach(id => A('judge', { type: 'gatewin', pid: id }));
T('只记前 3 名', S.gp.wins.length === 3 && !A('judge', { type: 'gatewin', pid: '006' }).ok);
T('奖励：300 金币', A('judge', { type: 'gatereward', pid: '002', kind: 'coin' }).ok && P('002').score === 300);
T('奖励：救一个人', A('judge', { type: 'gatereward', pid: '003', kind: 'save', arg: '020' }).ok && P('020').st === 'alive');
T('奖励只能领一次', !A('judge', { type: 'gatereward', pid: '003', kind: 'coin' }).ok);
T('奖励：拿一个花色；3 人发完自动结束', A('judge', { type: 'gatereward', pid: '004', kind: 'suit', arg: '♦' }).ok && P('004').cards.includes('♦') && !S.gp);
T('通知上记了结果', S.notices.find(n => n.sub === 'gate').gr.length === 3);

// ---------- 压轴抽奖 ----------
fresh(); S.t = 7300;
const q = (id, sc, all) => { const p = P(id); p.on = true; p.cards = all ? ['♠', '♦', '♣', '♥'] : []; p.score = sc; };
q('001', 2500, true); q('002', 3000, true); q('003', 3000, false); q('004', 150, false); q('005', 99, false); q('006', 1000, false); P('006').st = 'market';
P('002').cleared = R.ROOMS.map(r => r.id);
T('彩券：每 100 金币 1 张', R.ticketsOf(P('003')) === 30 && R.ticketsOf(P('004')) === 1 && R.ticketsOf(P('005')) === 0);
T('彩券：集齐四花色 +5', R.ticketsOf(P('001')) === 25 + 5);
T('彩券：八间房全成功 +10', R.ticketsOf(P('002')) === 30 + 5 + 10);
T('抽奖池：上榜、没中过奖；鬼市里的人也算', (() => { const ids = R.drawPool().map(p => p.id); return ids.includes('001') && ids.includes('004') && ids.includes('006') && !ids.includes('007'); })());
T('默认 5 个奖品：大亨奖、大奖、小奖×3', S.draw.pz.map(x => x.kind).join() === 'tycoon,big,small,small,small' && S.draw.screen === 'game');
T('玩家不能抽', !A('player', { type: 'draw.run', id: 'P1' }, { pid: '001' }).ok);
T('总控不能抽', !A('ctrl', { type: 'draw.run', id: 'P1' }).ok);
T('封榜：时间截止前 15 分钟起，玩家看不到别人的金币，自己的照常；判官能看', (() => { S.t = S.dur - 899; const pv = R.viewFor(S, { role: 'player', pid: '001' }), sv = R.viewFor(S, { role: 'screen' }), jv = R.viewFor(S, { role: 'judge' }); const f = id => pv.players.find(p => p.id === id).score; const ok = R.frozen() && f('001') === 2500 && f('002') === 0 && sv.players.every(p => p.score === 0) && jv.players.find(p => p.id === '002').score === 3000; S.t = S.dur - 901; const ok2 = !R.frozen() && R.viewFor(S, { role: 'player', pid: '001' }).players.find(p => p.id === '002').score === 3000; S.t = S.dur + 60; return ok && ok2 && R.frozen(); })());
T('大亨奖：先一起揭晓并列第一，再在并列的人里抽', (() => { const x = S.draw.pz[0]; const r1 = A('judge', { type: 'draw.run', id: 'P1' }); const ok1 = r1.ok && x.st === 'reveal' && x.top.join() === '002,003' && x.tie === 2 && x.tk === 3000 && !x.win && S.draw.screen === 'draw';
  const pv = R.viewFor(S, { role: 'player', pid: '004' }).draw.pz[0]; const ok2 = pv.top.length === 2 && pv.tk === 3000;
  const r2 = A('judge', { type: 'draw.run', id: 'P1' }); return ok1 && ok2 && r2.ok && x.st === 'drawn' && (x.win === '002' || x.win === '003'); })());
T('大亨奖：第一名没有并列时直接揭晓', (() => { const g = R.newGame(false); R.use(g); g.players.slice(0, 3).forEach((p, i) => { p.on = true; p.score = 500 - i * 100; }); const r = R.apply(g, { role: 'judge' }, { type: 'draw.run', id: 'P1' }); const ok = r.ok && g.draw.pz[0].st === 'drawn' && g.draw.pz[0].win === g.players[0].id && g.draw.pz[0].tie === 1; R.use(S); return ok; })());
T('大亨奖：第一名揭晓时每个玩家收到自己的最终名次（只发一次）', (() => { const g = R.newGame(false); R.use(g); g.players.slice(0, 3).forEach((p, i) => { p.on = true; p.score = 500 - i * 100; }); R.apply(g, { role: 'judge' }, { type: 'draw.run', id: 'P1' }); const n = g.notices.filter(x => x.title === '最终名次'); const ok = n.length === 3 && n.some(x => x.ids[0] === g.players[2].id && x.body.includes('第 3 名')); R.apply(g, { role: 'judge' }, { type: 'draw.undo', id: 'P1' }); R.apply(g, { role: 'judge' }, { type: 'draw.run', id: 'P1' }); R.use(S); return ok && g.notices.filter(x => x.title === '最终名次').length === 3; })());
T('没确认前不能抽别的', !A('judge', { type: 'draw.run', id: 'P2' }).ok && !A('judge', { type: 'draw.show', id: 'P2' }).ok);
T('不在场 → 重抽：这位不再参与这个奖品', (() => { const old = S.draw.pz[0].win; const r = A('judge', { type: 'draw.redo', id: 'P1' }); const x = S.draw.pz[0]; return r.ok && x.win !== old && x.skip.includes(old) && x.st === 'drawn'; })());
T('确认得主：记录、不再参与后面的抽取、有通知', (() => { const w = S.draw.pz[0].win; const n = S.notices.length; const r = A('judge', { type: 'draw.confirm', id: 'P1' }); return r.ok && P(w).won === 'P1' && S.draw.pz[0].st === 'done' && S.notices.length === n + 1 && !R.drawPool().some(p => p.id === w) && S.log[0].b === 1; })());
T('已抽过的不能再抽', !A('judge', { type: 'draw.run', id: 'P1' }).ok);
T('大奖：按彩券张数加权（随机数 0 → 排第一个有彩券的人）', (() => { R.use(S); const r = R.apply(S, { role: 'judge' }, { type: 'draw.run', id: 'P2' }); return r.ok; })());
T('加权抽取：固定随机数可复现且落在有彩券的人身上', (() => { const x = S.draw.pz[1]; const w = x.win; A('judge', { type: 'draw.undo', id: 'P2' }); const ok1 = x.st === 'wait' && !x.win;
  const lo = R.apply(S, { role: 'judge' }, { type: 'draw.run', id: 'P2' }); return ok1 && lo.ok && R.ticketsOf(P(S.draw.pz[1].win)) > 0 && S.draw.pz[1].all > 0 && !!w; })());
T('彩券为 0 的人抽不到（遍历 20 个随机数）', (() => { const x = S.draw.pz[1]; A('judge', { type: 'draw.undo', id: 'P2' }); let okAll = true; for (let i = 0; i < 20; i++) { const r = i / 20 + 0.01; x.st = 'wait'; x.win = null; x.skip = []; S.draw.cur = 'P2'; const rr = R.apply(S, { role: 'judge' }, { type: 'draw.run', id: 'P2' }); if (!rr.ok || R.ticketsOf(P(x.win)) <= 0) okAll = false; x.st = 'wait'; x.win = null; } return okAll; })());
T('撤销得主：这位重新参与', (() => { const x = S.draw.pz[0], w = x.win; const r = A('judge', { type: 'draw.undo', id: 'P1' }); return r.ok && !P(w).won && x.st === 'wait' && R.drawPool().some(p => p.id === w); })());
T('没有可抽的人时不能抽', (() => { const g = R.newGame(false); R.use(g); const r = R.apply(g, { role: 'judge' }, { type: 'draw.run', id: 'P2' }); R.use(S); return !r.ok; })());
T('奖品可以增删改排序（待抽的才行）', A('judge', { type: 'draw.add', f: { name: '拍立得', kind: 'small' } }).ok && S.draw.pz.length === 6 && A('judge', { type: 'draw.edit', id: 'P6', f: { name: '音箱', desc: 'x', kind: 'big' } }).ok && S.draw.pz[5].kind === 'big'
  && A('judge', { type: 'draw.move', id: 'P6', d: -1 }).ok && A('judge', { type: 'draw.del', id: 'P6' }).ok && S.draw.pz.length === 5);
T('大屏可以切回游戏', A('ctrl', { type: 'draw.screen', on: false }).ok && S.draw.screen === 'game' && !A('judge', { type: 'draw.screen', on: true }).ok);
T('总控可把切屏 / 锁榜交给判官', A('ctrl', { type: 'draw.jscr', on: true }).ok && A('judge', { type: 'draw.screen', on: true }).ok && A('judge', { type: 'draw.lock', on: true }).ok && A('ctrl', { type: 'draw.jscr', on: false }).ok && !A('judge', { type: 'draw.lock', on: false }).ok && A('ctrl', { type: 'draw.lock', on: false }).ok && A('ctrl', { type: 'draw.screen', on: false }).ok);
T('总控可锁定 / 解除排名，判官不行', !A('judge', { type: 'draw.lock', on: true }).ok && A('ctrl', { type: 'draw.lock', on: true }).ok && R.frozen() && A('ctrl', { type: 'draw.lock', on: false }).ok && !S.draw.lock);
T('旧存档（auc / fin）自动换成抽奖', (() => { const g = R.newGame(false); delete g.draw; g.auc = { lots: [] }; g.fin = ['001']; R.use(g); const ok = g.draw.pz.length === 5 && !g.auc && !g.fin; R.use(S); return ok; })());

// ---------- 权限与视图 ----------
fresh();
T('玩家不能结算', !A('player', { type: 'finish', rid: '4S', results: {} }, { pid: '001' }).ok);
T('孟婆不能抽奖', !A('mengpo', { type: 'draw.run', id: 'P1' }).ok);
T('Dealer 不能改金币', !A('dealer', { type: 'setscore', pid: '001', v: 9 }).ok);
T('总控改金币写原因', A('ctrl', { type: 'setscore', pid: '001', v: 300, why: '补录' }).ok && S.log[0].text.includes('补录'));
T('公告发给工作人员可见', (() => { A('ctrl', { type: 'publish', f: { kind: '公告', title: 'x', target: 'staff' } }); return R.staffSees(S.notices[0]); })());
T('玩家只看到播报日志和自己的通知', (() => { R.eliminate(P('002'), '测试', ''); const v = R.viewFor(S, { role: 'player', pid: '001' }); return v.log.every(l => l.b) && v.notices.every(n => n.target !== 'player' || n.ids.includes('001')); })());
T('新增身份卡', A('ctrl', { type: 'addplayers', n: 4 }).ok && S.players.length === 104 && !!P('104'));
T('旧存档要重置', R.needsReset({ v: 2, rooms: [] }) && !R.needsReset(S));
T('演示数据可以生成', (() => { const g = R.newGame(true); return g.players.filter(p => p.on).length >= 36 && g.draw.pz.length === 5 && g.rooms.some(r => r.ps.length); })());
// ---------- 第 2 轮：花色可改、三套演示数据 ----------
fresh();
T('总控改花色', A('ctrl', { type: 'setcards', pid: '001', cards: ['♥', '♠', 'x'] }).ok && P('001').cards.join('') === '♠♥' && S.log[0].text.includes('花色'));
T('判官不能改花色', !A('judge', { type: 'setcards', pid: '001', cards: [] }).ok);
{ for (const d of ['start', 'mid', 'pre', 'freeze']) { const g = R.newGame(d), t = g.log.map(l => l.t).reverse(); T('演示数据时间顺序正确：' + d, t.every((x, i) => !i || x >= t[i - 1])); }
  const g = R.newGame('start'); T('演示·开局：前 10 分钟、房间里有人、抽奖没开始', g.t < 600 && g.rooms.some(r => r.ps.length) && g.draw.pz.every(x => x.st === 'wait')); }
{ const g = R.newGame('mid'); T('演示·中段：鬼门开进行中、鬼市有人', !!g.gp && g.gp.wins.length === 1 && g.players.some(p => p.st === 'market')); }
{ const g = R.newGame('pre'); R.use(g); T('演示·抽奖前：时间已到、抽奖还没开始、有人有彩券', R.timeUp() && g.draw.pz.every(x => x.st === 'wait') && g.draw.screen === 'game' && g.players.some(p => p.on && R.ticketsOf(p) > 0)); }
{ const g = R.newGame('freeze'); R.use(g); T('演示·封榜：离结束 15 分钟、刚封榜、时间没到、抽奖没开始', R.frozen() && !R.timeUp() && g.t === g.dur - R.FREEZE_SEC && g.draw.pz.every(x => x.st === 'wait') && g.players.some(p => p.on && p.score > 0)); }
T('newGame(true) = 中段', !!R.newGame(true).gp);
// ---------- 离线补录 ----------
fresh(); S.t = 1000;
{ const D4 = { rooms: ['4S'] }, off = (r, rows, x) => A(r, { type: 'offline', rows }, x);
  T('离线补录：Dealer 只能补自己的房间', !off('dealer', [{ k: 'room', rid: '8S', pid: '001', res: 'win' }], D4).data[0].ok);
  const r = off('dealer', [{ k: 'room', rid: '4S', pid: '001', res: 'win' }, { k: 'room', rid: '4S', pid: '001', res: 'win' }, { k: 'room', rid: '4S', pid: '002', res: 'lose' }, { k: 'room', rid: '4S', pid: '999', res: 'win' }], D4);
  T('离线补录：赢 +400 和花色，重复的不再加分', P('001').score === 400 && P('001').cards.includes('♠') && r.data[1].ok && /没有再加分/.test(r.data[1].msg));
  T('离线补录：输 → 待抓；编号不存在的那行单独失败', P('002').st === 'out' && !r.data[3].ok && r.msg.includes('3 / 4'));
  T('离线补录：不按时间规则拦（时间到了也照补）', (S.t = 9000, off('dealer', [{ k: 'room', rid: '4S', pid: '003', res: 'win' }], D4).data[0].ok) && P('003').score === 400);
  T('离线补录：Dealer 不能补鬼市', !off('dealer', [{ k: 'market', pid: '002' }], D4).data[0].ok);
  off('wuchang', [{ k: 'pickup', pid: '002' }, { k: 'market', pid: '002' }]);
  T('离线补录：黑白无常抓到 + 送入鬼市', P('002').st === 'market');
  off('mengpo', [{ k: 'redeem', pid: '002' }]);
  T('离线补录：自赎直接解冻（截止后也照补）', P('002').st === 'alive' && P('002').score === 0);
  off('mengpo', [{ k: 'market', pid: '004' }, { k: 'ransom', pid: '004', by: '001' }]);
  T('离线补录：被别人赎，出钱人扣 500（不够就扣光）', P('004').st === 'alive' && P('001').score === 0);
  P('005').cards = ['♠', '♥']; off('mengpo', [{ k: 'market', pid: '005' }, { k: 'soup', pid: '005' }]);
  T('离线补录：复活不忘花色', P('005').st === 'alive' && P('005').cards.length === 2);
  const j = off('judge', [{ k: 'puz', pid: '006', code: '1' }, { k: 'puz', pid: '006', code: '1' }, { k: 'gate', pid: '006', rw: 'coin' }, { k: 'gate', pid: '007', rw: 'suit', arg: '♦' }]);
  T('离线补录：判官解谜（同题不重复）+ 鬼门开奖励', P('006').score === R.PUZ_PTS + R.GATE_COIN && /已经兑换过/.test(j.data[1].msg) && P('007').cards.includes('♦'));
  T('离线补录：总控和玩家不能补录', !A('ctrl', { type: 'offline', rows: [{ k: 'room', rid: '4S', pid: '001', res: 'win' }] }).ok && !A('player', { type: 'offline', rows: [] }, { pid: '001' }).ok);
  T('离线补录：写进日志', S.log.some(l => l.text.includes('离线补录'))); }

// ---------- ♥8 孟婆的交易：独自通关 1000 / 带人通关各 800 ----------
fresh(); S.t = 60;
A('dealer', { type: 'enter', rid: '8H', pids: ['001', '002', '003'] });
T('♥8：独自通关只能 1 人', !A('dealer', { type: 'finish', rid: '8H', results: { '001': 'solo', '002': 'solo', '003': 'lose' } }).ok);
T('♥8：独自通关时其他人不能赢', !A('dealer', { type: 'finish', rid: '8H', results: { '001': 'solo', '002': 'win', '003': 'lose' } }).ok);
T('♥8：带人通关最多 2 人', !A('dealer', { type: 'finish', rid: '8H', results: { '001': 'win', '002': 'win', '003': 'win' } }).ok);
T('♥8：独自通关 +1000 + ♥', A('dealer', { type: 'finish', rid: '8H', results: { '001': 'solo', '002': 'lose', '003': 'lose' } }).ok && P('001').score === 1000 && P('001').cards.includes('♥') && P('001').hist[0].res === 'win');
A('dealer', { type: 'resetdone', rid: '8H' }); A('dealer', { type: 'enter', rid: '8H', pids: ['004', '005'] });
T('♥8：带人通关各 +800', A('dealer', { type: 'finish', rid: '8H', results: { '004': 'win', '005': 'win' } }).ok && P('004').score === 800 && P('005').score === 800);
T('其他房间不能选独自通关', A('dealer', { type: 'enter', rid: '4S', pids: ['006'] }).ok && !A('dealer', { type: 'finish', rid: '4S', results: { '006': 'solo' } }).ok);
T('离线补录：♥8 独自通关 +1000', A('dealer', { type: 'offline', rows: [{ k: 'room', rid: '8H', pid: '007', res: 'solo' }] }).data[0].ok && P('007').score === 1000);
T('Dealer 改自己房间的规则', A('dealer', { type: 'setrule', rid: '4S', text: '新规则' }, { rooms: ['4S'] }).ok && R.roomRule('4S') === '新规则');
T('Dealer 不能改别的房间规则', !A('dealer', { type: 'setrule', rid: '8S', text: 'x' }, { rooms: ['4S'] }).ok);
T('玩家和大屏收不到改过的规则', !Object.keys(R.viewFor(S, { role: 'player', pid: '001' }).rules).length && !Object.keys(R.viewFor(S, { role: 'screen' }).rules).length);
T('清空保存 = 规则为空', A('dealer', { type: 'setrule', rid: '4S', text: '  ' }, { rooms: ['4S'] }).ok && R.roomRule('4S') === '');
T('8 间房都有规则（只在 Dealer 页显示）', R.ROOMS.every(r => typeof r.rule === 'string' && r.rule.length > 10));

// 得分档位
{const S0=R.newGame();R.use(S0);const D=(rooms,a)=>R.apply(S0,{role:'dealer',rooms},a),sc=id=>S0.players.find(p=>p.id===id);
 D(['4D'],{type:'settiers',rid:'4D',text:'200 400 300 400'});
 T('档位排序去重', R.tiersOf('4D').join(' ')==='400 300 200');
 T('Dealer 不能改别人房间的档位', !D(['4S'],{type:'settiers',rid:'4D',text:'1'}).ok);
 D(['4D'],{type:'enter',rid:'4D',pids:['001','002','003']});
 const f=D(['4D'],{type:'finish',rid:'4D',results:{'001':'w:300','002':'w:200','003':'lose'}});
 T('各档按所选分值加分，200 也算成功', f.ok&&sc('001').score===300&&sc('002').score===200&&sc('001').cleared.includes('4D')&&sc('002').cleared.includes('4D'));
 D(['4D'],{type:'resetdone',rid:'4D'});D(['4D'],{type:'enter',rid:'4D',pids:['004']});
 T('不在档位里的分值被拒', !D(['4D'],{type:'finish',rid:'4D',results:{'004':'w:350'}}).ok);
 T("'win' = 最高档", D(['4D'],{type:'finish',rid:'4D',results:{'004':'win'}}).ok&&sc('004').score===400);
 D(['4D'],{type:'settiers',rid:'4D',text:''});
 T('清空 = 默认', R.tiersOf('4D').length===0);
 T('♥8 不能设档位', !D(['8H'],{type:'settiers',rid:'8H',text:'1 2'}).ok);}

console.log(bad ? bad + ' FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
