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
// 4 种花色各有 简单(4) / 困难(8) 两间房，共 8 间。成功得 n×100 分和该花色；每队每间房最多成功一次。
const ROOMS=[
  {id:'4S',card:'♠4',suit:'♠',n:4,name:'一二三纸扎人',rule:'木头人玩法。Dealer 扮纸扎人，转身时还在动的人回起点。'},
  {id:'8S',card:'♠8',suit:'♠',n:8,name:'奈何桥',rule:'格子布上的安全路线只亮几秒，凭记忆走过，踩错回起点。'},
  {id:'4H',card:'♥4',suit:'♥',n:4,name:'少数派',rule:'每轮匿名选红 / 黑，少数派得分，可 bluff。'},
  {id:'8H',card:'♥8',suit:'♥',n:8,name:'孟婆的交易',rule:'玩法待定。'},
  {id:'4C',card:'♣4',suit:'♣',n:4,name:'冥界传话',rule:'Relay Drawing，一路画下去，最后一人猜。'},
  {id:'8C',card:'♣8',suit:'♣',n:8,name:'心有灵犀',rule:'队伍分两组背对背答相同问题，答对越多越好。'},
  {id:'4D',card:'♦4',suit:'♦',n:4,name:'生死簿',rule:'30 秒看桌上物品，盖布后回答问题。'},
  {id:'8D',card:'♦8',suit:'♦',n:8,name:'符咒密码',rule:'倒计时内从真假 clue 里破解密码锁。'}];
const SUITS=['♠','♦','♣','♥'];
// 技能卡机制暂时关闭（2026-10-04）：代码保留，把 cards 改成 true 即可重新打开。
const FEATURES={cards:false};
const SHOP0=[
  {id:'k1',name:'替身纸人',desc:'抵消本队一次淘汰（输房抽签或被勾魂时出示）。',price:600,stock:2},
  {id:'k2',name:'阎王免签',desc:'进一个房间时无视存活人数要求。',price:500,stock:2},
  {id:'k3',name:'偷看生死簿',desc:'逻辑类房间里多看 10 秒。',price:300,stock:3},
  {id:'k4',name:'回魂香',desc:'一名鬼市队员的停留时间要求减半。',price:400,stock:3},
  {id:'k5',name:'勾魂令',desc:'立刻点名一名别队队员去鬼市（仍受保护期限制）。',price:800,stock:1}];
// Scavenger Hunt（内部名 sidequest）题库（占位，正式内容待定）。同一题可以发给不同队伍，每次发布只给一个队伍。
const QUESTS=Array.from({length:8},(_,i)=>({id:'q'+(i+1),title:'Scavenger 占位 '+(i+1),body:'（占位文字，正式内容待定）',reward:100}));
// 鬼门开题库（占位，正式内容待定）。判官从题库选一题发布，先到先得。
const GATES=Array.from({length:2},(_,i)=>({id:'g'+(i+1),title:'鬼门开 占位 '+(i+1),body:'（占位文字，正式内容待定）'}));
const FINAL_MSG='你们已集齐四种花色，全员存活，积分达标！请全队前往一楼大厅，等待终极任务指示。（占位文案）';
const RATE=1;
const PER_TEAM=6, PROTECT=600, MIN_STAY=0, COIN_GOAL=500, COIN_START=200, CARRY_MAX=100, FINAL_SCORE=2400;
// 预约 2 分钟（唯一的自动到期）；游戏 / 重置的建议时长只用于显示，不强制。
const RSV=120, GAME_HINT=480, RESET_HINT=120;
// Scavenger：每次 100 分，任意滚动 10 分钟最多 2 题，全场最多 600 分。
const SCAV_PTS=100, SCAV_WIN=600, SCAV_N=2, SCAV_CAP=600, DUR0=7200;
const KINDS=['公告','鬼门开','sidequest','custom'];
const ROLE_LABEL={wuchang:'黑白无常',mengpo:'孟婆',ctrl:'总控'};
// Lines of the log that go on the big screen's 全场播报 (players get only these, so their first page matches the screen).
const BCAST=[/^(\S+) 被.队通过「鬼门开」任务淘汰/,/^(\S+) 被.队鬼门开奖励淘汰/,/^(\S+) 被(.)队勾魂/,/^(\S+) 输了 (\S+) 被抽签淘汰/,/^(\S+) 喝下孟婆汤/,/^(\S+) 赢下 (\S+)，\+(\d+) 冥币/,/^判官记录 (\S+) 率先完成任务「(.+)」/];
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
  S={v:2,t:0,dur:DUR0,gp:null,log:[],notices:[],nid:1,sid:100,shop:SHOP0.map(c=>({...c})),
     teams:TEAMS.map(t=>({...t,cards:[],cleared:[],played:[],inRoom:null,score:0,skills:[],final:false,cap:t.id+'-01',scav:[]})),
     rooms:ROOMS.map(r=>({id:r.id,st:'open',rt:null,at:0,teams:[]})),players:[]};
  TEAMS.forEach(t=>{for(let i=1;i<=PER_TEAM;i++)S.players.push({id:t.id+'-'+String(i).padStart(2,'0'),team:t.id,st:'alive',outAt:null,inAt:null,pickAt:null,at:'',chk:null,backAt:null,coins:0,bail:0});});
  log('活动开始，'+TEAMS.length+' 队 × '+PER_TEAM+' 人入场');
}
// 旧版本的存档（房间编号不同等）不能继续用，需要重置。
const needsReset=st=>!st||st.v!==2||!Array.isArray(st.rooms)||st.rooms.length!==ROOMS.length||st.rooms.some((r,i)=>r.id!==ROOMS[i].id);
// 房间状态：open 可预约 · rsv 已预约（2 分钟自动失效）· play 游戏中 · reset 重置中
const rstate=r=>r.st==='rsv'&&S.t-r.at>=RSV?'open':r.st;
const rsvLeft=r=>r.st==='rsv'?Math.max(0,RSV-(S.t-r.at)):0;
function sweep(){S.rooms.forEach(r=>{if(r.st==='rsv'&&S.t-r.at>=RSV){log(team(r.rt).name+' 预约 '+room(r.id).card+' 已过期','');r.st='open';r.rt=null;}});}
const rsvOf=tid=>S.rooms.find(r=>rstate(r)==='rsv'&&r.rt===tid);
const gated=()=>!!S.gp;
// 总时间用完（S.t 由服务器在每次操作前设好）：暂停预约与入场，已在房间里的队伍照常打完、结算、重置。
const timeUp=()=>S.t>=(S.dur||DUR0);

function matches(n,p){
  switch(n.target){case 'all':return true;case 'team':return n.ids.includes(p.team);case 'player':return n.ids.includes(p.id);
  case 'market':return p.st==='market';case 'alive':return p.st==='alive';case 'everyone':return true;}return false;}
// 工作人员能看到的公告：发给「工作人员」或「所有人」的（工作人员没有个人编号，已读只记在本机）
const staffSees=n=>n.target==='staff'||n.target==='everyone'||n.sub==='gate';
function targetLabel(n){return n.target==='all'?'全体玩家':n.target==='team'?team(n.ids[0]).name:n.target==='player'?(n.ids.length<=4?n.ids.join('、'):n.ids.slice(0,3).join('、')+' 等 '+n.ids.length+' 人'):n.target==='market'?'鬼市中的人':n.target==='staff'?'工作人员':n.target==='everyone'?'所有人':'存活玩家';}
const rewardTxt=n=>n.reward?'+'+n.reward+' 冥币':'';
const teamOf=id=>id.includes('-')?id.split('-')[0]:id;
const kindLabel=n=>n.kind==='任务'?(n.sub==='side'?'Scavenger Hunt':n.sub==='custom'?'自定义任务':'鬼门开'):n.kind;
const isFirst=n=>(n.mode||'first')==='first';
const indiv=n=>n.target==='player'||n.target==='market';
const lab=id=>id.includes('-')?id:team(id).name;
const tcol=id=>team(teamOf(id)).color;
function cands(n){const a=S.players.filter(p=>matches(n,p));return indiv(n)?a.map(p=>p.id):[...new Set(a.map(p=>p.team))];}
function pushNotice(o){S.notices.unshift({id:S.nid++,q:o.q||null,reward:o.reward||0,mode:o.mode||null,sub:o.sub||null,tone:o.tone||'',t:S.t,kind:o.kind,title:o.title,body:o.body,target:o.target,ids:o.ids||[],due:o.mins?S.t+o.mins*60:null,acks:{},done:{}});}
// 公告：发给任意对象。鬼门开：发给全场，先到先得，完成时全场播报。sidequest：从题库选一题，只发给一个队伍，不播报。
function publish(f){f=f||{};const str=(v,n)=>String(v==null?'':v).slice(0,n);f={...f,title:str(f.title,80),body:str(f.body,1000)};
  if(!KINDS.includes(f.kind))return no('类型不对');
  let target=f.target,ids=[],mode=null,sub=null,reward=0,qid=null;
  if(f.kind==='sidequest'){
    let q=QUESTS.find(x=>x.id===f.quest);
    if(!q&&f.quest==='custom'){const ti=f.title.trim();if(!ti)return no('先写自定义题目');q={id:'x:'+ti.slice(0,20),title:ti,body:f.body.trim()};}
    if(!q)return no('先从题库选一个 Scavenger Hunt');qid=q.id;
    if(!team(f.team))return no('先选队伍');
    const why=scavWhy(f.team,q.id);if(why)return no(team(f.team).name+'：'+why);
    target='team';ids=[f.team];mode='each';sub='side';f.title=q.title;f.body=q.body;reward=SCAV_PTS;
  }else if(f.kind==='鬼门开'){
    const g=GATES.find(x=>x.id===f.gate);if(g){f.title=g.title;f.body=g.body;}
    if(!f.title.trim())return no('先从题库选一个鬼门开');
    if(S.gp)return no('鬼门开正在进行，先结束上一轮');
    target='all';mode='first';sub='gate';reward=0;
  }else{
    if(!['all','team','player','alive','market','staff','everyone'].includes(target))return no('发布对象不对');
    if((target==='staff'||target==='everyone')&&f.kind!=='公告')return no('只有公告能发给工作人员');
    if(!f.title.trim())return no('先写标题');
    if(target==='team'){if(!team(f.team))return no('先选队伍');ids=[f.team];}
    if(f.kind==='custom'){sub='custom';mode='each';reward=Math.max(0,Math.min(5000,Math.round(+f.reward||0)));}
    if(target==='player'){const want=Array.isArray(f.players)?f.players:f.player?[f.player]:[];ids=[...new Set(want)].filter(id=>S.players.some(p=>p.id===id));if(!ids.length)return no('先选队员');}
  }
  pushNotice({kind:f.kind==='公告'?'公告':'任务',sub,title:f.title.trim(),body:f.body.trim(),target,ids,mins:Math.max(0,+f.mins||0),mode,reward,q:qid});
  const n=S.notices[0];
  if(sub==='gate'){S.gp={nid:n.id,win:null,res:false};log('鬼门开：各房间暂停开放（已开始的可打完当前一局），结束后恢复','hook');}log('判官发布'+kindLabel(n)+'「'+n.title+'」→ '+targetLabel(n));
  return ok('已发布给 '+targetLabel(n)+'，共 '+S.players.filter(p=>matches(n,p)).length+' 名玩家'+(staffSees(n)?' + 全体工作人员':''));}
// 判官直接兑换一道 Scavenger Hunt：发布给该队并立即记完成（+100，受额度限制）。题库没有的题可自定义。
function scavRedeem(tid,qid,title,body){
  if(!team(tid))return no('先选队伍');
  let t,b,key;const q=QUESTS.find(x=>x.id===qid);
  if(q){t=q.title;b=q.body;key=q.id;}
  else{t=String(title||'').trim().slice(0,80);if(!t)return no('先选题目，或写自定义题目');b=String(body||'').slice(0,1000);key='x:'+t.slice(0,20);}
  const why=scavWhy(tid,key);if(why)return no(team(tid).name+'：'+why);
  pushNotice({kind:'任务',sub:'side',title:t,body:b,target:'team',ids:[tid],mode:'each',reward:SCAV_PTS,q:key});
  return markDone(S.notices[0].id,tid);}
function ack(nid,pid){const n=S.notices.find(x=>x.id===nid);if(n&&!n.acks[pid])n.acks[pid]=S.t;}
function markDone(nid,cid){const n=S.notices.find(x=>x.id===nid);if(!n)return no('任务不存在');
  if(n.done[cid])return no(lab(cid)+'已经记录过');
  const w=Object.keys(n.done)[0];
  if(isFirst(n)&&w)return no('任务已关闭：'+lab(w)+'已率先完成，只能有一方完成');
  let pay=n.reward;
  if(n.sub==='side'){const tm=team(teamOf(cid)),why=scavWhy(tm.id,n.q);if(why)return no(tm.name+'：'+why);
    pay=Math.min(n.reward,scavInfo(tm.id).left);tm.scav.push({nid:n.id,q:n.q,t:S.t,pts:pay});}
  n.done[cid]={t:S.t};
  if(n.sub==='gate'&&S.gp&&S.gp.nid===n.id)S.gp.win=cid;
  if(pay){const tm=team(teamOf(cid));tm.score+=pay;n.done[cid].pts=pay;}
  const rw=pay?'，'+team(teamOf(cid)).name+' +'+pay+' 冥币':'';
  if(isFirst(n)){log('判官记录 '+lab(cid)+' 率先完成任务「'+n.title+'」，任务关闭'+rw,'back');
    pushNotice({kind:'通知',title:lab(cid)+'率先完成任务',body:lab(cid)+'已率先完成「'+n.title+'」，该任务已关闭，其他人不必再做。'+(pay?team(teamOf(cid)).name+'获得 +'+pay+' 冥币。':''),target:'all'});
    return ok('已记录 '+lab(cid)+' 完成'+rw+'，任务已关闭并向全体广播'+(n.sub==='gate'?'；请在判官页处理鬼门开奖励':''));}
  log('判官记录 '+lab(cid)+' 完成任务「'+n.title+'」'+rw,'back');return ok('已记录 '+lab(cid)+' 完成'+rw);}
function unmarkDone(nid,cid){const n=S.notices.find(x=>x.id===nid);if(!n||!n.done[cid])return no('没有这条记录');
  const pts=n.done[cid].pts||0;if(pts){const tm=team(teamOf(cid));tm.score=Math.max(0,tm.score-pts);}
  if(n.sub==='side')team(teamOf(cid)).scav=team(teamOf(cid)).scav.filter(r=>r.nid!==n.id);
  if(n.sub==='gate'&&S.gp&&S.gp.nid===n.id&&!S.gp.res)S.gp.win=null;
  delete n.done[cid];log('判官撤销 '+lab(cid)+' 的任务完成记录「'+n.title+'」'+(pts?'，扣回 '+pts+' 冥币':''),'back');return ok('已撤销'+(pts?'，扣回 '+pts+' 冥币':''));}
function revokeNotice(nid){const i=S.notices.findIndex(x=>x.id===nid);if(i<0)return no('这条已经不存在');
  const n=S.notices[i];let back=0;
  Object.entries(n.done).forEach(([cid,d])=>{if(d.pts){const tm=team(teamOf(cid));tm.score=Math.max(0,tm.score-d.pts);back+=d.pts;}});
  if(n.sub==='side')Object.keys(n.done).forEach(cid=>{const tm=team(teamOf(cid));tm.scav=tm.scav.filter(r=>r.nid!==n.id);});
  if(n.sub==='gate'&&S.gp&&S.gp.nid===n.id)S.gp=null;
  S.notices.splice(i,1);log('判官撤销发布'+kindLabel(n)+'「'+n.title+'」'+(back?'，扣回奖励 '+back+' 冥币':''),'back');
  return ok('已撤销「'+n.title+'」'+(back?'，扣回奖励 '+back+' 冥币':''));}
// Scavenger：按「实际兑换时间」滚动计算，不分固定时段。
function scavInfo(tid){const t=team(tid),recs=t.scav.slice().sort((a,b)=>a.t-b.t),used=recs.reduce((a,r)=>a+r.pts,0),left=Math.max(0,SCAV_CAP-used);
  const recent=recs.filter(r=>S.t-r.t<SCAV_WIN);
  const nextAt=left<=0?null:recent.length>=SCAV_N?recent[recent.length-SCAV_N].t+SCAV_WIN:S.t;
  return {used,left,cap:SCAV_CAP,n:recent.length,max:SCAV_N,nextAt,capped:left<=0,recs:recs.slice().reverse()};}
function scavWhy(tid,qid){const i=scavInfo(tid);
  if(i.capped)return '已达 Scavenger 上限 '+SCAV_CAP+' 分，不再加分';
  if(i.n>=SCAV_N)return SCAV_WIN/60+' 分钟内已完成 '+SCAV_N+' 题，'+fmt(i.nextAt)+' 后可再兑换';
  if(qid&&team(tid).scav.some(r=>r.q===qid))return '这道题已经兑换过';
  return null;}
function setScore(tid,v){const t=team(tid);v=Math.round(+v);if(!Number.isFinite(v)||v<0)return no('冥币数要是不小于 0 的整数');
  const old=t.score;if(v===old)return no('冥币数没有变化');t.score=v;log('总控修改 '+t.name+' 冥币：'+old+' → '+v);return ok(t.name+'冥币已改为 '+v);}
// 终极任务：总控手动放行，不受条件限制。条件不满足时由页面弹窗列出缺项（finalMiss），确认后照样放行。
function setFinal(tid,on){const t=team(tid);if(!t)return no('先选队伍');
  if(!!on===!!t.final)return no(t.name+(t.final?'已经在终极任务中':'本来就没有开启终极任务'));
  if(on){const miss=finalMiss(t);
    if(t.inRoom){const r=S.rooms.find(x=>x.id===t.inRoom);r.teams=r.teams.filter(x=>x!==tid);r.st='reset';r.at=S.t;{const h=(t.hist||[]).find(x=>x.res===null&&x.rid===r.id);if(h){h.res='left';h.t1=S.t;}}t.inRoom=null;}
    const rv=rsvOf(tid);if(rv){rv.st='open';rv.rt=null;}
    t.final=true;log('总控让 '+t.name+' 进入终极任务'+(miss.length?'（条件未满足：'+miss.join('，')+'）':''),'back');
    pushNotice({kind:'通知',tone:'final',title:'进入终极任务',body:FINAL_MSG,target:'team',ids:[tid]});
    return ok(t.name+'已进入终极任务'+(miss.length?'（条件未满足，已手动放行）':''));}
  t.final=false;log('总控取消 '+t.name+' 的终极任务');return ok(t.name+'已退出终极任务');}
function finalMiss(t){const m=[],miss=SUITS.filter(x=>!t.cards.some(c=>c.includes(x))),a=alive(t.id).length;
  if(t.score<FINAL_SCORE)m.push('积分不足：'+t.score+' / '+FINAL_SCORE+'（差 '+(FINAL_SCORE-t.score)+'）');
  if(miss.length)m.push('花色未集齐：缺 '+miss.join(' '));
  if(a<size(t.id))m.push('存活人数不足：'+a+' / '+size(t.id));
  return m;}
// 开局：各队随机分到一个房间（8 队 8 房）。只能在还没有任何队伍进过房间时用。
function assignStart(){
  if(S.teams.some(t=>t.inRoom||t.played.length)||S.rooms.some(r=>r.teams.length||r.st!=='open'))return no('已经开局，不能再随机分房');
  const ts=S.teams.map(t=>t.id);for(let i=ts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ts[i],ts[j]]=[ts[j],ts[i]];}
  const notes=[];
  ts.forEach((tid,i)=>{const r=ROOMS[i];if(!r)return;const why=whyNotEnter(tid,r.id);if(why){notes.push(team(tid).name+'没分到（'+why+'）');return;}
    seat(tid,r.id);notes.push(team(tid).name+'→'+r.card);});
  log('开局随机分房：'+notes.join('，'));return ok('已随机分房：'+notes.join('，'));}
function seat(tid,rid){const r=S.rooms.find(x=>x.id===rid);r.st='play';r.rt=null;r.at=S.t;r.teams=[tid];const t=team(tid);t.inRoom=rid;(t.hist=t.hist||[]).push({rid,t0:S.t,res:null,pts:0,out:null});}
// 预约：由本队队长（或总控）操作；每队同时只能预约一间，预约 2 分钟，可取消。
function whyNotReserve(tid,rid){
  const t=team(tid),r=S.rooms.find(x=>x.id===rid),st=rstate(r);
  if(t.final)return '已进入终极任务';
  if(gated())return '鬼门开期间暂停预约';
  if(timeUp())return '时间到，暂停预约';
  if(t.inRoom)return '正在 '+room(t.inRoom).card;
  const mine=rsvOf(tid);if(mine&&mine.id!==rid)return '已预约 '+room(mine.id).card+'，先取消';
  if(st==='rsv'&&r.rt!==tid)return '已被'+team(r.rt).name+'预约';
  if(st==='rsv')return '本队已预约这间';
  if(st==='play')return '游戏中';
  if(st==='reset')return '重置中';
  if(t.cleared.includes(rid))return '已通关';
  if(alive(tid).length<size(tid))return '未满员 '+alive(tid).length+'/'+size(tid)+'，先去鬼市买命，可先做 Scavenger';
  return null;}
function reserve(tid,rid){if(!team(tid))return no('先选队伍');if(!room(rid))return no('没有这个房间');
  const why=whyNotReserve(tid,rid);if(why)return no(team(tid).name+'不能预约 '+room(rid).card+'：'+why);
  const r=S.rooms.find(x=>x.id===rid);r.st='rsv';r.rt=tid;r.at=S.t;
  log(team(tid).name+' 预约 '+room(rid).card+'（'+RSV/60+' 分钟内到场）');return ok('已预约 '+room(rid).card+'，请在 '+RSV/60+' 分钟内到场');}
function cancelRsv(tid){const r=rsvOf(tid);if(!r)return no('本队没有有效的预约');
  r.st='open';r.rt=null;log(team(tid).name+' 取消预约 '+room(r.id).card);return ok('已取消 '+room(r.id).card+' 的预约');}
// Dealer 手动设置：重置完成，房间回到可预约。
function resetDone(rid){const r=S.rooms.find(x=>x.id===rid);if(!r)return no('没有这个房间');
  if(r.st!=='reset')return no(room(rid).card+'现在不在重置中');r.st='open';r.rt=null;log(room(rid).card+' 重置完成，可预约');return ok(room(rid).card+'已回到可预约');}
function whyNotEnter(tid,rid){
  const t=team(tid),r=S.rooms.find(x=>x.id===rid),st=rstate(r);
  if(t.final)return '已进入终极任务';
  if(gated())return '鬼门开期间暂停入场';
  if(timeUp())return '时间到，暂停入场';
  if(t.inRoom)return '正在 '+room(t.inRoom).card;
  if(st==='play')return '游戏中';
  if(st==='reset')return '重置中';
  if(st==='rsv'&&r.rt!==tid)return '已被'+team(r.rt).name+'预约';
  const mine=rsvOf(tid);if(mine&&mine.id!==rid)return '已预约 '+room(mine.id).card+'，先取消';
  if(t.cleared.includes(rid))return '已通关';
  if(alive(tid).length<size(tid))return '未满员 '+alive(tid).length+'/'+size(tid);
  return null;
}
function enterRoom(tid,rid){
  if(!tid)return no('先选一支队伍');
  const why=whyNotEnter(tid,rid); if(why)return no(team(tid).name+'不能进 '+room(rid).card+'：'+why);
  seat(tid,rid);
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
// 两方交接：黑白无常「送入鬼市」→ 孟婆确认；孟婆「登记」→ 黑白无常确认。发起方不能自己确认，两方都确认后才进入鬼市。
// 黑白无常发起时视为已接到（st=picked）；孟婆发起时人还没被接，st 保持 out，只出现在黑白无常页右栏等待确认。
function checkIn(pid,role){const p=S.players.find(x=>x.id===pid);
  if(!p)return no('没有这名队员');if(p.chk&&!p.chk.ok)return no('已登记，等待另一方确认');
  if(p.st!=='out'&&p.st!=='picked')return no('不在待入鬼市状态');
  if(role==='wuchang'&&p.st==='out'){p.st='picked';p.pickAt=S.t;}
  p.chk={by:role,ok:false};
  log(p.id+' 入鬼市登记，等待'+(role==='wuchang'?'孟婆':'黑白无常')+'确认');
  return ok('已登记，等待另一方确认');}
function confirmIn(pid,role){const p=S.players.find(x=>x.id===pid);
  if(!p||!['out','picked'].includes(p.st)||!p.chk)return no('没有待确认的登记');if(p.chk.ok)return no('已经确认过了');
  const expected=p.chk.by==='mengpo'?'wuchang':['wuchang','ctrl'].includes(p.chk.by)?'mengpo':null;
  if(!expected||role!==expected)return no('要由另一方确认，不能自己确认自己的登记');
  if(p.pickAt==null)p.pickAt=S.t;
  p.st='market';p.inAt=S.t;p.coins=COIN_START;p.bail=0;p.chk.ok=true;p.chk.by2=role;
  log(p.id+' 正式进入鬼市，由'+ROLE_LABEL[role]+'确认，领 '+COIN_START+' 冥币','back');
  pushNotice({kind:'通知',title:'你已进入鬼市',body:'已确认入鬼市，领到 '+COIN_START+' 冥币。个人冥币 + 队友助力凑够 '+COIN_GOAL+'，就可以找孟婆买命回队。',target:'player',ids:[p.id]});
  return ok('已确认 '+p.id+' 入鬼市');}
function finishRoom(rid,results,picks={}){
  const r=room(rid),st=S.rooms.find(x=>x.id===rid);
  if(!st.teams.length)return no('房间里没有队伍');
  for(const tid of st.teams){
    if(!results[tid])return no('请为'+team(tid).name+'选择赢或输');
    if(results[tid]==='lose'&&alive(tid).length&&!alive(tid).some(p=>p.id===picks[tid]))return no('请为'+team(tid).name+'选出被淘汰的队员（现场抽签结果）');
  }
  const notes=[];
  for(const tid of st.teams){
    const t=team(tid); t.played.push(rid); t.inRoom=null;
    const h=(t.hist=t.hist||[]).filter(x=>x.rid===rid&&x.res===null).pop()||(t.hist[t.hist.length]={rid,t0:st.at,res:null,pts:0,out:null});h.t1=S.t;h.res=results[tid];
    if(results[tid]==='win'){
      if(!t.cleared.includes(rid))t.cleared.push(rid);
      if(!t.cards.includes(r.card))t.cards.push(r.card); const pts=r.n*100; t.score+=pts; h.pts=pts; log(t.name+' 赢下 '+r.card+'，+'+pts+' 冥币','back'); notes.push(t.name+'赢 +'+pts+' 冥币');
    }else{
      const pool=alive(tid); if(!pool.length){log(t.name+' 输了 '+r.card+'，队里已无存活队员');notes.push(t.name+'输（无人可淘汰）');continue;}
      const v=pool.find(p=>p.id===picks[tid]);
      h.out=v.id; eliminate(v,'输了 '+r.card+' 被抽签淘汰',r.card+' '+r.name); notes.push(t.name+'输，淘汰 '+v.id);
    }
  }
  st.teams=[]; st.st='reset'; st.at=S.t; st.rt=null;
  return ok(r.card+' 结算完成，进入重置：'+notes.join('；'));
}
// 免费复活（鬼门开奖励、勾魂令「复活」效果共用）
function freeRevive(p,wt,why){
  p.st='alive';p.backAt=S.t;p.outAt=null;p.inAt=null;p.pickAt=null;p.chk=null;p.at='';p.coins=0;p.bail=0;
  log(p.id+' 因'+why+'免费复活，回到'+wt.name,'back');
  pushNotice({kind:'通知',title:'免费复活',body:why+'：你被免费复活，请领取新的符咒名牌回到队伍。',target:'player',ids:[p.id]});
}
// 勾魂令：取得勾魂令的队伍选效果。mode='kill'（默认）淘汰别队一名存活队员；mode='revive' 免费复活本队一名队员。
// 建议（满员 → 淘汰，缺人 → 复活）只在判官页提示，这里两种都允许。
function hook(actorId,pid,where,mode){
  const p=S.players.find(x=>x.id===pid);
  if(!actorId)return no('先选取得勾魂令的队伍');
  if(mode==='revive'){
    if(!p)return no('先选要复活的队员');
    if(p.team!==actorId||p.st==='alive')return no('请选'+team(actorId).name+'里一名未存活的队友');
    freeRevive(p,team(actorId),'勾魂令');
    return ok(team(actorId).name+'用勾魂令复活了 '+p.id);
  }
  if(!p)return no('先选被点名的队员');
  if(p.team===actorId)return no('不能点名本队队员');
  if(p.st!=='alive')return no(p.id+' 已被淘汰');
  if(team(p.team).final)return no(team(p.team).name+'已进入终极任务，不能勾魂');
  if(protectedLeft(p)>0)return no(p.id+' 刚复活，保护期还剩 '+Math.ceil(protectedLeft(p)/60)+' 分钟');
  eliminate(p,'被'+team(actorId).name+'通过「鬼门开」任务淘汰',String(where||'').trim().slice(0,40));
  return ok(team(actorId).name+'勾走了 '+p.id);
}
function revive(pid){
  const p=S.players.find(x=>x.id===pid);
  if(!p||p.st!=='market'||(p.chk&&!p.chk.ok))return no('该队员不在鬼市');
  const tot=(p.coins||0)+(p.bail||0);
  if(tot<COIN_GOAL)return no(p.id+' 冥币 '+p.coins+' + 队友助力 '+p.bail+' = '+tot+'，还差 '+(COIN_GOAL-tot));
  const carry=Math.min(CARRY_MAX,tot-COIN_GOAL),tm=team(p.team);
  if(carry>0)tm.score+=carry;
  p.st='alive'; p.backAt=S.t; p.outAt=null; p.inAt=null; p.pickAt=null; p.chk=null; p.at=''; p.coins=0; p.bail=0;
  log(p.id+' 喝下孟婆汤，回到'+tm.name+'（10 分钟内不能被勾魂）'+(carry?'，带回 '+carry+' 冥币':''),'back');
  pushNotice({kind:'通知',title:'买命成功',body:'请领取新的符咒名牌，回到队伍。10 分钟内不能被勾魂。'+(carry?'你在鬼市多赚的冥币有 '+carry+' 已存入队伍。':''),target:'player',ids:[p.id]});
  return ok(p.id+' 已复活'+(carry?'，带回 '+carry+' 冥币存入'+tm.name:''));
}
function gapOf(p){return Math.max(0,COIN_GOAL-(p.coins||0)-(p.bail||0));}
// 鬼门开奖励（判官处理）：率先完成的队伍缺人 → 免费复活一名队友；满员 → 指定别队一名存活队员淘汰。不加分。
function gateReward(pid){const g=S.gp;if(!g)return no('现在没有进行中的鬼门开');if(!g.win)return no('还没有队伍率先完成');if(g.res)return no('奖励已处理');
  const wt=team(g.win),p=S.players.find(x=>x.id===pid);if(!p)return no('先选队员');
  if(alive(wt.id).length<size(wt.id)){
    if(p.team!==wt.id||p.st==='alive')return no('请选'+wt.name+'里一名未存活的队友（免费复活）');
    freeRevive(p,wt,'鬼门开奖励');
    g.res=true;S.gp=null;log('鬼门开结束，房间恢复开放');return ok(p.id+' 已免费复活，鬼门开结束');}
  if(p.team===wt.id)return no('请选别队的存活队员');if(p.st!=='alive')return no(p.id+' 已被淘汰');
  if(team(p.team).final)return no(team(p.team).name+'已进入终极任务，不能被淘汰');
  eliminate(p,'被'+wt.name+'通过「鬼门开」任务淘汰','');
  g.res=true;S.gp=null;log('鬼门开结束，房间恢复开放');return ok(wt.name+'淘汰了 '+p.id+'，鬼门开结束');}
function gateEnd(){if(!S.gp)return no('现在没有进行中的鬼门开');S.gp=null;log('鬼门开结束，房间恢复开放');return ok('鬼门开已结束，房间恢复开放');}
function setDur(secs){secs=Math.round(+secs);if(!(secs>=60&&secs<=86400))return no('总时长要在 1 分钟到 24 小时之间');S.dur=secs;log('总控把总时长设为 '+Math.floor(secs/60)+' 分钟');return ok('总时长已设为 '+Math.floor(secs/60)+' 分钟');}
function setCap(tid,pid){const t=team(tid),p=S.players.find(x=>x.id===pid);if(!t)return no('先选队伍');if(!p||p.team!==tid)return no('队长要从本队队员里选');
  if(t.cap===pid)return no(pid+' 已经是队长');t.cap=pid;log('总控指定 '+pid+' 为'+t.name+'队长');return ok(pid+' 现在是'+t.name+'队长');}
function donate(pid,amt,byId){
  const p=S.players.find(x=>x.id===pid),by=S.players.find(x=>x.id===byId);
  if(!p||p.st!=='market'||(p.chk&&!p.chk.ok))return no('该队员还没进鬼市（要先由黑白无常 / 孟婆登记）');
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
  pushNotice({kind:'通知',title:'队友为你助力了',body:by.id+' 花队伍 '+amt*RATE+' 冥币为你换来 '+amt+' 冥币。你现在合计 '+(p.coins+p.bail)+'，够 '+COIN_GOAL+' 就能买命。',target:'player',ids:[p.id]});
  return ok('已为 '+p.id+' 助力 '+amt+' 冥币（花费 '+amt*RATE+'），队伍剩余 '+t.score+' 冥币');
}
function buyCard(kid,buyer){const c=S.shop.find(x=>x.id===kid);
  if(!c)return no('没有这张卡');if(!buyer)return no('先选买家');if(c.stock<=0)return no('「'+c.name+'」已售罄');
  let tm,payer;
  {const p=S.players.find(x=>x.id===buyer);if(!p||p.st!=='market'||(p.chk&&!p.chk.ok))return no('只有在鬼市的人能用个人冥币');
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
// 终极条件（仅提示，放行由总控手动）：集齐四种花色 + 全员存活 + 队伍当前积分 ≥ FINAL_SCORE
function teamStatus(t){
  if(t.final)return {k:'free',txt:'终极任务中'};
  const miss=finalMiss(t),a=alive(t.id).length;
  if(!miss.length)return {k:'free',txt:'可进终极'};
  const ms=SUITS.filter(x=>!t.cards.some(c=>c.includes(x)));
  const bits=[]; if(ms.length)bits.push('缺 '+ms.join('')); if(a<size(t.id))bits.push('存活 '+a+'/'+size(t.id)); if(t.score<FINAL_SCORE)bits.push('积分 '+t.score+'/'+FINAL_SCORE);
  return {k:a<size(t.id)?'bad':'busy',txt:bits.join('，')};
}

function seed(){
  init();
  const go=(tid,rid)=>enterRoom(tid,rid), P=id=>S.players.find(x=>x.id===id);
  const fin=(rid,res,pk)=>{finishRoom(rid,res,pk);resetDone(rid);};
  go('R','4C');go('B','4D');go('G','8S');go('Y','8C');go('P','8D');go('O','4S');
  S.t=8*60+20;
  fin('4C',{R:'win'});fin('4D',{B:'win'});fin('8S',{G:'win'});
  fin('8C',{Y:'lose'},{Y:'Y-04'});fin('8D',{P:'lose'},{P:'P-02'});fin('4S',{O:'win'});
  S.t=9*60; pickup('Y-04'); checkIn('Y-04','wuchang'); confirmIn('Y-04','mengpo');
  S.t=9*60+30; checkIn('P-02','mengpo'); confirmIn('P-02','wuchang');
  S.t=15*60; go('R','8H');go('G','4H');go('B','8D');
  fin('8D',{B:'win'});
  S.t=17*60; eliminate(P('B-05'),'演示数据','演示位置'); S.t=17*60+30; pickup('B-05'); checkIn('B-05','wuchang'); confirmIn('B-05','mengpo');
  S.t=24*60; P('Y-04').coins=COIN_GOAL; revive('Y-04');
  S.t=25*60; hook('B','R-03','二楼走廊');
  S.t=26*60; eliminate(P('B-06'),'演示数据','演示位置'); pickup('B-06');
  S.t=27*60; finishRoom('4H',{G:'win'});
  S.t=28*60; finishRoom('8H',{R:'win'});resetDone('8H');
  S.t=28*60+30; go('O','4D'); go('Y','8S');
  S.t=29*60; P('B-05').coins=COIN_GOAL; P('P-02').coins=COIN_GOAL+200; reserve('G','4C'); reserve('K','8H');
  log('演示数据就位：4♦ 与 8♠ 进行中，4♥ 重置中，4♣、8♥ 已预约');
  pushNotice({kind:'任务',sub:'gate',title:'鬼门开 占位',body:'（占位文字，正式内容待定）',target:'all',mins:10,mode:'first'});
  scavRedeem('R','q1');
}

export function newGame(demo){init();if(demo)seed();return S;}

// Which roles may perform each action ('ctrl' may do everything).
const ROLE_OK={enter:['dealer'],finish:['dealer'],resetdone:['dealer'],reserve:['player'],cancelrsv:['player'],setcap:['ctrl'],setdur:['ctrl'],gatereward:['judge'],gateend:['judge'],hook:['judge'],done:['judge'],undone:['judge'],
  publish:['ctrl'],revoke:['ctrl'],setscore:['ctrl'],final:['ctrl'],assign:['ctrl'],scavredeem:['judge'],
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
  if(me.role==='dealer'&&Array.isArray(me.rooms)&&(a.type==='enter'||a.type==='finish'||a.type==='resetdone')&&!me.rooms.includes(a.rid))return no('这个房间不归你管，只能操作：'+me.rooms.map(r=>room(r).card).join(' '));
  sweep();
  const myTeam=()=>{if(me.role==='player'){const p=S.players.find(x=>x.id===me.pid);if(!p)return null;return team(p.team);}return team(a.tid);};
  switch(a.type){
    case 'reserve':case 'cancelrsv':{const t=myTeam();if(!t)return no('先选队伍');
      if(me.role==='player'&&t.cap!==me.pid)return no('只有队长（'+t.cap+'）能预约 / 取消预约');
      return a.type==='reserve'?reserve(t.id,a.rid):cancelRsv(t.id);}
    case 'resetdone':return resetDone(a.rid);
    case 'gatereward':return gateReward(a.pid);
    case 'gateend':return gateEnd();
    case 'setcap':return setCap(a.tid,a.pid);
    case 'setdur':return setDur(a.secs);
    case 'enter':return enterRoom(a.tid,a.rid);
    case 'finish':return finishRoom(a.rid,a.results||{},a.picks||{});
    case 'hook':return hook(a.actor,a.pid,a.where,a.mode);
    case 'scavredeem':return scavRedeem(a.tid,a.qid,a.title,a.body);
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
    case 'coin':{const p=S.players.find(x=>x.id===a.pid);if(!p||p.st!=='market'||(p.chk&&!p.chk.ok))return no('该队员不在鬼市');
      const nc=Math.max(0,Math.round(+a.coins)||0);if((p.coins||0)+(p.bail||0)>=COIN_GOAL&&nc>p.coins)return no(p.id+' 已凑够 '+COIN_GOAL+'，不能继续刷分，请直接买命');
      p.coins=nc;return ok(p.id+' 冥币记为 '+p.coins);}
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
    teams:state.teams.map(t=>p&&t.id===p.team?t:{...t,skills:[],hist:[]})};
}

export {staffSees,timeUp,needsReset,rstate,rsvLeft,rsvOf,whyNotReserve,reserve,cancelRsv,resetDone,gateReward,gateEnd,scavInfo,scavWhy,finalMiss,RSV,GAME_HINT,RESET_HINT,SCAV_PTS,SCAV_WIN,SCAV_N,SCAV_CAP,COIN_START,CARRY_MAX,DUR0,size,COIN_GOAL,FEATURES,FINAL_MSG,FINAL_SCORE,MIN_STAY,PER_TEAM,PROTECT,QUESTS,GATES,RATE,ROOMS,ROLE_LABEL,SHOP0,SUITS,TEAMS,ack,addCard,alive,buyCard,cands,donate,eliminate,enterRoom,esc,finishRoom,fmt,gapOf,hook,inMarket,indiv,init,isBcast,isFirst,kindLabel,lab,log,markDone,matches,no,ok,protectedLeft,publish,pushNotice,revive,revokeNotice,rewardTxt,room,seed,setScore,targetLabel,tcol,team,teamOf,teamStatus,unmarkDone,useCard,whyNotEnter};
