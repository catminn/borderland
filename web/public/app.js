// 百鬼夜行 · browser app.
// The server owns the game state; this page signs in with a PIN, keeps a live WebSocket, renders the pages
// for the signed-in role, and sends actions. Rule helpers come from rules.js (same file the server runs).
import * as R from './rules.js';
const {TEAMS,ROOMS,FRAG,SUITS,RATE,PER_TEAM,MIN_STAY,COIN_GOAL,team,room,alive,fmt,protectedLeft,esc,matches,targetLabel,
  rewardTxt,MODES,kindLabel,defMode,isFirst,indiv,lab,tcol,cands,whyNotEnter,gapOf,teamStatus,no}=R;

let S=null, ME=null, CLOCK=null, OFFSET=0;
let ui={don:{},tab:null,room:'3S',pick:'',res:{},hookTeam:'',hookTarget:'',doneSel:{},revokeAsk:null,sTeam:'',sVal:'',
  buyer:'',ncOpen:false,nc:{name:'',desc:'',price:300,stock:1},
  pub:{kind:'任务',mode:'first',reward:0,title:'',body:'',target:'all',team:'R',player:'',mins:10},
  admin:{pins:null,snaps:null,counts:{dealer:8,judge:3,mengpo:2,ctrl:2,screen:1},ask:null}};
const $=s=>document.querySelector(s);
const ROLE_TABS={ctrl:['board','dealer','ctrl','npc','market'],dealer:['dealer'],judge:['npc'],mengpo:['market'],screen:['board'],player:['player']};
const TAB_NAME={board:'大屏',player:'我的',dealer:'Dealer 房间',ctrl:'生死簿',npc:'判官',market:'鬼市'};
const ROLE_NAME={player:'玩家',dealer:'Dealer',judge:'判官',mengpo:'孟婆',ctrl:'总控',screen:'大屏'};
const nowT=()=>!CLOCK?0:CLOCK.running?CLOCK.base+Math.floor((Date.now()+OFFSET-CLOCK.at)/1000):CLOCK.base;

// ---------- pages (same markup as the prototype) ----------
function rankPanel(){
  const list=[...S.teams].sort((a,b)=>b.score-a.score);
  const max=Math.max(1,...list.map(t=>t.score));
  let rk=0,prev=null;
  const rows=list.map((t,i)=>{if(t.score!==prev){rk=i+1;prev=t.score;}
    return '<div class="rank" style="--tc:'+t.color+'"><span class="no mono">'+rk+'</span><span class="chip"><i></i>'+t.name+'</span>'
      +'<div class="bar" role="img" aria-label="'+t.name+' 现有 '+t.score+' 冥币"><span style="width:'+(t.score/max*100)+'%"></span></div>'
      +'<span class="vals"><b class="pts mono">'+t.score+'</b></span></div>';}).join('');
  return '<section class="panel"><h2>队伍排名</h2><div>'+rows+'</div></section>';
}
function teamPanel(teams){
  const me=S.players.find(p=>p.id===ME.pid),t=team(me.team);
  const mk=S.players.filter(p=>p.team===t.id&&p.st==='market');
  const rows=mk.map(p=>{const gap=gapOf(p),def=Math.min(gap*RATE,t.score);
    const act=me.st==='alive'?'<span class="row" style="flex-wrap:nowrap"><input type="number" min="0" step="100" style="width:100px" id="d-'+p.id+'" data-m="don" data-p="'+p.id+'" value="'+(ui.don[p.id]!=null?ui.don[p.id]:def)+'" aria-label="为 '+p.id+' 花掉的队伍冥币"><button class="btn primary" data-a="donate" data-p="'+p.id+'">冥币助力</button></span>':'';
    return '<div class="mrow"><span class="chip" style="--tc:'+t.color+'"><i></i>'+p.id+' <span class="cnt">在鬼市，还差 '+gap+' 冥币</span></span>'+act+'</div>';}).join('');
  return '<section class="panel"><h2>本队状态</h2><div class="scorebox"><span class="muted">队伍冥币</span><span class="big mono">'+t.score+'</span></div><div>'+teams+'</div>'
    +'<div><h2 style="font-size:15px;margin-bottom:6px">买命助力</h2><div class="muted">队友在鬼市时，可以用本队冥币 '+RATE+':1 兑换助力，补足 '+COIN_GOAL+'。填的是本队花掉的冥币数。</div>'+(rows?'<div class="market">'+rows+'</div>':'<div class="muted">本队现在没有人在鬼市。</div>')+'</div>'
    +'<div><h2 style="font-size:15px;margin-bottom:6px">本队技能卡</h2>'+(t.skills.length?'<div class="dots">'+t.skills.map(k=>'<span class="pill busy">'+esc(k.name)+'</span>').join('')+'</div>':'<div class="muted">还没有。技能卡只有鬼市里的人能用自己的冥币买。</div>')+'</div>'
    +'</section>';
}

function roomState(rid){const st=S.rooms.find(x=>x.id===rid);return st.teams;}
function glyph(s){return '<span class="glyph '+(s==='♥'||s==='♦'?'red':'')+'">'+s+'</span>';}

function viewBoard(mode){
  const mineOnly=mode==='team';
  const rooms=ROOMS.map(r=>{
    const ts=roomState(r.id);
    const pill=ts.length?'<span class="pill busy">进行中 · '+ts.map(i=>team(i).name).join(' vs ')+'</span>':'<span class="pill free">空闲</span>';
    return '<div class="room"><div class="top">'+glyph(r.card)+'</div>'
      +'<div class="meta">'+({'♠':'体能','♦':'逻辑','♣':'默契','♥':'心理'}[r.suit])+(r.two?'（两队对抗）':'')+' · +'+r.n*100+' 冥币</div>'+pill+'</div>';
  }).join('');
  const teams=S.teams.filter(t=>!mineOnly||t.id===team(S.players.find(p=>p.id===ME.pid).team).id).map(t=>{
    const st=teamStatus(t);
    const dots=S.players.filter(p=>p.team===t.id).map(p=>'<span class="dot '+(p.st==='alive'?'':'out')+'" title="'+p.id+(p.st==='alive'?'':'（鬼市）')+'"></span>').join('');
    const suits=SUITS.map(s=>{const has=t.cards.filter(c=>c.includes(s));
      return '<div class="suit '+(has.length?'has':'')+'"><span class="g '+(s==='♥'||s==='♦'?'red':'')+'">'+(has.length?has.join(' '):s)+'</span><small>'+FRAG[s]+'</small></div>';}).join('');
    return '<div class="team"><div class="chip" style="--tc:'+t.color+'"><i></i>'+t.name+'</div>'
      +'<div class="mid"><div class="dots" aria-label="存活 '+alive(t.id).length+' 人">'+dots+'<span class="cnt">存活 '+alive(t.id).length+'/'+PER_TEAM+'</span>'+(mineOnly?'':'<span class="cnt">冥币 '+t.score+'</span>')+'</div><div class="suits">'+suits+'</div></div>'
      +'<span class="pill '+st.k+'">'+st.txt+'</span></div>';
  }).join('');
  if(mode==='rooms')return '<div class="grid rooms">'+rooms+'</div>';
  if(mode==='book')return '<section class="panel"><h2>各队状态</h2><div>'+teams+'</div></section>';
  if(mineOnly)return teamPanel(teams);
  return '<div class="grid rooms">'+rooms+'</div><div style="height:16px"></div>'+rankPanel();
}
function logHtml(n){
  return '<ul class="log">'+S.log.slice(0,n).map(l=>'<li class="'+l.kind+'"><span class="ts">'+fmt(l.t)+'</span><span class="tx">'+esc(l.text)+'</span></li>').join('')+'</ul>';
}

function viewDealer(){
  const r=room(ui.room), ts=roomState(r.id), cap=r.two?2:1;
  const tabs=ROOMS.map(x=>{const n=roomState(x.id).length;
    return '<button class="btn" data-a="room" data-v="'+x.id+'" aria-pressed="'+(x.id===ui.room)+'"><span class="g '+(x.suit==='♥'||x.suit==='♦'?'red':'')+'">'+x.card+'</span><small>'+(n?'进行中':'空闲')+'</small></button>';}).join('');
  let enter='';
  if(ts.length<cap){
    const opts=S.teams.map(t=>{const w=whyNotEnter(t.id,r.id);return '<option value="'+t.id+'" '+(w?'disabled':'')+' '+(ui.pick===t.id?'selected':'')+'>'+t.name+(w?' · '+w:'')+'</option>';}).join('');
    enter='<div class="row"><div class="field"><label for="pick">入场队伍</label><select id="pick" data-m="pick"><option value="">选择队伍…</option>'+opts+'</select></div>'
      +'<button class="btn primary" data-a="enter">放行入场</button></div>';
  }
  const occ=ts.map(tid=>{const t=team(tid),v=ui.res[tid]||'';
    return '<div class="occ"><span class="chip" style="--tc:'+t.color+'"><i></i>'+t.name+' <span class="cnt">存活 '+alive(tid).length+'</span></span>'
     +'<div class="seg" role="group" aria-label="'+t.name+'结果"><button class="w" data-a="res" data-t="'+tid+'" data-v="win" aria-pressed="'+(v==='win')+'">赢</button><button class="l" data-a="res" data-t="'+tid+'" data-v="lose" aria-pressed="'+(v==='lose')+'">输</button></div></div>';}).join('');
  const finish=ts.length?'<div class="row" style="justify-content:space-between"><span class="muted">'+(r.n>=5?'牌面 ≥5：输了将抽签淘汰 1 名队员':'牌面 <5：输了不淘汰')+(r.two?'，需两队同场':'')+'</span><button class="btn danger" data-a="finish">结束并结算</button></div>':'';
  return '<section class="panel"><h2>选择房间</h2><div class="roomtabs">'+tabs+'</div></section><div style="height:16px"></div>'
   +'<section class="panel"><div class="top" style="display:flex;gap:12px;align-items:baseline">'+glyph(r.card)+'<h2>'+r.name+'</h2></div>'
   +'<div class="rule">'+r.rule+'</div><div class="muted">'+(r.two?'两队对抗，两队都到齐才能结算':'至少 '+r.min+' 人存活的队伍才能进入')+' · 赢 +'+r.n*100+' 冥币</div>'
   +enter+(occ?'<div>'+occ+'</div>':'')+finish+'</section>';
}

function viewNpc(){
  const aliveByTeam=S.teams.filter(t=>t.id!==ui.hookTeam).map(t=>{
    const g=alive(t.id).map(p=>{const l=protectedLeft(p);return '<option value="'+p.id+'" '+(l>0?'disabled':'')+' '+(ui.hookTarget===p.id?'selected':'')+'>'+p.id+(l>0?' · 保护期 '+Math.ceil(l/60)+' 分':'')+'</option>';}).join('');
    return g?'<optgroup label="'+t.name+'">'+g+'</optgroup>':'';}).join('');
  const teamOpts=S.teams.map(t=>'<option value="'+t.id+'" '+(ui.hookTeam===t.id?'selected':'')+'>'+t.name+'</option>').join('');
  const hookPanel='<section class="panel"><h2>勾魂令 <span class="cnt">已勾魂 '+S.gate+' 次</span></h2>'
   +'<div class="muted">判官在上面的任务判定里记录哪队先完成任务后，在这里点名。系统检查保护期和鬼市人数上限。</div>'
   +'<div class="row"><div class="field"><label for="hk">取得勾魂令</label><select id="hk" data-m="hookTeam" data-r="1"><option value="">选择队伍…</option>'+teamOpts+'</select></div>'
   +'<div class="field"><label for="ht">被点名的别队队员</label><select id="ht" data-m="hookTarget" '+(ui.hookTeam?'':'disabled')+'><option value="">'+(ui.hookTeam?'选择别队队员…':'先选取得勾魂令的队伍')+'</option>'+aliveByTeam+'</select></div></div>'
   +'<div><button class="btn danger" data-a="hook">勾魂</button></div></section>';
  const tasks=S.notices.filter(n=>n.kind==='任务').slice(0,4);
  const taskPanel='<section class="panel"><h2>任务判定</h2>'+(tasks.length?tasks.map(n=>'<div class="ncard"><div class="nh"><span class="pill busy">'+kindLabel(n)+'</span><b>'+esc(n.title)+'</b><span class="cnt">'+fmt(n.t)+' → '+targetLabel(n)+'</span></div><div class="muted">'+[n.due?countdown(n):'无时限',rewardTxt(n)].filter(Boolean).join(' · ')+'</div>'+taskRows(n,true)+'</div>').join(''):'<div class="muted">还没有发布任务。</div>')+'</section>';
  return '<div class="two">'+taskPanel+hookPanel+'</div>';
}
function viewMarket(){
  const mk=S.players.filter(p=>p.st==='market').sort((a,b)=>a.outAt-b.outAt);
  const mrows=mk.map(p=>{const stay=S.t-p.outAt,wait=Math.max(0,MIN_STAY-stay),tot=p.coins+p.bail;
    return '<div class="mp"><div class="top"><span class="chip" style="--tc:'+team(p.team).color+'"><i></i>'+p.id+'</span>'
      +'<span class="pill '+(wait?'busy':'free')+'">'+(wait?'还需 '+Math.ceil(wait/60)+' 分':'已待 '+Math.floor(stay/60)+' 分')+'</span></div>'
      +'<div class="mg"><label class="f"><span class="k">冥币</span><input type="number" min="0" step="100" id="c-'+p.id+'" data-m="coin" data-p="'+p.id+'" value="'+p.coins+'" aria-label="'+p.id+' 冥币"></label>'
      +'<div class="f"><span class="k">队友助力</span><span class="v">'+p.bail+'</span></div>'
      +'<div class="f"><span class="k">合计 / '+COIN_GOAL+'</span><span class="v" id="tot-'+p.id+'">'+tot+'</span></div>'
      +'<button class="btn primary" data-a="revive" data-p="'+p.id+'">买命回队</button></div></div>';}).join('');
  const mkt='<section class="panel"><h2>孟婆买命 <span class="cnt">'+mk.length+' 人</span></h2>'
   +'<div class="muted">鬼市里的人待满 '+MIN_STAY/60+' 分钟且冥币达到 '+COIN_GOAL+' 才能买命；队友可用本队冥币 '+RATE+':1 兑换助力。买命后多出来的冥币带回队伍。冥币按现场纸钱清点后填入。</div>'
   +'<div class="market">'+(mrows||'<div class="muted">鬼市现在没有人。</div>')+'</div></section>';
  if(ui.buyer&&!mk.some(p=>p.id===ui.buyer))ui.buyer='';
  const bOpts='<option value="">'+(mk.length?'选择鬼市里的人…':'鬼市现在没有人')+'</option>'+mk.map(p=>'<option value="'+p.id+'" '+(ui.buyer===p.id?'selected':'')+'>'+p.id+'（'+team(p.team).name+'）· '+p.coins+' 冥币</option>').join('');
  const goods=S.shop.map(c=>'<div class="mrow"><div style="min-width:0;flex:1 1 200px"><b>'+esc(c.name)+'</b> <span class="cnt">'+c.price+' 冥币 · 剩 '+c.stock+' 张</span>'+(c.desc?'<div class="muted">'+esc(c.desc)+'</div>':'')+'</div>'
    +'<button class="btn '+(c.stock?'primary':'')+'" data-a="buy" data-k="'+c.id+'" '+(c.stock?'':'disabled')+'>'+(c.stock?'卖给买家':'售罄')+'</button></div>').join('');
  const form=ui.ncOpen?'<div class="ncard"><div class="row">'
    +'<div class="field"><label for="ncn">卡名</label><input type="text" id="ncn" data-m="nc.name" value="'+esc(ui.nc.name)+'"></div>'
    +'<div class="field" style="flex:0 1 110px"><label for="ncp">价格（冥币）</label><input type="number" id="ncp" min="0" step="100" data-m="nc.price" value="'+ui.nc.price+'"></div>'
    +'<div class="field" style="flex:0 1 90px"><label for="ncs">库存</label><input type="number" id="ncs" min="1" data-m="nc.stock" value="'+ui.nc.stock+'"></div></div>'
    +'<div class="field"><label for="ncd">效果说明</label><input type="text" id="ncd" data-m="nc.desc" value="'+esc(ui.nc.desc)+'"></div>'
    +'<div class="row"><button class="btn primary" data-a="addcard">上架</button><button class="btn" data-a="ncopen">取消</button></div></div>'
    :'<div><button class="btn" data-a="ncopen">＋ 上架新技能卡</button></div>';
  const shop='<section class="panel"><h2>技能卡商铺</h2>'
    +'<div class="muted">只有鬼市里的人能用自己的冥币买。卡归买家所在队伍，使用时找工作人员出示，在下面标记已使用。</div>'
    +'<div class="field"><label for="buyer">买家</label><select id="buyer" data-m="buyer">'+bOpts+'</select></div><div>'+goods+'</div>'+form+'</section>';
  const inv=S.teams.flatMap(t=>t.skills.map(k=>'<div class="mrow"><span class="chip" style="--tc:'+t.color+'"><i></i>'+t.name+' · '+esc(k.name)+' <span class="cnt">'+esc(k.by)+' 买于 '+fmt(k.t)+'</span></span><button class="btn" data-a="usecard" data-t="'+t.id+'" data-k="'+k.sid+'">标记已使用</button></div>')).join('');
  const invPanel='<section class="panel"><h2>各队持有的技能卡</h2>'+(inv||'<div class="muted">还没有队伍买过技能卡。</div>')+'</section>';
  return '<div class="two">'+mkt+'<div style="display:flex;flex-direction:column;gap:16px;min-width:0">'+shop+invPanel+'</div></div>';
}
function scorePanel(){
  return '<section class="panel"><h2>修改队伍冥币</h2><div class="row" style="align-items:flex-end"><div class="field" style="flex:1 1 160px"><label for="st">队伍</label><select id="st" data-m="sTeam" data-r="1"><option value="">选择队伍…</option>'+S.teams.map(t=>'<option value="'+t.id+'" '+(ui.sTeam===t.id?'selected':'')+'>'+t.name+'</option>').join('')+'</select></div>'
   +'<div class="field" style="flex:1 1 160px"><label for="sv">新冥币数</label><input type="number" id="sv" step="100" data-m="sVal" value="'+ui.sVal+'" '+(ui.sTeam?'':'disabled')+'></div>'
   +'<div><button class="btn primary" data-a="setscore">确认修改</button></div></div></section>';
}
function viewCtrl(){
  return viewBoard('book')+'<div style="height:16px"></div>'+scorePanel()+'<div style="height:16px"></div>'+pubPanel()+'<div style="height:16px"></div><section class="panel"><h2>全场日志</h2>'+logHtml(30)+'</section>'+adminPanel();
}
function taskRows(n,can){
  const ds=Object.entries(n.done).sort((a,b)=>a[1].t-b[1].t),first=isFirst(n);
  const rows=ds.map(([cid,d],i)=>'<div class="mrow"><span class="chip" style="--tc:'+tcol(cid)+'"><i></i>'+lab(cid)+' <span class="cnt">'+fmt(d.t)+(n.due&&d.t>n.due?' 超时':'')+'</span></span><span class="row" style="flex-wrap:nowrap">'
    +'<span class="pill free">'+(first?'率先完成':'已完成')+'</span>'
    +(can?'<button class="btn" data-a="undone" data-n="'+n.id+'" data-t="'+cid+'">撤销</button>':'')+'</span></div>').join('');
  const rest=cands(n).filter(c=>!n.done[c]);
  const sel0=ui.doneSel[n.id]||'';
  const pick=can&&rest.length&&!(first&&ds.length)?'<div class="row"><div class="field"><select id="ds-'+n.id+'" aria-label="完成任务的'+(indiv(n)?'队员':'队伍')+'" data-m="doneSel" data-n="'+n.id+'"><option value="">选择'+(indiv(n)?'队员':'队伍')+'…</option>'+rest.map(c=>'<option value="'+c+'" '+(sel0===c?'selected':'')+'>'+lab(c)+'</option>').join('')+'</select></div>'
    +'<div><button class="btn primary" data-a="done" data-n="'+n.id+'">确认完成</button></div></div>':'';
  return rows+pick;
}

function countdown(n){if(!n.due)return '';const r=n.due-S.t;return r>0?'剩余 <span class="mono">'+String(Math.floor(r/60)).padStart(2,'0')+':'+String(r%60).padStart(2,'0')+'</span>':'<span class="red">已截止</span>';}
function pubPanel(){
  const f=ui.pub;
  const sel=(k,arr)=>arr.map(([v,l])=>'<option value="'+v+'" '+(f[k]===v?'selected':'')+'>'+l+'</option>').join('');
  const sub=f.target==='team'?'<div class="field"><label for="pt">哪一队</label><select id="pt" data-m="pub.team">'+sel('team',S.teams.map(t=>[t.id,t.name]))+'</select></div>'
    :f.target==='player'?'<div class="field"><label for="pp">哪位队员</label><select id="pp" data-m="pub.player"><option value="">选择队员…</option>'+S.teams.map(t=>'<optgroup label="'+t.name+'">'+S.players.filter(p=>p.team===t.id).map(p=>'<option value="'+p.id+'" '+(f.player===p.id?'selected':'')+'>'+p.id+'</option>').join('')+'</optgroup>').join('')+'</select></div>':'';
  const list=S.notices.filter(n=>n.kind!=='通知').slice(0,4).map(n=>{
    const aud=S.players.filter(p=>matches(n,p)),acked=aud.filter(p=>n.acks[p.id]).length;
    let extra='';
    if(n.kind==='任务'){
      extra=taskRows(n,false);
    }
    return '<div class="ncard"><div class="nh"><span class="pill busy">'+kindLabel(n)+'</span><b>'+esc(n.title)+'</b><span class="cnt">'+fmt(n.t)+' → '+targetLabel(n)+'</span></div>'
      +'<div class="muted">已读 '+acked+'/'+aud.length+' · '+[n.due?countdown(n):'无时限',rewardTxt(n)].filter(Boolean).join(' · ')+'</div>'+extra
      +'<div class="row" style="justify-content:flex-end">'+(ui.revokeAsk===n.id?'<span class="cnt">撤销后玩家手机上的这条会消失'+(Object.values(n.done).some(d=>d.pts)?'，已发的奖励会扣回':'')+'</span><button class="btn danger" data-a="revokeok" data-n="'+n.id+'">确认撤销</button><button class="btn" data-a="revokeno">取消</button>':'<button class="btn" data-a="revoke" data-n="'+n.id+'">撤销发布</button>')+'</div></div>';}).join('');
  return '<section class="panel"><h2>发布公告 / 临时任务</h2>'
   +'<div class="row"><div class="field" style="flex:0 1 120px"><label for="pk">类型</label><select id="pk" data-m="pub.kind" data-r="1">'+sel('kind',[['公告','公告'],['任务','任务'],['秘密任务','秘密任务']])+'</select></div>'
   +'<div class="field"><label for="pto">发给</label><select id="pto" data-m="pub.target" data-r="1">'+sel('target',[['all','全体玩家'],['team','某一队'],['player','某位队员'],['alive','所有存活的人'],['market','鬼市里的人']])+'</select></div>'+sub
   +'<div class="field" style="flex:0 1 110px"><label for="pm">限时（分钟）</label><input type="number" id="pm" min="0" data-m="pub.mins" value="'+f.mins+'"></div>'
   +(f.kind!=='公告'?'<div class="field" style="flex:0 1 110px"><label for="prw">奖励冥币</label><input type="number" id="prw" min="0" step="100" data-m="pub.reward" value="'+f.reward+'"></div>':'')+'</div>'
   +(f.kind!=='公告'?'<div class="field"><label for="pmd">完成方式</label><select id="pmd" data-m="pub.mode">'+MODES.map(([v,t])=>'<option value="'+v+'" '+(f.mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></div>':'')
   +'<div class="field"><label for="pti">标题</label><input type="text" id="pti" data-m="pub.title" value="'+esc(f.title)+'" placeholder="例如：鬼门开：还原鬼片海报"></div>'
   +'<div class="field"><label for="pb">内容</label><textarea id="pb" data-m="pub.body" placeholder="任务要求、集合地点…">'+esc(f.body)+'</textarea></div>'
   +'<div><button class="btn primary" data-a="publish">发布并弹出</button></div>'
   +(list?'<div>'+list+'</div>':'')+'</section>';
}
function viewPlayer(){
  const me=S.players.find(p=>p.id===ME.pid),tm=team(me.team),prot=protectedLeft(me);
  const st=me.st==='alive'?'存活'+(prot?'，保护期还剩 '+Math.ceil(prot/60)+' 分钟':''):'在鬼市，已待 '+Math.floor((S.t-me.outAt)/60)+' 分钟';
  const mine=S.notices.filter(n=>matches(n,me));
  const cards=mine.map(n=>{
    const acked=!!n.acks[me.id],mk=indiv(n)?me.id:me.team,d=n.done[mk];
    let act='';
    if(n.kind==='任务'){const w=Object.keys(n.done)[0],f1=isFirst(n);
      act=d?'<span class="pill free">已完成 '+fmt(d.t)+'</span>'
        :(f1&&w)?'<span class="pill bad">'+(!n.secret?lab(w)+'已抢先完成':'任务已关闭')+'</span>'
        :'<span class="pill busy">进行中</span>';}
    return '<div class="ncard '+(acked?'':'new')+'"><div class="nh"><span class="pill '+(n.kind==='通知'?'bad':'busy')+'">'+kindLabel(n)+'</span><b>'+esc(n.title)+'</b><span class="cnt">'+fmt(n.t)+'</span></div>'
      +'<div>'+esc(n.body)+'</div>'+((n.due||n.reward)?'<div class="muted">'+[n.due?countdown(n):'',rewardTxt(n)].filter(Boolean).join(' · ')+'</div>':'')
      +'<div class="row" style="align-items:center">'+act+(acked?'':'<button class="btn" data-a="ack" data-n="'+n.id+'">知道了</button>')+'</div></div>';}).join('');
  const myRooms=S.rooms.filter(x=>x.teams.includes(me.team)).map(x=>{const r=room(x.id),others=x.teams.filter(i=>i!==me.team);
    return '<div class="room"><div class="top">'+glyph(r.card)+'<span class="nm">'+r.name+'</span></div>'
      +'<div class="meta">'+(r.two?'两队对抗':'至少 '+r.min+' 人存活')+(others.length?' · 同场：'+others.map(i=>team(i).name).join('、'):'')+'</div>'
      +'<span class="pill busy">本队进行中</span></div>';}).join('');
  return '<section class="panel"><div><span class="chip" style="--tc:'+tm.color+'"><i></i>'+me.id+' · '+tm.name+'</span> <span class="pill '+(me.st==='alive'?'free':'bad')+'">'+st+'</span></div></section>'
    +'<div style="height:16px"></div>'+viewBoard('team')
    +'<div style="height:16px"></div><section class="panel"><h2>本队正在进行的房间</h2>'+(myRooms?'<div class="grid rooms">'+myRooms+'</div>':'<div class="muted">本队现在没有在任何房间里。</div>')+'</section>'
    +'<div style="height:16px"></div><section class="panel"><h2>通知与任务</h2>'+(cards||'<div class="muted">暂时没有通知。</div>')+'</section>'
    +'<div style="height:16px"></div><h2 style="margin-bottom:12px">全部房间</h2>'+viewBoard('rooms');
}
function modalHtml(){
  if(!ME||ME.role!=='player')return '';
  const me=S.players.find(p=>p.id===ME.pid);
  const n=S.notices.find(x=>matches(x,me)&&!x.acks[me.id]);if(!n)return '';
  return '<div class="ovl"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dt"><span class="pill '+(n.kind==='通知'?'bad':'busy')+'">'+kindLabel(n)+'</span>'
   +'<h3 id="dt">'+esc(n.title)+'</h3><div>'+esc(n.body)+'</div>'+(n.reward?'<div class="muted">'+rewardTxt(n)+'</div>':'')+(n.due?'<div class="cd">'+countdown(n)+'</div>':'')
   +'<button class="btn primary" data-a="ack" data-n="'+n.id+'" data-modal="1">知道了</button></div></div>';
}

// ---------- 总控 tools (bottom of 生死簿) ----------
function adminPanel(){
  if(!ME||ME.role!=='ctrl')return '';
  const A=ui.admin,c=A.counts;
  const num=(k,l)=>'<div class="field" style="flex:0 1 90px"><label for="adm-'+k+'">'+l+'</label><input type="number" id="adm-'+k+'" min="0" max="30" data-m="adm.'+k+'" value="'+c[k]+'"></div>';
  const pins=A.pins?'<div class="tblwrap"><table class="pins"><thead><tr><th>身份</th><th>编号/名称</th><th>PIN</th><th></th></tr></thead><tbody>'
    +A.pins.map(p=>'<tr><td>'+esc(p.roleName)+'</td><td>'+esc(p.pid||p.label)+'</td><td class="mono">'+p.pin+'</td><td>'
      +(A.ask==='pin:'+p.pin?'<button class="btn danger" data-a="adm-resetpin" data-v="'+p.pin+'">确认重置</button> <button class="btn" data-a="adm-cancel">取消</button>'
        :'<button class="btn" data-a="adm-ask" data-v="pin:'+p.pin+'">重置</button>')+'</td></tr>').join('')+'</tbody></table></div>'
    +'<div class="row"><button class="btn" data-a="adm-csv">下载 PIN 表（CSV）</button><button class="btn" data-a="adm-hide">收起</button></div>':'';
  const snaps=A.snaps?(A.snaps.length?A.snaps.map(s=>'<div class="mrow"><span>'+new Date(s.at).toLocaleTimeString()+' <span class="cnt">游戏 '+fmt(s.t||0)+' · '+esc(s.tag||'')+'</span></span>'
      +(A.ask==='snap:'+s.key?'<span class="row" style="flex-wrap:nowrap"><button class="btn danger" data-a="adm-restore" data-v="'+s.key+'">确认恢复</button><button class="btn" data-a="adm-cancel">取消</button></span>'
        :'<button class="btn" data-a="adm-ask" data-v="snap:'+s.key+'">恢复到这里</button>')+'</div>').join(''):'<div class="muted">还没有备份。每 10 次操作自动备份一次。</div>'):'';
  const resetBtn=(demo,l)=>A.ask==='reset:'+demo?'<button class="btn danger" data-a="adm-reset" data-v="'+demo+'">确认'+l+'</button> <button class="btn" data-a="adm-cancel">取消</button>'
    :'<button class="btn" data-a="adm-ask" data-v="reset:'+demo+'">'+l+'</button>';
  return '<div style="height:16px"></div><section class="panel"><h2>总控工具</h2>'
    +'<div><b>计时</b> <span class="cnt">'+(CLOCK&&CLOCK.running?'进行中':'已暂停')+'</span> <button class="btn" data-a="clockctl">'+(CLOCK&&CLOCK.running?'暂停计时':'开始计时')+'</button></div>'
    +'<div><b>PIN</b><div class="muted">玩家每人一个 PIN；工作人员按下面的数量补齐。已有的 PIN 不会变。</div></div>'
    +'<div class="row">'+num('dealer','Dealer')+num('judge','判官')+num('mengpo','孟婆')+num('ctrl','总控')+num('screen','大屏')
    +'<button class="btn primary" data-a="adm-gen">生成 PIN</button><button class="btn" data-a="adm-pins">查看全部 PIN</button></div>'+pins
    +'<div><b>备份</b> <button class="btn" data-a="adm-snaps">查看备份</button></div>'+snaps
    +'<div class="row" style="align-items:center"><b>游戏数据</b>'+resetBtn('demo','载入演示数据')+resetBtn('blank','重置为空白游戏')+'</div>'
    +'<div class="muted">重置或恢复前都会先自动备份当前数据。</div></section>';
}

// ---------- shell ----------
let dirty=false;
const isTyping=()=>{const a=document.activeElement;return !!a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&!!a.closest('#view');};
function requestRender(){if(isTyping()){dirty=true;$('#clk').textContent=fmt(nowT());}else render();}
document.addEventListener('focusout',()=>setTimeout(()=>{if(dirty&&!isTyping()){dirty=false;render();}},0));

function render(){
  document.body.classList.toggle('screen',!!ME&&ME.role==='screen');
  if(!ME){renderLogin();return;}
  const tabs=ROLE_TABS[ME.role]||[];
  if(!tabs.includes(ui.tab))ui.tab=tabs[0];
  const nav=$('#tabs');nav.hidden=tabs.length<2;
  nav.innerHTML=tabs.map(v=>'<button role="tab" data-a="tab" data-v="'+v+'" aria-selected="'+(v===ui.tab)+'">'+TAB_NAME[v]+'</button>').join('');
  $('#who').textContent=ME.label||ROLE_NAME[ME.role];$('#logout').hidden=false;$('#conn').hidden=false;
  const cc=$('#clockctl');cc.hidden=ME.role!=='ctrl';cc.textContent=CLOCK&&CLOCK.running?'暂停计时':'开始计时';
  if(!S){$('#view').innerHTML='<section class="panel muted">正在连接服务器…</section>';return;}
  R.use(S);S.t=nowT();$('#clk').textContent=fmt(S.t);
  $('#view').innerHTML=ui.tab==='board'?viewBoard():ui.tab==='dealer'?viewDealer():ui.tab==='ctrl'?viewCtrl():ui.tab==='npc'?viewNpc():ui.tab==='market'?viewMarket():viewPlayer();
  $('#modal').innerHTML=modalHtml();const mb=document.querySelector('#modal button');if(mb)mb.focus();
}
function renderLogin(){
  $('#tabs').hidden=true;$('#who').textContent='';$('#logout').hidden=true;$('#clockctl').hidden=true;$('#conn').hidden=true;$('#modal').innerHTML='';
  if($('#loginf'))return;
  $('#view').innerHTML='<section class="panel login"><h2>输入 PIN 进入</h2><div class="muted">PIN 是 6 位数字，在你的名牌卡或邮件里。</div>'
    +'<form id="loginf" class="row"><div class="field"><label for="pin">PIN</label><input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>'
    +'<button class="btn primary">进入</button></form></section>';
  $('#pin').focus();
}
const HINTS={board:'大屏：实时显示各房间占用和队伍排名，排名按队伍冥币排序。',
  dealer:'Dealer：选房间，把队伍放进去；结束后记录输赢。系统会检查这队是否已打过这张牌、房间是否已满、存活人数是否够；赢房得“牌号×100”冥币，输掉牌号 5 及以上的房间会随机淘汰 1 人。',
  ctrl:'生死簿：查看各队状态和全场日志，可以修改队伍冥币，也在这里发布公告、任务和秘密任务。',
  npc:'判官：记录任务完成并点名勾魂（保护期内和本队队员不能点）。',
  market:'鬼市：孟婆登记冥币、放人买命（待满 5 分钟且冥币达到 1000，队友助力 2:1，多余冥币复活后带回队伍）；商铺只卖给鬼市里的人。',
  player:'玩家：查看本队状态、通知和任务、全部房间。任务只能由判官记录完成，这里不能自己提交。'};
function say(r){const n=$('#notice');if(!r){n.className='notice';n.innerHTML='<span class="muted"></span>';n.firstChild.textContent=ME?HINTS[ui.tab]||'':'';return;}
  n.className='notice '+(r.ok?'ok':'bad');n.innerHTML='<b>'+(r.ok?'已记录':'不能这样操作')+'</b><span></span>';n.querySelector('span').textContent=r.msg;}

// ---------- session ----------
const KEY='borderland.session';
const store={get(){try{return JSON.parse(localStorage.getItem(KEY))||null;}catch{return null;}},
  set(v){try{v?localStorage.setItem(KEY,JSON.stringify(v)):localStorage.removeItem(KEY);}catch{/* private mode: stay signed in for this tab only */}}};
let SESSION=store.get();

async function login(pin){
  let res,j={};
  try{res=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});j=await res.json();}
  catch{say(no('连不上服务器，请检查网络后再试'));return;}
  if(!res.ok){say(no(j.error||'登录失败'));return;}
  SESSION={token:j.token,me:j.me};store.set(SESSION);ME=j.me;S=null;ui.tab=null;
  connect();render();say(null);
}
function logout(msg){
  SESSION=null;store.set(null);ME=null;S=null;CLOCK=null;
  if(ws){const w=ws;ws=null;try{w.close();}catch{/* ignore */}}
  clearTimeout(timer);render();say(msg?no(msg):null);
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
    if(m.t==='hello'){ME=m.me;SESSION.me=m.me;store.set(SESSION);}
    if(m.t==='hello'||m.t==='state'){S=m.S;CLOCK=m.clock;OFFSET=m.now-Date.now();requestRender();}
    else if(m.t==='res'){const cb=pending.get(m.id);pending.delete(m.id);if(cb)cb(m);}};
  sock.onclose=e=>{
    if(ws!==sock)return;
    ws=null;connected=false;setConn();
    for(const cb of pending.values())cb({ok:false,msg:'连接断开了，这次操作可能没有生效，重连后请确认'});
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
  if(!ws||!connected){say(no('还没连上服务器，请稍等几秒再试'));return;}
  const id=++seq;
  pending.set(id,m=>{if(!quiet||!m.ok)say(m);if(m.ok&&after)after(m);requestRender();});
  ws.send(JSON.stringify({t:'act',id,a}));
}

// ---------- events ----------
document.addEventListener('submit',e=>{if(e.target.id!=='loginf')return;e.preventDefault();login($('#pin').value.trim());});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b||b.disabled)return;
  const a=b.dataset.a,v=b.dataset.v,A=ui.admin;
  if(a==='tab'){ui.tab=v;say(null);}
  else if(a==='logout'){logout();return;}
  else if(a==='clockctl'){send({type:'admin.clock',op:CLOCK&&CLOCK.running?'pause':'start'});}
  else if(a==='room'){ui.room=v;ui.pick='';ui.res={};}
  else if(a==='res'){ui.res[b.dataset.t]=v;}
  else if(a==='enter'){send({type:'enter',tid:ui.pick,rid:ui.room},()=>{ui.pick='';});}
  else if(a==='finish'){send({type:'finish',rid:ui.room,results:ui.res},()=>{ui.res={};});}
  else if(a==='hook'){send({type:'hook',actor:ui.hookTeam,pid:ui.hookTarget},()=>{ui.hookTarget='';});}
  else if(a==='publish'){send({type:'publish',f:ui.pub},()=>{ui.pub.title='';ui.pub.body='';});}
  else if(a==='ack'){send({type:'ack',nid:+b.dataset.n},null,true);}
  else if(a==='done'){const nid=+b.dataset.n,cid=ui.doneSel[nid],n=S.notices.find(x=>x.id===nid);
    if(!cid)say(no('请先选择完成任务的'+(n&&indiv(n)?'队员':'队伍')));else send({type:'done',nid,cid},()=>{delete ui.doneSel[nid];});}
  else if(a==='setscore'){if(!ui.sTeam)say(no('请先选择队伍'));else send({type:'setscore',tid:ui.sTeam,v:ui.sVal});}
  else if(a==='revoke'){ui.revokeAsk=+b.dataset.n;}
  else if(a==='revokeno'){ui.revokeAsk=null;}
  else if(a==='revokeok'){ui.revokeAsk=null;send({type:'revoke',nid:+b.dataset.n});}
  else if(a==='undone'){send({type:'undone',nid:+b.dataset.n,cid:b.dataset.t});}
  else if(a==='revive'){send({type:'revive',pid:b.dataset.p});}
  else if(a==='buy'){send({type:'buy',kid:b.dataset.k,buyer:ui.buyer});}
  else if(a==='usecard'){send({type:'usecard',tid:b.dataset.t,sid:+b.dataset.k});}
  else if(a==='addcard'){send({type:'addcard',f:ui.nc},()=>{ui.nc={name:'',desc:'',price:300,stock:1};ui.ncOpen=false;});}
  else if(a==='ncopen'){ui.ncOpen=!ui.ncOpen;}
  else if(a==='donate'){const d=ui.don[b.dataset.p];send({type:'donate',pid:b.dataset.p,amt:d==null?null:d},()=>{delete ui.don[b.dataset.p];});}
  else if(a==='adm-ask'){A.ask=v;}
  else if(a==='adm-cancel'){A.ask=null;}
  else if(a==='adm-gen'){send({type:'admin.genpins',counts:A.counts},m=>{A.pins=m.data;});}
  else if(a==='adm-pins'){send({type:'admin.pins'},m=>{A.pins=m.data;},true);}
  else if(a==='adm-hide'){A.pins=null;}
  else if(a==='adm-resetpin'){A.ask=null;send({type:'admin.resetpin',pin:v},m=>{A.pins=m.data;});}
  else if(a==='adm-snaps'){send({type:'admin.snaps'},m=>{A.snaps=m.data;},true);}
  else if(a==='adm-restore'){A.ask=null;send({type:'admin.restore',key:v},()=>{A.snaps=null;});}
  else if(a==='adm-reset'){A.ask=null;send({type:'admin.reset',demo:v==='demo'});}
  else if(a==='adm-csv'){downloadPins();}
  render();
});
document.addEventListener('change',e=>{
  const m=e.target.dataset.m;if(!m)return;
  const v=e.target.value;
  if(m==='coin'){send({type:'coin',pid:e.target.dataset.p,coins:+v},null,true);}
  else if(m==='don'){ui.don[e.target.dataset.p]=+v;}
  else if(m.startsWith('nc.')){ui.nc[m.slice(3)]=v;}
  else if(m.startsWith('adm.')){ui.admin.counts[m.slice(4)]=+v;}
  else if(m.startsWith('pub.')){ui.pub[m.slice(4)]=v;if(m==='pub.target')ui.pub.mode=defMode(v);}
  else if(m==='sTeam'){ui.sTeam=v;ui.sVal=v?team(v).score:'';}
  else if(m==='doneSel'){ui.doneSel[e.target.dataset.n]=v;}
  else{ui[m]=v;if(m==='hookTeam'){const t=S.players.find(p=>p.id===ui.hookTarget);if(t&&t.team===v)ui.hookTarget='';}}
  if(e.target.dataset.r)render();
});
document.addEventListener('input',e=>{
  const m=e.target.dataset.m,v=e.target.value;if(!m)return;
  if(m==='coin'){const q=S.players.find(x=>x.id===e.target.dataset.p);if(q){q.coins=Math.max(0,+v||0);const el=document.getElementById('tot-'+q.id);if(el)el.textContent=q.coins+q.bail;}}
  else if(m==='don'){ui.don[e.target.dataset.p]=+v;}
  else if(m==='sVal'){ui.sVal=v;}
  else if(m.startsWith('nc.'))ui.nc[m.slice(3)]=v;
  else if(m.startsWith('adm.'))ui.admin.counts[m.slice(4)]=+v;
  else if(m.startsWith('pub.')&&e.target.tagName!=='SELECT')ui.pub[m.slice(4)]=v;
});
function downloadPins(){
  const rows=[['身份','编号/名称','PIN']].concat((ui.admin.pins||[]).map(p=>[p.roleName,p.pid||p.label,p.pin]));
  const csv='﻿'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='borderland-pins.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// The clock runs on the server; the page just redraws once a second.
setInterval(()=>{if(S&&ME)requestRender();},1000);

// ---------- start ----------
const qp=new URLSearchParams(location.search).get('pin');
if(qp){history.replaceState(null,'',location.pathname);render();login(qp);}
else{if(SESSION){ME=SESSION.me;connect();}render();say(null);}
