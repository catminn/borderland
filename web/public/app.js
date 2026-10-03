// 百鬼夜行 · browser app.
// The server owns the game state; this page signs in with a PIN, keeps a live WebSocket, renders the pages
// for the signed-in role, and sends actions. Rule helpers come from rules.js (same file the server runs).
import * as R from './rules.js';
const {ROOMS,FRAG,SUITS,RATE,PER_TEAM,MIN_STAY,COIN_GOAL,team,room,alive,inMarket,fmt,protectedLeft,esc,matches,targetLabel,
  defMode,isFirst,indiv,lab,cands,whyNotEnter,gapOf,teamStatus,teamOf,no}=R;

let S=null, ME=null, CLOCK=null, OFFSET=0;
// Developer mode: DEVME is the real (read-only) sign-in, FULL the full state; ME/S are swapped to the chosen viewpoint.
let DEVME=null, FULL=null;
function setMe(me){ME=me;DEVME=me&&me.role==='dev'?me:null;if(!DEVME)FULL=null;}
function devMe(){const v=ui.as||'ctrl';return v.startsWith('player:')?{role:'player',pid:v.slice(7),label:'玩家'}:{role:v,pid:null,label:ROLE_NAME[v]};}
// Phone vibration (Android; iPhone browsers ignore it) plus a visual shake.
const buzz=p=>{try{if(navigator.vibrate)navigator.vibrate(p);}catch{/* not supported */}};
function shakeEl(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);}
let ui={ddOpen:null,don:{},tab:null,room:'3S',pick:'',res:{},settled:null,hookTeam:'',hookTarget:'',doneSel:{},revokeAsk:null,
  coinTeam:'',coinAmt:'',buyer:'',shopCard:'',as:'ctrl',devAck:new Set(),nc:{name:'',desc:'',price:'',stock:''},
  sub:{dealer:'info',npc:'task',market:'buy',ctrl:'status',player:'team'},
  pub:{kind:'任务',mode:'first',reward:0,title:'',body:'',target:'all',team:'R',player:'',mins:10,to:'all'},
  admin:{pins:null,snaps:null,counts:{dealer:8,judge:3,mengpo:2,ctrl:2,screen:1},ask:null,resetTxt:''}};
const $=s=>document.querySelector(s);
const ROLE_TABS={ctrl:['board','dealer','npc','market','ctrl'],dealer:['dealer'],judge:['npc'],mengpo:['market'],screen:['board'],player:['player']};
const TAB_NAME={board:'大屏',player:'我的',dealer:'Dealer',ctrl:'生死簿',npc:'判官',market:'鬼市'};
const ROLE_NAME={player:'玩家',dealer:'Dealer',judge:'判官',mengpo:'孟婆',ctrl:'总控',screen:'大屏'};
const nowT=()=>!CLOCK?0:CLOCK.running?CLOCK.base+Math.floor((Date.now()+OFFSET-CLOCK.at)/1000):CLOCK.base;

// ---------- look ----------
// Team colours of the 1b design (display only; rules.js keeps its own ids and names).
const TC={R:['#d0453a','#fff'],B:['#3d77c9','#fff'],G:['#3a9a6c','#fff'],Y:['#e2b33a','#1c150b'],P:['#9466b8','#fff'],O:['#e08a3c','#1c150b']};
const TYPE={'♠':'体能','♦':'逻辑','♣':'默契','♥':'心理'};
const tv=id=>'--c:'+TC[teamOf(id)][0]+';--ci:'+TC[teamOf(id)][1];
const tsq=(id,s)=>'<span class="tsq" style="'+tv(id)+(s?';--s:'+s+'px':'')+'">'+team(id).name[0]+'</span>';
const tchip=id=>'<span class="tchip" style="'+tv(id)+'">'+team(id).name+'</span>';
const isRed=s=>s==='♥'||s==='♦';
const suitG=s=>'<span class="'+(isRed(s)?'sr':'')+'">'+s+'</span>';
const cardG=r=>r.card.slice(0,-1)+suitG(r.suit);
const p2=v=>String(v).padStart(2,'0');
const mm=x=>Math.floor(x/60)+':'+p2(x%60);
const mmss=x=>p2(Math.floor(x/60))+':'+p2(x%60);
const sub=(page,list,cls)=>'<nav class="subtabs '+(cls||'')+'" style="--n:'+list.length+'" aria-label="分页">'+list.map(([k,l],i)=>
  '<button data-a="sub" data-p="'+page+'" data-v="'+k+'" aria-selected="'+(ui.sub[page]===k)+'"><span class="n">'+p2(i+1)+'</span>'+l+'</button>').join('')+'</nav>';
const sec=(page,k,html)=>'<section class="sec'+(ui.sub[page]===k?' on':'')+'" data-sec="'+k+'">'+html+'</section>';
// A pick button (replaces every dropdown). k = ui path it sets, t = tap again to clear.
function cb(o){
  return '<button class="cb'+(o.cls?' '+o.cls:'')+(o.on?' on':'')+'" data-a="pick" data-k="'+o.k+'" data-v="'+esc(o.v)+'"'+(o.t===false?'':' data-t="1"')
    +(o.off?' disabled':'')+(o.title?' title="'+esc(o.title)+'"':'')+' aria-pressed="'+!!o.on+'">'
    +(o.c?'<span class="sw" style="--c:'+o.c+'"></span>':'')+'<span class="t">'+o.label+(o.small!=null?'<small>'+o.small+'</small>':'')+'</span>'
    +(o.mark===false?'':'<span class="mk">'+(o.on?'✓':'')+'</span>')+'</button>';
}
// Themed dropdown (no native <select>): a button that opens a list of pick buttons; ui.ddOpen holds the open one.
function dd(k,valLabel,placeholder,valColor,options){
  const open=ui.ddOpen===k,cur=getp(k);
  return '<div class="dd'+(open?' open':'')+'"><button class="dd-btn" data-a="dd" data-v="'+k+'" aria-expanded="'+open+'">'
    +(valColor?'<span class="sw" style="--c:'+valColor+'"></span>':'')+'<span class="t'+(valLabel?'':' ph')+'">'+(valLabel||placeholder)+'</span><span class="car">▾</span></button>'
    +(open?'<div class="dd-list" role="listbox">'+options.map(o=>o.group?'<div class="dd-g">'+o.group+'</div>'
      :'<button class="dd-o'+(o.v===cur?' on':'')+'" role="option" data-a="pick" data-k="'+k+'" data-v="'+esc(o.v)+'"'+(o.off?' disabled':'')+'>'
        +(o.c?'<span class="sw" style="--c:'+o.c+'"></span>':'')+'<span class="t">'+o.label+'</span>'+(o.note?'<small>'+o.note+'</small>':'')+(o.v===cur?'<span class="mk">✓</span>':'')+'</button>').join('')+'</div>':'')+'</div>';
}
const teamPick=(k,cur,off,small)=>S.teams.map(t=>cb({k,v:t.id,on:cur===t.id,off:off&&off(t.id),c:TC[t.id][0],label:t.name,small:small&&small(t.id)})).join('');
function countdown(n,short){if(!n.due)return '';const r=n.due-S.t;return r>0?(short?mmss(r):'剩余 '+mmss(r)):'已截止';}
const kindOf=n=>n.kind==='通知'?['通知','alert']:n.kind==='公告'?['公告','']:n.secret?['秘密任务','secret']:['任务','task'];
const modeOf=n=>n.kind==='任务'?(isFirst(n)?'先到先得':'各自完成'):'';

// ---------- 大屏 ----------
function broadcast(){
  const out=[];
  for(const l of S.log){
    let m,x=null,c='';
    if((m=/^(\S+) 被(.)队勾魂/.exec(l.text))){x=m[1]+' 被勾魂';c='hook';}
    else if((m=/^(\S+) 输了 (\S+) 被抽签淘汰/.exec(l.text))){x=m[1]+' 抽签淘汰';c='hook';}
    else if((m=/^(\S+) 喝下孟婆汤/.exec(l.text)))x=m[1]+' 买命回队';
    else if((m=/^(\S+) 赢下 (\S+)，拿到扑克牌，\+(\d+)/.exec(l.text)))x=m[1]+'拿下 '+m[2]+'　+'+m[3];
    else if((m=/^判官记录 (\S+) 率先完成任务「(.+)」/.exec(l.text))&&S.notices.some(n=>n.title===m[2]&&!n.secret)){x=m[1]+'率先完成任务「'+m[2]+'」';c='hot';}
    if(x)out.push({t:l.t,x,c});
    if(out.length>=5)break;
  }
  return out;
}
function roomCard(r){
  const ts=S.rooms.find(x=>x.id===r.id).teams;
  return '<div class="room'+(ts.length?' busy':'')+'"><div class="top"><div class="cd">'+cardG(r)+'</div>'
    +'<div class="rr"><span class="typ">'+TYPE[r.suit]+'</span><span class="pt">+'+r.n*100+'</span></div></div>'
    +'<div class="bt">'+(ts.length?'<span class="on"><i class="gd"></i>进行中</span><div class="vs">'+ts.map(tchip).join('<span>vs</span>')+'</div>'
      :'<span class="idle">空闲</span>')+'</div></div>';
}
function viewBoard(){
  const list=[...S.teams].sort((a,b)=>b.score-a.score),max=Math.max(1,list[0].score);
  let rk=0,prev=null;
  const bars=list.map((t,i)=>{if(t.score!==prev){rk=i+1;prev=t.score;}
    return '<div class="bcol" style="'+tv(t.id)+'"><span class="v">'+t.score+'</span>'
      +'<div class="b" style="height:calc(var(--b0,56px) + '+(t.score/max).toFixed(3)+' * var(--b1,214px))" role="img" aria-label="'+t.name+' 第 '+rk+' 名，'+t.score+' 冥币">'+rk+'</div>'
      +'<div class="nm">'+tsq(t.id)+'<span>'+t.name+'</span></div>'
      +'<div class="su">'+SUITS.map(s=>'<span class="'+(t.cards.some(c=>c.includes(s))?'got ':'')+(isRed(s)?'sr':'')+'">'+s+'</span>').join('')+'</div></div>';}).join('');
  const bc=broadcast();
  const run=CLOCK&&CLOCK.running;
  return '<div class="stage-wrap"><div class="stage">'
    +'<div class="left"><div class="hd"><div class="ttl">百鬼夜行</div><div class="en">CORNELL CSSA 万圣夜</div></div>'
    +'<div class="clock"><span class="cap">'+(run?'游戏时钟':'已暂停')+'</span><span class="ck mono'+(run?'':' paused')+'" id="sclk">'+fmt(S.t)+'</span>'
    +incense()+'</div>'
    +'<div class="cast"><span class="cap" style="padding-bottom:8px">全场播报</span>'
    +(bc.length?bc.map(b=>'<div class="bc '+b.c+'"><span class="t">'+fmt(b.t)+'</span><span class="x">'+esc(b.x)+'</span></div>').join(''):'<div class="bc"><span class="x muted">暂无播报</span></div>')+'</div></div>'
    +'<div class="right"><div class="rank"><div class="rh"><b>队伍冥币排名</b><span>四色齐可进决赛</span></div><div class="bars">'+bars+'</div></div>'
    +'<div class="rgrid">'+ROOMS.map(roomCard).join('')+'</div></div>'
    +'</div></div>';
}
// Game progress as a burning incense stick: ash on the left, a glowing ember at "now", five watches of 30 min.
function incense(){
  const p=Math.min(1,Math.max(0,S.t/9000)),cur=Math.min(4,Math.floor(S.t/1800));
  return '<div class="xiang" style="--p:'+p.toFixed(4)+'" role="img" aria-label="进度 '+Math.round(p*100)+'%"><div class="stick"><i class="ash"></i></div>'
    +'<i class="ember"><b class="smoke"></b><b class="smoke s2"></b></i>'
    +'<div class="watch">'+['一更','二更','三更','四更','五更'].map((w,i)=>'<span class="'+(i===cur?'on':i<cur?'past':'')+'">'+w+'</span>').join('')+'</div></div>';
}
function fitStage(){
  const w=$('.stage-wrap'),st=w&&w.firstChild;if(!w)return;
  const g=$('#amb ghost-ambience');
  if(innerWidth<820){st.style.removeProperty('--k');w.style.height='';w.style.width='';if(g)g.removeAttribute('data-keep');return;}
  const v=$('#view'),k=ME&&ME.role==='screen'?Math.min(innerWidth/1920,innerHeight/1080):Math.min(w.parentElement.clientWidth/1920,(v.clientHeight-24)/1080);
  st.style.setProperty('--k',k.toFixed(4));w.style.height=Math.round(1080*k)+'px';
  w.style.width=Math.round(1920*k)+'px';w.style.margin='0 auto';
  // keep the ghost fire off the text and cards: everything inside the stage's padding
  if(g){const r=w.getBoundingClientRect(),keep=[r.left+44*k,r.top+40*k,r.width-88*k,r.height-80*k].map(Math.round).join(',');
    if(g.dataset.keep!==keep)g.dataset.keep=keep;
    const top=ME&&ME.role==='screen'?'0':String(Math.round(Math.max($('#top').getBoundingClientRect().bottom,$('#tabs').hidden?0:$('#tabs').getBoundingClientRect().bottom)+6));
    if(g.dataset.top!==top)g.dataset.top=top;}
}
addEventListener('resize',fitStage);

// ---------- Dealer ----------
function viewDealer(){
  const r=room(ui.room),ts=S.rooms.find(x=>x.id===r.id).teams,cap=r.two?2:1,lottery=r.n>=5;
  const done=ui.settled&&ui.settled.rid===r.id&&!ts.length;
  const rooms='<div class="sec on" style="gap:10px"><span class="lbl">全部房间'+(ME.role==='ctrl'?'（总控视角）':'')+'</span><div class="rooms8">'+ROOMS.map(x=>{const n=S.rooms.find(y=>y.id===x.id).teams.length;
    return '<button class="rbtn'+(x.id===ui.room?' on':'')+'" data-a="room" data-v="'+x.id+'" aria-pressed="'+(x.id===ui.room)+'"><span class="n">'+cardG(x)+'</span><span class="nm">'+x.name+'</span>'
      +'<span class="st'+(n?' busy':'')+'">'+(n?'● 进行中':'空闲')+'</span></button>';}).join('')+'</div></div>';
  const hero='<div class="hero"><div class="tile"><span class="tn">'+r.card.slice(0,-1)+'</span><span class="ts '+(isRed(r.suit)?'sr':'')+'">'+r.suit+'</span></div>'
    +'<div class="info"><div class="meta"><span class="typ">'+TYPE[r.suit]+'</span>'+(r.two?'<span class="typ">两队</span>':'')+'<span class="coins">+'+r.n*100+' <small>冥币</small></span></div>'
    +'<div class="name"><b>'+r.name+'</b>'+(done?'<span class="stamp">已结算</span>':'')+'</div>'
    +'<span class="status'+(ts.length?' busy':'')+'">'+(ts.length?'<i class="gd"></i>'+ts.map(i=>team(i).name).join(' vs ')+' 进行中':done?'已结算':'空闲')+'</span></div></div>';
  let entry;
  if(ts.length<cap){
    if(ui.pick&&(ts.includes(ui.pick)||whyNotEnter(ui.pick,r.id)))ui.pick='';
    const btns=S.teams.filter(t=>!ts.includes(t.id)).map(t=>{const w=whyNotEnter(t.id,r.id);
      return cb({cls:'big',k:'pick',v:t.id,on:ui.pick===t.id,off:!!w,c:w?'var(--line2)':TC[t.id][0],label:t.name,small:w||'存活 '+alive(t.id).length});}).join('');
    entry='<div class="chips c2">'+btns+'</div><button class="btn-main" data-a="enter"'+(ui.pick?'':' disabled')+'>'+(ui.pick?'放行 '+team(ui.pick).name+' 入场':'先选择可入场的队伍')+'</button>';
  }else entry='<div class="empty">房间已满，结算后再放行</div>';
  const info='<div class="pn" style="gap:14px"><h2 class="sh">规则与入场</h2><div class="rule">'+r.rule+'</div>'
    +'<div class="lot'+(lottery?' hot':'')+'">'+(lottery?'输队抽签淘汰 1 人':'输了不淘汰')+'</div>'
    +'<div class="need"><b>放行入场</b><span class="small">至少存活 <span class="mono" style="color:var(--ink)">'+r.min+'</span> 人</span></div>'+entry+'</div>';
  const pending=ts.filter(t=>!ui.res[t]).length,ready=ts.length===cap&&!pending;
  const hint=done?'本局已结算':!ts.length?'等待入场':pending?'还差 '+pending+' 队未选':ts.length<cap?'还需第二队入场':'胜负已选好';
  const rows=ts.map(tid=>{const t=team(tid),v=ui.res[tid]||'';
    return '<div class="rt"><div class="hd">'+tsq(tid,42)+'<div><b>'+t.name+'</b><span class="small">存活 <span class="mono" style="color:var(--ink)">'+alive(tid).length+'</span> 人</span></div></div>'
      +(v?'<span class="stamp">'+(v==='win'?'胜':'负')+'</span>':'')
      +'<div class="wl" role="group" aria-label="'+t.name+'结果"><button class="w" data-a="res" data-t="'+tid+'" data-v="win" aria-pressed="'+(v==='win')+'">赢</button>'
      +'<button class="l" data-a="res" data-t="'+tid+'" data-v="lose" aria-pressed="'+(v==='lose')+'">输</button></div></div>';}).join('');
  const W=ts.filter(t=>ui.res[t]==='win').map(t=>team(t).name),L=ts.filter(t=>ui.res[t]==='lose').map(t=>team(t).name);
  const summary=done?esc(ui.settled.msg):!ts.length?'':!ready?(ts.length<cap?'两队到齐才能结算':'为每队选赢或输')
    :(W.length?W.join('、')+'赢：+'+r.n*100+' 冥币和 '+r.card:'无人获胜')+(L.length?'；'+L.join('、')+'输'+(lottery?'，抽签淘汰 1 人':''):'');
  const settle='<div class="pn" style="gap:14px"><div class="shrow"><h2 class="sh">房间内队伍</h2><span class="hint" style="font-weight:700;color:'+(ready?'var(--accent)':pending?'var(--warn)':'var(--sub)')+'">'+hint+'</span></div>'
    +(rows?'<div class="rteams">'+rows+'</div>':'<div class="empty">暂无队伍</div>')
    +'<span class="sum'+(ready||done?' ready':'')+'">'+summary+'</span>'
    +'<button class="btn-main'+(ready?' glow':'')+'" data-a="finish"'+(ready?'':' disabled')+' style="min-height:60px;font-size:19px;letter-spacing:.14em">'+(done?'已结算':'结束并结算')+'</button>'
    +'<span class="small center">结算后立即发放，请先核对</span></div>';
  return '<div class="page tabbed">'+rooms+hero+'<div class="cols-dealer">'+sec('dealer','info',info)+sec('dealer','settle',settle)+'</div>'
    +sub('dealer',[['info','规则与入场'],['settle','胜负结算']])+'</div>';
}

// ---------- 判官 ----------
function hookLog(){
  const out=[];
  for(const l of S.log){const m=/^(\S+) 被(.)队勾魂/.exec(l.text);if(m)out.push({t:l.t,pid:m[1],by:(S.teams.find(t=>t.name===m[2]+'队')||{}).id});}
  return out;
}
function viewNpc(){
  const tasks=S.notices.filter(n=>n.kind==='任务').slice(0,6);
  const cards=tasks.map(n=>{
    const [kl,kc]=kindOf(n),w=Object.keys(n.done)[0],closed=isFirst(n)&&!!w,ind=indiv(n),cur=ui.doneSel[n.id]||'';
    const rest=cands(n).filter(c=>!n.done[c]);
    if(cur&&!rest.includes(cur))delete ui.doneSel[n.id];
    const live=n.due&&n.due>S.t;
    let body;
    if(closed)body='<div class="lot">'+lab(w)+' 已率先完成</div>';
    else if(!rest.length)body='<div class="lot">所有'+(ind?'队员':'队伍')+'都已完成</div>';
    else body='<span class="lbl">完成'+(ind?'队员':'队伍')+'</span><div class="chips '+(ind?'ids':'')+'">'
      +rest.map(c=>cb({cls:ind?'id':'',k:'doneSel.'+n.id,v:c,on:ui.doneSel[n.id]===c,c:ind?null:TC[c][0],label:lab(c),mark:!ind})).join('')+'</div>'
      +'<button class="btn-main" data-a="done" data-n="'+n.id+'"'+(ui.doneSel[n.id]?'':' disabled')+' style="min-height:52px">'+(ui.doneSel[n.id]?'确认 '+lab(ui.doneSel[n.id])+' 完成':'先选择完成者')+'</button>';
    return '<div class="pn"><div class="thead"><span class="kb '+kc+'">'+kl+'</span><span class="small">'+modeOf(n)+'</span>'+(n.target!=='all'?'<span class="typ">'+esc(targetLabel(n))+'</span>':'')
      +'<span class="tm'+(live?' live':'')+'">'+(live?'<i class="gd r"></i>':'')+(n.due?countdown(n):'不限时')+'</span></div>'
      +'<div class="ttitle"><b>'+esc(n.title)+'</b>'+(n.reward?'<span class="rw">+'+n.reward+'</span>':'')+'</div>'+body+'</div>';}).join('');
  const recs=S.notices.filter(n=>n.kind==='任务').flatMap(n=>Object.entries(n.done).map(([cid,d])=>({n,cid,d}))).sort((a,b)=>b.d.t-a.d.t);
  const records='<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">已完成记录</h3>'+(recs.length?recs.map(({n,cid,d})=>
    '<div class="li"><div class="grow"><span class="t">'+fmt(d.t)+(n.due&&d.t>n.due?' 超时':'')+'</span><span class="x">'+lab(cid)+' 完成「'+esc(n.title)+'」'+(d.pts?' <span class="mono">+'+d.pts+'</span>':'')+'</span></div>'
    +'<button class="btn-line" data-a="undone" data-n="'+n.id+'" data-t="'+cid+'">撤销</button></div>').join(''):'<div class="li small">暂无记录</div>')+'</div>';
  const task=(cards||'<div class="pn"><span class="muted">还没有发布任务。总控在生死簿「发布」里发布。</span></div>')+records;
  // 勾魂令: two dropdowns (who holds the token, who is named) and one button
  if(ui.hookTarget){const p=S.players.find(x=>x.id===ui.hookTarget);
    if(!p||p.team===ui.hookTeam||p.st!=='alive'||protectedLeft(p)>0)ui.hookTarget='';}
  const tgt=ui.hookTarget&&S.players.find(x=>x.id===ui.hookTarget);
  const opts=S.teams.filter(t=>t.id!==ui.hookTeam).flatMap(t=>{
    return [{group:t.name},...S.players.filter(p=>p.team===t.id).map(p=>{const l=protectedLeft(p),gone=p.st!=='alive';
      return {v:p.id,label:p.id,c:TC[t.id][0],off:gone||l>0,note:gone?'鬼市':l>0?'保护 '+Math.ceil(l/60)+' 分':''};})];});
  const ready=ui.hookTeam&&tgt;
  const counts={};const hl=hookLog();hl.forEach(h=>{if(h.by)counts[h.by]=(counts[h.by]||0)+1;});
  const hook='<div class="pn hook"><div class="two">'
    +'<div class="fld"><span>取得勾魂令的队伍</span>'+dd('hookTeam',ui.hookTeam&&team(ui.hookTeam).name,'选择队伍',ui.hookTeam&&TC[ui.hookTeam][0],S.teams.map(t=>({v:t.id,label:t.name,c:TC[t.id][0]})))+'</div>'
    +'<div class="fld"><span>被点名的队员</span>'+dd('hookTarget',tgt&&tgt.id,'选择别队队员',tgt&&TC[tgt.team][0],opts)+'</div></div>'
    +'<button class="btn-main red" data-a="hook"'+(ready?'':' disabled')+' style="min-height:56px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:18px">'
    +'<span style="width:34px;height:34px;border:2px solid currentColor;border-radius:6px;display:grid;place-items:center;font-family:var(--brush);font-size:24px;line-height:1;transform:rotate(-8deg);font-weight:400">勾</span>'
    +(ready?team(ui.hookTeam).name+' 勾魂 '+tgt.id:'先选队伍和队员')+'</button></div>'
    +'<div class="pn"><div class="shrow"><h3>已勾魂次数</h3><span class="small">本局共 <span class="mono" style="font-weight:800;font-size:22px;color:var(--ink)">'+S.gate+'</span> 次</span></div>'
    +'<div class="hgrid">'+S.teams.map(t=>'<div class="hc">'+tsq(t.id,26)+'<span>'+t.name+'</span><b>'+(counts[t.id]||0)+'</b></div>').join('')+'</div>'
    +hl.slice(0,3).map(h=>'<div class="hrow"><span class="minis">勾</span><span class="t">'+fmt(h.t)+'</span><span>'+(h.by?team(h.by).name+' 勾魂 ':'勾魂 ')+h.pid+'</span></div>').join('')+'</div>';
  return '<div class="page tabbed"><div class="cols2">'+sec('npc','task','<h2 class="sh">任务判定</h2>'+task)+sec('npc','hook','<h2 class="sh">勾魂令</h2>'+hook)+'</div>'
    +sub('npc',[['task','任务判定'],['hook','勾魂令']])+'</div>';
}

// ---------- 鬼市 ----------
function viewMarket(){
  const mk=S.players.filter(p=>p.st==='market').sort((a,b)=>a.outAt-b.outAt);
  const people=mk.map(p=>{const stay=S.t-p.outAt,tOk=stay>=MIN_STAY,tot=p.coins+p.bail,ok=tOk&&tot>=COIN_GOAL;
    return '<div class="pn pc'+(ok?' ok':'')+'"><div class="idrow"><span class="id">'+p.id+'</span>'+tchip(p.team)+'</div>'
      +'<div class="stay">已待 <span class="mono">'+mm(stay)+'</span><span class="pill '+(tOk?'free':'warn')+'">'+(ok?'<i class="gd"></i>':'')+(tOk?'时间已满':'还差 '+mm(MIN_STAY-stay))+'</span></div>'
      +'<div class="two"><label class="fld"><span>本人冥币</span><span class="coin-in"><input class="in mono" id="c-'+p.id+'" data-m="coin" data-p="'+p.id+'" value="'+p.coins+'" inputmode="numeric" aria-label="'+p.id+' 本人冥币"></span></label>'
      +'<div class="fld"><span>队友助力</span><div class="helpbox">+'+p.bail+'</div></div></div>'
      +'<div class="fld"><div class="tot"><span>合计</span><span class="mono'+(tot>=COIN_GOAL?' ok':'')+'" id="tot-'+p.id+'">'+tot+' / '+COIN_GOAL+'</span></div>'
      +'<div class="bar"><span class="'+(tot>=COIN_GOAL?'ok':'')+'" id="bar-'+p.id+'" style="width:'+Math.min(100,tot/COIN_GOAL*100)+'%"></span></div></div>'
      +'<button class="btn-main ghost'+(ok?' glow':'')+'" data-a="revive" data-p="'+p.id+'"'+(ok?'':' disabled')+' style="min-height:52px">'+(ok?'买命回队':!tOk?'时间未满':'还差 '+(COIN_GOAL-tot)+' 冥币')+'</button></div>';}).join('');
  const buy='<div class="shrow"><h2 class="sh">孟婆买命</h2><span class="hint">满 '+MIN_STAY/60+' 分钟且凑够 '+COIN_GOAL+' 可回队</span></div>'
    +(people?'<div class="people">'+people+'</div>':'<div class="empty">鬼市现在没有人。</div>');
  if(ui.buyer&&!mk.some(p=>p.id===ui.buyer))ui.buyer='';
  const by=ui.buyer&&S.players.find(p=>p.id===ui.buyer);
  if(ui.shopCard&&!S.shop.some(c=>c.id===ui.shopCard))ui.shopCard='';
  const card=ui.shopCard&&S.shop.find(c=>c.id===ui.shopCard),poor=by&&card&&by.coins<card.price,can=card&&card.stock>0&&by&&!poor;
  const shop='<h2 class="sh">技能卡商铺</h2><div class="pn" style="gap:12px"><div class="fgrid two">'
    +'<div class="fld"><span>买家（鬼市中的人）</span>'+dd('buyer',by&&by.id,mk.length?'选择买家':'鬼市现在没有人',by&&TC[by.team][0],mk.map(p=>({v:p.id,label:p.id,c:TC[p.team][0],note:p.coins+' 冥币'})))+'</div>'
    +'<div class="fld"><span>技能卡</span>'+dd('shopCard',card&&esc(card.name),'选择技能卡',null,S.shop.map(c=>({v:c.id,label:esc(c.name),off:!c.stock,note:c.stock?c.price+' 冥币 · 库存 '+c.stock:'已售罄'})))+'</div></div>'
    +(card?'<span class="small"><span class="mono" style="color:var(--ink)">'+card.price+'</span> 冥币　库存 <span class="mono" style="color:'+(card.stock?'var(--ink)':'var(--red)')+'">'+card.stock+'</span>'+(card.desc?'　'+esc(card.desc):'')+'</span>':'')
    +'<button class="btn-main'+(can?' glow':'')+'" data-a="buy" data-k="'+(card?card.id:'')+'"'+(can?'':' disabled')+' style="min-height:52px">'
    +(!by?'先选买家':!card?'先选技能卡':!card.stock?'已售罄':poor?by.id+' 冥币不足':'卖给 '+by.id)+'</button></div>'
    +'<div class="pn dash" style="gap:10px"><h3 style="font-size:16px">上架新技能卡</h3>'
    +'<div class="ncform"><input class="in" id="ncn" data-m="nc.name" value="'+esc(ui.nc.name)+'" placeholder="卡名" aria-label="卡名">'
    +'<input class="in mono" id="ncp" data-m="nc.price" value="'+esc(ui.nc.price)+'" placeholder="价格" inputmode="numeric" aria-label="价格（冥币）" style="font-size:16px">'
    +'<input class="in mono" id="ncs" data-m="nc.stock" value="'+esc(ui.nc.stock)+'" placeholder="库存" inputmode="numeric" aria-label="库存" style="font-size:16px"></div>'
    +'<input class="in" id="ncd" data-m="nc.desc" value="'+esc(ui.nc.desc)+'" placeholder="效果说明（可不填）" aria-label="效果说明">'
    +'<button class="btn-line acc" data-a="addcard" style="min-height:48px">上架</button></div>';
  const inv=S.teams.filter(t=>t.skills.length).map(t=>'<div class="pn" style="gap:8px"><div class="hold-hd">'+tsq(t.id,30)+'<b>'+t.name+'</b><span class="small">'+t.skills.length+' 张可用</span></div>'
    +t.skills.map(k=>'<div class="li" style="padding:8px 0;min-height:52px"><div class="grow"><span style="font-size:16px;font-weight:700">'+esc(k.name)+'</span><span class="small">'+esc(k.by)+' 买于 '+fmt(k.t)+'</span></div>'
      +'<button class="btn-line acc" data-a="usecard" data-t="'+t.id+'" data-k="'+k.sid+'">标记已使用</button></div>').join('')+'</div>').join('');
  const hold='<h2 class="sh">各队持有的技能卡</h2>'+(inv||'<div class="pn"><span class="muted">还没有队伍买过技能卡。</span></div>');
  return '<div class="page tabbed toptabs">'+sub('market',[['buy','孟婆买命'],['shop','技能卡商铺'],['hold','各队持卡']],'top')
    +sec('market','buy',buy)+sec('market','shop',shop)+sec('market','hold',hold)+'</div>';
}

// ---------- 生死簿 ----------
function teamRows(){
  const list=[...S.teams].sort((a,b)=>b.score-a.score);
  const parts=list.map(t=>{const st=teamStatus(t),a=alive(t.id).length;
    const dots=S.players.filter(p=>p.team===t.id).map(p=>'<span class="dt'+(p.st==='alive'?'':' out')+'" title="'+p.id+(p.st==='alive'?'':'（鬼市）')+'"></span>').join('');
    const sq=SUITS.map(s=>'<span class="sq'+(t.cards.some(c=>c.includes(s))?' got':'')+'" title="'+FRAG[s]+'"><span class="'+(isRed(s)?'sr':'')+'">'+s+'</span></span>').join('');
    const sk=t.skills.length?t.skills.map(k=>'<span class="sk">'+esc(k.name)+'</span>').join(''):'<span class="small">无</span>';
    const fin='<span class="pill '+(st.k==='free'?'free':st.k==='bad'?'bad':'')+'">'+(st.k==='free'?'可进决赛':st.txt)+'</span>';
    return {t,a,dots,sq,sk,fin};});
  const tbl='<div class="tbl"><div class="tr th"><span>队伍</span><span>存活</span><span>冥币</span><span>四色碎片</span><span>技能卡</span><span>决赛</span></div>'
    +parts.map(({t,a,dots,sq,sk,fin})=>'<div class="tr" style="'+tv(t.id)+'"><span class="tn">'+tsq(t.id)+t.name+'</span><span class="dots">'+dots+'<span class="mono" style="font-weight:700;font-size:14px;margin-left:6px">'+a+'/'+PER_TEAM+'</span></span>'
      +'<span class="cn">'+t.score+'</span><span class="sqs">'+sq+'</span><span class="tags">'+sk+'</span><span>'+fin+'</span></div>').join('')+'</div>';
  const cards='<div class="tcards">'+parts.map(({t,a,dots,sq,sk,fin})=>'<div class="tcard" style="'+tv(t.id)+'"><div class="r">'+tsq(t.id,32)+'<b style="font-size:18px">'+t.name+'</b><span class="cn">'+t.score+'</span></div>'
    +'<div class="r dots">'+dots+'<span class="small" style="margin-left:4px">存活 <span class="mono" style="color:var(--ink)">'+a+'/'+PER_TEAM+'</span></span></div>'
    +'<div class="r"><span class="sqs">'+sq+'</span><span style="margin-left:auto">'+fin+'</span></div><div class="tags">'+sk+'</div></div>').join('')+'</div>';
  return tbl+cards;
}
function coinAmt(){const v=parseInt(String(ui.coinAmt).replace(/[^\d-]/g,''),10);return Number.isFinite(v)?v:0;}
function coinBtn(){const t=ui.coinTeam&&team(ui.coinTeam),a=coinAmt();
  return t&&a?'确认 '+t.name+' '+(a>0?'+':'')+a+' → '+Math.max(0,t.score+a):'确认修改';}
function editTeam(){
  const ct=ui.coinTeam&&team(ui.coinTeam);
  return '<div class="pn" style="gap:12px"><h3>修改队伍</h3>'
    +'<div class="coinrow"><div class="fld"><span>队伍</span>'+dd('coinTeam',ct&&ct.name,'选择队伍',ct&&TC[ct.id][0],S.teams.map(t=>({v:t.id,label:t.name,c:TC[t.id][0],note:t.score+' 冥币'})))+'</div>'
    +'<div class="fld"><span>冥币增减（↑ ↓ 每次 100）</span><div class="step">'
    +'<button data-a="coinstep" data-v="-100" aria-label="减 100">−</button>'
    +'<input class="in mono" type="number" step="100" id="cv" data-m="coinAmt" value="'+esc(ui.coinAmt)+'" placeholder="0" aria-label="冥币增减">'
    +'<button data-a="coinstep" data-v="100" aria-label="加 100">+</button></div></div>'
    +'<button class="btn-main" id="coinbtn" data-a="setscore" style="min-height:48px;font-size:16px">'+coinBtn()+'</button></div>'
    +'<div class="fld"><span>线索（扑克牌，点一下加上 / 去掉）</span><div class="clues">'+ROOMS.map(r=>{const has=!!(ct&&ct.cards.includes(r.card));
      return '<button class="clue'+(has?' on':'')+'" data-a="clue" data-v="'+r.card+'"'+(ct?'':' disabled')+' aria-pressed="'+has+'">'+cardG(r)+'</button>';}).join('')+'</div></div></div>';
}
function logTag(l){const x=l.text;
  return /勾魂|抽签淘汰|被淘汰/.test(x)?['勾魂','var(--red)']:/孟婆汤|鬼市|助力/.test(x)&&!/技能卡/.test(x)?['鬼市','var(--accent)']:/技能卡/.test(x)?['技能卡','#6b4f9a']
    :/发布|撤销发布/.test(x)?['发布','var(--ink2)']:/任务/.test(x)?['任务','var(--accent)']:/进入|赢下|输了/.test(x)?['房间','var(--ink2)']:/冥币/.test(x)?['冥币','var(--warn)']:['系统','var(--sub)'];}
function viewCtrl(){
  const status='<h2 class="sh">各队状态</h2>'+teamRows()
    +editTeam();
  return '<div class="page tabbed toptabs ledger">'+sub('ctrl',[['status','各队状态'],['pub','发布'],['log','全场日志'],['tools','总控工具']],'top col')
    +sec('ctrl','status',status)+sec('ctrl','pub',pubPanel())
    +sec('ctrl','log','<h2 class="sh">全场日志</h2><div class="pn logl" style="gap:0">'+(S.log.length?S.log.slice(0,300).map(l=>{const [k,c]=logTag(l);
      return '<div class="le"><span class="t">'+fmt(l.t)+'</span><span class="k" style="--kc:'+c+'">'+k+'</span><span class="x">'+esc(l.text)+'</span></div>';}).join(''):'<span class="muted">还没有日志。</span>')+'</div>')
    +sec('ctrl','tools',adminPanel())+'</div>';
}
function pubPanel(){
  const f=ui.pub,task=f.kind!=='公告';f.to=f.target==='team'?'team:'+f.team:f.target;
  const to=[['all','全场'],...S.teams.map(t=>['team:'+t.id,t.name,t.id]),['alive','存活的人'],['market','鬼市里的人'],['player','某位队员']];
  const toOn=v=>v==='team:'+f.team?f.target==='team':v===f.target;
  const toName=f.target==='team'?team(f.team).name:f.target==='player'?(f.player||'某位队员'):{all:'全场',alive:'存活的',market:'鬼市里的'}[f.target];
  const form='<div class="pn" style="gap:14px">'
    +'<div class="fld"><span>类型</span><div class="seg3">'+['公告','任务','秘密任务'].map(k=>'<button class="sbtn'+(f.kind===k?' on':'')+(k==='秘密任务'?' secret':'')+'" data-a="pick" data-k="pub.kind" data-v="'+k+'" aria-pressed="'+(f.kind===k)+'">'+k+'</button>').join('')+'</div></div>'
    +'<div class="fgrid"><div class="fld"><span>发给谁</span>'+dd('pub.to',(to.find(([v])=>toOn(v))||[])[1],'选择对象',f.target==='team'?TC[f.team][0]:null,to.map(([v,l,id])=>({v,label:l,c:id?TC[id][0]:null})))+'</div>'
    +(f.target==='player'?'<div class="fld"><span>选择队员</span>'+dd('pub.player',f.player,'选择队员',f.player&&TC[teamOf(f.player)][0],S.teams.flatMap(t=>[{group:t.name},...S.players.filter(p=>p.team===t.id).map(p=>({v:p.id,label:p.id,c:TC[t.id][0],note:p.st==='alive'?'':'鬼市'}))]))+'</div>':'')+'</div>'
    +'<div class="fgrid">'+(task?'<div class="fld"><span>完成方式</span><div class="seg2">'+[['first','先到先得'],['each','各自完成']].map(([v,l])=>'<button class="sbtn'+(f.mode===v?' on':'')+'" style="min-height:48px;font-size:15px" data-a="pick" data-k="pub.mode" data-v="'+v+'" aria-pressed="'+(f.mode===v)+'">'+l+'</button>').join('')+'</div></div>':'')
    +'<label class="fld"><span>限时（分钟）</span><input class="in mono" id="pm" data-m="pub.mins" value="'+esc(f.mins)+'" inputmode="numeric"></label>'
    +(task?'<label class="fld"><span>奖励冥币</span><input class="in mono" id="prw" data-m="pub.reward" value="'+esc(f.reward)+'" inputmode="numeric"></label>':'')+'</div>'
    +'<label class="fld"><span>标题</span><input class="in" id="pti" data-m="pub.title" value="'+esc(f.title)+'" placeholder="例如：鬼门开：还原鬼片海报"></label>'
    +'<label class="fld"><span>内容</span><textarea class="in" id="pb" data-m="pub.body" rows="3" placeholder="玩家手机上看到的说明：任务要求、集合地点…">'+esc(f.body)+'</textarea></label>'
    +'<button class="btn-main" data-a="publish">发布到'+esc(toName)+'玩家手机</button></div>';
  const list=S.notices.filter(n=>n.kind!=='通知').slice(0,10).map(n=>{
    const aud=S.players.filter(p=>matches(n,p)),acked=aud.filter(p=>n.acks[p.id]).length,[kl,kc]=kindOf(n),ds=Object.keys(n.done);
    return '<div class="li"><div class="grow" style="gap:4px"><div class="thead"><span class="kb '+kc+'" style="font-size:12px;padding:0 7px">'+kl+'</span><b style="font-size:17px">'+esc(n.title)+'</b></div>'
      +'<span class="small">已读 <span class="mono" style="color:var(--ink)">'+acked+'/'+aud.length+'</span>'+(n.target!=='all'?'　'+esc(targetLabel(n)):'')+(n.due?'　'+countdown(n):'')+'</span>'
      +(ds.length?'<span class="small">完成：'+ds.map(lab).join('、')+'</span>':'')+'</div>'
      +(ui.revokeAsk===n.id?'<span class="btns"><button class="btn-line fillred" data-a="revokeok" data-n="'+n.id+'">确认撤销</button><button class="btn-line" data-a="revokeno">取消</button></span>'
        +'<span class="small" style="flex-basis:100%">玩家手机上会删除'+(Object.values(n.done).some(d=>d.pts)?'，奖励扣回':'')+'</span>'
        :'<button class="btn-line" data-a="revoke" data-n="'+n.id+'">撤销发布</button>')+'</div>';}).join('');
  return '<h2 class="sh">发布公告 / 任务</h2><div class="pubcols">'+form+'<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">已发布</h3>'+(list||'<div class="li small">还没有发布过。</div>')+'</div></div>';
}
function adminPanel(){
  const A=ui.admin,c=A.counts,run=CLOCK&&CLOCK.running;
  const num=(k,l)=>'<label class="fld"><span>'+l+'</span><input class="in mono" type="number" id="adm-'+k+'" min="0" max="30" data-m="adm.'+k+'" value="'+c[k]+'"></label>';
  const pins=A.pins?'<div class="pins"><div class="pr h"><span>身份</span><span>编号 / 名称</span><span>PIN</span><span></span></div>'
    +A.pins.map(p=>'<div class="pr"><span>'+esc(p.roleName)+'</span><span class="mono" style="font-weight:700">'+esc(p.pid||p.label)+'</span><span class="pin">'+p.pin+'</span><span>'
      +(A.ask==='pin:'+p.pin?'<span class="btns" style="gap:4px"><button class="btn-line fillred" data-a="adm-resetpin" data-v="'+p.pin+'">确认</button><button class="btn-line" data-a="adm-cancel">取消</button></span>'
        :'<span class="btns" style="gap:4px"><button class="btn-line" data-a="copypin" data-v="'+p.pin+'">复制</button><button class="btn-line" data-a="adm-ask" data-v="pin:'+p.pin+'">重置</button></span>')+'</span></div>').join('')+'</div>'
    +'<div class="btns"><button class="btn-line" data-a="adm-csv">下载 PIN 表（CSV）</button><button class="btn-line" data-a="adm-hide">收起</button><span class="small">共 '+A.pins.length+' 个</span></div>':'';
  const snaps=A.snaps?(A.snaps.length?'<div class="list">'+A.snaps.map(s=>'<div class="li"><div class="grow"><span class="x" style="font-size:15px">'+new Date(s.at).toLocaleTimeString()+'</span><span class="small">游戏 '+fmt(s.t||0)+'　'+esc(s.tag||'')+'</span></div>'
      +(A.ask==='snap:'+s.key?'<span class="btns"><button class="btn-line fillred" data-a="adm-restore" data-v="'+s.key+'">确认恢复</button><button class="btn-line" data-a="adm-cancel">取消</button></span>'
        :'<button class="btn-line" data-a="adm-ask" data-v="snap:'+s.key+'">恢复到这里</button>')+'</div>').join('')+'</div>':'<span class="small">还没有备份。每 10 次操作自动备份一次。</span>'):'';
  const left='<div class="stack"><div class="pn"><span class="lbl" style="font-size:13px">游戏计时</span><div class="timer"><span class="big'+(run?'':' paused')+'" id="tclk">'+fmt(S.t)+'</span>'
    +'<button class="btn-line '+(run?'':'fill')+'" data-a="clockctl" style="min-height:52px;padding:0 24px;font-size:17px;font-weight:900">'+(run?'暂停':'开始')+'</button></div>'
    +'<span class="small" style="font-weight:700;color:'+(run?'var(--accent)':'var(--sub)')+'">'+(run?'● 计时中':'❚❚ 已暂停')+'</span></div>'
    +'<div class="pn"><div class="shrow"><h3>PIN</h3><span class="small">按数量补齐工作人员 PIN</span></div>'
    +'<div class="cnts">'+num('dealer','Dealer')+num('judge','判官')+num('mengpo','孟婆')+num('ctrl','总控')+num('screen','大屏')+'</div>'
    +'<div class="btns"><button class="btn-line acc" data-a="adm-gen">生成 PIN</button><button class="btn-line" data-a="adm-pins">查看全部 PIN</button></div>'+pins+'</div></div>';
  const rs=A.resetTxt==='重置';
  const right='<div class="stack"><div class="pn"><h3>备份与恢复</h3><span class="small">每 10 次操作自动备份一次；重置、恢复、载入演示数据前都会先备份当前数据。</span>'
    +'<div class="btns"><button class="btn-line" data-a="adm-snaps">查看备份</button>'
    +(A.ask==='reset:demo'?'<button class="btn-line fillred" data-a="adm-reset" data-v="demo">确认载入演示数据</button><button class="btn-line" data-a="adm-cancel">取消</button>'
      :'<button class="btn-line" data-a="adm-ask" data-v="reset:demo">载入演示数据</button>')+'</div>'+snaps+'</div>'
    +'<div class="danger"><h3>危险操作</h3><p>重置会清空所有冥币、扑克牌、日志和鬼市记录（PIN 不变）。请在下方输入“重置”二字后再点按钮。</p>'
    +'<input class="in" id="rst" data-m="adm.resetTxt" value="'+esc(A.resetTxt)+'" placeholder="输入“重置”" style="border-color:#d9b3aa">'
    +'<button class="btn-line '+(rs?'fillred':'')+'" id="rstbtn" data-a="adm-reset" data-v="blank"'+(rs?'':' disabled')+' style="min-height:48px;font-weight:900">重置为空白游戏</button></div></div>';
  return '<h2 class="sh">总控工具</h2><div class="cols2">'+left+right+'</div>';
}

// ---------- 玩家 ----------
function viewPlayer(){
  const me=S.players.find(p=>p.id===ME.pid),t=team(me.team),prot=protectedLeft(me),inMk=me.st==='market';
  const stay=inMk?S.t-me.outAt:0;
  const badge=inMk?['在鬼市','bad']:prot?['保护期','warn']:['存活',''];
  const subTxt=inMk?'已待 '+mm(stay):prot?'保护期还剩 '+Math.ceil(prot/60)+' 分钟':'小心勾魂';
  const pass='<div class="pass"><div class="r1"><div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="cap">冥府通行证</span><span class="id">'+me.id+'</span></div>'
    +'<span class="badge '+badge[1]+'">'+badge[0]+'</span></div><div class="r2">'+tchip(t.id)+'<span class="muted">'+subTxt+'</span></div></div>';
  // 本队
  const a=alive(t.id).length,st=teamStatus(t);
  const dots=S.players.filter(p=>p.team===t.id).map(p=>'<span class="dt'+(p.st==='alive'?'':' out')+'" style="'+tv(t.id)+'" title="'+p.id+(p.st==='alive'?'':'（鬼市）')+'"></span>').join('');
  const suits=SUITS.map(s=>{const has=t.cards.filter(c=>c.includes(s));
    return '<div class="s4'+(has.length?' got':'')+'"><span class="g '+(isRed(s)?'sr':'')+'">'+s+'</span><span class="l">'+FRAG[s]+'</span><span class="c">'+(has.length?has.join(' '):'未获得')+'</span></div>';}).join('');
  const myRooms=S.rooms.filter(x=>x.teams.includes(t.id)).map(x=>{const r=room(x.id);
    return '<div class="myroom"><div class="cd">'+cardG(r)+'</div><div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="on">● 本队进行中</span>'
      +'<div class="vs">'+x.teams.map(tchip).join('<span>vs</span>')+'</div><span class="small">赢 +'+r.n*100+' 冥币</span></div></div>';}).join('');
  const teamSec='<div class="stat2"><div class="mini"><span class="cap">队伍冥币</span><span class="cv">'+t.score+'</span></div>'
    +'<div class="mini" style="gap:10px"><span class="cap">存活 <span class="mono" style="font-weight:700;font-size:14px;color:var(--ink)">'+a+' / '+PER_TEAM+'</span></span><div class="dots">'+dots+'</div></div></div>'
    +'<div class="pn" style="padding:14px;gap:12px"><span class="cap small" style="font-size:12px">四色碎片</span><div class="suits4">'+suits+'</div>'
    +'<div class="fin'+(st.k==='free'?' ok':'')+'">'+(st.k==='free'?'可进决赛':st.txt)+'</div></div>'
    +(myRooms||'<div class="pn" style="padding:14px"><span class="muted">本队现在没有在任何房间里。</span></div>')
    +'<h2 class="sh" style="font-size:20px;margin-top:6px">本队技能卡</h2>'+(t.skills.length?'<div class="skills">'+t.skills.map(k=>'<span>'+esc(k.name)+'</span>').join('')+'</div>'
      :'<span class="muted">还没有。技能卡只有鬼市里的人能用自己的冥币买。</span>');
  // 通知与任务
  const mine=S.notices.filter(n=>matches(n,me)),unread=mine.filter(n=>!n.acks[me.id]).length;
  const notes=mine.map(n=>{const acked=!!n.acks[me.id],[kl,kc]=kindOf(n),key=indiv(n)?me.id:me.team,d=n.done[key],w=Object.keys(n.done)[0];
    let ns='',nc='',lost=false;
    if(n.kind==='任务'){if(d){ns='已完成 '+fmt(d.t);nc='var(--accent)';}else if(isFirst(n)&&w){lost=true;ns=n.secret?'任务已关闭':'已被'+lab(w)+'抢先';nc='var(--sub)';}else{ns='进行中';nc='var(--accent)';}}
    const live=n.due&&n.due>S.t&&!d&&!lost;
    return '<div class="note'+(acked?'':' new')+(lost?' lost':'')+'"><div class="nh"><span class="kb round '+kc+'" style="font-size:12px;padding:1px 10px">'+kl+'</span>'
      +(modeOf(n)?'<span class="mode">'+modeOf(n)+'</span>':'')+'<span class="mode mono">'+fmt(n.t)+'</span>'+(ns?'<span class="ns" style="color:'+nc+'">'+ns+'</span>':'')+'</div>'
      +'<div class="nt">'+esc(n.title)+'</div>'+(n.body?'<div class="nb">'+esc(n.body)+'</div>':'')
      +((n.due&&!d&&!lost)||n.reward?'<div class="nm">'+(n.due&&!d&&!lost?'<span class="red">⏱ '+countdown(n,true)+'</span>':'')+(n.reward?'<span>+'+n.reward+' 冥币</span>':'')+'</div>':'')
      +(acked?'<span class="small">已读</span>':'<button class="ack" data-a="ack" data-n="'+n.id+'">知道了</button>')+'</div>';}).join('');
  const taskSec='<h2 class="sh" style="font-size:22px">通知与任务</h2>'+(notes||'<div class="pn"><span class="muted">暂时没有通知。</span></div>');
  // 鬼市
  const mk=S.players.filter(p=>p.team===t.id&&p.st==='market').sort((x,y)=>x.outAt-y.outAt);
  const mate=(p,mine)=>{const s=S.t-p.outAt,tot=p.coins+p.bail,tOk=s>=MIN_STAY,cOk=tot>=COIN_GOAL,gap=gapOf(p);
    const line=tOk&&cOk?'可以找孟婆买命了':[tOk?'':'还需 '+mm(MIN_STAY-s),cOk?'':'差 '+(COIN_GOAL-tot)+' 冥币'].filter(Boolean).join('，');
    const def=Math.min(gap*RATE,t.score);
    return '<div class="mate"'+(mine?' style="border-color:var(--red)"':'')+'><div class="r"><span class="id">'+p.id+(mine?' <span class="small" style="font-family:var(--sans)">（你）</span>':'')+'</span>'
      +'<span class="small mono">'+tot+'/'+COIN_GOAL+'</span></div>'
      +'<div class="bar"><span class="ok" style="width:'+Math.min(100,tot/COIN_GOAL*100)+'%"></span></div>'
      +'<span class="small" style="font-weight:700;color:'+(tOk&&cOk?'var(--accent)':'var(--ink)')+'">'+line+'</span>'
      +(!mine&&me.st==='alive'&&gap>0?'<div class="give"><input class="in" id="d-'+p.id+'" data-m="don" data-p="'+p.id+'" value="'+(ui.don[p.id]!=null?ui.don[p.id]:def)+'" inputmode="numeric" placeholder="冥币数" aria-label="为 '+p.id+' 花掉的队伍冥币">'
        +'<button data-a="donate" data-p="'+p.id+'">冥币助力</button></div>':'')+'</div>';};
  const mkSec='<div class="shrow"><h2 class="sh" style="font-size:22px">鬼市中的队友</h2><span class="hint">满 '+MIN_STAY/60+' 分钟且 '+COIN_GOAL+' 冥币可买命</span></div>'
    +(mk.length?mk.map(p=>mate(p,p.id===me.id)).join(''):'<div class="pn"><span class="muted">本队现在没有人在鬼市。</span></div>')
    +'<span class="small">花本队冥币 '+RATE+':1 换助力（队伍现有 <span class="mono" style="color:var(--ink)">'+t.score+'</span>）</span>';
  const roomSec='<h2 class="sh" style="font-size:22px">全部房间</h2><div class="prooms">'+ROOMS.map(roomCard).join('')+'</div>';
  const tabs=[['team','本队'],['task','任务'+(unread?'<b class="cnt">'+unread+'</b>':'')],['market','鬼市'+(mk.length?'<b class="cnt">'+mk.length+'</b>':'')],['rooms','房间']];
  return '<div class="page tabbed toptabs">'+pass+sub('player',tabs,'top')
    +sec('player','team',teamSec)+sec('player','task',taskSec)+sec('player','market',mkSec)+sec('player','rooms',roomSec)+'</div>';
}
function modalHtml(){
  if(!ME||ME.role!=='player'||!S)return '';
  const me=S.players.find(p=>p.id===ME.pid);
  const n=S.notices.find(x=>matches(x,me)&&!x.acks[me.id]&&!(DEVME&&ui.devAck.has(x.id+':'+me.id)));if(!n)return '';
  const [kl,kc]=kindOf(n),r=n.due?n.due-S.t:0;
  return '<div class="ovl"><div class="dlg" data-n="'+n.id+'" data-k="'+(n.title==='你被淘汰了'?'out':'')+'" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="new"><i></i>新通知</div>'
    +'<div class="bd"><span class="k '+(kc==='alert'?'alert':'')+'">'+kl+'</span>'+(modeOf(n)?'<span>'+modeOf(n)+'</span>':'')+'</div>'
    +'<h3 id="dt">'+esc(n.title)+'</h3>'+(n.body?'<div class="body">'+esc(n.body)+'</div>':'')
    +'<div class="foot">'+(n.due?'<span class="cap">剩余时间</span><span class="cd'+(r>0?'':' over')+'">'+(r>0?mmss(r):'已截止')+'</span>':'')
    +(n.reward?'<span class="rw">+'+n.reward+' 冥币</span>':'')+'</div>'
    +'<button data-a="ack" data-n="'+n.id+'" data-modal="1">知道了</button></div></div>';
}

// ---------- shell ----------
// Patch the live DOM to match new markup instead of replacing it, so focus, scroll and running animations survive
// the once-a-second redraw.
function morph(el,html){const t=document.createElement('template');t.innerHTML=html;patchKids(el,t.content);}
function patchKids(a,b){const an=[...a.childNodes],bn=[...b.childNodes];
  bn.forEach((n,i)=>{const o=an[i];if(!o)a.appendChild(n);else patchNode(o,n);});
  for(let i=bn.length;i<an.length;i++)an[i].remove();}
function patchNode(o,n){
  if(o.nodeType!==n.nodeType||o.nodeName!==n.nodeName){o.replaceWith(n);return;}
  if(o.nodeType!==1){if(o.nodeValue!==n.nodeValue)o.nodeValue=n.nodeValue;return;}
  if(o.tagName==='GHOST-AMBIENCE'){ // manages its own style and canvas; only pass on its settings
    for(const {name,value} of [...n.attributes])if(o.getAttribute(name)!==value)o.setAttribute(name,value);return;}
  for(const {name,value} of [...n.attributes])if(o.getAttribute(name)!==value)o.setAttribute(name,value);
  for(const {name} of [...o.attributes])if(!n.hasAttribute(name))o.removeAttribute(name);
  if(o.tagName==='INPUT'||o.tagName==='TEXTAREA'){
    const v=o.tagName==='TEXTAREA'?n.textContent:(n.getAttribute('value')??'');
    if(o!==document.activeElement&&o.value!==v)o.value=v;
    if(o.tagName==='TEXTAREA')return;
  }
  if(o.tagName==='BUTTON')o.disabled=n.hasAttribute('disabled');
  patchKids(o,n);
}

let dirty=false,ambMode=null,lastModal=null;
const isTyping=()=>{const a=document.activeElement;return !!a&&/^(INPUT|TEXTAREA)$/.test(a.tagName)&&!!a.closest('#view');};
function requestRender(){if(isTyping()){dirty=true;tickClocks();}else render();}
document.addEventListener('focusout',()=>setTimeout(()=>{if(dirty&&!isTyping()){dirty=false;render();}},0));
function tickClocks(){const t=fmt(nowT());$('#clk').textContent=t;for(const id of ['sclk','tclk']){const e=document.getElementById(id);if(e)e.textContent=t;}}
function setAmb(mode,tone){
  if(ambMode!==mode){ambMode=mode;
    $('#amb').innerHTML=mode?'<ghost-ambience data-mode="'+mode+'"'+(mode==='login'?' data-len="0" data-err="0" data-ok="0"':'')+'></ghost-ambience>':'';}
  const g=$('#amb ghost-ambience');if(g&&tone&&g.dataset.tone!==tone)g.dataset.tone=tone;}
const THEME_KEY=r=>'borderland.theme.'+r;
function themeFor(){const r=ME&&ME.role==='player'?'player':'screen';let v=null;try{v=localStorage.getItem(THEME_KEY(r));}catch{/* private mode */}
  return v||(r==='screen'?'dark':'light');}
const themed=()=>ui.tab==='board'||ui.tab==='player';

function render(){
  if(DEVME&&!entering){ME=devMe();if(FULL)S=ME.role==='player'?R.viewFor(FULL,ME):FULL;}
  const da=$('#devas');da.hidden=!DEVME||entering;
  if(DEVME&&!entering){const src=FULL||S,h='<optgroup label="工作人员">'+['ctrl','dealer','judge','mengpo','screen'].map(r=>'<option value="'+r+'">'+ROLE_NAME[r]+'</option>').join('')+'</optgroup>'
      +(src?src.teams.map(t=>'<optgroup label="'+t.name+'">'+src.players.filter(p=>p.team===t.id).map(p=>'<option value="player:'+p.id+'">'+p.id+'</option>').join('')+'</optgroup>').join(''):'');
    if(da.dataset.h!==h){da.innerHTML=h;da.dataset.h=h;}if(da.value!==ui.as)da.value=ui.as;}
  const login=!ME||entering;
  document.body.classList.toggle('login',login);
  document.body.classList.toggle('screen',!login&&ME.role==='screen');
  document.body.dataset.role=login?'':ME.role;
  if(login){document.documentElement.dataset.theme='dark';setAmb('login');renderLogin();return;}
  const tabs=ROLE_TABS[ME.role]||[];
  if(!tabs.includes(ui.tab))ui.tab=tabs[0];
  document.documentElement.dataset.theme=themed()?themeFor():'light';
  document.body.classList.toggle('board',ui.tab==='board');
  setAmb(ui.tab==='board'?'screen':['dealer','npc','market','ctrl'].includes(ui.tab)?'page':null,themeFor());
  const nav=$('#tabs');nav.hidden=tabs.length<2;
  morph(nav,tabs.map(v=>'<button role="tab" data-a="tab" data-v="'+v+'" aria-selected="'+(v===ui.tab)+'">'+TAB_NAME[v]+'</button>').join(''));
  $('#logo').innerHTML=ui.tab==='ctrl'?'<span class="scroll"></span>生死簿':'百鬼夜行';
  $('#who').textContent=(DEVME?'开发者 · ':'')+(ME.role==='player'?(DEVME?ME.pid:'玩家'):ME.role==='ctrl'?'总控':ME.label||ROLE_NAME[ME.role]);
  $('#logout').hidden=false;$('#conn').hidden=false;
  const run=CLOCK&&CLOCK.running;
  const cc=$('#clockctl');cc.hidden=ME.role!=='ctrl';cc.textContent=run?'暂停计时':'开始计时';
  const th=$('#theme');th.hidden=!themed();th.textContent=themeFor()==='dark'?'浅色':'深色';
  $('.clk').classList.toggle('paused',!run);$('#clkdot').className='gd'+(run?'':' off');
  if(!S){$('#view').innerHTML='<section class="pn muted">正在连接服务器…</section>';return;}
  R.use(S);S.t=nowT();$('#clk').textContent=fmt(S.t);
  morph($('#view'),ui.tab==='board'?viewBoard():ui.tab==='dealer'?viewDealer():ui.tab==='ctrl'?viewCtrl():ui.tab==='npc'?viewNpc():ui.tab==='market'?viewMarket():viewPlayer());
  fitStage();
  const had=!!$('#modal .dlg');morph($('#modal'),modalHtml());
  const mb=$('#modal button');if(mb&&!had)mb.focus();
  const dlg=$('#modal .dlg'),mk=dlg?dlg.dataset.n:null;
  if(mk&&mk!==lastModal){buzz(dlg.dataset.k==='out'?[150,70,150,70,260]:[90,60,90]);shakeEl(dlg,'jolt');}
  lastModal=mk;
}

// ---------- login ----------
let entering=false,errKey=0;
function renderLogin(){
  $('#tabs').hidden=true;$('#modal').innerHTML='';
  if($('#loginf'))return;
  $('#view').innerHTML='<div class="lg" id="lgcard"><div class="t">百鬼夜行</div><div class="s">Cornell CSSA 万圣夜</div><div class="dv"><i></i><b></b><i></i></div>'
    +'<form id="loginf" style="display:flex;flex-direction:column;gap:inherit"><label class="k" for="pin">输入 6 位 PIN</label>'
    +'<div class="boxes" id="boxes">'+'<div class="bx"></div>'.repeat(6)+'<input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="PIN"></div>'
    +'<button class="go">进入</button></form><div class="h" id="lgmsg" role="status">PIN 在你的名牌卡或邮件里</div></div>';
  syncBoxes();$('#pin').focus();
}
function syncBoxes(err){
  const v=$('#pin')?$('#pin').value:'',bx=document.querySelectorAll('#boxes .bx');
  bx.forEach((b,i)=>{b.textContent=v[i]||'';b.classList.toggle('act',!err&&i===Math.min(v.length,5)&&v.length<6);});
  $('#boxes').classList.toggle('bad',!!err);
  const g=$('#amb ghost-ambience');if(g)g.setAttribute('data-len',String(v.length));
}
// The message takes the place of the hint line, so the card never changes size.
function loginMsg(msg){const e=$('#lgmsg');if(!e)return;e.classList.toggle('err',!!msg);e.textContent=msg||'PIN 在你的名牌卡或邮件里';}
function loginError(msg){
  if(!$('#lgmsg'))return;
  loginMsg(msg==='PIN 不正确'?'PIN 不正确，请核对名牌卡或邮件':msg);
  syncBoxes(true);const g=$('#amb ghost-ambience');if(g)g.setAttribute('data-err',String(++errKey));
  buzz([70,50,70]);shakeEl($('#lgcard'),'eshake');
}
const SEAL_PATH='M18 4 H132 Q146 4 146 18 V132 Q146 146 132 146 H18 Q4 146 4 132 V18 Q4 4 18 4 Z M23 13 Q15 13 15 22 V127 Q15 136 23 136 H130 Q138 136 138 128 V21 Q138 12 130 12 Z';
const SEAL_STROKES=['M32 42 Q46 52 38 68','M30 90 Q48 98 38 118','M62 44 Q66 32 84 30 Q96 29 102 22','M62 44 V124','M90 40 V118','M66 56 H120','M66 76 H116','M66 96 H116','M62 122 H122'];
function sealSvg(id){const ink='#bd3a2c';
  return '<svg viewBox="0 0 150 150" aria-hidden="true"><defs><filter id="'+id+'" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="w"/>'
    +'<feDisplacementMap in="SourceGraphic" in2="w" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></defs><g filter="url(#'+id+')"><path fill="'+ink+'" fill-rule="evenodd" d="'+SEAL_PATH+'"/>'
    +'<rect x="94" y="1" width="16" height="13" fill="#0c1214"/><rect x="1" y="101" width="15" height="12" fill="#0c1214"/>'
    +'<g fill="none" stroke="'+ink+'" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">'+SEAL_STROKES.map(d=>'<path d="'+d+'"/>').join('')+'</g></g></svg>';}
function showSeal(){
  const c=$('#lgcard');if(!c)return;
  const chars=[...'验明正身·准入阴司'].map((ch,i)=>'<span style="animation-delay:'+(1.3+i*.12).toFixed(2)+'s">'+ch+'</span>').join('');
  c.insertAdjacentHTML('beforeend','<div class="okv"><div class="seal"><div class="rp"></div><div class="rp b"></div><div class="sl"><div class="bl">'+sealSvg('sealB')+'</div>'+sealSvg('sealA')
    +'<svg viewBox="0 0 150 150" style="pointer-events:none"><path class="drip" d="M48 145 q1.5 5 .5 9 q-1 5 .8 10" fill="none" stroke="#bd3a2c" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>'
    +'<path class="drip b" d="M108 145 q-1 4 0 7 q1 3 -.4 6" fill="none" stroke="#bd3a2c" stroke-width="1.2" stroke-linecap="round" opacity=".7"/></svg></div></div>'
    +'<div class="sealtx">'+chars+'</div></div>');
  c.classList.add('shake');setTimeout(()=>buzz(110),600); // the seal lands at 0.6 s
  const g=$('#amb ghost-ambience');if(g)g.setAttribute('data-ok','1');
}

let sayT=null;
function say(r){const n=$('#notice');clearTimeout(sayT);if(!r||!r.msg){n.className='notice';n.innerHTML='';return;}
  n.className='notice '+(r.ok?'ok':'bad');n.innerHTML='<b>'+(r.ok?'已记录':'不能这样操作')+'</b><span></span>';n.querySelector('span').textContent=r.msg;
  sayT=setTimeout(()=>say(null),r.ok?6000:10000);}

// ---------- session ----------
const KEY='borderland.session';
const store={get(){try{return JSON.parse(localStorage.getItem(KEY))||null;}catch{return null;}},
  set(v){try{v?localStorage.setItem(KEY,JSON.stringify(v)):localStorage.removeItem(KEY);}catch{/* private mode: stay signed in for this tab only */}}};
let SESSION=store.get();

async function login(pin){
  if(!/^\d{6}$/.test(pin)){loginError('请输入 6 位数字 PIN');return;}
  let res,j={};
  try{res=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});j=await res.json();}
  catch{loginError('连不上服务器，请检查网络');return;}
  if(!res.ok){loginError(j.error||'登录失败');return;}
  SESSION={token:j.token,me:j.me};store.set(SESSION);setMe(j.me);S=null;ui.tab=null;
  connect();
  if(!$('#lgcard')){render();say(null);return;}
  entering=true;showSeal();
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(()=>{entering=false;$('#view').innerHTML='';render();say(null);},reduce?400:2600);
}
function logout(msg){
  SESSION=null;store.set(null);setMe(null);S=null;CLOCK=null;entering=false;
  if(ws){const w=ws;ws=null;try{w.close();}catch{/* ignore */}}
  clearTimeout(timer);$('#view').innerHTML='';render();say(null);if(msg)loginError(msg);
}

// ---------- live connection ----------
let ws=null,connected=false,retry=0,timer=null,seq=0,lastMsg=0;const pending=new Map();
function setConn(){const c=$('#conn');c.className='pill '+(connected?'free':'bad');c.textContent=connected?'已连接':'重连中…';}
function connect(){
  if(!SESSION)return;
  if(ws){try{ws.onclose=null;ws.close();}catch{/* ignore */}}
  const sock=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/ws?token='+encodeURIComponent(SESSION.token));
  ws=sock;
  sock.onopen=()=>{connected=true;retry=0;lastMsg=Date.now();setConn();};
  sock.onmessage=e=>{lastMsg=Date.now();let m;try{m=JSON.parse(e.data);}catch{return;}
    if(m.t==='hello'){setMe(m.me);SESSION.me=m.me;store.set(SESSION);}
    if(m.t==='hello'||m.t==='state'){S=m.S;if(DEVME)FULL=m.S;CLOCK=m.clock;OFFSET=m.now-Date.now();requestRender();}
    else if(m.t==='res'){const cb=pending.get(m.id);pending.delete(m.id);if(cb)cb(m);}};
  sock.onclose=e=>{
    if(ws!==sock)return;
    ws=null;connected=false;setConn();
    for(const cb of pending.values())cb({ok:false,msg:'连接断开，这次操作可能没生效'});
    pending.clear();
    if(e.code===4001){logout('登录已失效，请重新输入 PIN');return;}
    clearTimeout(timer);timer=setTimeout(connect,Math.min(5000,500*2**retry++));
  };
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&SESSION&&!connected){clearTimeout(timer);connect();}});
// Heartbeat: the server answers every ping. If nothing has arrived for 60 s the connection is silently dead
// (common when a phone switches networks), so drop it and reconnect.
setInterval(()=>{if(!ws||!connected)return;
  if(Date.now()-lastMsg>60000){const w=ws;w.onclose({code:1006});try{w.close();}catch{/* ignore */}return;}
  try{ws.send('{"t":"ping"}');}catch{/* onclose reconnects */}},20000);

// Send one action. `after` runs only if the server accepted it.
function send(a,after,quiet){
  if(!ws||!connected){say(no('还没连上服务器，请稍等'));return;}
  const id=++seq;
  pending.set(id,m=>{if(!quiet||!m.ok)say(m);if(m.ok&&after)after(m);requestRender();});
  ws.send(JSON.stringify({t:'act',id,a}));
}

// ---------- events ----------
const getp=p=>p.split('.').reduce((o,k)=>o==null?o:o[k],ui);
function setp(p,v){const ks=p.split('.');let o=ui;for(const k of ks.slice(0,-1))o=o[k]??(o[k]={});o[ks[ks.length-1]]=v;}
document.addEventListener('submit',e=>{if(e.target.id!=='loginf')return;e.preventDefault();if(!entering)login($('#pin').value.trim());});
document.addEventListener('click',e=>{
  if(ui.ddOpen&&!e.target.closest('.dd')){ui.ddOpen=null;render();}
  const b=e.target.closest('[data-a]');if(!b||b.disabled)return;
  const a=b.dataset.a,v=b.dataset.v,A=ui.admin;
  if(a==='tab'){ui.tab=v;say(null);}
  else if(a==='sub'){ui.sub[b.dataset.p]=v;scrollTo({top:0});$('#view').scrollTop=0;}
  else if(a==='dd'){ui.ddOpen=ui.ddOpen===v?null:v;}
  else if(a==='pick'){ui.ddOpen=null;const k=b.dataset.k,next=b.dataset.t&&getp(k)===v?'':v;setp(k,next);
    if(k==='pub.target')ui.pub.mode=defMode(next);
    if(k==='pub.to'){const t=next||'all';if(t.startsWith('team:')){ui.pub.target='team';ui.pub.team=t.slice(5);}else ui.pub.target=t;ui.pub.mode=defMode(ui.pub.target);}}
  else if(a==='pubto'){if(v.startsWith('team:')){ui.pub.target='team';ui.pub.team=v.slice(5);}else ui.pub.target=v;ui.pub.mode=defMode(ui.pub.target);}
  else if(a==='coinstep'){ui.coinAmt=String(coinAmt()+(+v));}
  else if(a==='clue'){const t=ui.coinTeam&&team(ui.coinTeam);if(t)send({type:'setcards',tid:t.id,card:v,on:!t.cards.includes(v)});}
  else if(a==='copypin'){copyText(v).then(()=>say({ok:true,msg:'已复制 PIN '+v}),()=>say(no('复制失败，请手动选中 PIN')));}
  else if(a==='theme'){const r=ME&&ME.role==='player'?'player':'screen',nx=themeFor()==='dark'?'light':'dark';try{localStorage.setItem(THEME_KEY(r),nx);}catch{/* private mode */}}
  else if(a==='logout'){logout();return;}
  else if(a==='clockctl'){send({type:'admin.clock',op:CLOCK&&CLOCK.running?'pause':'start'});}
  else if(a==='room'){ui.room=v;ui.pick='';ui.res={};ui.settled=null;}
  else if(a==='res'){ui.res[b.dataset.t]=ui.res[b.dataset.t]===v?undefined:v;}
  else if(a==='enter'){send({type:'enter',tid:ui.pick,rid:ui.room},()=>{ui.pick='';ui.settled=null;ui.sub.dealer='settle';});}
  else if(a==='finish'){const rid=ui.room;send({type:'finish',rid,results:ui.res},m=>{ui.res={};ui.settled={rid,msg:m.msg};});}
  else if(a==='hook'){send({type:'hook',actor:ui.hookTeam,pid:ui.hookTarget},()=>{ui.hookTarget='';});}
  else if(a==='publish'){send({type:'publish',f:{...ui.pub,mins:+ui.pub.mins||0,reward:+ui.pub.reward||0}},()=>{ui.pub.title='';ui.pub.body='';});}
  else if(a==='ack'&&DEVME){ui.devAck.add(b.dataset.n+':'+ME.pid);}
  else if(a==='ack'){const nid=+b.dataset.n,n=S&&S.notices.find(x=>x.id===nid);
    if(n&&ME.pid&&!n.acks[ME.pid])n.acks[ME.pid]=S.t; // show the next notice right away; the server confirms
    send({type:'ack',nid},null,true);}
  else if(a==='done'){const nid=+b.dataset.n,cid=ui.doneSel[nid];if(cid)send({type:'done',nid,cid},()=>{delete ui.doneSel[nid];});}
  else if(a==='setscore'){const t=ui.coinTeam&&team(ui.coinTeam),amt=coinAmt();
    if(!t)say(no('请先选择队伍'));else if(!amt)say(no('请填增减数，如 +300'));
    else send({type:'setscore',tid:t.id,v:Math.max(0,t.score+amt)});}
  else if(a==='revoke'){ui.revokeAsk=+b.dataset.n;}
  else if(a==='revokeno'){ui.revokeAsk=null;}
  else if(a==='revokeok'){ui.revokeAsk=null;send({type:'revoke',nid:+b.dataset.n});}
  else if(a==='undone'){send({type:'undone',nid:+b.dataset.n,cid:b.dataset.t});}
  else if(a==='revive'){send({type:'revive',pid:b.dataset.p});}
  else if(a==='buy'){send({type:'buy',kid:b.dataset.k,buyer:ui.buyer});}
  else if(a==='usecard'){send({type:'usecard',tid:b.dataset.t,sid:+b.dataset.k});}
  else if(a==='addcard'){send({type:'addcard',f:ui.nc},()=>{ui.nc={name:'',desc:'',price:'',stock:''};});}
  else if(a==='donate'){const d=ui.don[b.dataset.p];send({type:'donate',pid:b.dataset.p,amt:d==null?null:d},()=>{delete ui.don[b.dataset.p];});}
  else if(a==='adm-ask'){A.ask=v;}
  else if(a==='adm-cancel'){A.ask=null;}
  else if(a==='adm-gen'){send({type:'admin.genpins',counts:A.counts},m=>{A.pins=m.data;});}
  else if(a==='adm-pins'){send({type:'admin.pins'},m=>{A.pins=m.data;},true);}
  else if(a==='adm-hide'){A.pins=null;}
  else if(a==='adm-resetpin'){A.ask=null;send({type:'admin.resetpin',pin:v},m=>{A.pins=m.data;});}
  else if(a==='adm-snaps'){send({type:'admin.snaps'},m=>{A.snaps=m.data;},true);}
  else if(a==='adm-restore'){A.ask=null;send({type:'admin.restore',key:v},()=>{A.snaps=null;});}
  else if(a==='adm-reset'){A.ask=null;if(v==='blank'&&A.resetTxt!=='重置')return;A.resetTxt='';send({type:'admin.reset',demo:v==='demo'});}
  else if(a==='adm-csv'){downloadPins();}
  render();
});
document.addEventListener('change',e=>{
  if(e.target.id==='devas'){ui.as=e.target.value;ui.tab=null;ui.ddOpen=null;say(null);render();return;}
  const m=e.target.dataset.m;if(!m)return;
  if(m==='coin'){send({type:'coin',pid:e.target.dataset.p,coins:Math.max(0,parseInt(e.target.value,10)||0)},null,true);}
});
document.addEventListener('input',e=>{
  if(e.target.id==='pin'){const el=e.target;el.value=el.value.replace(/\D/g,'').slice(0,6);if($('#lgmsg').classList.contains('err'))loginMsg('');syncBoxes();return;}
  const m=e.target.dataset.m,v=e.target.value;if(!m)return;
  if(m==='coin'){const q=S.players.find(x=>x.id===e.target.dataset.p);if(q){q.coins=Math.max(0,parseInt(v,10)||0);const tot=q.coins+q.bail,el=document.getElementById('tot-'+q.id),bar=document.getElementById('bar-'+q.id);
    if(el)el.textContent=tot+' / '+COIN_GOAL;if(bar)bar.style.width=Math.min(100,tot/COIN_GOAL*100)+'%';}}
  else if(m==='don'){ui.don[e.target.dataset.p]=parseInt(v,10)||0;}
  else if(m==='coinAmt'){ui.coinAmt=v;const btn=$('#coinbtn');if(btn)btn.textContent=coinBtn();}
  else if(m.startsWith('nc.'))ui.nc[m.slice(3)]=v;
  else if(m==='adm.resetTxt'){ui.admin.resetTxt=v;const btn=$('#rstbtn');if(btn){btn.disabled=v!=='重置';btn.classList.toggle('fillred',v==='重置');}}
  else if(m.startsWith('adm.'))ui.admin.counts[m.slice(4)]=+v;
  else if(m.startsWith('pub.'))ui.pub[m.slice(4)]=v;
});
function copyText(t){
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t);
  return new Promise((ok,bad)=>{const x=document.createElement('textarea');x.value=t;x.style.cssText='position:fixed;opacity:0';document.body.appendChild(x);x.select();
    try{document.execCommand('copy')?ok():bad();}catch(e){bad(e);}x.remove();});}
function downloadPins(){
  const rows=[['身份','编号/名称','PIN']].concat((ui.admin.pins||[]).map(p=>[p.roleName,p.pid||p.label,p.pin]));
  const csv='﻿'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='borderland-pins.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// The clock runs on the server; the page redraws on each server-time second, so every screen flips together.
(function tick(){
  if(S&&ME&&!entering)requestRender();
  const ms=CLOCK&&CLOCK.running?1000-(((Date.now()+OFFSET-CLOCK.at)%1000)+1000)%1000:1000;
  setTimeout(tick,ms+20);
})();

// ---------- start ----------
document.body.dataset.gaFrame='1';
const qp=new URLSearchParams(location.search).get('pin');
if(qp){history.replaceState(null,'',location.pathname);render();login(qp);}
else{if(SESSION){setMe(SESSION.me);connect();}render();say(null);}
