// 应急记录表：按「纸上怎么用」设计，不是网站数据的镜像。每个角色一页（总控 / 每个房间的 Dealer / 黑白无常与孟婆 / 判官 / 规则速查），
// 都是「一件事一行」的流水记录：谁、什么时候、发生了什么。导出时会把已发生的记录预填进去，后面的空行继续写。
// 自包含 HTML：可打印（A4 横向），也能在浏览器里直接填写（自动存在本机）。纯函数，只吃一份普通数据对象，不联网。
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>s==null||s===''?'':'T+'+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const SUITS=['♠','♦','♣','♥'];
const RES={win:'胜',lose:'负',left:'中途离开'};


// 从游戏状态 S 取出记录表要的数据。R = rules.js 模块（取辅助函数和规则数字）；网页和测试用的是同一份。
// scope：'all' 总控（全部页，只有总控页留空行）/ 'dealer'（只含 rooms 里的房间）/ 'outs'（黑白无常、孟婆）/ 'judge'；blank 时恒为全部页 + 空行。
export function sheetData(S,R,blank,scope,rooms){
  const tn=id=>{const t=R.team(String(id).split('-')[0]);return t?t.name:String(id);},KL=n=>n.sub==='gate'?'鬼门开':n.sub==='side'?'Scavenger':'任务';
  return {at:Date.now(),t:S.t,dur:S.dur||7200,blank:!!blank,scope:blank?'all':(scope||'all'),only:Array.isArray(rooms)&&rooms.length?rooms:null,
    K:{PER_TEAM:R.PER_TEAM,PROTECT:R.PROTECT,COIN_START:R.COIN_START,COIN_GOAL:R.COIN_GOAL,CARRY_MAX:R.CARRY_MAX,FINAL_SCORE:R.FINAL_SCORE,RSV:R.RSV,SCAV_PTS:R.SCAV_PTS,SCAV_N:R.SCAV_N,SCAV_CAP:R.SCAV_CAP},
    teams:S.teams.map(t=>({id:t.id,name:t.name,score:t.score,alive:R.alive(t.id).length,size:R.size(t.id),cards:t.cards,cleared:t.cleared,final:!!t.final})),
    rooms:R.ROOMS.map(r=>({id:r.id,card:r.card,name:r.name,rule:r.rule,n:r.n,suit:r.suit})),
    hist:S.teams.flatMap(t=>(t.hist||[]).map(h=>({rid:h.rid,team:t.name,t0:h.t0,t1:h.t1,res:h.res,pts:h.pts,out:h.out}))),
    outs:S.players.filter(p=>p.st!=='alive').map(p=>({id:p.id,st:p.st,outAt:p.outAt,at:p.at,pickAt:p.pickAt,inAt:p.inAt,backAt:p.backAt,coins:(p.coins||0)+(p.bail||0)})),
    tasks:S.notices.filter(n=>n.kind==='任务').flatMap(n=>Object.entries(n.done||{}).map(([c,d])=>({t:d.t,kind:KL(n),team:tn(c),title:n.title,pts:d.pts||0})))
      .concat((S.log||[]).filter(l=>/勾魂/.test(l.text)).map(l=>({t:l.t,kind:'勾魂令',team:'',title:l.text,pts:0}))).sort((x,y)=>x.t-y.t),
    scav:S.teams.map(t=>({team:t.name,n:(t.scav||[]).length,pts:(t.scav||[]).reduce((a,r)=>a+r.pts,0),last:(t.scav||[]).slice(-2).map(r=>r.t)})),
    log:[]};
}

// D = {at,t,dur,blank,K,teams,rooms,hist,outs,tasks,scav,log}
//  K     规则数字（来自 rules.js）
//  teams [{id,name,score,alive,size,cards,cleared,final}]
//  rooms [{id,card,name,rule,n}]
//  hist  [{rid,team,t0,t1,res,pts,out}]            房间挑战记录
//  outs  [{id,st,outAt,at,pickAt,inAt,coins,backAt}] 当前不在场的人（淘汰待接 / 已接到 / 鬼市）
//  tasks [{t,kind,team,title,pts}]                 判官记录（鬼门开 / 任务 / Scavenger / 勾魂令）
//  scav  [{team,n,pts,last:[t,t]}]                 每队 Scavenger 已兑换情况
export function sheetHtml(D){
  if(D.blank)D={...D,hist:[],outs:[],tasks:[],log:[],scav:D.teams.map(t=>({team:t.name}))};   // 空白表：不带任何已发生的记录
  const sc=D.scope||'all',own={ctrl:D.blank||sc==='all',room:D.blank||sc==='dealer',outs:D.blank||sc==='outs',judge:D.blank||sc==='judge'};
  const show={ctrl:sc==='all',room:sc==='all'||sc==='dealer',outs:sc==='all'||sc==='outs',judge:sc==='all'||sc==='judge'};
  let n=0;
  const key=()=>'f'+(n++);
  const cell=(v,cls)=>'<td contenteditable="true" data-k="'+key()+'"'+(cls?' class="'+cls+'"':'')+'>'+esc(v)+'</td>';
  const box=on=>'<td class="c"><input type="checkbox" data-k="'+key()+'"'+(on?' checked':'')+'></td>';
  const pre=D.blank?x=>'':x=>x;
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

  // ① 总控
  const tRows=D.teams.map(t=>'<tr><th>'+esc(t.name)+'</th>'+cell(pre(t.score))+cell('')
    +cell(pre(t.alive+'/'+t.size))+SUITS.map(s=>box(!D.blank&&t.cards.some(c=>c.includes(s)))).join('')
    +'<td class="rm">'+D.rooms.map(r=>'<label><input type="checkbox" data-k="'+key()+'"'+(!D.blank&&t.cleared.includes(r.id)?' checked':'')+'>'+esc(r.card)+'</label>').join('')+'</td>'
    +box(!D.blank&&t.final)+cell('')+'</tr>').join('');
  const ctrl=page(true,'总控','队伍总表与冥币流水',
    '<h3>队伍总表<small>「导出时冥币」是导出那一刻的数；之后每次变动，在「当前冥币」里改写最新数，并在下面的冥币流水里记一笔</small></h3>'
    +'<table>'+th(['队伍','导出时冥币','当前冥币','存活','♠','♦','♣','♥','已通关房间','终极','备注'])+'<tbody>'+tRows+'</tbody></table>'
    +'<h3>冥币流水<small>赢房 / Scavenger / 输局加分 / 手动调整，每一笔一行</small></h3>'
    +'<table>'+th(['时间','队伍','原因','冥币变动（+ / −）','变动后','记录人'])+'<tbody>'+rows([],14,6,own.ctrl)+'</tbody></table>');

  // ② 每个房间一页（给该房间的 Dealer）
  const roomPages=!show.room?'':D.rooms.filter(r=>!D.only||D.only.includes(r.id)).map(r=>{
    const list=D.hist.filter(h=>h.rid===r.id).sort((a,b)=>a.t0-b.t0).map(h=>[h.team,fmt(h.t0),h.t1!=null?fmt(h.t1):'',h.res?RES[h.res]||h.res:'进行中',h.pts||'',h.out||'','']);
    const won=D.teams.filter(t=>t.cleared.includes(r.id)).map(t=>t.name).join('、');
    return page(false,'Dealer · '+esc(r.card)+' '+esc(r.name),(r.n===4?'简单':'困难')+'房，赢得 '+(r.n*100)+' 分',
      '<div class="note"><b>玩法：</b>'+esc(r.rule)+'</div>'
      +'<div class="note">赢：每队每个房间只能成功一次，得 '+(r.n*100)+' 冥币 + '+esc(r.suit||r.card[0])+' 花色。输：现场抽签淘汰 1 人（写在「淘汰者」，立刻报黑白无常），可再挑战。<br>已成功的队伍：<span class="w" contenteditable="true" data-k="'+key()+'">'+esc(pre(won))+'</span></div>'
      +'<table>'+th(['队伍','进入时间','结束时间','结果（胜 / 负 / 中途离开）','得分','淘汰者编号','备注'])+'<tbody>'+rows(list,Math.max(12,list.length+6),7,own.room)+'</tbody></table>'
      +(own.room?'<div class="note">预约 / 排队：'+Array.from({length:4},()=>'<span class="w" contenteditable="true" data-k="'+key()+'"></span>').join(' → ')+'（队伍 + 时间；每次预约 '+Math.round((K.RSV||120)/60)+' 分钟内有效）</div>':''));
  }).join('');

  // ③ 黑白无常 + 孟婆
  const outList=D.outs.map(p=>[p.id,fmt(p.outAt),p.at||'',fmt(p.pickAt),fmt(p.inAt),p.st==='market'?p.coins:'',fmt(p.backAt),({out:'待接',picked:'已接到',market:'鬼市中'})[p.st]||p.st]);
  const outs=page(false,'黑白无常 / 孟婆','当前淘汰名单与鬼市记录',
    '<div class="note">流程：淘汰 → 黑白无常接到 → 送入鬼市（发 '+(K.COIN_START||200)+' 冥币，开始计时）→ 孟婆确认 → 凑够 <b>'+(K.COIN_GOAL||500)+'</b> 冥币买命（队友助力 1:1，个人冥币不够可由队友补）→ 复活，<b>'+Math.round((K.PROTECT||600)/60)+' 分钟保护期</b>不可被勾魂。买命后超出的部分最多 '+(K.CARRY_MAX||100)+' 回队伍。复活后把这一行划掉或在备注写「已复活」。</div>'
    +'<table>'+th(['编号','淘汰时间','淘汰位置','接到时间','入鬼市时间','鬼市冥币合计','复活时间','备注（状态）'])+'<tbody>'+rows(pre(outList)||[],Math.max(24,outList.length+10),8,own.outs)+'</tbody></table>');

  // ④ 判官
  const taskList=D.tasks.map(t=>[fmt(t.t),t.kind,t.team||'',t.title||'',t.pts?'+'+t.pts:'']);
  const scavList=D.scav.map(s=>[s.team,s.n||'',s.pts||'',(s.last||[]).map(fmt).join('、'),'']);
  const judge=page(false,'判官','任务 · 鬼门开 · 勾魂令 · Scavenger 记录',
    '<h3>任务记录<small>鬼门开 / 任务完成 / Scavenger 兑换 / 勾魂令，一件事一行</small></h3>'
    +'<table>'+th(['时间','类型','队伍','内容 / 结果','冥币奖励'])+'<tbody>'+rows(pre(taskList)||[],Math.max(14,taskList.length+8),5,own.judge)+'</tbody></table>'
    +'<h3>Scavenger Hunt 额度<small>每题 '+(K.SCAV_PTS||100)+' 分；任意 10 分钟内最多 '+(K.SCAV_N||2)+' 题；每队总共最多 '+(K.SCAV_CAP||600)+' 分；同一题不重复</small></h3>'
    +'<table>'+th(['队伍','已兑换题数','已得分','最近两次兑换时间','备注'])+'<tbody>'+rows(pre(scavList)||[],Math.max(8,scavList.length),5,own.judge)+'</tbody></table>'
    +'<div class="note">鬼门开进行中：暂停所有预约与入场（已开始的打完）。先到的队伍确认后：该队缺人 → 免费复活 1 名队友；满员 → 指定别队 1 名存活队员淘汰。勾魂令：缺人复活本队 1 人 / 满员淘汰别队 1 人，终极队不能被勾魂。</div>');

  // ⑤ 规则速查
  const ref=page(false,'规则速查','没有网站时对照用',
    '<ul class="rules">'
    +'<li><b>队伍：</b>8 队 × '+(K.PER_TEAM||6)+' 人。进房间、预约都要队伍满员（'+(K.PER_TEAM||6)+'/'+(K.PER_TEAM||6)+' 存活）；一次只能在一个房间；每队每个房间只能成功一次。</li>'
    +'<li><b>赢房：</b>简单房 400 分、困难房 800 分，并拿到该房间花色。<b>输房：</b>淘汰 1 人（现场抽签）；可再挑战。</li>'
    +'<li><b>淘汰：</b>原地等黑白无常 → 鬼市。进鬼市发 '+(K.COIN_START||200)+' 冥币；凑够 '+(K.COIN_GOAL||500)+' 买命复活；复活后 '+Math.round((K.PROTECT||600)/60)+' 分钟保护期。</li>'
    +'<li><b>预约：</b>队长预约，'+Math.round((K.RSV||120)/60)+' 分钟内有效；一队同时只能预约一间。</li>'
    +'<li><b>鬼门开：</b>判官发布后暂停预约与入场；先到者确认，按上页规则奖励后结束。</li>'
    +'<li><b>Scavenger：</b>每题 '+(K.SCAV_PTS||100)+' 分，10 分钟内最多 '+(K.SCAV_N||2)+' 题，每队总共最多 '+(K.SCAV_CAP||600)+' 分。</li>'
    +'<li><b>终极：</b>四种花色集齐、全员存活、冥币 ≥ '+(K.FINAL_SCORE||2400)+'，由总控手动放行（可强行放行）。</li>'
    +'<li><b>总时长：</b>'+Math.round((D.dur||7200)/60)+' 分钟；到时间后暂停预约与入场，已在房间里的队伍打完。</li>'
    +'<li><b>离线原则：</b>每件事写下「时间 + 队伍 / 编号 + 结果」；恢复网站后，总控按总控页的冥币流水、Dealer 按房间记录、黑白无常/孟婆按淘汰名单补录。</li>'
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
