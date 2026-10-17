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
T('起始房间轮流分配，每间 7 张', R.ROOMS.every(r => S.players.filter(p => p.start === r.id).length === 7) && P('001').start === '4S' && P('009').start === '4S' && P('002').start === '8S');
T('没登录的人不进排行', R.ranking().length === 0);
T('玩家取昵称', A('player', { type: 'nick', nick: '阿鬼' }, { pid: '001' }).ok && P('001').nick === '阿鬼' && P('001').on);
T('昵称不能重复', !A('player', { type: 'nick', nick: '阿鬼' }, { pid: '002' }).ok);
T('玩家只能改自己的昵称', A('player', { type: 'nick', pid: '003', nick: '小白' }, { pid: '002' }).ok && P('002').nick === '小白' && !P('003').nick);
T('总控能改别人的昵称', A('ctrl', { type: 'nick', pid: '003', nick: '无常' }).ok && P('003').nick === '无常');

// ---------- 房间 ----------
fresh(); S.t = 60;
T('前 10 分钟只能进起始房间', !A('dealer', { type: 'enter', rid: '8S', pids: ['001'] }).ok);
T('可以一次放多人入场', A('dealer', { type: 'enter', rid: '4S', pids: ['001', '009', '017'] }).ok && S.rooms[0].ps.length === 3 && S.rooms[0].st === 'play');
T('入场即算参与（进排行）', P('009').on);
T('已在房间里不能再进', !A('dealer', { type: 'enter', rid: '4S', pids: ['001'] }).ok);
T('Dealer 只能管自己的房间', !A('dealer', { type: 'enter', rid: '8S', pids: ['002'] }, { rooms: ['4S'] }).ok);
T('结算要给每人选结果', !A('dealer', { type: 'finish', rid: '4S', results: { '001': 'win' } }).ok);
const r1 = A('dealer', { type: 'finish', rid: '4S', results: { '001': 'win', '009': 'lose', '017': 'leave' } });
T('结算成功', r1.ok);
T('赢：+400 + 花色', P('001').score === 400 && P('001').cards.includes('♠') && P('001').cleared.includes('4S'));
T('输：进入待接，不扣冥币', P('009').st === 'out' && P('009').score === 0);
T('离开：不算输赢', P('017').st === 'alive' && P('017').score === 0 && !P('017').cleared.length);
T('结算后房间重置中，不能入场', S.rooms[0].st === 'reset' && !A('dealer', { type: 'enter', rid: '4S', pids: ['025'] }).ok);
A('dealer', { type: 'resetdone', rid: '4S' });
T('每人每间只能成功一次', !A('dealer', { type: 'enter', rid: '4S', pids: ['001'] }).ok && A('dealer', { type: 'enter', rid: '4S', pids: ['017'] }).ok);
T('移出房间不计结果', A('dealer', { type: 'kick', rid: '4S', pid: '017' }).ok && !P('017').inRoom && S.rooms[0].st === 'open' && P('017').hist.every(h => h.res !== null));
S.t = 700;
T('10 分钟后可以进任意房间', A('dealer', { type: 'enter', rid: '8D', pids: ['001'] }).ok);
A('dealer', { type: 'finish', rid: '8D', results: { '001': 'win' } }); A('dealer', { type: 'resetdone', rid: '8D' });
T('困难房 +800', P('001').score === 1200 && P('001').cards.length === 2);
A('ctrl', { type: 'setcap', v: 2 });
T('房间容量', !A('dealer', { type: 'enter', rid: '4H', pids: ['003', '011', '019'] }).ok && A('dealer', { type: 'enter', rid: '4H', pids: ['003', '011'] }).ok && !A('dealer', { type: 'enter', rid: '4H', pids: ['019'] }).ok);
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
T('孟婆确认后领 200 筹码', A('mengpo', { type: 'confirm', pid: '001' }).ok && P('001').st === 'market' && P('001').chips === 200);
T('筹码不够不能自赎', !A('mengpo', { type: 'redeem', pid: '001' }).ok);
T('孟婆记筹码', A('mengpo', { type: 'chips', pid: '001', v: 650 }).ok);
T('自赎：带出最多 100', A('mengpo', { type: 'redeem', pid: '001' }).ok && P('001').st === 'alive' && P('001').score === 1100 && P('001').chips === 0);
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
A('mengpo', { type: 'chips', pid: '001', v: 520 }); A('mengpo', { type: 'redeem', pid: '001' });
T('自赎：超出不到 100 就带出超出部分', P('001').score === 1120);
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
P('002').score = 499;
T('赎人：钱不够不行', !A('mengpo', { type: 'ransom', pid: '001', by: '002' }).ok);
P('002').score = 800;
T('赎人：存活的人花 500', A('mengpo', { type: 'ransom', pid: '001', by: '002' }).ok && P('002').score === 300 && P('001').st === 'alive' && P('001').score === 1120);
R.eliminate(P('002'), '测试', ''); A('wuchang', { type: 'checkin', pid: '002' }); A('mengpo', { type: 'confirm', pid: '002' });
T('鬼市里的人不能出钱赎人', (() => { R.eliminate(P('003'), '测试', ''); A('wuchang', { type: 'checkin', pid: '003' }); A('mengpo', { type: 'confirm', pid: '003' }); P('002').score = 900; return !A('mengpo', { type: 'ransom', pid: '003', by: '002' }).ok; })());
R.eliminate(P('001'), '测试', ''); A('wuchang', { type: 'checkin', pid: '001' }); A('mengpo', { type: 'confirm', pid: '001' });
T('还有筹码不能喝孟婆汤', !A('mengpo', { type: 'soup', pid: '001' }).ok);
A('mengpo', { type: 'chips', pid: '001', v: 0 });
T('孟婆汤：免费复活，随机忘掉一个花色', R.soup('001', 0).ok && P('001').st === 'alive' && P('001').cards.length === 1 && P('001').cards[0] === '♥');
T('忘掉的花色可以再挑战同花色房间', !P('001').cleared.includes('4S') && P('001').cleared.includes('4H'));
S.t = 7200 + 10; R.eliminate(P('004'), '测试', ''); A('wuchang', { type: 'checkin', pid: '004' });
T('截止后失败的人不再收进鬼市', !A('mengpo', { type: 'confirm', pid: '004' }).ok);
S.t = 7200 + 900;
T('截止 15 分钟后停止复活名额', (() => { A('mengpo', { type: 'chips', pid: '003', v: 600 }); return !A('mengpo', { type: 'redeem', pid: '003' }).ok; })());

// ---------- 解谜题 ----------
fresh(); S.t = 1000;
T('解谜 +100', A('judge', { type: 'puz', pid: '005', zid: 'z1' }).ok && P('005').score === 100);
T('同一题不能重复', !A('judge', { type: 'puz', pid: '005', zid: 'z1' }).ok);
['z2', 'z3', 'z4'].forEach(z => A('judge', { type: 'puz', pid: '005', zid: z }));
T('最多 400', P('005').score === 400 && !A('judge', { type: 'puz', pid: '005', zid: 'z5' }).ok);
T('撤销扣回', A('judge', { type: 'puzundo', pid: '005', key: 'z4' }).ok && P('005').score === 300 && A('judge', { type: 'puz', pid: '005', title: '自定义题' }).ok);

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

// ---------- 压轴资格与拍卖 ----------
fresh(); S.t = 7300;
const q = (id, sc) => { const p = P(id); p.on = true; p.cards = ['♠', '♦', '♣', '♥']; p.score = sc; };
q('001', 2500); q('002', 3000); q('003', 2000); q('004', 1999); P('005').on = true;
T('资格条件', R.qualifies(P('001')) && R.qualifies(P('003')) && !R.qualifies(P('004')) && R.finalMiss(P('004'))[0].includes('1999'));
T('锁定前不能开拍', (() => { A('judge', { type: 'auc.add', f: { name: '盲盒', start: 100 } }); return !A('judge', { type: 'auc.open', id: 'L1', secs: 60 }).ok; })());
T('锁定资格名单', A('ctrl', { type: 'lockfinal' }).ok && S.fin.length === 3 && !S.fin.includes('004'));
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

// ---------- 权限与视图 ----------
fresh();
T('玩家不能结算', !A('player', { type: 'finish', rid: '4S', results: {} }, { pid: '001' }).ok);
T('孟婆不能开拍', !A('mengpo', { type: 'auc.open', id: 'L1', secs: 60 }).ok);
T('Dealer 不能改冥币', !A('dealer', { type: 'setscore', pid: '001', v: 9 }).ok);
T('总控改冥币写原因', A('ctrl', { type: 'setscore', pid: '001', v: 300, why: '补录' }).ok && S.log[0].text.includes('补录'));
T('公告发给工作人员可见', (() => { A('ctrl', { type: 'publish', f: { kind: '公告', title: 'x', target: 'staff' } }); return R.staffSees(S.notices[0]); })());
T('玩家只看到播报日志和自己的通知', (() => { R.eliminate(P('002'), '测试', ''); const v = R.viewFor(S, { role: 'player', pid: '001' }); return v.log.every(l => l.b) && v.notices.every(n => n.target !== 'player' || n.ids.includes('001')); })());
T('新增身份卡', A('ctrl', { type: 'addplayers', n: 4 }).ok && S.players.length === 60 && P('060').start === '8H');
T('旧存档要重置', R.needsReset({ v: 2, rooms: [] }) && !R.needsReset(S));
T('演示数据可以生成', (() => { const g = R.newGame(true); return g.players.filter(p => p.on).length >= 36 && g.auc.lots.length === 5 && g.rooms.some(r => r.ps.length); })());
console.log(bad ? bad + ' FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
