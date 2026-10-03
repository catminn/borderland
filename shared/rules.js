// 百鬼夜行 · game rules.
// Shared by the server (authoritative: every action runs here) and the browser (read-only helpers for display).
// To change a rule, change it here only.
export let S;
export function use(state){S=state;}
const TEAMS=[
  {id:'R',name:'红队',color:'#e0483a'},{id:'B',name:'蓝队',color:'#4a86d8'},
  {id:'G',name:'绿队',color:'#3fa06a'},{id:'Y',name:'黄队',color:'#d4a92c'},
  {id:'P',name:'紫队',color:'#9a6bd1'},{id:'O',name:'橙队',color:'#e0803a'}];
const ROOMS=[
  {id:'3S',card:'3♠',suit:'♠',n:3,name:'一二三纸扎人',min:3,two:false,rule:'木头人玩法。Dealer 扮纸扎人，转身时还在动的人回起点。'},
  {id:'5S',card:'5♠',suit:'♠',n:5,name:'奈何桥',min:3,two:false,rule:'格子布上的安全路线只亮几秒，凭记忆走过，踩错回起点。'},
  {id:'4D',card:'4♦',suit:'♦',n:4,name:'生死簿',min:2,two:false,rule:'30 秒看桌上物品，盖布后回答问题。'},
  {id:'6D',card:'6♦',suit:'♦',n:6,name:'符咒密码',min:2,two:false,rule:'倒计时内从真假 clue 里破解密码锁。'},
  {id:'3C',card:'3♣',suit:'♣',n:3,name:'冥界传话',min:4,two:false,rule:'Relay Drawing，一路画下去，最后一人猜。'},
  {id:'5C',card:'5♣',suit:'♣',n:5,name:'心有灵犀',min:4,two:false,rule:'队伍分两组背对背答相同问题，答对越多越好。'},
  {id:'5H',card:'5♥',suit:'♥',n:5,name:'少数派',min:1,two:true,rule:'两队同场，每轮匿名选红 / 黑，少数派得分，可 bluff。'},
  {id:'7H',card:'7♥',suit:'♥',n:7,name:'孟婆的交易',min:1,two:true,rule:'两队秘密选「合作 / 背叛」。双合作都小赢，一方背叛独赢，双背叛都输。'}];
const FRAG={'♠':'楼名','♦':'房间','♣':'密码前两位','♥':'密码后两位'};
const SUITS=['♠','♦','♣','♥'];
const SHOP0=[
  {id:'k1',name:'替身纸人',desc:'抵消本队一次淘汰（输房抽签或被勾魂时出示）。',price:600,stock:2},
  {id:'k2',name:'阎王免签',desc:'进一个房间时无视存活人数要求。',price:500,stock:2},
  {id:'k3',name:'偷看生死簿',desc:'逻辑类房间里多看 10 秒。',price:300,stock:3},
  {id:'k4',name:'回魂香',desc:'一名鬼市队员的停留时间要求减半。',price:400,stock:3},
  {id:'k5',name:'勾魂令',desc:'立刻点名一名别队队员去鬼市（仍受保护期限制）。',price:800,stock:1}];
const RATE=2;
const PER_TEAM=7, PROTECT=600, MIN_STAY=300, COIN_GOAL=1000, FINAL_MIN=4;

const team=id=>S.teams.find(t=>t.id===id), room=id=>ROOMS.find(r=>r.id===id);
const alive=t=>S.players.filter(p=>p.team===t&&p.st==='alive');
const inMarket=t=>S.players.filter(p=>p.team===t&&p.st==='market');
const fmt=s=>'T+'+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const protectedLeft=p=>p.backAt==null?0:Math.max(0,p.backAt+PROTECT-S.t);
const log=(text,kind='')=>S.log.unshift({t:S.t,text,kind});
const ok=msg=>({ok:true,msg}), no=msg=>({ok:false,msg});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function init(){
  S={t:0,gate:0,log:[],notices:[],nid:1,sid:100,shop:SHOP0.map(c=>({...c})),teams:TEAMS.map(t=>({...t,cards:[],played:[],inRoom:null,score:0,skills:[]})),
     rooms:ROOMS.map(r=>({id:r.id,teams:[]})),players:[]};
  TEAMS.forEach(t=>{for(let i=1;i<=PER_TEAM;i++)S.players.push({id:t.id+'-'+String(i).padStart(2,'0'),team:t.id,st:'alive',outAt:null,backAt:null,coins:0,bail:0});});
  log('活动开始，6 队 × '+PER_TEAM+' 人入场');
}

function matches(n,p){
  switch(n.target){case 'all':return true;case 'team':return n.ids.includes(p.team);case 'player':return n.ids.includes(p.id);
  case 'market':return p.st==='market';case 'alive':return p.st==='alive';}return false;}
function targetLabel(n){return n.target==='all'?'全体玩家':n.target==='team'?team(n.ids[0]).name:n.target==='player'?(n.ids.length<=4?n.ids.join('、'):n.ids.slice(0,3).join('、')+' 等 '+n.ids.length+' 人'):n.target==='market'?'鬼市中的人':'存活玩家';}
const rewardTxt=n=>n.reward?'+'+n.reward+' 冥币':'';
const teamOf=id=>id.includes('-')?id.split('-')[0]:id;
const MODES=[['first','先到先得'],['each','各自完成']];
const kindLabel=n=>n.kind==='任务'?(n.secret?'秘密任务':'任务')+' · '+(isFirst(n)?'先到先得':'各自完成'):n.kind;
const defMode=t=>(t==='all'||t==='alive')?'first':'each';
const isFirst=n=>(n.mode||'first')==='first';
const indiv=n=>n.target==='player'||n.target==='market';
const lab=id=>id.includes('-')?id:team(id).name;
const tcol=id=>team(teamOf(id)).color;
function cands(n){const a=S.players.filter(p=>matches(n,p));return indiv(n)?a.map(p=>p.id):[...new Set(a.map(p=>p.team))];}
function pushNotice(o){S.notices.unshift({id:S.nid++,reward:o.reward||0,mode:o.mode||null,secret:!!o.secret,t:S.t,kind:o.kind,title:o.title,body:o.body,target:o.target,ids:o.ids||[],due:o.mins?S.t+o.mins*60:null,acks:{},done:{}});}
function publish(f){f=f||{};const str=(v,n)=>String(v==null?'':v).slice(0,n);f={...f,title:str(f.title,80),body:str(f.body,1000)};
  if(!['all','team','player','alive','market'].includes(f.target))return no('发布对象不对');if(!['公告','任务','秘密任务'].includes(f.kind))return no('类型不对');
  if(!f.title.trim())return no('先写标题');
  let ids=[];if(f.target==='team')ids=[f.team];
  if(f.target==='player'){const want=Array.isArray(f.players)?f.players:f.player?[f.player]:[];ids=[...new Set(want)].filter(id=>S.players.some(p=>p.id===id));if(!ids.length)return no('先选队员');}
  const isTask=f.kind!=='公告';pushNotice({kind:isTask?'任务':'公告',secret:f.kind==='秘密任务',title:f.title.trim(),body:f.body.trim(),target:f.target,ids,mins:Math.max(0,+f.mins||0),mode:isTask?f.mode:null,reward:isTask?Math.max(0,Math.round(+f.reward)||0):0});
  const n=S.notices[0];log('判官发布'+kindLabel(n)+'「'+n.title+'」→ '+targetLabel(n));
  return ok('已发布给 '+targetLabel(n)+'，共 '+S.players.filter(p=>matches(n,p)).length+' 人');}
function ack(nid,pid){const n=S.notices.find(x=>x.id===nid);if(n&&!n.acks[pid])n.acks[pid]=S.t;}
function markDone(nid,cid){const n=S.notices.find(x=>x.id===nid);if(!n)return no('任务不存在');
  if(n.done[cid])return no(lab(cid)+'已经记录过');
  const w=Object.keys(n.done)[0];
  if(isFirst(n)&&w)return no('任务已关闭：'+lab(w)+'已率先完成，只能有一方完成');
  n.done[cid]={t:S.t};
  if(n.reward){const tm=team(teamOf(cid));tm.score+=n.reward;n.done[cid].pts=n.reward;}
  const rw=n.reward?'，'+team(teamOf(cid)).name+' +'+n.reward+' 冥币':'';
  if(isFirst(n)){log('判官记录 '+lab(cid)+' 率先完成任务「'+n.title+'」，任务关闭'+rw,'back');
    if(!n.secret){pushNotice({kind:'通知',title:lab(cid)+'率先完成任务',body:lab(cid)+'已率先完成「'+n.title+'」，该任务已关闭，其他人不必再做。'+(n.reward?team(teamOf(cid)).name+'获得 +'+n.reward+' 冥币。':''),target:'all'});return ok('已记录 '+lab(cid)+' 完成'+rw+'，任务已关闭并向全体广播');}
    return ok('已记录 '+lab(cid)+' 完成'+rw+'，任务已关闭（未播报）');}
  log('判官记录 '+lab(cid)+' 完成任务「'+n.title+'」'+rw,'back');return ok('已记录 '+lab(cid)+' 完成'+rw);}
function unmarkDone(nid,cid){const n=S.notices.find(x=>x.id===nid);if(!n||!n.done[cid])return no('没有这条记录');
  const pts=n.done[cid].pts||0;if(pts){const tm=team(teamOf(cid));tm.score=Math.max(0,tm.score-pts);}
  delete n.done[cid];log('判官撤销 '+lab(cid)+' 的任务完成记录「'+n.title+'」'+(pts?'，扣回 '+pts+' 冥币':''),'back');return ok('已撤销'+(pts?'，扣回 '+pts+' 冥币':''));}
function revokeNotice(nid){const i=S.notices.findIndex(x=>x.id===nid);if(i<0)return no('这条已经不存在');
  const n=S.notices[i];let back=0;
  Object.entries(n.done).forEach(([cid,d])=>{if(d.pts){const tm=team(teamOf(cid));tm.score=Math.max(0,tm.score-d.pts);back+=d.pts;}});
  S.notices.splice(i,1);log('判官撤销发布'+kindLabel(n)+'「'+n.title+'」'+(back?'，扣回奖励 '+back+' 冥币':''),'back');
  return ok('已撤销「'+n.title+'」'+(back?'，扣回奖励 '+back+' 冥币':''));}
function setScore(tid,v){const t=team(tid);v=Math.round(+v);if(!Number.isFinite(v)||v<0)return no('冥币数要是不小于 0 的整数');
  const old=t.score;if(v===old)return no('冥币数没有变化');t.score=v;log('总控修改 '+t.name+' 冥币：'+old+' → '+v);return ok(t.name+'冥币已改为 '+v);}
function setCards(tid,card,on){const t=team(tid);if(!t)return no('请先选择队伍');if(!ROOMS.some(r=>r.card===card))return no('没有这张牌');
  const has=t.cards.includes(card);if(!!on===has)return no(t.name+(has?'已经有 ':'本来就没有 ')+card);
  if(on)t.cards.push(card);else t.cards=t.cards.filter(c=>c!==card);
  log('总控修改 '+t.name+' 线索：'+(on?'加上 ':'去掉 ')+card);return ok(t.name+(on?'加上 ':'去掉 ')+card);}
function whyNotEnter(tid,rid){
  const t=team(tid),r=room(rid),st=S.rooms.find(x=>x.id===rid);
  if(st.teams.length>=(r.two?2:1))return '房间已满';
  if(t.inRoom)return '正在 '+room(t.inRoom).card;
  if(t.played.includes(r.card))return '已打过';
  if(alive(tid).length<r.min)return '存活不足 '+r.min+' 人';
  return null;
}
function enterRoom(tid,rid){
  if(!tid)return no('先选一支队伍');
  const why=whyNotEnter(tid,rid); if(why)return no(team(tid).name+'不能进 '+room(rid).card+'：'+why);
  S.rooms.find(x=>x.id===rid).teams.push(tid); team(tid).inRoom=rid;
  log(team(tid).name+' 进入 '+room(rid).card+' '+room(rid).name);
  return ok(team(tid).name+'已入场 '+room(rid).card);
}
function eliminate(p,why){
  p.st='market'; p.outAt=S.t; p.backAt=null; p.coins=300; p.bail=0;
  log(p.id+' '+why+'，去鬼市','hook');
  pushNotice({kind:'通知',title:'你被淘汰了',body:'原因：'+why+'。请把符咒名牌交给本队跟队工作人员，然后去一楼鬼市找孟婆登记，领 300 冥币。',target:'player',ids:[p.id]});
}
function finishRoom(rid,results,picks={}){
  const r=room(rid),st=S.rooms.find(x=>x.id===rid);
  if(st.teams.length<(r.two?2:1))return no(r.two?'♥ 房间需要两队同场才能结算':'房间里没有队伍');
  for(const tid of st.teams)if(!results[tid])return no('请为'+team(tid).name+'选择赢或输');
  const notes=[];
  for(const tid of st.teams){
    const t=team(tid); t.played.push(r.card); t.inRoom=null;
    if(results[tid]==='win'){
      t.cards.push(r.card); const pts=r.n*100; t.score+=pts; log(t.name+' 赢下 '+r.card+'，拿到扑克牌，+'+pts+' 冥币','back'); notes.push(t.name+'赢 +'+pts+' 冥币');
    }else if(r.n>=5){
      const pool=alive(tid); if(!pool.length){log(t.name+' 输了 '+r.card+'，队里已无存活队员');notes.push(t.name+'输（无人可淘汰）');continue;}
      const v=(picks[tid]&&pool.find(p=>p.id===picks[tid]))||pool[Math.floor(Math.random()*pool.length)];
      eliminate(v,'输了 '+r.card+' 被抽签淘汰'); notes.push(t.name+'输，抽中 '+v.id);
    }else{log(t.name+' 输了 '+r.card+'，无淘汰');notes.push(t.name+'输');}
  }
  st.teams=[]; return ok(r.card+' 结算完成：'+notes.join('；'));
}
function hook(actorId,pid){
  const p=S.players.find(x=>x.id===pid);
  if(!actorId)return no('先选取得勾魂令的队伍');
  if(!p)return no('先选被点名的队员');
  if(p.team===actorId)return no('不能点名本队队员');
  if(p.st!=='alive')return no(p.id+' 已在鬼市');
  if(protectedLeft(p)>0)return no(p.id+' 刚复活，保护期还剩 '+Math.ceil(protectedLeft(p)/60)+' 分钟');
  S.gate++; eliminate(p,'被'+team(actorId).name+'勾魂（第 '+S.gate+' 次鬼门开）');
  return ok(team(actorId).name+'勾走了 '+p.id);
}
function revive(pid){
  const p=S.players.find(x=>x.id===pid);
  if(!p||p.st!=='market')return no('该队员不在鬼市');
  if(S.t-p.outAt<MIN_STAY)return no(p.id+' 还需在鬼市待满 '+Math.ceil((MIN_STAY-(S.t-p.outAt))/60)+' 分钟');
  const tot=(p.coins||0)+(p.bail||0);
  if(tot<COIN_GOAL)return no(p.id+' 冥币 '+p.coins+' + 队友助力 '+p.bail+' = '+tot+'，还差 '+(COIN_GOAL-tot));
  const carry=tot-COIN_GOAL,tm=team(p.team);
  if(carry>0)tm.score+=carry;
  p.st='alive'; p.backAt=S.t; p.outAt=null; p.coins=0; p.bail=0;
  log(p.id+' 喝下孟婆汤，回到'+tm.name+'（10 分钟内不能被勾魂）'+(carry?'，带回 '+carry+' 冥币':''),'back');
  pushNotice({kind:'通知',title:'买命成功',body:'请领取新的符咒名牌，回到队伍。10 分钟内不能被勾魂。'+(carry?'你在鬼市多赚的 '+carry+' 冥币已存入队伍。':''),target:'player',ids:[p.id]});
  return ok(p.id+' 已复活'+(carry?'，带回 '+carry+' 冥币存入'+tm.name:''));
}
function gapOf(p){return Math.max(0,COIN_GOAL-(p.coins||0)-(p.bail||0));}
function donate(pid,amt,byId){
  const p=S.players.find(x=>x.id===pid),by=S.players.find(x=>x.id===byId);
  if(!p||p.st!=='market')return no('该队员不在鬼市');
  if(!by||by.st!=='alive'||by.team!==p.team)return no('只有本队还在场上的队员可以助力');
  const t=team(p.team),gap=gapOf(p);
  if(amt==null)amt=Math.min(gap*RATE,t.score);
  const spend=Math.floor(+amt||0);
  if(gap<=0)return no(p.id+' 已经凑够了，不用再助力');
  if(spend<RATE)return no('至少花 '+RATE+' 冥币才能助力 1');
  if(spend>t.score)return no(t.name+'队伍冥币只有 '+t.score+'，不够花 '+spend);
  if(spend>gap*RATE)return no(p.id+' 还差 '+gap+'，最多花 '+gap*RATE+' 冥币');
  amt=Math.floor(spend/RATE);
  t.score-=amt*RATE;p.bail+=amt;
  log(by.id+' 花队伍 '+amt*RATE+' 冥币，为 '+p.id+' 助力 '+amt+' 冥币','back');
  pushNotice({kind:'通知',title:'队友为你助力了',body:by.id+' 花队伍 '+amt*RATE+' 冥币为你换来 '+amt+' 冥币。你现在合计 '+(p.coins+p.bail)+'，够 '+COIN_GOAL+' 且待满 '+MIN_STAY/60+' 分钟就能买命。',target:'player',ids:[p.id]});
  return ok('已为 '+p.id+' 助力 '+amt+' 冥币（花费 '+amt*RATE+'），队伍剩余 '+t.score+' 冥币');
}
function buyCard(kid,buyer){const c=S.shop.find(x=>x.id===kid);
  if(!c)return no('没有这张卡');if(!buyer)return no('先选买家');if(c.stock<=0)return no('「'+c.name+'」已售罄');
  let tm,payer;
  {const p=S.players.find(x=>x.id===buyer);if(!p||p.st!=='market')return no('只有在鬼市的人能用个人冥币');
    if(p.coins<c.price)return no(p.id+' 只有 '+p.coins+' 冥币，买不起「'+c.name+'」（'+c.price+'）');p.coins-=c.price;tm=team(p.team);payer=p.id;}
  c.stock--;tm.skills.push({sid:S.sid++,name:c.name,by:payer,t:S.t});
  log(payer+' 在鬼市花 '+c.price+' 冥币买了技能卡「'+c.name+'」','back');
  pushNotice({kind:'通知',title:'本队获得技能卡',body:payer+' 在鬼市商铺买了「'+c.name+'」。'+(c.desc||'')+' 使用时找工作人员出示。',target:'team',ids:[tm.id]});
  return ok(payer+' 买到「'+c.name+'」，'+tm.name+'现有技能卡 '+tm.skills.length+' 张');}
function useCard(tid,sid){const t=team(tid),i=t.skills.findIndex(k=>k.sid===sid);if(i<0)return no('这张卡不存在');
  const k=t.skills.splice(i,1)[0];log(t.name+' 使用技能卡「'+k.name+'」');return ok(t.name+'已使用「'+k.name+'」');}
function addCard(f){f={name:String((f&&f.name)||'').slice(0,30),desc:String((f&&f.desc)||'').slice(0,200),price:f&&f.price,stock:f&&f.stock};if(!f.name.trim())return no('先写卡名');
  const price=Math.round(+f.price);if(!(price>0))return no('先填价格（大于 0）');const stock=Math.round(+f.stock);if(!(stock>0))return no('先填库存（至少 1）');
  const nm=f.name.trim();S.shop.push({id:'k'+(S.sid++),name:nm,desc:f.desc.trim(),price,stock});log('鬼市商铺上架技能卡「'+nm+'」');return ok('已上架「'+nm+'」');}
function teamStatus(t){
  const missing=SUITS.filter(s=>!t.cards.some(c=>c.includes(s)));
  const a=alive(t.id).length;
  if(!missing.length&&a>=FINAL_MIN)return {k:'free',txt:'可进 Final'};
  const bits=[]; if(missing.length)bits.push('缺 '+missing.join('')); if(a<FINAL_MIN)bits.push('存活 '+a+' 不足 '+FINAL_MIN);
  return {k:a<FINAL_MIN?'bad':'busy',txt:bits.join('，')};
}


function seed(){
  init();
  const go=(tid,rid)=>enterRoom(tid,rid);
  go('R','3C');go('B','4D');go('G','3S');go('Y','5C');go('P','6D');go('O','5S');
  S.t=8*60+20;
  finishRoom('3C',{R:'win'});finishRoom('4D',{B:'win'});finishRoom('3S',{G:'win'});
  finishRoom('5C',{Y:'lose'},{Y:'Y-04'});finishRoom('6D',{P:'lose'},{P:'P-02'});finishRoom('5S',{O:'win'});
  S.t=15*60; go('R','5H');go('G','5H');go('B','6D');
  finishRoom('6D',{B:'win'});
  S.t=24*60; S.players.find(x=>x.id==='Y-04').coins=1000; revive('Y-04');
  S.t=25*60; hook('B','R-03');
  S.t=27*60; ['B-05','B-06'].forEach(id=>eliminate(S.players.find(x=>x.id===id),'演示数据'));
  S.t=31*60+40; go('O','4D'); go('Y','3S');
  S.t=29*60; S.players.find(x=>x.id==='B-05').coins=600; buyCard('k3','B-05'); S.players.find(x=>x.id==='B-05').coins=1000;
  S.players.find(x=>x.id==='B-05').outAt=S.t-600; S.players.find(x=>x.id==='P-02').coins=1500;
  log('演示数据就位：5♥ 与 4♦、3♠ 正在进行');
  pushNotice({kind:'任务',title:'鬼门开：还原鬼片海报',body:'全队 60 秒内还原一张「鬼片海报」造型，到一楼大厅找判官。第一支完成的队伍拿到勾魂令。',target:'all',mins:10,mode:'first'});
}

export function newGame(demo){init();if(demo)seed();return S;}

// Which roles may perform each action ('ctrl' may do everything).
const ROLE_OK={enter:['dealer'],finish:['dealer'],hook:['judge'],done:['judge'],undone:['judge'],
  publish:['ctrl'],revoke:['ctrl'],setscore:['ctrl'],setcards:['ctrl'],
  revive:['mengpo'],coin:['mengpo'],buy:['mengpo'],usecard:['mengpo'],addcard:['mengpo'],
  ack:['player'],donate:['player']};

// Apply one action from one signed-in person. Returns {ok,msg}.
export function apply(state,me,a){
  use(state);
  const roles=a&&ROLE_OK[a.type];
  if(!roles)return no('未知操作');
  if(me.role!=='ctrl'&&!roles.includes(me.role))return no('你的身份不能做这个操作');
  if(me.role==='dealer'&&Array.isArray(me.rooms)&&(a.type==='enter'||a.type==='finish')&&!me.rooms.includes(a.rid))return no('这个房间不归你管，只能操作：'+me.rooms.map(r=>room(r).card).join(' '));
  switch(a.type){
    case 'enter':return enterRoom(a.tid,a.rid);
    case 'finish':return finishRoom(a.rid,a.results||{});
    case 'hook':return hook(a.actor,a.pid);
    case 'done':return markDone(+a.nid,a.cid);
    case 'undone':return unmarkDone(+a.nid,a.cid);
    case 'publish':return publish(a.f);
    case 'revoke':return revokeNotice(+a.nid);
    case 'setscore':return setScore(a.tid,a.v);
    case 'setcards':return setCards(a.tid,a.card,!!a.on);
    case 'revive':return revive(a.pid);
    case 'coin':{const p=S.players.find(x=>x.id===a.pid);if(!p||p.st!=='market')return no('该队员不在鬼市');
      p.coins=Math.max(0,Math.round(+a.coins)||0);return ok(p.id+' 冥币记为 '+p.coins);}
    case 'buy':return buyCard(a.kid,a.buyer);
    case 'usecard':return useCard(a.tid,+a.sid);
    case 'addcard':return addCard(a.f);
    case 'ack':if(!me.pid)return no('只有玩家需要确认通知');ack(+a.nid,me.pid);return ok('');
    case 'donate':return donate(a.pid,a.amt==null?null:a.amt,me.pid);
  }
}

// What one person is allowed to see. Staff see everything; a player sees only their own notices and team cards.
export function viewFor(state,me){
  if(me.role!=='player')return state;
  use(state);const p=state.players.find(x=>x.id===me.pid);
  return {...state,log:[],shop:[],notices:state.notices.filter(n=>p&&matches(n,p)),
    teams:state.teams.map(t=>p&&t.id===p.team?t:{...t,skills:[]})};
}

export {COIN_GOAL,FINAL_MIN,FRAG,MIN_STAY,MODES,PER_TEAM,PROTECT,RATE,ROOMS,SHOP0,SUITS,TEAMS,ack,addCard,alive,buyCard,cands,setCards,defMode,donate,eliminate,enterRoom,esc,finishRoom,fmt,gapOf,hook,inMarket,indiv,init,isFirst,kindLabel,lab,log,markDone,matches,no,ok,protectedLeft,publish,pushNotice,revive,revokeNotice,rewardTxt,room,seed,setScore,targetLabel,tcol,team,teamOf,teamStatus,unmarkDone,useCard,whyNotEnter};
