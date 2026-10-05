// 百鬼夜行 · browser app.
// The server owns the game state; this page signs in with a PIN, keeps a live WebSocket, renders the pages
// for the signed-in role, and sends actions. Rule helpers come from rules.js (same file the server runs).
import * as R from './rules.js';
const {size,ROOMS,SUITS,RATE,PER_TEAM,MIN_STAY,COIN_GOAL,FINAL_SCORE,FINAL_MSG,QUESTS,FEATURES,team,room,alive,inMarket,fmt,protectedLeft,esc,matches,targetLabel,
  isFirst,indiv,lab,cands,whyNotEnter,gapOf,teamStatus,teamOf,no}=R;

let S=null, ME=null, CLOCK=null, OFFSET=0;
// Developer mode: DEVME is the real (read-only) sign-in, FULL the full state; ME/S are swapped to the chosen viewpoint.
let DEVME=null, FULL=null;
function setMe(me){ME=me;DEVME=me&&me.role==='dev'?me:null;if(!DEVME)FULL=null;}
function devMe(){const v=ui.as||'ctrl';return v.startsWith('player:')?{role:'player',pid:v.slice(7),label:'玩家'}:{role:v,pid:null,label:ROLE_NAME[v]};}
// Phone vibration plus a visual shake. Android: navigator.vibrate. iPhone Safari has no vibrate API; toggling a hidden
// <input type="checkbox" switch> gives one haptic tick (iOS 17.4+), but iOS only allows it right after a real tap,
// so it works for the login error and not for popups pushed by the server.
const IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let hapLabel=null;
function iosTick(){
  if(!hapLabel){const w=document.createElement('div');w.setAttribute('aria-hidden','true');
    w.style.cssText='position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    w.innerHTML='<input type="checkbox" switch id="hapsw" tabindex="-1"><label for="hapsw"></label>';
    w.addEventListener('click',e=>e.stopPropagation());w.addEventListener('change',e=>e.stopPropagation());
    document.body.appendChild(w);hapLabel=w.querySelector('label');}
  const f=document.activeElement;hapLabel.click();if(f&&f!==document.activeElement&&f.focus)f.focus({preventScroll:true});}
function buzz(p){
  try{if(navigator.vibrate&&!IOS){navigator.vibrate(p);return;}}catch{/* not supported */}
  if(!IOS)return;const a=Array.isArray(p)?p:[p];let t=0;
  a.forEach((d,i)=>{if(i%2===0)setTimeout(iosTick,t);t+=d;});}
function shakeEl(el,cls){if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);}
let ui={ddOpen:null,don:{},tab:null,room:'3S',pick:'',res:{},settled:null,hookTeam:'',hookTarget:'',hookWhere:'',pickOut:{},doneSel:{},revokeAsk:null,
  coinTeam:'',coinAmt:'',buyer:'',mkTab:'buy',ncOpen:false,as:'ctrl',devOps:false,devAck:new Set(),nc:{name:'',desc:'',price:'',stock:''},
  sub:{dealer:'info',npc:'task',market:'buy',ctrl:'status',player:'team'},
  pub:{kind:'鬼门开',reward:0,title:'',body:'',target:'all',team:'R',players:[],mins:10,to:'all',sqTeam:'',quest:''},
  admin:{pins:null,snaps:null,counts:{dealer:8,judge:3,mengpo:2,wuchang:1,ctrl:2,screen:1},ask:null,resetTxt:''}};
const $=s=>document.querySelector(s);
const ROLE_TABS={ctrl:['board','ctrl','dealer','npc','market','wuchang'],dealer:['dealer'],judge:['npc'],mengpo:['market'],wuchang:['wuchang'],screen:['board'],player:['board','player']};
const TAB_NAME={board:'大屏',player:'本队',dealer:'Dealer',ctrl:'生死簿',npc:'判官',market:'鬼市',wuchang:'黑白无常'};
const ROLE_NAME={player:'玩家',dealer:'Dealer',judge:'判官',mengpo:'孟婆',wuchang:'黑白无常',ctrl:'总控',screen:'大屏'};
const nowT=()=>!CLOCK?0:CLOCK.running?CLOCK.base+Math.floor((Date.now()+OFFSET-CLOCK.at)/1000):CLOCK.base;

// ---------- look ----------
// Team colours of the 1b design (display only; rules.js keeps its own ids and names).
const TC={R:['#d0453a','#fff'],B:['#3d77c9','#fff'],G:['#3a9a6c','#fff'],Y:['#e2b33a','#1c150b'],P:['#9466b8','#fff'],O:['#e08a3c','#1c150b'],C:['#2a9d9a','#fff'],K:['#e0789f','#1c150b']};
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
function dd(k,valLabel,placeholder,valColor,options,multi){
  const open=ui.ddOpen===k,cur=getp(k),isOn=v=>multi?(cur||[]).includes(v):v===cur;
  return '<div class="dd'+(open?' open':'')+'"><button class="dd-btn" data-a="dd" data-v="'+k+'" aria-expanded="'+open+'">'
    +(valColor?'<span class="sw" style="--c:'+valColor+'"></span>':'')+'<span class="t'+(valLabel?'':' ph')+'">'+(valLabel||placeholder)+'</span><span class="car">▾</span></button>'
    +(open?'<div class="dd-list" role="listbox">'+options.map(o=>o.group?'<div class="dd-g">'+o.group+'</div>'
      :'<button class="dd-o'+(isOn(o.v)?' on':'')+'" role="option" aria-selected="'+isOn(o.v)+'" data-a="'+(multi?'pickm':'pick')+'" data-k="'+k+'" data-v="'+esc(o.v)+'"'+(o.off?' disabled':'')+'>'
        +(o.c?'<span class="sw" style="--c:'+o.c+'"></span>':'')+'<span class="t">'+o.label+'</span>'+(o.note?'<small>'+o.note+'</small>':'')+(isOn(o.v)?'<span class="mk">✓</span>':'')+'</button>').join('')+'</div>':'')+'</div>';
}
const teamPick=(k,cur,off,small)=>S.teams.map(t=>cb({k,v:t.id,on:cur===t.id,off:off&&off(t.id),c:TC[t.id][0],label:t.name,small:small&&small(t.id)})).join('');
function countdown(n,short){if(!n.due)return '';const r=n.due-S.t;return r>0?(short?mmss(r):'剩余 '+mmss(r)):'已截止';}
const kindOf=n=>n.kind==='通知'?['通知','alert']:n.kind==='公告'?['公告','']:n.sub==='side'?['sidequest','secret']:['鬼门开','task'];
const modeOf=n=>n.kind==='任务'&&n.sub!=='side'?'先到先得':'';

// ---------- 大屏 ----------
function broadcast(){
  const out=[];
  for(const l of S.log){
    let m,x=null,c='';
    if((m=/^(\S+) 被(.)队勾魂/.exec(l.text))){x=m[1]+' 被勾魂';c='hook';}
    else if((m=/^(\S+) 输了 (\S+) 被抽签淘汰/.exec(l.text))){x=m[1]+' 抽签淘汰';c='hook';}
    else if((m=/^(\S+) 喝下孟婆汤/.exec(l.text)))x=m[1]+' 买命回队';
    else if((m=/^(\S+) 赢下 (\S+)，\+(\d+) 冥币/.exec(l.text)))x=m[1]+'拿下 '+m[2]+'　+'+m[3];
    else if((m=/^判官记录 (\S+) 率先完成任务「(.+)」/.exec(l.text))){x=m[1]+'率先完成任务「'+m[2]+'」';c='hot';}
    if(x)out.push({t:l.t,x,c});
    if(out.length>=5)break;
  }
  return out;
}
function roomCard(r,mt){
  const ts=S.rooms.find(x=>x.id===r.id).teams,mine=!!mt&&ts.includes(mt);
  return '<div class="room'+(ts.length?' busy':'')+(mine?' mine':'')+'"><div class="top"><div class="cd">'+cardG(r)+'</div>'
    +'<div class="rr"><span class="typ">'+TYPE[r.suit]+'</span><span class="pt">+'+r.n*100+'</span></div></div>'
    +'<div class="bt">'+(ts.length?'<span class="on"><i class="gd"></i>'+(mine?'本队进行中':'进行中')+'</span><div class="vs">'+ts.map(tchip).join('<span>vs</span>')+'</div>'
      :'<span class="idle">空闲</span>')+'</div></div>';
}
function viewBoard(){
  const list=[...S.teams].sort((a,b)=>b.score-a.score),max=Math.max(1,list[0].score);
  let rk=0,prev=null;
  const bars=list.map((t,i)=>{if(t.score!==prev){rk=i+1;prev=t.score;}
    const mine=ME&&ME.role==='player'&&ME.pid&&ME.pid.split('-')[0]===t.id;
    return '<div class="bcol'+(mine?' mine':'')+'" style="'+tv(t.id)+'"><span class="v">'+t.score+'</span>'
      +'<div class="b" style="height:calc(var(--b0,56px) + '+(t.score/max).toFixed(3)+' * var(--b1,214px))" role="img" aria-label="'+t.name+' 第 '+rk+' 名，'+t.score+' 冥币">'+rk+'</div>'
      +'<div class="nm">'+tsq(t.id)+'<span>'+t.name+'</span>'+'</div>'+(mine?'<em class="me">本队</em>':'')
      +'<div class="su">'+SUITS.map(s=>'<span class="'+(t.cards.some(c=>c.includes(s))?'got ':'')+(isRed(s)?'sr':'')+'">'+s+'</span>').join('')+'</div></div>';}).join('');
  const bc=broadcast();
  const run=CLOCK&&CLOCK.running;
  return '<div class="stage-wrap"><div class="stage">'
    +'<div class="left"><div class="hd"><div class="ttl">百鬼夜行</div><div class="en">CORNELL CSSA 万圣夜</div></div>'
    +'<div class="clock"><span class="cap">'+(run?'游戏时钟':'已暂停')+'</span><span class="ck mono'+(run?'':' paused')+'" id="sclk">'+fmt(S.t)+'</span>'
    +incense()+'</div>'
    +'<div class="cast"><span class="cap" style="padding-bottom:8px">全场播报</span>'
    +(bc.length?bc.map(b=>'<div class="bc '+b.c+'"><span class="t">'+fmt(b.t)+'</span><span class="x">'+esc(b.x)+'</span></div>').join(''):'<div class="bc"><span class="x muted">暂无播报</span></div>')+'</div></div>'
    +'<div class="right"><div class="rank"><div class="rh"><b>队伍冥币排名</b><span>终极：四色齐 · 全员活 · 积分 ≥ '+FINAL_SCORE+'</span></div><div class="bars">'+bars+'</div></div>'
    +'<div class="rgrid">'+ROOMS.map(roomCard).join('')+'</div></div>'
    +'</div></div>';
}
// Game progress as a burning incense stick: ash on the left, a glowing ember at "now", five watches of 30 min.
function incense(){
  const p=Math.min(1,Math.max(0,S.t/9000)),cur=Math.min(4,Math.floor(S.t/1800));
  return '<div class="xiang" style="--p:'+p.toFixed(4)+'" role="img" aria-label="进度 '+Math.round(p*100)+'%"><div class="stick"><i class="ash"></i></div>'
    +'<i class="ember"></i>'
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
// A losing team draws lots on site; the Dealer picks the person here.
function outPick(tid){const a=alive(tid);
  return '<div class="outpick"><span class="lbl">现场抽签：选出被淘汰的人</span>'+(a.length?'<div class="chips ids">'+a.map(p=>cb({cls:'id',k:'pickOut.'+tid,v:p.id,on:ui.pickOut[tid]===p.id,label:p.id,mark:false})).join('')+'</div>':'<span class="small">队里已无存活队员</span>')+'</div>';}
function viewDealer(){
  const mine=ME.role==='dealer'&&Array.isArray(ME.rooms)?ME.rooms:null;
  if(mine&&!mine.length)return '<div class="page"><div class="pn"><h2 class="sh">还没有房间</h2><span class="muted">这个 Dealer PIN 没有对应的房间（Dealer 只有 8 个，一人一间）。请总控在「总控工具」里重新生成 PIN。</span></div></div>';
  if(mine&&!mine.includes(ui.room)){ui.room=mine[0];ui.pick='';ui.res={};ui.pickOut={};ui.settled=null;}
  const r=room(ui.room),ts=S.rooms.find(x=>x.id===r.id).teams,cap=r.two?2:1;
  const done=ui.settled&&ui.settled.rid===r.id&&!ts.length;
  const rooms=mine&&mine.length===1?'':'<div class="sec on" style="gap:10px"><span class="lbl">'+(mine?'我负责的房间':'全部房间'+(ME.role==='ctrl'?'（总控视角）':''))+'</span><div class="rooms8">'+ROOMS.filter(x=>!mine||mine.includes(x.id)).map(x=>{const n=S.rooms.find(y=>y.id===x.id).teams.length;
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
      return cb({cls:'big',k:'pick',v:t.id,on:ui.pick===t.id,off:!!w,c:w?'var(--line2)':TC[t.id][0],label:t.name,small:w||'存活 '+alive(t.id).length+'/'+size(t.id)});}).join('');
    entry='<div class="chips c2">'+btns+'</div><button class="btn-main" data-a="enter"'+(ui.pick?'':' disabled')+'>'+(ui.pick?'放行 '+team(ui.pick).name+' 入场':'先选择可入场的队伍')+'</button>';
  }else entry='<div class="empty">房间已满，结算后再放行</div>';
  const info='<div class="pn" style="gap:14px"><h2 class="sh">规则与入场</h2><div class="rule">'+r.rule+'</div>'
    +'<div class="lot hot">输队现场抽签淘汰 1 人，结算时在这里选出是谁</div>'
    +'<div class="need"><b>放行入场</b><span class="small">队伍须满员：<span class="mono" style="color:var(--ink)">'+PER_TEAM+'</span> 人全部在场</span></div>'+entry+'</div>';
  const lostTs=ts.filter(t=>ui.res[t]==='lose'),needPick=lostTs.filter(t=>alive(t).length&&!alive(t).some(p=>p.id===ui.pickOut[t]));
  const pending=ts.filter(t=>!ui.res[t]).length,ready=ts.length===cap&&!pending&&!needPick.length;
  const hint=done?'本局已结算':!ts.length?'等待入场':pending?'还差 '+pending+' 队未选':ts.length<cap?'还需第二队入场':needPick.length?'还差选出被淘汰的人':'胜负已选好';
  const rows=ts.map(tid=>{const t=team(tid),v=ui.res[tid]||'';
    return '<div class="rt"><div class="hd">'+tsq(tid,42)+'<div><b>'+t.name+'</b><span class="small">存活 <span class="mono" style="color:var(--ink)">'+alive(tid).length+'</span> 人</span></div></div>'
      +(v?'<span class="stamp">'+(v==='win'?'胜':'负')+'</span>':'')
      +'<div class="wl" role="group" aria-label="'+t.name+'结果"><button class="w" data-a="res" data-t="'+tid+'" data-v="win" aria-pressed="'+(v==='win')+'">赢</button>'
      +'<button class="l" data-a="res" data-t="'+tid+'" data-v="lose" aria-pressed="'+(v==='lose')+'">输</button></div>'+(v==='lose'?outPick(tid):'')+'</div>';}).join('');
  const W=ts.filter(t=>ui.res[t]==='win').map(t=>team(t).name),L=ts.filter(t=>ui.res[t]==='lose').map(t=>team(t).name);
  const summary=done?esc(ui.settled.msg):!ts.length?'':!ready?(ts.length<cap?'两队到齐才能结算':needPick.length&&!pending?'为输的队选出被淘汰的人':'为每队选赢或输')
    :(W.length?W.join('、')+'赢：+'+r.n*100+' 冥币和 '+r.card:'无人获胜')+(L.length?'；'+L.join('、')+'输，淘汰 '+lostTs.map(t=>ui.pickOut[t]||'无').join('、'):'');
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
      return {v:p.id,label:p.id,c:TC[t.id][0],off:gone||l>0,note:gone?'已淘汰':l>0?'保护 '+Math.ceil(l/60)+' 分':''};})];});
  const ready=ui.hookTeam&&tgt;
  const counts={};const hl=hookLog();hl.forEach(h=>{if(h.by)counts[h.by]=(counts[h.by]||0)+1;});
  const hook='<div class="pn hook"><div class="two">'
    +'<div class="fld"><span>取得勾魂令的队伍</span>'+dd('hookTeam',ui.hookTeam&&team(ui.hookTeam).name,'选择队伍',ui.hookTeam&&TC[ui.hookTeam][0],S.teams.map(t=>({v:t.id,label:t.name,c:TC[t.id][0]})))+'</div>'
    +'<div class="fld"><span>被点名的队员</span>'+dd('hookTarget',tgt&&tgt.id,'选择别队队员',tgt&&TC[tgt.team][0],opts)+'</div></div>'
    +'<label class="fld"><span>被勾魂时的位置（可不填，黑白无常会看到）</span><input class="in" id="hw" data-m="hookWhere" value="'+esc(ui.hookWhere)+'" placeholder="例如：二楼走廊"></label>'
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
// 入鬼市登记：黑白无常或孟婆谁点都行，另一方确认。
const checkinParty=()=>ME.role==='ctrl'?(ui.tab==='wuchang'?'wuchang':'mengpo'):ME.role;
const canConfirm=p=>!!p.chk&&!p.chk.ok&&(p.chk.by==='mengpo'?checkinParty()==='wuchang':p.chk.by==='wuchang'&&checkinParty()==='mengpo');
const chkBit=p=>!p.chk?'':p.chk.ok?'<span class="chk ok">登记已确认</span>':canConfirm(p)?'<button class="btn-line fill chkbtn" data-a="confirmin" data-p="'+p.id+'">确认入鬼市</button>':'<span class="chk wait">待'+(p.chk.by==='mengpo'?'黑白无常':'孟婆')+'确认</span>';
function inboundPanel(){
  const wait=S.players.filter(p=>p.st==='out'||p.st==='picked').sort((a,b)=>a.outAt-b.outAt);
  const rows=wait.map(p=>'<div class="mrow'+(p.st==='picked'?' ok':'')+'"><div class="l1"><span class="id">'+p.id+'</span>'+tchip(p.team)
    +'<span class="stay">'+(p.st==='picked'?'<b>已被黑白无常接到</b>':'等黑白无常来接')+'</span></div>'
    +'<div class="l1"><span class="stay">淘汰位置：<b>'+esc(p.at||'未记录')+'</b>　已等 <b class="mono">'+mm(S.t-p.outAt)+'</b></span></div>'
    +'<button class="btn-main'+(p.st==='picked'?' glow':'')+'" data-a="checkin" data-p="'+p.id+'">登记入鬼市</button></div>').join('');
  return '<section class="mcol"><div class="shrow"><h2 class="sh">待入鬼市</h2><span class="hint">登记后开始计时并领 300 冥币，另一方确认</span></div>'
    +(rows?'<div class="mlist">'+rows+'</div>':'<div class="empty">现在没有等着入鬼市的人。</div>')+'</section>';
}
function viewMarket(){
  const mk=S.players.filter(p=>p.st==='market').sort((a,b)=>a.inAt-b.inAt);
  // Left (≈60%): one compact row per person in the market.
  if(ui.reviveAsk){const q=S.players.find(x=>x.id===ui.reviveAsk);if(!q||q.st!=='market'||S.t-q.inAt<MIN_STAY||q.coins+q.bail<COIN_GOAL)ui.reviveAsk=null;}
  const rows=mk.map(p=>{const stay=S.t-p.inAt,tOk=stay>=MIN_STAY,tot=p.coins+p.bail,cOk=tot>=COIN_GOAL,ok=tOk&&cOk,asking=ui.reviveAsk===p.id;
    return '<div class="mrow'+(ok?' ok':'')+(asking?' asking':'')+'"><div class="l1"><span class="id">'+p.id+'</span>'+tchip(p.team)
      +'<span class="stay'+(tOk?' okc':'')+'">已停留 <b class="mono">'+mm(stay)+'</b>/'+MIN_STAY/60+' 分钟</span>'
      +chkBit(p)+'</div>'
      +'<div class="l2"><label class="kv"><span class="k">本人冥币</span><span class="coin-in"><input class="in mono" id="c-'+p.id+'" data-m="coin" data-p="'+p.id+'" value="'+p.coins+'" inputmode="numeric" aria-label="'+p.id+' 本人冥币"><span class="cstep"><button type="button" data-a="mcoin" data-p="'+p.id+'" data-v="100" aria-label="增加 100">▲</button><button type="button" data-a="mcoin" data-p="'+p.id+'" data-v="-100" aria-label="减少 100">▼</button></span></span></label>'
      +'<div class="kv"><span class="k">队友助力</span><span class="v">+'+p.bail+'</span></div>'
      +'<div class="kv"><span class="k">合计</span><span class="v'+(cOk?' ok':'')+'" id="tot-'+p.id+'">'+tot+' / '+COIN_GOAL+'</span></div>'
      +(asking?'<div class="rvask"><button class="btn-main glow" data-a="reviveok" data-p="'+p.id+'">确认回队</button><button class="btn-line" data-a="reviveno">取消</button></div>'
        :'<button class="btn-main'+(ok?' glow':'')+'" data-a="revive" data-p="'+p.id+'"'+(ok?'':' disabled')+'>'+(ok?'买命回队':!tOk?'时间未满':'差 '+(COIN_GOAL-tot))+'</button>')+'</div></div>';}).join('');
  const left='<section class="mcol"><div class="shrow"><h2 class="sh">孟婆买命</h2><span class="hint">满 '+MIN_STAY/60+' 分钟且凑够 '+COIN_GOAL+' 可回队</span></div>'
    +(rows?'<div class="mlist">'+rows+'</div>':'<div class="empty">鬼市现在没有人。</div>')+'</section>';
  return '<div class="page mkt">'+left+(FEATURES.cards?cardsPanel(mk):inboundPanel())+'</div>';
}
// 技能卡商铺（暂时关闭，FEATURES.cards 打开后恢复）
function cardsPanel(mk){
  // Right (≈40%): tabs 购买技能卡 / 各队持有.
  if(ui.buyer&&!mk.some(p=>p.id===ui.buyer))ui.buyer='';
  const by=ui.buyer&&S.players.find(p=>p.id===ui.buyer),held=S.teams.reduce((n,t)=>n+t.skills.length,0),tab=ui.mkTab==='hold'?'hold':'buy';
  const tabs='<div class="mtabs" role="tablist"><button role="tab" data-a="mktab" data-v="buy" aria-selected="'+(tab==='buy')+'">购买技能卡</button>'
    +'<button role="tab" data-a="mktab" data-v="hold" aria-selected="'+(tab==='hold')+'">各队持有'+(held?' <span class="n">'+held+'</span>':'')+'</button></div>';
  let body;
  if(tab==='buy'){
    const buyers=mk.length?'<div class="buyers">'+mk.map(p=>'<button class="bchip'+(ui.buyer===p.id?' on':'')+'" data-a="pick" data-k="buyer" data-v="'+p.id+'" data-t="1" aria-pressed="'+(ui.buyer===p.id)+'"><span class="sw" style="--c:'+TC[p.team][0]+'"></span><b class="mono">'+p.id+'</b><span>'+p.coins+' 冥币</span></button>').join('')+'</div>'
      :'<span class="small">鬼市现在没有人，没人能买。</span>';
    const goods=S.shop.length?S.shop.map(c=>{const poor=by&&by.coins<c.price,can=c.stock>0&&by&&!poor;
      return '<div class="good"><div class="gl"><b class="'+(c.stock?'':'off')+'">'+esc(c.name)+'</b>'+(c.desc?'<span class="d">'+esc(c.desc)+'</span>':'')+'</div>'
        +'<div class="gr"><span class="small"><b class="mono">'+c.price+'</b> 冥币 · '+(c.stock?'库存 '+c.stock:'<span class="redc">售罄</span>')+'</span>'
        +'<button class="btn-line'+(can?' fill':'')+'" data-a="buy" data-k="'+c.id+'"'+(can?'':' disabled')+'>'+(!c.stock?'已售罄':!by?'先选买家':poor?'冥币不足':'卖给 '+by.id)+'</button></div></div>';}).join('')
      :'<span class="muted">商铺里还没有技能卡。</span>';
    body='<div class="fld"><span>买家（鬼市中的人）</span>'+buyers+'</div><div class="goods2">'+goods+'</div>';
  }else{
    body=S.teams.filter(t=>t.skills.length).map(t=>'<div class="hold"><div class="hold-hd">'+tsq(t.id,26)+'<b>'+t.name+'</b><span class="small">'+t.skills.length+' 张可用</span></div>'
      +t.skills.map(k=>'<div class="good"><div class="gl"><b>'+esc(k.name)+'</b><span class="small">'+esc(k.by)+' 买于 '+fmt(k.t)+'</span></div>'
        +'<div class="gr"><button class="btn-line acc" data-a="usecard" data-t="'+t.id+'" data-k="'+k.sid+'">标记已使用</button></div></div>').join('')+'</div>').join('')
      ||'<span class="muted">还没有队伍买过技能卡。</span>';
  }
  const right='<section class="mcol"><div class="shrow"><h2 class="sh">技能卡</h2><button class="btn-line addbtn" data-a="ncopen">＋ 上架新技能卡</button></div><div class="pn mshop">'+tabs+body+'</div></section>';
  // 上架新技能卡: a dialog, not a form that always takes space.
  const sheet=ui.ncOpen?'<div class="sheet"><div class="sheet-bg" data-a="ncclose"></div><div class="sheet-card pn" role="dialog" aria-modal="true" aria-labelledby="nct">'
    +'<h3 id="nct">上架新技能卡</h3>'
    +'<label class="fld"><span>卡名</span><input class="in" id="ncn" data-m="nc.name" value="'+esc(ui.nc.name)+'" placeholder="例如：替身纸人"></label>'
    +'<div class="fgrid two"><label class="fld"><span>价格（冥币）</span><input class="in mono" id="ncp" data-m="nc.price" value="'+esc(ui.nc.price)+'" inputmode="numeric"></label>'
    +'<label class="fld"><span>库存</span><input class="in mono" id="ncs" data-m="nc.stock" value="'+esc(ui.nc.stock)+'" inputmode="numeric"></label></div>'
    +'<label class="fld"><span>效果说明（可不填）</span><textarea class="in" id="ncd" data-m="nc.desc" rows="3">'+esc(ui.nc.desc)+'</textarea></label>'
    +'<div class="btns"><button class="btn-main" data-a="addcard">上架</button><button class="btn-line" data-a="ncclose">取消</button></div></div></div>':'';
  return right+sheet;
}

// ---------- 黑白无常 ----------
function viewWuchang(){
  const meta=p=>'<div class="l1"><span class="id">'+p.id+'</span>'+tchip(p.team)+'<span class="stay">淘汰位置：<b>'+esc(p.at||'未记录')+'</b></span><span class="stay">已等 <b class="mono">'+mm(S.t-(p.outAt||S.t))+'</b></span></div>';
  const wait=S.players.filter(p=>p.st==='out').sort((a,b)=>a.outAt-b.outAt);
  const go=S.players.filter(p=>p.st==='picked'||(p.st==='market'&&p.chk&&!p.chk.ok&&p.chk.by==='mengpo')).sort((a,b)=>(a.outAt||0)-(b.outAt||0));
  const left='<section class="mcol"><div class="shrow"><h2 class="sh">待接的人</h2><span class="hint">谁在哪里被淘汰了；接到后点「接到了」</span></div>'
    +(wait.length?'<div class="mlist">'+wait.map(p=>'<div class="mrow">'+meta(p)+'<button class="btn-main glow" data-a="pickup" data-p="'+p.id+'">接到了</button></div>').join('')+'</div>':'<div class="empty">现在没有人需要接。</div>')+'</section>';
  const right='<section class="mcol"><div class="shrow"><h2 class="sh">送入鬼市 / 确认</h2><span class="hint">已接到的人送去鬼市；孟婆已登记的人在这里确认</span></div>'
    +(go.length?'<div class="mlist">'+go.map(p=>'<div class="mrow ok">'+meta(p)+(p.st==='picked'?'<button class="btn-main glow" data-a="checkin" data-p="'+p.id+'">送入鬼市</button>':'<div class="l1"><span class="chk wait">孟婆已登记</span></div><button class="btn-main glow" data-a="confirmin" data-p="'+p.id+'">确认入鬼市</button>')+'</div>').join('')+'</div>':'<div class="empty">没有需要送入或确认的人。</div>')+'</section>';
  return '<div class="page mkt eq">'+left+right+'</div>';
}

// ---------- 生死簿 ----------
// 一队里待接 / 已接到 / 在鬼市的人数
function downTxt(tid){const c={out:0,picked:0,market:0};S.players.forEach(p=>{if(p.team===tid&&c[p.st]!=null)c[p.st]++;});
  const b=[];if(c.out)b.push('待接 '+c.out);if(c.picked)b.push('已接到 '+c.picked);if(c.market)b.push('鬼市 '+c.market);
  return b.length?'<span class="small" style="color:var(--red);font-weight:700">'+b.join('　')+'</span>':'<span class="small">全员在场</span>';}
function downPanel(){
  const l=S.players.filter(p=>p.st!=='alive').sort((a,b)=>(a.outAt||0)-(b.outAt||0)),nm={out:'等黑白无常',picked:'已接到',market:'在鬼市'};
  return '<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">淘汰与鬼市状态</h3>'+(l.length?l.map(p=>'<div class="li"><div class="grow"><span class="t">'+fmt(p.outAt||0)+'</span>'
    +'<span class="x">'+p.id+'　'+nm[p.st]+(p.at?'　@'+esc(p.at):'')+(p.chk?'　'+(p.chk.ok?'登记已确认':'登记待确认'):'')+'</span></div></div>').join(''):'<div class="li small">现在没有人被淘汰。</div>')+'</div>';
}
function teamRows(){
  const list=[...S.teams].sort((a,b)=>b.score-a.score);
  const parts=list.map(t=>{const st=teamStatus(t),a=alive(t.id).length;
    const dots=S.players.filter(p=>p.team===t.id).map(p=>'<span class="dt'+(p.st==='alive'?'':' out')+'" title="'+p.id+(p.st==='alive'?'':'（鬼市）')+'"></span>').join('');
    const sq=SUITS.map(s=>'<span class="sq'+(t.cards.some(c=>c.includes(s))?' got':'')+'" title="'+TYPE[s]+'"><span class="'+(isRed(s)?'sr':'')+'">'+s+'</span></span>').join('');
    const sk=!FEATURES.cards?'':t.skills.length?t.skills.map(k=>'<button class="sk'+(ui.tskOpen===k.sid?' on':'')+'" data-a="tsk" data-v="'+k.sid+'" aria-expanded="'+(ui.tskOpen===k.sid)+'">'+esc(k.name)+'</button>').join(''):'<span class="small">无</span>';
    const ok=t.skills.find(k=>k.sid===ui.tskOpen);
    const det=ok?'<div class="skd"><b>'+esc(ok.name)+'</b>'+(ok.desc?'<span class="d">'+esc(ok.desc)+'</span>':'<span class="small">没有效果说明</span>')+'<span class="small">'+esc(ok.by)+' 于 '+fmt(ok.t)+' 在鬼市买入</span></div>':'';
    const fin='<button class="btn-line'+(st.k==='free'?' fill':'')+'" data-a="final" data-v="'+t.id+'"'+(st.k!=='free'||t.final?' disabled':'')+(t.final?' title="终极任务已开启"':'')+'>'+(st.k==='free'?'开启终极任务':'未达成条件')+'</button>';
    return {t,a,dots,sq,sk,fin,det};});
  const tbl='<div class="tbl'+(FEATURES.cards?'':' no-skills')+'"><div class="tr th"><span>队伍</span><span>存活</span><span>冥币</span><span>四色花色</span>'+(FEATURES.cards?'<span>技能卡</span>':'')+'<span>终极</span></div>'
    +parts.map(({t,a,dots,sq,sk,fin,det})=>'<div class="trg" style="'+tv(t.id)+'"><div class="tr"><span class="tn">'+tsq(t.id)+t.name+'</span><span class="dots">'+dots+'<span class="mono" style="font-weight:700;font-size:14px;margin-left:6px">'+a+'/'+size(t.id)+'</span></span>'
      +'<span class="cn">'+t.score+'</span><span class="sqs">'+sq+'</span>'+(FEATURES.cards?'<span class="tags">'+sk+'</span>':'')+'<span>'+fin+'</span></div>'+(det?'<div class="skdrow">'+det+'</div>':'')+'</div>').join('')+'</div>';
  const cards='<div class="tcards">'+parts.map(({t,a,dots,sq,sk,fin,det})=>'<div class="tcard" style="'+tv(t.id)+'"><div class="r">'+tsq(t.id,32)+'<b style="font-size:18px">'+t.name+'</b><span class="cn">'+t.score+'</span></div>'
    +'<div class="r dots">'+dots+'<span class="small" style="margin-left:4px">存活 <span class="mono" style="color:var(--ink)">'+a+'/'+size(t.id)+'</span></span></div>'
    +'<div class="r"><span class="sqs">'+sq+'</span><span style="margin-left:auto">'+fin+'</span></div>'+(FEATURES.cards?'<div class="tags">'+sk+'</div>':'')+det+'</div>').join('')+'</div>';
  return tbl+cards;
}
function coinAmt(){const v=parseInt(String(ui.coinAmt).replace(/[^\d-]/g,''),10);return Number.isFinite(v)?v:0;}
function coinBtn(){const t=ui.coinTeam&&team(ui.coinTeam),a=coinAmt();
  return t&&a?'确认 '+t.name+' '+(a>0?'+':'')+a+' → '+Math.max(0,t.score+a):'确认修改';}
function editTeam(){
  const ct=ui.coinTeam&&team(ui.coinTeam);
  return '<div class="pn" style="gap:12px"><h3>修改队伍冥币</h3>'
    +'<div class="coinrow"><div class="fld"><span>队伍</span>'+dd('coinTeam',ct&&ct.name,'选择队伍',ct&&TC[ct.id][0],S.teams.map(t=>({v:t.id,label:t.name,c:TC[t.id][0],note:t.score+' 冥币'})))+'</div>'
    +'<div class="fld"><span>冥币增减（▲▼ 每次 100）</span><span class="coin-in"><input class="in mono" type="number" step="100" id="cv" data-m="coinAmt" value="'+esc(ui.coinAmt)+'" placeholder="0" aria-label="冥币增减">'
    +'<span class="cstep"><button type="button" data-a="coinstep" data-v="100" aria-label="加 100">▲</button><button type="button" data-a="coinstep" data-v="-100" aria-label="减 100">▼</button></span></span></div>'
    +'<button class="btn-main" id="coinbtn" data-a="setscore" style="min-height:48px;font-size:16px">'+coinBtn()+'</button></div></div>';
}
function logTag(l){const x=l.text;
  return /勾魂|抽签淘汰|被淘汰/.test(x)?['勾魂','var(--red)']:/黑白无常/.test(x)?['无常','var(--red)']:/孟婆汤|鬼市|助力/.test(x)&&!/技能卡/.test(x)?['鬼市','var(--accent)']:/技能卡/.test(x)?['技能卡','#6b4f9a']
    :/发布|撤销发布/.test(x)?['发布','var(--ink2)']:/任务/.test(x)?['任务','var(--accent)']:/进入|赢下|输了/.test(x)?['房间','var(--ink2)']:/冥币/.test(x)?['冥币','var(--warn)']:['系统','var(--sub)'];}
function viewCtrl(){
  const status='<h2 class="sh">各队状态</h2>'+teamRows()+downPanel()
    +editTeam();
  return '<div class="page tabbed toptabs ledger">'+sub('ctrl',[['status','各队状态'],['pub','发布'],['log','全场日志'],['tools','总控工具']],'top col')
    +sec('ctrl','status',status)+sec('ctrl','pub',pubPanel())
    +sec('ctrl','log','<h2 class="sh">全场日志</h2><div class="pn logl" style="gap:0">'+(S.log.length?S.log.slice(0,300).map(l=>{const [k,c]=logTag(l);
      return '<div class="le"><span class="t">'+fmt(l.t)+'</span><span class="k" style="--kc:'+c+'">'+k+'</span><span class="x">'+esc(l.text)+'</span></div>';}).join(''):'<span class="muted">还没有日志。</span>')+'</div>')
    +sec('ctrl','tools',adminPanel())+'</div>';
}
function pubPanel(){
  const f=ui.pub,K=f.kind,gate=K==='鬼门开',side=K==='sidequest',task=K!=='公告';f.to=f.target==='team'?'team:'+f.team:f.target;
  const to=[['all','全场'],...S.teams.map(t=>['team:'+t.id,t.name,t.id]),['alive','存活的人'],['market','鬼市里的人'],['player','某位队员']];
  const toOn=v=>v==='team:'+f.team?f.target==='team':v===f.target;
  const pl=f.players||[],q=QUESTS.find(x=>x.id===f.quest);
  const toName=gate?'全场':side?(f.sqTeam?team(f.sqTeam).name+'的':'队伍的'):f.target==='team'?team(f.team).name:f.target==='player'?(!pl.length?'某位队员':pl.length<=3?pl.join('、'):pl.slice(0,2).join('、')+' 等 '+pl.length+' 人'):{all:'全场',alive:'存活的',market:'鬼市里的'}[f.target];
  // sidequest: one team only, teams that are short of people first, with how many are left
  const sqTeams=[...S.teams].sort((a,b)=>alive(a.id).length-alive(b.id).length);
  const target=K==='公告'?'<div class="fgrid"><div class="fld"><span>发给谁</span>'+dd('pub.to',(to.find(([v])=>toOn(v))||[])[1],'选择对象',f.target==='team'?TC[f.team][0]:null,to.map(([v,l,id])=>({v,label:l,c:id?TC[id][0]:null})))+'</div>'
      +(f.target==='player'?'<div class="fld"><span>选择队员（可多选）</span>'+dd('pub.players',pl.length?pl.length+' 人':'','选择队员',null,S.teams.flatMap(t=>[{group:t.name},...S.players.filter(p=>p.team===t.id).map(p=>({v:p.id,label:p.id,c:TC[t.id][0],note:p.st==='alive'?'':'已淘汰'}))]),true)
        +(pl.length?'<div class="selchips">'+pl.map(id=>'<button class="selchip" data-a="unpick" data-k="pub.players" data-v="'+id+'" aria-label="去掉 '+id+'"><span class="sw" style="--c:'+TC[teamOf(id)][0]+'"></span>'+id+'<b>×</b></button>').join('')+'</div>':'')+'</div>':'')+'</div>'
    :gate?'<span class="small">发给全场玩家，先到先得，被完成时全场播报。</span>'
    :'<div class="fld"><span>发给哪个队伍</span><div class="chips c2">'+sqTeams.map(t=>cb({k:'pub.sqTeam',v:t.id,on:f.sqTeam===t.id,c:TC[t.id][0],label:t.name,small:'剩余 '+alive(t.id).length+'/'+size(t.id)+' 人'})).join('')+'</div></div>'
      +'<div class="fld"><span>题库</span><div class="chips c2">'+QUESTS.map(x=>cb({k:'pub.quest',v:x.id,on:f.quest===x.id,label:esc(x.title),small:'+'+x.reward+' 冥币'})).join('')+'</div></div>'
      +(q?'<div class="lot">'+esc(q.body)+'</div>':'');
  const form='<div class="pn" style="gap:14px">'
    +'<div class="fld"><span>类型</span><div class="seg3">'+['公告','鬼门开','sidequest'].map(k=>'<button class="sbtn'+(K===k?' on':'')+(k==='sidequest'?' secret':'')+'" data-a="pick" data-k="pub.kind" data-v="'+k+'" aria-pressed="'+(K===k)+'">'+k+'</button>').join('')+'</div></div>'
    +target
    +'<div class="fgrid"><label class="fld"><span>限时（分钟）</span><input class="in mono" id="pm" data-m="pub.mins" value="'+esc(f.mins)+'" inputmode="numeric"></label>'
    +(task?'<label class="fld"><span>奖励冥币</span><input class="in mono" id="prw" data-m="pub.reward" value="'+esc(f.reward)+'" inputmode="numeric"></label>':'')+'</div>'
    +(side?'':'<label class="fld"><span>标题</span><input class="in" id="pti" data-m="pub.title" value="'+esc(f.title)+'" placeholder="例如：鬼门开：还原鬼片海报"></label>'
    +'<label class="fld"><span>内容</span><textarea class="in" id="pb" data-m="pub.body" rows="3" placeholder="玩家手机上看到的说明：任务要求、集合地点…">'+esc(f.body)+'</textarea></label>')
    +'<button class="btn-main" data-a="publish">发布'+(side?' sidequest':'')+'到'+esc(toName)+'玩家手机</button></div>';
  const list=S.notices.filter(n=>n.kind!=='通知').slice(0,10).map(n=>{
    const aud=S.players.filter(p=>matches(n,p)),acked=aud.filter(p=>n.acks[p.id]).length,[kl,kc]=kindOf(n),ds=Object.keys(n.done);
    return '<div class="li"><div class="grow" style="gap:4px"><div class="thead"><span class="kb '+kc+'" style="font-size:12px;padding:0 7px">'+kl+'</span><b style="font-size:17px">'+esc(n.title)+'</b></div>'
      +'<span class="small">已读 <span class="mono" style="color:var(--ink)">'+acked+'/'+aud.length+'</span>'+(n.target!=='all'?'　'+esc(targetLabel(n)):'')+(n.due?'　'+countdown(n):'')+'</span>'
      +(ds.length?'<span class="small">完成：'+ds.map(lab).join('、')+'</span>':'')+'</div>'
      +(ui.revokeAsk===n.id?'<span class="btns"><button class="btn-line fillred" data-a="revokeok" data-n="'+n.id+'">确认撤销</button><button class="btn-line" data-a="revokeno">取消</button></span>'
        +'<span class="small" style="flex-basis:100%">玩家手机上会删除'+(Object.values(n.done).some(d=>d.pts)?'，奖励扣回':'')+'</span>'
        :'<button class="btn-line" data-a="revoke" data-n="'+n.id+'">撤销发布</button>')+'</div>';}).join('');
  return '<h2 class="sh">发布公告 / 鬼门开 / sidequest</h2><div class="pubcols">'+form+'<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">已发布</h3>'+(list||'<div class="li small">还没有发布过。</div>')+'</div></div>';
}
function adminPanel(){
  const A=ui.admin,c=A.counts,run=CLOCK&&CLOCK.running;
  const num=(k,l,fixed)=>'<label class="fld"><span>'+l+'</span><input class="in mono" type="number" id="adm-'+k+'" min="0" max="30" data-m="adm.'+k+'" value="'+c[k]+'"'+(fixed?' disabled':'')+'></label>';
  const pins=A.pins?'<div class="pins"><div class="pr h"><span>身份</span><span>编号 / 名称</span><span>PIN</span><span></span></div>'
    +A.pins.map(p=>'<div class="pr"><span>'+esc(p.roleName)+'</span><span class="mono" style="font-weight:700">'+esc(p.pid||p.label)+'</span><span class="pin">'+p.pin+'</span><span>'
      +(A.ask==='pin:'+p.pin?'<span class="btns" style="gap:4px"><button class="btn-line fillred" data-a="adm-resetpin" data-v="'+p.pin+'">确认</button><button class="btn-line" data-a="adm-cancel">取消</button></span>'
        :'<span class="btns" style="gap:4px"><button class="btn-line" data-a="copypin" data-v="'+p.pin+'">复制</button><button class="btn-line" data-a="adm-ask" data-v="pin:'+p.pin+'">重置</button></span>')+'</span>'
      +'</div>').join('')+'</div>'
    +'<div class="btns"><button class="btn-line" data-a="adm-csv">下载 PIN 表（CSV）</button><button class="btn-line" data-a="adm-hide">收起</button><span class="small">共 '+A.pins.length+' 个</span></div>':'';
  const snaps=A.snaps?(A.snaps.length?'<div class="list">'+A.snaps.map(s=>'<div class="li"><div class="grow"><span class="x" style="font-size:15px">'+new Date(s.at).toLocaleTimeString()+'</span><span class="small">游戏 '+fmt(s.t||0)+'　'+esc(s.tag||'')+'</span></div>'
      +(A.ask==='snap:'+s.key?'<span class="btns"><button class="btn-line fillred" data-a="adm-restore" data-v="'+s.key+'">确认恢复</button><button class="btn-line" data-a="adm-cancel">取消</button></span>'
        :'<button class="btn-line" data-a="adm-ask" data-v="snap:'+s.key+'">恢复到这里</button>')+'</div>').join('')+'</div>':'<span class="small">还没有备份。每 10 次操作自动备份一次。</span>'):'';
  const left='<div class="stack"><div class="pn"><span class="lbl" style="font-size:13px">游戏计时</span><div class="timer"><span class="big'+(run?'':' paused')+'" id="tclk">'+fmt(S.t)+'</span>'
    +'<button class="btn-line '+(run?'':'fill')+'" data-a="clockctl" style="min-height:52px;padding:0 24px;font-size:17px;font-weight:900">'+(run?'暂停':'开始')+'</button></div>'
    +'<span class="small" style="font-weight:700;color:'+(run?'var(--accent)':'var(--sub)')+'">'+(run?'● 计时中':'❚❚ 已暂停')+'</span></div>'
    +'<div class="pn"><h3>开局</h3><span class="small">8 队随机分到 8 个房间。只有还没有队伍进过房间时才能用。</span><div class="btns"><button class="btn-line acc" data-a="assign">开局随机分房</button></div></div>'
    +'<div class="pn"><div class="shrow"><h3>PIN</h3><span class="small">按数量补齐工作人员 PIN</span></div>'
    +'<div class="cnts">'+num('dealer','Dealer（固定）',1)+num('judge','判官')+num('mengpo','孟婆')+num('wuchang','黑白无常',1)+num('ctrl','总控')+num('screen','大屏')+'</div>'
    +'<div class="btns"><button class="btn-line acc" data-a="adm-gen">生成 PIN</button><button class="btn-line" data-a="adm-pins">查看全部 PIN</button></div>'+pins+'</div></div>';
  const rs=A.resetTxt==='重置';
  const right='<div class="stack"><div class="pn"><h3>备份与恢复</h3><span class="small">每 10 次操作自动备份一次；重置、恢复、载入演示数据前都会先备份当前数据。</span>'
    +'<div class="btns"><button class="btn-line" data-a="adm-snaps">查看备份</button>'
    +(A.ask==='reset:demo'?'<button class="btn-line fillred" data-a="adm-reset" data-v="demo">确认载入演示数据</button><button class="btn-line" data-a="adm-cancel">取消</button>'
      :'<button class="btn-line" data-a="adm-ask" data-v="reset:demo">载入演示数据</button>')+'</div>'+snaps+'</div>'
    +'<div class="danger"><h3>危险操作</h3><p>重置会清空所有冥币、花色、日志和鬼市记录（PIN 不变）。请在下方输入“重置”二字后再点按钮。</p>'
    +'<input class="in" id="rst" data-m="adm.resetTxt" value="'+esc(A.resetTxt)+'" placeholder="输入“重置”" style="border-color:#d9b3aa">'
    +'<button class="btn-line '+(rs?'fillred':'')+'" id="rstbtn" data-a="adm-reset" data-v="blank"'+(rs?'':' disabled')+' style="min-height:48px;font-weight:900">重置为空白游戏</button></div></div>';
  return '<h2 class="sh">总控工具</h2><div class="cols2">'+left+right+'</div>';
}

// ---------- 玩家 ----------
const meP=()=>S&&ME&&ME.role==='player'?S.players.find(p=>p.id===ME.pid):null;
const finalNow=()=>{const p=meP(),t=p&&S.teams.find(x=>x.id===p.team);return !!(t&&t.final);};
// 终极任务：队伍满足条件、总控开启后，玩家页只剩这一页。
function viewFinal(me,t){
  return '<div class="page final"><div class="fcard"><span class="fk">终极任务</span><h1>'+esc(t.name)+'</h1><p>'+esc(FINAL_MSG)+'</p>'
    +'<div class="fm"><span class="mono">'+me.id+'</span>'+tchip(t.id)+'</div></div></div>';
}
// 被淘汰 / 在鬼市时，页面顶部一条醒目的红色提示（另有整页红边光晕，见 style.css 的 body.inmk）。
function downBanner(me){
  if(me.st==='alive')return '';
  if(me.st==='market')return '<div class="oban mk" role="status"><b>你在鬼市</b><span>已待 <i class="mono">'+mm(S.t-me.inAt)+'</i> / '+MIN_STAY/60+' 分钟　合计冥币 <i class="mono">'+(me.coins+me.bail)+'</i> / '+COIN_GOAL+'</span></div>';
  return '<div class="oban" role="status"><b>你已被淘汰</b><span>'+(me.st==='picked'?'黑白无常已接到你，正在送你去鬼市':'留在原地，等黑白无常来接你')+'</span></div>';
}
function viewPlayer(){
  const me=S.players.find(p=>p.id===ME.pid),t=team(me.team);
  if(t.final)return viewFinal(me,t);
  const prot=protectedLeft(me),inMk=me.st==='market',out=me.st==='out'||me.st==='picked';
  const stay=inMk?S.t-me.inAt:0;
  // 酆都通行证: a clearance document, stamped with the current state
  const wst=inMk||out?'market':prot?'protected':'alive';
  const wseal=out?'淘汰':{alive:'存活',protected:'保护中',market:'鬼市'}[wst];
  const wnote=wst==='alive'?'<span class="w-hint">小心勾魂</span>'
    :out?'<span class="w-hint">你已被淘汰</span><span class="w-lab">'+(me.st==='picked'?'黑白无常已接到你，正在送你去鬼市':'留在原地，等黑白无常来接你')+'</span>'
    :wst==='market'?'<span class="w-hint">你在鬼市</span><span class="w-lab">已待 <b class="mono">'+mm(stay)+'</b> / '+MIN_STAY/60+' 分钟</span><span class="w-lab">合计冥币 <b class="mono">'+(me.coins+me.bail)+'</b> / '+COIN_GOAL+'</span>'
    :'<span class="w-lab">保护期还剩</span><span class="w-num">'+Math.ceil(prot/60)+' 分钟</span>';
  const wch=[...wseal],wn=wch.length,wh=wn>2?78:58,wy=wn>2?[27,51,75]:[29,55];
  const wen='<div class="wen" data-st="'+wst+'"><svg class="w-grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#paperGrain)"></rect></svg>'
    +'<i class="w-frame"></i><i class="w-cn tl"></i><i class="w-cn tr"></i><i class="w-cn bl"></i><i class="w-cn br"></i>'
    +'<div class="w-title"><b>酆都通行证</b><span>冥府签发</span></div><div class="w-rule"></div>'
    +'<div class="w-who"><span class="w-idg"><span class="w-k">持证人</span><span class="w-id">'+me.id+'</span></span>'
    +'<span class="w-teamg"><span class="w-k">所属</span><i class="w-sw" style="'+tv(t.id)+'"></i><span class="w-team">'+t.name+'</span></span></div>'
    +'<div class="w-state"><div class="w-note">'+wnote+'</div>'
    +'<svg class="w-seal" viewBox="0 0 64 '+(wh+6)+'" role="img" aria-label="'+wseal+'"><g filter="url(#sealInk)"><rect x="3" y="3" width="58" height="'+wh+'" rx="2"></rect>'
    +wch.map((c,i)=>'<text x="32" y="'+wy[i]+'" text-anchor="middle" font-size="'+(wn>2?24:28)+'">'+c+'</text>').join('')+'</g></svg></div></div>';
  // 本队
  const a=alive(t.id).length,st=teamStatus(t);
  const dots=S.players.filter(p=>p.team===t.id).map(p=>'<span class="dt'+(p.st==='alive'?'':' out')+'" style="'+tv(t.id)+'" title="'+p.id+(p.st==='alive'?'':'（淘汰）')+'"></span>').join('');
  const suits=SUITS.map(s=>{const has=t.cards.filter(c=>c.includes(s));
    return '<div class="s4'+(has.length?' got':'')+'"><span class="g '+(isRed(s)?'sr':'')+'">'+s+'</span><span class="l">'+TYPE[s]+'</span><span class="c">'+(has.length?has.join(' '):'未获得')+'</span></div>';}).join('');
  const myRooms=S.rooms.filter(x=>x.teams.includes(t.id)).map(x=>{const r=room(x.id);
    return '<div class="myroom"><div class="cd">'+cardG(r)+'</div><div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="on">● 本队进行中</span>'
      +'<div class="vs">'+x.teams.map(tchip).join('<span>vs</span>')+'</div><span class="small">赢 +'+r.n*100+' 冥币</span></div></div>';}).join('');
  const fin='<div class="fin'+(st.k==='free'?' ok':'')+'">'+st.txt+'</div>';
  const downN=S.players.filter(p=>p.team===t.id&&p.st!=='alive').length,sqOpen=S.notices.filter(n=>n.sub==='side'&&matches(n,me)&&!n.done[t.id]);
  const sqBox=downN?'<div class="sqbox"><b>队里有 '+downN+' 人被淘汰，暂时不能进房</b><span>'+(sqOpen.length?'去完成 sidequest 赚冥币，帮队友早点买命（见「任务」页）。':'等工作人员发布 sidequest，完成后赚冥币帮队友买命。')+'</span></div>':'';
  const teamSec=sqBox+'<div class="tsum"><div class="mini"><span class="cap">队伍冥币</span><span class="cv">'+t.score+'</span></div>'
    +'<div class="mini" style="gap:8px"><span class="cap">存活 <span class="mono" style="font-weight:700;font-size:14px;color:var(--ink)">'+a+' / '+size(t.id)+'</span></span><div class="dots">'+dots+'</div></div>'
    +'<div class="mini frag"><span class="cap">四色花色</span><div class="suits4">'+suits+'</div>'+fin+'</div></div>'
    +'<div class="mobonly">'+(myRooms||'<div class="pn" style="padding:14px"><span class="muted">本队现在没有在任何房间里。</span></div>')+'</div>'
  ;const skillsPart=!FEATURES.cards?'':''
    +'<div class="skrow"><span class="cap">本队技能卡</span>'+(t.skills.length?'<div class="skills">'+t.skills.map(k=>'<button class="sk'+(ui.skillOpen===k.sid?' on':'')+'" data-a="skill" data-v="'+k.sid+'" aria-expanded="'+(ui.skillOpen===k.sid)+'">'+esc(k.name)+'</button>').join('')+'</div>':'<span class="muted small">暂无。鬼市里的人可用个人冥币购买。</span>')+'</div>'
    +((sk=>sk?'<div class="skd"><b>'+esc(sk.name)+'</b>'+(sk.desc?'<span class="d">'+esc(sk.desc)+'</span>':'')+'<span class="small">'+esc(sk.by)+' 于 '+fmt(sk.t)+' 在鬼市买入</span><span class="small">使用时找工作人员出示这一页。</span></div>':'')(t.skills.find(k=>k.sid===ui.skillOpen)));
  // 通知与任务
  const mine=S.notices.filter(n=>matches(n,me)),unread=mine.filter(n=>!n.acks[me.id]).length;
  const nmeta=n=>{const key=indiv(n)?me.id:me.team,d=n.done[key],w=Object.keys(n.done)[0],lost=n.kind==='任务'&&!d&&isFirst(n)&&!!w;return{d,w,lost,live:n.kind==='任务'&&!d&&!lost};};
  const noteHtml=n=>{const acked=!!n.acks[me.id],[kl,kc]=kindOf(n),{d,w,lost}=nmeta(n);
    let ns='',nc='';
    if(n.kind==='任务'){if(d){ns='已完成 '+fmt(d.t);nc='var(--accent)';}else if(lost){ns='已被'+lab(w)+'抢先';nc='var(--sub)';}else{ns='进行中';nc='var(--accent)';}}
    return '<div class="note'+(acked?'':' new')+(lost?' lost':'')+'"><div class="nh"><span class="kb round '+kc+'" style="font-size:12px;padding:1px 10px">'+kl+'</span>'
      +(modeOf(n)?'<span class="mode">'+modeOf(n)+'</span>':'')+'<span class="mode mono">'+fmt(n.t)+'</span>'+(ns?'<span class="ns" style="color:'+nc+'">'+ns+'</span>':'')+'</div>'
      +'<div class="nt">'+esc(n.title)+'</div>'+(n.body?'<div class="nb">'+esc(n.body)+'</div>':'')
      +((n.due&&!d&&!lost)||n.reward?'<div class="nm">'+(n.due&&!d&&!lost?'<span class="red">⏱ '+countdown(n,true)+'</span>':'')+(n.reward?'<span>+'+n.reward+' 冥币</span>':'')+'</div>':'')
      +(acked?'<span class="small">已读</span>':'<button class="ack" data-a="ack" data-n="'+n.id+'">知道了</button>')+'</div>';};
  const curN=mine.filter(n=>!n.acks[me.id]||nmeta(n).live),histN=mine.filter(n=>!curN.includes(n));
  const taskSec='<h2 class="sh" style="font-size:22px">当前任务与通知</h2>'+(curN.length?curN.map(noteHtml).join(''):'<div class="pn"><span class="muted">暂时没有新的通知或进行中的任务。</span></div>')
    +(histN.length?'<button class="histbtn" data-a="hist" aria-expanded="'+!!ui.histOpen+'">历史消息（'+histN.length+'）<span>'+(ui.histOpen?'收起 ▲':'展开 ▼')+'</span></button>'+(ui.histOpen?histN.map(noteHtml).join(''):''):'');
  // 鬼市
  const mk=S.players.filter(p=>p.team===t.id&&p.st!=='alive').sort((x,y)=>x.outAt-y.outAt);
  const mate=(p,mine)=>{
    if(p.st!=='market')return '<div class="mate"'+(mine?' style="border-color:var(--red)"':'')+'><div class="r"><span class="id">'+p.id+(mine?' <span class="small" style="font-family:var(--sans)">（你）</span>':'')+'</span>'
      +'<span class="small" style="font-weight:700;color:var(--red)">'+(p.st==='picked'?'已被黑白无常接到':'原地等黑白无常')+'</span></div></div>';
    const s=S.t-p.inAt,tot=p.coins+p.bail,tOk=s>=MIN_STAY,cOk=tot>=COIN_GOAL,gap=gapOf(p);
    const line=tOk&&cOk?'可以找孟婆买命了':[tOk?'':'还需 '+mm(MIN_STAY-s),cOk?'':'差 '+(COIN_GOAL-tot)+' 冥币'].filter(Boolean).join('，');
    const def=Math.min(gap*RATE,t.score);
    return '<div class="mate"'+(mine?' style="border-color:var(--red)"':'')+'><div class="r"><span class="id">'+p.id+(mine?' <span class="small" style="font-family:var(--sans)">（你）</span>':'')+'</span>'
      +'<span class="small mono">'+tot+'/'+COIN_GOAL+'</span></div>'
      +'<div class="bar"><span class="ok" style="width:'+Math.min(100,tot/COIN_GOAL*100)+'%"></span></div>'
      +'<span class="small" style="font-weight:700;color:'+(tOk&&cOk?'var(--accent)':'var(--ink)')+'">'+line+'</span>'
      +(!mine&&me.st==='alive'&&gap>0?'<div class="give"><input class="in" id="d-'+p.id+'" data-m="don" data-p="'+p.id+'" value="'+(ui.don[p.id]!=null?ui.don[p.id]:def)+'" inputmode="numeric" placeholder="冥币数" aria-label="为 '+p.id+' 花掉的队伍冥币">'
        +'<button data-a="donate" data-p="'+p.id+'">冥币助力</button></div>':'')+'</div>';};
  const mkSec='<div class="shrow"><h2 class="sh" style="font-size:22px">被淘汰的队友</h2><span class="hint">满 '+MIN_STAY/60+' 分钟且 '+COIN_GOAL+' 冥币可买命</span></div>'
    +(mk.length?mk.map(p=>mate(p,p.id===me.id)).join(''):'<div class="pn"><span class="muted">本队现在没有人被淘汰。</span></div>')
    +'<span class="small">花本队冥币 '+RATE+':1 换助力（队伍现有 <span class="mono" style="color:var(--ink)">'+t.score+'</span>）</span>';
  const roomSec='<h2 class="sh" style="font-size:22px">全部房间</h2><div class="prooms">'+ROOMS.map(r=>roomCard(r,t.id)).join('')+'</div>';
  const tabs=[['team','本队'],['task','任务'+(unread?'<b class="cnt">'+unread+'</b>':'')],['market','鬼市'+(mk.length?'<b class="cnt">'+mk.length+'</b>':'')],['rooms','房间']];
  return '<div class="page tabbed toptabs allin">'+sub('player',tabs,'top')
    +'<div class="pcol l">'+wen+sec('player','team',teamSec)+sec('player','market',mkSec).replace('class="sec','class="sec'+(mk.length?'':' mk0'))+(skillsPart?sec('player','team',skillsPart):'')+sec('player','rooms',roomSec)+'</div>'
    +'<div class="pcol r">'+sec('player','task',taskSec)+'</div></div>';
}
function modalHtml(){
  if(!ME||ME.role!=='player'||!S)return '';
  const me=S.players.find(p=>p.id===ME.pid);
  const n=S.notices.find(x=>matches(x,me)&&!x.acks[me.id]&&!(DEVME&&ui.devAck.has(x.id+':'+me.id)));if(!n)return '';
  const [kl,kc]=kindOf(n),r=n.due?n.due-S.t:0;
  return '<div class="ovl" data-k="'+(n.tone==='out'?'out':'')+'"><div class="dlg" data-n="'+n.id+'" data-k="'+(n.tone==='out'?'out':'')+'" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="new"><i></i>新通知</div>'
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
// Three remembered choices per device: big screen (default dark), player page and staff pages (default light).
const themeKey=()=>ui.tab==='board'?'screen':ME&&ME.role==='player'?'player':'staff';
// 被淘汰、已被接到或在鬼市：整页红色提示，强制深色
const inMarketNow=()=>{const p=ME&&ME.role==='player'&&S&&S.players.find(x=>x.id===ME.pid);return !!(p&&p.st!=='alive');};
function themeFor(){const r=themeKey();if(r==='player'&&inMarketNow())return 'dark';let v=null;try{v=localStorage.getItem(THEME_KEY(r));}catch{/* private mode */}
  return v||(r==='screen'?'dark':'light');}
const themed=()=>true;

function render(){
  if(DEVME&&!entering){ME=devMe();if(FULL)S=ME.role==='player'?R.viewFor(FULL,ME):FULL;}
  const da=$('#devas');da.hidden=!DEVME||entering;
  const dop=$('#devops');dop.hidden=da.hidden;dop.textContent=ui.devOps?'可操作':'只读';dop.classList.toggle('on',ui.devOps);dop.setAttribute('aria-pressed',String(ui.devOps));
  if(DEVME&&!entering){const src=FULL||S,h='<optgroup label="工作人员">'+['ctrl','dealer','judge','mengpo','wuchang','screen'].map(r=>'<option value="'+r+'">'+ROLE_NAME[r]+'</option>').join('')+'</optgroup>'
      +(src?src.teams.map(t=>'<optgroup label="'+t.name+'">'+src.players.filter(p=>p.team===t.id).map(p=>'<option value="player:'+p.id+'">'+p.id+'</option>').join('')+'</optgroup>').join(''):'');
    if(da.dataset.h!==h){da.innerHTML=h;da.dataset.h=h;}if(da.value!==ui.as)da.value=ui.as;}
  const login=!ME||entering;
  document.body.classList.toggle('login',login);if(login)document.body.classList.remove('inmk');document.body.classList.toggle('dev',!!DEVME&&!login);
  document.body.classList.toggle('screen',!login&&ME.role==='screen');
  document.body.dataset.role=login?'':ME.role;
  if(login){document.documentElement.dataset.theme='dark';setAmb('login');renderLogin();return;}
  const tabs=ME.role==='player'&&finalNow()?['player']:(ROLE_TABS[ME.role]||[]);
  if(!tabs.includes(ui.tab))ui.tab=tabs[0];
  document.documentElement.dataset.theme=themed()?themeFor():'light';
  document.body.classList.toggle('board',ui.tab==='board');
  document.body.classList.toggle('inmk',ME.role==='player'&&inMarketNow());
  document.body.classList.toggle('natscroll',ui.tab==='market'||(ui.tab==='player'&&ME&&ME.role==='player'));
  // Staff and player pages: the big screen's full-window background on computers, and on phones in dark mode;
  // flames and eyes only show where no panel covers them (data-free). Phones in light mode keep the header strip.
  const userTab=['dealer','npc','market','wuchang','ctrl','player'].includes(ui.tab),tone=themeFor(),full=userTab&&(innerWidth>=720||tone==='dark');
  document.body.classList.toggle('fullamb',full);
  setAmb(ui.tab==='board'||full?'screen':userTab?'page':null,tone);
  {const g=$('#amb ghost-ambience');if(g){
    if(full){g.removeAttribute('data-keep'); // the big screen's content area does not apply here
      const top=String(Math.round(Math.max($('#top').getBoundingClientRect().bottom,$('#tabs').hidden?0:$('#tabs').getBoundingClientRect().bottom)+6));
      if(g.dataset.top!==top)g.dataset.top=top;
      if(g.dataset.free!=='1')g.dataset.free='1';
      const more=ui.tab==='player'&&inMarketNow()?'1':'0';if(g.dataset.more!==more)g.dataset.more=more;}
    else{delete g.dataset.free;delete g.dataset.more;}}}
  const nav=$('#tabs');nav.hidden=tabs.length<2;
  morph(nav,tabs.map(v=>'<button role="tab" data-a="tab" data-v="'+v+'" aria-selected="'+(v===ui.tab)+'">'+TAB_NAME[v]+'</button>').join(''));
  $('#logo').innerHTML=ui.tab==='ctrl'?'<span class="scroll"></span>生死簿':'百鬼夜行';
  $('#who').textContent=(DEVME?'开发者 · ':'')+(ME.role==='player'?(DEVME?ME.pid:'玩家'):ME.role==='ctrl'?'总控':ME.label||ROLE_NAME[ME.role]);
  $('#logout').hidden=false;$('#conn').hidden=false;
  const run=CLOCK&&CLOCK.running;
  const cc=$('#clockctl');cc.hidden=ME.role!=='ctrl';cc.textContent=run?'暂停计时':'开始计时';
  const th=$('#theme');th.hidden=!themed()||(themeKey()==='player'&&inMarketNow());th.textContent=themeFor()==='dark'?'浅色':'深色';
  $('.clk').classList.toggle('paused',!run);$('#clkdot').className='gd'+(run?'':' off');
  if(!S){$('#view').innerHTML='<section class="pn muted">正在连接服务器…</section>';return;}
  R.use(S);S.t=nowT();$('#clk').textContent=fmt(S.t);
  morph($('#view'),ui.tab==='board'?viewBoard():ui.tab==='dealer'?viewDealer():ui.tab==='ctrl'?viewCtrl():ui.tab==='npc'?viewNpc():ui.tab==='market'?viewMarket():ui.tab==='wuchang'?viewWuchang():viewPlayer());
  fitStage();
  const had=!!$('#modal .dlg');morph($('#modal'),modalHtml());
  const mb=$('#modal button');if(mb&&!had)mb.focus();
  const dlg=$('#modal .dlg'),mk=dlg?dlg.dataset.n:null;
  if(mk&&mk!==lastModal){buzz(dlg.dataset.k==='out'?[150,70,150,70,260]:[90,60,90]);shakeEl(dlg,'jolt');}
  lastModal=mk;
}

// ---------- login ----------
let entering=false,errKey=0,lgerrT=0;
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
  syncBoxes(true);const g=$('#amb ghost-ambience');if(g)g.setAttribute('data-err',String(++errKey));document.body.classList.add('lgerr');clearTimeout(lgerrT);lgerrT=setTimeout(()=>document.body.classList.remove('lgerr'),2800);
  buzz([70,50,70]);shakeEl($('#lgcard'),'eshake');
}
function showSeal(){
  const c=$('#lgcard');if(!c)return;
  const chars=[...'验明正身·准入阴司'].map((ch,i)=>'<span style="animation-delay:'+(1.3+i*.12).toFixed(2)+'s">'+ch+'</span>').join('');
  c.insertAdjacentHTML('beforeend','<div class="okv"><div class="seal"><div class="sl"><img src="img/seal-zhun.png" alt="准" width="1200" height="960"></div></div>'
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
  if(DEVME){if(!ui.devOps){say(no('开发者模式现在是只读，点右上角「只读」切换成可操作'));return;}a={...a,as:{role:ME.role,pid:ME.pid}};}
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
    if(k==='pub.quest'){const q=QUESTS.find(x=>x.id===next);if(q)ui.pub.reward=q.reward;}
    if(k==='pub.to'){const t=next||'all';if(t.startsWith('team:')){ui.pub.target='team';ui.pub.team=t.slice(5);}else ui.pub.target=t;}}
  else if(a==='mktab'){ui.mkTab=v;}
  else if(a==='ncopen'){ui.ncOpen=true;setTimeout(()=>{const e=$('#ncn');if(e)e.focus();},0);}
  else if(a==='ncclose'){ui.ncOpen=false;}
  else if(a==='skill'){ui.skillOpen=ui.skillOpen===+v?null:+v;}
  else if(a==='pickm'||a==='unpick'){const k=b.dataset.k,cur=getp(k)||[];setp(k,cur.includes(v)?cur.filter(x=>x!==v):a==='pickm'?[...cur,v]:cur);}
  else if(a==='coinstep'){ui.coinAmt=String(coinAmt()+(+v));}
  else if(a==='copypin'){copyText(v).then(()=>say({ok:true,msg:'已复制 PIN '+v}),()=>say(no('复制失败，请手动选中 PIN')));}
  else if(a==='theme'){const r=themeKey(),nx=themeFor()==='dark'?'light':'dark';try{localStorage.setItem(THEME_KEY(r),nx);}catch{/* private mode */}}
  else if(a==='logout'){logout();return;}
  else if(a==='devops'){ui.devOps=!ui.devOps;say({ok:true,msg:ui.devOps?'开发者模式：可操作（以当前视角的身份）':'开发者模式：只读'});}
  else if(a==='clockctl'){send({type:'admin.clock',op:CLOCK&&CLOCK.running?'pause':'start'});}
  else if(a==='room'){ui.room=v;ui.pick='';ui.res={};ui.pickOut={};ui.settled=null;}
  else if(a==='res'){ui.res[b.dataset.t]=ui.res[b.dataset.t]===v?undefined:v;delete ui.pickOut[b.dataset.t];}
  else if(a==='enter'){send({type:'enter',tid:ui.pick,rid:ui.room},()=>{ui.pick='';ui.settled=null;ui.sub.dealer='settle';});}
  else if(a==='finish'){const rid=ui.room;send({type:'finish',rid,results:ui.res,picks:ui.pickOut},m=>{ui.res={};ui.pickOut={};ui.settled={rid,msg:m.msg};});}
  else if(a==='hook'){send({type:'hook',actor:ui.hookTeam,pid:ui.hookTarget,where:ui.hookWhere},()=>{ui.hookTarget='';ui.hookWhere='';});}
  else if(a==='publish'){const sq=ui.pub.kind==='sidequest';send({type:'publish',f:{...ui.pub,team:sq?ui.pub.sqTeam:ui.pub.team,mins:+ui.pub.mins||0,reward:+ui.pub.reward||0}},()=>{ui.pub.title='';ui.pub.body='';if(sq){ui.pub.quest='';ui.pub.sqTeam='';}});}
  else if(a==='checkin'){send({type:'checkin',pid:b.dataset.p,party:checkinParty()});}
  else if(a==='pickup'){send({type:'pickup',pid:b.dataset.p});}
  else if(a==='confirmin'){send({type:'confirm',pid:b.dataset.p,party:checkinParty()});}
  else if(a==='final'){send({type:'final',tid:v,on:!b.dataset.off});}
  else if(a==='assign'){send({type:'assign'});}
  else if(a==='ack'&&DEVME&&!ui.devOps){ui.devAck.add(b.dataset.n+':'+ME.pid);}
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
  else if(a==='revive'){ui.reviveAsk=b.dataset.p;}
  else if(a==='reviveno'){ui.reviveAsk=null;}
  else if(a==='reviveok'){const pid=b.dataset.p;ui.reviveAsk=null;send({type:'revive',pid});}
  else if(a==='tsk'){ui.tskOpen=ui.tskOpen===+v?null:+v;}
  else if(a==='mcoin'){const q=S.players.find(x=>x.id===b.dataset.p);if(q)send({type:'coin',pid:q.id,coins:Math.max(0,q.coins+(+v))});}
  else if(a==='hist'){ui.histOpen=!ui.histOpen;}
  else if(a==='buy'){send({type:'buy',kid:b.dataset.k,buyer:ui.buyer});}
  else if(a==='usecard'){send({type:'usecard',tid:b.dataset.t,sid:+b.dataset.k});}
  else if(a==='addcard'){send({type:'addcard',f:ui.nc},()=>{ui.nc={name:'',desc:'',price:'',stock:''};ui.ncOpen=false;});}
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.ncOpen){ui.ncOpen=false;render();}});
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
  else if(m==='hookWhere'){ui.hookWhere=v;}
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
