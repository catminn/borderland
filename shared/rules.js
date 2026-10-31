// 百鬼夜行 · game rules（v3：个人赛，2026-10-16）。
// Shared by the server (authoritative: every action runs here) and the browser (read-only helpers for display).
// To change a rule, change it here only.
export let S;
export function use(state){S=state;if(S&&!S.draw){S.draw=defaultDraw();delete S.auc;delete S.fin;}}   // 旧存档（拍卖/晋级名单）自动换成抽奖
// 4 种花色各有 简单(4) / 困难(8) 两间房，共 8 间。成功得 n×100 金币和该花色；每人每间房最多成功一次。
// 房间以场地地图为准（2026-10-28 起整场在一个大房间里，不再有房间号和楼层）
// 房间规则（rule）只显示在 Dealer 页（2026-10-20 用户定：工作人员要看，玩家页面都不显示）
const ROOMS=[
  {id:'4S',card:'♠4',suit:'♠',n:4,name:'一二三纸扎人',
   rule:"木头人，转身时还在动的人回起点；需要在定住的时候摆出规定动作。"},
  {id:'8S',card:'♠8',suit:'♠',n:8,name:'红线劫',
   rule:"在教室里交错布置挂有铃铛的红线，玩家需要穿过红线到达终点。\n可以弯腰、下蹲、侧身或跨越，但不能用手拨开红线，也不能绕路。\n90 秒内到达终点，且没有让铃铛响起，即挑战成功。\n铃铛响起或超时，则挑战失败。"},
  {id:'4H',card:'♥4',suit:'♥',n:4,name:'生死时速',
   rule:"1. 每轮开始前，玩家有 30 秒讨论时间（？）讨论结束后，每人秘密选择红牌或黑牌，并同时亮牌。投票提交后不能更改。\n2. 统计红、黑两边的人数。人数较少的一方是「少数派」，该方每位玩家得 1 分；人数较多的一方不得分。\n3. 如果红黑人数相同，或所有人都选了同一种颜色，本轮没有少数派，所有人都不得分。\n4. 每 3 轮投票为一个阶段。阶段结束后，累计分数最低的玩家淘汰；如果最低分并列，则并列玩家一起淘汰。\n5. 被淘汰的玩家离开游戏区，不再参与后续投票。游戏持续到只剩一位玩家，或达到预定时间。\n6. 玩家可以在讨论时间里谈判、误导或结盟，但投票必须保密；投票期间不能交谈、传递暗号或查看他人的选择。"},
  {id:'8H',card:'♥8',suit:'♥',n:8,name:'孟婆的交易',
   rule:"6 人一组，每人随机获得一个信封，其中 1 个「生」、5 个「死」。玩家可私下查看自己的信封，但不得展示，可以自由撒谎、结盟、谈判或作出承诺，承诺无需兑现。\n1) 自由讨论：玩家可自由交流并制定投票策略。讨论时间随人数递减：6 人 3 分钟、5 人 2 分钟、4 人 90 秒、3 人 60 秒。\n2) 投票：讨论结束后，所有玩家匿名投票，每人投给一名其他玩家（不可投自己），得票最多者公开信封。\n- 「死」：该玩家淘汰，剩余玩家重新随机分配信封，进入下一轮。\n- 「生」：该玩家立即获胜，并在揭晓后选择：独自通关获得 1000 金币，或带任何一名玩家共同通关，两人各获得 800 金币。其余玩家淘汰，游戏结束。\n3) 平票：平票玩家各有 20 秒进行陈述，随后重新投票（仅限平票玩家，不可投自己）。若再次平票，则随机抽取一名平票玩家揭晓信封。\n4) 如果只剩 2 人：主持人准备 1「生」1「死」两个信封。随机指定一人先抽取并秘密查看，可选择说谎或说真话；另一人决定抢走对方信封或选择剩余信封。最终持有「生」者获胜，并同样可选择独自通关（1000 金币）或携另外一名玩家共同通关（各 800 金币）。"},
  {id:'4C',card:'♣4',suit:'♣',n:4,name:'冥界传话',
   rule:"游戏开始后，第一位玩家根据主持人提供的题目进行绘画，限时 20 秒；第二位玩家根据画作用文字描述，限时 20 秒；第三位玩家根据文字描述重新绘画，第四位玩家再根据画作进行文字描述，依次交替传递。最后一位玩家根据前一位玩家的画猜测原始题目。不得交流或查看其他玩家的内容。最终猜对原始题目则挑战成功，猜错或超时则挑战失败。"},
  {id:'8C',card:'♣8',suit:'♣',n:8,name:'心有灵犀',
   rule:"两组共同闯关（默契考验），背向站/坐，约 5–7 分钟；先演示 1 题不计分。\n① 动作同步（5 题）：每组内部小声讨论 30 秒，两队同时做动作、定格 2 秒，不得提示、不能重复。也可以每队选一个人作为代表回答。\n② 背对背答题（5 题）：每组内部小声讨论 30 秒，写下唯一答案后同时亮板。\n③ 每题两边一致得 1 分，否则 0 分，满分 10 分；累计 ≥5 分，全体过关。动作按预设类别判定，左右手不影响；文字按题卡选项/同义词表判定，超时或出多个答案计 0 分。\n动作例题：比心、游客拍照姿势（V 手势/托腮/叉腰）等\n答题例题：世界上最想去的大洲、cornell campus 上最好吃的 dining hall 等"},
  {id:'4D',card:'♦4',suit:'♦',n:4,name:'生死簿',
   rule:"计划 A：30 秒看桌上物品（准备打印一些万圣节图案和准备一些物品），盖布后答题。\n计划 B：打算用 AI 创一个像 super mario game 的 suit yourselves 类似的游戏。用 AI 把卡牌换成万圣节或者中式恐怖元素。游戏规则也是 30 秒记住大屏幕上面的卡牌物品，盖布后答题。一共 4 轮。答对 4 题积 400 分，3 题积 300 分，2 题积 200 分，一题或者以下等于失败。\nhttps://mingdeng-memory-game.dearbun513.chatgpt.site"},
  {id:'8D',card:'♦8',suit:'♦',n:8,name:'符咒密码',
   rule:"房间内有 8 张符咒，其中 4 张是真符、4 张是假符。真符上的话一定为真，假符上的话一定为假。玩家需在 5 分钟内根据符咒之间的逻辑关系找出 4 张真符，并按照符咒编号从小到大读取真符上的数字，组成 4 位密码打开密码箱。最多尝试 3 次密码；成功获得 ♦ + 800 金币，超时或 3 次输入错误则挑战失败进入鬼市。现场随机使用 A/B 两套题目；如发现玩家通过泄题直接输入正确密码，可直接判定失败。"}];
// 得分档位：Dealer 可给每间房填几档分值（存 S.rules['$'+房间]，如 "400 300 200"）；没填 = 只有「赢」= n×100。结果值 'w:300' = 拿了 300 那一档，'win' = 最高档
const tiersOf=rid=>{const t=S&&S.rules&&S.rules['$'+rid];return t?String(t).match(/\d+/g).map(Number):[];};
const resOk=(r,res)=>['win','lose'].includes(res)||(typeof res==='string'&&res.startsWith('w:')&&tiersOf(r.id).includes(+res.slice(2)));
const winPts=(r,res)=>typeof res==='string'&&res.startsWith('w:')?+res.slice(2):(tiersOf(r.id)[0]||r.n*100);
const SUITS=['♠','♦','♣','♥'];
// 身份卡：编号 001 起，默认 100 张。没有起始房间（2026-10-19 删掉了，现场见机行事）。
const N_PLAYERS=100;
const pidOf=i=>String(i).padStart(3,'0');
// 解谜题题库不写在代码里（仓库公开、rules.js 会下载到每个玩家手机上）：总控在网站上粘贴导入，存在 S.bank = {编码:{q,a}}，只发给判官和总控。
const puzCode=v=>{const n=parseInt(String(v==null?'':v).trim(),10);return n>0&&n<100000?String(n):null;};
// 鬼门开题库：body = 玩家收到的通知（越短越好）；rule = 判官页上的简要规则（只给判官看）
const GATES=[
  {id:'g1',title:'阎王点名',body:'鬼门已开！想争这一轮奖励的玩家，请前往{loc}找判官。奖励有限，先完成先得！',
   rule:'只有「阎王有令」开头的口令才执行，其他口令不动；做错的当轮出局（不进鬼市）。最后剩下的人抢答决胜轮（黑白无常亮两张符咒，判官喊名字，抢答对应编号），最先答对的 3 人获胜。'},
  {id:'g2',title:'生死一线',body:'鬼门再开！新一轮挑战开始，请前往{loc}找判官。这次能不能抓住机会，就看你了！',
   rule:'每轮先给一条提示（如「阴阳颠倒，少者为生」），玩家 10 秒内选生门或死门，选错的出局观战，直到剩 3 人；最后超过 3 人就用一道抢答题决出。'}];
const TK_COIN=100, TK_SUITS=5, TK_ALL=10;   // 压轴抽奖彩券：每 100 金币 1 张，集齐四花色 +5，八间房全部成功 +10
const CHIP_START=200, CHIP_GOAL=500, RANSOM=500, MARKET_WAIT=900;   // 鬼市用实体筹码（网站不记）：领 200，赢到 500 自赎；待满 15 分钟（MARKET_WAIT）不管赚没赚到都可以复活，孟婆也可以提前强行复活；在场的人花 500 金币可以赎人
const PUZ_PTS=100, PUZ_CAP=400;   // 解谜题 100 / 题，每人最多 400
const GATE_WIN=3, GATE_COIN=300, GATE_LOC0='info desk', DRAW_LOC0='鬼市';  // 鬼门开：最先完成的 3 人，每人选 300 金币 / 救一个人 / 拿一个花色
const ROOM_CAP0=6, DUR0=7200;  // 房间默认容量；主游戏 2 小时
const FREEZE_SEC=900;   // 封榜：时间截止前最后 15 分钟，玩家和大屏看不到排行榜（判官揭晓金币大亨奖后恢复）
const KINDS=['公告','鬼门开'];

const room=id=>ROOMS.find(r=>r.id===id);
const pl=id=>S.players.find(p=>p.id===id);
const nm=p=>p?(p.nick?p.id+' '+p.nick:p.id):'?';
const nameOf=id=>nm(pl(id));
const fmt=s=>'T+'+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
// 带 b=1 的日志行是「全场播报」：大屏和玩家第一页都显示
const log=(text,kind='',b=0)=>S.log.unshift(b?{t:S.t,text,kind,b:1}:{t:S.t,text,kind});
const ok=(msg,data)=>data===undefined?{ok:true,msg}:{ok:true,msg,data}, no=msg=>({ok:false,msg});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isBcast=l=>!!l.b;

function mkPlayer(i){return {id:pidOf(i),nick:'',on:false,st:'alive',score:0,cards:[],cleared:[],inRoom:null,hist:[],puz:[],
  outAt:null,inAt:null,pickAt:null,at:'',chk:null,won:null};}
// 压轴抽奖奖品：tycoon 金币大亨奖（金币最多者：判官先揭晓，并列则一起揭晓，再在并列的人里抽）· big 大奖 · small 小奖；st：wait 待抽 · reveal 大亨奖并列第一已揭晓、待抽 · drawn 已抽出待确认 · done 已确认
function defaultDraw(){return {pz:[{id:'P1',name:'金币大亨奖',desc:'',kind:'tycoon',st:'wait',win:null,skip:[],tie:0,tk:0,all:0,top:[]},
  {id:'P2',name:'大奖',desc:'',kind:'big',st:'wait',win:null,skip:[],tie:0,tk:0,all:0,top:[]},
  {id:'P3',name:'小奖一',desc:'',kind:'small',st:'wait',win:null,skip:[],tie:0,tk:0,all:0,top:[]},
  {id:'P4',name:'小奖二',desc:'',kind:'small',st:'wait',win:null,skip:[],tie:0,tk:0,all:0,top:[]},
  {id:'P5',name:'小奖三',desc:'',kind:'small',st:'wait',win:null,skip:[],tie:0,tk:0,all:0,top:[]}],cur:null,screen:'game',pid:6};}
function init(){
  S={v:3,t:0,now:0,bank:{},rules:{},dur:DUR0,cap:ROOM_CAP0,capOn:false,gp:null,log:[],notices:[],nid:1,
     rooms:ROOMS.map(r=>({id:r.id,st:'open',at:0,ps:[]})),players:[],
     draw:defaultDraw()};
  for(let i=1;i<=N_PLAYERS;i++)S.players.push(mkPlayer(i));
  log('游戏开始');
}
// 旧版本的存档（队伍制）不能继续用，需要重置。
const needsReset=st=>!st||st.v!==3||!Array.isArray(st.rooms)||st.rooms.length!==ROOMS.length||st.rooms.some((r,i)=>r.id!==ROOMS[i].id);
const timeUp=()=>S.t>=(S.dur||DUR0);
const frozen=()=>!S.draw.pz.some(x=>x.kind==='tycoon'&&x.st==='done')&&(S.draw.lock===true||(S.draw.lock!==false&&S.t>=(S.dur||DUR0)-FREEZE_SEC&&S.draw.pz.some(x=>x.kind==='tycoon')));
const active=()=>S.players.filter(p=>p.on);
const suitsOf=p=>SUITS.filter(x=>p.cards.includes(x));
// 排名：金币多的在前；同分花色多的在前；再按编号
const ranking=()=>active().slice().sort((a,b)=>b.score-a.score||suitsOf(b).length-suitsOf(a).length||a.id.localeCompare(b.id));

// ---------- 通知 ----------
function matches(n,p){
  switch(n.target){case 'all':case 'everyone':return true;case 'player':return n.ids.includes(p.id);
  case 'market':return p.st==='market';case 'alive':return p.st==='alive';}return false;}
// 已经结束的鬼门开不再弹全屏
const noticeStale=n=>n.sub==='gate'&&!(S.gp&&S.gp.nid===n.id);
const staffSees=n=>(n.target==='staff'||n.target==='everyone')&&n.sub!=='gate';   // 鬼门开不弹给工作人员
function targetLabel(n){return n.target==='all'?'全体玩家':n.target==='player'?(n.ids.length<=4?n.ids.join('、'):n.ids.slice(0,3).join('、')+' 等 '+n.ids.length+' 人'):n.target==='market'?'鬼市中的人':n.target==='staff'?'工作人员':n.target==='everyone'?'所有人':'存活玩家';}
function pushNotice(o){S.notices.unshift({id:S.nid++,sub:o.sub||null,tone:o.tone||'',t:S.t,kind:o.kind,title:o.title,body:o.body,target:o.target,ids:o.ids||[],due:o.mins?S.t+o.mins*60:null,acks:{}});}
const gateN=()=>(S&&S.gateN)||GATE_WIN, puzCapOf=()=>(S&&S.puzCap)||PUZ_CAP, drawLoc=()=>(S&&S.locDraw)||DRAW_LOC0;
const tell=(pid,title,body,tone)=>pushNotice({kind:'通知',title,body,target:'player',ids:[pid],tone});
// 公告：发给任意对象。鬼门开：发给全场，最先完成的 3 人有奖励。
function publish(f){f=f||{};const str=(v,n)=>String(v==null?'':v).slice(0,n);f={...f,title:str(f.title,80),body:str(f.body,1000)};
  if(!KINDS.includes(f.kind))return no('类型不对');
  let target=f.target,ids=[],sub=null;
  if(f.kind==='鬼门开'){
    const g=GATES.find(x=>x.id===f.gate);if(g){f.title=g.title;f.body=g.body.replace(/\{loc\}/g,str(f.loc,30).trim()||GATE_LOC0);}
    if(!f.title.trim())return no('先从题库选一个鬼门开');
    if(S.gp)return no('鬼门开正在进行，先结束上一轮');
    target='all';sub='gate';
  }else{
    if(!['all','player','alive','market','staff','everyone'].includes(target))return no('发布对象不对');
    if(!f.title.trim())return no('先写标题');
    if(target==='player'){const want=Array.isArray(f.players)?f.players:f.player?[f.player]:[];ids=[...new Set(want)].filter(id=>pl(id));if(!ids.length)return no('先选玩家');}
  }
  pushNotice({kind:f.kind,sub,title:f.title.trim(),body:f.body.trim(),target,ids,mins:Math.max(0,+f.mins||0)});
  const n=S.notices[0];
  if(sub==='gate'){S.gp={nid:n.id,wins:[]};log('鬼门开「'+n.title+'」开启：最先完成的 '+gateN()+' 人有奖励','hook',1);}
  else log('发布'+n.kind+'「'+n.title+'」→ '+targetLabel(n));
  return ok('已发布给 '+targetLabel(n)+(staffSees(n)?'（含工作人员）':''));}
function ack(nid,pid){const n=S.notices.find(x=>x.id===nid);if(n&&!n.acks[pid])n.acks[pid]=S.t;}
function revokeNotice(nid){const i=S.notices.findIndex(x=>x.id===nid);if(i<0)return no('这条已经不存在');
  const n=S.notices[i];if(n.sub==='gate'&&S.gp&&S.gp.nid===nid){if(S.gp.wins.some(w=>w.rw))return no('已经发过奖励，不能撤销，请直接结束鬼门开');S.gp=null;}
  S.notices.splice(i,1);log('撤销发布「'+n.title+'」');return ok('已撤销「'+n.title+'」');}

// ---------- 房间 ----------
function whyNotEnter(pid,rid){
  const p=pl(pid),r=S.rooms.find(x=>x.id===rid);
  if(!p)return '没有这个编号';if(!r)return '没有这个房间';
  if(p.st!=='alive')return '不在场（'+stLabel(p)+'）';
  if(timeUp())return '时间到，房间已关闭';
  if(r.st==='reset')return '房间重置中';
  if(p.inRoom)return p.inRoom===rid?'已经在这间房里':'正在 '+room(p.inRoom).card;
  if(p.cleared.includes(rid))return '已成功过这间房';
  if(S.capOn&&r.ps.length>=(S.cap||ROOM_CAP0))return '房间已满（'+r.ps.length+' 人）';
  return null;}
// Dealer 放人入场（可以一次放多人）。第一个人进来时房间变成「游戏中」。
function enterRoom(rid,pids){
  pids=[...new Set((Array.isArray(pids)?pids:[pids]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(!room(rid))return no('没有这个房间');if(!pids.length)return no('先输入编号');
  for(const id of pids){const why=whyNotEnter(id,rid);if(why)return no(nameOf(id)+' 不能进 '+room(rid).card+'：'+why);}
  if(S.capOn&&S.rooms.find(x=>x.id===rid).ps.length+pids.length>(S.cap||ROOM_CAP0))return no('超过房间容量 '+(S.cap||ROOM_CAP0)+' 人');
  const r=S.rooms.find(x=>x.id===rid);if(!r.ps.length){r.st='play';r.at=S.t;}
  pids.forEach(id=>{const p=pl(id);r.ps.push(id);p.inRoom=rid;p.on=true;p.hist.push({rid,t0:S.t,res:null,pts:0});});
  log(pids.map(nameOf).join('、')+' 进入 '+room(rid).card+' '+room(rid).name);
  return ok(pids.length+' 人已入场 '+room(rid).card);}
// 结算：每人 win / lose（中途放弃一律算输）。赢：+n×100 + 花色；输：进入淘汰流程（等黑白无常）。
function finishRoom(rid,results){
  const r=room(rid),st=S.rooms.find(x=>x.id===rid);results=results||{};
  if(!st||!st.ps.length)return no('房间里没有人');
  for(const id of st.ps)if(!resOk(r,results[id]))return no('请为 '+nameOf(id)+' 选择赢 / 输');
  const notes=[];
  for(const id of st.ps){const p=pl(id),res=results[id];p.inRoom=null;
    const h=p.hist.filter(x=>x.rid===rid&&x.res===null).pop()||(p.hist[p.hist.length]={rid,t0:st.at,res:null,pts:0});h.t1=S.t;h.res=res;
    if(res!=='lose'){const pts=winPts(r,res);h.res='win';p.score+=pts;h.pts=pts;if(!p.cleared.includes(rid))p.cleared.push(rid);if(!p.cards.includes(r.suit))p.cards.push(r.suit);
      log(nm(p)+' 赢下 '+r.card+'，+'+pts+' 金币','back',1);notes.push(p.id+' 赢');}
    else{eliminate(p,'挑战 '+r.card+' 失败',r.card+' '+r.name);notes.push(p.id+' 输');}}
  st.ps=[];st.st='reset';st.at=S.t;
  return ok(r.card+' 结算完成：'+notes.join('，'));}
function resetDone(rid){const r=S.rooms.find(x=>x.id===rid);if(!r)return no('没有这个房间');
  if(r.st!=='reset')return no(room(rid).card+'现在不在重置中');r.st='open';log(room(rid).card+' 重置完成');return ok(room(rid).card+'已重新开放');}
// Dealer 把某人移出房间（进错了），不算输赢
function kickOut(rid,pid){const r=S.rooms.find(x=>x.id===rid),p=pl(pid);if(!r||!p||!r.ps.includes(pid))return no(nameOf(pid)+' 不在这间房里');
  r.ps=r.ps.filter(x=>x!==pid);p.inRoom=null;const h=p.hist.filter(x=>x.rid===rid&&x.res===null).pop();if(h)p.hist.splice(p.hist.indexOf(h),1);
  if(!r.ps.length&&r.st==='play')r.st='open';log(nm(p)+' 被移出 '+room(rid).card+'（不计结果）');return ok('已把 '+p.id+' 移出');}
function setCap(v){v=Math.round(+v);if(!(v>=1&&v<=30))return no('房间容量要在 1 到 30 之间');S.cap=v;log('总控把房间容量设为 '+v+' 人');return ok('房间容量已设为 '+v+' 人');}
function setCapOn(v){v=!!v;if(v===S.capOn)return no('没有变化');S.capOn=v;log('总控'+(v?'开启':'关闭')+'房间人数上限');return ok(v?'已开启人数上限':'已关闭人数上限（房间不限人数）');}

// ---------- 淘汰 → 鬼市 ----------
// 状态：alive 在场 · out 刚失败，原地等黑白无常 · picked 已被黑白无常抓到 · market 在鬼市（钱包冻结，玩筹码）
const stLabel=p=>({alive:'在场',out:'待入鬼市',picked:'押送中',market:'鬼市'})[p.st]||p.st;
function eliminate(p,why,where){
  if(p.inRoom){const r=S.rooms.find(x=>x.id===p.inRoom);r.ps=r.ps.filter(x=>x!==p.id);if(!r.ps.length&&r.st==='play')r.st='open';const h=[...p.hist].reverse().find(x=>x.rid===p.inRoom&&x.res===null);if(h)h.res='lose';p.inRoom=null;}   // 在房间里被登记进鬼市 = 中途放弃算输，记录不能一直停在「游戏中」
  p.st='out';p.outAt=S.t;p.inAt=null;p.pickAt=null;p.chk=null;p.at=where||'';
  log(nm(p)+' '+why+'，即将前往鬼市','hook',1);
  tell(p.id,'挑战失败','很遗憾，你没能通过 '+(where||'').split(' ')[0]+' 的挑战！请自行前往【鬼市】找孟婆登记，不然黑白无常会来抓你哟！','out');}
function pickup(pid){const p=pl(pid);
  if(!p)return no('没有这个编号');if(p.st!=='out')return no(p.id+(p.st==='picked'?' 已经抓到了':' 现在不在待抓状态'));
  p.st='picked';p.pickAt=S.t;log('黑白无常抓到 '+nm(p)+(p.at?'（'+p.at+'）':''));return ok('已抓到 '+p.id);}
// 入鬼市以孟婆为准：孟婆「登记」（输入编号，在场、待抓、已抓到的人都行，自己走进鬼市的也行）直接入鬼市；
// 黑白无常「送入」要孟婆确认。
function enterMarket(p,by){
  if(p.inRoom){const r=S.rooms.find(x=>x.id===p.inRoom);r.ps=r.ps.filter(x=>x!==p.id);if(!r.ps.length&&r.st==='play')r.st='open';p.inRoom=null;}
  if(p.st==='alive')p.outAt=S.t;if(p.pickAt==null)p.pickAt=S.t;
  p.st='market';p.inAt=S.t;p.on=true;p.chk={by,ok:true};
  log(nm(p)+' 进入鬼市，金币冻结','back',1);
  tell(p.id,'欢迎来到鬼市！','金币已暂时冻结，接下来就看你手气如何了！\n筹码攒到 '+CHIP_GOAL+' 即可找孟婆自赎复活；手气不佳也没关系，好心的孟婆允许你待满 15 分钟后复活。还可以找场上的朋友花 '+RANSOM+' 金币赎你出去哦！');}
function checkIn(pid,role){const p=pl(pid);
  if(!p)return no('没有这个编号');
  if(role==='mengpo'){if(p.st==='market'&&!(p.chk&&!p.chk.ok))return no(p.id+' 已登记入鬼市，无需重复登记。');
    enterMarket(p,'mengpo');return ok('已登记 '+p.id+' 入鬼市');}
  if(p.chk&&!p.chk.ok)return no('已提交送入记录，等待孟婆确认。');
  if(p.st!=='out'&&p.st!=='picked')return no('不在待入鬼市状态');
  if(p.st==='out'){p.st='picked';p.pickAt=S.t;}
  p.chk={by:'wuchang',ok:false};log(nm(p)+' 已送入鬼市，等待孟婆确认');
  return ok('已提交送入记录，等待孟婆确认。');}
function confirmIn(pid,role){const p=pl(pid);
  if(!p||!['out','picked'].includes(p.st)||!p.chk||p.chk.ok)return no('没有待确认的送入');
  if(role!=='mengpo')return no('要由孟婆确认');
  enterMarket(p,'wuchang');p.chk.by2='mengpo';
  return ok('已确认 '+p.id+' 入鬼市');}
function backAlive(p){p.st='alive';p.outAt=null;p.inAt=null;p.pickAt=null;p.chk=null;p.at='';}
const inMk=p=>p&&p.st==='market'&&!(p.chk&&!p.chk.ok);
// 自赎：玩家用实体筹码赢到 500，孟婆确认后点。不带出任何金币，只是解冻。
function selfRedeem(pid){const p=pl(pid);if(!inMk(p))return no('该玩家不在鬼市');
  backAlive(p);log(nm(p)+' 在鬼市赢够筹码，逃出了鬼市','back',1);
  tell(p.id,'复活成功','通过你的好运和努力，你终于将自己赎出了鬼市！金币已解冻，请继续努力生存，感谢你对地府业务的支持！');
  return ok(p.id+' 已自赎');}
// 赎人：任何在场的人花 500 金币把鬼市里的人赎出来
function ransom(pid,byId){const p=pl(pid),by=pl(byId);if(!inMk(p))return no('该玩家不在鬼市');
  if(!by)return no('先输入出钱人的编号');if(by.id===p.id)return no('不能自己赎自己');
  if(by.st!=='alive')return no(by.id+' 不在场，不能出钱');
  if(by.score<RANSOM)return no(by.id+' 当前有 '+by.score+' 金币，赎人需要 '+RANSOM+' 金币。');
  by.score-=RANSOM;backAlive(p);
  log(nm(by)+' 花 '+RANSOM+' 金币把 '+nm(p)+' 从鬼市赎了出来','back',1);
  tell(p.id,'有人来赎你了！',nm(by)+' 花 '+RANSOM+' 金币把你赎出了鬼市，金币已解冻。看来你在人间的人缘还不错哦！');
  tell(by.id,'赎人成功','你花 '+RANSOM+' 金币赎出了 '+nm(p)+'，对方已恢复挑战资格。感谢你对地府业务的支持！');
  return ok(by.id+' 赎出 '+p.id+'，扣 '+RANSOM+' 金币');}
// 复活（孟婆汤）：待满 15 分钟，不管赚没赚到都可以复活；孟婆也可以不管时间强行复活。不再忘花色。
function soup(pid){const p=pl(pid);if(!inMk(p))return no('该玩家不在鬼市');
  backAlive(p);
  log(nm(p)+' 喝下孟婆汤复活','back',1);
  tell(p.id,'你复活了！','金币已解冻，请继续努力生存！孟婆表示希望下次晚点见到你。');
  return ok(p.id+' 已复活');}

// ---------- 解谜题 ----------
function puzInfo(p){const used=p.puz.reduce((a,r)=>a+r.pts,0);return {used,left:Math.max(0,puzCapOf()-used),cap:puzCapOf()};}
// 判官输入谜题编码兑换：题库里有就记下题目，没有也照记（标成「第 N 号谜题」）
// 房间规则：默认是 ROOMS[].rule，Dealer 在自己页面上可以改（存 S.rules，只发给工作人员；清空保存 = 规则就是空的）
const roomRule=id=>{const o=S.rules&&S.rules[id];return o!=null?o:(room(id)||{}).rule||'';};
function setRule(rid,text){const r=room(rid);if(!r)return no('没有这个房间');text=String(text==null?'':text).replace(/\r/g,'').trim().slice(0,4000);
  S.rules=S.rules||{};S.rules[rid]=text;
  log(r.card+' 的规则'+(text===''?'清空了':'改了'));return ok('规则已保存');}
function setTiers(rid,text){const r=room(rid);if(!r)return no('没有这个房间');
  const a=[...new Set((String(text==null?'':text).match(/\d+/g)||[]).map(Number))].filter(n=>n>0&&n<=9999).sort((x,y)=>y-x).slice(0,4);
  S.rules=S.rules||{};if(a.length)S.rules['$'+rid]=a.join(' ');else delete S.rules['$'+rid];
  log(r.card+' 的得分'+(a.length?'改成 '+a.join(' / '):'恢复默认 +'+r.n*100));return ok(a.length?'得分档位已保存':'已恢复默认');}
const puzTitle=code=>{const z=(S.bank||{})[code];return '#'+code+' '+(z&&z.q?String(z.q).replace(/\s+/g,' ').slice(0,30):'谜题');};
function puzRedeem(pid,code){const p=pl(pid);if(!p)return no('没有这个编号');
  code=puzCode(code);if(!code)return no('先输入谜题编码');const key='z'+code,t=puzTitle(code);
  if(p.st!=='alive')return no(p.id+' 不在场（'+stLabel(p)+'）');
  if(p.puz.some(r=>r.k===key))return no(p.id+' 已领取过 #'+code+' 的奖励，不能重复领取');
  const i=puzInfo(p);if(i.left<=0)return no(p.id+' 的解谜奖励已达 '+puzCapOf()+' 金币上限');
  const pts=Math.min(PUZ_PTS,i.left);p.puz.push({k:key,title:t,t:S.t,pts});p.score+=pts;p.on=true;
  log('判官记录 '+nm(p)+' 解出 '+t+'，+'+pts+' 金币','back');
  return ok(p.id+' +'+pts+' 金币（解谜题累计 '+(i.used+pts)+' / '+puzCapOf()+'）');}
// 总控导入题库：rows = [[编码,问,答],…]；整份替换
function setBank(rows){if(!Array.isArray(rows))return no('题库格式不对');const b={};
  for(const r of rows){const c=puzCode(r&&r[0]);if(!c)continue;b[c]={q:String(r[1]||'').trim().slice(0,400),a:String(r[2]||'').trim().slice(0,200)};}
  const n=Object.keys(b).length;S.bank=b;log('总控'+(n?'导入解谜题库 '+n+' 题':'清空了解谜题库'));return ok(n?'已导入 '+n+' 题':'题库已清空');}
function puzUndo(pid,key){const p=pl(pid);if(!p)return no('没有这个编号');const i=p.puz.findIndex(r=>r.k===key);if(i<0)return no('没有这条记录');
  const r=p.puz.splice(i,1)[0];p.score=Math.max(0,p.score-r.pts);log('判官撤销 '+nm(p)+' 的解谜「'+r.title+'」，扣回 '+r.pts);return ok('已撤销，扣回 '+r.pts);}

// ---------- 鬼门开 ----------
// 判官按顺序记录最先完成的 3 人；每人再选奖励：coin +300 · save 救一个不在场的人 · suit 拿一个花色
function gateWin(pid,force){const g=S.gp;if(!g)return no('现在没有进行中的鬼门开');const p=pl(pid);if(!p)return no('没有这个编号');
  if(g.wins.some(w=>w.pid===pid))return no(p.id+' 已经记过了');if(g.wins.length>=gateN()&&!force)return no('名额已满（'+gateN()+' 人）');
  if(p.st!=='alive')return no(p.id+' 不在场');
  g.wins.push({pid,t:S.t,rw:null});p.on=true;const n=S.notices.find(x=>x.id===g.nid);
  log(nm(p)+' 第 '+g.wins.length+' 个完成鬼门开「'+(n?n.title:'')+'」','back',1);
  tell(p.id,'鬼门开：你是第 '+g.wins.length+' 名！','请找判官任选一项奖励：'+GATE_COIN+' 金币、救回一名玩家，或获得一种花色。');
  return ok(p.id+' 记为第 '+g.wins.length+' 名，请选奖励');}
function gateUnwin(pid){const g=S.gp;if(!g)return no('现在没有进行中的鬼门开');const i=g.wins.findIndex(w=>w.pid===pid);if(i<0)return no('没有这条记录');
  if(g.wins[i].rw)return no('已经发过奖励，不能撤销');g.wins.splice(i,1);log('判官撤销 '+nameOf(pid)+' 的鬼门开名次');return ok('已撤销');}
function gateReward(pid,kind,arg){const g=S.gp;if(!g)return no('现在没有进行中的鬼门开');const w=g.wins.find(x=>x.pid===pid);if(!w)return no('这个人不在完成名单里');
  if(w.rw)return no('已经领过奖励');const p=pl(pid);
  if(kind==='coin'){p.score+=GATE_COIN;w.rw={k:'coin'};log(nm(p)+' 鬼门开奖励：+'+GATE_COIN+' 金币','back',1);}
  else if(kind==='save'){const q=pl(arg);if(!q)return no('先选要救的人');if(q.st==='alive')return no(q.id+' 本来就在场');
    backAlive(q);w.rw={k:'save',pid:q.id};
    log(nm(p)+' 用鬼门开奖励救出了 '+nm(q),'back',1);tell(q.id,'有人救了你！',nm(p)+' 用鬼门开的奖励把你救了回来。你已恢复挑战资格，金币已解冻，请继续努力生存！');}
  else if(kind==='suit'){if(!SUITS.includes(arg))return no('先选花色');if(p.cards.includes(arg))return no(p.id+' 已经有 '+arg);
    p.cards.push(arg);w.rw={k:'suit',s:arg};log(nm(p)+' 鬼门开奖励：拿到花色 '+arg,'back',1);}
  else return no('先选奖励');
  return ok('奖励已发放');}
function gateRec(){const g=S.gp,n=g&&S.notices.find(x=>x.id===g.nid);if(n)n.gr=g.wins.map(w=>({...w}));}
function gateEnd(auto){if(!S.gp)return no('现在没有进行中的鬼门开');gateRec();S.gp=null;log('鬼门开结束','',1);return ok('鬼门开已结束');}

// ---------- 压轴抽奖（判官主持） ----------
// 彩券 = 金币 ÷ 100（取整）+ 集齐四花色 5 张 + 八间房全部成功 10 张。所有上榜的人都参与（鬼市里的人也算，冻结的金币照算）；中过奖的人不再参与。
// 金币大亨奖：金币最多的人直接得，并列则在并列者中抽一位。其余奖品按彩券张数加权随机抽。得主不在场就「不在场，重抽」。
const ticketsOf=p=>p?Math.floor(p.score/TK_COIN)+(SUITS.every(x=>p.cards.includes(x))?TK_SUITS:0)+(ROOMS.every(r=>p.cleared.includes(r.id))?TK_ALL:0):0;
const drawPool=pr=>S.players.filter(p=>p.on&&!p.won&&!(pr&&pr.skip.includes(p.id)));
const prize=id=>S.draw.pz.find(x=>x.id===id);
const curPrize=()=>S.draw.cur?prize(S.draw.cur):null;
const KIND_NAME={tycoon:'金币大亨奖',big:'大奖',small:'小奖'};
function drawAdd(f){f=f||{};const name=String(f.name||'').trim().slice(0,40);if(!name)return no('先写奖品名称');
  const kind=KIND_NAME[f.kind]?f.kind:'small';
  S.draw.pz.push({id:'P'+(S.draw.pid++),name,desc:String(f.desc||'').trim().slice(0,200),kind,st:'wait',win:null,skip:[],tie:0,tk:0,all:0,top:[]});
  return ok('已添加「'+name+'」');}
function drawEdit(id,f){const x=prize(id);if(!x)return no('没有这个奖品');if(x.st!=='wait')return no('只能改待抽的奖品');
  const name=String((f&&f.name)||'').trim().slice(0,40);if(!name)return no('先写奖品名称');
  x.name=name;x.desc=String(f.desc||'').trim().slice(0,200);x.kind=KIND_NAME[f.kind]?f.kind:x.kind;return ok('已保存');}
function drawDel(id){const x=prize(id);if(!x)return no('没有这个奖品');if(x.st!=='wait')return no('只能删待抽的奖品');
  S.draw.pz=S.draw.pz.filter(y=>y!==x);if(S.draw.cur===id)S.draw.cur=null;return ok('已删除「'+x.name+'」');}
function drawMove(id,d){const a=S.draw.pz,i=a.findIndex(x=>x.id===id),j=i+(d<0?-1:1);if(i<0||j<0||j>=a.length)return no('不能再移了');[a[i],a[j]]=[a[j],a[i]];return ok('');}
// 抽一位 / 揭晓：rnd 是 0–1 的随机数（测试可传固定值）。金币大亨奖：第一步揭晓金币最多的人，并列就一起揭晓（st:'reveal'），第二步才在并列的人里抽
function drawRun(id,rnd){const x=prize(id)||curPrize();if(!x)return no('先选一个奖品');
  if(x.st==='done')return no('这个奖品已经抽过了（要重来请先撤销）');
  if(x.st==='drawn')return no('得主还没确认');
  const c=S.draw.pz.find(y=>y.st==='drawn'||y.st==='reveal');if(c&&c!==x)return no('「'+c.name+'」还没结束');
  const fin=pick=>{x.st='drawn';x.win=pick.id;x.skip=x.skip||[];S.draw.cur=x.id;S.draw.screen='draw';
    log((x.kind==='tycoon'?'揭晓「':'抽「')+x.name+'」：'+nm(pick)+(x.kind==='tycoon'?'（金币 '+x.tk+(x.tie>1?'，并列 '+x.tie+' 人中抽出':'')+'）':'（彩券 '+x.tk+' / 共 '+x.all+' 张）'));if(x.kind==='tycoon'&&!S.draw.rkSent){S.draw.rkSent=1;{const l=ranking();l.forEach(p=>tell(p.id,'最终名次','你的最终名次：第 '+(1+l.filter(q=>q.score>p.score).length)+' 名（金币 '+p.score+'）','final'));}}
    return ok((x.kind==='tycoon'?'第一名 ':'抽到 ')+nm(pick));};
  const r=rnd==null?Math.random():rnd;
  if(x.st==='reveal'){const ts=x.top.map(pl).filter(Boolean);return fin(ts[Math.min(ts.length-1,Math.floor(r*ts.length))]);}
  const pool=drawPool(x);
  if(x.kind==='tycoon'){const top=Math.max(0,...pool.map(p=>p.score));if(!(top>0))return no('没有可以揭晓的人');
    const ts=pool.filter(p=>p.score===top);x.top=ts.map(p=>p.id);x.tie=ts.length;x.tk=top;x.win=null;S.draw.cur=x.id;S.draw.screen='draw';
    if(ts.length===1)return fin(ts[0]);
    x.st='reveal';log('「'+x.name+'」并列第一：'+ts.map(nm).join('、')+'（金币 '+top+'）');return ok('并列 '+ts.length+' 人');}
  const w=pool.map(p=>ticketsOf(p)),sum=w.reduce((a,b)=>a+b,0);if(!(sum>0))return no('没有可以抽的人');
  let t=r*sum,i=0;while(i<w.length-1&&t>=w[i]){t-=w[i];i++;}
  while(w[i]===0&&i>0)i--;x.tie=0;x.tk=w[i];x.all=sum;return fin(pool[i]);}
function drawConfirm(id){const x=prize(id)||curPrize();if(!x||x.st!=='drawn')return no('没有等待确认的得主');
  const p=pl(x.win);p.won=x.id;x.st='done';log(nm(p)+' 获得「'+x.name+'」','back',1);
  if(x.kind==='tycoon')tell(p.id,'恭喜获得「'+x.name+'」！','判官反复核对过了，今晚确实数你最有钱。请到台前领取你的大奖！','final');
  else tell(p.id,'你中奖了！','恭喜抽中「'+x.name+'」，请到台前领取。','final');
  return ok(nm(p)+' 获得「'+x.name+'」');}
// 得主不在场：这位不再参与这个奖品，马上重抽
function drawRedo(id,rnd){const x=prize(id)||curPrize();if(!x||x.st!=='drawn')return no('没有等待确认的得主');
  const old=x.win;x.skip.push(old);x.st='wait';x.win=null;log(nameOf(old)+' 不在场，「'+x.name+'」重抽');
  const r=drawRun(x.id,rnd);if(!r.ok){return ok('没有可以再抽的人了');}return r;}
// 撤销已确认的得主：回到待抽，这位重新参与
function drawUndo(id){const x=prize(id)||curPrize();if(!x||x.st==='wait')return no('这个奖品还没抽');
  const p=pl(x.win);if(p&&p.won===x.id)p.won=null;log('「'+x.name+'」撤销得主 '+nameOf(x.win));x.st='wait';x.win=null;x.skip=[];x.tie=0;x.tk=0;x.all=0;x.top=[];return ok('已撤销，可以重新来');}
function drawJscr(on){S.judgeScr=!!on;log('总控'+(on?'允许':'不再允许')+'判官切换大屏和锁定排名');return ok(on?'判官也可以切换大屏、锁定排名':'只有总控能切换大屏、锁定排名');}
function drawLock(on){S.draw.lock=!!on;log(on?'总控锁定排名：大屏和玩家看不到排行榜':'总控解除锁定排名','sys');return ok(on?'排名已锁定':'排名已解除锁定');}
function drawScreen(on){S.draw.screen=on?'draw':'game';return ok(on?'大屏切到抽奖':'大屏切回游戏');}
function drawShow(id){const x=prize(id);if(!x)return no('没有这个奖品');const c=S.draw.pz.find(y=>y.st==='drawn'||y.st==='reveal');
  if(c&&c!==x)return no('「'+c.name+'」还没结束');
  S.draw.cur=x.id;return ok('大屏显示「'+x.name+'」');}

// ---------- 其他 ----------
function setScore(pid,v,why){const p=pl(pid);if(!p)return no('没有这个编号');v=Math.round(+v);if(!Number.isFinite(v)||v<0)return no('金币数要是不小于 0 的整数');
  const old=p.score;if(v===old)return no('金币数没有变化');p.score=v;log('总控修改 '+nm(p)+' 金币：'+old+' → '+v+(why?'（'+String(why).slice(0,40)+'）':''));return ok(p.id+' 金币已改为 '+v);}
function setNick(pid,nick){const p=pl(pid);if(!p)return no('没有这个编号');nick=String(nick||'').replace(/\s+/g,' ').trim().slice(0,12);
  if(!nick)return no('昵称不能为空');if(S.players.some(x=>x!==p&&x.nick===nick))return no('这个昵称已经有人用了');
  const old=p.nick;p.nick=nick;p.on=true;if(old!==nick)log(p.id+(old?' 改名 '+old+' → ':' 取名 ')+nick);return ok('昵称已设为 '+nick);}
// 总控改花色（补录 / 纠错）：cards = 花色数组
function setCards(pid,cards){const p=pl(pid);if(!p)return no('没有这个编号');if(!Array.isArray(cards))return no('花色不对');
  const c=SUITS.filter(x=>cards.includes(x));const old=p.cards.join('')||'无';if(c.join('')===p.cards.join(''))return no('花色没有变化');
  p.cards=c;log('总控修改 '+nm(p)+' 花色：'+old+' → '+(c.join('')||'无'));return ok(p.id+' 花色已改为 '+(c.join('')||'无'));}
function setOn(pid,on){const p=pl(pid);if(!p)return no('没有这个编号');p.on=!!on;log('总控把 '+nm(p)+(on?' 加入':' 移出')+'排行榜');return ok(on?'已加入排行':'已移出排行');}
function addPlayers(n){n=Math.round(+n);if(!(n>=1&&n<=40))return no('一次加 1–40 个');const k=S.players.length;for(let i=1;i<=n;i++)S.players.push(mkPlayer(k+i));
  log('总控新增 '+n+' 张身份卡（'+pidOf(k+1)+'–'+pidOf(k+n)+'）');return ok('已新增 '+n+' 张，记得生成 PIN');}
// 设置身份卡总数：不够就补，多了只删末尾还没用过的（没上榜、没记录、没分数）；已经用过的卡不删。
function setPlayerCount(n){n=Math.round(+n);if(!(n>=1&&n<=500))return no('玩家数量要在 1–500 之间');
  const k=S.players.length;for(let i=k+1;i<=n;i++)S.players.push(mkPlayer(i));
  const unused=p=>!p.on&&p.st==='alive'&&!p.inRoom&&!p.score&&!p.hist.length&&!p.puz.length&&!p.cards.length&&!p.won;
  while(S.players.length>n&&unused(S.players[S.players.length-1]))S.players.pop();
  const now=S.players.length;if(now!==k)log('总控把身份卡设为 '+now+' 张');
  return ok(now===n?'身份卡共 '+n+' 张':'身份卡共 '+now+' 张（后面的卡已有人用过，没法再减）');}
function setGateN(v){v=Math.round(+v);if(!(v>=1&&v<=20))return no('名额要在 1 到 20 之间');S.gateN=v;log('总控把鬼门开奖励名额设为 '+v+' 人');return ok('鬼门开奖励名额已设为 '+v+' 人');}
function setPuzCap(v){v=Math.round(+v);if(!(v>=100&&v<=5000))return no('解谜奖励上限要在 100 到 5000 之间');S.puzCap=v;log('总控把解谜奖励上限设为 '+v+' 金币');return ok('解谜奖励上限已设为 '+v+' 金币');}
function setDrawLoc(t){t=String(t==null?'':t).trim().slice(0,30);S.locDraw=t||DRAW_LOC0;log('开奖地点设为「'+S.locDraw+'」');return ok('开奖地点已保存');}
function setDur(secs){secs=Math.round(+secs);if(!(secs>=60&&secs<=86400))return no('总时长要在 1 分钟到 24 小时之间');S.dur=secs;log('总控把总时长设为 '+Math.floor(secs/60)+' 分钟');return ok('总时长已设为 '+Math.floor(secs/60)+' 分钟');}

// ---------- 离线补录 ----------
// 工作人员断网时在自己页面上记的事，连上后一次性交给服务器。按记录先后执行；不按房间状态、时间、鬼市截止这些规则拦，
// 记了什么就补什么（只防重复：同一间房已成功过不再加分，同一道题不重复兑换）。每一行单独成功或失败，互不影响。
const OFF_KINDS={dealer:['room'],wuchang:['pickup','market'],mengpo:['market','redeem','ransom','soup'],judge:['puz','gate']};
function toMarket(p){if(p.inRoom){const r=S.rooms.find(x=>x.id===p.inRoom);r.ps=r.ps.filter(x=>x!==p.id);if(!r.ps.length&&r.st==='play')r.st='open';p.inRoom=null;}
  if(p.st==='alive'){p.outAt=S.t;}p.st='market';p.inAt=S.t;if(p.pickAt==null)p.pickAt=S.t;p.chk={by:'off',ok:true};p.on=true;}
function offRow(me,x,rnd){
  if(!x||!(OFF_KINDS[me.role]||[]).includes(x.k))return no('你的身份不能补录这一类');
  const p=pl(String(x.pid||''));if(!p)return no('没有编号 '+(x.pid||'？'));
  const tag='（离线补录）';
  if(x.k==='room'){const r=room(x.rid);if(!r)return no('没有这个房间');
    if(Array.isArray(me.rooms)&&!me.rooms.includes(r.id))return no('这个房间不归你管');
    if(!resOk(r,x.res))return no('结果不对');
    if(p.inRoom===r.id){const st=S.rooms.find(y=>y.id===r.id);st.ps=st.ps.filter(y=>y!==p.id);if(!st.ps.length&&st.st==='play')st.st='open';p.inRoom=null;}
    p.on=true;const h={rid:r.id,t0:S.t,t1:S.t,res:x.res,pts:0};p.hist.push(h);
    if(x.res!=='lose'){h.res='win';if(p.cleared.includes(r.id)){if(!p.cards.includes(r.suit))p.cards.push(r.suit);return ok(p.id+' 已成功过 '+r.card+'，没有再加分');}
      h.pts=winPts(r,x.res);p.score+=h.pts;p.cleared.push(r.id);if(!p.cards.includes(r.suit))p.cards.push(r.suit);
      log(nm(p)+' 赢下 '+r.card+'，+'+h.pts+' 金币'+tag,'back',1);return ok(p.id+' 赢 '+r.card+' +'+h.pts);}
    if(x.res==='lose'){if(p.st!=='alive'){log(nm(p)+' 挑战 '+r.card+' 失败'+tag);return ok(p.id+' 输 '+r.card+'（本来就不在场）');}
      eliminate(p,'挑战 '+r.card+' 失败'+tag,r.card+' '+r.name);return ok(p.id+' 输 '+r.card);}}
  if(x.k==='pickup'){if(p.st==='market'||p.st==='picked')return ok(p.id+' 已经抓到了');
    if(p.st==='alive')p.outAt=S.t;p.st='picked';p.pickAt=S.t;p.on=true;log('黑白无常抓到 '+nm(p)+tag);return ok('抓到 '+p.id);}
  if(x.k==='market'){if(p.st==='market')return ok(p.id+' 已经在鬼市');toMarket(p);log(nm(p)+' 进入鬼市，金币冻结'+tag,'back');return ok(p.id+' 入鬼市');}
  if(x.k==='redeem'){if(p.st==='alive')return ok(p.id+' 已经在场');backAlive(p);log(nm(p)+' 自赎逃出鬼市'+tag,'back',1);return ok(p.id+' 自赎');}
  if(x.k==='ransom'){if(p.st==='alive')return ok(p.id+' 已经在场');const by=pl(String(x.by||''));if(!by)return no('没有出钱人编号 '+(x.by||'？'));if(by.id===p.id)return no('出钱人不能是自己');
    const paid=Math.min(RANSOM,by.score);by.score-=paid;backAlive(p);log(nm(by)+' 花 '+paid+' 金币把 '+nm(p)+' 从鬼市赎了出来'+tag,'back',1);return ok(by.id+' 赎出 '+p.id+(paid<RANSOM?'（只有 '+paid+'）':''));}
  if(x.k==='soup'){if(p.st==='alive')return ok(p.id+' 已经在场');backAlive(p);log(nm(p)+' 喝下孟婆汤复活'+tag,'back',1);return ok(p.id+' 复活');}
  if(x.k==='puz'){const code=puzCode(x.code),key='z'+code,t=code&&puzTitle(code);if(!code)return no('谜题编码不对');if(p.puz.some(r=>r.k===key))return ok(p.id+' 已经兑换过 #'+code);
    const i=puzInfo(p);if(i.left<=0)return ok(p.id+' 解谜题已达上限');const pts=Math.min(PUZ_PTS,i.left);p.puz.push({k:key,title:t,t:S.t,pts});p.score+=pts;p.on=true;
    log('判官记录 '+nm(p)+' 解出 '+t+'，+'+pts+' 金币'+tag,'back');return ok(p.id+' 解谜 #'+code+' +'+pts);}
  if(x.k==='gate'){p.on=true;
    if(x.rw==='coin'){p.score+=GATE_COIN;log(nm(p)+' 鬼门开奖励：+'+GATE_COIN+' 金币'+tag,'back',1);return ok(p.id+' +'+GATE_COIN);}
    if(x.rw==='save'){const q=pl(String(x.arg||''));if(!q)return no('没有要救的编号 '+(x.arg||'？'));if(q.st!=='alive')backAlive(q);log(nm(p)+' 用鬼门开奖励救出了 '+nm(q)+tag,'back',1);return ok(p.id+' 救了 '+q.id);}
    if(x.rw==='suit'){if(!SUITS.includes(x.arg))return no('花色不对');if(!p.cards.includes(x.arg))p.cards.push(x.arg);log(nm(p)+' 鬼门开奖励：拿到花色 '+x.arg+tag,'back',1);return ok(p.id+' 拿到 '+x.arg);}
    return no('奖励不对');}
  return no('未知记录');}
function offImport(me,rows,rnd){
  if(!Array.isArray(rows)||!rows.length)return no('没有要补录的记录');if(rows.length>300)return no('一次最多补录 300 条');
  const res=rows.map(x=>offRow(me,x,rnd)),n=res.filter(r=>r.ok).length;
  if(n)log((ROLE_LABEL[me.role]||me.role)+' 离线补录 '+n+' 条'+(n<rows.length?'，'+(rows.length-n)+' 条没补上':''));
  return ok('补录完成：'+n+' / '+rows.length+' 条',res.map(r=>({ok:r.ok,msg:r.msg})));}
const ROLE_LABEL={dealer:'Dealer',judge:'判官',mengpo:'孟婆',wuchang:'黑白无常'};

// ---------- 演示数据 ----------
const DEMO_NICK=['阿鬼','小白','无常','纸扎','孟孟','判判','铜钱','灯笼','彼岸','骨花','黑猫','红绸','书生','狐狸','小倩','钟馗','小青','白蛇','花脸','长舌',
  '阿飘','画皮','聂聂','宁采','燕赤','山魈','魍魉','魑魅','夜叉','罗刹','鬼火','冥灯','奈何','忘川','孟汤','黄泉'];
// 三套演示数据（总控工具里「载入演示数据」可选）：start 开局 · mid 游戏中段 · pre 抽奖前 · final 抽奖进行中
const DEMOS={start:'开局（T+5 分钟）',mid:'游戏中段（鬼门开进行中）',pre:'抽奖前（时间截止，还没开始抽）',freeze:'封榜（离结束还有 15 分钟）'};
function demoBase(n){init();S.players.slice(0,n).forEach((p,i)=>{p.nick=DEMO_NICK[i]||('玩家'+p.id);p.on=true;});}
function seedStart(){
  demoBase(30);
  // 开场 5 分钟：大家陆续进房间；♣4（简单）最先结束，1 人输了在原地等黑白无常
  S.t=30; enterRoom('4S',['001','009']); enterRoom('8S',['002','010','018']); enterRoom('4H',['003','011']);
  S.t=60; enterRoom('8H',['004','012','020']); enterRoom('4C',['005','013','021']);
  S.t=90; enterRoom('8C',['006']); enterRoom('4D',['014','022']);
  S.t=270; finishRoom('4C',{'005':'win','013':'win','021':'lose'});
  S.t=300; log('演示数据（开局）：7 间房有人，♣4 刚结算、重置中，♦8 还空着；021 输了还没去鬼市登记');
}
function seedMid(){
  demoBase(36);
  const M=(m,sec)=>m*60+(sec||0);   // 分:秒 → 游戏秒数
  const fin=(rid,res,m,sec)=>{S.t=M(m,sec);finishRoom(rid,res);S.t+=60;resetDone(rid);};   // 结算后 1 分钟重置完成
  S.t=M(1); enterRoom('4S',['001','009','017']); enterRoom('8S',['002','010']); enterRoom('4H',['003','011','019']);
  S.t=M(1,30); enterRoom('4C',['005','013']);
  fin('4H',{'003':'win','011':'win','019':'win'},6);
  fin('4C',{'005':'win','013':'win'},7);
  fin('4S',{'001':'win','009':'win','017':'lose'},8);
  S.t=M(9); pickup('017');
  fin('8S',{'002':'win','010':'lose'},9,30);
  S.t=M(10,30); checkIn('017','wuchang'); confirmIn('017','mengpo');
  S.t=M(11,30); pickup('010'); checkIn('010','mengpo');
  S.t=M(15); enterRoom('8H',['001','003']); enterRoom('4D',['002','009']); enterRoom('8C',['005']);
  fin('4D',{'002':'win','009':'win'},19,30);
  fin('8C',{'005':'win'},21);
  fin('8H',{'001':'win','003':'lose'},22);
  S.t=M(23,30); pickup('003');
  S.t=M(24,30); checkIn('003','wuchang'); confirmIn('003','mengpo');
  S.t=M(25); puzRedeem('011','1'); S.t+=20; puzRedeem('011','2'); S.t+=40; puzRedeem('019','1'); S.t+=30; puzRedeem('001','3');
  S.t=M(26,30); publish({kind:'鬼门开',gate:'g1',mins:10});
  S.t=M(28,30); gateWin('002'); gateReward('002','coin');
  S.t=M(29); gateWin('011'); gateReward('011','save','017');
  S.t=M(29,40); gateWin('005'); gateReward('005','suit','♥'); gateEnd(true);
  S.t=M(31); selfRedeem('010');
  S.t=M(35); enterRoom('4C',['017']);
  S.t=M(37); enterRoom('8D',['001','002']); enterRoom('4S',['011','019']); enterRoom('8S',['009']);
  S.t=M(40); publish({kind:'鬼门开',gate:'g2',mins:10});
  S.t=M(41); finishRoom('4C',{'017':'lose'});
  S.t=M(42); gateWin('013');
  S.t=M(43); log('演示数据（游戏中段）：第二次鬼门开进行中（已有 1 人完成），♦8、♠4、♠8 进行中，♣4 刚结算、重置中，鬼市 1 人，待接 1 人');
}
// 一批人集齐花色、攒了不少金币。pre = 时间截止、抽奖还没开始；freeze = 离结束还有 15 分钟（刚封榜）
function seedFinal(mode){const fz=mode==='freeze';
  demoBase(40);
  let k=7;const rnd=()=>(k=(k*1103515245+12345)%2147483648)/2147483648;
  const play=(pid,rid,res)=>{if(whyNotEnter(pid,rid))return;enterRoom(rid,[pid]);finishRoom(rid,{[pid]:res});resetDone(rid);};
  const plans={'001':['8S','8H','8C','8D'],'002':['8S','8H','8C','4D','4S'],'003':['4S','8H','8C','8D'],'004':['8S','4H','8C','8D'],'005':['4S','4H','4C','4D','8S','8D'],
    '006':['8S','8H','4C','8D'],'007':['4S','8H','8C','4D'],'008':['8S','4H','4C','8D','4S']};
  S.t=60;
  for(const [pid,rs] of Object.entries(plans)){rs.forEach(r=>{S.t+=fz?50:60;play(pid,r,'win');});}
  S.players.slice(8,40).forEach(p=>{const n=1+Math.floor(rnd()*4);for(let i=0;i<n;i++){S.t+=fz?30:55;play(p.id,ROOMS[Math.floor(rnd()*8)].id,rnd()<.7?'win':'lose');
    if(p.st==='out'){pickup(p.id);checkIn(p.id,'wuchang');confirmIn(p.id,'mengpo');if(rnd()<.6){rnd();selfRedeem(p.id);}}}});
  ['009','015','022','030'].forEach((id,i)=>{puzRedeem(id,'1');puzRedeem(id,'2');});
  // 前十名分数各不相同，其中两人在鬼市（排行演示用）
  S.t+=60;play('004','4S','lose');pickup('004');checkIn('004','wuchang');confirmIn('004','mengpo');
  S.t+=60;play('007','4H','lose');pickup('007');checkIn('007','wuchang');confirmIn('007','mengpo');
  const TOP=['002','001','005','004','003','006','007','008','010','009'],TS=[3600,3300,3000,2800,2500,2300,2100,1900,1700,1500];
  S.players.forEach(p=>{const i=TOP.indexOf(p.id);p.score=i>=0?TS[i]:Math.min(p.score,1400);});
  if(fz){S.t=(S.dur||DUR0)-FREEZE_SEC;log('演示数据（封榜）：离结束还有 15 分钟，排行榜已封，玩家和大屏看不到名次');return;}
  S.t=7320;log('演示数据（抽奖前）：时间已截止，'+drawPool().filter(p=>ticketsOf(p)>0).length+' 人有彩券，还没开始抽');
}
const seed=w=>w==='start'?seedStart():w==='freeze'?seedFinal('freeze'):w==='pre'?seedFinal():seedMid();
export function newGame(demo){init();if(demo)seed(demo);return S;}

// Which roles may perform each action. 总控只做自己页面上的事（金币、名单、发布、设置），不代替其他工作人员操作。
const ROLE_OK={setrule:['dealer','ctrl'],settiers:['dealer','ctrl'],enter:['dealer'],finish:['dealer'],resetdone:['dealer'],kick:['dealer'],
  setcap:['ctrl'],setgaten:['ctrl'],setpuzcap:['ctrl'],setdrawloc:['judge','ctrl'],setcapon:['ctrl'],setdur:['ctrl'],setscore:['ctrl'],setcards:['ctrl'],seton:['ctrl'],addplayers:['ctrl'],setbank:['ctrl'],
  publish:['ctrl','judge'],revoke:['ctrl','judge'],
  gatewin:['judge'],gateunwin:['judge'],gatereward:['judge'],gateend:['judge'],puz:['judge'],puzundo:['judge'],
  pickup:['wuchang'],checkin:['wuchang','mengpo'],confirm:['mengpo'],
  redeem:['mengpo'],ransom:['mengpo'],soup:['mengpo'],
  'draw.add':['judge'],'draw.edit':['judge'],'draw.del':['judge'],'draw.move':['judge'],'draw.run':['judge'],'draw.confirm':['judge'],
  'draw.redo':['judge'],'draw.undo':['judge'],'draw.screen':['ctrl','judge'],'draw.lock':['ctrl','judge'],'draw.jscr':['ctrl'],'draw.show':['judge'],
  ack:['player'],nick:['player','ctrl'],offline:['dealer','judge','mengpo','wuchang']};

// Apply one action from one signed-in person. Returns {ok,msg}.
export function apply(state,me,a){
  use(state);
  const roles=a&&ROLE_OK[a.type];
  if(!roles)return no('未知操作');
  if(!roles.includes(me.role))return no('你的身份不能做这个操作');
  if(me.role==='judge'&&(a.type==='draw.screen'||a.type==='draw.lock')&&!S.judgeScr)return no('总控没有把切换大屏 / 锁定排名交给判官');
  if(me.role==='dealer'&&Array.isArray(me.rooms)&&['enter','finish','resetdone','kick','setrule','settiers'].includes(a.type)&&!me.rooms.includes(a.rid))return no('这个房间不归你管，只能操作：'+me.rooms.map(r=>room(r).card).join(' '));
  switch(a.type){
    case 'enter':return enterRoom(a.rid,a.pids||a.pid);
    case 'finish':return finishRoom(a.rid,a.results||{});
    case 'resetdone':return resetDone(a.rid);
    case 'kick':return kickOut(a.rid,a.pid);
    case 'setcap':return setCap(a.v);
    case 'setcapon':return setCapOn(a.v);
    case 'setdur':return setDur(a.secs);
    case 'setgaten':return setGateN(a.v);
    case 'setpuzcap':return setPuzCap(a.v);
    case 'setdrawloc':return setDrawLoc(a.text);
    case 'setscore':return setScore(a.pid,a.v,a.why);
    case 'setcards':return setCards(a.pid,a.cards);
    case 'seton':return setOn(a.pid,a.on);
    case 'addplayers':return addPlayers(a.n);
    case 'setbank':return setBank(a.rows);
    case 'setrule':return setRule(a.rid,a.text);
    case 'settiers':return setTiers(a.rid,a.text);
    case 'publish':if(me.role==='judge'&&!(a.f&&a.f.kind==='鬼门开'))return no('判官只能发布鬼门开');return publish(a.f);
    case 'revoke':return revokeNotice(+a.nid);
    case 'gatewin':return gateWin(a.pid,!!a.force);
    case 'gateunwin':return gateUnwin(a.pid);
    case 'gatereward':return gateReward(a.pid,a.kind,a.arg);
    case 'gateend':return gateEnd();
    case 'puz':return puzRedeem(a.pid,a.code);
    case 'puzundo':return puzUndo(a.pid,a.key);
    case 'pickup':return pickup(a.pid);
    case 'checkin':return checkIn(a.pid,me.role);
    case 'confirm':return confirmIn(a.pid,me.role);
    case 'redeem':return selfRedeem(a.pid);
    case 'ransom':return ransom(a.pid,a.by);
    case 'soup':return soup(a.pid);
    case 'draw.add':return drawAdd(a.f);
    case 'draw.edit':return drawEdit(a.id,a.f);
    case 'draw.del':return drawDel(a.id);
    case 'draw.move':return drawMove(a.id,a.d);
    case 'draw.run':return drawRun(a.id);
    case 'draw.confirm':return drawConfirm(a.id);
    case 'draw.redo':return drawRedo(a.id);
    case 'draw.undo':return drawUndo(a.id);
    case 'draw.screen':return drawScreen(!!a.on);
    case 'draw.lock':return drawLock(a.on);
    case 'draw.jscr':return drawJscr(a.on);
    case 'draw.show':return drawShow(a.id);
    case 'ack':if(!me.pid)return no('只有玩家需要确认通知');ack(+a.nid,me.pid);return ok('');
    case 'nick':return setNick(me.role==='player'?me.pid:a.pid,a.nick);
    case 'offline':return offImport(me,a.rows);
  }
}

// What one person is allowed to see. A player sees only their own notices and the broadcast lines of the log.
// 玩家和大屏：揭晓中的金币大亨奖只发已揭晓的名次；封榜期间不发别人（大屏：所有人）的金币
function hideDraw(state,pid){const fz=frozen();
  const out={};
  if(fz)out.players=state.players.map(x=>x.id===pid?x:{...x,score:0,...(pid==null?{}:{hist:[],puz:[]})});
  return out;}
const STAFF_LOG=300;   // 工作人员页最多看 300 行日志（全场日志页也只显示 300 行）；完整日志留在服务器
export function viewFor(state,me){
  use(state);
  const lg=state.log.length>STAFF_LOG?state.log.slice(0,STAFF_LOG):state.log;
  if(me.role==='screen')return {...state,log:lg,bank:{},rules:{},...hideDraw(state,null)};
  if(['ctrl','judge','dev'].includes(me.role))return lg===state.log?state:{...state,log:lg};
  if(me.role!=='player')return {...state,log:lg,bank:{}};   // 题库（含答案）只给判官和总控
  const p=state.players.find(x=>x.id===me.pid);
  return {...state,bank:{},rules:{},log:state.log.filter(isBcast).slice(0,30),notices:state.notices.filter(n=>p&&matches(n,p)),
    players:state.players.map(x=>x.id===me.pid?x:{...x,hist:[],puz:[]}),...hideDraw(state,me.pid)};
}

export {setPlayerCount,roomRule,tiersOf,noticeStale,staffSees,puzCode,timeUp,MARKET_WAIT,needsReset,whyNotEnter,eliminate,soup,puzInfo,ticketsOf,drawPool,KIND_NAME,frozen,FREEZE_SEC,
  ranking,suitsOf,stLabel,inMk,pl,nm,matches,targetLabel,room,fmt,esc,log,no,
  OFF_KINDS,ROOMS,SUITS,GATES,TK_COIN,TK_SUITS,TK_ALL,CHIP_START,CHIP_GOAL,RANSOM,PUZ_PTS,PUZ_CAP,GATE_WIN,GATE_COIN,GATE_LOC0,DRAW_LOC0,gateN,puzCapOf,drawLoc,ROOM_CAP0,DEMOS};
