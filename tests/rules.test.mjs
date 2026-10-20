// Pure rules tests (no server): v3 个人赛规则。
import * as R from '../shared/rules.js';
let bad = 0; const T = (n, c) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (!c) bad++; };
let S = R.newGame(false);
const A = (r, a, extra) => R.apply(S, { role: r, ...(extra || {}) }, a);
const P = id => S.players.find(p => p.id === id);
const fresh = () => { S = R.newGame(false); R.use(S); S.now = 1e12; };

// ---------- 身份卡 ----------
fresh();
T('56 张身份卡，编号 001–056', S.players.length === 56 && S.players[0].id === '001' && S.players[55].id === '056');
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
T('输：进入待接，不扣冥币', P('009').st === 'out' && P('009').score === 0);
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
T('无常接到', A('wuchang', { type: 'pickup', pid: '001' }).ok);
T('无常送入，自己不能确认', A('wuchang', { type: 'checkin', pid: '001' }).ok && !A('wuchang', { type: 'confirm', pid: '001' }).ok);
T('孟婆确认后进鬼市，冥币冻结（网站不记筹码）', A('mengpo', { type: 'confirm', pid: '001' }).ok && P('001').st === 'market' && P('001').score === 1000 && !('chips' in P('001')));
T('孟婆不能记筹码（实体筹码）', !A('mengpo', { type: 'chips', pid: '001', v: 650 }).ok);
T('自赎：直接解冻，不带出冥币', A('mengpo', { type: 'redeem', pid: '001' }).ok && P('001').st === 'alive' && P('001').score === 1000);
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
P('002').score = 400;
T('赎人：钱不够不行', !A('mengpo', { type: 'ransom', pid: '001', by: '002' }).ok);
P('002').score = 800;
T('赎人：在场的人花 500 冥币', A('mengpo', { type: 'ransom', pid: '001', by: '002' }).ok && P('002').score === 300 && P('001').st === 'alive' && P('001').score === 1000);
R.eliminate(P('003'), '测试', ''); A('wuchang', { type: 'checkin', pid: '003' }); A('mengpo', { type: 'confirm', pid: '003' });
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
T('孟婆汤：免费复活，随机忘掉一个花色', R.soup('001', 0).ok && P('001').st === 'alive' && P('001').cards.length === 1 && P('001').cards[0] === '♥');
T('忘掉的花色可以再挑战同花色房间', !P('001').cleared.includes('4S') && P('001').cleared.includes('4H'));
S.t = 7200 + 10; R.eliminate(P('004'), '测试', ''); A('wuchang', { type: 'checkin', pid: '004' });
T('截止后失败的人照常收进鬼市', A('mengpo', { type: 'confirm', pid: '004' }).ok && P('004').st === 'market');
S.t = 7200 + 900;
T('截止 15 分钟后停止复活名额', !A('mengpo', { type: 'redeem', pid: '003' }).ok);

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
T('奖励：300 冥币', A('judge', { type: 'gatereward', pid: '002', kind: 'coin' }).ok && P('002').score === 300);
T('奖励：救一个人', A('judge', { type: 'gatereward', pid: '003', kind: 'save', arg: '020' }).ok && P('020').st === 'alive');
T('奖励只能领一次', !A('judge', { type: 'gatereward', pid: '003', kind: 'coin' }).ok);
T('奖励：拿一个花色；3 人发完自动结束', A('judge', { type: 'gatereward', pid: '004', kind: 'suit', arg: '♦' }).ok && P('004').cards.includes('♦') && !S.gp);
T('通知上记了结果', S.notices.find(n => n.sub === 'gate').gr.length === 3);

// ---------- 晋级资格与拍卖 ----------
fresh(); S.t = 7300;
const q = (id, sc) => { const p = P(id); p.on = true; p.cards = ['♠', '♦', '♣', '♥']; p.score = sc; };
q('001', 2500); q('002', 3000); q('003', 2000); q('004', 1999); P('005').on = true;
T('资格条件', R.qualifies(P('001')) && R.qualifies(P('003')) && !R.qualifies(P('004')) && R.finalMiss(P('004'))[0].includes('1999'));
T('还没人晋级不能开拍', (() => { A('judge', { type: 'auc.add', f: { name: '盲盒', start: 100 } }); return !A('judge', { type: 'auc.open', id: 'L1', secs: 60 }).ok; })());
T('一键晋级：只晋级符合条件的人', A('ctrl', { type: 'finalall' }).ok && S.fin.length === 3 && !S.fin.includes('004'));
T('总控可以手动加人', A('ctrl', { type: 'final', pid: '004', on: true }).ok && S.fin.includes('004'));
T('开拍（判官输入倒计时），大屏切到拍卖', A('judge', { type: 'auc.open', id: 'L1', secs: 60 }).ok && S.auc.screen === 'auction' && S.auc.cur === 'L1');
const B = (pid, v) => A('player', { type: 'bid', id: 'L1', v }, { pid });
T('没资格不能出价', !B('005', 200).ok);
T('低于起拍价不行', !B('001', 50).ok);
T('超过余额不行', !B('003', 2001).ok);
S.now += 1000; T('出价', B('001', 800).ok);
S.now += 1000; T('同价先出者得：003 后出 800', B('003', 800).ok);
S.now += 1000; B('002', 500); B('002', 600);
T('改价以最后一次为准', S.auc.lots[0].bids['002'].v === 600);
T('玩家看不到别人的出价，只看到人数', (() => { const v = R.viewFor(S, { role: 'player', pid: '002' }); const l = v.auc.lots[0]; return l.nb === 3 && Object.keys(l.bids).join() === '002'; })());
T('大屏也看不到金额', Object.keys(R.viewFor(S, { role: 'screen' }).auc.lots[0].bids).length === 0);
T('暂停时不能出价', A('judge', { type: 'auc.time', op: 'pause' }).ok && !B('004', 300).ok);
S.now += 999999;
T('暂停时倒计时不走', R.lotLeft(S.auc.lots[0]) > 50000 && A('judge', { type: 'auc.time', op: 'resume' }).ok);
T('+30 秒', (() => { const e = S.auc.lots[0].end; A('judge', { type: 'auc.time', op: 'add' }); return S.auc.lots[0].end === e + 30000; })());
T('出价中不能揭晓', !A('judge', { type: 'auc.reveal' }).ok);
S.now = S.auc.lots[0].end + 1;
T('倒计时到点自动截止', R.lotState(S.auc.lots[0]) === 'closed' && !B('004', 300).ok);
T('揭晓：同价先出价者得，扣款', A('judge', { type: 'auc.reveal' }).ok && S.auc.lots[0].win === '001' && P('001').score === 1700 && P('001').won === 'L1');
T('作废得主（不在场）→ 顺延给 003，001 退款', A('judge', { type: 'auc.void' }).ok && S.auc.lots[0].win === '003' && P('001').score === 2500 && !P('001').won && P('003').score === 1200);
A('judge', { type: 'auc.add', f: { name: '大奖', start: 0, big: true } });
T('上一件已成交后可以开下一件', A('judge', { type: 'auc.open', id: 'L2', secs: 30 }).ok);
T('拍到过的人不能再出价', !A('player', { type: 'bid', id: 'L2', v: 100 }, { pid: '003' }).ok);
T('判官可以代出价', A('judge', { type: 'bid', id: 'L2', pid: '004', v: 100 }).ok);
T('重拍：清空出价回到待拍', A('judge', { type: 'auc.redo', id: 'L2' }).ok && S.auc.lots[1].st === 'wait' && !Object.keys(S.auc.lots[1].bids).length);
A('judge', { type: 'auc.open', id: 'L2', secs: 30 }); A('judge', { type: 'auc.time', op: 'close' });
T('没人出价 → 流拍', A('judge', { type: 'auc.reveal' }).ok && S.auc.lots[1].st === 'pass');
T('重拍已成交的会退款', (() => { const s = P('003').score; A('judge', { type: 'auc.redo', id: 'L1' }); return P('003').score === s + 800 && !P('003').won; })());
T('大屏可以切回游戏', A('judge', { type: 'auc.screen', on: false }).ok && S.auc.screen === 'game');
A('judge', { type: 'auc.add', f: { name: '测试3' } }); A('judge', { type: 'auc.open', id: 'L3', secs: 30 }); A('judge', { type: 'auc.time', op: 'close' });
A('judge', { type: 'auc.add', f: { name: '测试4' } });
T('已截止没揭晓时不能切换显示别的拍品', !A('judge', { type: 'auc.show', id: 'L4' }).ok && S.auc.cur === 'L3');
T('揭晓后可以切换', A('judge', { type: 'auc.reveal' }).ok && A('judge', { type: 'auc.show', id: 'L4' }).ok && S.auc.cur === 'L4');

// ---------- 权限与视图 ----------
fresh();
T('玩家不能结算', !A('player', { type: 'finish', rid: '4S', results: {} }, { pid: '001' }).ok);
T('孟婆不能开拍', !A('mengpo', { type: 'auc.open', id: 'L1', secs: 60 }).ok);
T('Dealer 不能改冥币', !A('dealer', { type: 'setscore', pid: '001', v: 9 }).ok);
T('总控改冥币写原因', A('ctrl', { type: 'setscore', pid: '001', v: 300, why: '补录' }).ok && S.log[0].text.includes('补录'));
T('公告发给工作人员可见', (() => { A('ctrl', { type: 'publish', f: { kind: '公告', title: 'x', target: 'staff' } }); return R.staffSees(S.notices[0]); })());
T('玩家只看到播报日志和自己的通知', (() => { R.eliminate(P('002'), '测试', ''); const v = R.viewFor(S, { role: 'player', pid: '001' }); return v.log.every(l => l.b) && v.notices.every(n => n.target !== 'player' || n.ids.includes('001')); })());
T('新增身份卡', A('ctrl', { type: 'addplayers', n: 4 }).ok && S.players.length === 60 && !!P('060'));
T('旧存档要重置', R.needsReset({ v: 2, rooms: [] }) && !R.needsReset(S));
T('演示数据可以生成', (() => { const g = R.newGame(true); return g.players.filter(p => p.on).length >= 36 && g.auc.lots.length === 5 && g.rooms.some(r => r.ps.length); })());
// ---------- 第 2 轮：花色可改、三套演示数据 ----------
fresh();
T('总控改花色', A('ctrl', { type: 'setcards', pid: '001', cards: ['♥', '♠', 'x'] }).ok && P('001').cards.join('') === '♠♥' && S.log[0].text.includes('花色'));
T('判官不能改花色', !A('judge', { type: 'setcards', pid: '001', cards: [] }).ok);
{ for (const d of ['start', 'mid', 'pre', 'final']) { const g = R.newGame(d), t = g.log.map(l => l.t).reverse(); T('演示数据时间顺序正确：' + d, t.every((x, i) => !i || x >= t[i - 1])); }
  const g = R.newGame('start'); T('演示·开局：前 10 分钟、房间里有人、没有晋级名单', g.t < 600 && g.rooms.some(r => r.ps.length) && !g.fin.length); }
{ const g = R.newGame('mid'); T('演示·中段：鬼门开进行中、鬼市有人', !!g.gp && g.gp.wins.length === 1 && g.players.some(p => p.st === 'market')); }
{ const g = R.newGame('pre'); R.use(g); T('演示·拍卖前：时间已到、还没人晋级、符合条件的人已经够了', R.timeUp() && g.fin.length === 0 && g.players.some(R.qualifies)); }
{ const g = R.newGame('final'); R.use(g); T('演示·晋级与拍卖：时间已到、已晋级、第 1 件成交、大屏在拍卖', R.timeUp() && g.fin.length >= 6 && g.auc.lots[0].st === 'done' && g.auc.cur === 'L2' && g.auc.screen === 'auction' && g.fin.every(id => R.qualifies(g.players.find(p => p.id === id)))); }
T('newGame(true) = 中段', !!R.newGame(true).gp);
// ---------- 离线补录 ----------
fresh(); S.t = 1000;
{ const D4 = { rooms: ['4S'] }, off = (r, rows, x) => A(r, { type: 'offline', rows }, x);
  T('离线补录：Dealer 只能补自己的房间', !off('dealer', [{ k: 'room', rid: '8S', pid: '001', res: 'win' }], D4).data[0].ok);
  const r = off('dealer', [{ k: 'room', rid: '4S', pid: '001', res: 'win' }, { k: 'room', rid: '4S', pid: '001', res: 'win' }, { k: 'room', rid: '4S', pid: '002', res: 'lose' }, { k: 'room', rid: '4S', pid: '999', res: 'win' }], D4);
  T('离线补录：赢 +400 和花色，重复的不再加分', P('001').score === 400 && P('001').cards.includes('♠') && r.data[1].ok && /没有再加分/.test(r.data[1].msg));
  T('离线补录：输 → 待接；编号不存在的那行单独失败', P('002').st === 'out' && !r.data[3].ok && r.msg.includes('3 / 4'));
  T('离线补录：不按时间规则拦（时间到了也照补）', (S.t = 9000, off('dealer', [{ k: 'room', rid: '4S', pid: '003', res: 'win' }], D4).data[0].ok) && P('003').score === 400);
  T('离线补录：Dealer 不能补鬼市', !off('dealer', [{ k: 'market', pid: '002' }], D4).data[0].ok);
  off('wuchang', [{ k: 'pickup', pid: '002' }, { k: 'market', pid: '002' }]);
  T('离线补录：黑白无常接到 + 送入鬼市', P('002').st === 'market');
  off('mengpo', [{ k: 'redeem', pid: '002' }]);
  T('离线补录：自赎直接解冻（截止后也照补）', P('002').st === 'alive' && P('002').score === 0);
  off('mengpo', [{ k: 'market', pid: '004' }, { k: 'ransom', pid: '004', by: '001' }]);
  T('离线补录：被别人赎，出钱人扣 500（不够就扣光）', P('004').st === 'alive' && P('001').score === 0);
  P('005').cards = ['♠', '♥']; off('mengpo', [{ k: 'market', pid: '005' }, { k: 'soup', pid: '005' }]);
  T('离线补录：孟婆汤忘掉一个花色', P('005').st === 'alive' && P('005').cards.length === 1);
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
T('房间号与地图一致', ['4S:173', '8S:B02', '4H:B51', '8H:B50', '4C:B75', '8C:150', '4D:151', '8D:B73'].every(x => { const [id, loc] = x.split(':'); return R.ROOMS.find(r => r.id === id).loc === loc; }));
console.log(bad ? bad + ' FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
