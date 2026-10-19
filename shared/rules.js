// 百鬼夜行 · game rules（v3：个人赛，2026-10-16）。
// Shared by the server (authoritative: every action runs here) and the browser (read-only helpers for display).
// To change a rule, change it here only.
export let S;
export function use(state){S=state;}
// 4 种花色各有 简单(4) / 困难(8) 两间房，共 8 间。成功得 n×100 冥币和该花色；每人每间房最多成功一次。
const ROOMS=[
  {id:'4S',card:'♠4',suit:'♠',n:4,name:'一二三纸扎人',rule:'木头人玩法。Dealer 扮纸扎人，转身时还在动的人回起点。'},
  {id:'8S',card:'♠8',suit:'♠',n:8,name:'奈何桥',rule:'格子布上的安全路线只亮几秒，凭记忆走过，踩错回起点。'},
  {id:'4H',card:'♥4',suit:'♥',n:4,name:'少数派',rule:'每轮匿名选红 / 黑，少数派得分，可 bluff。'},
  {id:'8H',card:'♥8',suit:'♥',n:8,name:'孟婆的交易',rule:'玩法待定。'},
  {id:'4C',card:'♣4',suit:'♣',n:4,name:'冥界传话',rule:'Relay Drawing，一路画下去，最后一人猜。'},
  {id:'8C',card:'♣8',suit:'♣',n:8,name:'心有灵犀',rule:'两组背对背答相同问题，答对越多越好。'},
  {id:'4D',card:'♦4',suit:'♦',n:4,name:'生死簿',rule:'30 秒看桌上物品，盖布后回答问题。'},
  {id:'8D',card:'♦8',suit:'♦',n:8,name:'符咒密码',rule:'倒计时内从真假 clue 里破解密码锁。'}];
const SUITS=['♠','♦','♣','♥'];
// 身份卡：编号 001 起，起始房间按编号轮流分配（56 张 = 每间 7 张）。
const N_PLAYERS=56;
const pidOf=i=>String(i).padStart(3,'0');
// 解谜题题库（占位，正式内容待定）
const PUZZLES=Array.from({length:8},(_,i)=>({id:'z'+(i+1),title:'解谜题 占位 '+(i+1)}));
// 鬼门开题库（占位）
const GATES=Array.from({length:2},(_,i)=>({id:'g'+(i+1),title:'鬼门开 占位 '+(i+1),body:'（占位文字，正式内容待定）'}));
const FINAL_MSG='你已获得晋级资格！请到大房间集合，参加鬼市大拍卖。';
const FINAL_SCORE=2000;           // 时间截止时攒够 2000 冥币
const CHIP_START=200, CHIP_GOAL=500, CARRY_MAX=100, RANSOM=500;   // 鬼市：领 200 筹码，赚到 500 自赎，可带出最多 100；别人花 500 赎你
const PUZ_PTS=100, PUZ_CAP=400;   // 解谜题 100 / 题，每人最多 400
const GATE_WIN=3, GATE_COIN=300;  // 鬼门开：最先完成的 3 人，每人选 300 冥币 / 救一个人 / 拿一个花色
const ROOM_CAP0=6, START_ONLY=600, DUR0=7200, MARKET_GRACE=900;  // 房间默认容量；前 10 分钟只能进起始房间；主游戏 2 小时；鬼市复活名额在时间截止后再留 15 分钟
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
const now=()=>S.now||0;           // 真实时间（毫秒），服务器在每次操作前设置；拍卖倒计时用它，不受游戏计时暂停影响

function mkPlayer(i){return {id:pidOf(i),nick:'',on:false,start:ROOMS[(i-1)%ROOMS.length].id,st:'alive',score:0,cards:[],cleared:[],inRoom:null,hist:[],puz:[],
  outAt:null,inAt:null,pickAt:null,at:'',chk:null,chips:0,won:null};}
function init(){
  S={v:3,t:0,now:0,dur:DUR0,cap:ROOM_CAP0,capOn:false,gp:null,fin:null,log:[],notices:[],nid:1,
     rooms:ROOMS.map(r=>({id:r.id,st:'open',at:0,ps:[]})),players:[],
     auc:{lots:[],cur:null,screen:'game',lid:1}};
  for(let i=1;i<=N_PLAYERS;i++)S.players.push(mkPlayer(i));
  log('游戏开始');
}
// 旧版本的存档（队伍制）不能继续用，需要重置。
const needsReset=st=>!st||st.v!==3||!Array.isArray(st.rooms)||st.rooms.length!==ROOMS.length||st.rooms.some((r,i)=>r.id!==ROOMS[i].id);
const timeUp=()=>S.t>=(S.dur||DUR0);
const marketShut=()=>S.t>=(S.dur||DUR0)+MARKET_GRACE;   // 截止 15 分钟后：停止发放复活名额
const active=()=>S.players.filter(p=>p.on);
const suitsOf=p=>SUITS.filter(x=>p.cards.includes(x));
// 排名：冥币多的在前；同分花色多的在前；再按编号
const ranking=()=>active().slice().sort((a,b)=>b.score-a.score||suitsOf(b).length-suitsOf(a).length||a.id.localeCompare(b.id));

// ---------- 通知 ----------
function matches(n,p){
  switch(n.target){case 'all':case 'everyone':return true;case 'player':return n.ids.includes(p.id);
  case 'market':return p.st==='market';case 'alive':return p.st==='alive';case 'final':return !!(S.fin&&S.fin.includes(p.id));}return false;}
// 已经结束的鬼门开不再弹全屏
const noticeStale=n=>n.sub==='gate'&&!(S.gp&&S.gp.nid===n.id);
const staffSees=n=>n.target==='staff'||n.target==='everyone'||n.sub==='gate';
function targetLabel(n){return n.target==='all'?'全体玩家':n.target==='player'?(n.ids.length<=4?n.ids.join('、'):n.ids.slice(0,3).join('、')+' 等 '+n.ids.length+' 人'):n.target==='market'?'鬼市中的人':n.target==='staff'?'工作人员':n.target==='everyone'?'所有人':n.target==='final'?'晋级资格者':'存活玩家';}
function pushNotice(o){S.notices.unshift({id:S.nid++,sub:o.sub||null,tone:o.tone||'',t:S.t,kind:o.kind,title:o.title,body:o.body,target:o.target,ids:o.ids||[],due:o.mins?S.t+o.mins*60:null,acks:{}});}
const tell=(pid,title,body,tone)=>pushNotice({kind:'通知',title,body,target:'player',ids:[pid],tone});
// 公告：发给任意对象。鬼门开：发给全场，最先完成的 3 人有奖励。
function publish(f){f=f||{};const str=(v,n)=>String(v==null?'':v).slice(0,n);f={...f,title:str(f.title,80),body:str(f.body,1000)};
  if(!KINDS.includes(f.kind))return no('类型不对');
  let target=f.target,ids=[],sub=null;
  if(f.kind==='鬼门开'){
    const g=GATES.find(x=>x.id===f.gate);if(g){f.title=g.title;f.body=g.body;}
    if(!f.title.trim())return no('先从题库选一个鬼门开');
    if(S.gp)return no('鬼门开正在进行，先结束上一轮');
    target='all';sub='gate';
  }else{
    if(!['all','player','alive','market','staff','everyone','final'].includes(target))return no('发布对象不对');
    if(!f.title.trim())return no('先写标题');
    if(target==='final'&&!S.fin)return no('晋级名单还没锁定，发给「晋级资格者」没有人能收到');
    if(target==='player'){const want=Array.isArray(f.players)?f.players:f.player?[f.player]:[];ids=[...new Set(want)].filter(id=>pl(id));if(!ids.length)return no('先选玩家');}
  }
  pushNotice({kind:f.kind,sub,title:f.title.trim(),body:f.body.trim(),target,ids,mins:Math.max(0,+f.mins||0)});
  const n=S.notices[0];
  if(sub==='gate'){S.gp={nid:n.id,wins:[]};log('鬼门开「'+n.title+'」开启：最先完成的 '+GATE_WIN+' 人有奖励','hook',1);}
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
  if(S.fin)return '已进入晋级阶段';
  if(timeUp())return '时间到，房间已关闭';
  if(r.st==='reset')return '房间重置中';
  if(p.inRoom)return p.inRoom===rid?'已经在这间房里':'正在 '+room(p.inRoom).card;
  if(p.cleared.includes(rid))return '已成功过这间房';
  if(S.t<START_ONLY&&p.start!==rid)return '前 '+START_ONLY/60+' 分钟只能进起始房间 '+room(p.start).card;
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
// 结算：每人 win / lose / leave（中途离开，不算输赢）。赢：+n×100 + 花色；输：进入淘汰流程（等黑白无常）。
function finishRoom(rid,results){
  const r=room(rid),st=S.rooms.find(x=>x.id===rid);results=results||{};
  if(!st||!st.ps.length)return no('房间里没有人');
  for(const id of st.ps)if(!['win','lose','leave'].includes(results[id]))return no('请为 '+nameOf(id)+' 选择赢 / 输 / 离开');
  const notes=[];
  for(const id of st.ps){const p=pl(id),res=results[id];p.inRoom=null;
    const h=p.hist.filter(x=>x.rid===rid&&x.res===null).pop()||(p.hist[p.hist.length]={rid,t0:st.at,res:null,pts:0});h.t1=S.t;h.res=res;
    if(res==='win'){const pts=r.n*100;p.score+=pts;h.pts=pts;if(!p.cleared.includes(rid))p.cleared.push(rid);if(!p.cards.includes(r.suit))p.cards.push(r.suit);
      log(nm(p)+' 赢下 '+r.card+'，+'+pts+' 冥币','back',1);notes.push(p.id+' 赢');}
    else if(res==='lose'){eliminate(p,'挑战 '+r.card+' 失败',r.card+' '+r.name);notes.push(p.id+' 输');}
    else{log(nm(p)+' 中途离开 '+r.card);notes.push(p.id+' 离开');}}
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
// 状态：alive 在场 · out 刚失败，原地等黑白无常 · picked 已被黑白无常接到 · market 在鬼市（钱包冻结，玩筹码）
const stLabel=p=>({alive:'在场',out:'待接',picked:'已接到',market:'鬼市'})[p.st]||p.st;
function eliminate(p,why,where){
  if(p.inRoom){const r=S.rooms.find(x=>x.id===p.inRoom);r.ps=r.ps.filter(x=>x!==p.id);if(!r.ps.length&&r.st==='play')r.st='open';p.inRoom=null;}
  p.st='out';p.outAt=S.t;p.inAt=null;p.pickAt=null;p.chk=null;p.chips=0;p.at=where||'';
  log(nm(p)+' '+why+'，原地等黑白无常','hook',1);
  tell(p.id,'挑战失败','原因：'+why+'。请留在原地，等黑白无常来接你去鬼市。','out');}
function pickup(pid){const p=pl(pid);
  if(!p)return no('没有这个编号');if(p.st!=='out')return no(p.id+(p.st==='picked'?' 已经接到了':' 现在不在待接状态'));
  p.st='picked';p.pickAt=S.t;log('黑白无常接到 '+nm(p)+(p.at?'（'+p.at+'）':''));return ok('已接到 '+p.id);}
// 两方交接：黑白无常「送入鬼市」→ 孟婆确认；孟婆「登记」→ 黑白无常确认。
function checkIn(pid,role){const p=pl(pid);
  if(!p)return no('没有这个编号');if(p.chk&&!p.chk.ok)return no('已登记，等待另一方确认');
  if(p.st!=='out'&&p.st!=='picked')return no('不在待入鬼市状态');
  if(role==='wuchang'&&p.st==='out'){p.st='picked';p.pickAt=S.t;}
  p.chk={by:role,ok:false};log(nm(p)+' 入鬼市登记，等待'+(role==='wuchang'?'孟婆':'黑白无常')+'确认');
  return ok('已登记，等待另一方确认');}
function confirmIn(pid,role){const p=pl(pid);
  if(!p||!['out','picked'].includes(p.st)||!p.chk)return no('没有待确认的登记');if(p.chk.ok)return no('已经确认过了');
  const expected=p.chk.by==='mengpo'?'wuchang':p.chk.by==='wuchang'?'mengpo':null;
  if(!expected||role!==expected)return no('要由另一方确认，不能自己确认自己的登记');
  if(p.pickAt==null)p.pickAt=S.t;
  p.st='market';p.inAt=S.t;p.chips=CHIP_START;p.chk.ok=true;p.chk.by2=role;
  log(nm(p)+' 进入鬼市，钱包冻结，领 '+CHIP_START+' 筹码','back');
  tell(p.id,'你已进入鬼市','你的冥币已冻结。领到 '+CHIP_START+' 筹码去赌局：筹码赚到 '+CHIP_GOAL+' 就能自赎（可带出最多 '+CARRY_MAX+'）；输光了可以喝孟婆汤免费复活，但会随机忘掉一个花色。');
  return ok('已确认 '+p.id+' 入鬼市');}
function backAlive(p){p.st='alive';p.outAt=null;p.inAt=null;p.pickAt=null;p.chk=null;p.at='';p.chips=0;}
const inMk=p=>p&&p.st==='market'&&!(p.chk&&!p.chk.ok);
// 孟婆记筹码
function setChips(pid,v){const p=pl(pid);if(!inMk(p))return no('该玩家不在鬼市');
  const c=Math.round(+v);if(!Number.isFinite(c)||c<0)return no('筹码要是不小于 0 的整数');if(c===p.chips)return no('筹码没有变化');
  const old=p.chips;p.chips=c;log('孟婆记 '+nm(p)+' 筹码 '+old+' → '+c);return ok(p.id+' 筹码记为 '+c);}
// 自赎：筹码 ≥ 500，超出部分最多 100 带回冥币
function selfRedeem(pid){const p=pl(pid);if(!inMk(p))return no('该玩家不在鬼市');
  if(marketShut())return no('已停止发放复活名额');
  if(p.chips<CHIP_GOAL)return no(p.id+' 筹码 '+p.chips+'，还差 '+(CHIP_GOAL-p.chips));
  const carry=Math.min(CARRY_MAX,p.chips-CHIP_GOAL);p.score+=carry;backAlive(p);
  log(nm(p)+' 在鬼市赢够筹码，自赎回到人间'+(carry?'，带出 '+carry+' 冥币':''),'back',1);
  tell(p.id,'自赎成功','你回到了人间'+(carry?'，带出 '+carry+' 冥币':'')+'。钱包已解冻。');
  return ok(p.id+' 已自赎'+(carry?'，带出 '+carry:''));}
// 赎人：任何存活的人花 500 冥币把鬼市里的人赎出来
function ransom(pid,byId){const p=pl(pid),by=pl(byId);if(!inMk(p))return no('该玩家不在鬼市');
  if(marketShut())return no('已停止发放复活名额');
  if(!by)return no('先输入出钱人的编号');if(by.id===p.id)return no('不能自己赎自己（自赎看筹码）');
  if(by.st!=='alive')return no(by.id+' 不在场，不能出钱');
  if(by.score<RANSOM)return no(by.id+' 只有 '+by.score+' 冥币，不够 '+RANSOM);
  by.score-=RANSOM;backAlive(p);
  log(nm(by)+' 花 '+RANSOM+' 冥币把 '+nm(p)+' 从鬼市赎了出来','back',1);
  tell(p.id,'有人赎你','你被 '+nm(by)+' 花 '+RANSOM+' 冥币赎了出来，钱包已解冻。');
  tell(by.id,'赎人成功','你花 '+RANSOM+' 冥币赎出了 '+nm(p)+'。');
  return ok(by.id+' 赎出 '+p.id+'，扣 '+RANSOM+' 冥币');}
// 孟婆汤：筹码输光 → 免费复活，但随机忘掉一个花色（rnd 只给测试用）
function soup(pid,rnd){const p=pl(pid);if(!inMk(p))return no('该玩家不在鬼市');
  if(marketShut())return no('已停止发放复活名额');
  if(p.chips>0)return no(p.id+' 还有 '+p.chips+' 筹码，输光了才能喝孟婆汤');
  let lost=null;if(p.cards.length){const i=Math.floor((rnd==null?Math.random():rnd)*p.cards.length)%p.cards.length;lost=p.cards.splice(i,1)[0];
    p.cleared=p.cleared.filter(id=>room(id).suit!==lost);}   // 忘掉的花色可以再去同花色的房间赢回来
  backAlive(p);
  log(nm(p)+' 喝下孟婆汤复活'+(lost?'，忘掉了 '+lost:''),'back',1);
  tell(p.id,'喝下孟婆汤','你免费复活了'+(lost?'，但忘掉了花色 '+lost+'（同花色的房间可以再挑战）':'')+'。钱包已解冻。');
  return ok(p.id+' 已复活'+(lost?'，忘掉 '+lost:''));}

// ---------- 解谜题 ----------
function puzInfo(p){const used=p.puz.reduce((a,r)=>a+r.pts,0);return {used,left:Math.max(0,PUZ_CAP-used),cap:PUZ_CAP};}
function puzRedeem(pid,zid,title){const p=pl(pid);if(!p)return no('没有这个编号');
  let key,t;const z=PUZZLES.find(x=>x.id===zid);
  if(z){key=z.id;t=z.title;}else{t=String(title||'').trim().slice(0,40);if(!t)return no('先选题目，或写自定义题目');key='x:'+t;}
  if(p.st!=='alive')return no(p.id+' 不在场（'+stLabel(p)+'）');
  if(p.puz.some(r=>r.k===key))return no(p.id+' 已经兑换过这道题');
  const i=puzInfo(p);if(i.left<=0)return no(p.id+' 解谜题已达上限 '+PUZ_CAP);
  const pts=Math.min(PUZ_PTS,i.left);p.puz.push({k:key,title:t,t:S.t,pts});p.score+=pts;p.on=true;
  log('判官记录 '+nm(p)+' 解出「'+t+'」，+'+pts+' 冥币','back');
  return ok(p.id+' +'+pts+' 冥币（解谜题累计 '+(i.used+pts)+' / '+PUZ_CAP+'）');}
function puzUndo(pid,key){const p=pl(pid);if(!p)return no('没有这个编号');const i=p.puz.findIndex(r=>r.k===key);if(i<0)return no('没有这条记录');
  const r=p.puz.splice(i,1)[0];p.score=Math.max(0,p.score-r.pts);log('判官撤销 '+nm(p)+' 的解谜「'+r.title+'」，扣回 '+r.pts);return ok('已撤销，扣回 '+r.pts);}

// ---------- 鬼门开 ----------
// 判官按顺序记录最先完成的 3 人；每人再选奖励：coin +300 · save 救一个不在场的人 · suit 拿一个花色
function gateWin(pid){const g=S.gp;if(!g)return no('现在没有进行中的鬼门开');const p=pl(pid);if(!p)return no('没有这个编号');
  if(g.wins.some(w=>w.pid===pid))return no(p.id+' 已经记过了');if(g.wins.length>=GATE_WIN)return no('已经有 '+GATE_WIN+' 人完成');
  if(p.st!=='alive')return no(p.id+' 不在场');
  g.wins.push({pid,t:S.t,rw:null});p.on=true;const n=S.notices.find(x=>x.id===g.nid);
  log(nm(p)+' 第 '+g.wins.length+' 个完成鬼门开「'+(n?n.title:'')+'」','back',1);
  tell(p.id,'鬼门开：你是第 '+g.wins.length+' 名','找判官选奖励：'+GATE_COIN+' 冥币 / 救一个人 / 拿一个花色。');
  return ok(p.id+' 记为第 '+g.wins.length+' 名，请选奖励');}
function gateUnwin(pid){const g=S.gp;if(!g)return no('现在没有进行中的鬼门开');const i=g.wins.findIndex(w=>w.pid===pid);if(i<0)return no('没有这条记录');
  if(g.wins[i].rw)return no('已经发过奖励，不能撤销');g.wins.splice(i,1);log('判官撤销 '+nameOf(pid)+' 的鬼门开名次');return ok('已撤销');}
function gateReward(pid,kind,arg){const g=S.gp;if(!g)return no('现在没有进行中的鬼门开');const w=g.wins.find(x=>x.pid===pid);if(!w)return no('这个人不在完成名单里');
  if(w.rw)return no('已经领过奖励');const p=pl(pid);
  if(kind==='coin'){p.score+=GATE_COIN;w.rw={k:'coin'};log(nm(p)+' 鬼门开奖励：+'+GATE_COIN+' 冥币','back',1);}
  else if(kind==='save'){const q=pl(arg);if(!q)return no('先选要救的人');if(q.st==='alive')return no(q.id+' 本来就在场');
    if(marketShut())return no('已停止发放复活名额');
    backAlive(q);w.rw={k:'save',pid:q.id};
    log(nm(p)+' 用鬼门开奖励救出了 '+nm(q),'back',1);tell(q.id,'有人救了你',nm(p)+' 用鬼门开奖励把你救了回来。');}
  else if(kind==='suit'){if(!SUITS.includes(arg))return no('先选花色');if(p.cards.includes(arg))return no(p.id+' 已经有 '+arg);
    p.cards.push(arg);w.rw={k:'suit',s:arg};log(nm(p)+' 鬼门开奖励：拿到花色 '+arg,'back',1);}
  else return no('先选奖励');
  if(g.wins.length>=GATE_WIN&&g.wins.every(x=>x.rw))gateEnd(true);
  return ok('奖励已发放');}
function gateRec(){const g=S.gp,n=g&&S.notices.find(x=>x.id===g.nid);if(n)n.gr=g.wins.map(w=>({...w}));}
function gateEnd(auto){if(!S.gp)return no('现在没有进行中的鬼门开');gateRec();S.gp=null;log('鬼门开结束'+(auto?'（3 人奖励已发完）':''),'',1);return ok('鬼门开已结束');}

// ---------- 晋级资格 ----------
function finalMiss(p){const m=[],miss=SUITS.filter(x=>!p.cards.includes(x));
  if(p.st!=='alive')m.push('不在场（'+stLabel(p)+'）');
  if(miss.length)m.push('缺花色 '+miss.join(''));
  if(p.score<FINAL_SCORE)m.push('冥币 '+p.score+' / '+FINAL_SCORE);
  return m;}
const qualifies=p=>!finalMiss(p).length;
// 总控锁定资格名单（时间截止后，8:00–8:15 验证）；之后可以手动加 / 减
function lockFinal(){if(S.fin)return no('资格名单已经锁定');S.fin=active().filter(qualifies).map(p=>p.id);
  S.fin.forEach(id=>tell(id,'获得晋级资格',FINAL_MSG,'final'));
  log('晋级资格名单锁定：'+S.fin.length+' 人','back',1);return ok('已锁定 '+S.fin.length+' 人');}
function unlockFinal(){if(!S.fin)return no('还没有锁定');if(S.auc.lots.some(l=>l.st!=='wait'))return no('拍卖已经开始，不能解锁');S.fin=null;log('总控解锁晋级资格名单');return ok('已解锁');}
function setFinal(pid,on){if(!S.fin)return no('先锁定资格名单');const p=pl(pid);if(!p)return no('没有这个编号');
  const has=S.fin.includes(pid);if(!!on===has)return no(p.id+(has?' 已在名单里':' 本来就不在名单里'));
  if(on){S.fin.push(pid);tell(pid,'获得晋级资格',FINAL_MSG,'final');log('总控把 '+nm(p)+' 加入晋级名单（'+(finalMiss(p).join('，')||'条件已满足')+'）');}
  else{S.fin=S.fin.filter(x=>x!==pid);log('总控把 '+nm(p)+' 移出晋级名单');}
  return ok(on?'已加入':'已移出');}

// ---------- 拍卖（判官主持） ----------
// 拍品状态：wait 待拍 · open 出价中（倒计时，可暂停）· closed 已截止待揭晓 · done 已成交 · pass 流拍
// 倒计时用真实时间 S.now（毫秒）；l.end 截止时刻，暂停时 l.left 存剩余毫秒。
const lot=id=>S.auc.lots.find(l=>l.id===id);
const curLot=()=>S.auc.cur?lot(S.auc.cur):null;
const lotLeft=l=>!l||l.st!=='open'?0:l.left!=null?l.left:Math.max(0,l.end-now());
function aucAdd(f){f=f||{};const name=String(f.name||'').trim().slice(0,40);if(!name)return no('先写拍品名称');
  const start=Math.max(0,Math.round(+f.start||0));
  S.auc.lots.push({id:'L'+(S.auc.lid++),name,desc:String(f.desc||'').trim().slice(0,200),start,big:!!f.big,st:'wait',bids:{},bad:[],win:null,price:0,end:0,left:null,secs:0});
  return ok('已添加拍品「'+name+'」');}
function aucEdit(id,f){const l=lot(id);if(!l)return no('没有这件拍品');if(l.st!=='wait')return no('只能改待拍的拍品');
  const name=String((f&&f.name)||'').trim().slice(0,40);if(!name)return no('先写拍品名称');
  l.name=name;l.desc=String(f.desc||'').trim().slice(0,200);l.start=Math.max(0,Math.round(+f.start||0));l.big=!!f.big;return ok('已保存');}
function aucDel(id){const l=lot(id);if(!l)return no('没有这件拍品');if(l.st!=='wait')return no('只能删待拍的拍品');
  S.auc.lots=S.auc.lots.filter(x=>x!==l);if(S.auc.cur===id)S.auc.cur=null;return ok('已删除「'+l.name+'」');}
function aucMove(id,d){const a=S.auc.lots,i=a.findIndex(l=>l.id===id),j=i+(d<0?-1:1);if(i<0||j<0||j>=a.length)return no('不能再移了');[a[i],a[j]]=[a[j],a[i]];return ok('');}
function aucOpen(id,secs){const l=lot(id);if(!l)return no('没有这件拍品');if(l.st!=='wait')return no('这件拍品不是待拍状态（要重来请用「重拍」）');
  if(!S.fin)return no('先由总控锁定晋级资格名单');
  const c=curLot();if(c&&(c.st==='open'||c.st==='closed'))return no('「'+c.name+'」还没结束');
  secs=Math.round(+secs);if(!(secs>=10&&secs<=3600))return no('倒计时要在 10 秒到 60 分钟之间');
  l.st='open';l.bids={};l.bad=[];l.win=null;l.price=0;l.secs=secs;l.end=now()+secs*1000;l.left=null;S.auc.cur=l.id;S.auc.screen='auction';
  log('判官开拍「'+l.name+'」，倒计时 '+fmtSecs(secs),'',1);return ok('已开拍，倒计时 '+fmtSecs(secs));}
const fmtSecs=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function aucTime(op,id){const l=lot(id)||curLot();if(!l||l.st!=='open')return no('没有出价中的拍品');
  if(op==='add'){if(l.left!=null)l.left+=30000;else l.end=Math.max(l.end,now())+30000;return ok('+30 秒');}
  if(op==='pause'){if(l.left!=null)return no('已经暂停了');l.left=Math.max(0,l.end-now());return ok('已暂停');}
  if(op==='resume'){if(l.left==null)return no('没有暂停');l.end=now()+l.left;l.left=null;return ok('已继续');}
  if(op==='close'){l.st='closed';l.left=null;l.end=Math.min(l.end,now());log('「'+l.name+'」截止出价，共 '+Object.keys(l.bids).length+' 人出价');return ok('已截止，等待揭晓');}
  return no('未知操作');}
// 倒计时到 0 的拍品自动视为截止（不靠定时器：每次操作 / 显示时派生）
function aucSweep(){S.auc.lots.forEach(l=>{if(l.st==='open'&&l.left==null&&now()>=l.end){l.st='closed';log('「'+l.name+'」倒计时结束，共 '+Object.keys(l.bids).length+' 人出价');}});}
const lotState=l=>l&&l.st==='open'&&l.left==null&&now()>=l.end?'closed':l&&l.st;
function whyNotBid(pid,l){const p=pl(pid);
  if(!l||lotState(l)!=='open')return '现在没有可以出价的拍品';
  if(l.left!=null)return '拍卖暂停中';
  if(!S.fin||!S.fin.includes(pid))return '你没有晋级资格';
  if(!p||p.st!=='alive')return '你不在场';
  if(p.won)return '你已经拍到一件了（每人最多 1 件）';
  return null;}
function bid(pid,id,v){const l=lot(id),why=whyNotBid(pid,l);if(why)return no(why);const p=pl(pid);
  v=Number(v);if(!Number.isInteger(v)||v<0)return no('出价要是整数');
  if(v<l.start)return no('起拍价是 '+l.start);if(v>p.score)return no('你只有 '+p.score+' 冥币');
  l.bids[pid]={v,t:now()};return ok('已出价 '+v+'（截止前可以改，以最后一次为准）');}
// 排序：价高者先；同价先出价者先；剔除被作废的人、已不在晋级名单的人、拍到过别的拍品的人、钱不够的人
function bidOrder(l){return Object.entries(l.bids).map(([pid,b])=>({pid,...b}))
  .filter(b=>!l.bad.includes(b.pid)&&S.fin&&S.fin.includes(b.pid)&&pl(b.pid)&&!(pl(b.pid).won&&pl(b.pid).won!==l.id)&&pl(b.pid).score+(l.win===b.pid?l.price:0)>=b.v)
  .sort((a,b)=>b.v-a.v||a.t-b.t);}
function settle(l){const top=bidOrder(l)[0];
  if(!top){l.st='pass';l.win=null;l.price=0;log('「'+l.name+'」流拍','',1);return '流拍';}
  const p=pl(top.pid);p.score-=top.v;p.won=l.id;l.win=p.id;l.price=top.v;l.st='done';
  log(nm(p)+' 以 '+top.v+' 冥币拍得「'+l.name+'」','back',1);tell(p.id,'你拍到了「'+l.name+'」','成交价 '+top.v+' 冥币，已从你的冥币里扣除。请到台前领取。','final');
  return nm(p)+' '+top.v;}
function refund(l){if(l.win){const p=pl(l.win);if(p){p.score+=l.price;if(p.won===l.id)p.won=null;}}l.win=null;l.price=0;}
function aucReveal(id){const l=lot(id)||curLot();if(!l)return no('没有这件拍品');
  if(lotState(l)==='open')return no('还在出价中，先截止');if(l.st==='wait')return no('这件还没开拍');if(l.st!=='closed'&&l.st!=='open')return no('这件已经揭晓过了');
  l.st='closed';const r=settle(l);return ok('揭晓：'+r);}
// 得主不在场：作废，顺延给下一位
function aucVoid(id){const l=lot(id)||curLot();if(!l||l.st!=='done')return no('只有已成交的拍品能作废得主');
  const old=l.win;refund(l);l.bad.push(old);log('「'+l.name+'」得主 '+nameOf(old)+' 作废（不在场），顺延');
  const r=settle(l);return ok('已作废 '+old+'，顺延：'+r);}
// 重拍：作废全部出价，回到待拍；已成交的退款
function aucRedo(id){const l=lot(id)||curLot();if(!l)return no('没有这件拍品');if(l.st==='wait')return no('这件还没拍过');
  refund(l);l.st='wait';l.bids={};l.bad=[];l.end=0;l.left=null;log('「'+l.name+'」重拍','',1);return ok('已重置为待拍，重新开拍即可');}
function aucScreen(on){S.auc.screen=on?'auction':'game';return ok(on?'大屏切到拍卖':'大屏切回游戏');}
function aucShow(id){const l=lot(id);if(!l)return no('没有这件拍品');const c=curLot(),cs=c&&lotState(c);
  if(c&&c!==l&&(cs==='open'||cs==='closed'))return no('「'+c.name+'」'+(cs==='open'?'还在出价中':'还没揭晓，请先揭晓'));
  S.auc.cur=l.id;return ok('大屏显示「'+l.name+'」');}

// ---------- 其他 ----------
function setScore(pid,v,why){const p=pl(pid);if(!p)return no('没有这个编号');v=Math.round(+v);if(!Number.isFinite(v)||v<0)return no('冥币数要是不小于 0 的整数');
  const old=p.score;if(v===old)return no('冥币数没有变化');p.score=v;log('总控修改 '+nm(p)+' 冥币：'+old+' → '+v+(why?'（'+String(why).slice(0,40)+'）':''));return ok(p.id+' 冥币已改为 '+v);}
function setNick(pid,nick){const p=pl(pid);if(!p)return no('没有这个编号');nick=String(nick||'').replace(/\s+/g,' ').trim().slice(0,12);
  if(!nick)return no('昵称不能为空');if(S.players.some(x=>x!==p&&x.nick===nick))return no('这个昵称已经有人用了');
  const old=p.nick;p.nick=nick;p.on=true;if(old!==nick)log(p.id+(old?' 改名 '+old+' → ':' 取名 ')+nick);return ok('昵称已设为 '+nick);}
// 总控改花色（补录 / 纠错）：cards = 花色数组
function setCards(pid,cards){const p=pl(pid);if(!p)return no('没有这个编号');if(!Array.isArray(cards))return no('花色不对');
  const c=SUITS.filter(x=>cards.includes(x));const old=p.cards.join('')||'无';if(c.join('')===p.cards.join(''))return no('花色没有变化');
  p.cards=c;log('总控修改 '+nm(p)+' 花色：'+old+' → '+(c.join('')||'无'));return ok(p.id+' 花色已改为 '+(c.join('')||'无'));}
function setStart(pid,rid){const p=pl(pid);if(!p)return no('没有这个编号');if(!room(rid))return no('没有这个房间');if(p.start===rid)return no('起始房间没有变化');p.start=rid;log('总控把 '+nm(p)+' 的起始房间改为 '+room(rid).card);return ok(p.id+' 起始房间改为 '+room(rid).card);}
function setOn(pid,on){const p=pl(pid);if(!p)return no('没有这个编号');p.on=!!on;log('总控把 '+nm(p)+(on?' 加入':' 移出')+'排行榜');return ok(on?'已加入排行':'已移出排行');}
function addPlayers(n){n=Math.round(+n);if(!(n>=1&&n<=40))return no('一次加 1–40 个');const k=S.players.length;for(let i=1;i<=n;i++)S.players.push(mkPlayer(k+i));
  log('总控新增 '+n+' 张身份卡（'+pidOf(k+1)+'–'+pidOf(k+n)+'）');return ok('已新增 '+n+' 张，记得生成 PIN');}
function setDur(secs){secs=Math.round(+secs);if(!(secs>=60&&secs<=86400))return no('总时长要在 1 分钟到 24 小时之间');S.dur=secs;log('总控把总时长设为 '+Math.floor(secs/60)+' 分钟');return ok('总时长已设为 '+Math.floor(secs/60)+' 分钟');}

// ---------- 演示数据 ----------
const DEMO_NICK=['阿鬼','小白','无常','纸扎','孟孟','判判','铜钱','灯笼','彼岸','骨花','黑猫','红绸','书生','狐狸','小倩','钟馗','小青','白蛇','花脸','长舌',
  '阿飘','画皮','聂聂','宁采','燕赤','山魈','魍魉','魑魅','夜叉','罗刹','鬼火','冥灯','奈何','忘川','孟汤','黄泉'];
// 三套演示数据（总控工具里「载入演示数据」可选）：start 开局 · mid 游戏中段 · final 时间截止后（晋级名单 + 拍卖）
const DEMOS={start:'开局（T+3 分钟）',mid:'游戏中段（鬼门开进行中）',final:'晋级与拍卖（时间截止后）'};
function demoBase(n){init();S.now=Date.parse('2026-10-31T23:00:00Z');S.players.slice(0,n).forEach((p,i)=>{p.nick=DEMO_NICK[i]||('玩家'+p.id);p.on=true;});}
const demoLots=()=>{['第一件拍品','第二件拍品','第三件拍品','第四件拍品'].forEach(n=>aucAdd({name:n+'（占位）',desc:'盲盒',start:100}));aucAdd({name:'最终大奖（占位）',desc:'神秘大奖',start:300,big:true});};
function seedStart(){
  demoBase(30);
  // 开场 3 分钟：大家都在起始房间，有一间刚结束
  S.t=40; enterRoom('4S',['001','009']); enterRoom('8S',['002','010','018']); enterRoom('4H',['003','011']); enterRoom('8H',['004','012','020']);
  S.t=70; enterRoom('4C',['005','013','021']); enterRoom('8C',['006']);
  S.t=150; finishRoom('4C',{'005':'win','013':'win','021':'lose'});
  S.t=180; log('演示数据（开局）：6 间房有人，♣4 刚结算、重置中，♦4 ♦8 还空着');
  demoLots();
}
function seedMid(){
  demoBase(36);
  const fin=(rid,res)=>{finishRoom(rid,res);resetDone(rid);};
  S.t=60; enterRoom('4S',['001','009','017']); enterRoom('8S',['002','010']); enterRoom('4H',['003','011','019']); enterRoom('4C',['005','013']);
  S.t=8*60; fin('4S',{'001':'win','009':'win','017':'lose'}); fin('8S',{'002':'win','010':'lose'}); fin('4H',{'003':'win','011':'win','019':'win'}); fin('4C',{'005':'win','013':'leave'});
  S.t=9*60; pickup('017'); checkIn('017','wuchang'); confirmIn('017','mengpo');
  S.t=9*60+30; checkIn('010','mengpo'); confirmIn('010','wuchang');
  S.t=15*60; enterRoom('8H',['001','003']); enterRoom('4D',['002','009']); enterRoom('8C',['005']);
  S.t=22*60; fin('8H',{'001':'win','003':'lose'}); fin('4D',{'002':'win','009':'win'}); fin('8C',{'005':'win'});
  S.t=23*60; pickup('003');
  S.t=24*60; puzRedeem('011','z1'); puzRedeem('011','z2'); puzRedeem('019','z1'); puzRedeem('001','z3');
  S.t=26*60; publish({kind:'鬼门开',gate:'g1',mins:10});
  S.t=28*60; gateWin('002'); gateWin('011'); gateWin('005');
  gateReward('002','coin'); gateReward('011','save','017'); gateReward('005','suit','♥');
  S.t=30*60; setChips('010',650); selfRedeem('010');
  S.t=32*60; enterRoom('8D',['001','002']); enterRoom('4S',['011','019']); enterRoom('8S',['009']);
  S.t=33*60; checkIn('003','wuchang'); confirmIn('003','mengpo'); setChips('003',340);
  S.t=34*60; enterRoom('4C',['017']); finishRoom('4C',{'017':'lose'});
  S.t=40*60; publish({kind:'鬼门开',gate:'g2',mins:10});
  S.t=42*60; gateWin('019');
  S.t=43*60; log('演示数据（游戏中段）：第二次鬼门开进行中（已有 1 人完成），♦8、♠4、♠8 进行中，♣4 重置中，鬼市 1 人，待接 1 人');
  demoLots();
}
function seedFinal(){
  demoBase(40);
  // 时间截止后：一批人四花色 + 2000 冥币，资格名单已锁定；拍卖第 1 件已成交，第 2 件选中待开拍
  let k=7;const rnd=()=>(k=(k*1103515245+12345)%2147483648)/2147483648;
  const play=(pid,rid,res)=>{if(whyNotEnter(pid,rid))return;enterRoom(rid,[pid]);finishRoom(rid,{[pid]:res});resetDone(rid);};
  const plans={'001':['8S','8H','8C','8D'],'002':['8S','8H','8C','4D','4S'],'003':['4S','8H','8C','8D'],'004':['8S','4H','8C','8D'],'005':['4S','4H','4C','4D','8S','8D'],
    '006':['8S','8H','4C','8D'],'007':['4S','8H','8C','4D'],'008':['8S','4H','4C','8D','4S']};
  S.t=700;
  for(const [pid,rs] of Object.entries(plans)){rs.forEach(r=>{S.t+=37;play(pid,r,'win');});}
  S.players.slice(8,40).forEach(p=>{const n=1+Math.floor(rnd()*4);for(let i=0;i<n;i++){S.t+=23;play(p.id,ROOMS[Math.floor(rnd()*8)].id,rnd()<.7?'win':'lose');
    if(p.st==='out'){pickup(p.id);checkIn(p.id,'wuchang');confirmIn(p.id,'mengpo');if(rnd()<.6){setChips(p.id,500+Math.floor(rnd()*4)*50);selfRedeem(p.id);}}}});
  ['009','015','022','030'].forEach((id,i)=>{puzRedeem(id,'z1');puzRedeem(id,'z2');});
  S.t=7300; lockFinal();
  demoLots();
  const ids=S.fin.slice();
  aucOpen('L1',120);[[ids[0],900],[ids[1],1200],[ids[2],1200],[ids[3],500]].forEach(([pid,v],i)=>{if(pid){S.now+=1000;bid(pid,'L1',v);}});
  S.now+=5000;aucTime('close','L1');aucReveal('L1');
  S.auc.cur='L2';S.auc.screen='auction';
  S.t=7500; log('演示数据（晋级与拍卖）：资格名单已锁定 '+S.fin.length+' 人，第 1 件已成交，第 2 件已选中、等判官开拍');
}
const seed=w=>w==='start'?seedStart():w==='final'?seedFinal():seedMid();
export function newGame(demo){init();if(demo)seed(demo);return S;}

// Which roles may perform each action. 总控只做自己页面上的事（冥币、名单、发布、设置），不代替其他工作人员操作。
const ROLE_OK={enter:['dealer'],finish:['dealer'],resetdone:['dealer'],kick:['dealer'],
  setcap:['ctrl'],setcapon:['ctrl'],setdur:['ctrl'],setscore:['ctrl'],setstart:['ctrl'],setcards:['ctrl'],seton:['ctrl'],addplayers:['ctrl'],lockfinal:['ctrl','judge'],unlockfinal:['ctrl'],final:['ctrl'],
  publish:['ctrl','judge'],revoke:['ctrl','judge'],
  gatewin:['judge'],gateunwin:['judge'],gatereward:['judge'],gateend:['judge'],puz:['judge'],puzundo:['judge'],
  pickup:['wuchang'],checkin:['wuchang','mengpo'],confirm:['wuchang','mengpo'],
  chips:['mengpo'],redeem:['mengpo'],ransom:['mengpo'],soup:['mengpo'],
  'auc.add':['judge'],'auc.edit':['judge'],'auc.del':['judge'],'auc.move':['judge'],'auc.open':['judge'],'auc.time':['judge'],'auc.reveal':['judge'],
  'auc.void':['judge'],'auc.redo':['judge'],'auc.screen':['judge'],'auc.show':['judge'],
  ack:['player'],nick:['player','ctrl'],bid:['player','judge']};

// Apply one action from one signed-in person. Returns {ok,msg}.
export function apply(state,me,a){
  use(state);
  const roles=a&&ROLE_OK[a.type];
  if(!roles)return no('未知操作');
  if(!roles.includes(me.role))return no('你的身份不能做这个操作');
  if(me.role==='dealer'&&Array.isArray(me.rooms)&&['enter','finish','resetdone','kick'].includes(a.type)&&!me.rooms.includes(a.rid))return no('这个房间不归你管，只能操作：'+me.rooms.map(r=>room(r).card).join(' '));
  aucSweep();
  switch(a.type){
    case 'enter':return enterRoom(a.rid,a.pids||a.pid);
    case 'finish':return finishRoom(a.rid,a.results||{});
    case 'resetdone':return resetDone(a.rid);
    case 'kick':return kickOut(a.rid,a.pid);
    case 'setcap':return setCap(a.v);
    case 'setcapon':return setCapOn(a.v);
    case 'setdur':return setDur(a.secs);
    case 'setscore':return setScore(a.pid,a.v,a.why);
    case 'setstart':return setStart(a.pid,a.rid);
    case 'setcards':return setCards(a.pid,a.cards);
    case 'seton':return setOn(a.pid,a.on);
    case 'addplayers':return addPlayers(a.n);
    case 'lockfinal':return lockFinal();
    case 'unlockfinal':return unlockFinal();
    case 'final':return setFinal(a.pid,!!a.on);
    case 'publish':if(me.role==='judge'&&!(a.f&&a.f.kind==='鬼门开'))return no('判官只能发布鬼门开');return publish(a.f);
    case 'revoke':return revokeNotice(+a.nid);
    case 'gatewin':return gateWin(a.pid);
    case 'gateunwin':return gateUnwin(a.pid);
    case 'gatereward':return gateReward(a.pid,a.kind,a.arg);
    case 'gateend':return gateEnd();
    case 'puz':return puzRedeem(a.pid,a.zid,a.title);
    case 'puzundo':return puzUndo(a.pid,a.key);
    case 'pickup':return pickup(a.pid);
    case 'checkin':return checkIn(a.pid,me.role);
    case 'confirm':return confirmIn(a.pid,me.role);
    case 'chips':return setChips(a.pid,a.v);
    case 'redeem':return selfRedeem(a.pid);
    case 'ransom':return ransom(a.pid,a.by);
    case 'soup':return soup(a.pid);
    case 'auc.add':return aucAdd(a.f);
    case 'auc.edit':return aucEdit(a.id,a.f);
    case 'auc.del':return aucDel(a.id);
    case 'auc.move':return aucMove(a.id,a.d);
    case 'auc.open':return aucOpen(a.id,a.secs);
    case 'auc.time':return aucTime(a.op,a.id);
    case 'auc.reveal':return aucReveal(a.id);
    case 'auc.void':return aucVoid(a.id);
    case 'auc.redo':return aucRedo(a.id);
    case 'auc.screen':return aucScreen(!!a.on);
    case 'auc.show':return aucShow(a.id);
    case 'ack':if(!me.pid)return no('只有玩家需要确认通知');ack(+a.nid,me.pid);return ok('');
    case 'nick':return setNick(me.role==='player'?me.pid:a.pid,a.nick);
    case 'bid':return bid(me.role==='player'?me.pid:a.pid,a.id,a.v);   // 判官可以替手机打不开的人代出价
  }
}

// What one person is allowed to see. Staff see everything except: the big screen and players never see other people's bids.
// A player sees only their own notices and the broadcast lines of the log.
function hideBids(state,pid){return {...state.auc,lots:state.auc.lots.map(l=>{const n=Object.keys(l.bids).length,mine=pid&&l.bids[pid];
  return {...l,bids:mine?{[pid]:mine}:{},nb:n,bad:[]};})};}
const STAFF_LOG=300;   // 工作人员页最多看 300 行日志（全场日志页也只显示 300 行）；完整日志留在服务器
export function viewFor(state,me){
  const lg=state.log.length>STAFF_LOG?state.log.slice(0,STAFF_LOG):state.log;
  if(me.role==='screen')return {...state,log:lg,auc:hideBids(state,null)};
  if(me.role!=='player')return lg===state.log?state:{...state,log:lg};
  use(state);const p=state.players.find(x=>x.id===me.pid);
  return {...state,log:state.log.filter(isBcast).slice(0,30),notices:state.notices.filter(n=>p&&matches(n,p)),
    players:state.players.map(x=>x.id===me.pid?x:{...x,hist:[],puz:[]}),auc:hideBids(state,me.pid)};
}

export {noticeStale,staffSees,timeUp,marketShut,needsReset,whyNotEnter,eliminate,soup,puzInfo,finalMiss,qualifies,whyNotBid,bidOrder,lotLeft,lotState,
  ranking,suitsOf,stLabel,inMk,pl,nm,matches,targetLabel,room,fmt,esc,log,no,
  ROOMS,SUITS,PUZZLES,GATES,FINAL_SCORE,CHIP_START,CHIP_GOAL,CARRY_MAX,RANSOM,PUZ_PTS,PUZ_CAP,GATE_WIN,GATE_COIN,ROOM_CAP0,START_ONLY,DEMOS};
