// 百鬼夜行 · browser app.
// The server owns the game state; this page signs in with a PIN, keeps a live WebSocket, renders the pages
// for the signed-in role, and sends actions. Rule helpers come from rules.js (same file the server runs).
import * as R from './rules.js';
const {size,ROOMS,SUITS,RATE,PER_TEAM,MIN_STAY,COIN_GOAL,FINAL_SCORE,FINAL_MSG,QUESTS,GATES,FEATURES,team,room,alive,inMarket,fmt,protectedLeft,esc,matches,targetLabel,
  isFirst,indiv,lab,cands,whyNotEnter,gapOf,teamStatus,teamOf,no,rstate,timeUp,staffSees,rsvLeft,rsvOf,whyNotReserve,finalMiss,scavInfo,scavWhy,SCAV_CAP,SCAV_N,SCAV_WIN,SCAV_PTS,GAME_HINT,RESET_HINT,RSV,COIN_START}=R;

let S=null, ME=null, CLOCK=null, OFFSET=0;
// Developer mode: DEVME is the real (read-only) sign-in, FULL the full state; ME/S are swapped to the chosen viewpoint.
let DEVME=null, FULL=null;
let LG=null; // 本地展示局退出登录时先存起来，让本地演示 PIN 能在同一页面里登录
function setMe(me){ME=me;DEVME=me&&me.role==='dev'?me:null;if(!DEVME&&!(me&&me.lpin)){if(LOCAL)LG={FULL,CLOCK,LPINS,LSNAPS};FULL=null;LOCAL=null;}}
let LOCAL=null; // 展示模式·本地：浏览器自己跑一局演示数据，不连服务器
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
let ui={ddOpen:null,don:{},tab:null,room:'4S',gatePick:'',finalAsk:null,pick:'',res:{},settled:null,gateWin:'',jg:{gate:'',title:'',body:'',mins:10},hookTeam:'',hookMode:'',hookAsk:null,hookTarget:'',hookWhere:'',rd:{quest:'',title:''},pickOut:{},doneSel:{},revokeAsk:null,
  coinTeam:'',coinAmt:'',buyer:'',mkTab:'buy',ncOpen:false,as:'ctrl',devOps:false,demoRows:null,devAck:new Set(),nc:{name:'',desc:'',price:'',stock:''},
  sub:{dealer:'info',npc:'task',market:'buy',ctrl:'status',player:'team'},
  pub:{kind:'鬼门开',reward:0,title:'',body:'',target:'all',team:'R',players:[],mins:10,to:'all',sqTeam:'',quest:'',gate:''},
  admin:{dur:'',pins:null,snaps:null,counts:{dealer:8,judge:1,mengpo:1,wuchang:1,ctrl:1,screen:1},ask:null,resetTxt:''}};
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
const cardG=r=>r.n+suitG(r.suit);
const p2=v=>String(v).padStart(2,'0');
const mm=x=>Math.floor(x/60)+':'+p2(x%60);
const mmss=x=>p2(Math.floor(x/60))+':'+p2(x%60);
// 总时长倒计时（只显示，倒数到 0 后不做任何自动处理）
const remStr=t=>{const r=Math.max(0,((S&&S.dur)||7200)-t);return Math.floor(r/3600)+':'+p2(Math.floor(r%3600/60))+':'+p2(r%60);};
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
const qTitle=id=>(QUESTS.find(q=>q.id===id)||{title:String(id).replace(/^x:/,'')}).title;
const kindOf=n=>n.kind==='通知'?['通知','alert']:n.kind==='公告'?['公告','']:n.sub==='side'?['Scavenger Hunt','secret']:n.sub==='custom'?['自定义任务','task']:['鬼门开','task'];
const modeOf=n=>n.kind==='任务'&&n.sub==='gate'?'先到先得':'';

// ---------- 大屏 ----------
function broadcast(){
  const out=[];
  for(const l of S.log){
    let m,x=null,c='';
    if((m=/^(\S+) 被(.)队通过「鬼门开」任务淘汰/.exec(l.text))){x=m[1]+' 被'+m[2]+'队通过「鬼门开」任务淘汰';c='hook';}
    else if((m=/^(\S+) 被(.)队勾魂/.exec(l.text))){x=m[1]+' 被勾魂';c='hook';}
    else if((m=/^(\S+) 被.队鬼门开奖励淘汰/.exec(l.text))){x=m[1]+' 被鬼门开奖励淘汰';c='hook';}
    else if((m=/^(\S+) 输了 (\S+) 被抽签淘汰/.exec(l.text))){x=m[1]+' 抽签淘汰';c='hook';}
    else if((m=/^(\S+) 喝下孟婆汤/.exec(l.text)))x=m[1]+' 买命回队';
    else if((m=/^(\S+) 赢下 (\S+)，\+(\d+) 冥币/.exec(l.text)))x=m[1]+'拿下 '+m[2]+'　+'+m[3];
    else if((m=/^判官记录 (\S+) 率先完成任务「(.+)」/.exec(l.text))){x=m[1]+'率先完成任务「'+m[2]+'」';c='hot';}
    if(x)out.push({t:l.t,x,c});
    if(out.length>=5)break;
  }
  return out;
}
// 房间状态：可预约 / 已预约（显示预约队伍）/ 游戏中 / 重置中；鬼门开期间暂停开放。游戏、重置的计时只是显示，不会自动结束。
const RST={open:['可预约','idle'],rsv:['已预约','rsv'],play:['游戏中','on'],reset:['重置中','rst']};
function roomState(rid){const x=S.rooms.find(y=>y.id===rid);return {x,st:rstate(x)};}
function roomCard(r,mt,ctl){
  const {x,st}=roomState(r.id),ts=x.teams,mine=!!mt&&(ts.includes(mt)||(st==='rsv'&&x.rt===mt)),paused=!!S.gp&&st==='open';
  let bt;
  if(st==='play')bt='<span class="on"><i class="gd"></i>'+(mine?'本队游戏中':'游戏中')+'</span><div class="vs">'+ts.map(tchip).join('')+'</div><span class="rtm">已 '+mmss(Math.max(0,S.t-x.at))+'</span>';
  else if(st==='rsv')bt='<span class="rs">已预约</span><div class="vs">'+tchip(x.rt)+'</div><span class="rtm">'+(mine?'请在 '+mmss(rsvLeft(x))+' 内到场':mmss(rsvLeft(x)))+'</span>';
  else if(st==='reset')bt='<span class="rs rst">重置中</span><span class="rtm">已 '+mmss(Math.max(0,S.t-x.at))+'</span>';
  else bt='<span class="idle">'+(paused?'暂停开放':'可预约')+'</span>';
  const done=mt&&team(mt).cleared.includes(r.id);
  // 队长的预约按钮直接占"可预约"那一行；现在不能预约时置灰，点一下才说明具体原因。已通关的房间显示「已通关」。
  let act='';
  if(mt&&st==='open'){
    if(done)bt='<span class="idle okk">✓ 已通关</span>';
    else if(ctl){const w=whyNotReserve(mt,r.id);bt=w?'<button class="btn-line rbook dim" data-a="rsvno" data-v="'+r.id+'" aria-disabled="true">预约</button>':'<button class="btn-line rbook fill" data-a="reserve" data-v="'+r.id+'">预约</button>';}}
  else if(ctl&&mt&&st==='rsv'&&x.rt===mt)act='<button class="btn-line rbook" data-a="cancelrsv">取消预约</button>';
  return '<div class="room s-'+st+(ts.length?' busy':'')+(mine?' mine':'')+(paused?' paused':'')+'"><div class="top"><div class="cd">'+cardG(r)+'</div>'
    +'<div class="rr"><span class="typ">'+(r.n===4?'简单':'困难')+'</span><span class="pt">+'+r.n*100+'</span></div></div>'
    +'<div class="bt">'+bt+act+'</div></div>';
}
function viewBoard(){
  const pl=ME&&ME.role==='player'?S.players.find(p=>p.id===ME.pid):null,pt=pl?pl.team:null,cap=!!pl&&team(pt).cap===pl.id;
  const list=[...S.teams].sort((a,b)=>b.score-a.score),max=Math.max(1,list[0].score);
  let rk=0,prev=null;
  const bars=list.map((t,i)=>{if(t.score!==prev){rk=i+1;prev=t.score;}
    return '<div class="bcol" style="'+tv(t.id)+'"><span class="v">'+t.score+'</span>'
      +'<div class="b" style="height:calc(var(--b0,56px) + '+(t.score/max).toFixed(3)+' * var(--b1,214px))" role="img" aria-label="'+t.name+' 第 '+rk+' 名，'+t.score+' 冥币">'+rk+'</div>'
      +'<div class="nm">'+tsq(t.id)+'<span>'+t.name+'</span>'+'</div><div class="al">存活 '+alive(t.id).length+'/'+size(t.id)+'</div>'
      +'<div class="su">'+SUITS.map(s=>'<span class="'+(t.cards.some(c=>c.includes(s))?'got ':'')+(isRed(s)?'sr':'')+'">'+s+'</span>').join('')+'</div></div>';}).join('');
  const bc=broadcast();
  const run=CLOCK&&CLOCK.running;
  return '<div class="stage-wrap"><div class="stage">'
    +'<div class="left"><div class="hd"><div class="ttl">百鬼夜行</div><div class="en">CORNELL CSSA 万圣夜</div></div>'
    +'<div class="clock"><span class="cap">'+(run?'剩余时间':'已暂停 · 剩余时间')+'</span><span class="ck mono'+(run?'':' paused')+'" id="sclk">'+remStr(S.t)+'</span>'
    +incense()+(S.gp?'<div class="gatebar"><b>鬼门开</b><span>各房间暂停预约与入场，已开始的可打完当前一局'+(S.gp.win?'；'+team(S.gp.win).name+'已率先完成':'')+'</span></div>':'')+'</div>'
    +'<div class="cast"><span class="cap" style="padding-bottom:8px">全场播报</span>'
    +(bc.length?bc.map(b=>'<div class="bc '+b.c+'"><span class="t">'+fmt(b.t)+'</span><span class="x">'+esc(b.x)+'</span></div>').join(''):'<div class="bc"><span class="x muted">暂无播报</span></div>')+'</div></div>'
    +'<div class="right"><div class="rank"><div class="rh"><b>队伍冥币排名</b></div><div class="bars">'+bars+'</div></div>'
    +'<div class="rgrid">'+ROOMS.map(r=>roomCard(r,pt,cap)).join('')+'</div></div>'
    +'</div></div>';
}
// Game progress as a burning incense stick: ash on the left, a glowing ember at "now", five watches of 30 min.
function incense(){
  const p=Math.min(1,Math.max(0,S.t/(S.dur||7200))),cur=Math.min(4,Math.floor(p*5));
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
  const r=room(ui.room),{x,st}=roomState(r.id),ts=x.teams;
  const rooms=mine&&mine.length===1?'':'<div class="sec on" style="gap:10px"><span class="lbl">'+(mine?'我负责的房间':'全部房间'+(ME.role==='ctrl'?'（总控视角）':''))+'</span><div class="rooms8">'+ROOMS.filter(y=>!mine||mine.includes(y.id)).map(y=>{const q=roomState(y.id).st;
    return '<button class="rbtn'+(y.id===ui.room?' on':'')+'" data-a="room" data-v="'+y.id+'" aria-pressed="'+(y.id===ui.room)+'"><span class="n">'+cardG(y)+'</span><span class="nm">'+y.name+'</span>'
      +'<span class="st'+(q==='open'?'':' busy')+'">'+(q==='open'?'':'● ')+RST[q][0]+'</span></button>';}).join('')+'</div></div>';
  const timer=st==='play'?'已 '+mmss(Math.max(0,S.t-x.at)):st==='reset'?'已 '+mmss(Math.max(0,S.t-x.at)):st==='rsv'?'预约剩余 '+mmss(rsvLeft(x)):'';
  const hero='<div class="hero"><div class="tile"><span class="tn">'+r.n+'</span><span class="ts '+(isRed(r.suit)?'sr':'')+'">'+r.suit+'</span></div>'
    +'<div class="info"><div class="meta"><span class="typ">'+TYPE[r.suit]+'</span><span class="typ">'+(r.n===4?'简单':'困难')+'</span><span class="coins">+'+r.n*100+' <small>冥币</small></span></div>'
    +'<div class="name"><b>'+r.name+'</b>'+(ui.settled&&ui.settled.rid===r.id&&st==='reset'?'<span class="stamp">已结算</span>':'')+'</div>'
    +'<span class="status'+(st==='open'?'':' busy')+'">'+(st==='open'?'':'<i class="gd"></i>')+RST[st][0]
      +(st==='rsv'?' · '+team(x.rt).name:st==='play'?' · '+ts.map(i=>team(i).name).join('、'):'')+(timer?'　'+timer:'')+'</span></div></div>';
  // 入场：预约的队伍到场后由 Dealer 确认放行；没预约也可以直接放行（空闲时）
  let entry;
  if(S.gp&&st==='open')entry='<div class="empty">鬼门开期间暂停入场，结束后恢复</div>';
  else if(st==='play')entry='<div class="empty">游戏进行中，结算后房间进入重置</div>';
  else if(st==='reset')entry='<div class="empty">重置中。重置好后，到「胜负结算」页点「重置完成」，房间才会重新开放预约</div>';
  else{
    const want=st==='rsv'?x.rt:ui.pick;
    if(st==='rsv'&&ui.pick!==x.rt)ui.pick=x.rt;
    if(ui.pick&&st==='open'&&whyNotEnter(ui.pick,r.id))ui.pick='';
    const list=st==='rsv'?S.teams.filter(t=>t.id===x.rt):S.teams;
    const btns=list.map(t=>{const w=whyNotEnter(t.id,r.id);
      return cb({cls:'big',k:'pick',v:t.id,on:want===t.id,off:!!w,c:w?'var(--line2)':TC[t.id][0],label:t.name,small:w||'存活 '+alive(t.id).length+'/'+size(t.id)});}).join('');
    const wn=want&&whyNotEnter(want,r.id);
    entry=(st==='rsv'?'<span class="small" style="font-weight:700;color:var(--accent)">'+team(x.rt).name+'已预约，剩 '+mmss(rsvLeft(x))+'。人到齐后点下面确认放行。</span>':'')
      +'<div class="chips c2">'+btns+'</div><button class="btn-main" data-a="enter"'+(want&&!wn?'':' disabled')+'>'+(want?(wn?team(want).name+'：'+wn:(st==='rsv'?'确认 '+team(want).name+' 已到场，放行入场':'放行 '+team(want).name+' 入场（未预约）')):'先选择可入场的队伍')+'</button>';
  }
  const info='<div class="pn" style="gap:14px"><h2 class="sh">规则与入场</h2><div class="rule">'+r.rule+'</div>'
    +'<div class="lot hot">失败 0 分并淘汰 1 人（现场抽签，结算时在这里选出是谁）；失败后可再挑战，同一间房每队只能成功一次</div>'
    +'<div class="need"><b>放行入场</b><span class="small">队伍须满员：<span class="mono" style="color:var(--ink)">'+PER_TEAM+'</span> 人全部在场</span></div>'+entry+'</div>';
  const done=ui.settled&&ui.settled.rid===r.id&&st==='reset';
  const lostTs=ts.filter(t=>ui.res[t]==='lose'),needPick=lostTs.filter(t=>alive(t).length&&!alive(t).some(p=>p.id===ui.pickOut[t]));
  const pending=ts.filter(t=>!ui.res[t]).length,ready=ts.length===1&&!pending&&!needPick.length;
  const hint=st==='reset'?'重置中':!ts.length?'等待入场':pending?'还差 1 队未选':needPick.length?'还差选出被淘汰的人':'胜负已选好';
  const rows=ts.map(tid=>{const t=team(tid),v=ui.res[tid]||'';
    return '<div class="rt"><div class="hd">'+tsq(tid,42)+'<div><b>'+t.name+'</b><span class="small">存活 <span class="mono" style="color:var(--ink)">'+alive(tid).length+'</span> 人</span></div></div>'
      +(v?'<span class="stamp">'+(v==='win'?'胜':'负')+'</span>':'')
      +'<div class="wl" role="group" aria-label="'+t.name+'结果"><button class="w" data-a="res" data-t="'+tid+'" data-v="win" aria-pressed="'+(v==='win')+'">赢</button>'
      +'<button class="l" data-a="res" data-t="'+tid+'" data-v="lose" aria-pressed="'+(v==='lose')+'">输</button></div>'+(v==='lose'?outPick(tid):'')+'</div>';}).join('');
  const W=ts.filter(t=>ui.res[t]==='win').map(t=>team(t).name),L=ts.filter(t=>ui.res[t]==='lose').map(t=>team(t).name);
  const summary=done?esc(ui.settled.msg):!ts.length?'':!ready?(needPick.length&&!pending?'为输的队选出被淘汰的人':'为本队选赢或输')
    :(W.length?W.join('、')+'赢：+'+r.n*100+' 冥币和 '+r.card:'无人获胜')+(L.length?'；'+L.join('、')+'输（0 分），淘汰 '+lostTs.map(t=>ui.pickOut[t]||'无').join('、'):'');
  const resetBtn=st==='reset'?'<button class="btn-main glow" data-a="resetdone" style="min-height:60px;font-size:19px;letter-spacing:.1em">重置完成，恢复可预约</button><span class="small center">'+(done?esc(ui.settled.msg)+'。':'')+'点了之后，各队才能再预约这间房</span>':'';
  const settle='<div class="pn" style="gap:14px"><div class="shrow"><h2 class="sh">房间内队伍</h2><span class="hint" style="font-weight:700;color:'+(ready?'var(--accent)':pending?'var(--warn)':'var(--sub)')+'">'+hint+'</span></div>'
    +(rows?'<div class="rteams">'+rows+'</div>':st==='reset'?'':'<div class="empty">暂无队伍</div>')
    +(st==='reset'?resetBtn:'<span class="sum'+(ready?' ready':'')+'">'+summary+'</span>'
    +'<button class="btn-main'+(ready?' glow':'')+'" data-a="finish"'+(ready?'':' disabled')+' style="min-height:60px;font-size:19px;letter-spacing:.14em">结束并结算</button>'
    +'<span class="small center">结算后立即发放，房间随即进入重置，请先核对</span>')+'</div>';
  const gateWarn=dealerBusy()?'<div class="gatebar"><b>鬼门开：请尽快结束游戏</b><span>各房间已暂停预约与入场，请让正在进行的这一局尽快结算</span></div>':'';
  return '<div class="page tabbed">'+gateWarn+rooms+hero+'<div class="cols-dealer">'+sec('dealer','info',info)+sec('dealer','settle',settle)+'</div>'
    +sub('dealer',[['info','规则与入场'],['settle','胜负结算']])+'</div>';
}

// ---------- 判官 ----------
// 鬼门开：进行中时各房间暂停；率先完成的队伍缺人 → 免费复活一名队友，满员 → 指定别队一名存活队员淘汰（不加分）。
function gatePanel(){
  const g=S.gp;
  if(!g){ui.gateEndAsk=false;ui.gateWin='';
    const j=ui.jg,gq=GATES.find(x=>x.id===j.gate),cus=j.gate==='custom',okp=gq||(cus&&j.title.trim());
    return '<div class="pn gatep"><div class="shrow"><h3>鬼门开</h3><span class="small">当前没有鬼门开</span></div>'
      +'<div class="fld"><span>题库</span>'+dd('jg.gate',gq?gq.title:cus?'自定义':'','选择鬼门开',null,[...GATES.map(x=>({v:x.id,label:esc(x.title)})),{v:'custom',label:'自定义'}])+'</div>'
      +(gq?'<div class="lot">'+esc(gq.body)+'</div>':'')
      +(cus?'<label class="fld"><span>标题</span><input class="in" id="jgt" data-m="jg.title" value="'+esc(j.title)+'" placeholder="鬼门开题目"></label><label class="fld"><span>内容</span><textarea class="in" id="jgb" data-m="jg.body" rows="3">'+esc(j.body)+'</textarea></label>':'')
      +'<label class="fld"><span>限时（分钟，0 = 不限时）</span><input class="in mono" id="jgm" data-m="jg.mins" value="'+esc(j.mins)+'" inputmode="numeric"></label>'
      +'<button class="btn-main'+(okp?' glow':'')+'" data-a="jgpub"'+(okp?'':' disabled')+' style="min-height:52px">'+(okp?'发布鬼门开':'先选择鬼门开')+'</button></div>';}
  const gn=S.notices.find(x=>x.id===g.nid),live=gn&&gn.due&&gn.due>S.t;
  const end=ui.gateEndAsk?'<button class="btn-line fillred" data-a="gateend" style="min-height:48px;font-weight:900">确认结束鬼门开</button><button class="btn-line" data-a="gateendno" style="min-height:48px">取消</button><span class="small">结束后各房间立即恢复预约与入场</span>'
    :'<button class="btn-line" data-a="gateendask">'+(g.win?'结束鬼门开（房间恢复开放）':'无人获胜，结束鬼门开')+'</button>';
  const head='<div class="shrow"><h3>鬼门开进行中</h3>'+(gn&&gn.due?'<span class="tm'+(live?' live':'')+'">'+(live?'<i class="gd r"></i>':'')+countdown(gn)+'</span>':'<span class="small">各房间暂停预约与入场</span>')+'</div>'+(gn?'<div class="ttitle"><b>'+esc(gn.title)+'</b></div>':'');
  if(!g.win){const opts=S.teams.map(t=>({v:t.id,label:t.name,c:TC[t.id][0]}));
    return '<div class="pn gatep">'+head+'<span class="lbl">获胜队伍</span>'+dd('gateWin',ui.gateWin&&team(ui.gateWin).name,'选择获胜队伍',ui.gateWin&&TC[ui.gateWin][0],opts)
      +'<button class="btn-main'+(ui.gateWin?' glow':'')+'" data-a="gatewin"'+(ui.gateWin?'':' disabled')+' style="min-height:52px">'+(ui.gateWin?'确认 '+team(ui.gateWin).name+' 获胜':'先选择获胜队伍')+'</button><div class="btns">'+end+'</div></div>';}
  const wt=team(g.win),short=alive(wt.id).length<size(wt.id);
  if(ui.gatePick){const p=S.players.find(x=>x.id===ui.gatePick);if(!p||(short?(p.team!==wt.id||p.st==='alive'):(p.team===wt.id||p.st!=='alive')))ui.gatePick='';}
  let pick;
  if(short){const l=S.players.filter(p=>p.team===wt.id&&p.st!=='alive');
    pick='<span class="lbl">'+wt.name+'缺人：免费复活一名队友</span><div class="chips ids">'+l.map(p=>cb({cls:'id',k:'gatePick',v:p.id,on:ui.gatePick===p.id,label:p.id,mark:false})).join('')+'</div>';}
  else{const opts=S.teams.filter(t=>t.id!==wt.id).flatMap(t=>[{group:t.name},...S.players.filter(p=>p.team===t.id).map(p=>({v:p.id,label:p.id,c:TC[t.id][0],off:p.st!=='alive'||t.final,note:p.st!=='alive'?'已淘汰':t.final?'终极中':''}))]);
    pick='<span class="lbl">'+wt.name+'满员：指定别队一名存活队员淘汰</span>'+dd('gatePick',ui.gatePick,'选择被淘汰的队员',null,opts);}
  return '<div class="pn gatep">'+head+'<div class="shrow"><h3>'+wt.name+' 获胜</h3><span class="small">奖励不加分</span></div>'+pick
    +'<button class="btn-main'+(ui.gatePick?' glow':'')+'" data-a="gatereward"'+(ui.gatePick?'':' disabled')+' style="min-height:52px">'+(ui.gatePick?(short?'免费复活 ':'淘汰 ')+ui.gatePick+'，并结束鬼门开':'先选择队员')+'</button><div class="btns">'+end+'</div></div>';
}
// Scavenger 额度：每队全场最多 600 分，任意滚动 10 分钟最多 2 题，同一题不重复兑换
function scavPanel(){
  const rd=ui.rd,rq=QUESTS.find(x=>x.id===rd.quest),rcus=rd.quest==='custom',ti=rd.title.trim();
  const key=rq?rq.id:rcus&&ti?'x:'+ti.slice(0,20):null;
  const head='<div class="fld"><span>题目（选好后，点各队右边的「兑换」）</span>'+dd('rd.quest',rq?rq.title:rcus?'自定义':'','选择题目',null,[...QUESTS.map(x=>({v:x.id,label:esc(x.title)})),{v:'custom',label:'自定义'}])+'</div>'
    +(rcus?'<label class="fld"><span>自定义题目</span><input class="in" id="rdt" data-m="rd.title" value="'+esc(rd.title)+'" placeholder="题目名称"></label>':'');
  const rows=S.teams.map(t=>{const i=scavInfo(t.id),why=scavWhy(t.id,key),ok=!!key&&!why;
    const st=why?'<span style="color:var(--red)">'+esc(why)+'</span>':'<span style="color:var(--accent)">可兑换</span>';
    return '<div class="li"><div class="grow"><span class="x svx">'+tsq(t.id,22)+'<b>'+t.name+'</b><span class="mono">'+i.used+'/'+SCAV_CAP+'</span><span class="mono">10 分钟 '+i.n+'/'+SCAV_N+'</span></span><span class="small">'+st+'</span></div>'
      +'<button class="btn-line'+(ok?' fill':'')+'" data-a="scavredeem" data-t="'+t.id+'"'+(ok?'':' disabled')+'>兑换 +'+SCAV_PTS+'</button></div>';}).join('');
  return '<div class="pn" style="gap:12px">'+head+'<div style="display:flex;flex-direction:column">'+rows+'</div></div>';
}

function hookLog(){
  const out=[],byName=n=>(S.teams.find(t=>t.name===n+'队')||{}).id;
  for(const l of S.log){let m;
    if((m=/^(\S+) 被(.)队(?:勾魂|通过「鬼门开」任务淘汰)/.exec(l.text)))out.push({t:l.t,pid:m[1],by:byName(m[2]),kind:'淘汰'});
    else if((m=/^(\S+) 因(?:勾魂令|鬼门开奖励)免费复活，回到(.)队/.exec(l.text)))out.push({t:l.t,pid:m[1],by:byName(m[2]),kind:'复活'});}
  return out;
}
// 勾魂令：取得勾魂令的队伍 = 左边「任务判定」里判定成功的队伍（选别的队要二次确认）；效果按本队人数建议（满员淘汰 / 缺人复活），也可强行改。
function hookWon(tid){return S.notices.some(n=>n.kind==='任务'&&n.sub!=='side'&&Object.keys(n.done).some(c=>teamOf(c)===tid));}
function hookSug(tid){return tid&&alive(tid).length<size(tid)?'revive':'kill';}
function hookDlg(){
  const k=ui.hookAsk;if(!k)return '';
  const t=team(k.kind==='team'?k.v:ui.hookTeam);if(!t)return '';
  let msg;
  if(k.kind==='team')msg=t.name+'还没有在左边「任务判定」里判定成功，却要使用勾魂令。';
  else{const n=alive(t.id).length,z=size(t.id),sug=hookSug(t.id);
    msg=t.name+(n<z?'未满员（存活 '+n+'/'+z+'），建议「复活」一名队员':'已满员（存活 '+n+'/'+z+'），建议「淘汰」别队一名队员')+'，你要强行改成「'+(k.v==='kill'?'淘汰':'复活')+'」。';}
  return '<div class="sheet"><div class="sheet-bg" data-a="hookno"></div><div class="sheet-card pn" role="dialog" aria-modal="true" aria-labelledby="hdt"><h3 id="hdt">'+(k.kind==='team'?'这支队伍没有判定成功':'与建议的效果不同')+'</h3>'
    +'<div class="lot hot">'+esc(msg)+'</div><span class="small">你仍然可以继续。</span>'
    +'<div class="btns two2"><button class="btn-main" data-a="hookok">仍然选择</button><button class="btn-line" data-a="hookno">取消</button></div></div></div>';
}
function viewNpc(){
  const tasks=S.notices.filter(n=>n.kind==='任务'&&n.sub!=='side'&&n.sub!=='gate').slice(0,6);
  const cards=tasks.map(n=>{
    const [kl,kc]=kindOf(n),w=Object.keys(n.done)[0],closed=isFirst(n)&&!!w,ind=indiv(n),cur=ui.doneSel[n.id]||'';
    const rest=cands(n).filter(c=>!n.done[c]);
    if(cur&&!rest.includes(cur))delete ui.doneSel[n.id];
    const live=n.due&&n.due>S.t;
    let body;
    if(closed)body='<div class="lot">'+lab(w)+' 已率先完成</div>';
    else if(!rest.length)body='<div class="lot">所有'+(ind?'队员':'队伍')+'都已完成</div>';
    else body='<span class="lbl">完成'+(ind?'队员':'队伍')+'</span><div class="chips '+(ind?'ids':'')+'">'
      +rest.map(c=>{const w=n.sub==='side'?scavWhy(c,n.q):null;return cb({cls:ind?'id':'',k:'doneSel.'+n.id,v:c,on:ui.doneSel[n.id]===c,off:!!w,title:w||'',c:ind?null:TC[c][0],label:lab(c),mark:!ind,small:w?'不可兑换':null});}).join('')+'</div>'+(n.sub==='side'?'<span class="small">灰色的队伍现在不能兑换（10 分钟内已满 2 题 / 已达上限 / 这题已兑换），原因见下方「Scavenger 额度」</span>':'')
      +'<button class="btn-main" data-a="done" data-n="'+n.id+'"'+(ui.doneSel[n.id]?'':' disabled')+' style="min-height:52px">'+(ui.doneSel[n.id]?'确认 '+lab(ui.doneSel[n.id])+' 完成':'先选择完成者')+'</button>';
    return '<div class="pn"><div class="thead"><span class="kb '+kc+'">'+kl+'</span><span class="small">'+modeOf(n)+'</span>'+(n.target!=='all'?'<span class="typ">'+esc(targetLabel(n))+'</span>':'')
      +'<span class="tm'+(live?' live':'')+'">'+(live?'<i class="gd r"></i>':'')+(n.due?countdown(n):'不限时')+'</span></div>'
      +'<div class="ttitle"><b>'+esc(n.title)+'</b>'+(n.reward?'<span class="rw">+'+n.reward+'</span>':'')+'</div>'+body+'</div>';}).join('');
  const recs=S.notices.filter(n=>n.kind==='任务').flatMap(n=>Object.entries(n.done).map(([cid,d])=>({n,cid,d}))).sort((a,b)=>b.d.t-a.d.t);
  const records='<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">已完成记录</h3>'+(recs.length?recs.map(({n,cid,d})=>
    '<div class="li"><div class="grow"><span class="t">'+fmt(d.t)+(n.due&&d.t>n.due?' 超时':'')+'</span><span class="x">'+lab(cid)+' 完成「'+esc(n.title)+'」'+(n.sub==='gate'&&n.gr&&n.gr.includes('，')?'，'+esc(n.gr.split('，').slice(1).join('，').replace('免费复活','复活')):'')+(d.pts?' <span class="mono">+'+d.pts+'</span>':'')+'</span></div>'
    +'<button class="btn-line" data-a="undone" data-n="'+n.id+'" data-t="'+cid+'">撤销</button></div>').join(''):'<div class="li small">暂无记录</div>')+'</div>';
  const task=gatePanel()+(cards||'<div class="pn"><span class="muted">还没有发布任务。总控在生死簿「发布」里发布。</span></div>')+records;
  // 勾魂令：队伍 → 效果（建议 + 可强行改）→ 队员
  const ht=ui.hookTeam&&team(ui.hookTeam),sug=hookSug(ui.hookTeam),mode=ui.hookMode||sug,kill=mode==='kill';
  if(ui.hookTarget){const p=S.players.find(x=>x.id===ui.hookTarget);
    if(!p||(kill?(p.team===ui.hookTeam||p.st!=='alive'||protectedLeft(p)>0):(p.team!==ui.hookTeam||p.st==='alive')))ui.hookTarget='';}
  const tgt=ui.hookTarget&&S.players.find(x=>x.id===ui.hookTarget);
  const won=S.teams.filter(t=>hookWon(t.id)),notWon=S.teams.filter(t=>!hookWon(t.id));
  const tOpts=[...(won.length?[{group:'判定成功'},...won.map(t=>({v:t.id,label:t.name,c:TC[t.id][0]}))]:[]),
    {group:'未判定成功（强行选择会提示）'},...notWon.map(t=>({v:t.id,label:t.name,c:TC[t.id][0]}))];
  const stName={out:'原地待接',picked:'已被接到',market:'在鬼市'};
  const opts=kill?S.teams.filter(t=>t.id!==ui.hookTeam).flatMap(t=>{
    return [{group:t.name},...S.players.filter(p=>p.team===t.id).map(p=>{const l=protectedLeft(p),gone=p.st!=='alive';
      return {v:p.id,label:p.id,c:TC[t.id][0],off:gone||l>0,note:gone?'已淘汰':l>0?'保护 '+Math.ceil(l/60)+' 分':''};})];})
    :S.players.filter(p=>p.team===ui.hookTeam&&p.st!=='alive').map(p=>({v:p.id,label:p.id,c:TC[ui.hookTeam][0],note:stName[p.st]||''}));
  const ready=ui.hookTeam&&tgt;
  const modeUi=ht?'<div class="fld"><span>效果</span><div class="seg2">'+[['kill','淘汰别队一名队员'],['revive','复活本队一名队员']].map(([k,l])=>'<button class="sbtn'+(mode===k?' on':'')+'" data-a="hookmode" data-v="'+k+'" aria-pressed="'+(mode===k)+'">'+l+(sug===k?'（建议）':'')+'</button>').join('')+'</div>'
      +'<span class="small">'+esc(ht.name)+'存活 '+alive(ht.id).length+'/'+size(ht.id)+(sug==='kill'?'，已满员 → 建议淘汰':'，未满员 → 建议复活')+(ui.hookMode&&ui.hookMode!==sug?'　<b style="color:var(--red)">（已强行改成'+(ui.hookMode==='kill'?'淘汰':'复活')+'）</b>':'')+'</span></div>'
    :'<span class="small">选好队伍后，会按本队存活人数建议效果（满员淘汰，未满员复活）。</span>';
  const hl=hookLog();
  const hook='<div class="pn hook"><div class="fld"><span>取得勾魂令的队伍</span>'+dd('hookTeam',ht&&ht.name,'选择队伍',ht&&TC[ui.hookTeam][0],tOpts)+'</div>'
    +modeUi
    +'<div class="fld"><span>'+(kill?'被点名的队员':'要复活的队友')+'</span>'+dd('hookTarget',tgt&&tgt.id,kill?'选择别队队员':'选择本队未存活的队友',tgt&&TC[tgt.team][0],opts)+'</div>'
    +(kill?'<label class="fld"><span>位置（在房间内可不填）</span><input class="in" id="hw" data-m="hookWhere" value="'+esc(ui.hookWhere)+'" placeholder="例如：二楼走廊"></label>':'')
    +'<button class="btn-main'+(kill?' red':'')+'" data-a="hook"'+(ready?'':' disabled')+' style="min-height:56px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:18px">'
    +'<span style="width:34px;height:34px;border:2px solid currentColor;border-radius:6px;display:grid;place-items:center;font-family:var(--brush);font-size:24px;line-height:1;transform:rotate(-8deg);font-weight:400">勾</span>'
    +(ready?ht.name+(kill?' 勾魂 ':' 复活 ')+tgt.id:'先选队伍和队员')+'</button></div>'
    +'<div class="pn"><div class="shrow"><h3>勾魂记录</h3><span class="small">'+(hl.length?'共 '+hl.length+' 条':'暂无')+'</span></div>'
    +hl.slice(0,10).map(h=>'<div class="hrow"><span class="minis">勾</span><span class="t">'+fmt(h.t)+'</span><span class="typ">'+h.kind+'</span><span>'+(h.by?team(h.by).name+' ':'')+(h.kind==='复活'?'复活 ':'勾魂 ')+h.pid+'</span></div>').join('')+'</div>';
  return '<div class="page tabbed"><div class="cols3">'+sec('npc','task','<h2 class="sh">任务判定</h2>'+task)+sec('npc','scav','<h2 class="sh">Scavenger Hunt 兑换</h2>'+scavPanel())+sec('npc','hook','<h2 class="sh">勾魂令</h2>'+hook)+'</div>'
    +sub('npc',[['task','任务判定'],['scav','Scavenger'],['hook','勾魂令']])+hookDlg()+'</div>';
}

// ---------- 鬼市 ----------
// 入鬼市登记：黑白无常或孟婆谁点都行，另一方确认。
const checkinParty=()=>ME.role==='ctrl'?(ui.tab==='wuchang'?'wuchang':'mengpo'):ME.role;
const canConfirm=p=>!!p.chk&&!p.chk.ok&&(p.chk.by==='mengpo'?checkinParty()==='wuchang':['wuchang','ctrl'].includes(p.chk.by)&&checkinParty()==='mengpo');
const chkBit=p=>!p.chk?'':p.chk.ok?'<span class="chk ok">登记已确认</span>':canConfirm(p)?'<button class="btn-line fill chkbtn" data-a="confirmin" data-p="'+p.id+'">确认入鬼市</button>':'<span class="chk wait">待'+(p.chk.by==='mengpo'?'黑白无常':'孟婆')+'确认</span>';
function inboundPanel(){
  const wait=S.players.filter(p=>p.st==='out'||p.st==='picked'||(p.st==='market'&&p.chk&&!p.chk.ok)).sort((a,b)=>a.outAt-b.outAt);
  const rows=wait.map(p=>'<div class="mrow'+(p.st==='picked'?' ok':'')+'"><div class="l1"><span class="id">'+p.id+'</span>'+tchip(p.team)
    +'<span class="stay">'+(p.chk&&!p.chk.ok?(p.chk.by==='mengpo'?'<b>孟婆已登记，等黑白无常确认</b>':'<b>黑白无常已送来，等孟婆确认</b>'):p.st==='picked'?'<b>已被黑白无常接到</b>':'等黑白无常来接')+'</span></div>'
    +'<div class="l1"><span class="stay">淘汰位置：<b>'+esc(p.at||'未记录')+'</b>　已等 <b class="mono">'+mm(S.t-(p.outAt||S.t))+'</b></span></div>'
    +(p.chk&&!p.chk.ok?chkBit(p):'<button class="btn-main'+(p.st==='picked'?' glow':'')+'" data-a="checkin" data-p="'+p.id+'">登记入鬼市</button>')+'</div>').join('');
  return '<section class="mcol"><div class="shrow"><h2 class="sh">待入鬼市</h2><span class="hint">另一方确认后进入鬼市，领 '+COIN_START+' 冥币</span></div>'
    +(rows?'<div class="mlist">'+rows+'</div>':'<div class="empty">现在没有等着入鬼市的人。</div>')+'</section>';
}
function viewMarket(){
  const mk=S.players.filter(p=>p.st==='market'&&(!p.chk||p.chk.ok)).sort((a,b)=>a.inAt-b.inAt);
  // Left (≈60%): one compact row per person in the market.
  if(ui.reviveAsk){const q=S.players.find(x=>x.id===ui.reviveAsk);if(!q||q.st!=='market'||q.coins+q.bail<COIN_GOAL)ui.reviveAsk=null;}
  const rows=mk.map(p=>{const stay=S.t-p.inAt,tot=p.coins+p.bail,cOk=tot>=COIN_GOAL,ok=cOk,asking=ui.reviveAsk===p.id;
    return '<div class="mrow'+(ok?' ok':'')+(asking?' asking':'')+'"><div class="l1"><span class="id">'+p.id+'</span>'+tchip(p.team)
      +'<span class="stay">已停留 <b class="mono">'+mm(stay)+'</b></span>'
      +chkBit(p)+'</div>'
      +'<div class="l2"><label class="kv"><span class="k">本人冥币</span><span class="coin-in"><input class="in mono" id="c-'+p.id+'" data-m="coin" data-p="'+p.id+'" value="'+p.coins+'" inputmode="numeric" aria-label="'+p.id+' 本人冥币"><span class="cstep"><button type="button" data-a="mcoin" data-p="'+p.id+'" data-v="100" aria-label="增加 100">▲</button><button type="button" data-a="mcoin" data-p="'+p.id+'" data-v="-100" aria-label="减少 100">▼</button></span></span></label>'
      +'<div class="kv"><span class="k">队友助力</span><span class="v">+'+p.bail+'</span></div>'
      +'<div class="kv"><span class="k">合计</span><span class="v'+(cOk?' ok':'')+'" id="tot-'+p.id+'">'+tot+' / '+COIN_GOAL+'</span></div>'
      +(asking?'<div class="rvask"><button class="btn-main glow" data-a="reviveok" data-p="'+p.id+'">确认回队</button><button class="btn-line" data-a="reviveno">取消</button></div>'
        :'<button class="btn-main'+(ok?' glow':'')+'" data-a="revive" data-p="'+p.id+'"'+(ok?'':' disabled')+'>'+(ok?'买命回队':'差 '+(COIN_GOAL-tot))+'</button>')+'</div></div>';}).join('');
  const left='<section class="mcol"><div class="shrow"><h2 class="sh">孟婆买命</h2><span class="hint">凑够 '+COIN_GOAL+' 即可回队；回队扣 '+COIN_GOAL+'，多出的最多 '+R.CARRY_MAX+' 存回队伍，凑够后不能再刷分</span></div>'
    +(rows?'<div class="mlist">'+rows+'</div>':'<div class="empty">鬼市现在没有人。</div>')+'</section>';
  return lanternsHtml()+'<div class="page mkt">'+left+(FEATURES.cards?cardsPanel(mk):inboundPanel())+'</div>';
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
  const wait=S.players.filter(p=>p.st==='out'&&!p.chk).sort((a,b)=>a.outAt-b.outAt);
  const go=S.players.filter(p=>p.st==='picked'||(p.chk&&!p.chk.ok)).sort((a,b)=>(a.outAt||0)-(b.outAt||0));
  const left='<section class="mcol"><div class="shrow"><h2 class="sh">待接的人</h2><span class="hint">谁在哪里被淘汰了；接到后点「接到了」</span></div>'
    +(wait.length?'<div class="mlist">'+wait.map(p=>'<div class="mrow">'+meta(p)+'<button class="btn-main glow" data-a="pickup" data-p="'+p.id+'">接到了</button></div>').join('')+'</div>':'<div class="empty">现在没有人需要接。</div>')+'</section>';
  const right='<section class="mcol"><div class="shrow"><h2 class="sh">送入鬼市 / 确认</h2><span class="hint">已接到的人送去鬼市；孟婆已登记的人在这里确认</span></div>'
    +(go.length?'<div class="mlist">'+go.map(p=>'<div class="mrow ok">'+meta(p)+(p.chk&&!p.chk.ok?chkBit(p):'<button class="btn-main glow" data-a="checkin" data-p="'+p.id+'">送入鬼市</button>')+'</div>').join('')+'</div>':'<div class="empty">没有需要送入或确认的人。</div>')+'</section>';
  return '<div class="page mkt eq wuchang-layout">'+left+'<div class="wc-mask" aria-hidden="true"><div class="wc-in"><img src="img/mask-tongue.webp" alt=""></div></div>'+right+'</div>';
}

// ---------- 生死簿 ----------
// 一队里待接 / 已接到 / 在鬼市的人数
function downTxt(tid){const c={out:0,picked:0,market:0};S.players.forEach(p=>{if(p.team===tid&&c[p.st]!=null)c[p.st]++;});
  const b=[];if(c.out)b.push('待接 '+c.out);if(c.picked)b.push('已接到 '+c.picked);if(c.market)b.push('鬼市 '+c.market);
  return b.length?'<span class="small" style="color:var(--red);font-weight:700">'+b.join('　')+'</span>':'<span class="small">全员在场</span>';}
function downPanel(){
  const l=S.players.filter(p=>p.st!=='alive').sort((a,b)=>(a.outAt||0)-(b.outAt||0)),nm={out:'等黑白无常',picked:'已接到',market:'在鬼市'};
  return '<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">淘汰与鬼市状态</h3>'+(l.length?l.map(p=>'<div class="li"><div class="grow"><span class="t">'+fmt(p.outAt||0)+'</span>'
    +'<span class="x">'+p.id+'　'+(p.chk&&!p.chk.ok?'待入鬼市':nm[p.st])+(p.at?'　@'+esc(p.at):'')+(p.chk?'　'+(p.chk.ok?'登记已确认':'登记待确认'):'')+'</span></div></div>').join(''):'<div class="li small">现在没有人被淘汰。</div>')+'</div>';
}
function demoPanel(){
  if(!DEVME||DEVME.demo)return '';
  if(!ui.demoRows)ui.demoRows=(DEVME.demoCfg||[]).map(c=>({...c,old:c.pin}));
  const rows=ui.demoRows;
  const one=(d,i)=>{d.write=d.write===true||d.write==='true';
    const c=(DEVME.demoCfg||[]).find(x=>x.pin===d.old)||{},ok=/^\d{6}$/.test(d.pin),dirty=!d.old||d.pin!==c.pin||d.mode!==c.mode||d.write!==c.write,k='demoRows.'+i;
    return '<div class="pn" style="gap:10px"><div class="btns"><input class="in mono" data-m="demoRow.pin" data-i="'+i+'" value="'+esc(d.pin)+'" inputmode="numeric" maxlength="6" placeholder="6 位数字" style="max-width:160px"><button class="btn-line" data-a="demo-rand" data-i="'+i+'">随机</button>'
      +(d.old?'<button class="btn-line" data-a="demo-copy" data-i="'+i+'">复制登录链接</button>':'')+'<button class="btn-line" data-a="demo-del" data-i="'+i+'">删除</button></div>'
      +'<div class="chips c2" style="grid-template-columns:repeat(3,minmax(0,1fr))">'+cb({k:k+'.mode',v:'server',on:d.mode==='server',label:'连接服务器',small:'看的是真实游戏',t:false})
      +cb({k:k+'.mode',v:'shared',on:d.mode==='shared',label:'共享演示局',small:'同一 PIN 的人看同一场演示',t:false})+cb({k:k+'.mode',v:'local',on:d.mode==='local',label:'本地',small:'各自一局，互不影响',t:false})+'</div>'
      +'<div class="chips c2">'+cb({k:k+'.write',v:false,on:!d.write,label:'只读',t:false})+cb({k:k+'.write',v:true,on:d.write,label:'可修改',small:d.mode==='server'?'会改动真实游戏':d.mode==='shared'?'改的是这个 PIN 的共享演示局':'',t:false})+'</div>'
      +'<div class="btns"><button class="btn-main" data-a="demo-save" data-i="'+i+'"'+(ok&&dirty?'':' disabled')+'>'+(d.old?'保存':'创建')+'</button>'+(d.old?'<span class="small">保存后正在用这个 PIN 的人需要重新登录</span>':'')+'</div></div>';};
  return '<div class="pn" style="margin-top:16px"><div class="shrow"><h3>展示模式 PIN</h3><span class="small">开发者专用；可建多个，每个 PIN 各自选模式和权限，发给不同的人</span></div>'
    +(rows.length?rows.map(one).join(''):'<span class="small">还没有展示 PIN。</span>')
    +'<div class="btns"><button class="btn-line acc" data-a="demo-add">+ 新增展示 PIN</button></div></div>';
}
// ---- 统计（开发者专用，只对真 DEV_PIN 显示；数据在服务器 stats 键里，不进游戏数据）----
const SROLES=['player','dealer','judge','mengpo','wuchang','ctrl','screen','dev'],SRN={...ROLE_NAME,dev:'开发者'},SPAL=['#3d77c9','#d0453a','#3a9a6c','#9466b8','#e08a3c','#2a9d9a','#e2b33a','#8a8a8a'];
const hm=ms=>ms?new Date(ms).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
function statsChart(d){
  const ser=d.series||[];
  if(ser.length<2)return '<span class="small">在线曲线至少要 2 个点（有人在线时每分钟记一个点，只留最近 6 小时）。</span>';
  const v=ui.statsView||'all';
  let lines=v==='role'?SROLES.map((r,i)=>({n:SRN[r],c:SPAL[i],y:ser.map(p=>(p.r||{})[r]||0)}))
    :v==='team'?S.teams.map(t=>({n:t.name,c:TC[t.id][0],y:ser.map(p=>(p.k||{})[t.id]||0)}))
    :[{n:'总在线',c:'var(--accent)',y:ser.map(p=>p.n)}];
  lines=lines.filter(l=>Math.max(...l.y)>0);
  const W=Math.min(760,Math.max(280,innerWidth-(innerWidth<720?56:96))),H=170,L=30,B=22,T=8,Rt=8,max=Math.max(1,...lines.flatMap(l=>l.y)),t0=ser[0].at,sp=Math.max(1,ser[ser.length-1].at-t0);
  const X=at=>L+(at-t0)/sp*(W-L-Rt),Y=n=>T+(1-n/max)*(H-T-B);
  const grid=[0,.5,1].map(f=>{const n=Math.round(max*f),y=Y(n);return '<line x1="'+L+'" x2="'+(W-Rt)+'" y1="'+y+'" y2="'+y+'" style="stroke:var(--line2);stroke-width:1"/><text x="'+(L-4)+'" y="'+(y+4)+'" text-anchor="end" style="fill:var(--sub);font-size:11px">'+n+'</text>';}).join('');
  const paths=lines.map(l=>'<polyline fill="none" style="stroke:'+l.c+';stroke-width:2" stroke-linejoin="round" points="'+ser.map((p,i)=>X(p.at).toFixed(1)+','+Y(l.y[i]).toFixed(1)).join(' ')+'"/>').join('');
  const legend=v==='all'?'':'<div class="btns" style="gap:12px">'+lines.map(l=>'<span class="small"><span style="display:inline-block;width:10px;height:10px;background:'+l.c+';margin-right:4px"></span>'+esc(l.n)+'</span>').join('')+'</div>';
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;max-width:'+W+'px;height:auto;display:block" role="img" aria-label="在线人数曲线">'+grid
    +'<text x="'+L+'" y="'+(H-6)+'" style="fill:var(--sub);font-size:11px">'+hm(t0)+'</text><text x="'+(W-Rt)+'" y="'+(H-6)+'" text-anchor="end" style="fill:var(--sub);font-size:11px">'+hm(ser[ser.length-1].at)+'</text>'+paths+'</svg>'+legend;
}
function statsPanel(){
  if(!DEVME||DEVME.demo||LOCAL)return '';
  if(!ui.statsTried&&ws&&connected){ui.statsTried=true;send({type:'dev.stats'},m=>{ui.stats=m.data;},true);}
  const d=ui.stats,v=ui.statsView||'all';
  const head='<div class="shrow"><h3>统计</h3><span class="small">开发者专用；只记 PIN 标签、设备大类和时间，不存 IP；重置游戏不影响，活动后点「清空」</span></div>';
  if(!d)return '<div class="pn" style="margin-top:16px">'+head+'<div class="btns"><button class="btn-line" data-a="stats-load">加载统计</button></div></div>';
  const rows=[...d.rows].sort((a,b)=>SROLES.indexOf(a.role)-SROLES.indexOf(b.role)||a.k.localeCompare(b.k,'zh'));
  const G='display:grid;grid-template-columns:minmax(100px,1.3fr) 76px 44px 44px 44px minmax(90px,1.4fr) 52px 44px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line2);font-size:14px';
  const tbl='<div style="overflow-x:auto"><div style="min-width:640px"><div class="small" style="'+G+';font-weight:700"><span>名称</span><span>身份</span><span>登录</span><span>连接</span><span>断线</span><span>设备</span><span>最近</span><span>在线</span></div>'
    +(rows.length?rows.map(r=>'<div style="'+G+'"><span style="font-weight:700">'+esc(r.k)+'</span><span>'+esc(r.roleName)+'</span><span class="mono">'+r.logins+'</span><span class="mono">'+r.conns+'</span><span class="mono"'+(r.drops?' style="color:var(--red)"':'')+'>'+r.drops+'</span><span>'+esc(r.devs.join('、')||'—')+'</span><span class="mono">'+hm(r.last)+'</span><span class="mono">'+(r.online||'')+'</span></div>').join(''):'<div class="small" style="padding:8px 0">还没有登录记录。</div>')+'</div></div>';
  const view=(k,t)=>'<button class="btn-line'+(v===k?' fill':'')+'" data-a="stats-view" data-v="'+k+'">'+t+'</button>';
  return '<div class="pn" style="margin-top:16px;gap:12px">'+head
    +'<div class="btns"><button class="btn-line" data-a="stats-load">刷新</button><button class="btn-line" data-a="stats-csv">下载 CSV</button>'
    +(ui.statsAsk?'<button class="btn-line fillred" data-a="stats-clear">确认清空统计</button><button class="btn-line" data-a="stats-cancel">取消</button>':'<button class="btn-line" data-a="stats-ask">清空</button>')
    +'<span class="small">当前在线 <b class="mono">'+d.online+'</b>　登录失败 <b class="mono">'+d.fails+'</b> 次'+(d.lastFail?'（最近 '+hm(d.lastFail)+'）':'')+'　更新于 '+hm(d.now)+'</span></div>'
    +'<div class="btns">'+view('all','总计')+view('role','按角色')+view('team','按队伍')+'</div>'+statsChart(d)+tbl+'</div>';
}
function downloadStats(){
  const d=ui.stats;if(!d)return;
  const q=x=>'"'+String(x).replace(/"/g,'""')+'"',tm=ms=>ms?new Date(ms).toLocaleString('zh-CN',{hour12:false}):'';
  const a=[['名称','身份','登录次数','连接次数','断线次数','设备','首次','最近']].concat(d.rows.map(r=>[r.k,r.roleName,r.logins,r.conns,r.drops,r.devs.join('、'),tm(r.first),tm(r.last)]));
  const b=[['时间','总在线'].concat(SROLES.map(r=>SRN[r]),S.teams.map(t=>t.name))].concat(d.series.map(p=>[tm(p.at),p.n].concat(SROLES.map(r=>(p.r||{})[r]||0),S.teams.map(t=>(p.k||{})[t.id]||0))));
  const csv='﻿'+[['登录失败次数',d.fails]].concat([[]],a,[[]],b).map(r=>r.map(q).join(',')).join('\r\n');
  const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));l.download='borderland-stats.csv';l.click();
  setTimeout(()=>URL.revokeObjectURL(l.href),1000);
}
function teamRows(){
  const list=[...S.teams].sort((a,b)=>b.score-a.score);
  const parts=list.map(t=>{const st=teamStatus(t),a=alive(t.id).length;
    const dots=S.players.filter(p=>p.team===t.id).map(p=>'<span class="dt'+(p.st==='alive'?'':' out')+'" title="'+p.id+(p.st==='alive'?'':'（鬼市）')+'"></span>').join('');
    const sq=SUITS.map(s=>'<span class="sq'+(t.cards.some(c=>c.includes(s))?' got':'')+'" title="'+TYPE[s]+'"><span class="'+(isRed(s)?'sr':'')+'">'+s+'</span></span>').join('');
    const sk=!FEATURES.cards?'':t.skills.length?t.skills.map(k=>'<button class="sk'+(ui.tskOpen===k.sid?' on':'')+'" data-a="tsk" data-v="'+k.sid+'" aria-expanded="'+(ui.tskOpen===k.sid)+'">'+esc(k.name)+'</button>').join(''):'<span class="small">无</span>';
    const ok=t.skills.find(k=>k.sid===ui.tskOpen);
    const det=ok?'<div class="skd"><b>'+esc(ok.name)+'</b>'+(ok.desc?'<span class="d">'+esc(ok.desc)+'</span>':'<span class="small">没有效果说明</span>')+'<span class="small">'+esc(ok.by)+' 于 '+fmt(ok.t)+' 在鬼市买入</span></div>':'';
    const fin='<button class="btn-line'+(st.k==='free'&&!t.final?' fill':'')+'" data-a="final" data-v="'+t.id+'"'+(t.final?' data-off="1"':'')+'>'+(t.final?'取消终极':'放行')+'</button>'+(t.final||st.k==='free'?'':'<span class="small fmiss">'+st.txt+'</span>');
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
  return /鬼门开/.test(x)?['鬼门开','var(--warn)']:/预约|重置完成/.test(x)?['房间','var(--ink2)']:/勾魂|抽签淘汰|被淘汰/.test(x)?['勾魂','var(--red)']:/黑白无常/.test(x)?['无常','var(--red)']:/孟婆汤|鬼市|助力/.test(x)&&!/技能卡/.test(x)?['鬼市','var(--accent)']:/技能卡/.test(x)?['技能卡','#6b4f9a']
    :/发布|撤销发布/.test(x)?['发布','var(--ink2)']:/任务/.test(x)?['任务','var(--accent)']:/进入|赢下|输了/.test(x)?['房间','var(--ink2)']:/冥币/.test(x)?['冥币','var(--warn)']:['系统','var(--sub)'];}
function viewCtrl(){
  const status='<h2 class="sh">各队状态</h2>'+teamRows()+downPanel()
    +editTeam()+capPanel();
  return '<div class="page tabbed toptabs ledger">'+sub('ctrl',[['status','各队状态'],['pub','发布'],['log','全场日志'],['tools','总控工具']],'top col')
    +sec('ctrl','status',status)+sec('ctrl','pub',pubPanel())
    +sec('ctrl','log','<h2 class="sh">全场日志</h2><div class="pn logl" style="gap:0">'+(S.log.length?S.log.slice(0,300).map(l=>{const [k,c]=logTag(l);
      return '<div class="le"><span class="t">'+fmt(l.t)+'</span><span class="k" style="--kc:'+c+'">'+k+'</span><span class="x">'+esc(l.text)+'</span></div>';}).join(''):'<span class="muted">还没有日志。</span>')+'</div>')
    +sec('ctrl','tools',adminPanel())+finalDlg()+'</div>';
}
// 每队一名队长，负责房间预约；总控随时可改。
function capPanel(){
  return '<div class="pn" style="gap:12px"><h3>队长（负责预约房间）</h3>'+S.teams.map(t=>'<div class="caprow" style="'+tv(t.id)+'">'+tsq(t.id,26)+'<b>'+t.name+'</b><div class="chips ids">'
    +S.players.filter(p=>p.team===t.id).map(p=>'<button class="cb id'+(t.cap===p.id?' on':'')+'" data-a="setcap" data-t="'+t.id+'" data-v="'+p.id+'" aria-pressed="'+(t.cap===p.id)+'"><span class="t">'+p.id+'</span></button>').join('')+'</div></div>').join('')+'</div>';
}
// 放行终极：每次都弹窗确认；条件不满足时列出缺项，确认后照样放行。
function finalDlg(){
  const t=ui.finalAsk&&team(ui.finalAsk);if(!t)return '';
  const miss=finalMiss(t);
  return '<div class="sheet"><div class="sheet-bg" data-a="finalno"></div><div class="sheet-card pn" role="dialog" aria-modal="true" aria-labelledby="fdt"><h3 id="fdt">放行 '+esc(t.name)+' 进入终极任务？</h3>'
    +(miss.length?'<div class="lot hot"><b>以下条件还没满足：</b><ul class="fl">'+miss.map(m=>'<li>'+esc(m)+'</li>').join('')+'</ul>你仍然可以放行。</div>':'<div class="lot">条件都已满足（四色齐、全员存活、积分 ≥ '+FINAL_SCORE+'）。</div>')
    +'<span class="small">放行后该队玩家页变成终极任务界面；之后可以在这里取消。</span>'
    +'<div class="btns two2"><button class="btn-main" data-a="finalok">'+(miss.length?'仍然放行':'确认放行')+'</button><button class="btn-line" data-a="finalno">取消</button></div></div></div>';
}

function pubPanel(){
  const f=ui.pub,K=f.kind,gate=K==='鬼门开',side=K==='sidequest',task=K!=='公告';f.to=f.target==='team'?'team:'+f.team:f.target;
  const to=[...(K==='公告'?[['everyone','所有人']]:[]),['all','全体玩家'],...(K==='公告'?[['staff','工作人员']]:[]),...S.teams.map(t=>['team:'+t.id,t.name,t.id]),['alive','存活的人'],['market','鬼市里的人'],['player','某位队员']];
  const toOn=v=>v==='team:'+f.team?f.target==='team':v===f.target;
  const pl=f.players||[],q=QUESTS.find(x=>x.id===f.quest),gq=GATES.find(x=>x.id===f.gate);
  const toName=gate?'全体玩家和工作人员':side?(f.sqTeam?team(f.sqTeam).name+'的':'队伍的'):f.target==='team'?team(f.team).name:f.target==='player'?(!pl.length?'某位队员':pl.length<=3?pl.join('、'):pl.slice(0,2).join('、')+' 等 '+pl.length+' 人'):{all:'全体玩家',alive:'存活的',market:'鬼市里的',staff:'工作人员',everyone:'所有人'}[f.target];
  // Scavenger Hunt: one team only, teams that are short of people first, with how many are left
  const sqTeams=[...S.teams].sort((a,b)=>alive(a.id).length-alive(b.id).length);
  const target=K==='公告'||K==='custom'?'<div class="fgrid"><div class="fld"><span>发给谁</span>'+dd('pub.to',(to.find(([v])=>toOn(v))||[])[1],'选择对象',f.target==='team'?TC[f.team][0]:null,to.map(([v,l,id])=>({v,label:l,c:id?TC[id][0]:null})))+'</div>'
      +(f.target==='player'?'<div class="fld"><span>选择队员（可多选）</span>'+dd('pub.players',pl.length?pl.length+' 人':'','选择队员',null,S.teams.flatMap(t=>[{group:t.name},...S.players.filter(p=>p.team===t.id).map(p=>({v:p.id,label:p.id,c:TC[t.id][0],note:p.st==='alive'?'':'已淘汰'}))]),true)
        +(pl.length?'<div class="selchips">'+pl.map(id=>'<button class="selchip" data-a="unpick" data-k="pub.players" data-v="'+id+'" aria-label="去掉 '+id+'"><span class="sw" style="--c:'+TC[teamOf(id)][0]+'"></span>'+id+'<b>×</b></button>').join('')+'</div>':'')+'</div>':'')+'</div>'
    :gate?'<div class="fld"><span>题库</span>'+dd('pub.gate',gq?gq.title:f.gate==='custom'?'自定义':'','选择鬼门开',null,[...GATES.map(x=>({v:x.id,label:esc(x.title)})),{v:'custom',label:'自定义'}])+'</div>'+(gq?'<div class="lot">'+esc(gq.body)+'</div>':'')
    :'<div class="fgrid"><div class="fld"><span>发给哪个队伍</span>'+dd('pub.sqTeam',f.sqTeam&&team(f.sqTeam).name,'选择队伍',f.sqTeam?TC[f.sqTeam][0]:null,sqTeams.map(t=>({v:t.id,label:t.name,c:TC[t.id][0],note:'剩余 '+alive(t.id).length+'/'+size(t.id)+' 人'})))+'</div>'
      +'<div class="fld"><span>题库</span>'+dd('pub.quest',q?q.title:f.quest==='custom'?'自定义':'','选择题目',null,[...QUESTS.map(x=>({v:x.id,label:esc(x.title),note:'+'+x.reward+' 分'})),{v:'custom',label:'自定义'}])+'</div></div>'
      +(q?'<div class="lot">'+esc(q.body)+'</div>':'');
  const form='<div class="pn" style="gap:14px">'
    +'<div class="fld"><span>类型</span><div class="seg3">'+['公告','鬼门开','custom'].map(k=>'<button class="sbtn'+(K===k?' on':'')+(k==='custom'?' secret':'')+'" data-a="pick" data-k="pub.kind" data-v="'+k+'" aria-pressed="'+(K===k)+'">'+(k==='custom'?'自定义任务':k)+'</button>').join('')+'</div></div>'
    +target
    +'<div class="fgrid"><label class="fld"><span>限时（分钟）</span><input class="in mono" id="pm" data-m="pub.mins" value="'+esc(f.mins)+'" inputmode="numeric"></label>'
    +(K==='custom'?'<label class="fld"><span>完成奖励（冥币，可为 0）</span><input class="in mono" id="prw" data-m="pub.reward" value="'+esc(f.reward)+'" inputmode="numeric"></label>':'')
    +'</div>'
    +((side&&f.quest!=='custom')||(gate&&f.gate!=='custom')?'':'<label class="fld"><span>标题</span><input class="in" id="pti" data-m="pub.title" value="'+esc(f.title)+'" placeholder="例如：鬼门开 占位"></label>'
    +'<label class="fld"><span>内容</span><textarea class="in" id="pb" data-m="pub.body" rows="3" placeholder="玩家手机上看到的说明：任务要求、集合地点…">'+esc(f.body)+'</textarea></label>')
    +'<button class="btn-main" data-a="publish">发布'+(K==='custom'?'自定义任务':gate?'鬼门开':'')+'到'+esc(toName)+(gate||f.target==='staff'?'':f.target==='everyone'||f.target==='all'?'的手机':'玩家手机')+'</button></div>';
  const list=S.notices.filter(n=>n.kind!=='通知'&&n.sub!=='side').slice(0,10).map(n=>{
    const aud=S.players.filter(p=>matches(n,p)),acked=aud.filter(p=>n.acks[p.id]).length,[kl,kc]=kindOf(n),ds=Object.keys(n.done);
    return '<div class="li"><div class="grow" style="gap:4px"><div class="thead"><span class="kb '+kc+'" style="font-size:12px;padding:0 7px">'+kl+'</span><b style="font-size:17px">'+esc(n.title)+'</b></div>'
      +'<span class="small">'+(n.target==='staff'?'':'已读 <span class="mono" style="color:var(--ink)">'+acked+'/'+aud.length+'</span>')+(n.target!=='all'?'　'+esc(targetLabel(n)):'')+(n.due?'　'+countdown(n):'')+'</span>'
      +(ds.length?'<span class="small">完成：'+ds.map(lab).join('、')+'</span>':'')+'</div>'
      +(ui.revokeAsk===n.id?'<span class="btns"><button class="btn-line fillred" data-a="revokeok" data-n="'+n.id+'">确认撤销</button><button class="btn-line" data-a="revokeno">取消</button></span>'
        +'<span class="small" style="flex-basis:100%">玩家手机上会删除'+(Object.values(n.done).some(d=>d.pts)?'，奖励扣回':'')+'</span>'
        :'<button class="btn-line" data-a="revoke" data-n="'+n.id+'">撤销发布</button>')+'</div>';}).join('');
  return '<h2 class="sh">发布公告 / 鬼门开 / 自定义任务</h2><div class="pubcols">'+form+'<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">已发布</h3>'+(list||'<div class="li small">还没有发布过。</div>')+'</div></div>';
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
    +'<button class="btn-line '+(run?'':'fill')+'" data-a="clockctl" style="min-height:52px;padding:0 24px;font-size:17px;font-weight:900">'+(run?'暂停':'开始')+'</button>'
    +(A.ask==='clockreset'?'<button class="btn-line fillred" data-a="clockreset" style="min-height:52px;padding:0 18px;font-size:16px;font-weight:900">确认重置为 0:00</button><button class="btn-line" data-a="adm-cancel" style="min-height:52px">取消</button>'
      :'<button class="btn-line" data-a="adm-ask" data-v="clockreset" style="min-height:52px;padding:0 18px;font-size:16px;font-weight:900">重置</button>')+'</div>'
    +'<span class="small" style="font-weight:700;color:'+(run?'var(--accent)':'var(--sub)')+'">'+(run?'● 计时中':'❚❚ 已暂停')+'</span></div>'
    +'<div class="pn"><div class="shrow"><h3>总时长</h3></div><span class="small">当前 <b class="mono" style="color:var(--ink)">'+Math.round((S.dur||7200)/60)+'</b> 分钟</span>'
    +'<div class="btns"><input class="in mono" id="durm" data-m="durMin" value="'+esc(A.dur)+'" inputmode="numeric" placeholder="分钟，如 120" style="max-width:150px"><button class="btn-line acc" data-a="setdur">设置</button></div></div>'
    +'<div class="pn"><h3>开局</h3><span class="small">8 队随机分到 8 个房间（直接进入游戏中）。只有还没有队伍进过房间时才能用。</span><div class="btns"><button class="btn-line acc" data-a="assign">开局随机分房</button></div></div>'
    +'<div class="pn"><div class="shrow"><h3>PIN</h3><span class="small">按数量增减工作人员 PIN（改小会删掉编号靠后的，用它们登录的人会被踢下线）</span></div>'
    +'<div class="cnts">'+num('dealer','Dealer')+num('judge','判官')+num('mengpo','孟婆')+num('wuchang','黑白无常')+num('ctrl','总控')+num('screen','大屏')+'</div>'
    +'<div class="btns"><button class="btn-line acc" data-a="adm-gen">生成 PIN</button><button class="btn-line" data-a="adm-pins">查看全部 PIN</button></div>'+pins+'</div></div>';
  const rs=A.resetTxt==='重置';
  const right='<div class="stack"><div class="pn"><h3>备份与恢复</h3><span class="small">每 10 次操作自动备份一次；重置、恢复、载入演示数据前都会先备份当前数据。</span>'
    +'<div class="btns"><button class="btn-line" data-a="adm-snaps">查看备份</button>'
    +(A.ask==='reset:demo'?'<button class="btn-line fillred" data-a="adm-reset" data-v="demo">确认载入演示数据</button><button class="btn-line" data-a="adm-cancel">取消</button>'
      :'<button class="btn-line" data-a="adm-ask" data-v="reset:demo">载入演示数据</button>')+'</div>'+snaps+'</div>'
    +'<div class="danger"><h3>危险操作</h3><p>重置会清空所有冥币、花色、日志和鬼市记录（PIN 不变）。请在下方输入“重置”二字后再点按钮。</p>'
    +'<input class="in" id="rst" data-m="adm.resetTxt" value="'+esc(A.resetTxt)+'" placeholder="输入“重置”" style="border-color:#d9b3aa">'
    +'<button class="btn-line '+(rs?'fillred':'')+'" id="rstbtn" data-a="adm-reset" data-v="blank"'+(rs?'':' disabled')+' style="min-height:48px;font-weight:900">重置为空白游戏</button></div></div>';
  return '<h2 class="sh">总控工具</h2><div class="cols2">'+left+right+'</div>'+demoPanel()+statsPanel();
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
  if(me.st==='market')return '<div class="oban mk" role="status"><b>你在鬼市</b><span>已待 <i class="mono">'+mm(S.t-me.inAt)+'</i> 　合计冥币 <i class="mono">'+(me.coins+me.bail)+'</i> / '+COIN_GOAL+'</span></div>';
  return '<div class="oban" role="status"><b>你已被淘汰</b><span>'+(me.st==='picked'?'黑白无常已接到你，正在送你去鬼市':'留在原地，等黑白无常来接你')+'</span></div>';
}
const LT_LAYOUT=[[0.04085, 0.04501, 0.10376, 0.0325], [0.04453, 0.01726, 0.09763, 0.0994], [0.05433, 0.02586, 0.1107, 0.1669], [0.04575, 0.04517, 0.10866, 0.2261], [0.05392, 0.04743, 0.10825, 0.29], [0.0433, 0.03474, 0.10294, 0.3547], [0.05188, 0.0, 0.1058, 0.4161], [0.04616, 0.03108, 0.11111, 0.4675], [0.04739, 0.01337, 0.10825, 0.5317], [0.04779, 0.04768, 0.11111, 0.5783], [0.0531, 0.00107, 0.11234, 0.6397], [0.04698, 0.00998, 0.11193, 0.6925], [0.04616, 0.00241, 0.12377, 0.7378], [0.05392, 0.02337, 0.11356, 0.7769], [0.05106, 0.03881, 0.11111, 0.8264], [0.05229, 0.02952, 0.10539, 0.8708], [0.05433, 0.01043, 0.11193, 0.9228], [0.04943, 0.0266, 0.10539, 0.9686]]; // [宽, 顶(相对最高那盏), 高, 原图中心x]，单位 = 原图宽 2448 的比例；每盏灯笼单独一张图 img/lt/dNN.webp
function lanternsHtml(){ // 灯笼挂满整个屏幕宽度，间距随屏幕拉开，每盏单独摇摆；相位按时钟算，重绘后动画不跳
  const vw=window.innerWidth,band=vw<720?3*vw:Math.min(1400,Math.max(900,.78*vw)),avg=.049*band,
    n=Math.max(4,Math.min(LT_LAYOUT.length,Math.floor(vw/(avg*1.35)))),now=Date.now()/1000;
  let h='<div class="lantern-band" aria-hidden="true">';
  for(let j=0;j<n;j++){const i=n===1?0:Math.round(j*(LT_LAYOUT.length-1)/(n-1)),L=LT_LAYOUT[i],
      dur=4.2+(i*37%30)/10,amp=1.6+(i*53%20)/10,bob=2+(i*29%30)/10,dly=-(now%(2*dur));
    h+='<span class="lt" style="--x:'+((j+.5)/n*100).toFixed(2)+'%;--w:'+L[0]+';--y:'+L[1]+';--dur:'+dur.toFixed(2)+'s;--amp:'+amp.toFixed(2)+'deg;--bob:'+bob.toFixed(1)+'px;--dly:'+dly.toFixed(2)+'s"><img src="img/lt/d'+String(i+1).padStart(2,'0')+'.webp" alt=""></span>';}
  return h+'</div>';}
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
    :wst==='market'?'<span class="w-hint">你在鬼市</span><span class="w-lab">已待 <b class="mono">'+mm(stay)+'</b></span><span class="w-lab">合计冥币 <b class="mono">'+(me.coins+me.bail)+'</b> / '+COIN_GOAL+'</span>'
    :'<span class="w-lab">保护期还剩</span><span class="w-num">'+Math.ceil(prot/60)+' 分钟</span>';
  const wch=[...wseal],wn=wch.length,wh=wn>2?78:58,wy=wn>2?[27,51,75]:[29,55];
  const wen='<div class="wen" data-st="'+wst+'"><svg class="w-grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#paperGrain)"></rect></svg>'
    +'<i class="w-frame"></i><i class="w-cn tl"></i><i class="w-cn tr"></i><i class="w-cn bl"></i><i class="w-cn br"></i>'
    +'<div class="w-title"><b>酆都通行证</b><span>冥府签发</span></div><div class="w-rule"></div>'
    +'<div class="w-who"><span class="w-idg"><span class="w-k">持证人</span><span class="w-id">'+me.id+'</span>'+(t.cap===me.id?'<span class="w-cap">队长</span>':'')+'</span>'
    +'<span class="w-teamg"><span class="w-k">所属</span><i class="w-sw" style="'+tv(t.id)+'"></i><span class="w-team">'+t.name+'</span></span></div>'
    +'<div class="w-state"><div class="w-note">'+wnote+'</div>'
    +'<svg class="w-seal" viewBox="0 0 64 '+(wh+6)+'" role="img" aria-label="'+wseal+'"><g filter="url(#sealInk)"><rect x="3" y="3" width="58" height="'+wh+'" rx="2"></rect>'
    +wch.map((c,i)=>'<text x="32" y="'+wy[i]+'" text-anchor="middle" font-size="'+(wn>2?24:28)+'">'+c+'</text>').join('')+'</g></svg></div></div>';
  // 本队
  const a=alive(t.id).length,st=teamStatus(t);
  const dots=S.players.filter(p=>p.team===t.id).map(p=>'<span class="dt'+(p.st==='alive'?'':' out')+'" style="'+tv(t.id)+'" title="'+p.id+(p.st==='alive'?'':'（淘汰）')+'"></span>').join('');
  const suits=SUITS.map(x=>{const got=t.cards.some(c=>c.includes(x));
    return '<div class="s4'+(got?' got':'')+'" title="'+TYPE[x]+(got?'':'：未获得')+'"><span class="g '+(isRed(x)?'sr':'')+'">'+x+'</span><span class="l">'+TYPE[x]+'</span></div>';}).join('');
  // 房间记录：进入时间、结果、得分 / 被淘汰的人
  const hist=[...(t.hist||[])].reverse().map(h=>{const r=room(h.rid),res=h.res===null?'游戏中':h.res==='win'?'通关　+'+h.pts:h.res==='lose'?'失败　0 分'+(h.out?'，淘汰 '+h.out:''):'中途离场';
    return '<div class="hrow"><span class="mono">'+fmt(h.t0)+'</span><b>'+cardG(r)+' '+(r.n===4?'简单':'困难')+'</b><span class="hres '+(h.res==='win'?'w':h.res==='lose'?'l':'')+'">'+res+'</span></div>';}).join('');
  const histSec=hist?'<div class="pn histp"><h3>房间记录</h3>'+hist+'</div>':'';
  const fin=st.k==='free'?'<div class="fin ok">'+st.txt+'</div>':'';
  // 终极任务进度：三个条件各一张卡，一眼看出离终极还差什么
  const gotN=SUITS.filter(x=>t.cards.some(c=>c.includes(x))).length,sz=size(t.id);
  const okS=gotN===SUITS.length,okA=a===sz,okP=t.score>=FINAL_SCORE,doneN=[okS,okA,okP].filter(Boolean).length;
  const cc=(ok,ttl,body)=>'<div class="fc'+(ok?' ok':'')+'"><div class="fh"><b>'+ttl+'</b><span class="fk">'+(ok?'✓ 已达成':'未达成')+'</span></div>'+body+'</div>';
  const need=[!okS?'再集齐 '+(SUITS.length-gotN)+' 种花色':'',!okA?'复活 '+(sz-a)+' 名队友':'',!okP?'再赚 '+(FINAL_SCORE-t.score)+' 冥币':''].filter(Boolean);
  const finSec='<div class="fin3"><div class="fhd"><div class="ft"><span class="cap">终极任务进度</span><b class="fn">'+doneN+'<i> / 3</i></b></div>'
    +'<div class="fs">'+(st.k==='free'?st.txt:doneN===3?'三个条件都已满足，等待总控放行。':'还差：'+need.join('、'))+'</div></div>'
    +'<div class="fcs">'
    +cc(okS,'集齐四种花色','<div class="suits4">'+suits+'</div><div class="fx mono">'+gotN+' / '+SUITS.length+'</div>')
    +cc(okA,'全员存活','<div class="dots">'+dots+'</div><div class="fx mono">'+a+' / '+sz+'</div>')
    +cc(okP,'队伍冥币 ≥ '+FINAL_SCORE,'<div class="fscore mono">'+t.score+'</div><div class="bar"><span class="ok" style="width:'+Math.min(100,t.score/FINAL_SCORE*100)+'%"></span></div><div class="fx mono">'+t.score+' / '+FINAL_SCORE+(okP?'':'（差 '+(FINAL_SCORE-t.score)+'）')+'</div>')
    +'</div></div>';
  const teamSec=finSec+histSec
  ;const skillsPart=!FEATURES.cards?'':''
    +'<div class="skrow"><span class="cap">本队技能卡</span>'+(t.skills.length?'<div class="skills">'+t.skills.map(k=>'<button class="sk'+(ui.skillOpen===k.sid?' on':'')+'" data-a="skill" data-v="'+k.sid+'" aria-expanded="'+(ui.skillOpen===k.sid)+'">'+esc(k.name)+'</button>').join('')+'</div>':'<span class="muted small">暂无。鬼市里的人可用个人冥币购买。</span>')+'</div>'
    +((sk=>sk?'<div class="skd"><b>'+esc(sk.name)+'</b>'+(sk.desc?'<span class="d">'+esc(sk.desc)+'</span>':'')+'<span class="small">'+esc(sk.by)+' 于 '+fmt(sk.t)+' 在鬼市买入</span><span class="small">使用时找工作人员出示这一页。</span></div>':'')(t.skills.find(k=>k.sid===ui.skillOpen)));
  // 通知与任务
  const mine=S.notices.filter(n=>n.sub!=='side'&&matches(n,me)),unread=mine.filter(n=>!n.acks[me.id]).length;
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
  const sv=scavInfo(t.id),sqOpen=S.notices.some(n=>n.sub==='side'&&matches(n,me)&&!n.done[t.id]);
  const svLine=sv.used||sqOpen?'<div class="svline"><b>Scavenger</b><span class="mono">'+sv.used+'/'+SCAV_CAP+'</span><span>'+(sv.capped?'已封顶':sv.n>=SCAV_N?fmt(sv.nextAt)+' 后可再兑换':'现在可兑换')+'</span></div>':'';
  const taskSec='<h2 class="sh" style="font-size:22px">当前任务与通知</h2>'+svLine+(curN.length?curN.map(noteHtml).join(''):'<div class="pn"><span class="muted">暂时没有新的通知或进行中的任务。</span></div>')
    +(histN.length?'<button class="histbtn" data-a="hist" aria-expanded="'+!!ui.histOpen+'">历史消息（'+histN.length+'）<span>'+(ui.histOpen?'收起 ▲':'展开 ▼')+'</span></button>'+(ui.histOpen?histN.map(noteHtml).join(''):''):'');
  // 鬼市
  const mk=S.players.filter(p=>p.team===t.id&&p.st!=='alive').sort((x,y)=>x.outAt-y.outAt);
  const mate=(p,mine)=>{
    if(p.st!=='market')return '<div class="mate"'+(mine?' style="border-color:var(--red)"':'')+'><div class="r"><span class="id">'+p.id+(mine?' <span class="small" style="font-family:var(--sans)">（你）</span>':'')+'</span>'
      +'<span class="small" style="font-weight:700;color:var(--red)">'+(p.st==='picked'?'已被黑白无常接到':'原地等黑白无常')+'</span></div></div>';
    const tot=p.coins+p.bail,tOk=true,cOk=tot>=COIN_GOAL,gap=gapOf(p);
    const line=cOk?'已凑够，可以找孟婆买命了':'差 '+(COIN_GOAL-tot)+' 冥币';
    const def=Math.min(gap*RATE,t.score);
    return '<div class="mate"'+(mine?' style="border-color:var(--red)"':'')+'><div class="r"><span class="id">'+p.id+(mine?' <span class="small" style="font-family:var(--sans)">（你）</span>':'')+'</span>'
      +'<span class="small mono">'+tot+'/'+COIN_GOAL+'</span></div>'
      +'<div class="bar"><span class="ok" style="width:'+Math.min(100,tot/COIN_GOAL*100)+'%"></span></div>'
      +'<span class="small" style="font-weight:700;color:'+(tOk&&cOk?'var(--accent)':'var(--ink)')+'">'+line+'</span>'
      +(!mine&&me.st==='alive'&&gap>0?'<div class="give"><input class="in" id="d-'+p.id+'" data-m="don" data-p="'+p.id+'" value="'+(ui.don[p.id]!=null?ui.don[p.id]:def)+'" inputmode="numeric" placeholder="冥币数" aria-label="为 '+p.id+' 花掉的队伍冥币">'
        +'<button data-a="donate" data-p="'+p.id+'">冥币助力</button></div>':'')+'</div>';};
  const mkSec='<div class="shrow"><h2 class="sh" style="font-size:22px">被淘汰的队友</h2></div>'
    +(mk.length?mk.map(p=>mate(p,p.id===me.id)).join(''):'<div class="pn"><span class="muted">本队现在没有人被淘汰。</span></div>');
  if(ui.sub.player==='market')ui.sub.player='team';
  const tabs=[['team','本队'],['task','任务'+(unread?'<b class="cnt">'+unread+'</b>':'')],];
  return (me.st!=='alive'?lanternsHtml():'')+'<div class="page tabbed toptabs allin">'+sub('player',tabs,'top')
    +'<div class="pcol l">'+wen+sec('player','team',teamSec)+(me.st==='alive'?sec('player','team',mkSec).replace('class="sec','class="sec'+(mk.length?'':' mk0')):'')+(skillsPart?sec('player','team',skillsPart):'')+'</div>'
    +'<div class="pcol r">'+sec('player','task',taskSec)+'</div></div>';
}
// 预约按钮置灰时点击：弹窗说明现在为什么不能预约
function rsvDlg(){
  const me=S.players.find(p=>p.id===ME.pid),t=team(me.team),r=room(ui.rsvInfo),why=whyNotReserve(t.id,r.id);
  if(!why){ui.rsvInfo=null;return '';}
  const short=alive(t.id).length<size(t.id)&&/未满员/.test(why);
  const body=short?'<div class="lot hot"><b>进房必须满员</b>：全队 '+size(t.id)+' 人都活着才能预约和入场。本队现在 <b class="mono">'+alive(t.id).length+'/'+size(t.id)+'</b>。</div>'
      +'<span class="lbl">让队友回来，有两个办法</span><ol class="fl"><li>队友在<b>鬼市</b>里凑够 <b class="mono">'+COIN_GOAL+'</b> 冥币，向孟婆买命复活。</li>'
      +'<li>去做 <b>Scavenger Hunt</b> 赚冥币，再按 <b class="mono">'+RATE+':1</b> <b>助力</b>给鬼市里的队友，帮他凑够买命。（在「本队」页给队友助力）</li></ol>'
    :'<div class="lot">'+esc(why)+'</div>';
  return '<div class="sheet"><div class="sheet-bg" data-a="rsvclose"></div><div class="sheet-card pn" role="dialog" aria-modal="true"><h3>现在不能预约 '+cardG(r)+'</h3>'+body
    +'<div class="btns"><button class="btn-main" data-a="rsvclose">知道了</button></div></div></div>';
}
// 时间到：全员（含工作人员、大屏）全屏提示；按总时长记住已点过，刷新不再重复弹。
const tuKey=()=>'borderland.tu.'+((S&&S.dur)||7200);
const tuSeen=()=>{try{return sessionStorage.getItem(tuKey())==='1';}catch{return !!ui.tuAck;}};
const dealerBusy=()=>ME&&ME.role==='dealer'&&!!S&&!!S.gp&&ROOMS.some(y=>(!Array.isArray(ME.rooms)||ME.rooms.includes(y.id))&&roomState(y.id).st==='play');
const staffAcked=id=>{try{return sessionStorage.getItem('borderland.sa.'+id)==='1';}catch{return !!(ui.sa&&ui.sa[id]);}};
function tuDlg(){
  return '<div class="ovl" data-k="time"><div class="dlg" data-n="timeup" data-k="time" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="new"><i></i>全场通知</div>'
    +'<h3 id="dt">时间到</h3><div class="body">游戏总时间已用完。\n各房间暂停预约与入场；已经在房间里的队伍可以继续打完当前一局，结算和重置照常进行。</div>'
    +'<div class="foot"><span class="cap">剩余时间</span><span class="cd over">0:00:00</span></div>'
    +'<button data-a="tuack" data-modal="1">知道了</button></div></div>';
}
function modalHtml(){
  if(ME&&S&&!entering&&R.timeUp()&&!tuSeen())return tuDlg();
  if(ME&&ME.role==='player'&&S&&ui.rsvInfo)return rsvDlg();
  if(ME&&ME.role!=='player'&&S&&S.notices){ // 工作人员：发给「工作人员 / 所有人」的公告，已读只记在本机
    const n=S.notices.find(x=>staffSees(x)&&!R.noticeStale(x)&&!staffAcked(x.id)&&!(x.sub==='gate'&&ME.role==='screen'));if(!n)return '';
    const dl=n.sub==='gate'&&dealerBusy()?'<div class="gatebar" style="margin:6px 0"><b>请尽快结束游戏</b><span>鬼门开已开始，你负责的房间还有一局在进行，请尽快结算</span></div>':'';
    return '<div class="ovl"><div class="dlg" data-n="s'+n.id+'" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="new"><i></i>工作人员通知</div>'
      +'<div class="bd"><span class="k">'+n.kind+'</span></div><h3 id="dt">'+esc(n.title)+'</h3>'+(n.body?'<div class="body">'+esc(n.body)+'</div>':'')+dl
      +'<div class="foot">'+(n.due?'<span class="cap">剩余时间</span><span class="cd'+(n.due-S.t>0?'':' over')+'">'+(n.due-S.t>0?mmss(n.due-S.t):'已截止')+'</span>':'')+'</div>'
      +'<button data-a="sack" data-n="'+n.id+'" data-modal="1">知道了</button></div></div>';}
  if(!ME||ME.role!=='player'||!S)return '';
  const me=S.players.find(p=>p.id===ME.pid);
  const n=S.notices.find(x=>x.sub!=='side'&&matches(x,me)&&!R.noticeStale(x)&&!x.acks[me.id]&&!(DEVME&&ui.devAck.has(x.id+':'+me.id)));if(!n)return '';
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
function tickClocks(){const n=nowT(),t=fmt(n);$('#clk').textContent=t;const a=document.getElementById('sclk');if(a)a.textContent=remStr(n);const b=document.getElementById('tclk');if(b)b.textContent=t;}
function setAmb(mode,tone){
  if(ambMode!==mode){ambMode=mode;
    $('#amb').innerHTML=mode?'<ghost-ambience data-mode="'+mode+'"'+(mode==='login'?' data-len="0" data-err="0" data-ok="0"':'')+'></ghost-ambience>':'';}
  const g=$('#amb ghost-ambience');if(g&&tone&&g.dataset.tone!==tone)g.dataset.tone=tone;}
const THEME_KEY=r=>'borderland.theme.'+r;
// Three remembered choices per device (big screen, player page, staff pages); all default to dark on first open.
const themeKey=()=>ui.tab==='board'?'screen':ME&&ME.role==='player'?'player':'staff';
// 被淘汰、已被接到或在鬼市：整页红色提示，强制深色
const inMarketNow=()=>{const p=ME&&ME.role==='player'&&S&&S.players.find(x=>x.id===ME.pid);return !!(p&&p.st!=='alive');};
function themeFor(){const r=themeKey();if(ME&&(ME.role==='mengpo'||ME.role==='wuchang'))return 'dark';if(r==='player'&&inMarketNow())return 'dark';let v=null;try{v=localStorage.getItem(THEME_KEY(r));}catch{/* private mode */}
  return v||'dark';}
const themed=()=>true;

function render(){
  if(DEVME&&!entering){ME=devMe();if(FULL)S=ME.role==='player'?R.viewFor(FULL,ME):FULL;}
  if(DEVME&&DEVME.demo)ui.devOps=!!DEVME.dwrite;
  const da=$('#devas');da.hidden=!DEVME||entering;
  const dop=$('#devops');dop.hidden=da.hidden;dop.disabled=!!(DEVME&&DEVME.demo);dop.textContent=ui.devOps?'可操作':'只读';dop.classList.toggle('on',ui.devOps);dop.setAttribute('aria-pressed',String(ui.devOps));
  if(DEVME&&!entering){const src=FULL||S,h='<optgroup label="工作人员">'+['ctrl','dealer','judge','mengpo','wuchang','screen'].map(r=>'<option value="'+r+'">'+ROLE_NAME[r]+'</option>').join('')+'</optgroup>'
      +(src?src.teams.map(t=>'<optgroup label="'+t.name+'">'+src.players.filter(p=>p.team===t.id).map(p=>'<option value="player:'+p.id+'">'+p.id+'</option>').join('')+'</optgroup>').join(''):'');
    if(da.dataset.h!==h){da.innerHTML=h;da.dataset.h=h;}if(da.value!==ui.as)da.value=ui.as;}
  const login=!ME||entering;
  document.body.classList.toggle('login',login);if(login)document.body.classList.remove('inmk');document.body.classList.toggle('dev',!!DEVME&&!login);
  document.body.classList.toggle('screen',!login&&ME.role==='screen');
  document.body.dataset.role=login?'':ME.role;
  if(login){document.body.classList.remove('board','natscroll','fullamb','inmk');document.documentElement.dataset.theme='dark';setAmb('login');renderLogin();return;}
  const tabs=ME.role==='player'&&finalNow()?['player']:(ROLE_TABS[ME.role]||[]);
  if(!tabs.includes(ui.tab))ui.tab=tabs[0];
  document.documentElement.dataset.theme=themed()?themeFor():'light';
  document.body.classList.toggle('board',ui.tab==='board');
  document.body.classList.toggle('inmk',ME.role==='player'&&inMarketNow());
  document.body.classList.toggle('natscroll',ui.tab==='market'||ui.tab==='wuchang'||(ui.tab==='player'&&ME&&ME.role==='player'));
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
  $('#who').textContent=(DEVME?(DEVME.demo?'展示 · ':'开发者 · '):'')+(ME.role==='player'?(DEVME?ME.pid:'玩家'):ME.role==='ctrl'?'总控':ME.label||ROLE_NAME[ME.role]);
  $('#logout').hidden=false;$('#conn').hidden=false;
  const run=CLOCK&&CLOCK.running;
  const cc=$('#clockctl');cc.hidden=ME.role!=='ctrl';cc.textContent=run?'暂停计时':'开始计时';
  const th=$('#theme');th.hidden=!themed()||(themeKey()==='player'&&inMarketNow())||ME.role==='mengpo'||ME.role==='wuchang';th.textContent=themeFor()==='dark'?'浅色':'深色';
  $('.clk').classList.toggle('paused',!run);$('#clkdot').className='gd'+(run?'':' off');
  if(!S){$('#view').innerHTML='<section class="pn muted">正在连接服务器…</section>';return;}
  R.use(S);S.t=nowT();$('#clk').textContent=fmt(S.t);
  morph($('#view'),ui.tab==='board'?viewBoard():ui.tab==='dealer'?viewDealer():ui.tab==='ctrl'?viewCtrl():ui.tab==='npc'?viewNpc():ui.tab==='market'?viewMarket():ui.tab==='wuchang'?viewWuchang():viewPlayer());
  fitStage();
  { // 灯笼 / 面具的绳子接到页头那条线：算出它们离页头底边的距离（有标签栏时不上提，免得盖住标签）
    const root=document.documentElement,hb=$('#top').getBoundingClientRect().bottom;
    root.style.setProperty('--lfy',Math.max(0,Math.round(hb+window.scrollY))+'px'); // 手机固定背景的上沿 = 页头分割线
    const lb=$('.lantern-band');if(lb){const cur=parseFloat(root.style.getPropertyValue('--lup'))||0,nat=lb.getBoundingClientRect().top+cur;
      root.style.setProperty('--lup',(nav.hidden?Math.max(0,Math.round(nat-hb)):0)+'px');}
    const wm=$('.wc-in');if(wm){const top=wm.getBoundingClientRect().top;root.style.setProperty('--wup',Math.max(0,Math.round(top-hb))+'px');}
  }
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
  c.insertAdjacentHTML('beforeend','<div class="okv"><div class="seal"><div class="sl"><img src="img/seal-paper.webp" alt="准" width="1200" height="960"></div></div>'
    +'<div class="sealtx">'+chars+'</div></div>');
  c.classList.add('shake','sealing');setTimeout(()=>buzz(110),600); // the seal lands at 0.6 s
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
  if(LG&&LG.LPINS[pin]){ // 本地演示 PIN：进入本页的这一局本地演示（刷新即重置，换设备请用共享演示局）
    const v=LG.LPINS[pin];FULL=LG.FULL;CLOCK=LG.CLOCK;LPINS=LG.LPINS;LSNAPS=LG.LSNAPS;LOCAL=true;
    const me={role:v.role,pid:v.pid||null,label:'演示 '+(v.label||v.pid),rooms:v.role==='dealer'?(v.rooms||[]):null,lpin:true};
    SESSION=null;setMe(me);ui.tab=null;connected=true;setConn();R.use(FULL);S=me.role==='player'?R.viewFor(FULL,me):FULL;
    if($('#lgcard'))entering=true;
    if(!$('#lgcard')){entering=false;render();say(null);return;}
    showSeal();setTimeout(()=>{entering=false;$('#view').innerHTML='';render();say(null);},matchMedia('(prefers-reduced-motion: reduce)').matches?1200:3600);return;}
  let res,j={};
  try{res=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});j=await res.json();}
  catch{loginError('连不上服务器，请检查网络');return;}
  if(!res.ok){loginError(j.error||'登录失败');return;}
  SESSION={token:j.token,me:j.me};store.set(SESSION);setMe(j.me);S=null;ui.tab=null;
  if($('#lgcard'))entering=true; // 先锁住登录页：本地展示模式会同步渲染，否则盖章还没出现页面就切走了
  if(j.me.demo&&j.me.dmode==='local')localStart();else connect();
  if(!$('#lgcard')){entering=false;render();say(null);return;}
  showSeal();
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(()=>{entering=false;$('#view').innerHTML='';render();say(null);},reduce?1200:3600);
}
function logout(msg){
  SESSION=null;store.set(null);setMe(null);S=null;CLOCK=null;connected=false;entering=false;
  if(ws){const w=ws;ws=null;try{w.close();}catch{/* ignore */}}
  clearTimeout(timer);$('#view').innerHTML='';render();say(null);if(msg)loginError(msg);
}

// ---------- live connection ----------
let ws=null,connected=false,retry=0,timer=null,seq=0,lastMsg=0;const pending=new Map();
function setConn(){const c=$('#conn');c.className='pill '+(connected?'free':'bad');c.textContent=connected?(LOCAL?'本地展示':'已连接'):'重连中…';}
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
function localNow(){return nowT();}
function localStart(){
  FULL=R.newGame(true);S=FULL;LOCAL=true;LPINS={};LSNAPS=[];CLOCK={running:false,base:FULL.t,at:Date.now()};OFFSET=0;connected=true;setConn();requestRender();
}
const L_ROLES=['dealer','judge','mengpo','wuchang','ctrl','screen'];
let LPINS={},LSNAPS=[];
function lSnap(tag){LSNAPS.unshift({at:Date.now(),t:FULL.t,tag,S:JSON.parse(JSON.stringify(FULL)),clock:{...CLOCK}});LSNAPS=LSNAPS.slice(0,30);}
function lPinList(){return Object.entries(LPINS).map(([pin,v])=>({pin,role:v.role,roleName:ROLE_NAME[v.role],pid:v.pid||'',label:v.label||'',rooms:v.rooms||null}))
  .sort((x,y)=>(x.role==='player')-(y.role==='player')||(x.pid||x.label).localeCompare(y.pid||y.label,'zh'));}
function lNewPin(){for(;;){const p=String(Math.floor(Math.random()*1000000)).padStart(6,'0');if(!LPINS[p])return p;}}
// 本地展示：总控工具在浏览器里自己跑（PIN 只在本页的这一局本地演示里能登录，刷新即失效）
function localAdmin(a){
  const ok=(msg,data)=>({ok:true,msg,data});R.use(FULL);
  switch(a.type){
    case 'admin.clock':
      if(a.op==='start'&&!CLOCK.running){CLOCK={running:true,base:CLOCK.base,at:Date.now()};FULL.t=CLOCK.base;R.log('计时开始');}
      else if(a.op==='pause'&&CLOCK.running){const n=nowT();CLOCK={running:false,base:n,at:Date.now()};FULL.t=n;R.log('计时暂停');}
      else if(a.op==='set'){CLOCK={running:CLOCK.running,base:Math.max(0,Math.round(+a.sec)||0),at:Date.now()};}
      else if(a.op==='reset'){CLOCK={running:false,base:0,at:Date.now()};FULL.t=0;R.log('计时重置为 0:00');}
      else return no('计时状态没有变化');
      return ok(CLOCK.running?'计时进行中':'计时已暂停');
    case 'admin.reset':lSnap('重置前');FULL=R.newGame(!!a.demo);CLOCK={running:false,base:a.demo?FULL.t:0,at:Date.now()};return ok(a.demo?'已载入演示数据（计时暂停）':'已重置为空白游戏（计时暂停）');
    case 'admin.genpins':{
      const counts=a.counts||{};let made=0;const have=new Set(Object.values(LPINS).filter(v=>v.pid).map(v=>v.pid));
      for(const p of FULL.players)if(!have.has(p.id)){LPINS[lNewPin()]={role:'player',pid:p.id,label:p.id};made++;}
      let removed=0;
      for(const role of L_ROLES){if(counts[role]==null)continue;const want=Math.max(0,Math.min(30,Math.round(+counts[role])||0));
        const mine=()=>Object.entries(LPINS).filter(([,v])=>v.role===role);let n=mine().length;
        while(n<want){n++;LPINS[lNewPin()]={role,label:ROLE_NAME[role]+' '+n,rooms:role==='dealer'?[]:undefined};made++;}
        if(n>want){const num=v=>role==='dealer'?(v.rooms&&v.rooms.length?ROOMS.findIndex(r=>r.id===v.rooms[0]):99):parseInt(String(v.label||'').replace(/\D+/g,' ').trim().split(' ').pop(),10)||0;
          mine().sort((x,y)=>num(y[1])-num(x[1])).slice(0,n-want).forEach(([pin])=>{delete LPINS[pin];removed++;});}}
      Object.values(LPINS).filter(v=>v.role==='dealer').forEach((v,i)=>{v.rooms=i<ROOMS.length?[ROOMS[i].id]:[];v.label='Dealer '+(v.rooms.length?ROOMS[i].card:'未绑定');});
      return ok('新生成 '+made+' 个 PIN'+(removed?'，删除多出的 '+removed+' 个':'')+'，共 '+Object.keys(LPINS).length+' 个（本地演示：退出后可在本页用这些 PIN 登录；换设备请用共享演示局）',lPinList());}
    case 'admin.pins':return ok('',lPinList());
    case 'admin.resetpin':{const old=String(a.pin||''),v=LPINS[old];if(!v)return no('没有这个 PIN');const np=lNewPin();delete LPINS[old];LPINS[np]=v;return ok((v.pid||v.label)+' 的新 PIN：'+np,lPinList());}
    case 'admin.snaps':return ok('',LSNAPS.map(x=>({key:'l'+x.at,at:x.at,t:x.t,tag:x.tag})));
    case 'admin.restore':{const x=LSNAPS.find(y=>'l'+y.at===String(a.key));if(!x)return no('找不到这个备份');lSnap('恢复前');
      FULL=JSON.parse(JSON.stringify(x.S));CLOCK={running:false,base:x.t,at:Date.now()};R.use(FULL);return ok('已恢复到备份（计时暂停，确认无误后再开始）');}
  }
  return no('未知的管理操作');
}
function localSend(a,after,quiet){
  if(!ui.devOps&&!ME.lpin){say(no('展示模式现在是只读'));return;}
  let r;const t=a.type||'';
  if(t.startsWith('admin.'))r=ME.role==='ctrl'?localAdmin(a):no('只有总控视角能用总控工具');
  else{FULL.t=nowT();r=R.apply(FULL,{role:ME.role,pid:ME.pid,label:ME.label,rooms:ME.lpin?ME.rooms:null},a);}
  S=ME.role==='player'?R.viewFor(FULL,ME):FULL;
  if(!quiet||!r.ok)say(r);if(r.ok&&after)after(r);requestRender();
}
function send(a,after,quiet){
  if(LOCAL){localSend(a,after,quiet);return;}
  if(!ws||!connected){say(no('还没连上服务器，请稍等'));return;}
  if(DEVME&&(a.type==='dev.setdemo'||a.type==='dev.stats'||a.type==='dev.clearstats')){}
  else if(DEVME){if(!ui.devOps){say(no('开发者模式现在是只读，点右上角「只读」切换成可操作'));return;}a={...a,as:{role:ME.role,pid:ME.pid}};}
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
  else if(a==='pick'){ui.ddOpen=null;const k=b.dataset.k,next=b.dataset.t&&getp(k)===v?'':v;if(k==='hookTeam'&&next&&next!==ui.hookTeam&&!hookWon(next))ui.hookAsk={kind:'team',v:next};
    else{setp(k,next);if(k==='hookTeam'){ui.hookMode='';ui.hookTarget='';}}
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
  else if(a==='demo-add'){(ui.demoRows=ui.demoRows||[]).push({pin:String(Math.floor(100000+Math.random()*900000)),old:'',mode:'shared',write:false});}
  else if(a==='demo-rand'){const r=ui.demoRows[+b.dataset.i];if(r)r.pin=String(Math.floor(100000+Math.random()*900000));}
  else if(a==='demo-copy'){const r=ui.demoRows[+b.dataset.i],l=location.origin+'/?pin='+r.old;copyText(l).then(()=>say({ok:true,msg:'已复制链接 '+l}),()=>say(no('复制失败')));}
  else if(a==='demo-save'){const r=ui.demoRows[+b.dataset.i];send({type:'dev.setdemo',pin:r.pin,old:r.old,mode:r.mode,write:r.write},m=>{DEVME.demoCfg=m.data;SESSION.me=DEVME;store.set(SESSION);ui.demoRows=null;});}
  else if(a==='demo-del'){const i=+b.dataset.i,r=ui.demoRows[i];if(!r.old)ui.demoRows.splice(i,1);else send({type:'dev.deldemo',pin:r.old},m=>{DEVME.demoCfg=m.data;SESSION.me=DEVME;store.set(SESSION);ui.demoRows=null;});}
  else if(a==='devops'){if(DEVME.demo)return;ui.devOps=!ui.devOps;say({ok:true,msg:ui.devOps?'开发者模式：可操作（以当前视角的身份）':'开发者模式：只读'});}
  else if(a==='clockreset'){A.ask=null;send({type:'admin.clock',op:'reset'});}
  else if(a==='clockctl'){send({type:'admin.clock',op:CLOCK&&CLOCK.running?'pause':'start'});}
  else if(a==='room'){ui.room=v;ui.pick='';ui.res={};ui.pickOut={};ui.settled=null;}
  else if(a==='res'){ui.res[b.dataset.t]=ui.res[b.dataset.t]===v?undefined:v;delete ui.pickOut[b.dataset.t];}
  else if(a==='gatereward'){send({type:'gatereward',pid:ui.gatePick},()=>{ui.gatePick='';});}
  else if(a==='jgpub'){const j=ui.jg;send({type:'publish',f:{kind:'鬼门开',target:'all',gate:j.gate,title:j.gate==='custom'?j.title:'',body:j.gate==='custom'?j.body:'',mins:+j.mins||0,reward:0}},()=>{ui.jg.gate='';ui.jg.title='';ui.jg.body='';});}
  else if(a==='gatewin'){const cid=ui.gateWin;if(cid&&S.gp)send({type:'done',nid:S.gp.nid,cid},()=>{ui.gateWin='';});}
  else if(a==='gateendask'){ui.gateEndAsk=true;}
  else if(a==='gateendno'){ui.gateEndAsk=false;}
  else if(a==='gateend'){ui.gateEndAsk=false;send({type:'gateend'});}
  else if(a==='enter'){send({type:'enter',tid:ui.pick,rid:ui.room},()=>{ui.pick='';ui.settled=null;ui.sub.dealer='settle';});}
  else if(a==='resetdone'){send({type:'resetdone',rid:ui.room},()=>{ui.settled=null;ui.sub.dealer='info';});}
  else if(a==='reserve'){send({type:'reserve',rid:v});}
  else if(a==='rsvno'){ui.rsvInfo=v;}
  else if(a==='rsvclose'){ui.rsvInfo=null;}
  else if(a==='cancelrsv'){send({type:'cancelrsv'});}
  else if(a==='finish'){const rid=ui.room;send({type:'finish',rid,results:ui.res,picks:ui.pickOut},m=>{ui.res={};ui.pickOut={};ui.settled={rid,msg:m.msg};});}
  else if(a==='hook'){send({type:'hook',actor:ui.hookTeam,pid:ui.hookTarget,where:ui.hookWhere,mode:ui.hookMode||hookSug(ui.hookTeam)},()=>{ui.hookTarget='';ui.hookWhere='';});}
  else if(a==='hookmode'){const cur=ui.hookMode||hookSug(ui.hookTeam);if(v!==cur){if(v===hookSug(ui.hookTeam)){ui.hookMode='';ui.hookTarget='';}else ui.hookAsk={kind:'mode',v};}}
  else if(a==='hookok'){const k=ui.hookAsk;ui.hookAsk=null;if(k){if(k.kind==='team'){ui.hookTeam=k.v;ui.hookMode='';ui.hookTarget='';}else{ui.hookMode=k.v;ui.hookTarget='';}}}
  else if(a==='hookno'){ui.hookAsk=null;}
  else if(a==='publish'){const sq=ui.pub.kind==='sidequest';send({type:'publish',f:{...ui.pub,team:sq?ui.pub.sqTeam:ui.pub.team,mins:+ui.pub.mins||0,reward:+ui.pub.reward||0}},()=>{ui.pub.title='';ui.pub.body='';if(sq){ui.pub.quest='';ui.pub.sqTeam='';}ui.pub.gate='';});}
  else if(a==='scavredeem'){const r=ui.rd;send({type:'scavredeem',tid:b.dataset.t,qid:r.quest,title:r.title});}
  else if(a==='checkin'){send({type:'checkin',pid:b.dataset.p,party:checkinParty()});}
  else if(a==='pickup'){send({type:'pickup',pid:b.dataset.p});}
  else if(a==='confirmin'){send({type:'confirm',pid:b.dataset.p,party:checkinParty()});}
  else if(a==='final'){if(b.dataset.off)send({type:'final',tid:v,on:false});else ui.finalAsk=v;}
  else if(a==='finalok'){const tid=ui.finalAsk;ui.finalAsk=null;send({type:'final',tid,on:true});}
  else if(a==='finalno'){ui.finalAsk=null;}
  else if(a==='setcap'){send({type:'setcap',tid:b.dataset.t,pid:v});}
  else if(a==='setdur'){send({type:'setdur',secs:Math.round((+ui.admin.dur||0)*60)},()=>{ui.admin.dur='';});}
  else if(a==='assign'){send({type:'assign'});}
  else if(a==='sack'){const id=b.dataset.n;(ui.sa=ui.sa||{})[id]=true;try{sessionStorage.setItem('borderland.sa.'+id,'1');}catch{/* ignore */}}
  else if(a==='tuack'){ui.tuAck=true;try{sessionStorage.setItem(tuKey(),'1');}catch{/* ignore */}}
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
  else if(a==='stats-load'){send({type:'dev.stats'},m=>{ui.stats=m.data;},true);}
  else if(a==='stats-view'){ui.statsView=v;}
  else if(a==='stats-csv'){downloadStats();}
  else if(a==='stats-ask'){ui.statsAsk=true;}
  else if(a==='stats-cancel'){ui.statsAsk=false;}
  else if(a==='stats-clear'){ui.statsAsk=false;send({type:'dev.clearstats'},m=>{ui.stats=m.data;});}
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
  else if(m==='demoRow.pin'){const el=e.target,r=ui.demoRows&&ui.demoRows[+el.dataset.i];el.value=el.value.replace(/\D/g,'').slice(0,6);if(r)r.pin=el.value;}
  else if(m==='hookWhere'){ui.hookWhere=v;}
  else if(m==='coinAmt'){ui.coinAmt=v;const btn=$('#coinbtn');if(btn)btn.textContent=coinBtn();}
  else if(m.startsWith('nc.'))ui.nc[m.slice(3)]=v;
  else if(m==='adm.resetTxt'){ui.admin.resetTxt=v;const btn=$('#rstbtn');if(btn){btn.disabled=v!=='重置';btn.classList.toggle('fillred',v==='重置');}}
  else if(m==='durMin')ui.admin.dur=v.replace(/[^\d.]/g,'');
  else if(m.startsWith('adm.'))ui.admin.counts[m.slice(4)]=+v;
  else if(m.startsWith('pub.'))ui.pub[m.slice(4)]=v;
  else if(m.startsWith('jg.'))ui.jg[m.slice(3)]=v;
  else if(m==='rd.title')ui.rd.title=v;
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
else{if(SESSION){setMe(SESSION.me);if(SESSION.me.demo&&SESSION.me.dmode==='local')localStart();else connect();}render();say(null);}
