// 百鬼夜行 · game rules.
// Shared by the server (authoritative: every action runs here) and the browser (read-only helpers for display).
// To change a rule, change it here only.
export let S;
export function use(state){S=state;}
const TEAMS=[
  {id:'R',name:'红队',color:'#e0483a'},{id:'B',name:'蓝队',color:'#4a86d8'},
  {id:'G',name:'绿队',color:'#3fa06a'},{id:'Y',name:'黄队',color:'#d4a92c'},
  {id:'P',name:'紫队',color:'#9a6bd1'},{id:'O',name:'橙队',color:'#e0803a'},
  {id:'C',name:'青队',color:'#2a9d9a'},{id:'K',name:'粉队',color:'#e0789f'}];
const ROOMS=[
  {id:'3S',card:'3♠',suit:'♠',n:3,name:'一二三纸扎人',two:false,rule:'木头人玩法。Dealer 扮纸扎人，转身时还在动的人回起点。'},
  {id:'5S',card:'5♠',suit:'♠',n:5,name:'奈何桥',two:false,rule:'格子布上的安全路线只亮几秒，凭记忆走过，踩错回起点。'},
  {id:'4D',card:'4♦',suit:'♦',n:4,name:'生死簿',two:false,rule:'30 秒看桌上物品，盖布后回答问题。'},
  {id:'6D',card:'6♦',suit:'♦',n:6,name:'符咒密码',two:false,rule:'倒计时内从真假 clue 里破解密码锁。'},
  {id:'3C',card:'3♣',suit:'♣',n:3,name:'冥界传话',two:false,rule:'Relay Drawing，一路画下去，最后一人猜。'},
  {id:'5C',card:'5♣',suit:'♣',n:5,name:'心有灵犀',two:false,rule:'队伍分两组背对背答相同问题，答对越多越好。'},
  {id:'5H',card:'5♥',suit:'♥',n:5,name:'少数派',two:false,rule:'每轮匿名选红 / 黑，少数派得分，可 bluff。'},
  {id:'7H',card:'7♥',suit:'♥',n:7,name:'孟婆的交易',two:false,rule:'玩法待定（原双队对抗，已取消双队）。'}];
const SUITS=['♠','♦','♣','♥'];
// 技能卡机制暂时关闭（2026-10-04）：代码保留，把 cards 改成 true 即可重新打开。
const FEATURES={cards:false};
const SHOP0=[
  {id:'k1',name:'替身纸人',desc:'抵消本队一次淘汰（输房抽签或被勾魂时出示）。',price:600,stock:2},
  {id:'k2',name:'阎王免签',desc:'进一个房间时无视存活人数要求。',price:500,stock:2},
  {id:'k3',name:'偷看生死簿',desc:'逻辑类房间里多看 10 秒。',price:300,stock:3},
  {id:'k4',name:'回魂香',desc:'一名鬼市队员的停留时间要求减半。',price:400,stock:3},
  {id:'k5',name:'勾魂令',desc:'立刻点名一名别队队员去鬼市（仍受保护期限制）。',price:800,stock:1}];
// sidequest 题库（占位，正式内容待定）。同一题可以发给不同队伍，每次发布只给一个队伍。
const QUESTS=[
  {id:'q1',title:'Sidequest 占位 1',body:'（占位文字，正式内容待定）',reward:100},
  {id:'q2',title:'Sidequest 占位 2',body:'（占位文字，正式内容待定）',reward:100}];
const FINAL_MSG='你们已集齐四种花色，全员存活，积分达标！请全队前往一楼大厅，等待终极任务指示。（占位文案）';
const RATE=1;
const PER_TEAM=6, PROTECT=600, MIN_STAY=300, COIN_GOAL=1000, FINAL_SCORE=2000;
const KINDS=['公告','鬼门开','sidequest'];
const ROLE_LABEL={wuchang:'黑白无常',mengpo:'孟婆',ctrl:'总控'};
// Lines of the log that go on the big screen's 全场播报 (players get only these, so their first page matches the screen).
const BCAST=[/^(\S+) 被(.)队勾魂/,/^(\S+) 输了 (\S+) 被抽签淘汰/,/^(\S+) 喝下孟婆汤/,/^(\S+) 赢下 (\S+)，\+(\d+) 冥币/,/^判官记录 (\S+) 率先完成任务「(.+)」/];
const isBcast=l=>BCAST.some(re=>re.test(l.text));

// Player states: alive 在场 · out 刚淘汰，原地等黑白无常 · picked 已被黑白无常接到 · market 已登记进鬼市（计时、领 300 冥币）
const team=id=>S.teams.find(t=>t.id===id), room=id=>ROOMS.find(r=>r.id===id);
const size=t=>S.players.filter(p=>p.team===t).length;
const alive=t=>S.players.filter(p=>p.team===t&&p.st==='alive');
const inMarket=t=>S.players.filter(p=>p.team===t&&p.st==='market');
const fmt=s=>'T+'+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const protectedLeft=p=>p.backAt==null?0:Math.max(0,p.backAt+PROTECT-S.t);
const log=(text,kind='')=>S.log.unshift({t:S.t,text,kind});
const ok=msg=>({ok:true,msg}), no=msg=>({ok:false,msg});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function init(){
  S={t:0,gate:0,log:[],notices:[],nid:1,sid:100,shop:SHOP0.map(c=>({...c})),teams:TEAMS.map(t=>({...t,cards:[],played:[],inRoom:null,score:0,skills:[],final:false})),
     rooms:ROOMS.map(r=>({id:r.id,teams:[]})),players:[]};
  TEAMS.forEach(t=>{for(let i=1;i<=PER_TEAM;i++)S.players.push({id:t.id+'-'+String(i).padStart(2,'0'),team:t.id,st:'alive',outAt:null,inAt:null,pickAt:null,at:'',chk:null,backAt:null,coins:0,bail:0});});
  log('活动开始，'+TEAMS.length+' 队 × '+PER_TEAM+' 人入场');
}

function matches(n,p){
  switch(n.target){case 'all':return true;case 'team':return n.ids.includes(p.team);case 'player':return n.ids.includes(p.id);
  case 'market':return p.st==='market';case 'alive':return p.st==='alive';}return false;}
function targetLabel(n){return n.target==='all'?'全体玩家':n.target==='team'?team(n.ids[0]).name:n.target==='player'?(n.ids.length<=4?n.ids.join('、'):n.ids.slice(0,3).join('、')+' 等 '+n.ids.length+' 人'):n.target==='market'?'鬼市中的人':'存活玩家';}
const rewardTxt=n=>n.reward?'+'+n.reward+' 冥币':'';
const teamOf=id=>id.includes('-')?id.split('-')[0]:id;
const kindLabel=n=>n.kind==='任务'?(n.sub==='side'?'sidequest':'鬼门开'):n.kind;
const isFirst=n=>(n.mode||'first')==='first';
const indiv=n=>n.target==='player'||n.target==='market';
const lab=id=>id.includes('-')?id:team(id).name;
const tcol=id=>team(teamOf(id)).color;
function cands(n){const a=S.players.filter(p=>matches(n,p));return indiv(n)?a.map(p=>p.id):[...new Set(a.map(p=>p.team))];}
function pushNotice(o){S.notices.unshift({id:S.nid++,reward:o.reward||0,mode:o.mode||null,sub:o.sub||null,tone:o.tone||'',t:S.t,kind:o.kind,title:o.title,body:o.body,target:o.target,ids:o.ids||[],due:o.mins?S.t+o.mins*60:null,acks:{},done:{}});}
// 公告：发给任意对象。鬼门开：发给全场，先到先得，完成时全场播报。sidequest：从题库选一题，只发给一个队伍，不播报。
function publish(f){f=f||{};const str=(v,n)=>String(v==null?'':v).slice(0,n);f={...f,title:str(f.title,80),body:str(f.body,1000)};
  if(!KINDS.includes(f.kind))return no('类型不对');
  let target=f.target,ids=[],mode=null,sub=null,reward=0;
  if(f.kind==='sidequest'){
    const q=QUESTS.find(x=>x.id===f.quest);if(!q)return no('先从题库选一个 sidequest');
    if(!team(f.team))return no('先选队伍');
    target='team';ids=[f.team];mode='each';sub='side';f.title=q.title;f.body=q.body;
    reward=(f.reward==null||f.reward==='')?q.reward:Math.max(0,Math.round(+f.reward)||0);
  }else if(f.kind==='鬼门开'){
    if(!f.title.trim())return no('先写标题');
    target='all';mode='first';sub='gate';reward=Math.max(0,Math.round(+f.reward)||0);
  }else{
    if(!['all','team','player','alive','market'].includes(target))return no('发布对象不对');
    if(!f.title.trim())return no('先写标题');
    if(target==='team'){if(!team(f.team))return no('先选队伍');ids=[f.team];}
    if(target==='player'){const want=Array.isArray(f.players)?f.players:f.player?[f.player]:[];ids=[...new Set(want)].filter(id=>S.players.some(p=>p.id===id));if(!ids.length)return no('先选队员');}
  }
  pushNotice({kind:f.kind==='公告'?'公告':'任务',sub,title:f.title.trim(),body:f.body.trim(),target,ids,mins:Math.max(0,+f.mins||0),mode,reward});
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
    pushNotice({kind:'通知',title:lab(cid)+'率先完成任务',body:lab(cid)+'已率先完成「'+n.title+'」，该任务已关闭，其他人不必再做。'+(n.reward?team(teamOf(cid)).name+'获得 +'+n.reward+' 冥币。':''),target:'all'});
    return ok('已记录 '+lab(cid)+' 完成'+rw+'，任务已关闭并向全体广播');}
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
// 终极任务：满足条件后由总控点按钮，该队玩家页变成只有一页的终极任务界面。
function setFinal(tid,on){const t=team(tid);if(!t)return no('先选队伍');
  if(!!on===!!t.final)return no(t.name+(t.final?'已经在终极任务中':'本来就没有开启终极任务'));
  if(on){const st=teamStatus(t);if(st.k!=='free')return no(t.name+'还不满足条件：'+st.txt);
    if(t.inRoom)return no(t.name+'还在 '+room(t.inRoom).card+' 里，先结算');
    t.final=true;log('总控让 '+t.name+' 进入终极任务','back');
    pushNotice({kind:'通知',tone:'final',title:'进入终极任务',body:FINAL_MSG,target:'team',ids:[tid]});
    return ok(t.name+'已进入终极任务');}
  t.final=false;log('总控取消 '+t.name+' 的终极任务');return ok(t.name+'已退出终极任务');}
// 开局：各队随机分到一个房间（8 队 8 房）。只能在还没有任何队伍进过房间时用。
function assignStart(){
  if(S.teams.some(t=>t.inRoom||t.played.length)||S.rooms.some(r=>r.teams.length))return no('已经开局，不能再随机分房');
  const ts=S.teams.map(t=>t.id);for(let i=ts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ts[i],ts[j]]=[ts[j],ts[i]];}
  const notes=[];
  ts.forEach((tid,i)=>{const r=ROOMS[i];if(!r)return;const why=whyNotEnter(tid,r.id);if(why){notes.push(team(tid).name+'没分到（'+why+'）');return;}
    S.rooms.find(x=>x.id===r.id).teams.push(tid);team(tid).inRoom=r.id;notes.push(team(tid).name+'→'+r.card);});
  log('开局随机分房：'+notes.join('，'));return ok('已随机分房：'+notes.join('，'));}
function whyNotEnter(tid,rid){
  const t=team(tid),r=room(rid),st=S.rooms.find(x=>x.id===rid);
  if(t.final)return '已进入终极任务';
  if(st.teams.length>=(r.two?2:1))return '房间已满';
  if(t.inRoom)return '正在 '+room(t.inRoom).card;
  if(t.played.includes(r.card))return '已打过';
  if(alive(tid).length<size(tid))return '未满员 '+alive(tid).length+'/'+size(tid);
  return null;
}
function enterRoom(tid,rid){
  if(!tid)return no('先选一支队伍');
  const why=whyNotEnter(tid,rid); if(why)return no(team(tid).name+'不能进 '+room(rid).card+'：'+why);
  S.rooms.find(x=>x.id===rid).teams.push(tid); team(tid).inRoom=rid;
  log(team(tid).name+' 进入 '+room(rid).card+' '+room(rid).name);
  return ok(team(tid).name+'已入场 '+room(rid).card);
}
function eliminate(p,why,where){
  p.st='out'; p.outAt=S.t; p.inAt=null; p.pickAt=null; p.chk=null; p.backAt=null; p.coins=0; p.bail=0; p.at=where||'';
  log(p.id+' '+why+'，原地等黑白无常','hook');
  pushNotice({kind:'通知',tone:'out',title:'你被淘汰了',body:'原因：'+why+'。请留在原地，等黑白无常来接你。',target:'player',ids:[p.id]});
}
// 黑白无常：接到了
function pickup(pid){const p=S.players.find(x=>x.id===pid);
  if(!p)return no('没有这名队员');if(p.st!=='out')return no(p.id+(p.st==='picked'?' 已经接到了':' 现在不在待接状态'));
  p.st='picked';p.pickAt=S.t;log('黑白无常接到 '+p.id+(p.at?'（'+p.at+'）':''));return ok('已接到 '+p.id);}
// 入鬼市登记（黑白无常或孟婆谁点都行，另一方确认）：从这一刻起计停留时间，并领 300 个人冥币。
function checkIn(pid,role){const p=S.players.find(x=>x.id===pid);
  if(!p)return no('没有这名队员');if(p.st!=='out'&&p.st!=='picked')return no(p.id+(p.st==='market'?' 已经在鬼市了':' 不在待接状态'));
  p.st='market';p.inAt=S.t;p.coins=300;p.bail=0;p.chk={by:role,ok:false};
  log(p.id+' 进入鬼市（'+(ROLE_LABEL[role]||role)+'登记，待确认），领 300 冥币','back');
  pushNotice({kind:'通知',title:'你已进入鬼市',body:'已登记，领到 300 冥币。待满 '+MIN_STAY/60+' 分钟且个人冥币 + 队友助力凑够 '+COIN_GOAL+'，找孟婆买命回队。',target:'player',ids:[p.id]});
  return ok(p.id+' 已登记进鬼市，请'+(role==='wuchang'?'孟婆':role==='mengpo'?'黑白无常':'另一方')+'确认');}
function confirmIn(pid,role){const p=S.players.find(x=>x.id===pid);
  if(!p||p.st!=='market'||!p.chk)return no('没有待确认的登记');if(p.chk.ok)return no(p.id+' 已经确认过了');
  const expected=p.chk.by==='mengpo'?'wuchang':p.chk.by==='wuchang'?'mengpo':null;
  if(!expected||role!==expected)return no('要由另一方确认，不能自己确认自己的登记');
  p.chk.ok=true;p.chk.by2=role;log(p.id+' 入鬼市登记已由'+(ROLE_LABEL[role]||role)+'确认');return ok('已确认 '+p.id+' 入鬼市');}
function finishRoom(rid,results,picks={}){
  const r=room(rid),st=S.rooms.find(x=>x.id===rid);
  if(st.teams.length<(r.two?2:1))return no(r.two?'♥ 房间需要两队同场才能结算':'房间里没有队伍');
  for(const tid of st.teams){
    if(!results[tid])return no('请为'+team(tid).name+'选择赢或输');
    if(results[tid]==='lose'&&alive(tid).length&&!alive(tid).some(p=>p.id===picks[tid]))return no('请为'+team(tid).name+'选出被淘汰的队员（现场抽签结果）');
  }
  const notes=[];
  for(const tid of st.teams){
    const t=team(tid); t.played.push(r.card); t.inRoom=null;
    if(results[tid]==='win'){
      t.cards.push(r.card); const pts=r.n*100; t.score+=pts; log(t.name+' 赢下 '+r.card+'，+'+pts+' 冥币','back'); notes.push(t.name+'赢 +'+pts+' 冥币');
    }else{
      const pool=alive(tid); if(!pool.length){log(t.name+' 输了 '+r.card+'，队里已无存活队员');notes.push(t.name+'输（无人可淘汰）');continue;}
      const v=pool.find(p=>p.id===picks[tid]);
      eliminate(v,'输了 '+r.card+' 被抽签淘汰',r.card+' '+r.name); notes.push(t.name+'输，淘汰 '+v.id);
    }
  }
  st.teams=[]; return ok(r.card+' 结算完成：'+notes.join('；'));
}
function hook(actorId,pid,where){
  const p=S.players.find(x=>x.id===pid);
  if(!actorId)return no('先选取得勾魂令的队伍');
  if(!p)return no('先选被点名的队员');
  if(p.team===actorId)return no('不能点名本队队员');
  if(p.st!=='alive')return no(p.id+' 已被淘汰');
  if(team(p.team).final)return no(team(p.team).name+'已进入终极任务，不能勾魂');
  if(protectedLeft(p)>0)return no(p.id+' 刚复活，保护期还剩 '+Math.ceil(protectedLeft(p)/60)+' 分钟');
  S.gate++; eliminate(p,'被'+team(actorId).name+'勾魂（第 '+S.gate+' 次勾魂）',String(where||'').trim().slice(0,40));
  return ok(team(actorId).name+'勾走了 '+p.id);
}
function revive(pid){
  const p=S.players.find(x=>x.id===pid);
  if(!p||p.st!=='market')return no('该队员不在鬼市');
  if(S.t-p.inAt<MIN_STAY)return no(p.id+' 还需在鬼市待满 '+Math.ceil((MIN_STAY-(S.t-p.inAt))/60)+' 分钟');
  const tot=(p.coins||0)+(p.bail||0);
  if(tot<COIN_GOAL)return no(p.id+' 冥币 '+p.coins+' + 队友助力 '+p.bail+' = '+tot+'，还差 '+(COIN_GOAL-tot));
  const carry=tot-COIN_GOAL,tm=team(p.team);
  if(carry>0)tm.score+=carry;
  p.st='alive'; p.backAt=S.t; p.outAt=null; p.inAt=null; p.pickAt=null; p.chk=null; p.at=''; p.coins=0; p.bail=0;
  log(p.id+' 喝下孟婆汤，回到'+tm.name+'（10 分钟内不能被勾魂）'+(carry?'，带回 '+carry+' 冥币':''),'back');
  pushNotice({kind:'通知',title:'买命成功',body:'请领取新的符咒名牌，回到队伍。10 分钟内不能被勾魂。'+(carry?'你在鬼市多赚的 '+carry+' 冥币已存入队伍。':''),target:'player',ids:[p.id]});
  return ok(p.id+' 已复活'+(carry?'，带回 '+carry+' 冥币存入'+tm.name:''));
}
function gapOf(p){return Math.max(0,COIN_GOAL-(p.coins||0)-(p.bail||0));}
function donate(pid,amt,byId){
  const p=S.players.find(x=>x.id===pid),by=S.players.find(x=>x.id===byId);
  if(!p||p.st!=='market')return no('该队员还没进鬼市（要先由黑白无常 / 孟婆登记）');
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
  c.stock--;tm.skills.push({sid:S.sid++,name:c.name,desc:c.desc||'',by:payer,t:S.t});
  log(payer+' 在鬼市花 '+c.price+' 冥币买了技能卡「'+c.name+'」','back');
  pushNotice({kind:'通知',title:'本队获得技能卡',body:payer+' 在鬼市商铺买了「'+c.name+'」。'+(c.desc||'')+' 使用时找工作人员出示。',target:'team',ids:[tm.id]});
  return ok(payer+' 买到「'+c.name+'」，'+tm.name+'现有技能卡 '+tm.skills.length+' 张');}
function useCard(tid,sid){const t=team(tid),i=t.skills.findIndex(k=>k.sid===sid);if(i<0)return no('这张卡不存在');
  const k=t.skills.splice(i,1)[0];log(t.name+' 使用技能卡「'+k.name+'」');return ok(t.name+'已使用「'+k.name+'」');}
function addCard(f){f={name:String((f&&f.name)||'').slice(0,30),desc:String((f&&f.desc)||'').slice(0,200),price:f&&f.price,stock:f&&f.stock};if(!f.name.trim())return no('先写卡名');
  const price=Math.round(+f.price);if(!(price>0))return no('先填价格（大于 0）');const stock=Math.round(+f.stock);if(!(stock>0))return no('先填库存（至少 1）');
  const nm=f.name.trim();S.shop.push({id:'k'+(S.sid++),name:nm,desc:f.desc.trim(),price,stock});log('鬼市商铺上架技能卡「'+nm+'」');return ok('已上架「'+nm+'」');}
// 终极条件：集齐四种花色 + 全员存活 + 队伍当前冥币 ≥ FINAL_SCORE
function teamStatus(t){
  if(t.final)return {k:'free',txt:'终极任务中'};
  const missing=SUITS.filter(s=>!t.cards.some(c=>c.includes(s)));
  const a=alive(t.id).length;
  if(!missing.length&&a>=size(t.id)&&t.score>=FINAL_SCORE)return {k:'free',txt:'可进终极'};
  const bits=[]; if(missing.length)bits.push('缺 '+missing.join('')); if(a<size(t.id))bits.push('存活 '+a+'/'+size(t.id)); if(t.score<FINAL_SCORE)bits.push('积分 '+t.score+'/'+FINAL_SCORE);
  return {k:a<size(t.id)?'bad':'busy',txt:bits.join('，')};
}


function seed(){
  init();
  const go=(tid,rid)=>enterRoom(tid,rid), P=id=>S.players.find(x=>x.id===id);
  go('R','3C');go('B','4D');go('G','3S');go('Y','5C');go('P','6D');go('O','5S');
  S.t=8*60+20;
  finishRoom('3C',{R:'win'});finishRoom('4D',{B:'win'});finishRoom('3S',{G:'win'});
  finishRoom('5C',{Y:'lose'},{Y:'Y-04'});finishRoom('6D',{P:'lose'},{P:'P-02'});finishRoom('5S',{O:'win'});
  S.t=9*60; pickup('Y-04'); checkIn('Y-04','wuchang'); confirmIn('Y-04','mengpo');
  S.t=9*60+30; checkIn('P-02','mengpo'); confirmIn('P-02','wuchang');
  S.t=15*60; go('R','5H');go('G','5H');go('B','6D');
  finishRoom('6D',{B:'win'});
  S.t=17*60; eliminate(P('B-05'),'演示数据','演示位置'); S.t=17*60+30; pickup('B-05'); checkIn('B-05','wuchang'); confirmIn('B-05','mengpo');
  S.t=24*60; P('Y-04').coins=1000; revive('Y-04');
  S.t=25*60; hook('B','R-03','二楼走廊');
  S.t=26*60; eliminate(P('B-06'),'演示数据','演示位置'); pickup('B-06');
  S.t=28*60+30; go('O','4D'); go('Y','3S');
  S.t=29*60; P('B-05').coins=1000; P('P-02').coins=1500;
  log('演示数据就位：5♥ 与 4♦、3♠ 正在进行');
  pushNotice({kind:'任务',sub:'gate',title:'鬼门开：还原鬼片海报',body:'全队 60 秒内还原一张「鬼片海报」造型，到一楼大厅找判官。第一支完成的队伍拿到勾魂令。',target:'all',mins:10,mode:'first'});
  publish({kind:'sidequest',team:'R',quest:'q1',reward:100,mins:0});
}

export function newGame(demo){init();if(demo)seed();return S;}

// Which roles may perform each action ('ctrl' may do everything).
const ROLE_OK={enter:['dealer'],finish:['dealer'],hook:['judge'],done:['judge'],undone:['judge'],
  publish:['ctrl'],revoke:['ctrl'],setscore:['ctrl'],final:['ctrl'],assign:['ctrl'],
  pickup:['wuchang'],checkin:['wuchang','mengpo'],confirm:['wuchang','mengpo'],
  revive:['mengpo'],coin:['mengpo'],buy:['mengpo'],usecard:['mengpo'],addcard:['mengpo'],
  ack:['player'],donate:['player']};

// Apply one action from one signed-in person. Returns {ok,msg}.
export function apply(state,me,a){
  use(state);
  const roles=a&&ROLE_OK[a.type];
  if(!roles)return no('未知操作');
  if(me.role!=='ctrl'&&!roles.includes(me.role))return no('你的身份不能做这个操作');
  if(!FEATURES.cards&&(a.type==='buy'||a.type==='usecard'||a.type==='addcard'))return no('技能卡暂未开放');
  if(me.role==='dealer'&&Array.isArray(me.rooms)&&(a.type==='enter'||a.type==='finish')&&!me.rooms.includes(a.rid))return no('这个房间不归你管，只能操作：'+me.rooms.map(r=>room(r).card).join(' '));
  switch(a.type){
    case 'enter':return enterRoom(a.tid,a.rid);
    case 'finish':return finishRoom(a.rid,a.results||{},a.picks||{});
    case 'hook':return hook(a.actor,a.pid,a.where);
    case 'done':return markDone(+a.nid,a.cid);
    case 'undone':return unmarkDone(+a.nid,a.cid);
    case 'publish':return publish(a.f);
    case 'revoke':return revokeNotice(+a.nid);
    case 'setscore':return setScore(a.tid,a.v);
    case 'final':return setFinal(a.tid,!!a.on);
    case 'assign':return assignStart();
    case 'pickup':return pickup(a.pid);
    case 'checkin':{const role=me.role==='ctrl'?a.party:me.role;if(role!=='mengpo'&&role!=='wuchang')return no('请选择孟婆或黑白无常页面登记');return checkIn(a.pid,role);}
    case 'confirm':return confirmIn(a.pid,me.role==='ctrl'?a.party:me.role);
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

// What one person is allowed to see. Staff see everything. A player sees only their own notices and team cards,
// plus the broadcast lines of the log — so the first page (a copy of the big screen) shows the same thing.
export function viewFor(state,me){
  if(me.role!=='player')return state;
  use(state);const p=state.players.find(x=>x.id===me.pid);
  return {...state,log:state.log.filter(isBcast).slice(0,30),shop:[],notices:state.notices.filter(n=>p&&matches(n,p)),
    teams:state.teams.map(t=>p&&t.id===p.team?t:{...t,skills:[]})};
}

export {size,COIN_GOAL,FEATURES,FINAL_MSG,FINAL_SCORE,MIN_STAY,PER_TEAM,PROTECT,QUESTS,RATE,ROOMS,ROLE_LABEL,SHOP0,SUITS,TEAMS,ack,addCard,alive,buyCard,cands,donate,eliminate,enterRoom,esc,finishRoom,fmt,gapOf,hook,inMarket,indiv,init,isBcast,isFirst,kindLabel,lab,log,markDone,matches,no,ok,protectedLeft,publish,pushNotice,revive,revokeNotice,rewardTxt,room,seed,setScore,targetLabel,tcol,team,teamOf,teamStatus,unmarkDone,useCard,whyNotEnter};
