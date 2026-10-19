// 应急记录表：按「纸上怎么用」设计，不是网站数据的镜像。每个角色一页（总控 / 每个房间的 Dealer / 黑白无常与孟婆 / 判官 / 规则速查），
// 都是「一件事一行」的流水记录：谁、什么时候、发生了什么。导出时会把已发生的记录预填进去，后面的空行继续写。
// 自包含 HTML：可打印（A4 横向），也能在浏览器里直接填写（自动存在本机）。纯函数，只吃一份普通数据对象，不联网。
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>s==null||s===''?'':'T+'+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const SUITS=['♠','♦','♣','♥'];
const RES={win:'胜',lose:'负',leave:'中途离开',left:'中途离开'};
const RW=r=>!r?'未领奖':r.k==='coin'?'+300 冥币':r.k==='save'?'救了 '+r.pid:'拿了花色 '+r.s;

// 从游戏状态 S 取出记录表要的数据。R = rules.js 模块（取规则数字）；网页和测试用的是同一份。（v3 个人赛）
// scope：'all' 总控（全部页，只有总控页留空行）/ 'dealer'（只含 rooms 里的房间）/ 'outs'（黑白无常、孟婆）/ 'judge'；blank 时恒为全部页 + 空行。
export function sheetData(S,R,blank,scope,rooms){
  const P=S.players.filter(p=>p.on),nk=id=>(S.players.find(p=>p.id===id)||{}).nick||'';
  const gates=S.notices.filter(n=>n.sub==='gate').flatMap(n=>((S.gp&&S.gp.nid===n.id?S.gp.wins:n.gr)||[]).map((w,i)=>({t:w.t,id:w.pid,nick:nk(w.pid),rank:i+1,title:n.title,rw:RW(w.rw)})));
  return {at:Date.now(),t:S.t,dur:S.dur||7200,blank:!!blank,scope:blank?'all':(scope||'all'),only:Array.isArray(rooms)&&rooms.length?rooms:null,
    K:{CHIP_START:R.CHIP_START,CHIP_GOAL:R.CHIP_GOAL,CARRY_MAX:R.CARRY_MAX,RANSOM:R.RANSOM,FINAL_SCORE:R.FINAL_SCORE,PUZ_PTS:R.PUZ_PTS,PUZ_CAP:R.PUZ_CAP,GATE_WIN:R.GATE_WIN,GATE_COIN:R.GATE_COIN,START_ONLY:R.START_ONLY,CAP:S.cap||R.ROOM_CAP0},
    players:P.map(p=>({id:p.id,nick:p.nick,score:p.score,st:p.st,cards:p.cards,cleared:p.cleared,start:p.start,fin:!!(S.fin&&S.fin.includes(p.id))})),
    rooms:R.ROOMS.map(r=>({id:r.id,card:r.card,name:r.name,rule:r.rule,n:r.n,suit:r.suit})),
    hist:S.players.flatMap(p=>(p.hist||[]).map(h=>({rid:h.rid,id:p.id,nick:p.nick,t0:h.t0,t1:h.t1,res:h.res,pts:h.pts}))),
    outs:S.players.filter(p=>p.st!=='alive').map(p=>({id:p.id,nick:p.nick,st:p.st,outAt:p.outAt,at:p.at,pickAt:p.pickAt,inAt:p.inAt,chips:p.chips||0})),
    gates,puz:S.players.flatMap(p=>(p.puz||[]).map(r=>({t:r.t,id:p.id,nick:p.nick,title:r.title,pts:r.pts}))).sort((a,b)=>a.t-b.t),
    log:[]};
}

// D = {at,t,dur,blank,K,players,rooms,hist,outs,gates,puz}
export function sheetHtml(D){
  if(D.blank)D={...D,players:[],hist:[],outs:[],gates:[],puz:[],log:[]};   // 空白表：不带任何已发生的记录
  const sc=D.scope||'all',own={ctrl:D.blank||sc==='all',room:D.blank||sc==='dealer',outs:D.blank||sc==='outs',judge:D.blank||sc==='judge'};
  const show={ctrl:sc==='all',room:sc==='all'||sc==='dealer',outs:sc==='all'||sc==='outs',judge:sc==='all'||sc==='judge'};
  let n=0;
  const key=()=>'f'+(n++);
  const cell=(v,cls)=>'<td contenteditable="true" data-k="'+key()+'"'+(cls?' class="'+cls+'"':'')+'>'+esc(v)+'</td>';
  const box=on=>'<td class="c"><input type="checkbox" data-k="'+key()+'"'+(on?' checked':'')+'></td>';
  const rows=(list,total,cols,mine)=>{
    if(mine===false){return list.length?list.map(r=>'<tr>'+r.map(v=>cell(v)).join('')+'</tr>').join(''):'<tr><td colspan="'+cols+'" class="empty">暂无记录</td></tr>';}
    const out=list.map(r=>'<tr>'+r.map(v=>cell(v)).join('')+'</tr>').join('');
    let extra='';for(let i=list.length;i<total;i++)extra+='<tr>'+Array.from({length:cols},()=>cell('')).join('')+'</tr>';
    return out+extra;};
  const th=a=>'<thead><tr>'+a.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead>';
  const K=D.K||{};
  const when=new Date(D.at).toLocaleString('zh-CN',{hour12:false});
  const meta=D.blank?'空白表':'导出于 '+esc(when)+'　游戏时间 '+fmt(D.t);
  const page=(first,title,sub,body)=>'<section class="pg'+(first?' first':'')+'"><h2>'+title+'<span class="sub">'+sub+'</span></h2>'+body+'</section>';
  const ST={alive:'在场',out:'待接',picked:'已接到',market:'鬼市'};

  // ① 总控：每人一行的冥币总表（个人赛的账本就是每个人的冥币）+ 冥币流水
  const ps=[...D.players].sort((a,b)=>a.id.localeCompare(b.id));
  const pRows=ps.map(p=>'<tr><th>'+esc(p.id)+'</th>'+cell(p.nick)+cell(p.score)+cell('')+cell(ST[p.st]||p.st)+SUITS.map(s=>box(p.cards.includes(s))).join('')+box(p.fin)+cell('')+'</tr>').join('')
    +(own.ctrl?Array.from({length:D.blank?48:4},()=>'<tr>'+cell('','')+cell('')+cell('')+cell('')+cell('')+SUITS.map(()=>box(false)).join('')+box(false)+cell('')+'</tr>').join(''):'');
  const ctrl=page(true,'总控','玩家冥币总表与冥币流水',
    '<h3>玩家总表<small>「导出时冥币」是导出那一刻的数；之后每次变动，在「当前冥币」里改写，并在冥币流水里记一笔</small></h3>'
    +'<table>'+th(['编号','昵称','导出时冥币','当前冥币','状态','♠','♦','♣','♥','晋级','备注'])+'<tbody>'+pRows+'</tbody></table>'
    +'<h3>冥币流水<small>赢房 / 解谜 / 鬼门开 / 赎人 / 自赎带出 / 手动调整，每一笔一行</small></h3>'
    +'<table>'+th(['时间','编号','原因','冥币变动（+ / −）','变动后','记录人'])+'<tbody>'+rows([],16,6,own.ctrl)+'</tbody></table>');

  // ② 每个房间一页（给该房间的 Dealer）
  const roomPages=!show.room?'':D.rooms.filter(r=>!D.only||D.only.includes(r.id)).map(r=>{
    const list=D.hist.filter(h=>h.rid===r.id).sort((a,b)=>a.t0-b.t0).map(h=>[h.id,h.nick||'',fmt(h.t0),h.t1!=null?fmt(h.t1):'',h.res?RES[h.res]||h.res:'进行中',h.pts||'','']);
    return page(false,'Dealer · '+esc(r.card)+' '+esc(r.name),(r.n===4?'简单':'困难')+'房，成功得 '+(r.n*100)+' 冥币',
      '<div class="note"><b>玩法：</b>'+esc(r.rule)+'</div>'
      +'<div class="note">每人一行。赢：得 '+(r.n*100)+' 冥币 + '+esc(r.suit)+'，每人每间房只能成功一次。输：原地等黑白无常（立刻报黑白无常和总控：「'+esc(r.card)+' 编号 X 失败」）。同时最多 '+(K.CAP||6)+' 人。</div>'
      +'<table>'+th(['编号','昵称','进入时间','结束时间','结果（胜 / 负 / 中途离开）','得分','备注'])+'<tbody>'+rows(list,Math.max(16,list.length+8),7,own.room)+'</tbody></table>');
  }).join('');

  // ③ 黑白无常 + 孟婆
  const outList=D.outs.map(p=>[p.id,p.nick||'',fmt(p.outAt),p.at||'',fmt(p.pickAt),fmt(p.inAt),p.st==='market'?p.chips:'','','',ST[p.st]||p.st]);
  const outs=page(false,'黑白无常 / 孟婆','当前不在场的人与鬼市记录',
    '<div class="note">流程：挑战失败 → 原地等黑白无常 → 接到 → 送入鬼市（钱包冻结，领 '+(K.CHIP_START||200)+' 筹码）→ 孟婆确认。筹码赢到 <b>'+(K.CHIP_GOAL||500)+'</b> 自赎（超出部分最多带出 '+(K.CARRY_MAX||100)+' 冥币）；任何在场的人花 <b>'+(K.RANSOM||500)+'</b> 冥币可以赎人（写出钱人编号）；筹码输光喝孟婆汤免费复活，但随机忘掉一个花色。复活后在「复活方式」写自赎 / 被 X 赎 / 孟婆汤。</div>'
    +'<table>'+th(['编号','昵称','失败时间','位置','接到时间','入鬼市时间','筹码','复活方式','复活时间','备注（状态）'])+'<tbody>'+rows(outList,Math.max(24,outList.length+10),10,own.outs)+'</tbody></table>');

  // ④ 判官
  const gList=D.gates.map(g=>[fmt(g.t),g.title,g.rank,g.id,g.nick||'',g.rw]);
  const zList=D.puz.map(z=>[fmt(z.t),z.id,z.nick||'',z.title,'+'+z.pts]);
  const judge=page(false,'判官','鬼门开 · 解谜题',
    '<h3>鬼门开<small>最先完成的 '+(K.GATE_WIN||3)+' 人，每人选一种奖励：+'+(K.GATE_COIN||300)+' 冥币 / 救一个人 / 拿一个花色</small></h3>'
    +'<table>'+th(['时间','鬼门开','名次','编号','昵称','奖励'])+'<tbody>'+rows(gList,Math.max(8,gList.length+4),6,own.judge)+'</tbody></table>'
    +'<h3>解谜题兑换<small>每题 +'+(K.PUZ_PTS||100)+'，每人最多 '+(K.PUZ_CAP||400)+'；同一题每人只能兑换一次</small></h3>'
    +'<table>'+th(['时间','编号','昵称','题目','冥币'])+'<tbody>'+rows(zList,Math.max(16,zList.length+8),5,own.judge)+'</tbody></table>');

  // ⑤ 规则速查
  const ref=page(false,'规则速查','没有网站时对照用',
    '<ul class="rules">'
    +'<li><b>个人赛：</b>每人独立计分，可以和朋友一起进房间。前 '+Math.round((K.START_ONLY||600)/60)+' 分钟只能进身份卡上的起始房间。每间房同时最多 '+(K.CAP||6)+' 人。</li>'
    +'<li><b>赢房：</b>简单房 +400、困难房 +800，并拿到该房间花色；每人每间房只能成功一次。<b>输房：</b>进鬼市；可再挑战。</li>'
    +'<li><b>鬼市：</b>钱包冻结，领 '+(K.CHIP_START||200)+' 筹码去赌局；筹码到 '+(K.CHIP_GOAL||500)+' 自赎（带出最多 '+(K.CARRY_MAX||100)+'）；别人花 '+(K.RANSOM||500)+' 可以赎你；输光喝孟婆汤免费复活，随机忘掉一个花色。</li>'
    +'<li><b>解谜题：</b>每题 '+(K.PUZ_PTS||100)+'，每人最多 '+(K.PUZ_CAP||400)+'。<b>鬼门开：</b>最先完成的 '+(K.GATE_WIN||3)+' 人选奖励。</li>'
    +'<li><b>晋级资格：</b>时间截止时集齐 ♠♦♣♥、冥币 ≥ '+(K.FINAL_SCORE||2000)+'、人在场（不在鬼市）。</li>'
    +'<li><b>总时长：</b>'+Math.round((D.dur||7200)/60)+' 分钟；到时间后房间关闭，失败的人照常进鬼市；再过 15 分钟停止发放复活名额。</li>'
    +'<li><b>离线原则：</b>每件事写下「时间 + 编号 + 结果」；恢复网站后，总控按冥币流水、Dealer 按房间记录、黑白无常/孟婆按名单、判官按判官页补录。</li>'
    +'</ul>');

  const snap=D.blank?'':'<script type="application/json" id="snap">'+JSON.stringify(D).replace(/</g,'\\u003c')+'<\/script>';
  const SN={all:'总控（全部）',dealer:'Dealer'+(D.only?' '+D.only.map(id=>{const r=D.rooms.find(x=>x.id===id);return r?r.card:id}).join(' '):''),outs:'黑白无常 / 孟婆',judge:'判官'};
  const sheetKey='bd-sheet2-'+(D.blank?'blank':sc+(D.only?'-'+D.only.join(''):'')+'-'+D.at);
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  +'<title>百鬼夜行 · '+(D.blank?'空白':SN[sc])+'记录表</title><style>'
  +'@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#111;margin:0;padding:16px;background:#fff}'
  +'h1{font-size:22px;margin:0}h2{font-size:19px;margin:0 0 8px;border-bottom:2px solid #111;padding-bottom:3px}h2 .sub{font-size:13px;font-weight:400;color:#555;margin-left:12px}h3{font-size:14px;margin:14px 0 6px}h3 small{font-weight:400;color:#555;margin-left:8px;font-size:12px}'
  +'.meta{color:#555;margin:2px 0 8px}.pg{break-before:page;margin-top:26px}.pg:first-of-type{break-before:auto;margin-top:6px}td.empty{color:#888;text-align:center}'
  +'table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:4px 6px;text-align:left;min-height:28px;height:28px;vertical-align:middle}th{background:#eee;white-space:nowrap}thead th{background:#ddd;text-align:center}'
  +'td[contenteditable]{min-width:58px}td[contenteditable]:focus,.w:focus{outline:2px solid #2a7;background:#f4fff9}td.c{text-align:center;width:34px}td.rm{font-size:12px;line-height:1.7}td.rm label{white-space:nowrap;margin-right:6px}'
  +'input[type=checkbox]{width:16px;height:16px;vertical-align:-3px}.tip{background:#fff7e0;border:1px solid #e0c060;padding:6px 10px;margin:8px 0;font-size:13px}'
  +'.note{background:#f6f6f6;border:1px solid #ccc;padding:6px 10px;margin:8px 0;font-size:13px}.w{display:inline-block;min-width:90px;border-bottom:1px solid #444;padding:0 4px}'
  +'.rules{padding-left:20px}.rules li{margin:6px 0}button{font-size:15px;padding:6px 14px;margin-right:8px}'
  +'@media print{.np{display:none}body{padding:0}}'
  +'</style></head><body>'
  +'<h1>百鬼夜行 · '+(D.blank?'空白记录表':'应急记录表 · '+SN[sc])+'</h1><div class="meta">'+meta+'　'+(D.blank||sc==='all'?'每个角色一页，各自打印或各自填写':'只含你负责的部分，可继续填写')+'</div>'
  +'<div class="np"><button onclick="print()">打印</button><button onclick="if(confirm(\'清除你在本页填写的所有内容？\')){localStorage.removeItem(KEY);location.reload()}">清除本页填写</button>'
  +'<div class="tip">离线文件：不联网也能打开、填写（自动保存在这台设备的这个浏览器里），也可以打印后手写。'+(D.blank?'':(sc==='all'?'除总控页外，其他页只有已发生的记录、没有空行；':'')+'预填的是导出那一刻已发生的记录；网站恢复后以服务器为准，请按本页记录补录。')+'</div></div>'
  +(show.ctrl?ctrl:'')+roomPages+(show.outs?outs:'')+(show.judge?judge:'')+ref+snap
  +'<script>var KEY="'+sheetKey+'";(function(){var s={};try{s=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}'
  +'document.querySelectorAll("[data-k]").forEach(function(e){var key=e.dataset.k;if(key in s){if(e.type==="checkbox")e.checked=s[key];else e.textContent=s[key]}'
  +'e.addEventListener(e.type==="checkbox"?"change":"input",function(){try{s[key]=e.type==="checkbox"?e.checked:e.textContent;localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}})})})()<\/script>'
  +'</body></html>';
}
