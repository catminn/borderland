// 百鬼夜行 · browser app（v3 个人赛）.
// The server owns the game state; this page signs in with a PIN, keeps a live WebSocket, renders the pages
// for the signed-in role, and sends actions. Rule helpers come from rules.js (same file the server runs).
import * as R from './rules.js';
const {ROOMS,SUITS,TK_COIN,TK_SUITS,TK_ALL,KIND_NAME,ticketsOf,GATES,PUZ_CAP,PUZ_PTS,GATE_WIN,GATE_COIN,CHIP_START,CHIP_GOAL,RANSOM,puzCode,
  room,fmt,esc,matches,targetLabel,whyNotEnter,no,timeUp,marketShut,staffSees,ranking,suitsOf,stLabel,inMk,pl,nm,puzInfo}=R;
// 奖品（用本页的 S，不依赖 rules.js 里的模块变量）
const prize=id=>S&&S.draw?S.draw.pz.find(x=>x.id===id):null;
const curPrize=()=>S&&S.draw&&S.draw.cur?prize(S.draw.cur):null;

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
function loadCounts(){const c={dealer:8,judge:1,mengpo:1,wuchang:1,ctrl:1,screen:1};
  try{const o=JSON.parse(localStorage.getItem('borderland.pincounts')||'{}');for(const k in c){const v=Math.round(+o[k]);if(k!=='dealer'&&v>=0&&v<=30)c[k]=v;}}catch(e){}return c;}
let ui={ddOpen:null,tab:null,room:'4S',as:'ctrl',devOps:true,demoRows:null,devAck:new Set(),
  ent:'',res:{},settled:null,kickAsk:null,                       // Dealer
  gw:'',gr:{},jg:{gate:'',title:'',body:'',mins:10},gateEndAsk:false,pz:{pid:'',code:''},      // 判官
  nw:{name:'',desc:'',kind:'small'},pe:{name:'',desc:'',kind:'small'},pzEdit:null,aucAsk:null,showTk:false,   // 抽奖
  ransomBy:{},mkAsk:null,                              // 孟婆
  q:'',flt:'all',revokeAsk:null,ed:{pid:'',amt:'',why:'',nick:''},addN:'8',     // 生死簿
  nick:'',histOpen:false,off:{ids:'',k:'',res:'',code:'',rw:'',arg:'',by:''},offOn:false,
  sub:{dealer:'info',npc:'gate',ctrl:'status',player:'me',map:'1'},msel:null,
  pub:{kind:'公告',title:'',body:'',target:'everyone',players:'',mins:0,gate:''},
  admin:{dur:'',cap:'',pins:null,snaps:null,counts:loadCounts(),ask:null,resetTxt:''}};
const $=s=>document.querySelector(s);
// 每个角色：自己的页 + 大屏 + 地图（大屏角色只有大屏）。手机上一级分页在底部，二级分页在顶部。
const ROLE_TABS={ctrl:['ctrl','board','map'],dealer:['dealer','board','map'],judge:['npc','draw','board','map'],mengpo:['market','board','map'],wuchang:['wuchang','board','map'],screen:['board'],player:['player','board','map']};
const TAB_NAME={board:'大屏',map:'地图',player:'我的',dealer:'Dealer',ctrl:'总控',npc:'判官',draw:'抽奖',market:'鬼市',wuchang:'黑白无常'};
const ROLE_NAME={player:'玩家',dealer:'Dealer',judge:'判官',mengpo:'孟婆',wuchang:'黑白无常',ctrl:'总控',screen:'大屏'};
const nowT=()=>!CLOCK?0:CLOCK.running?CLOCK.base+Math.floor((Date.now()+OFFSET-CLOCK.at)/1000):CLOCK.base;
const drawOn=()=>!!(S&&S.draw&&S.draw.screen==='draw');

// ---------- look ----------
const TYPE={'♠':'体能','♦':'逻辑','♣':'团队配合','♥':'心理'};
const isRed=s=>s==='♥'||s==='♦';
const suitG=s=>'<span class="'+(isRed(s)?'sr':'')+'">'+s+'</span>';
const cardG=r=>r.n+suitG(r.suit);
const suits4=p=>'<span class="su4">'+SUITS.map(s=>'<span class="'+(p.cards.includes(s)?'got ':'')+(isRed(s)?'sr':'')+'">'+s+'</span>').join('')+'</span>';
const who=p=>'<span class="who"><b class="mono">'+p.id+'</b>'+(p.nick?'<span>'+esc(p.nick)+'</span>':'')+'</span>';
const p2=v=>String(v).padStart(2,'0');
const mm=x=>Math.floor(x/60)+':'+p2(x%60);
const mmss=x=>p2(Math.floor(x/60))+':'+p2(x%60);
// 总时长倒计时（只显示，倒数到 0 后房间关闭）
const remStr=t=>{const r=Math.max(0,((S&&S.dur)||7200)-t);return Math.floor(r/3600)+':'+p2(Math.floor(r%3600/60))+':'+p2(r%60);};
const sub=(page,list,cls)=>'<nav class="subtabs '+(cls||'')+'" style="--n:'+list.length+'" aria-label="分页">'+list.map(([k,l],i)=>
  '<button data-a="sub" data-p="'+page+'" data-v="'+k+'" aria-selected="'+(ui.sub[page]===k)+'"><span class="n">'+p2(i+1)+'</span>'+l+'</button>').join('')+'</nav>';
const sec=(page,k,html)=>'<section class="sec'+(ui.sub[page]===k?' on':'')+'" data-sec="'+k+'">'+html+'</section>';
// A pick button. k = ui path it sets, t = tap again to clear.
function cb(o){
  return '<button class="cb'+(o.cls?' '+o.cls:'')+(o.on?' on':'')+'" data-a="pick" data-k="'+o.k+'" data-v="'+esc(o.v)+'"'+(o.t===false?'':' data-t="1"')
    +(o.off?' disabled':'')+(o.title?' title="'+esc(o.title)+'"':'')+' aria-pressed="'+!!o.on+'">'
    +(o.c?'<span class="sw" style="--c:'+o.c+'"></span>':'')+'<span class="t">'+o.label+(o.small!=null?'<small>'+o.small+'</small>':'')+'</span>'
    +(o.mark===false?'':'<span class="mk">'+(o.on?'✓':'')+'</span>')+'</button>';
}
// Themed dropdown (no native <select>): a button that opens a list of pick buttons; ui.ddOpen holds the open one.
function dd(k,valLabel,placeholder,valColor,options){
  const open=ui.ddOpen===k,cur=getp(k),isOn=v=>v===cur;
  return '<div class="dd'+(open?' open':'')+'"><button class="dd-btn" data-a="dd" data-v="'+k+'" aria-expanded="'+open+'">'
    +(valColor?'<span class="sw" style="--c:'+valColor+'"></span>':'')+'<span class="t'+(valLabel?'':' ph')+'">'+(valLabel||placeholder)+'</span><span class="car">▾</span></button>'
    +(open?'<div class="dd-list" role="listbox">'+options.map(o=>o.group?'<div class="dd-g">'+o.group+'</div>'
      :'<button class="dd-o'+(isOn(o.v)?' on':'')+'" role="option" aria-selected="'+isOn(o.v)+'" data-a="pick" data-k="'+k+'" data-v="'+esc(o.v)+'"'+(o.off?' disabled':'')+'>'
        +(o.c?'<span class="sw" style="--c:'+o.c+'"></span>':'')+'<span class="t">'+o.label+'</span>'+(o.note?'<small>'+o.note+'</small>':'')+(isOn(o.v)?'<span class="mk">✓</span>':'')+'</button>').join('')+'</div>':'')+'</div>';
}
function countdown(n,short){if(!n.due)return '';const r=n.due-S.t;return r>0?(short?mmss(r):'剩余 '+mmss(r)):'已截止';}
const kindOf=n=>n.kind==='通知'?['通知','alert']:n.kind==='公告'?['公告','']:['鬼门开','task'];
// 输入编号：「1 9 17」「001,009」都行，补成 3 位
const parseIds=s=>[...new Set(String(s||'').split(/[^0-9]+/).filter(Boolean).map(x=>x.padStart(3,'0').slice(-3)))];
const findP=s=>{const t=String(s||'').trim();if(!t)return null;if(/^\d+$/.test(t))return pl(t.padStart(3,'0').slice(-3));return S.players.find(p=>p.nick===t)||null;};
// 两次确认的按钮：第一次点出现「确认」，ui.ask 记着在问哪一个
const ask2=(key,label,a,attrs,cls)=>ui.aucAsk===key
  ?'<span class="btns two2"><button class="btn-line fillred '+(cls||'')+'" data-a="'+a+'" '+(attrs||'')+'>确认'+label+'</button><button class="btn-line '+(cls||'')+'" data-a="askno">取消</button></span>'
  :'<button class="btn-line '+(cls||'')+'" data-a="askyes" data-v="'+key+'">'+label+'</button>';

// ---------- 大屏 ----------
function broadcast(n){return S.log.filter(l=>l.b).slice(0,n||5).map(l=>({t:l.t,x:l.text,c:l.kind==='hook'?'hook':l.kind==='back'?'hot':''}));}
// 房间状态：开放 / 游戏中（几人）/ 重置中。游戏、重置的计时只是显示，不会自动结束。
const RST={open:['开放','idle'],play:['游戏中','on'],reset:['重置中','rst']};
function roomCard(r,me){
  const x=S.rooms.find(y=>y.id===r.id),st=x.st,mine=!!me&&me.inRoom===r.id,L=[];
  if(st==='play')L.push('<span class="on"><i class="gd"></i><span class="tx">'+(mine?'你在这里':'游戏中')+'（<span data-rt="'+(x.at||0)+'">'+rtStr(x.at)+'</span>）</span></span>');
  else if(st==='reset')L.push('<span class="rs rst">重置中</span>');
  else L.push('<span class="idle">'+(timeUp()?'已关闭':'<i class="gd"></i>开放中')+'</span>');
  if(me&&me.cleared.includes(r.id))L.push('<span class="idle okk">✓ 你已成功</span>');
  // 人数放在最后一行的右边（放不下就自己换到下一行，仍靠右）
  if(st==='play')L[L.length-1]='<div class="bln">'+L[L.length-1]+'<span class="np">'+x.ps.length+' 人</span></div>';
  return '<div class="room s-'+(st==='open'&&timeUp()?'shut':st)+(mine?' mine':'')+'"><div class="top"><div class="cd">'+cardG(r)+'</div>'
    +'<div class="rr"><span class="pt lc">'+r.loc+'</span><span class="pt">+'+r.n*100+'</span></div></div>'
    +'<div class="bt">'+L.join('')+'</div></div>';
}
// 房间已玩时间（游戏秒）：m:ss，每秒由 tickClocks 更新
const rtStr=at=>{const s=Math.max(0,nowT()-(at||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function rankRows(n){
  const list=ranking();let rk=0,prev=null;
  return list.slice(0,n).map((p,i)=>{if(p.score!==prev){rk=i+1;prev=p.score;}
    return '<div class="prow'+(p.st!=='alive'?' down':'')+'"><span class="rk mono">'+rk+'</span>'+who(p)+suits4(p)+'<span class="sc mono">'+p.score+'</span></div>';}).join('')
    ||'<div class="prow empty"><span class="muted">还没有人上榜</span></div>';
}
function viewBoard(){
  if(drawOn())return viewDrawBoard();
  const me=ME&&ME.role==='player'?pl(ME.pid):null;
  const act=S.players.filter(p=>p.on),mk=act.filter(p=>p.st!=='alive').length;
  const bc=broadcast(8),run=CLOCK&&CLOCK.running;
  return '<div class="stage-wrap"><div class="stage">'
    +'<div class="left"><div class="hd"><div class="ttl">百鬼夜行</div><div class="en">CORNELL CSSA 万圣夜</div></div>'
    +'<div class="clock"><span class="cap">'+(run?'剩余时间':'已暂停')+'</span><span class="ck mono'+(run?'':' paused')+'" id="sclk">'+remStr(S.t)+'</span>'
    +'</div>'+gateBox()
    +'<div class="cast"><span class="cap" style="padding-bottom:8px">全场播报</span>'
    +(bc.length?bc.map(b=>'<div class="bc '+b.c+'"><span class="t">'+fmt(b.t)+'</span><span class="x">'+esc(b.x)+'</span></div>').join(''):'<div class="bc"><span class="x muted">暂无播报</span></div>')+'</div></div>'
    +'<div class="right"><div class="rank"><div class="rh"><b>金币排行</b><span>在场 '+(act.length-mk)+' 人'+(mk?'　鬼市 '+mk+' 人':'')+'</span></div><div class="plist">'+rankRows(10)+'</div></div>'
    +'<div class="rgrid">'+ROOMS.map(r=>roomCard(r,me)).join('')+'</div></div>'
    +'</div></div>';
}
// 鬼门开进行中：标题行（同排行标题样式）+ 三个名额，完成一个点亮一个
function gateBox(){
  if(!S.gp)return '';
  const n=(S.notices||[]).find(x=>x.id===S.gp.nid),w=S.gp.wins;
  return '<div class="gbox"><div class="gh"><b>鬼门开</b>'+(n&&n.title&&n.title!=='鬼门开'?'<span>'+esc(n.title)+'</span>':'')+'<span class="gc mono">'+w.length+' / '+GATE_WIN+'</span></div>'
    +'<div class="gs">'+Array.from({length:GATE_WIN},(_,i)=>{const x=w[i],p=x&&pl(x.pid);
      return '<div class="sl'+(x?' on':'')+'"><span class="mono">'+(i+1)+'</span><b>'+(x?x.pid+(p&&p.nick?' '+esc(p.nick):''):'—')+'</b></div>';}).join('')+'</div></div>';
}
// 全场播报：放不下的整条藏起来（不截半条）
function clipCast(){const c=$('.stage .cast');if(!c)return;const cb=c.getBoundingClientRect().bottom;
  c.querySelectorAll('.bc').forEach(e=>{e.style.visibility=innerWidth>=820&&e.getBoundingClientRect().bottom>cb+1?'hidden':'';});}
function fitStage(){
  const w=$('.stage-wrap'),st=w&&w.firstChild;if(!w)return;
  requestAnimationFrame(clipCast);
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

// ---------- 抽奖大屏 ----------
const PST={wait:'待抽',drawn:'待确认',done:'已颁发'},PCLS={wait:'wait',drawn:'closed',done:'done'};
const tkTxt=x=>x.kind==='tycoon'?'金币 <span class="mono">'+x.tk+'</span>'+(x.tie>1?'　并列 '+x.tie+' 人中抽出':''):'彩券 <span class="mono">'+x.tk+'</span> 张';
function drawResult(x,big){
  if(x.st==='wait'||!x.win)return '';
  const p=pl(x.win);return '<div class="adeal'+(big?' big':'')+'"><span class="aseal">'+(x.st==='done'?'中奖':'抽中')+'</span><div class="awin">'+(p?who(p):esc(x.win))+'</div><div class="aprice">'+tkTxt(x)+'</div></div>';}
function viewDrawBoard(){
  const P=S.draw.pz,x=curPrize(),i=x?P.indexOf(x):-1;
  const strip=P.map((y,j)=>{const w=y.st==='done'&&pl(y.win);
    return '<div class="alot s-'+PCLS[y.st]+(y===x?' cur':'')+'"><span class="ai mono">'+(j+1)+'</span><b>'+esc(y.name)+'</b><span class="ast">'+(w?esc(w.nick||w.id):PST[y.st])+'</span></div>';}).join('');
  const main=!x?'<div class="amain"><div class="aname">压轴抽奖</div><div class="adesc">即将开始</div></div>'
    :'<div class="amain'+(x.kind!=='small'?' grand':'')+'"><div class="aidx">'+(x.kind==='big'?'压轴大奖':'第 '+(i+1)+' 项')+'</div><div class="aname">'+esc(x.name)+'</div>'
      +(x.desc?'<div class="adesc">'+esc(x.desc)+'</div>':'')
      +(x.st==='wait'?'<div class="akey"><div class="await">即将开奖</div></div>':drawResult(x,true))+'</div>';
  return '<div class="stage-wrap"><div class="stage auc">'
    +'<div class="left"><div class="hd"><div class="ttl">压轴抽奖</div><div class="en">每人限得一件</div></div>'
    +'<div class="alots">'+strip+'</div></div>'
    +'<div class="right">'+main+'</div></div></div>';
}
// 颁发时大屏喷彩带：只在本页看到「待确认 → 已颁发」的那一刻放一次（刷新页面不会重放）
const prizeSeen={};
function confettiCheck(){
  if(!S||!S.draw||ui.tab!=='board'||ME.role==='player')return;
  for(const x of S.draw.pz){const prev=prizeSeen[x.id];prizeSeen[x.id]=x.st+':'+(x.win||'');
    if(x.st==='done'&&prev&&prev!==prizeSeen[x.id])confetti(x.kind!=='small');}
}
function confetti(big){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const box=document.createElement('div');box.className='confetti';box.setAttribute('aria-hidden','true');
  const C=['#e0483a','#f2c14e','#5fe0b4','#ffffff','#b3332a','#d4a92c','#2a9d9a'],n=big?220:140;let h='';
  for(let i=0;i<n;i++){const x=Math.random()*100,d=2.8+Math.random()*2.6,dl=Math.random()*(big?1.6:.9),w=6+Math.random()*8,r=Math.random()*360,sw=(Math.random()*2-1)*90;
    h+='<i style="left:'+x.toFixed(1)+'%;--w:'+w.toFixed(1)+'px;--h:'+(w*(1.6+Math.random())).toFixed(1)+'px;--c:'+C[i%C.length]+';--d:'+d.toFixed(2)+'s;--dl:'+dl.toFixed(2)+'s;--r:'+r.toFixed(0)+'deg;--sw:'+sw.toFixed(0)+'px"></i>';}
  box.innerHTML=h;document.body.appendChild(box);setTimeout(()=>box.remove(),(big?8000:6500));
}

// ---------- 地图（场地两层平面图，房间显示实时状态） ----------
// 坐标沿用场地图（1040×460），手机和电脑同一张图、同一比例；手机上只保留房间号和大字，游戏名看下面的列表。
// rooms：[房间 id, x, y, w, h, 牌签位置 'up'/'down']；房间号、楼层在 rules.js 的 ROOMS 里。walls：折线点。
const MAP={
  '1':{name:'一层',note:'规则讲解、抽奖、鬼市',walls:[[[340,95],[340,150],[548,150]],[[592,150],[768,150]],[[812,150],[830,150]],[[30,300],[575,300],[575,440],[830,440],[830,300],[900,300]]],
    common:[575,300,255,140],cap:'淘汰区域',ctitle:'鬼市',csub:'',
    rooms:[['4S',30,214,130,86,'down'],['8C',400,88,100,62,'up'],['4D',365,300,155,82,'down']],
    fixed:[[30,72,130,130,'175','规则讲解','最终抽奖']],tables:true},
  'B':{name:'B 层',note:'入口、签到、鬼门开',walls:[[[340,95],[340,150],[548,150]],[[592,150],[768,150]],[[812,150],[1010,150]],[[30,300],[575,300],[575,445],[830,445],[830,325]],[[885,300],[925,300]],[[1000,300],[1010,300]]],
    common:[575,300,255,145],ctitle:'鬼门开',csub:'info desk',
    rooms:[['4C',30,72,130,130,'up'],['8D',30,214,130,86,'down'],['8H',400,92,100,58,'up'],['8S',872,92,118,58,'up'],['4H',365,300,155,82,'down']],
    empty:[618,78,122,72],entry:true}};
function mapSt(r){const x=S.rooms.find(y=>y.id===r.id);
  return x.st==='play'?['游戏中 '+x.ps.length+' 人','on']:x.st==='reset'?['重置中','rst']:timeUp()?['已关闭','shut']:['开放','idle'];}
function mapSvg(fk,me){
  const F=MAP[fk],t=(x,y,c,txt)=>'<text x="'+x+'" y="'+y+'" class="'+c+'">'+txt+'</text>';
  const line=pts=>pts.map((q,i)=>(i?'L':'M')+q[0]+' '+q[1]).join('');
  const stairs=x=>'<g class="mp-stair"><rect x="'+x+'" y="112" width="44" height="38"/>'+[121,130,139].map(y=>'<path d="'+line([[x,y],[x+44,y]])+'"/>').join('')+t(x+22,102,'mp-sl','楼梯')+'</g>';
  const c=F.common;
  let h='<svg viewBox="0 0 1040 460" role="img" aria-label="'+F.name+'平面图">'
    +'<defs><pattern id="mph'+fk+'" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" class="mp-hl"/></pattern></defs>'
    +'<rect class="mp-common" x="'+c[0]+'" y="'+c[1]+'" width="'+c[2]+'" height="'+c[3]+'"/><path class="mp-wall" d="'+F.walls.map(line).join('')+'"/>'
    +t(190,232,'mp-cor','走 廊')+stairs(548)+stairs(768)
    +t(600,c[1]+30,'mp-cap',F.cap||'公共区域')+t(600,c[1]+72,'mp-ct',F.ctitle)+(F.csub?t(600,c[1]+100,'mp-cs',F.csub):'');
  if(F.tables)h+=[620,670,720,770].map(x=>'<g class="mp-tb" transform="translate('+x+' 416)"><circle class="t" r="9"/>'+[[0,-14],[0,14],[-14,0],[14,0]].map(([q,w])=>'<circle class="c" cx="'+q+'" cy="'+w+'" r="2.5"/>').join('')+'</g>').join('');
  if(F.empty)h+='<rect class="mp-empty" x="'+F.empty[0]+'" y="'+F.empty[1]+'" width="'+F.empty[2]+'" height="'+F.empty[3]+'" fill="url(#mph'+fk+')"/>';
  (F.fixed||[]).forEach(([x,y,w,hh,n,a,b])=>{h+='<g class="mp-fix"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+hh+'"/>'+t(x+w/2,y+hh/2,'mp-num',n)+'</g>'+t(x,y-40,'mp-gn plain',a)+t(x,y-12,'mp-gn plain',b);});
  F.rooms.forEach(([id,x,y,w,hh,pos])=>{const r=room(id),[sl,sc]=mapSt(r),mine=me&&me.inRoom===id,done=me&&me.cleared.includes(id),cx=x+w/2,cy=y+hh/2,small=hh<70,ty=pos==='up'?y-36:y+hh+14;
    h+='<g class="mp-room s-'+sc+(mine?' mine':'')+(ui.msel===id?' sel':'')+'" data-a="msel" data-v="'+id+'" role="button" aria-label="'+r.loc+' '+r.card+' '+esc(r.name)+' '+sl+'">'
      +'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+hh+'" rx="3"/>'
      +t(cx,cy-(small?8:14),'mp-num',r.loc)+t(cx,cy+(small?16:20),'mp-st',mine?'你在这里':done?'✓ 已成功':sl)+t(cx,cy,'mp-num mp-only',r.loc)
      +'<g class="mp-tag'+(isRed(r.suit)?' red':'')+'" transform="translate('+x+' '+ty+')"><rect width="44" height="26" rx="4"/>'+t(22,19,'',r.n+r.suit)+'</g>'
      +t(x+54,ty+20,'mp-gn',esc(r.name))+'</g>';});
  if(F.entry)h+='<g class="mp-in"><rect x="802" y="276" width="84" height="48" rx="4"/>'+t(844,307,'','签到')+'</g>'
    +'<path class="mp-door" d="'+line([[925,300],[917,322]])+line([[1000,300],[1008,322]])+'"/>'
    +'<path class="mp-arrow" d="'+line([[962,382],[962,316]])+line([[954,326],[962,316],[970,326]])+'"/>'+t(962,410,'mp-ent','入口');
  return h+'</svg>';
}
function viewMap(){
  const me=ME&&ME.role==='player'?pl(ME.pid):null;
  if(!ui.mapInit){ui.mapInit=1;if(me&&me.inRoom)ui.sub.map=room(me.inRoom).fl;}
  const floor=fk=>{const F=MAP[fk];return sec('map',fk,'<div class="mp-head"><h2 class="sh">'+F.name+'</h2><span class="hint">'+F.note+'</span></div><div class="mp-plan">'+mapSvg(fk,me)+'</div>');};
  const list=fk=>'<div class="mp-list"><h3>'+MAP[fk].name+'</h3>'+ROOMS.filter(r=>r.fl===fk).map(r=>{const [sl,sc]=mapSt(r);
    return '<button class="mp-li'+(ui.msel===r.id?' on':'')+'" data-a="msel" data-v="'+r.id+'"><span class="mono">'+r.loc+'</span><span class="mp-card'+(isRed(r.suit)?' sr':'')+'">'+r.n+r.suit+'</span><span class="nm">'+esc(r.name)+'</span><span class="mp-s '+sc+'">'+(me&&me.inRoom===r.id?'你在这里':me&&me.cleared.includes(r.id)?'✓ 已成功':sl)+'</span></button>';}).join('')+'</div>';
  return '<div class="page tabbed mapp">'+sub('map',[['1','一层'],['B','B 层']],'top')+floor('1')+floor('B')
    +'<div class="pn mp-idx">'+list('1')+list('B')+'</div></div>';
}

// ---------- Dealer ----------
function viewDealer(){
  const mine=ME.role==='dealer'&&Array.isArray(ME.rooms)?ME.rooms:null;
  if(mine&&!mine.length)return '<div class="page"><div class="pn"><h2 class="sh">还没有房间</h2><span class="muted">这个 PIN 没有对应的房间，请总控重新生成 Dealer PIN。</span></div></div>';
  if(mine&&!mine.includes(ui.room)){ui.room=mine[0];ui.ent='';ui.res={};ui.settled=null;}
  const r=room(ui.room),x=S.rooms.find(y=>y.id===r.id),st=x.st,cap=S.capOn?(S.cap||R.ROOM_CAP0):Infinity;
  const rooms=mine&&mine.length===1?'':'<div class="sec on" style="gap:10px"><span class="lbl">'+(mine?'我负责的房间':'全部房间')+'</span><div class="rooms8">'+ROOMS.filter(y=>!mine||mine.includes(y.id)).map(y=>{const q=S.rooms.find(z=>z.id===y.id);
    const kc=RST[q.st][1];
    return '<button class="rbtn'+(y.id===ui.room?' on':'')+'" data-a="room" data-v="'+y.id+'" aria-pressed="'+(y.id===ui.room)+'"><span class="n">'+cardG(y)+'</span><span class="nm">'+y.name+'</span>'
      +'<span class="st '+kc+'">'+(kc!=='rst'?'<i class="gd"></i>':'')+RST[q.st][0]+(q.ps.length?' '+q.ps.length+' 人':'')+'</span></button>';}).join('')+'</div></div>';
  const timer=st!=='open'?'已 '+mmss(Math.max(0,S.t-x.at)):'';
  const hero='<div class="hero"><div class="tile"><span class="tn">'+r.n+'</span><span class="ts '+(isRed(r.suit)?'sr':'')+'">'+r.suit+'</span></div>'
    +'<div class="info"><div class="meta"><span class="typ">'+r.loc+'</span><span class="typ">'+TYPE[r.suit]+'</span><span class="coins">+'+r.n*100+' <small>金币</small></span></div>'
    +'<div class="name"><b>'+r.name+'</b>'+(ui.settled&&ui.settled.rid===r.id&&st==='reset'?'<span class="stamp">已结算</span>':'')+'</div>'
    +'<span class="status '+RST[st][1]+'">'+(RST[st][1]!=='rst'?'<i class="gd"></i>':'')+RST[st][0]+(x.ps.length?' '+x.ps.length+(S.capOn?' / '+cap:'')+' 人':'')+(timer?'　'+timer:'')+'</span></div></div>';
  // 入场：输入编号（可多人）
  let entry;
  if(timeUp())entry='<div class="empty">时间到，房间已关闭。房里的人照常结算。</div>';
  else if(st==='reset')entry='<div class="empty">重置好后到「结算」页点「重置完成」</div>';
  else{
    const ids=parseIds(ui.ent),bad=ids.map(id=>[id,whyNotEnter(id,r.id)]).filter(([,w])=>w),okIds=ids.filter(id=>!whyNotEnter(id,r.id)),full=x.ps.length+ids.length>cap;
    entry='<label class="fld"><span>玩家编号（多个用空格隔开）</span><input class="in mono entin" id="entin" data-m="ent" value="'+esc(ui.ent)+'" inputmode="numeric" placeholder="例如 1 9 17" autocomplete="off"></label>'
      +(ids.length?'<div class="entl">'+ids.map(id=>{const p=pl(id),w=whyNotEnter(id,r.id);return '<span class="ent'+(w?' bad':'')+'"><b class="mono">'+id+'</b>'+(p&&p.nick?' '+esc(p.nick):'')+(w?'<small>'+esc(w)+'</small>':'')+'</span>';}).join('')+'</div>':'')
      +'<button class="btn-main" data-a="enter"'+(okIds.length&&!bad.length&&!full?'':' disabled')+'>'+(!ids.length?'先输入编号':bad.length?'有 '+bad.length+' 人不能入场':full?'超过房间容量 '+cap+' 人':'放行 '+ids.length+' 人入场')+'</button>';
  }
  const info='<div class="pn" style="gap:14px"><h2 class="sh">入场</h2>'
    +'<div class="rwl"><span><b class="acc">赢</b> '+(r.solo?'独自通关 +'+r.solo+'，带人通关各 +'+r.n*100:'+'+r.n*100)+' 金币 + '+r.suit+'</span><span><b class="red">输</b> 进鬼市，原地等黑白无常</span><span class="sub">中途放弃算输，每人每间只能成功一次</span></div>'+entry+'</div>';
  // 规则：Dealer 自己能改（点「修改」→ 文本框 → 保存；清空保存 = 恢复原文）
  const rTxt=R.roomRule(r.id),rEd=ui.ruleEd===r.id,rMod=!!(S.rules&&S.rules[r.id]);
  const rulePn='<div class="pn" style="gap:10px"><div class="shrow"><h2 class="sh">规则</h2>'+(rEd?'':'<button class="btn-line" data-a="ruleed">修改</button>')+'</div>'
    +(rEd?'<textarea class="in rulein" id="rulein" data-m="ruleTx" rows="12" placeholder="清空后保存 = 恢复原文">'+esc(ui.ruleTx)+'</textarea>'
      +'<div class="btns"><button class="btn-main" data-a="rulesave">保存</button><button class="btn-line" data-a="rulecancel">取消</button>'+(rMod?'<button class="btn-line" data-a="rulereset">恢复原文</button>':'')+'</div>'
      :(rTxt?'<div class="rule rtx">'+esc(rTxt)+'</div>':'<span class="muted">还没有规则，点「修改」写一份</span>'))+'</div>';
  // 结算：每人一行 赢 / 输（中途放弃算输）
  const done=ui.settled&&ui.settled.rid===r.id&&st==='reset';
  Object.keys(ui.res).forEach(id=>{if(!x.ps.includes(id))delete ui.res[id];});
  const pending=x.ps.filter(id=>!ui.res[id]).length,ready=x.ps.length&&!pending;
  const rows=x.ps.map(id=>{const p=pl(id),v=ui.res[id]||'';
    return '<div class="rt rp"><div class="hd">'+who(p)+'</div>'+(v?'<span class="stamp">'+({win:'胜',solo:'胜',lose:'负'})[v]+'</span>':'')
      +'<div class="wl'+(r.solo?' w3':'')+'" role="group" aria-label="'+id+' 结果">'+(r.solo?'<button class="w" data-a="res" data-t="'+id+'" data-v="solo" aria-pressed="'+(v==='solo')+'">独自通关</button>':'')
      +'<button class="w" data-a="res" data-t="'+id+'" data-v="win" aria-pressed="'+(v==='win')+'">'+(r.solo?'带人通关':'赢')+'</button>'
      +'<button class="l" data-a="res" data-t="'+id+'" data-v="lose" aria-pressed="'+(v==='lose')+'">输</button>'
      +'</div>'
      +(ui.kickAsk===id?'<span class="btns"><button class="btn-line fillred" data-a="kick" data-v="'+id+'">确认移出（不计结果）</button><button class="btn-line" data-a="kickno">取消</button></span>'
        :'<button class="btn-line kickb" data-a="kickask" data-v="'+id+'">进错了，移出</button>')+'</div>';}).join('');
  const W=x.ps.filter(i=>ui.res[i]==='win'),So=x.ps.filter(i=>ui.res[i]==='solo'),Lo=x.ps.filter(i=>ui.res[i]==='lose');
  const summary=done?esc(ui.settled.msg):!x.ps.length?'':!ready?'还有 '+pending+' 人没选结果'
    :[So.length?'独自通关 '+So.join('、')+'（+'+r.solo+'）':'',W.length?'赢 '+W.join('、')+'（各 +'+r.n*100+'）':'',Lo.length?'输 '+Lo.join('、')+'（进鬼市）':''].filter(Boolean).join('；');
  const allBtns=x.ps.length>1&&!r.solo?'<div class="btns"><button class="btn-line" data-a="resall" data-v="win">全部赢</button><button class="btn-line" data-a="resall" data-v="lose">全部输</button></div>':'';
  const resetBtn='<button class="btn-main glow" data-a="resetdone" style="min-height:60px;letter-spacing:.1em">重置完成，重新开放</button><span class="small center">'+(done?esc(ui.settled.msg)+'。':'')+'点了之后，玩家才能再进这间房</span>';
  const settle='<div class="pn" style="gap:14px"><div class="shrow"><h2 class="sh">房间里的人</h2><span class="hint" style="font-weight:700;color:'+(ready?'var(--accent)':pending?'var(--sub)':'var(--sub)')+'">'+(st==='reset'?'重置中':!x.ps.length?'等待入场':pending?x.ps.length+' 人':'都选好了')+'</span></div>'
    +(st==='reset'?resetBtn:(rows?allBtns+'<div class="rteams">'+rows+'</div>':'<div class="empty">房间里还没有人</div>')
    +'<span class="sum'+(ready?' ready':'')+'">'+summary+'</span>'
    +'<button class="btn-main'+(ready?' glow':'')+'" id="finbtn" data-a="finish"'+(ready?'':' disabled')+' style="min-height:60px;letter-spacing:.14em">结束并结算</button>'
    +'<span class="small center">结算后立即发放，房间随即进入重置，请先核对</span>')+'</div>';
  return '<div class="page tabbed">'+rooms+hero+'<div class="cols-dealer">'+sec('dealer','info',info)+sec('dealer','settle',settle)+'</div>'+(rulePn?sec('dealer','info',rulePn):'')
    +sub('dealer',[['info','入场'],['settle','结算'+(x.ps.length?'（'+x.ps.length+'）':'')]])+'</div>';
}

// ---------- 判官 ----------
// 鬼门开：最先完成的 3 人，每人选 300 金币 / 救一个人 / 拿一个花色
function gatePanel(){
  const g=S.gp;
  if(!g){ui.gateEndAsk=false;
    const j=ui.jg,gq=GATES.find(x=>x.id===j.gate),cus=j.gate==='custom',okp=gq||(cus&&j.title.trim());
    const last=S.notices.filter(n=>n.sub==='gate'&&n.gr).slice(0,2);
    return '<div class="pn gatep"><div class="shrow"><h3>鬼门开</h3><span class="small">当前没有鬼门开</span></div>'
      +'<div class="fld"><span>题库</span>'+dd('jg.gate',gq?gq.title:cus?'自定义':'','选择鬼门开',null,[...GATES.map(x=>({v:x.id,label:esc(x.title)})),{v:'custom',label:'自定义'}])+'</div>'
      +(gq?gateRef(gq):'')
      +(cus?'<label class="fld"><span>标题</span><input class="in" id="jgt" data-m="jg.title" value="'+esc(j.title)+'" placeholder="鬼门开题目"></label><label class="fld"><span>内容</span><textarea class="in" id="jgb" data-m="jg.body" rows="3">'+esc(j.body)+'</textarea></label>':'')
      +'<label class="fld"><span>限时（分钟，0 = 不限时）</span><input class="in mono" id="jgm" data-m="jg.mins" value="'+esc(j.mins)+'" inputmode="numeric"></label>'
      +'<button class="btn-main'+(okp?' glow':'')+'" data-a="jgpub"'+(okp?'':' disabled')+' style="min-height:52px">'+(okp?'发布鬼门开（全场）':'先选择鬼门开')+'</button>'
      +(last.length?'<span class="lbl">之前的鬼门开</span>'+last.map(n=>'<div class="li"><div class="grow"><span class="t">'+fmt(n.t)+'</span><span class="x">'+esc(n.title)+'：'+(n.gr.length?n.gr.map(w=>w.pid+' '+rwTxt(w.rw)).join('，'):'无人完成')+'</span></div></div>').join(''):'')+'</div>';}
  const gn=S.notices.find(x=>x.id===g.nid),live=gn&&gn.due&&gn.due>S.t;
  const unrw=g.wins.filter(w=>!w.rw);
  const end=ui.gateEndAsk?(unrw.length?'<div class="gatebar"><b>还有 '+unrw.length+' 人没领奖</b><span>'+unrw.map(w=>w.pid).join('、')+'，结束后将无法再领</span></div>':'')
      +'<button class="btn-line fillred" data-a="gateend" style="min-height:48px;font-weight:900">确认结束鬼门开</button><button class="btn-line" data-a="gateendno" style="min-height:48px">取消</button>'
    :'<button class="btn-line" data-a="gateendask">结束鬼门开</button>';
  const head='<div class="shrow"><h3>鬼门开进行中</h3>'+(gn&&gn.due?'<span class="tm'+(live?' live':'')+'">'+(live?'<i class="gd r"></i>':'')+countdown(gn)+'</span>':'')+'</div>'+(gn?'<div class="ttitle"><b>'+esc(gn.title)+'</b></div>':'');
  const gp=findP(ui.gw),gwhy=!ui.gw?'':!gp?'没有这个编号':g.wins.some(w=>w.pid===gp.id)?'已经记过了':gp.st!=='alive'?'不在场':'';
  const rec=g.wins.length<GATE_WIN?'<span class="lbl">第 '+(g.wins.length+1)+' 个完成的人</span><div class="btns"><input class="in mono" id="gwin" data-m="gw" value="'+esc(ui.gw)+'" inputmode="numeric" placeholder="编号" style="max-width:140px">'
      +'<button class="btn-main'+(gp&&!gwhy?' glow':'')+'" data-a="gatewin"'+(gp&&!gwhy?'':' disabled')+'>'+(gp&&!gwhy?'记 '+gp.id+(gp.nick?' '+esc(gp.nick):'')+' 为第 '+(g.wins.length+1)+' 名':gwhy||'输入编号')+'</button></div>':'<div class="lot">前 '+GATE_WIN+' 名已满，给每人选奖励</div>';
  const downs=S.players.filter(p=>p.on&&p.st!=='alive');
  const wins=g.wins.map((w,i)=>{const p=pl(w.pid),k='gr.'+w.pid,c=ui.gr[w.pid]||{};
    if(w.rw)return '<div class="gwin ok"><span class="gno mono">'+(i+1)+'</span>'+who(p)+'<span class="small">'+rwTxt(w.rw)+'</span></div>';
    const miss=SUITS.filter(s=>!p.cards.includes(s));
    const pickBody=c.k==='save'?'<div class="fld"><span>救谁（不在场的人）</span>'+dd(k+'.arg',c.arg&&nm(pl(c.arg)),downs.length?'选择要救的人':'现在没有人不在场',null,downs.map(q=>({v:q.id,label:q.id+(q.nick?' '+esc(q.nick):''),note:stLabel(q)})))+'</div>'
      :c.k==='suit'?'<div class="chips c4">'+SUITS.map(s=>cb({k:k+'.arg',v:s,on:c.arg===s,off:!miss.includes(s),label:suitG(s),small:miss.includes(s)?'':'已有',mark:false})).join('')+'</div>':'';
    const okr=c.k==='coin'||(c.k&&c.arg);
    return '<div class="gwin"><div class="shrow"><span class="gno mono">'+(i+1)+'</span>'+who(p)+'<button class="btn-line" data-a="gateunwin" data-v="'+w.pid+'">撤销</button></div>'
      +'<div class="seg3">'+[['coin','+'+GATE_COIN+' 金币'],['save','救一个人'],['suit','拿一个花色']].map(([v,l])=>'<button class="sbtn'+(c.k===v?' on':'')+'" data-a="pick" data-k="'+k+'.k" data-v="'+v+'" aria-pressed="'+(c.k===v)+'">'+l+'</button>').join('')+'</div>'
      +pickBody+'<button class="btn-main'+(okr?' glow':'')+'" data-a="gatereward" data-v="'+w.pid+'"'+(okr?'':' disabled')+'>'+(okr?'发放奖励':'先选奖励')+'</button></div>';}).join('');
  return '<div class="pn gatep">'+head+rec+wins+'<div class="btns">'+end+'</div></div>';
}
// 判官看到的鬼门开说明：玩家收到的一句话 + 简要规则
const gateRef=g=>'<div class="lot gref"><div><b>玩家收到：</b>'+esc(g.body)+'</div>'+(g.rule?'<div><b>规则：</b>'+esc(g.rule)+'</div>':'')+'</div>';
const rwTxt=r=>!r?'未领奖':r.k==='coin'?'+'+GATE_COIN+' 金币':r.k==='save'?'救了 '+r.pid:'拿了 '+r.s;
function puzPanel(){
  const z=ui.pz,p=findP(z.pid),code=puzCode(z.code),bank=S.bank||{},nb=Object.keys(bank).length,q=code&&bank[code],key=code&&'z'+code;
  const why=!z.pid?'先输入玩家编号':!p?'没有这个玩家':!code?'先输入谜题编码':p.st!=='alive'?p.id+' 不在场':p.puz.some(r=>r.k===key)?p.id+' 已经兑换过 #'+code:puzInfo(p).left<=0?p.id+' 已达上限 '+PUZ_CAP:'';
  const recs=S.players.flatMap(x=>x.puz.map(r=>({p:x,r}))).sort((a,b)=>b.r.t-a.r.t).slice(0,12);
  const card=!code?'':q?'<div class="pzq"><span class="k">#'+code+' 题目</span><div class="q">'+esc(q.q)+'</div><span class="k">答案</span><div class="a">'+esc(q.a)+'</div></div>'
    :'<div class="lot">题库里没有 #'+code+(nb?'':'（题库还没导入）')+'，照样可以兑换。</div>';
  return '<div class="pn" style="gap:12px"><div class="shrow"><h3>解谜题兑换</h3><span class="small">每题 +'+PUZ_PTS+'，每人最多 '+PUZ_CAP+'</span></div>'
    +'<div class="fgrid pz2"><label class="fld"><span>玩家编号</span><input class="in mono" id="pzp" data-m="pz.pid" value="'+esc(z.pid)+'" inputmode="numeric" placeholder="例如 7"></label>'
    +'<label class="fld"><span>谜题编码</span><input class="in mono" id="pzc" data-m="pz.code" value="'+esc(z.code)+'" inputmode="numeric" placeholder="例如 12"></label></div>'
    +card+(p?'<span class="small">'+p.id+(p.nick?' '+esc(p.nick):'')+'　已兑换 '+puzInfo(p).used+' / '+PUZ_CAP+'</span>':'')
    +'<button class="btn-main'+(why?'':' glow')+'" data-a="puz"'+(why?' disabled':'')+'>'+(why||'确认 '+p.id+' 答对 #'+code+'，+'+PUZ_PTS)+'</button>'
    +'<div style="display:flex;flex-direction:column"><span class="lbl" style="padding-top:6px">最近兑换</span>'+(recs.length?recs.map(({p,r})=>'<div class="li"><div class="grow"><span class="t">'+fmt(r.t)+'</span><span class="x">'+p.id+(p.nick?' '+esc(p.nick):'')+' 解出 '+esc(r.title)+' <span class="mono">+'+r.pts+'</span></span></div>'
      +'<button class="btn-line" data-a="puzundo" data-p="'+p.id+'" data-v="'+esc(r.k)+'">撤销</button></div>').join(''):'<div class="li small">暂无记录</div>')+'</div>'
    +(nb?'':'<span class="small">题库还没导入（总控工具 → 解谜题库）</span>')+'</div>';
}
function viewNpc(){
  return '<div class="page tabbed"><div class="cols2">'+sec('npc','gate','<h2 class="sh">鬼门开</h2>'+gatePanel())+sec('npc','puz','<h2 class="sh">解谜题</h2>'+puzPanel())+'</div>'
    +sub('npc',[['gate','鬼门开'+(S.gp?' ●':'')],['puz','解谜题']])+'</div>';
}

// ---------- 压轴抽奖（判官主持） ----------
function viewDraw(){
  const D=S.draw,P=D.pz,x=curPrize(),on=drawOn();
  const scr='<div class="pn ascr"><div class="shrow"><h3>大屏显示</h3></div><div class="seg2">'
    +'<button class="sbtn'+(!on?' on':'')+'" data-a="scrask" data-v="0" aria-pressed="'+(!on)+'">游戏大屏</button>'
    +'<button class="sbtn'+(on?' on':'')+'" data-a="scrask" data-v="1" aria-pressed="'+on+'">抽奖大屏</button></div></div>';
  const pool=R.drawPool(x).map(p=>({p,tk:ticketsOf(p)})).sort((a,b)=>b.tk-a.tk||b.p.score-a.p.score||a.p.id.localeCompare(b.p.id));
  const sum=pool.reduce((a,b)=>a+b.tk,0),tyc=x&&x.kind==='tycoon';
  const tl=ui.showTk?'<div class="alist">'+(pool.length?pool.map(({p,tk})=>'<div class="li"><div class="grow"><span class="x">'+who(p)+'</span></div><b class="mono">'+(tyc?p.score+' 金币':tk+' 张')+'</b></div>').join(''):'<div class="li small">没有可以抽的人</div>')+'</div>':'';
  const tkp='<div class="pn finl"><div class="shrow"><h3>参与抽奖</h3><span class="small"><b class="mono">'+pool.length+'</b> 人　彩券共 <b class="mono">'+sum+'</b> 张</span></div>'
    +'<span class="small">在场且没中过奖的人。鬼市里、待接的人不算。</span>'
    +'<div class="shrow"><span></span><button class="btn-line" data-a="showtk">'+(ui.showTk?'收起名单':'查看名单')+'</button></div>'+tl+'</div>';
  let cur;
  if(!x)cur='<div class="pn acur"><h3>当前奖品</h3><span class="muted">在奖品列表里「选中」一个。</span></div>';
  else{
    let ctl='';
    if(x.st==='wait')ctl='<button class="btn-main glow abig" data-a="drawrun"'+(pool.length&&(tyc?pool.some(r=>r.p.score>0):sum>0)?'':' disabled')+'>抽一位</button>';
    else if(x.st==='drawn')ctl='<button class="btn-main glow abig" data-a="drawok">确认得主</button>'+ask2('redo','不在场，重抽','drawredo','','abig');
    else ctl=ask2('undo','撤销得主，重新抽','drawundo','','')+(P.some(y=>y.st==='wait')?'<button class="btn-main abig" data-a="drawnext">下一个</button>':'');
    cur='<div class="pn acur'+(x.kind!=='small'?' grand':'')+'"><div class="shrow"><h3>'+esc(x.name)+'</h3><span class="kb '+(x.st==='drawn'?'task':'')+'">'+PST[x.st]+'</span></div>'
      +(x.kind==='tycoon'||x.desc?'<span class="small">'+(x.kind==='tycoon'?'金币最多的人直接得，并列则在并列的人里抽':'')+(x.desc?(x.kind==='tycoon'?'　':'')+esc(x.desc):'')+'</span>':'')
      +drawResult(x)+ctl+'</div>';
  }
  const list=P.map((y,i)=>{const w=y.st==='done'&&pl(y.win),ed=ui.pzEdit===y.id;
    if(ed)return '<div class="alrow ed">'+pzForm('pe')+'<div class="btns"><button class="btn-main" data-a="pzsave" data-v="'+y.id+'">保存</button><button class="btn-line" data-a="pzcancel">取消</button>'+ask2('del:'+y.id,'删除','pzdel','data-v="'+y.id+'"','')+'</div></div>';
    return '<div class="alrow'+(y===x?' cur':'')+'"><span class="ai mono">'+(i+1)+'</span><div class="grow"><b>'+esc(y.name)+(y.kind!=='small'&&y.name!==KIND_NAME[y.kind]?' <span class="kb task">'+KIND_NAME[y.kind]+'</span>':'')+'</b><span class="small">'+PST[y.st]+(w?'　'+w.id+' '+esc(w.nick||''):'')+'</span></div>'
      +'<span class="btns">'+(y!==x?'<button class="btn-line" data-a="drawshow" data-v="'+y.id+'"'+(P.some(z=>z.st==='drawn'&&z!==y)?' disabled title="先确认或重抽当前得主"':'')+'>选中</button>':'<span class="small acc">当前</span>')
      +(y.st==='wait'?'<button class="btn-line" data-a="pzedit" data-v="'+y.id+'">改</button><button class="btn-line" data-a="pzmove" data-v="'+y.id+'" data-d="-1" aria-label="上移">↑</button><button class="btn-line" data-a="pzmove" data-v="'+y.id+'" data-d="1" aria-label="下移">↓</button>':'')+'</span></div>';}).join('');
  const add='<div class="pn"><h3>奖品列表</h3><div class="alist">'+(list||'<div class="li small">还没有奖品</div>')+'</div>'
    +(ui.addPz||!P.length?'<div class="addlot"><div class="shrow"><b>添加奖品</b>'+(P.length?'<button class="btn-line" data-a="addpz" data-v="0">收起</button>':'')+'</div>'+pzForm('nw')+'<button class="btn-line acc" data-a="pzadd">添加</button></div>'
      :'<button class="btn-line acc" data-a="addpz" data-v="1" style="align-self:flex-start">＋ 添加奖品</button>')+'</div>';
  return '<div class="page"><div class="cols2 aucg"><div class="stack">'+scr+cur+tkp+'</div><div class="stack">'+add+'</div></div></div>';
}
function pzForm(k){const f=ui[k];
  return '<label class="fld"><span>名称</span><input class="in" data-m="'+k+'.name" value="'+esc(f.name)+'" placeholder="例如：拍立得"></label>'
    +'<label class="fld"><span>说明（可不填）</span><input class="in" data-m="'+k+'.desc" value="'+esc(f.desc)+'"></label>'
    +'<div class="fld"><span>类型</span><div class="chips c3">'+['tycoon','big','small'].map(v=>'<button class="cb'+(f.kind===v?' on':'')+'" data-a="pzkind" data-k="'+k+'" data-v="'+v+'" aria-pressed="'+(f.kind===v)+'"><span class="t">'+KIND_NAME[v]+'</span></button>').join('')+'</div></div>';}

// ---------- 鬼市 ----------
// 入鬼市登记：黑白无常或孟婆谁点都行，另一方确认。
const canConfirm=p=>!!p.chk&&!p.chk.ok&&(p.chk.by==='mengpo'?ME.role==='wuchang':p.chk.by==='wuchang'&&ME.role==='mengpo');
const chkBit=p=>!p.chk?'':p.chk.ok?'<span class="chk ok">登记已确认</span>':canConfirm(p)?'<button class="btn-line fill chkbtn" data-a="confirmin" data-p="'+p.id+'">确认入鬼市</button>':'<span class="chk wait">待'+(p.chk.by==='mengpo'?'黑白无常':'孟婆')+'确认</span>';
function inboundPanel(){
  const wait=S.players.filter(p=>p.st==='out'||p.st==='picked'||(p.st==='market'&&p.chk&&!p.chk.ok)).sort((a,b)=>a.outAt-b.outAt);
  const rows=wait.map(p=>'<div class="mrow'+(p.st==='picked'?' ok':'')+'"><div class="l1">'+who(p)
    +'<span class="stay">'+(p.chk&&!p.chk.ok?(p.chk.by==='mengpo'?'<b>孟婆已登记，等黑白无常确认</b>':'<b>黑白无常已送来，等孟婆确认</b>'):p.st==='picked'?'<b>已被黑白无常接到</b>':'等黑白无常来接')+'</span></div>'
    +'<div class="l1"><span class="stay">位置：<b>'+esc(p.at||'未记录')+'</b>　已等 <b class="mono">'+mm(S.t-(p.outAt||S.t))+'</b></span></div>'
    +(p.chk&&!p.chk.ok?chkBit(p):'<button class="btn-main'+(p.st==='picked'?' glow':'')+'" data-a="checkin" data-p="'+p.id+'">登记入鬼市</button>')+'</div>').join('');
  return '<section class="mcol"><div class="shrow"><h2 class="sh">待入鬼市</h2><span class="hint">双方确认后金币冻结，发 '+CHIP_START+' 筹码</span></div>'
    +(rows?'<div class="mlist">'+rows+'</div>':'<div class="empty">现在没有等着入鬼市的人。</div>')+'</section>';
}
function viewMarket(){
  const mk=S.players.filter(inMk).sort((a,b)=>a.inAt-b.inAt),shut=marketShut();
  const rows=mk.map(p=>{const a=ui.mkAsk;
    const byId=ui.ransomBy[p.id]||'',by=findP(byId),bw=!byId?'':!by?'没有这个编号':by.id===p.id?'不能自己赎自己':by.st!=='alive'?by.id+' 不在场':by.score<RANSOM?by.id+' 只有 '+by.score:'';
    const act=a&&a.pid===p.id?'<div class="rvask"><button class="btn-main glow" data-a="mkok">'+({redeem:'确认自赎（筹码已赢到 '+CHIP_GOAL+'）',soup:'确认喝孟婆汤（随机忘掉一个花色）',ransom:'确认 '+(by?by.id:'')+' 出 '+RANSOM+' 金币赎人'})[a.k]+'</button><button class="btn-line" data-a="mkno">取消</button></div>'
      :shut?'<span class="chk wait">已停止发放复活名额</span>'
      :'<div class="btns mkbtns two2"><button class="btn-main" data-a="mkask" data-p="'+p.id+'" data-v="redeem">自赎（赢到 '+CHIP_GOAL+'）</button><button class="btn-main red" data-a="mkask" data-p="'+p.id+'" data-v="soup">输光：孟婆汤</button></div>'
        +'<div class="give"><input class="in mono" data-m="ransomBy" data-p="'+p.id+'" value="'+esc(byId)+'" inputmode="numeric" placeholder="出钱人编号" aria-label="出钱人编号">'
        +'<button data-a="mkask" data-p="'+p.id+'" data-v="ransom"'+(by&&!bw?'':' disabled')+'>'+(bw||'别人花 '+RANSOM+' 金币赎他')+'</button></div>';
    return '<div class="mrow"><div class="l1">'+who(p)+'<span class="stay">已待 <b class="mono">'+mm(S.t-p.inAt)+'</b></span><span class="stay">冻结金币 <b class="mono">'+p.score+'</b></span><span class="stay">'+suits4(p)+'</span></div>'
      +act+'</div>';}).join('');
  const left='<section class="mcol"><div class="shrow"><h2 class="sh">鬼市</h2><span class="hint">领 '+CHIP_START+' 筹码，赢到 '+CHIP_GOAL+' 自赎，输光喝孟婆汤（随机忘一个花色），别人可花 '+RANSOM+' 金币赎人</span></div>'
    +(shut?'<div class="gatebar"><b>已停止复活</b><span>时间截止已过 15 分钟</span></div>':'')
    +(rows?'<div class="mlist">'+rows+'</div>':'<div class="empty">鬼市现在没有人。</div>')+'</section>';
  return lanternsHtml()+'<div class="page mkt">'+left+inboundPanel()+'</div>';
}

// ---------- 黑白无常 ----------
function viewWuchang(){
  const meta=p=>'<div class="l1">'+who(p)+'<span class="stay">位置：<b>'+esc(p.at||'未记录')+'</b></span><span class="stay">已等 <b class="mono">'+mm(S.t-(p.outAt||S.t))+'</b></span></div>';
  const wait=S.players.filter(p=>p.st==='out'&&!p.chk).sort((a,b)=>a.outAt-b.outAt);
  const go=S.players.filter(p=>p.st==='picked'||(p.chk&&!p.chk.ok&&p.st!=='alive')).sort((a,b)=>(a.outAt||0)-(b.outAt||0));
  const left='<section class="mcol"><div class="shrow"><h2 class="sh">待接的人</h2><span class="hint">谁在哪里失败了；接到后点「接到了」</span></div>'
    +(wait.length?'<div class="mlist">'+wait.map(p=>'<div class="mrow">'+meta(p)+'<button class="btn-main glow" data-a="pickup" data-p="'+p.id+'">接到了</button></div>').join('')+'</div>':'<div class="empty">现在没有人需要接。</div>')+'</section>';
  const right='<section class="mcol"><div class="shrow"><h2 class="sh">送入鬼市 / 确认</h2><span class="hint">已接到的人送去鬼市；孟婆已登记的人在这里确认</span></div>'
    +(go.length?'<div class="mlist">'+go.map(p=>'<div class="mrow ok">'+meta(p)+(p.chk&&!p.chk.ok?chkBit(p):'<button class="btn-main glow" data-a="checkin" data-p="'+p.id+'">送入鬼市</button>')+'</div>').join('')+'</div>':'<div class="empty">没有需要送入或确认的人。</div>')+'</section>';
  return '<div class="page mkt eq wuchang-layout">'+left+'<div class="wc-mask" aria-hidden="true"><div class="wc-in"><img src="img/mask-tongue.webp" alt=""></div></div>'+right+'</div>';
}

// ---------- 生死簿 ----------
const FLT=[['all','全部'],['alive','存活'],['down','淘汰'],['off','未上榜']];
function playerTable(){
  const q=ui.q.trim(),f=ui.flt;
  let list=S.players.filter(p=>f==='off'?!p.on:p.on);   // 默认只列上榜的人（登录取了昵称，或进过房间）；没用过的卡在「未上榜」
  if(f==='alive')list=list.filter(p=>p.st==='alive');else if(f==='down')list=list.filter(p=>p.st!=='alive');
  if(q)list=list.filter(p=>p.id.includes(q)||(p.nick||'').includes(q));
  list=f==='off'?list:list.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const rows=list.map(p=>'<button class="ptr'+(ui.ed.pid===p.id?' on':'')+(p.st!=='alive'?' down':'')+'" data-a="edpick" data-v="'+p.id+'"><span class="mono b">'+p.id+'</span><span class="nk">'+esc(p.nick||'—')+'</span>'
    +'<span class="stt'+(p.st==='alive'?'':' red')+'">'+(!p.on?'未上榜':p.inRoom?'房间 '+room(p.inRoom).card:p.st==='alive'?'存活':stLabel(p))+'</span>'+suits4(p)+'<span class="mono sc">'+p.score+'</span>'
    +'<span class="small mono">'+(p.won?'<b class="acc">中奖</b>':ticketsOf(p)+' 张')+'</span></button>').join('');
  return '<div class="pn" style="gap:10px"><div class="btns"><input class="in" id="pq" data-m="q" value="'+esc(ui.q)+'" placeholder="搜编号或昵称" style="max-width:220px">'
    +FLT.map(([k,l])=>'<button class="btn-line'+(f===k?' fill':'')+'" data-a="flt" data-v="'+k+'">'+l+'</button>').join('')+'<span class="small">'+list.length+' 人</span></div>'
    +'<div class="ptbl"><div class="ptr th"><span>编号</span><span>昵称</span><span>状态</span><span>花色</span><span>金币</span><span>彩券</span></div>'+(rows||'<div class="li small">没有符合的人</div>')+'</div></div>';
}
function editPanel(){
  const p=ui.ed.pid&&pl(ui.ed.pid);
  if(!p)return '<div class="pn"><h3>修改玩家</h3><span class="muted">在左边点一个人。</span></div>';
  const amt=parseInt(String(ui.ed.amt).replace(/[^\d-]/g,''),10)||0;
  const hist=[...p.hist].reverse().slice(0,8).map(h=>{const r=room(h.rid);return '<div class="hrow"><span class="mono">'+fmt(h.t0)+'</span><b>'+cardG(r)+'</b><span class="hres '+(h.res==='win'?'w':h.res==='lose'?'l':'')+'">'+(h.res===null?'游戏中':h.res==='win'?'成功 +'+h.pts:h.res==='lose'?'失败':'离开')+'</span></div>';}).join('');
  return '<div class="pn" style="gap:12px"><div class="shrow"><h3>'+who(p)+'</h3><span class="kb">'+stLabel(p)+'</span></div>'
    +'<div class="kvs"><span>金币 <b class="mono">'+p.score+'</b></span><span>花色 '+suits4(p)+'</span><span>解谜 '+puzInfo(p).used+'/'+PUZ_CAP+'</span>'+'<span>彩券 <b class="mono">'+ticketsOf(p)+'</b></span>'+(p.won?'<span>中奖 '+esc((prize(p.won)||{}).name||'')+'</span>':'')+'</div>'
    +'<div class="fld"><span>金币增减（▲▼ 每次 100）</span><span class="coin-in"><input class="in mono" type="number" step="100" id="eda" data-m="ed.amt" value="'+esc(ui.ed.amt)+'" placeholder="0" aria-label="金币增减">'
    +'<span class="cstep"><button type="button" data-a="edstep" data-v="100" aria-label="加 100">▲</button><button type="button" data-a="edstep" data-v="-100" aria-label="减 100">▼</button></span></span></div>'
    +'<label class="fld"><span>原因（写进日志）</span><input class="in" id="edw" data-m="ed.why" value="'+esc(ui.ed.why)+'" placeholder="例如：断网补录"></label>'
    +'<button class="btn-main" data-a="edscore"'+(amt?'':' disabled')+'>'+(amt?'确认 '+p.id+' '+(amt>0?'+':'')+amt+' → '+Math.max(0,p.score+amt):'填写增减数')+'</button>'
    +'<div class="fgrid"><label class="fld"><span>昵称</span><input class="in" id="edn" data-m="ed.nick" value="'+esc(ui.ed.nick)+'" placeholder="'+esc(p.nick||'未取名')+'"></label>'
    +'<div class="fld"><span>&nbsp;</span><button class="btn-line" data-a="ednick"'+(ui.ed.nick.trim()?'':' disabled')+'>改昵称</button></div></div>'
    +'<div class="fld"><span>花色（点一下加上 / 去掉，补录或纠错用）</span><div class="chips c4">'+SUITS.map(x=>'<button class="cb'+(p.cards.includes(x)?' on':'')+'" data-a="edsuit" data-v="'+x+'" aria-pressed="'+p.cards.includes(x)+'"><span class="t">'+suitG(x)+'</span></button>').join('')+'</div></div>'
    +'<div class="btns"><button class="btn-line" data-a="edon" data-v="'+(p.on?0:1)+'">'+(p.on?'移出排行榜（这张卡没人用）':'加入排行榜')+'</button>'
    +'</div>'
    +(hist?'<div class="histp"><span class="lbl">房间记录</span>'+hist+'</div>':'')+'</div>';
}
// 确认弹窗（ui.cfm = {title, lines, ok, a, v, red}）：危险 / 影响全场的操作先弹窗再做
function cfmDlg(){const c=ui.cfm;if(!c)return '';
  return '<div class="sheet"><div class="sheet-bg" data-a="cfm-no"></div><div class="sheet-card pn cfm" role="dialog" aria-modal="true" aria-labelledby="cft"><h3 id="cft">'+esc(c.title)+'</h3>'
    +(c.lines||[]).filter(Boolean).map(x=>'<p>'+esc(x)+'</p>').join('')
    +'<div class="btns two2"><button class="btn-main'+(c.red?' red':'')+'" data-a="cfm-ok">'+esc(c.ok||'确认')+'</button><button class="btn-line" data-a="cfm-no">取消</button></div></div></div>';}
function logTag(l){const x=l.text;
  return /鬼门开/.test(x)?['鬼门开','var(--warn)']:/抽|中奖|获得「/.test(x)?['抽奖','#6b4f9a']:/重置完成|进入 .\d|中途离开|移出/.test(x)?['房间','var(--ink2)']:/失败|原地等/.test(x)?['淘汰','var(--red)']:/黑白无常/.test(x)?['无常','var(--red)']:/孟婆|鬼市|赎|筹码/.test(x)?['鬼市','var(--accent)']
    :/解出|解谜/.test(x)?['解谜','var(--accent)']:/发布|撤销/.test(x)?['发布','var(--ink2)']:/赢下/.test(x)?['房间','var(--ink2)']:/金币/.test(x)?['金币','var(--warn)']:['系统','var(--sub)'];}
function viewCtrl(){
  const status='<div class="cols-ed"><div class="stack"><h2 class="sh">玩家</h2>'+playerTable()+'</div><div class="stack"><h2 class="sh">修改</h2>'+editPanel()+'</div></div>';
  return '<div class="page tabbed toptabs ledger">'+sub('ctrl',[['status','生死簿'],['pub','发布'],['log','全场日志'],['tools','总控工具']],'top col')
    +sec('ctrl','status',status)+sec('ctrl','pub',pubPanel())
    +sec('ctrl','log','<h2 class="sh">全场日志</h2><div class="pn logl" style="gap:0">'+(S.log.length?S.log.slice(0,300).map(l=>{const [k,c]=logTag(l);
      return '<div class="le"><span class="t">'+fmt(l.t)+'</span><span class="k" style="--kc:'+c+'">'+k+'</span><span class="x">'+esc(l.text)+'</span></div>';}).join(''):'<span class="muted">还没有日志。</span>')+'</div>')
    +sec('ctrl','tools',adminPanel())+statsDlg()+'</div>';
}
function statsDlg(){
  if(!ui.statsAsk)return '';
  return '<div class="sheet"><div class="sheet-bg" data-a="stats-cancel"></div><div class="sheet-card pn" role="dialog" aria-modal="true" aria-labelledby="sdt"><h3 id="sdt">清空全部统计数据？</h3>'
    +'<span class="small">登录、设备、在线曲线都会删除，无法恢复。需要的话先下载 CSV。</span>'
    +'<div class="btns two2"><button class="btn-main" data-a="stats-clear">确认清空</button><button class="btn-line" data-a="stats-cancel">取消</button></div></div></div>';
}
const PUB_TO=[['everyone','所有人'],['all','全体玩家'],['staff','工作人员'],['alive','在场的人'],['market','鬼市里的人'],['player','指定玩家']];
function pubPanel(){
  const f=ui.pub,gate=f.kind==='鬼门开',gq=GATES.find(x=>x.id===f.gate),ids=parseIds(f.players).filter(id=>pl(id));
  const target=gate?'<div class="fld"><span>题库</span>'+dd('pub.gate',gq?gq.title:f.gate==='custom'?'自定义':'','选择鬼门开',null,[...GATES.map(x=>({v:x.id,label:esc(x.title)})),{v:'custom',label:'自定义'}])+'</div>'+(gq?gateRef(gq):'')
    :'<div class="fgrid"><div class="fld"><span>发给谁</span>'+dd('pub.target',(PUB_TO.find(([v])=>v===f.target)||[])[1],'选择对象',null,PUB_TO.map(([v,l])=>({v,label:l})))+'</div>'
      +(f.target==='player'?'<label class="fld"><span>玩家编号（空格隔开）</span><input class="in mono" id="ppl" data-m="pub.players" value="'+esc(f.players)+'" inputmode="numeric" placeholder="例如 3 17 25"><small class="small">'+ids.length+' 人</small></label>':'')+'</div>';
  const form='<div class="pn" style="gap:14px">'
    +'<div class="fld"><span>类型</span><div class="seg2">'+['公告','鬼门开'].map(k=>'<button class="sbtn'+(f.kind===k?' on':'')+'" data-a="pick" data-k="pub.kind" data-v="'+k+'" aria-pressed="'+(f.kind===k)+'">'+k+'</button>').join('')+'</div></div>'
    +target+'<label class="fld"><span>限时（分钟，0 = 不限时）</span><input class="in mono" id="pm" data-m="pub.mins" value="'+esc(f.mins)+'" inputmode="numeric"></label>'
    +(gate&&f.gate!=='custom'?'':'<label class="fld"><span>标题</span><input class="in" id="pti" data-m="pub.title" value="'+esc(f.title)+'" placeholder="标题"></label>'
    +'<label class="fld"><span>内容</span><textarea class="in" id="pb" data-m="pub.body" rows="3" placeholder="手机上看到的说明">'+esc(f.body)+'</textarea></label>')
    +'<button class="btn-main" data-a="publish">发布'+(gate?'鬼门开（全场）':'公告')+'</button></div>';
  const list=S.notices.filter(n=>n.kind!=='通知').slice(0,10).map(n=>{
    const aud=S.players.filter(p=>p.on&&matches(n,p)),acked=aud.filter(p=>n.acks[p.id]).length,[kl,kc]=kindOf(n);
    return '<div class="li"><div class="grow" style="gap:4px"><div class="thead"><span class="kb '+kc+'" style="font-size:12px;padding:0 7px">'+kl+'</span><b>'+esc(n.title)+'</b></div>'
      +'<span class="small">'+(n.target==='staff'?'':'已读 <span class="mono" style="color:var(--ink)">'+acked+'/'+aud.length+'</span>')+'　'+esc(targetLabel(n))+(n.due?'　'+countdown(n):'')+'</span></div>'
      +(ui.revokeAsk===n.id?'<span class="btns"><button class="btn-line fillred" data-a="revokeok" data-n="'+n.id+'">确认撤销</button><button class="btn-line" data-a="revokeno">取消</button></span>'
        :'<button class="btn-line" data-a="revoke" data-n="'+n.id+'">撤销发布</button>')+'</div>';}).join('');
  return '<h2 class="sh">发布公告 / 鬼门开</h2><div class="pubcols">'+form+'<div class="pn" style="gap:0"><h3 style="padding-bottom:8px">已发布</h3>'+(list||'<div class="li small">还没有发布过。</div>')+'</div></div>';
}
function demoPanel(){
  if(!DEVME||DEVME.demo)return '';
  if(!ui.demoRows)ui.demoRows=(DEVME.demoCfg||[]).map(c=>({...c,old:c.pin}));
  const rows=ui.demoRows;
  const MODE_L={server:'连接服务器',shared:'共享演示局',local:'本地'};
  const one=(d,i)=>{d.write=d.write===true||d.write==='true';
    const c=(DEVME.demoCfg||[]).find(x=>x.pin===d.old)||{},ok=/^\d{6}$/.test(d.pin),
      dirty=!d.old||d.pin!==c.pin||d.mode!==c.mode||d.write!==c.write,k='demoRows.'+i;
    return '<div class="pn" style="gap:8px"><div class="btns"><input class="in mono" data-m="demoRow.pin" data-i="'+i+'" value="'+esc(d.pin)+'" inputmode="numeric" maxlength="6" placeholder="6 位数字" style="max-width:150px"><button class="btn-line" data-a="demo-rand" data-i="'+i+'">随机</button>'
      +(d.old?'<button class="btn-line" data-a="demo-copy" data-i="'+i+'">复制链接</button>':'')+'<button class="btn-line" data-a="demo-del" data-i="'+i+'">删除</button></div>'
      +'<div class="btns" style="flex-wrap:nowrap">'
      +dd(k+'.mode',MODE_L[d.mode]||MODE_L.server,'模式',null,[{v:'server',label:'连接服务器',note:'看真实游戏'},{v:'shared',label:'共享演示局',note:'同 PIN 的人看同一场演示'},{v:'local',label:'本地',note:'各自一局，互不影响'}])
      +'<button class="btn-line'+(d.write?'':' acc')+'" data-a="pick" data-k="'+k+'.write" data-v="false" aria-pressed="'+!d.write+'" style="min-width:60px">只读</button>'
      +'<button class="btn-line'+(d.write?' acc':'')+'" data-a="pick" data-k="'+k+'.write" data-v="true" aria-pressed="'+!!d.write+'" style="min-width:76px">可修改</button></div>'
      +'<div class="btns"><button class="btn-main" data-a="demo-save" data-i="'+i+'"'+(ok&&dirty?'':' disabled')+'>'+(d.old?'保存':'创建')+'</button>'+(d.old?'<span class="small">保存后正在用这个 PIN 的人需要重新登录</span>':'')+'</div></div>';};
  return '<div class="pn" style="margin-top:16px"><div class="shrow"><h3>展示模式 PIN</h3><span class="small">可建多个，各自选模式和权限</span></div>'
    +(rows.length?'<div class="grid2">'+rows.map(one).join('')+'</div>':'<span class="small">还没有展示 PIN。</span>')
    +'<div class="btns"><button class="btn-line acc" data-a="demo-add">+ 新增展示 PIN</button></div></div>';
}
// ---- 统计（开发者专用，只对真 DEV_PIN 显示；数据在服务器 stats 键里，不进游戏数据）----
const SROLES=['player','dealer','judge','mengpo','wuchang','ctrl','screen','dev','demo'],SRN={...ROLE_NAME,dev:'开发者',demo:'展示'},SPAL=['#3d77c9','#d0453a','#3a9a6c','#9466b8','#e08a3c','#2a9d9a','#e2b33a','#8a8a8a','#c25b9e'];
const hm=ms=>ms?new Date(ms).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'—';
function statsChart(d){
  const ser=d.series||[];
  if(ser.length<2)return '<span class="small">在线曲线至少要 2 个点（有人在线时每分钟记一个点，只留最近 6 小时）。</span>';
  const v=ui.statsView||'all';
  let lines=v==='role'?SROLES.map((r,i)=>({n:SRN[r],c:SPAL[i],y:ser.map(p=>(p.r||{})[r]||0)}))
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
  const head='<div class="shrow"><h3>统计</h3><span class="small">不存 IP，活动后点「清空」</span></div>';
  if(!d)return '<div class="pn" style="margin-top:16px">'+head+'<div class="btns"><button class="btn-line" data-a="stats-load">加载统计</button></div></div>';
  const rows=[...d.rows].sort((a,b)=>SROLES.indexOf(a.role)-SROLES.indexOf(b.role)||a.k.localeCompare(b.k,'zh'));
  const G='display:grid;grid-template-columns:minmax(100px,1.3fr) 76px 44px 44px 44px minmax(90px,1.4fr) 52px 44px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line2);font-size:14px';
  const tbl='<div style="overflow-x:auto"><div style="min-width:640px"><div class="small" style="'+G+';font-weight:700"><span>名称</span><span>身份</span><span>登录</span><span>连接</span><span>断线</span><span>设备</span><span>最近</span><span>在线</span></div>'
    +(rows.length?rows.map(r=>'<div style="'+G+'"><span style="font-weight:700">'+esc(r.k)+'</span><span>'+esc(r.roleName)+'</span><span class="mono">'+r.logins+'</span><span class="mono">'+r.conns+'</span><span class="mono"'+(r.drops?' style="color:var(--red)"':'')+'>'+r.drops+'</span><span>'+esc(r.devs.join('、')||'—')+'</span><span class="mono">'+hm(r.last)+'</span><span class="mono">'+(r.online||'')+'</span></div>').join(''):'<div class="small" style="padding:8px 0">还没有登录记录。</div>')+'</div></div>';
  const view=(k,t)=>'<button class="btn-line'+(v===k?' fill':'')+'" data-a="stats-view" data-v="'+k+'">'+t+'</button>';
  return '<div class="pn" style="margin-top:16px;gap:12px">'+head
    +'<div class="btns"><button class="btn-line" data-a="stats-load">刷新</button><button class="btn-line" data-a="stats-csv">下载 CSV</button>'
    +'<button class="btn-line" data-a="stats-ask">清空</button>'
    +'<span class="small">当前在线 <b class="mono">'+d.online+'</b>　登录失败 <b class="mono">'+d.fails+'</b> 次'+(d.lastFail?'（最近 '+hm(d.lastFail)+'）':'')+'　更新于 '+hm(d.now)+'</span></div>'
    +'<div class="btns">'+view('all','总计')+view('role','按角色')+'</div>'+statsChart(d)+tbl+'</div>';
}
function downloadStats(){
  const d=ui.stats;if(!d)return;
  const q=x=>'"'+String(x).replace(/"/g,'""')+'"',tm=ms=>ms?new Date(ms).toLocaleString('zh-CN',{hour12:false}):'';
  const a=[['名称','身份','登录次数','连接次数','断线次数','设备','首次','最近']].concat(d.rows.map(r=>[r.k,r.roleName,r.logins,r.conns,r.drops,r.devs.join('、'),tm(r.first),tm(r.last)]));
  const b=[['时间','总在线'].concat(SROLES.map(r=>SRN[r]))].concat(d.series.map(p=>[tm(p.at),p.n].concat(SROLES.map(r=>(p.r||{})[r]||0))));
  const csv='﻿'+[['登录失败次数',d.fails]].concat([[]],a,[[]],b).map(r=>r.map(q).join(',')).join('\r\n');
  const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));l.download='borderland-stats.csv';l.click();
  setTimeout(()=>URL.revokeObjectURL(l.href),1000);
}
// 解谜题库：从表格复制「谜题编码 / 问 / 答」粘贴进来（制表符分隔；带换行的格子用引号包着，也能识别；两组并排也行）
function parseTSV(t){const rows=[];let row=[],cell='',q=false;t=String(t||'').replace(/\r\n?/g,'\n');
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"'&&cell==='')q=true;else if(c==='\t'){row.push(cell);cell='';}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
  if(cell!==''||row.length){row.push(cell);rows.push(row);}return rows;}
function bankRows(t){const out=[];for(const r of parseTSV(t))for(let i=0;i+1<r.length;i+=3){const c=puzCode(r[i]);if(c&&String(r[i+1]||'').trim())out.push([c,r[i+1],r[i+2]||'']);}
  return out.sort((a,b)=>a[0]-b[0]);}
function bankPanel(){
  const A=ui.admin,nb=Object.keys(S.bank||{}).length,rows=bankRows(A.bankTxt);
  return '<div class="pn"><div class="shrow"><h3>解谜题库</h3><span class="small">'+(nb?'现在 '+nb+' 题':'还没导入')+'</span></div>'
    +'<span class="small">从表格复制「谜题编码 / 问 / 答」几列粘贴到下面（两组并排也行）。只有判官和总控看得到。</span>'
    +'<textarea class="in" id="bankin" data-m="admin.bankTxt" rows="3" placeholder="粘贴到这里">'+esc(A.bankTxt||'')+'</textarea>'
    +'<div class="btns"><button class="btn-line acc" data-a="bank-import"'+(rows.length?'':' disabled')+'>'+(rows.length?'导入 '+rows.length+' 题'+(nb?'（替换现有题库）':''):'先粘贴题库')+'</button>'
    +(nb?(A.ask==='bankclear'?'<button class="btn-line fillred" data-a="bank-clear">确认清空题库</button><button class="btn-line" data-a="adm-cancel">取消</button>':'<button class="btn-line" data-a="adm-ask" data-v="bankclear">清空题库</button>'):'')+'</div></div>';}
function adminPanel(){
  if(!LOCAL&&!ui.cntTried&&ws&&connected){ui.cntTried=true;send({type:'pincounts'},m=>{if(m.data)Object.assign(ui.admin.counts,m.data);},true);}
  const A=ui.admin,c=A.counts,run=CLOCK&&CLOCK.running;
  const num=(k,l,fixed)=>'<label class="fld"><span>'+l+'</span><input class="in mono" type="number" id="adm-'+k+'" min="0" max="30" data-m="adm.'+k+'" value="'+c[k]+'"'+(fixed?' disabled':'')+'></label>';
  const pins=A.pins?'<div class="pins"><div class="pr h"><span>身份</span><span>编号 / 名称</span><span>PIN</span><span></span></div>'
    +A.pins.map(p=>{const ed=A.ask==='edit:'+p.pin,okTo=/^\d{6}$/.test(A.pinTo||'')&&A.pinTo!==p.pin;
      return '<div class="pr"><span>'+esc(p.roleName)+'</span><span class="mono" style="font-weight:700">'+esc(p.pid||p.label)+'</span>'
      +(ed?'<input class="pin pinin" id="pinto" data-m="admin.pinTo" value="'+esc(A.pinTo||'')+'" inputmode="numeric" maxlength="6" aria-label="'+esc(p.pid||p.label)+' 的新 PIN">'
        :'<button class="pin pinbtn" data-a="adm-ask" data-v="edit:'+p.pin+'" title="点击修改">'+p.pin+'</button>')
      +'<span class="btns" style="gap:4px">'
      +(ed?'<button class="btn-line acc" data-a="adm-setpin" data-v="'+p.pin+'"'+(okTo?'':' disabled')+' title="改了以后，用旧 PIN 登录的人会被踢下线">保存</button><button class="btn-line" data-a="adm-cancel">取消</button>'
        :A.ask==='pin:'+p.pin?'<button class="btn-line fillred" data-a="adm-resetpin" data-v="'+p.pin+'">确认随机换</button><button class="btn-line" data-a="adm-cancel">取消</button>'
        :'<button class="btn-line" data-a="copypin" data-v="'+p.pin+'">复制</button><button class="btn-line" data-a="adm-ask" data-v="pin:'+p.pin+'">随机</button>')
      +'</span></div>';}).join('')+'</div>'
    +'<div class="btns"><button class="btn-line" data-a="adm-csv">下载 PIN 表（CSV）</button><button class="btn-line" data-a="adm-hide">收起</button><span class="small">共 '+A.pins.length+' 个，点 PIN 数字可修改</span></div>':'';
  const snaps=A.snaps?(A.snaps.length?'<div class="list">'+A.snaps.map(s=>'<div class="li"><div class="grow"><span class="x" style="font-size:15px">'+new Date(s.at).toLocaleTimeString()+'</span><span class="small">游戏 '+fmt(s.t||0)+'　'+esc(s.tag||'')+'</span></div>'
      +(A.ask==='snap:'+s.key?'<span class="btns"><button class="btn-line fillred" data-a="adm-restore" data-v="'+s.key+'">确认恢复</button><button class="btn-line" data-a="adm-cancel">取消</button></span>'
        :'<button class="btn-line" data-a="adm-ask" data-v="snap:'+s.key+'">恢复到这里</button>')+'</div>').join('')+'</div>':'<span class="small">还没有备份。每 10 次操作自动备份一次。</span>'):'';
  const left='<div class="stack"><div class="pn"><span class="lbl" style="font-size:13px">游戏计时</span><div class="timer"><span class="big'+(run?'':' paused')+'" id="tclk">'+fmt(S.t)+'</span>'
    +'<button class="btn-line '+(run?'':'fill')+'" data-a="clockctl" style="min-height:52px;padding:0 24px">'+(run?'暂停':'开始')+'</button>'
    +(A.ask==='clockreset'?'<button class="btn-line fillred" data-a="clockreset" style="min-height:52px;padding:0 18px">确认重置为 0:00</button><button class="btn-line" data-a="adm-cancel" style="min-height:52px">取消</button>'
      :'<button class="btn-line" data-a="adm-ask" data-v="clockreset" style="min-height:52px;padding:0 18px">重置</button>')+'</div>'
    +'<span class="small" style="font-weight:700;color:'+(run?'var(--accent)':'var(--sub)')+'">'+(run?'● 计时中':'❚❚ 已暂停')+'</span></div>'
    +'<div class="pn"><h3>设置</h3>'
    +'<div class="setrow"><div class="swrow"><span>总时长<small>当前 <b class="mono" style="color:var(--ink)">'+Math.round((S.dur||7200)/60)+'</b> 分钟</small></span>'
    +'<div class="btns" style="flex-wrap:nowrap"><input class="in mono" id="durm" data-m="durMin" value="'+esc(A.dur)+'" inputmode="numeric" placeholder="分钟，如 120" style="max-width:150px"><button class="btn-line acc" data-a="setdur">设置</button></div></div></div>'
    +'<div class="setrow"><div class="swrow"><span>房间人数上限<small>'+(S.capOn?'每间房同时最多 <b class="mono" style="color:var(--ink)">'+(S.cap||R.ROOM_CAP0)+'</b> 人':'现在不限人数')+'</small></span>'
    +'<button class="cb'+(S.capOn?' on':'')+'" data-a="capon" data-v="'+(S.capOn?'0':'1')+'" aria-pressed="'+!!S.capOn+'"><span class="t">'+(S.capOn?'已开启':'已关闭')+'</span></button></div>'
    +(S.capOn?'<div class="btns" style="flex-wrap:nowrap;margin-top:8px"><input class="in mono" id="capn" data-m="capN" value="'+esc(A.cap)+'" inputmode="numeric" placeholder="人数" style="max-width:110px"><button class="btn-line acc" data-a="setcap">设置</button></div>':'')+'</div>'
    +'<div class="setrow"><div class="swrow"><span>身份卡<small>现在共 <b class="mono" style="color:var(--ink)">'+S.players.length+'</b> 张（'+S.players[0].id+'–'+S.players[S.players.length-1].id+'），上榜 '+S.players.filter(p=>p.on).length+' 人</small></span>'
    +'<div class="btns" style="flex-wrap:nowrap"><input class="in mono" id="addn" data-m="addN" value="'+esc(ui.addN)+'" inputmode="numeric" style="max-width:80px"><button class="btn-line" data-a="addplayers">新增</button></div></div></div></div>'
    +bankPanel()
    +'<div class="pn"><h3>备份与恢复</h3><span class="small">每 10 次操作自动备份，重置、恢复、载入演示前也会备份。</span>'
    +'<div class="btns"><button class="btn-line" data-a="adm-snaps">查看备份</button>'
    +'</div><span class="lbl" style="padding-top:6px">载入演示数据（会先备份当前数据）</span><div class="btns">'
    +Object.entries(R.DEMOS).map(([k,l])=>A.ask==='reset:'+k?'<button class="btn-line fillred" data-a="adm-reset" data-v="'+k+'">确认载入「'+l+'」</button><button class="btn-line" data-a="adm-cancel">取消</button>'
      :'<button class="btn-line" data-a="adm-ask" data-v="reset:'+k+'">'+l+'</button>').join('')+'</div>'
    +(DEVME?'<span class="lbl" style="padding-top:6px">模拟离线（只影响这台设备，演示「离线记录 → 一键补录」）</span><div class="btns"><button class="btn-line'+(ui.simOff?' fillred':'')+'" data-a="simoff">'+(ui.simOff?'结束模拟离线':'开始模拟离线')+'</button>'
      +'<span class="small">开始后在右上角切到 Dealer / 判官 / 孟婆 / 黑白无常 去记；结束 = 网络恢复'+(DEVME.demo&&!DEVME.dwrite?'（这个展示 PIN 是只读，补录会被拒绝）':DEVME.demo?'':'（补录要先打开「可操作」）')+'</span></div>':'')
    +snaps+'</div></div>';
  const rs=A.resetTxt==='重置';
  const right='<div class="stack">'
    +'<div class="pn"><div class="shrow"><h3>PIN</h3><span class="small">改小会删掉编号靠后的 PIN</span></div>'
    +'<div class="cnts">'+num('dealer','Dealer')+num('judge','判官')+num('mengpo','孟婆')+num('wuchang','黑白无常')+num('ctrl','总控')+num('screen','大屏')+'</div>'
    +'<div class="btns"><button class="btn-line acc" data-a="adm-gen">生成 PIN</button><button class="btn-line" data-a="adm-pins">查看全部 PIN</button></div>'
    +'<div class="setrow"><div class="swrow"><span>打印身份卡<small>每张卡印编号、PIN 和登录网址（A4，每页 8 张）。卡上印的网址是 <b>'+esc(location.host)+'</b>，请在正式网址下打印。</small></span><button class="btn-line acc" data-a="cards">打印身份卡</button></div></div>'+pins+'</div>'
    +'<div class="danger"><h3>危险操作</h3><p>清空所有游戏数据（PIN 和题库保留）。输入“重置”后点按钮。</p>'
    +'<input class="in" id="rst" data-m="adm.resetTxt" value="'+esc(A.resetTxt)+'" placeholder="输入“重置”" style="border-color:#d9b3aa">'
    +'<button class="btn-line '+(rs?'fillred':'')+'" id="rstbtn" data-a="adm-reset" data-v="blank"'+(rs?'':' disabled')+' style="min-height:48px;font-weight:900">重置为空白游戏</button></div></div>';
  return '<h2 class="sh">总控工具</h2><div class="cols2">'+left+right+'</div>'+demoPanel()+statsPanel();
}

// ---------- 玩家 ----------
const meP=()=>S&&ME&&ME.role==='player'?pl(ME.pid):null;
// 第一次登录：先取昵称（大屏排行显示）
function viewNick(me){
  return '<div class="page nickp"><div class="pn nickc"><span class="cap">欢迎来到百鬼夜行</span><h2>你的编号 <b class="mono">'+me.id+'</b></h2>'
    +'<span class="muted">取个昵称，显示在大屏排行榜上（最多 12 字）。</span>'
    +'<input class="in" id="nickin" data-m="nick" value="'+esc(ui.nick)+'" maxlength="12" placeholder="昵称" autocomplete="nickname">'
    +'<button class="btn-main glow" data-a="setnick"'+(ui.nick.trim()?'':' disabled')+' style="min-height:56px">进入游戏</button>'
    +'</div></div>';
}
const LT_LAYOUT=[[0.04085, 0.04501, 0.10376, 0.0325], [0.04453, 0.01726, 0.09763, 0.0994], [0.05433, 0.02586, 0.1107, 0.1669], [0.04575, 0.04517, 0.10866, 0.2261], [0.05392, 0.04743, 0.10825, 0.29], [0.0433, 0.03474, 0.10294, 0.3547], [0.05188, 0.0, 0.1058, 0.4161], [0.04616, 0.03108, 0.11111, 0.4675], [0.04739, 0.01337, 0.10825, 0.5317], [0.04779, 0.04768, 0.11111, 0.5783], [0.0531, 0.00107, 0.11234, 0.6397], [0.04698, 0.00998, 0.11193, 0.6925], [0.04616, 0.00241, 0.12377, 0.7378], [0.05392, 0.02337, 0.11356, 0.7769], [0.05106, 0.03881, 0.11111, 0.8264], [0.05229, 0.02952, 0.10539, 0.8708], [0.05433, 0.01043, 0.11193, 0.9228], [0.04943, 0.0266, 0.10539, 0.9686]]; // [宽, 顶(相对最高那盏), 高, 原图中心x]，单位 = 原图宽 2448 的比例；每盏灯笼单独一张图 img/lt/dNN.webp
function lanternsHtml(){ // 18 盏全部输出，位置纯 CSS（--pitch 间距 + 以屏幕中线为中心），缩放窗口时连续变化、从两边裁掉，不依赖 JS 重算；样式必须每次渲染都一样（morph 看到 style 变了会重启动画）
  let h='<div class="lantern-band" aria-hidden="true">';
  for(let i=0;i<LT_LAYOUT.length;i++){const L=LT_LAYOUT[i],
      dur=4.2+(i*37%30)/10,amp=1.6+(i*53%20)/10,bob=2+(i*29%30)/10,dly=-((i*1.7)%(2*dur));
    h+='<span class="lt" style="--k:'+(i-(LT_LAYOUT.length-1)/2)+';--w:'+L[0]+';--y:'+L[1]+';--dur:'+dur.toFixed(2)+'s;--amp:'+amp.toFixed(2)+'deg;--bob:'+bob.toFixed(1)+'px;--dly:'+dly.toFixed(2)+'s"><img src="img/lt/d'+String(i+1).padStart(2,'0')+'.webp" alt=""></span>';}
  return h+'</div>';}
function myRank(me){const l=ranking();const i=l.findIndex(p=>p.id===me.id);if(i<0)return null;let r=i;while(r>0&&l[r-1].score===me.score)r--;return r+1;}
function viewPlayer(){
  const me=meP();if(!me)return '<div class="page"><div class="pn muted">找不到这个编号</div></div>';
  if(!me.nick&&!DEVME)return viewNick(me);
  const inMkt=me.st==='market',out=me.st==='out'||me.st==='picked';
  // 酆都通行证: a clearance document, stamped with the current state
  const wst=inMkt||out?'market':'alive',wseal=out?'待接':inMkt?'鬼市':me.won?'中奖':'在场';
  const wnote=out?'<span class="w-hint">挑战失败</span><span class="w-lab">'+(me.st==='picked'?'黑白无常已接到你，正在送你去鬼市':'留在原地，等黑白无常来接你')+'</span>'
    :inMkt?'<span class="w-hint">你在鬼市</span><span class="w-lab">实体筹码赢到 '+CHIP_GOAL+' 可自赎</span><span class="w-lab">金币已冻结</span>'
    :me.won?'<span class="w-hint">你中奖了</span><span class="w-lab">「'+esc((prize(me.won)||{}).name||'')+'」，请到台前领取</span>'
    :'<span class="w-hint">金币 <b class="mono">'+me.score+'</b></span><span class="w-lab">'+(myRank(me)?'排第 '+myRank(me)+' 名':'')+'</span>';
  const wch=[...wseal],wn=wch.length,wh=wn>2?78:58,wy=wn>2?[27,51,75]:[29,55];
  const wen='<div class="wen" data-st="'+wst+'"><svg class="w-grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#paperGrain)"></rect></svg>'
    +'<i class="w-frame"></i><i class="w-cn tl"></i><i class="w-cn tr"></i><i class="w-cn bl"></i><i class="w-cn br"></i>'
    +'<div class="w-title"><b>酆都通行证</b><span>冥府签发</span></div><div class="w-rule"></div>'
    +'<div class="w-who"><span class="w-idg"><span class="w-k">持证人</span><span class="w-id">'+me.id+'</span></span>'
    +'<span class="w-teamg"><span class="w-k">名号</span><span class="w-team">'+esc(me.nick||'—')+'</span></span></div>'
    +'<div class="w-state"><div class="w-note">'+wnote+'</div>'
    +'<svg class="w-seal" viewBox="0 0 64 '+(wh+6)+'" role="img" aria-label="'+wseal+'"><g filter="url(#sealInk)"><rect x="3" y="3" width="58" height="'+wh+'" rx="2"></rect>'
    +wch.map((c,i)=>'<text x="32" y="'+wy[i]+'" text-anchor="middle" font-size="'+(wn>2?24:28)+'">'+c+'</text>').join('')+'</g></svg></div></div>';
  // 彩券：金币、花色、八间房各一张卡
  const got=suitsOf(me).length,okS=got===SUITS.length,nC=me.cleared.length,okR=nC===ROOMS.length,tkC=Math.floor(me.score/TK_COIN),tk=ticketsOf(me);
  const suits=SUITS.map(x=>{const g=me.cards.includes(x);return '<div class="s4'+(g?' got':'')+'" title="'+TYPE[x]+(g?'':'：未获得')+'"><span class="g '+(isRed(x)?'sr':'')+'">'+x+'</span><span class="l">'+TYPE[x]+'</span></div>';}).join('');
  const cc=(ok,ttl,body,okT,noT)=>'<div class="fc'+(ok?' ok':'')+'"><div class="fh"><b>'+ttl+'</b><span class="fk">'+(ok?okT||'✓ 已达成':noT||'未达成')+'</span></div>'+body+'</div>';
  const finSec='<div class="fin3"><div class="fhd"><div class="ft"><span class="cap">我的彩券</span><b class="fn">'+tk+'<i> 张</i></b></div>'
    +'<div class="fs">'+(me.won?'你已中奖，不再参与后面的抽取':me.st!=='alive'?'回到场内才参与抽奖':'时间截止后凭彩券参加压轴抽奖')+'</div></div><div class="fcs">'
    +cc(tkC>0,'金币','<div class="fscore mono">'+me.score+'</div><div class="fx">每 '+TK_COIN+' 金币 1 张</div>','✓ '+tkC+' 张','0 张')
    +cc(okS,'集齐四种花色　+'+TK_SUITS,'<div class="suits4">'+suits+'</div><div class="fx mono">'+got+' / 4</div>')
    +cc(okR,'八间房全部成功　+'+TK_ALL,'<div class="fscore mono">'+nC+' / '+ROOMS.length+'</div><div class="bar"><span class="ok" style="width:'+nC/ROOMS.length*100+'%"></span></div>')+'</div></div>';
  const hist=[...me.hist].reverse().map(h=>{const r=room(h.rid),res=h.res===null?'游戏中':h.res==='win'?'成功　+'+h.pts:h.res==='lose'?'失败':'中途离开';
    return '<div class="hrow"><span class="mono">'+fmt(h.t0)+'</span><b>'+cardG(r)+' '+r.name+'</b><span class="hres '+(h.res==='win'?'w':h.res==='lose'?'l':'')+'">'+res+'</span></div>';}).join('');
  const pz=puzInfo(me);
  const info='<div class="pn histp"><div class="shrow"><h3>我的记录</h3><span class="small">解谜题 <b class="mono">'+pz.used+' / '+PUZ_CAP+'</b></span></div>'
    +(hist||'<span class="muted small">还没有进过房间。</span>')+(me.puz.length?'<span class="lbl">解谜题</span>'+me.puz.map(r=>'<div class="hrow"><span class="mono">'+fmt(r.t)+'</span><b>'+esc(r.title)+'</b><span class="hres w">+'+r.pts+'</span></div>').join(''):'')+'</div>';
  // 通知
  const mine=S.notices.filter(n=>matches(n,me)),unread=mine.filter(n=>!n.acks[me.id]).length;
  const noteHtml=n=>{const acked=!!n.acks[me.id],[kl,kc]=kindOf(n);
    return '<div class="note'+(acked?'':' new')+'"><div class="nh"><span class="kb round '+kc+'" style="font-size:12px;padding:1px 10px">'+kl+'</span><span class="mode mono">'+fmt(n.t)+'</span></div>'
      +'<div class="nt">'+esc(n.title)+'</div>'+(n.body?'<div class="nb">'+esc(n.body)+'</div>':'')
      +(n.due?'<div class="nm"><span class="red">⏱ '+countdown(n,true)+'</span></div>':'')
      +(acked?'<span class="small">已读</span>':'<button class="ack" data-a="ack" data-n="'+n.id+'">知道了</button>')+'</div>';};
  const curN=mine.filter(n=>!n.acks[me.id]||(n.sub==='gate'&&S.gp&&S.gp.nid===n.id)),histN=mine.filter(n=>!curN.includes(n));
  const taskSec='<h2 class="sh" style="font-size:22px">通知</h2>'+(curN.length?curN.map(noteHtml).join(''):'<div class="pn"><span class="muted">暂时没有新通知。</span></div>')
    +(histN.length?'<button class="histbtn" data-a="hist" aria-expanded="'+!!ui.histOpen+'">历史消息（'+histN.length+'）<span>'+(ui.histOpen?'收起 ▲':'展开 ▼')+'</span></button>'+(ui.histOpen?histN.map(noteHtml).join(''):''):'');
  const tabs=[['me','我的信息'],['task','通知'+(unread?'<b class="cnt">'+unread+'</b>':'')]];
  if(!['me','task'].includes(ui.sub.player))ui.sub.player='me';
  return (me.st!=='alive'?lanternsHtml():'')+'<div class="page tabbed toptabs allin">'+sub('player',tabs,'top')
    +'<div class="pcol l">'+wen+sec('player','me',finSec+info)+'</div>'
    +'<div class="pcol r">'+sec('player','task',taskSec)+'</div></div>';
}
// 时间到：全员（含工作人员、大屏）全屏提示；按总时长记住已点过，刷新不再重复弹。
const tuKey=()=>'borderland.tu.'+((S&&S.dur)||7200);
const tuSeen=()=>{try{return sessionStorage.getItem(tuKey())==='1';}catch{return !!ui.tuAck;}};
const staffAcked=id=>{try{return sessionStorage.getItem('borderland.sa.'+id)==='1';}catch{return !!(ui.sa&&ui.sa[id]);}};
function tuDlg(){
  return '<div class="ovl" data-k="time"><div class="dlg" data-n="timeup" data-k="time" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="new"><i></i>全场通知</div>'
    +'<h3 id="dt">时间到</h3><div class="body">所有房间关闭，房里的人打完这一局。\n请到开奖地点集合，参加压轴抽奖。</div>'
    +'<div class="foot"><span class="cap">剩余时间</span><span class="cd over">0:00:00</span></div>'
    +'<button data-a="tuack" data-modal="1">知道了</button></div></div>';
}
function modalHtml(){
  if(ME&&S&&!entering&&R.timeUp()&&!tuSeen()&&!S.draw.pz.some(x=>x.st!=='wait'))return tuDlg();
  if(ME&&ME.role!=='player'&&S&&S.notices){ // 工作人员：发给「工作人员 / 所有人」的公告，已读只记在本机
    const n=S.notices.find(x=>staffSees(x)&&!R.noticeStale(x)&&!staffAcked(x.id)&&!(x.sub==='gate'&&ME.role==='screen'));if(!n)return '';
    return '<div class="ovl"><div class="dlg" data-n="s'+n.id+'" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="new"><i></i>工作人员通知</div>'
      +'<div class="bd"><span class="k">'+n.kind+'</span></div><h3 id="dt">'+esc(n.title)+'</h3>'+(n.body?'<div class="body">'+esc(n.body)+'</div>':'')
      +'<div class="foot">'+(n.due?'<span class="cap">剩余时间</span><span class="cd'+(n.due-S.t>0?'':' over')+'">'+(n.due-S.t>0?mmss(n.due-S.t):'已截止')+'</span>':'')+'</div>'
      +'<button data-a="sack" data-n="'+n.id+'" data-modal="1">知道了</button></div></div>';}
  if(!ME||ME.role!=='player'||!S)return '';
  const me=meP();if(!me||(!me.nick&&!DEVME))return '';
  const n=S.notices.find(x=>matches(x,me)&&!R.noticeStale(x)&&!x.acks[me.id]&&!(DEVME&&ui.devAck.has(x.id+':'+me.id)));if(!n)return '';
  const [kl,kc]=kindOf(n),r=n.due?n.due-S.t:0;
  return '<div class="ovl" data-k="'+(n.tone==='out'?'out':'')+'"><div class="dlg" data-n="'+n.id+'" data-k="'+(n.tone==='out'?'out':'')+'" role="dialog" aria-modal="true" aria-labelledby="dt"><div class="new"><i></i>新通知</div>'
    +'<div class="bd"><span class="k '+(kc==='alert'?'alert':'')+'">'+kl+'</span></div>'
    +'<h3 id="dt">'+esc(n.title)+'</h3>'+(n.body?'<div class="body">'+esc(n.body)+'</div>':'')
    +'<div class="foot">'+(n.due?'<span class="cap">剩余时间</span><span class="cd'+(r>0?'':' over')+'">'+(r>0?mmss(r):'已截止')+'</span>':'')+'</div>'
    +'<button data-a="ack" data-n="'+n.id+'" data-modal="1">知道了</button></div></div>';
}

// ---------- 离线记录：断网时在自己页面上记，连上后一键补录（存在这台设备的浏览器里）----------
const OFF_ROLES=['dealer','judge','mengpo','wuchang'];
let offSince=0;   // 断线开始的时刻；断线超过 5 秒（或用的是本机保存的旧状态）才出现离线记录
const offKey=()=>'borderland.off.'+ME.role+(Array.isArray(ME.rooms)&&ME.rooms.length?'.'+ME.rooms.join(''):'')+(DEVME?'.dev':'');
function offGet(){try{return JSON.parse(localStorage.getItem(offKey())||'[]');}catch{return ui.offMem||[];}}
function offSet(rows){ui.offMem=rows;try{rows.length?localStorage.setItem(offKey(),JSON.stringify(rows)):localStorage.removeItem(offKey());}catch{/* 无痕模式：只留在本页 */}}
const online=()=>connected&&!ui.simOff;   // 模拟离线时当作断网
const offRid=()=>Array.isArray(ME.rooms)&&ME.rooms.length?ME.rooms[0]:ui.room;
const OFF_MK=[['market','入鬼市'],['redeem','自赎'],['ransom','被别人赎'],['soup','孟婆汤']];
function offDesc(x){const r=x.rid&&room(x.rid);
  return x.k==='room'?x.pid+' '+({win:'赢',solo:'独自通关',lose:'输'})[x.res]+' '+(r?r.card:''):x.k==='pickup'?'接到 '+x.pid:x.k==='market'?x.pid+' 入鬼市'
    :x.k==='redeem'?x.pid+' 自赎':x.k==='ransom'?x.pid+' 被 '+x.by+' 赎出':x.k==='soup'?x.pid+' 喝孟婆汤'
    :x.k==='puz'?x.pid+' 解出 #'+x.code:x.k==='gate'?x.pid+' 鬼门开奖励：'+(x.rw==='coin'?'+'+GATE_COIN+' 金币':x.rw==='save'?'救 '+x.arg:'拿 '+x.arg):'';}
// 表单填好了吗：返回 null = 可以记；否则是按钮上显示的提示
function offWhy(){const f=ui.off,ids=parseIds(f.ids),k=ME.role==='dealer'?'room':f.k;
  if(!ids.length)return '先输入编号';const bad=ids.find(id=>!pl(id));if(bad)return '没有编号 '+bad;
  if(k==='room')return f.res?null:'选结果';if(!k)return '选做了什么';
  if(k==='puz')return puzCode(f.code)?null:'填谜题编码';
  if(k==='ransom')return !f.by?'填出钱人编号':!pl(parseIds(f.by)[0])?'没有编号 '+f.by:null;
  if(k==='gate')return !f.rw?'选奖励':f.rw==='save'?(pl(parseIds(f.arg)[0])?null:'填要救的编号'):f.rw==='suit'?(SUITS.includes(f.arg)?null:'选花色'):null;
  return null;}
function offBar(){
  if(!ME||!OFF_ROLES.includes(ME.role)||(LOCAL&&!ui.simOff)||!S)return '';
  const rows=offGet(),down=!online()&&(ui.simOff||!!STALE||(offSince&&Date.now()-offSince>5000));
  if(down)ui.offOn=true;
  if(!rows.length&&!ui.offOn)return '';
  const f=ui.off,k=ME.role==='dealer'?'room':f.k,seg=(key,opts)=>'<div class="seg'+opts.length+'">'+opts.map(([v,l])=>'<button class="sbtn'+(getp(key)===v?' on':'')+'" data-a="pick" data-k="'+key+'" data-v="'+v+'" aria-pressed="'+(getp(key)===v)+'">'+l+'</button>').join('')+'</div>';
  let what='';
  if(ME.role==='dealer'){const dr=room(offRid());what=seg('off.res',dr&&dr.solo?[['solo','独自通关'],['win','带人通关'],['lose','输']]:[['win','赢'],['lose','输']]);}
  else if(ME.role==='wuchang')what=seg('off.k',[['pickup','接到了'],['market','送入鬼市']]);
  else if(ME.role==='mengpo')what=seg('off.k',OFF_MK)+(k==='ransom'?'<input class="in mono" data-m="off.by" id="offby" value="'+esc(f.by||'')+'" inputmode="numeric" placeholder="出钱人编号">':'');
  else what=seg('off.k',[['puz','解谜题'],['gate','鬼门开奖励']])
    +(k==='puz'?'<input class="in mono" data-m="off.code" id="offcode" value="'+esc(f.code)+'" inputmode="numeric" placeholder="谜题编码">':'')
    +(k==='gate'?seg('off.rw',[['coin','+'+GATE_COIN+' 金币'],['save','救一个人'],['suit','拿一个花色']])
      +(f.rw==='save'?'<input class="in mono" data-m="off.arg" id="offarg" value="'+esc(f.arg)+'" inputmode="numeric" placeholder="要救的人的编号">':'')
      +(f.rw==='suit'?'<div class="chips c4">'+SUITS.map(x=>cb({k:'off.arg',v:x,on:f.arg===x,label:suitG(x),mark:false})).join('')+'</div>':''):'');
  const why=offWhy();
  const form=online()?'':'<div class="fgrid offf"><label class="fld"><span>'+(ME.role==='dealer'?cardG(room(offRid()))+' 编号（多个用空格隔开）':'编号')+'</span><input class="in mono" data-m="off.ids" id="offids" value="'+esc(f.ids)+'" inputmode="numeric" placeholder="例如 7 15"></label>'
    +'<div class="fld"><span>'+(ME.role==='dealer'?'结果':'做了什么')+'</span>'+what+'</div></div>'
    +'<button class="btn-main'+(why?'':' glow')+'" data-a="off-add"'+(why?' disabled':'')+'>'+(why||'记下')+'</button>';
  const list=rows.map((x,i)=>({x,i})).reverse().map(({x,i})=>'<div class="li"><div class="grow"><span class="t">'+new Date(x.at).toTimeString().slice(0,5)+'</span><span class="x">'+esc(offDesc(x))+'</span>'
    +(x.err?'<span class="small" style="color:var(--red)">没补上：'+esc(x.err)+'</span>':'')+'</div><button class="btn-line" data-a="off-del" data-v="'+i+'" aria-label="删除这条">删除</button></div>').join('');
  return '<div class="page offpage"><div class="pn offp"><div class="shrow"><h3>离线记录'+(rows.length?'（'+rows.length+' 条）':'')+'</h3><span class="small">'
    +(online()?'网络已恢复':ui.simOff?'模拟离线：先在这里记，存在这台设备上':'网络断了：先在这里记，存在这台设备上')+'</span></div>'+form
    +(list?'<div class="list">'+list+'</div>':online()?'':'<span class="small">还没有记录。</span>')
    +(online()?(rows.length?'<button class="btn-main glow" data-a="off-send" style="min-height:56px">一键补录 '+rows.length+' 条</button>':'<button class="btn-line" data-a="off-close">收起</button>')
      :ui.simOff?'<button class="btn-line" data-a="simoff">结束模拟离线（= 网络恢复）</button>':'<span class="small">连上网络后，这里会出现「一键补录」。</span>')+'</div></div>';
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
function tickClocks(){const n=nowT(),t=fmt(n);$('#clk').textContent=t;const a=document.getElementById('sclk');if(a)a.textContent=remStr(n);const b=document.getElementById('tclk');if(b)b.textContent=t;
  document.querySelectorAll('[data-rt]').forEach(e=>{e.textContent=rtStr(+e.dataset.rt);});}
function setAmb(mode,tone){
  if(ambMode!==mode){ambMode=mode;
    $('#amb').innerHTML=mode?'<ghost-ambience data-mode="'+mode+'"'+(mode==='login'?' data-len="0" data-err="0" data-ok="0"':'')+'></ghost-ambience>':'';}
  const g=$('#amb ghost-ambience');if(g&&tone&&g.dataset.tone!==tone)g.dataset.tone=tone;}
// 深浅色：每台设备只记一份，大屏、玩家页、工作人员页互通；第一次打开默认深色。
const THEME_KEY='borderland.theme';
// 被淘汰、已被接到或在鬼市：整页红色提示，强制深色
const inMarketNow=()=>{const p=ME&&ME.role==='player'&&S&&S.players.find(x=>x.id===ME.pid);return !!(p&&p.st!=='alive');};
function themeFor(){if(ME&&ME.role==='player'&&inMarketNow())return 'dark';   // 鬼市 / 待接的玩家：所有页都深色
  let v=null;try{v=localStorage.getItem(THEME_KEY);}catch{/* private mode */}
  return v||'dark';}

function render(){
  if(DEVME&&!entering){ME=devMe();if(FULL)S=ME.role==='player'||ME.role==='screen'?R.viewFor(FULL,ME):FULL;}
  if(DEVME&&DEVME.demo)ui.devOps=!!DEVME.dwrite;
  const da=$('#devas');da.hidden=!DEVME||entering;
  const dop=$('#devops');dop.hidden=da.hidden;dop.disabled=!!(DEVME&&DEVME.demo);dop.textContent=ui.devOps?'可操作':DEVME&&DEVME.demo?'只读模式':'只读';dop.classList.toggle('ro',!!(DEVME&&DEVME.demo&&!ui.devOps));dop.classList.toggle('on',ui.devOps);dop.setAttribute('aria-pressed',String(ui.devOps));
  if(DEVME&&!entering){const src=FULL||S,h='<optgroup label="工作人员">'+['ctrl','dealer','judge','mengpo','wuchang','screen'].map(r=>'<option value="'+r+'">'+ROLE_NAME[r]+'</option>').join('')+'</optgroup>'
      +(src?'<optgroup label="玩家">'+src.players.map(p=>'<option value="player:'+p.id+'">'+p.id+(p.nick?' '+esc(p.nick):'')+'</option>').join('')+'</optgroup>':'');
    if(da.dataset.h!==h){da.innerHTML=h;da.dataset.h=h;}if(da.value!==ui.as)da.value=ui.as;}
  const login=!ME||entering;
  document.body.classList.toggle('login',login);if(login)document.body.classList.remove('inmk');document.body.classList.toggle('dev',!!DEVME&&!login);
  document.body.classList.toggle('screen',!login&&ME.role==='screen');
  document.body.dataset.role=login?'':ME.role;
  if(login){document.body.classList.remove('board','natscroll','fullamb','inmk','bt');document.documentElement.dataset.theme='dark';setAmb('login');renderLogin();return;}
  const nickGate=ME.role==='player'&&!DEVME&&S&&(p=>p&&!p.nick)(S.players.find(x=>x.id===ME.pid));   // 还没取昵称：只显示取名页
  // 总控不显示标签栏：开发者用右上角下拉换视角；真总控用同一个下拉换页面
  const tabs=nickGate?['player']:(ROLE_TABS[ME.role]||[]);
  if(!tabs.includes(ui.tab))ui.tab=tabs[0];
  document.body.classList.toggle('bt',tabs.length>1);
  document.documentElement.dataset.theme=themeFor();
  document.body.classList.toggle('board',ui.tab==='board');
  document.body.classList.toggle('inmk',ME.role==='player'&&inMarketNow());
  document.body.classList.toggle('natscroll',ui.tab==='market'||ui.tab==='wuchang'||ui.tab==='draw'||ui.tab==='map'||(ui.tab==='player'&&ME&&ME.role==='player'));
  // Staff and player pages: the big screen's full-window background on computers, and on phones in dark mode;
  // flames and eyes only show where no panel covers them (data-free). Phones in light mode keep the header strip.
  const userTab=['dealer','npc','draw','market','wuchang','ctrl','player','map'].includes(ui.tab),tone=themeFor(),full=userTab&&(innerWidth>=720||tone==='dark');
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
  $('#logo').innerHTML=ui.tab==='ctrl'?'<span class="scroll"></span>总控':'百鬼夜行';
  $('#who').textContent=(DEVME?(DEVME.demo?'展示 ':'开发者 '):'')+(ME.role==='player'?(DEVME?ME.pid:'玩家'):ME.role==='ctrl'?'总控':ME.label||ROLE_NAME[ME.role]);
  $('#logout').hidden=false;$('#conn').hidden=false;
  const run=CLOCK&&CLOCK.running;
  const cc=$('#clockctl');cc.hidden=ME.role!=='ctrl';cc.textContent=run?'暂停计时':'开始计时';
  const th=$('#theme');th.hidden=!!(ME&&ME.role==='player'&&inMarketNow());th.textContent=themeFor()==='dark'?'浅色':'深色';
  $('.clk').classList.toggle('paused',!run);$('#clkdot').className='gd'+(run?'':' off');
  if(!S){$('#view').innerHTML='<section class="pn muted">正在连接服务器…</section>';return;}
  R.use(S);S.t=nowT();$('#clk').textContent=fmt(S.t);
  morph($('#view'),offBar()+(ui.tab==='board'?viewBoard():ui.tab==='map'?viewMap():ui.tab==='dealer'?viewDealer():ui.tab==='ctrl'?viewCtrl():ui.tab==='npc'?viewNpc():ui.tab==='draw'?viewDraw():ui.tab==='market'?viewMarket():ui.tab==='wuchang'?viewWuchang():viewPlayer())+cfmDlg());
  fitStage();confettiCheck();
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
    +'<button class="go">进入</button></form><div class="h" id="lgmsg" role="status">PIN 印在你的身份卡上</div></div>';
  syncBoxes();$('#pin').focus();
}
function syncBoxes(err){
  const v=$('#pin')?$('#pin').value:'',bx=document.querySelectorAll('#boxes .bx');
  bx.forEach((b,i)=>{b.textContent=v[i]||'';b.classList.toggle('act',!err&&i===Math.min(v.length,5)&&v.length<6);});
  $('#boxes').classList.toggle('bad',!!err);
  const g=$('#amb ghost-ambience');if(g)g.setAttribute('data-len',String(v.length));
}
// The message takes the place of the hint line, so the card never changes size.
function loginMsg(msg){const e=$('#lgmsg');if(!e)return;e.classList.toggle('err',!!msg);e.textContent=msg||'PIN 印在你的身份卡上';}
function loginError(msg){
  if(!$('#lgmsg'))return;
  loginMsg(msg==='PIN 不正确'?'PIN 不正确，请核对身份卡':msg);
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
  n.className='notice '+(r.ok?'ok':'bad');const ro=!r.ok&&r.msg==='只读模式';n.innerHTML='<b>'+(ro?'只读模式':r.ok?'已记录':'不能这样操作')+'</b>'+(ro?'':'<span></span>');if(!ro)n.querySelector('span').textContent=r.msg;
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
  SESSION=null;store.set(null);STALE=null;ui.as='ctrl';ui.simOff=false;ui.tab=null;try{localStorage.removeItem(LASTK);}catch{/* ignore */}setMe(null);S=null;CLOCK=null;connected=false;entering=false;
  if(ws){const w=ws;ws=null;try{w.close();}catch{/* ignore */}}
  clearTimeout(timer);$('#view').innerHTML='';render();say(null);if(msg)loginError(msg);
}

// ---------- live connection ----------
let ws=null,connected=false,retry=0,timer=null,seq=0,lastMsg=0;const pending=new Map();
function setConn(){const c=$('#conn');c.className='pill '+(connected?'free':'bad');
  if(ui.simOff){c.className='pill bad';c.textContent='模拟离线';return;}
  c.textContent=connected?(LOCAL?'本地展示':'已连接'):STALE?'离线，最后同步 '+new Date(STALE).toTimeString().slice(0,5):'重连中…';}
// 离线重开：每隔几秒（和断线那一刻）把最后一次同步的状态存在本机；页面重开后连不上服务器时，用它显示（只读）。
// 只存这个账号自己看到的那份状态；退出登录时删除。冻结的计时只用于显示，不代表真实时间。
const LASTK='borderland.last';let lastSave=0,STALE=null;
function saveLast(force){
  if(LOCAL||!SESSION||!S||!CLOCK)return;const n=Date.now();if(!force&&n-lastSave<5000)return;lastSave=n;
  try{localStorage.setItem(LASTK,JSON.stringify({at:n,who:JSON.stringify([SESSION.me.role,SESSION.me.pid||'',SESSION.me.label||'']),t:nowT(),S}));}catch{/* 存储已满或无痕模式：忽略 */}
}
function restoreLast(){
  if(connected||S||!SESSION)return;
  let o=null;try{o=JSON.parse(localStorage.getItem(LASTK));}catch{/* ignore */}
  if(!o||!o.S||o.who!==JSON.stringify([SESSION.me.role,SESSION.me.pid||'',SESSION.me.label||'']))return;
  S=o.S;if(DEVME)FULL=S;CLOCK={running:false,base:o.t,at:Date.now()};OFFSET=0;STALE=o.at;setConn();requestRender();
}
function connect(){
  if(!SESSION)return;
  if(ws){try{ws.onclose=null;ws.close();}catch{/* ignore */}}
  const sock=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/ws?token='+encodeURIComponent(SESSION.token));
  ws=sock;
  sock.onopen=()=>{connected=true;retry=0;offSince=0;lastMsg=Date.now();setConn();};
  sock.onmessage=e=>{lastMsg=Date.now();let m;try{m=JSON.parse(e.data);}catch{return;}
    if(m.t==='hello'){setMe(m.me);SESSION.me=m.me;store.set(SESSION);}
    if(m.t==='state'&&ui.simOff)return;   // 模拟离线：不接收新状态
    if(m.t==='hello'||m.t==='state'){S=m.S;if(DEVME)FULL=m.S;CLOCK=m.clock;OFFSET=m.now-Date.now();STALE=null;requestRender();saveLast();}
    else if(m.t==='res'){const cb=pending.get(m.id);pending.delete(m.id);if(cb)cb(m);}};
  sock.onclose=e=>{
    if(ws!==sock)return;
    ws=null;connected=false;if(!offSince)offSince=Date.now();saveLast(true);setConn();
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
function localStart(){
  FULL=R.newGame(true);FULL.now=Date.now();S=FULL;LOCAL=true;LPINS={};LSNAPS=[];CLOCK={running:false,base:FULL.t,at:Date.now()};OFFSET=0;connected=true;setConn();requestRender();
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
    case 'admin.reset':{const bank=FULL.bank;lSnap('重置前');FULL=R.newGame(a.demo||false);if(bank)FULL.bank=bank;}FULL.now=Date.now();CLOCK={running:false,base:a.demo?FULL.t:0,at:Date.now()};return ok(a.demo?'已载入演示数据（计时暂停）':'已重置为空白游戏（计时暂停）');
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
    case 'admin.resetpin':case 'admin.setpin':{const old=String(a.pin||''),v=LPINS[old];if(!v)return no('没有这个 PIN');
      const np=a.type==='admin.setpin'?String(a.to||'').trim():lNewPin();
      if(a.type==='admin.setpin'){if(!/^\d{6}$/.test(np))return no('PIN 要是 6 位数字');if(np===old)return no('PIN 没有变化');if(LPINS[np])return no('这个 PIN 已被别的身份用了，换一个');}
      delete LPINS[old];LPINS[np]=v;return ok((v.pid||v.label)+' 的新 PIN：'+np,lPinList());}
    case 'admin.snaps':return ok('',LSNAPS.map(x=>({key:'l'+x.at,at:x.at,t:x.t,tag:x.tag})));
    case 'admin.restore':{const x=LSNAPS.find(y=>'l'+y.at===String(a.key));if(!x)return no('找不到这个备份');lSnap('恢复前');
      FULL=JSON.parse(JSON.stringify(x.S));CLOCK={running:false,base:x.t,at:Date.now()};R.use(FULL);return ok('已恢复到备份（计时暂停，确认无误后再开始）');}
  }
  return no('未知的管理操作');
}
function localSend(a,after,quiet){
  if(!ui.devOps&&!ME.lpin){say(no('只读模式'));return;}
  let r;const t=a.type||'';
  if(t.startsWith('admin.'))r=ME.role==='ctrl'?localAdmin(a):no('只有总控视角能用总控工具');
  else{FULL.t=nowT();FULL.now=Date.now();r=R.apply(FULL,{role:ME.role,pid:ME.pid,label:ME.label,rooms:ME.lpin?ME.rooms:null},a);}
  S=ME.role==='player'||ME.role==='screen'?R.viewFor(FULL,ME):FULL;
  if(!quiet||!r.ok)say(r);if(r.ok&&after)after(r);requestRender();
}
function send(a,after,quiet){
  if(ui.simOff){say(no('模拟离线中：要记的事写进页面顶部的「离线记录」'));return;}
  if(LOCAL){localSend(a,after,quiet);return;}
  if(!ws||!connected){say(no('还没连上服务器，请稍等'));return;}
  if(DEVME&&(a.type==='pincounts'||a.type==='setpincounts'||a.type.startsWith('dev.'))){}
  else if(DEVME){if(!ui.devOps){say(no(DEVME.demo?'只读模式':'开发者模式现在是只读，点右上角「只读」切换成可操作'));return;}a={...a,as:{role:ME.role,pid:ME.pid}};}
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
  const a=b.dataset.a,v=b.dataset.v,A=ui.admin,x=curPrize();
  if(a==='tab'){ui.tab=v;say(null);}
  else if(a==='msel'){ui.msel=ui.msel===v?null:v;}
  else if(a==='sub'){ui.sub[b.dataset.p]=v;scrollTo({top:0});$('#view').scrollTop=0;}
  else if(a==='dd'){ui.ddOpen=ui.ddOpen===v?null:v;}
  else if(a==='pick'){ui.ddOpen=null;const k=b.dataset.k;setp(k,b.dataset.t&&getp(k)===v?'':v);
    if(/^gr\.[^.]+\.k$/.test(k))setp(k.replace(/\.k$/,'.arg'),'');}
  else if(a==='copypin'){copyText(v).then(()=>say({ok:true,msg:'已复制 PIN '+v}),()=>say(no('复制失败，请手动选中 PIN')));}
  else if(a==='theme'){const nx=themeFor()==='dark'?'light':'dark';try{localStorage.setItem(THEME_KEY,nx);}catch{/* private mode */}}
  else if(a==='logout'){logout();return;}
  else if(a==='demo-add'){(ui.demoRows=ui.demoRows||[]).push({pin:String(Math.floor(100000+Math.random()*900000)),old:'',mode:'shared',write:false});}
  else if(a==='demo-rand'){const r=ui.demoRows[+b.dataset.i];if(r)r.pin=String(Math.floor(100000+Math.random()*900000));}
  else if(a==='demo-copy'){const r=ui.demoRows[+b.dataset.i],u=location.origin+'/?pin='+r.old;copyText(u).then(()=>say({ok:true,msg:'已复制链接 '+u}),()=>say(no('复制失败')));}
  else if(a==='demo-save'){const r=ui.demoRows[+b.dataset.i];send({type:'dev.setdemo',pin:r.pin,old:r.old,mode:r.mode,write:r.write},m=>{DEVME.demoCfg=m.data;SESSION.me=DEVME;store.set(SESSION);ui.demoRows=null;});}
  else if(a==='demo-del'){const i=+b.dataset.i,r=ui.demoRows[i];if(!r.old)ui.demoRows.splice(i,1);else send({type:'dev.deldemo',pin:r.old},m=>{DEVME.demoCfg=m.data;SESSION.me=DEVME;store.set(SESSION);ui.demoRows=null;});}
  else if(a==='devops'){if(DEVME.demo)return;ui.devOps=!ui.devOps;say({ok:true,msg:ui.devOps?'开发者模式：可操作（以当前视角的身份）':'开发者模式：只读'});}
  else if(a==='clockreset'){A.ask=null;send({type:'admin.clock',op:'reset'});}
  else if(a==='clockctl'){send({type:'admin.clock',op:CLOCK&&CLOCK.running?'pause':'start'});}
  // Dealer
  else if(a==='room'){ui.room=v;ui.ent='';ui.res={};ui.settled=null;ui.kickAsk=null;}
  else if(a==='enter'){const pids=parseIds(ui.ent);send({type:'enter',rid:ui.room,pids},()=>{ui.ent='';ui.settled=null;});}
  else if(a==='res'){ui.res[b.dataset.t]=ui.res[b.dataset.t]===v?undefined:v;}
  else if(a==='ruleed'){ui.ruleEd=ui.room;ui.ruleTx=R.roomRule(ui.room);}
  else if(a==='rulecancel'){ui.ruleEd=null;}
  else if(a==='rulesave'||a==='rulereset'){const rid=ui.ruleEd,el=$('#rulein'),t=a==='rulereset'?'':(el?el.value:ui.ruleTx);send({type:'setrule',rid,text:t},res=>{if(res&&res.ok)ui.ruleEd=null;});}
  else if(a==='resall'){const x=S.rooms.find(y=>y.id===ui.room);x.ps.forEach(id=>{ui.res[id]=v;});}
  else if(a==='kickask'){ui.kickAsk=v;}
  else if(a==='kickno'){ui.kickAsk=null;}
  else if(a==='kick'){ui.kickAsk=null;send({type:'kick',rid:ui.room,pid:v},()=>{delete ui.res[v];});}
  else if(a==='finish'){const rid=ui.room;send({type:'finish',rid,results:ui.res},m=>{ui.res={};ui.settled={rid,msg:m.msg};});}
  else if(a==='resetdone'){send({type:'resetdone',rid:ui.room},()=>{ui.settled=null;ui.sub.dealer='info';});}
  // 判官：鬼门开 / 解谜
  else if(a==='jgpub'){const j=ui.jg;send({type:'publish',f:{kind:'鬼门开',gate:j.gate,title:j.gate==='custom'?j.title:'',body:j.gate==='custom'?j.body:'',mins:+j.mins||0}},()=>{ui.jg.gate='';ui.jg.title='';ui.jg.body='';});}
  else if(a==='gatewin'){const p=findP(ui.gw);if(p)send({type:'gatewin',pid:p.id},()=>{ui.gw='';});}
  else if(a==='gateunwin'){send({type:'gateunwin',pid:v});}
  else if(a==='gatereward'){const c=ui.gr[v]||{};send({type:'gatereward',pid:v,kind:c.k,arg:c.arg},()=>{delete ui.gr[v];});}
  else if(a==='gateendask'){ui.gateEndAsk=true;}
  else if(a==='gateendno'){ui.gateEndAsk=false;}
  else if(a==='gateend'){ui.gateEndAsk=false;send({type:'gateend'});}
  else if(a==='puz'){const z=ui.pz,p=findP(z.pid);if(p)send({type:'puz',pid:p.id,code:z.code},()=>{ui.pz={pid:'',code:''};});}
  else if(a==='puzundo'){send({type:'puzundo',pid:b.dataset.p,key:v});}
  // 抽奖
  else if(a==='askyes'){ui.aucAsk=v;}
  else if(a==='askno'){ui.aucAsk=null;}
  else if(a==='scrask'){const on=v==='1';if(on!==drawOn())ui.cfm={title:on?'大屏切到抽奖？':'大屏切回游戏？',lines:['所有大屏和玩家手机的第一页会马上切换。'],ok:'切换',a:'drawscreen',v};}
  else if(a==='cfm-no'){ui.cfm=null;}
  else if(a==='cfm-ok'){const c=ui.cfm;ui.cfm=null;if(c&&c.a==='drawscreen')send({type:'draw.screen',on:c.v==='1'});}
  else if(a==='drawrun'){if(x)send({type:'draw.run',id:x.id});}
  else if(a==='drawok'){if(x)send({type:'draw.confirm',id:x.id});}
  else if(a==='drawredo'){ui.aucAsk=null;if(x)send({type:'draw.redo',id:x.id});}
  else if(a==='drawundo'){ui.aucAsk=null;if(x)send({type:'draw.undo',id:x.id});}
  else if(a==='drawnext'){const nx=S.draw.pz.find(y=>y.st==='wait');if(nx)send({type:'draw.show',id:nx.id});}
  else if(a==='drawshow'){send({type:'draw.show',id:v});}
  else if(a==='showtk'){ui.showTk=!ui.showTk;}
  else if(a==='addpz'){ui.addPz=v==='1';}
  else if(a==='pzkind'){ui[b.dataset.k].kind=v;}
  else if(a==='pzadd'){send({type:'draw.add',f:ui.nw},()=>{ui.nw={name:'',desc:'',kind:'small'};});}
  else if(a==='pzedit'){const y=prize(v);ui.pzEdit=v;ui.pe={name:y.name,desc:y.desc,kind:y.kind};}
  else if(a==='pzcancel'){ui.pzEdit=null;}
  else if(a==='pzsave'){send({type:'draw.edit',id:v,f:ui.pe},()=>{ui.pzEdit=null;});}
  else if(a==='pzdel'){ui.aucAsk=null;send({type:'draw.del',id:v},()=>{ui.pzEdit=null;});}
  else if(a==='pzmove'){send({type:'draw.move',id:v,d:+b.dataset.d},null,true);}
  // 鬼市 / 黑白无常
  else if(a==='checkin'){send({type:'checkin',pid:b.dataset.p});}
  else if(a==='pickup'){send({type:'pickup',pid:b.dataset.p});}
  else if(a==='confirmin'){send({type:'confirm',pid:b.dataset.p});}
  else if(a==='mkask'){ui.mkAsk={pid:b.dataset.p,k:v};}
  else if(a==='mkno'){ui.mkAsk=null;}
  else if(a==='mkok'){const k=ui.mkAsk;ui.mkAsk=null;if(k){const by=findP(ui.ransomBy[k.pid]);
    send(k.k==='ransom'?{type:'ransom',pid:k.pid,by:by&&by.id}:{type:k.k==='redeem'?'redeem':'soup',pid:k.pid},()=>{delete ui.ransomBy[k.pid];});}}
  // 生死簿
  else if(a==='flt'){ui.flt=v;}
  else if(a==='edpick'){ui.ed={pid:v,amt:'',why:'',nick:''};}
  else if(a==='edstep'){ui.ed.amt=String((parseInt(ui.ed.amt,10)||0)+(+v));}
  else if(a==='edscore'){const p=pl(ui.ed.pid),amt=parseInt(ui.ed.amt,10)||0;if(p&&amt)send({type:'setscore',pid:p.id,v:Math.max(0,p.score+amt),why:ui.ed.why},()=>{ui.ed.amt='';ui.ed.why='';});}
  else if(a==='ednick'){send({type:'nick',pid:ui.ed.pid,nick:ui.ed.nick},()=>{ui.ed.nick='';});}
  else if(a==='edsuit'){const p=pl(ui.ed.pid);if(p)send({type:'setcards',pid:p.id,cards:p.cards.includes(v)?p.cards.filter(x=>x!==v):[...p.cards,v]});}
  else if(a==='edon'){send({type:'seton',pid:ui.ed.pid,on:v==='1'});}
  else if(a==='finadd'||a==='finrm'){send({type:'final',pid:v,on:a==='finadd'});}
  else if(a==='publish'){const f=ui.pub;send({type:'publish',f:{...f,players:parseIds(f.players),mins:+f.mins||0}},()=>{ui.pub.title='';ui.pub.body='';ui.pub.gate='';});}
  else if(a==='revoke'){ui.revokeAsk=+b.dataset.n;}
  else if(a==='revokeno'){ui.revokeAsk=null;}
  else if(a==='revokeok'){ui.revokeAsk=null;send({type:'revoke',nid:+b.dataset.n});}
  else if(a==='setcap'){send({type:'setcap',v:+A.cap},()=>{A.cap='';});}
  else if(a==='capon'){send({type:'setcapon',v:v==='1'});}
  else if(a==='addplayers'){send({type:'addplayers',n:+ui.addN});}
  else if(a==='setdur'){send({type:'setdur',secs:Math.round((+A.dur||0)*60)},()=>{A.dur='';});}
  else if(a==='cards'){printCards();}
  // 玩家
  else if(a==='setnick'){send({type:'nick',nick:ui.nick},()=>{ui.nick='';});}
  else if(a==='hist'){ui.histOpen=!ui.histOpen;}
  else if(a==='sack'){const id=b.dataset.n;(ui.sa=ui.sa||{})[id]=true;try{sessionStorage.setItem('borderland.sa.'+id,'1');}catch{/* ignore */}}
  else if(a==='tuack'){ui.tuAck=true;try{sessionStorage.setItem(tuKey(),'1');}catch{/* ignore */}}
  else if(a==='ack'&&DEVME&&!ui.devOps){ui.devAck.add(b.dataset.n+':'+ME.pid);}
  else if(a==='ack'){const nid=+b.dataset.n,n=S&&S.notices.find(x=>x.id===nid);
    if(n&&ME.pid&&!n.acks[ME.pid])n.acks[ME.pid]=S.t; // show the next notice right away; the server confirms
    send({type:'ack',nid},null,true);}
  // 总控工具
  else if(a==='adm-ask'){A.ask=v;A.pinTo=v.startsWith('edit:')?v.slice(5):'';}
  else if(a==='adm-cancel'){A.ask=null;}
  else if(a==='bank-import'){send({type:'setbank',rows:bankRows(A.bankTxt)},()=>{A.bankTxt='';});}
  else if(a==='bank-clear'){A.ask=null;send({type:'setbank',rows:[]});}
  else if(a==='adm-gen'){send({type:'admin.genpins',counts:A.counts},m=>{A.pins=m.data;});}
  else if(a==='adm-pins'){send({type:'admin.pins'},m=>{A.pins=m.data;},true);}
  else if(a==='adm-hide'){A.pins=null;}
  else if(a==='adm-resetpin'){A.ask=null;send({type:'admin.resetpin',pin:v},m=>{A.pins=m.data;});}
  else if(a==='adm-setpin'){send({type:'admin.setpin',pin:v,to:A.pinTo},m=>{A.ask=null;A.pinTo='';A.pins=m.data;});}
  else if(a==='adm-snaps'){send({type:'admin.snaps'},m=>{A.snaps=m.data;},true);}
  else if(a==='adm-restore'){A.ask=null;send({type:'admin.restore',key:v},()=>{A.snaps=null;});}
  else if(a==='adm-reset'){A.ask=null;if(v==='blank'&&A.resetTxt!=='重置')return;A.resetTxt='';send({type:'admin.reset',demo:v==='blank'?false:v});}
  else if(a==='adm-csv'){downloadPins();}
  else if(a==='off-add'){if(!offWhy()){const f=ui.off,k=ME.role==='dealer'?'room':f.k,rows=offGet(),at=Date.now();
    parseIds(f.ids).forEach((pid,j)=>{const x={at:at+j,k,pid};if(k==='room'){x.rid=offRid();x.res=f.res;}
      if(k==='ransom')x.by=parseIds(f.by)[0];if(k==='puz')x.code=puzCode(f.code);if(k==='gate'){x.rw=f.rw;x.arg=f.rw==='save'?parseIds(f.arg)[0]:f.arg;}rows.push(x);});
    offSet(rows);ui.off={...f,ids:'',code:'',arg:'',by:''};}}
  else if(a==='off-del'){const rows=offGet();rows.splice(+v,1);offSet(rows);}
  else if(a==='off-close'){ui.offOn=false;}
  else if(a==='simoff'){ui.simOff=!ui.simOff;if(ui.simOff){offSince=Date.now()-6000;ui.offOn=true;}else{offSince=0;if(!LOCAL)connect();}setConn();}
  else if(a==='off-send'){const rows=offGet();if(rows.length)send({type:'offline',rows:rows.map(({err,...x})=>x)},m=>{const left=rows.map((x,i)=>({...x,err:m.data&&m.data[i]&&!m.data[i].ok?m.data[i].msg:null})).filter(x=>x.err);offSet(left);if(!left.length)ui.offOn=false;});}
  else if(a==='stats-load'){send({type:'dev.stats'},m=>{ui.stats=m.data;},true);}
  else if(a==='stats-view'){ui.statsView=v;}
  else if(a==='stats-csv'){downloadStats();}
  else if(a==='stats-ask'){ui.statsAsk=true;}
  else if(a==='stats-cancel'){ui.statsAsk=false;}
  else if(a==='stats-clear'){ui.statsAsk=false;send({type:'dev.clearstats'},m=>{ui.stats=m.data;});}
  render();
  if(a==='adm-ask'&&v.startsWith('edit:')){const el=$('#pinto');if(el){el.focus();el.select();}}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&(ui.statsAsk||ui.cfm)){ui.statsAsk=false;ui.cfm=null;render();return;}
  if(e.key==='Escape'&&e.target.id==='pinto'){ui.admin.ask=null;render();return;}
  if(e.key!=='Enter'||!e.target.dataset)return;const m=e.target.dataset.m;   // 输入框里按回车 = 点旁边的主按钮
  const go={ent:'enter',gw:'gatewin','pz.pid':'puz','pz.code':'puz',nick:'setnick','admin.pinTo':'adm-setpin'}[m];if(!go)return;
  const btn=document.querySelector('[data-a="'+go+'"]');if(btn&&!btn.disabled){e.preventDefault();e.target.blur();btn.click();}
});
document.addEventListener('change',e=>{
  if(e.target.id==='devas'){ui.as=e.target.value;ui.tab=null;ui.ddOpen=null;say(null);render();return;}
  const m=e.target.dataset.m;if(!m)return;
});
// 输入时只更新数据和少数按钮（不整页重绘，免得打断输入）；失焦后再整页重绘
const LIVE={ent:1,gw:1,'pz.pid':1,'pz.code':1,nick:1,'ed.amt':1,'ed.nick':1,q:1,'pub.players':1,'off.code':1,'admin.bankTxt':1,'off.ids':1,'off.arg':1,'off.by':1,ransomBy:1};
document.addEventListener('input',e=>{
  if(e.target.id==='pin'){const el=e.target;el.value=el.value.replace(/\D/g,'').slice(0,6);if($('#lgmsg').classList.contains('err'))loginMsg('');syncBoxes();return;}
  const m=e.target.dataset.m,v=e.target.value;if(!m)return;
  if(m==='demoRow.pin'){const el=e.target,r=ui.demoRows&&ui.demoRows[+el.dataset.i];el.value=el.value.replace(/\D/g,'').slice(0,6);if(r)r.pin=el.value;}
  else if(m==='adm.resetTxt'){ui.admin.resetTxt=v;const btn=$('#rstbtn');if(btn){btn.disabled=v!=='重置';btn.classList.toggle('fillred',v==='重置');}return;}
  else if(m==='durMin'){ui.admin.dur=v.replace(/[^\d.]/g,'');return;}
  else if(m==='admin.pinTo'){const el=e.target;el.value=el.value.replace(/\D/g,'').slice(0,6);ui.admin.pinTo=el.value;liveRender();return;}
  else if(m==='capN'){ui.admin.cap=v.replace(/\D/g,'');return;}
  else if(m==='addN'){ui.addN=v.replace(/\D/g,'');return;}
  else if(m.startsWith('adm.')){ui.admin.counts[m.slice(4)]=+v;try{localStorage.setItem('borderland.pincounts',JSON.stringify(ui.admin.counts));}catch(e){}if(!LOCAL)send({type:'setpincounts',counts:ui.admin.counts},null,true);return;}
  else if(m==='ransomBy'){ui.ransomBy[e.target.dataset.p]=v;}
  else if(e.target.type!=='checkbox')setp(m,v);
  if(LIVE[m])liveRender();
});
// 正在输入时，把整页按新的 ui 重画一次，但保住输入框的焦点和光标
function liveRender(){const a=document.activeElement,id=a&&a.id,dm=a&&a.dataset&&a.dataset.m,dp=a&&a.dataset&&a.dataset.p,s=a&&a.selectionStart,en=a&&a.selectionEnd;
  render();const el=id?document.getElementById(id):dm?document.querySelector('[data-m="'+dm+'"]'+(dp?'[data-p="'+dp+'"]':'')):null;
  if(el&&el!==document.activeElement){el.focus({preventScroll:true});try{el.setSelectionRange(s,en);}catch{/* number inputs */}}}
function copyText(t){
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t);
  return new Promise((ok,bad)=>{const x=document.createElement('textarea');x.value=t;x.style.cssText='position:fixed;opacity:0';document.body.appendChild(x);x.select();
    try{document.execCommand('copy')?ok():bad();}catch(e){bad(e);}x.remove();});}
function downloadPins(){
  const rows=[['身份','编号/名称','昵称','PIN','登录链接']].concat((ui.admin.pins||[]).map(p=>{const q=p.pid&&pl(p.pid);return [p.roleName,p.pid||p.label,q?q.nick:'',p.pin,location.origin+'/?pin='+p.pin];}));
  const csv='﻿'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='borderland-pins.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// 身份卡：每人一张，印编号、PIN 和登录网址（不印二维码）。A4 纵向每页 8 张，在本机生成，风格同酆都通行证。
function printCards(){
  const go=pins=>{
    const ps=pins.filter(p=>p.role==='player'&&pl(p.pid)).sort((a,b)=>a.pid.localeCompare(b.pid));
    if(!ps.length){say(no('还没有玩家 PIN，先点「生成 PIN」'));return;}
    const host=location.host;
    const card=p=>{const q=pl(p.pid);
      return '<div class="c"><i class="fr"></i><i class="cn tl"></i><i class="cn tr"></i><i class="cn bl"></i><i class="cn br"></i>'
        +'<div class="hd"><b>酆都通行证</b><span>百鬼夜行身份卡</span></div><div class="rule"></div>'
        +'<div class="bd"><div class="l"><span class="k">持证人编号</span><span class="id">'+q.id+'</span>'
        +'</div>'
        +'<div class="seal"><span>准</span><span>入</span></div></div>'
        +'<div class="pinr"><span class="k">登录 PIN</span><span class="pin">'+p.pin.split('').join('</span><span class="pin">')+'</span></div>'
        +'<div class="ft">手机打开 <b>'+esc(host)+'</b>，输入 PIN 进入。请勿外借</div></div>';};
    const css='@page{size:A4;margin:9mm}*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;color:#1b1712;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
      +'.pg{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:67mm;gap:3.5mm;page-break-after:always}.pg:last-child{page-break-after:auto}'
      +'.c{position:relative;background:#f4efe3;border:1px solid #b9ab8c;padding:5mm 6mm 4mm;display:flex;flex-direction:column;gap:1.6mm;overflow:hidden}'
      +'.fr{position:absolute;inset:2mm;border:.5px solid #8c7d5c;pointer-events:none}.cn{position:absolute;width:4mm;height:4mm;border:1.4px solid #0b7658}'
      +'.cn.tl{left:1.2mm;top:1.2mm;border-right:0;border-bottom:0}.cn.tr{right:1.2mm;top:1.2mm;border-left:0;border-bottom:0}.cn.bl{left:1.2mm;bottom:1.2mm;border-right:0;border-top:0}.cn.br{right:1.2mm;bottom:1.2mm;border-left:0;border-top:0}'
      +'.hd{display:flex;justify-content:space-between;align-items:baseline}.hd b{font-family:"Ma Shan Zheng","Kaiti SC","STKaiti",serif;font-weight:400;font-size:19pt;letter-spacing:.12em;line-height:1}.hd span{font-size:7.5pt;color:#6a5d45;letter-spacing:.1em}'
      +'.rule{height:0;border-top:.6px solid #8c7d5c;margin:.5mm 0}'
      +'.bd{display:flex;gap:3mm;align-items:flex-start;flex:1;min-height:0}.l{flex:1;display:flex;flex-direction:column;gap:.4mm;min-width:0}.k{font-size:6.8pt;color:#7a6c50;letter-spacing:.12em}'
      +'.id{font:800 36pt "JetBrains Mono",ui-monospace,Menlo,monospace;line-height:1;letter-spacing:.04em;margin-bottom:1mm}'
      +'.seal{flex:none;width:15mm;height:15mm;border:1.6px solid #b3332a;color:#b3332a;display:grid;grid-template-columns:1fr;place-items:center;font-family:"Ma Shan Zheng","Kaiti SC",serif;font-size:12pt;line-height:1;transform:rotate(-6deg);opacity:.85;padding:1mm 0}'
      +'.pinr{display:flex;align-items:center;gap:1.2mm;border-top:.6px dashed #8c7d5c;padding-top:1.6mm}.pinr .k{margin-right:1.5mm}'
      +'.pin{display:inline-grid;place-items:center;width:6.6mm;height:8mm;border:1px solid #1b1712;background:#fffdf6;font:800 13pt "JetBrains Mono",monospace}'
      +'.ft{font-size:6.6pt;color:#6a5d45;line-height:1.35}.ft b{color:#1b1712}'
      +'.np{padding:12px;font-size:14px}@media print{.np{display:none}}';
    let pages='';for(let i=0;i<ps.length;i+=8)pages+='<div class="pg">'+ps.slice(i,i+8).map(card).join('')+'</div>';
    const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="'+esc(location.origin)+'/"><link rel="stylesheet" href="fonts.css"><title>百鬼夜行 身份卡</title><style>'+css+'</style></head><body>'
      +'<div class="np">共 '+ps.length+' 张，每页 8 张。打印时勾选「背景图形」可印出纸色。<button onclick="print()">打印</button></div>'+pages+'</body></html>';
    const w=window.open('','_blank');
    if(w){w.document.open();w.document.write(html);w.document.close();}
    else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download='borderland-cards.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  };
  if(ui.admin.pins)go(ui.admin.pins);else send({type:'admin.pins'},m=>{ui.admin.pins=m.data;go(m.data);},true);
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
else{if(SESSION){setMe(SESSION.me);if(SESSION.me.demo&&SESSION.me.dmode==='local')localStart();else{connect();setTimeout(restoreLast,3500);}}render();say(null);}
// 页面重开且服务器连不上：3.5 秒后改用本机保存的最后状态（连上后会被服务器状态替换）。
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
