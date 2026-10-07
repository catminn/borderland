// 应急记录表：把当前状态（或空白）变成一份自包含 HTML。可打印，也可在浏览器里继续填写（本机自动保存）。
// 纯函数：只吃一份普通数据对象，不碰游戏状态，不联网。
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>'T+'+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const ST={alive:'在场',out:'淘汰待接',picked:'已接到',market:'鬼市'};
const SUITS=['♠','♦','♣','♥'];

// D = {at,t,dur,blank,teams:[{id,name,score,alive,size,cards,cleared,final,cap}],rooms:[{id,card,name,st,team,at}],
//      players:[{id,team,st,outAt,at,inAt,coins}],log:[{t,text}]}
export function sheetHtml(D){
  let n=0;
  const k=()=>'f'+(n++);
  const cell=v=>'<td contenteditable="true" data-k="'+k()+'">'+esc(v)+'</td>';
  const box=on=>'<td class="c"><input type="checkbox" data-k="'+k()+'"'+(on?' checked':'')+'></td>';
  const v=(x,f)=>D.blank?'':(f?f(x):x);
  const rsn=r=>({open:'可预约',rsv:'已预约',play:'游戏中',reset:'重置中'}[r]||r);

  const teamRows=D.teams.map(t=>'<tr><th>'+esc(t.name)+'</th>'
    +cell(v(t,t=>t.alive+'/'+t.size))+cell(v(t.score))
    +SUITS.map(s=>box(!D.blank&&t.cards.some(c=>c.includes(s)))).join('')
    +'<td class="rm">'+D.rooms.map(r=>'<label><input type="checkbox" data-k="'+k()+'"'+(!D.blank&&t.cleared.includes(r.id)?' checked':'')+'>'+esc(r.card)+'</label>').join('')+'</td>'
    +box(!D.blank&&t.final)+cell('')+'</tr>').join('');

  const roomRows=D.rooms.map(r=>'<tr><th>'+esc(r.card)+' '+esc(r.name)+'</th>'
    +cell(v(r,r=>rsn(r.st)))+cell(v(r,r=>r.team||''))+cell(v(r,r=>r.st==='play'||r.st==='reset'?fmt(r.at):''))+cell('')+cell('')+cell('')+'</tr>').join('');

  const players=D.players.map(p=>'<tr><th>'+esc(p.id)+'</th>'
    +cell(v(p,p=>ST[p.st]||p.st))+cell(v(p,p=>p.outAt!=null?fmt(p.outAt):''))+cell(v(p,p=>p.at||''))
    +cell(v(p,p=>p.inAt!=null?fmt(p.inAt):''))+cell(v(p,p=>p.st==='market'?p.coins:''))+cell('')+'</tr>').join('');

  const blankLog=Array.from({length:24},()=>'<tr>'+cell('')+cell('')+cell('')+cell('')+cell('')+'</tr>').join('');
  const lastLog=D.blank?'':'<h3>系统日志（最近 40 条，只读，供对照）</h3><div class="lg">'+D.log.slice(0,40).map(l=>'<div><b>'+fmt(l.t)+'</b> '+esc(l.text)+'</div>').join('')+'</div>';

  const when=new Date(D.at).toLocaleString('zh-CN',{hour12:false});
  const head=D.blank?'空白记录表':'当前状态记录表';
  const meta=D.blank?'纸质 / 离线备用':'导出于 '+esc(when)+'　游戏时间 '+fmt(D.t)+'　总时长 '+Math.round(D.dur/60)+' 分钟';
  const snap=D.blank?'':'<script type="application/json" id="snap">'+JSON.stringify(D).replace(/</g,'\\u003c')+'<\/script>';

  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  +'<title>百鬼夜行 · '+head+'</title><style>'
  +'@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#111;margin:0;padding:16px;background:#fff}'
  +'h1{font-size:22px;margin:0}h2{font-size:17px;margin:22px 0 8px;border-bottom:2px solid #111;padding-bottom:3px}h3{font-size:14px;margin:14px 0 6px}.meta{color:#555;margin:2px 0 8px}'
  +'table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:4px 6px;text-align:left;min-height:26px;vertical-align:middle}th{background:#eee;white-space:nowrap}thead th{background:#ddd;text-align:center}'
  +'td[contenteditable]{min-width:58px}td[contenteditable]:focus{outline:2px solid #2a7;background:#f4fff9}td.c{text-align:center;width:34px}td.rm{font-size:12px;line-height:1.7}td.rm label{white-space:nowrap;margin-right:6px}'
  +'input[type=checkbox]{width:16px;height:16px;vertical-align:-3px}.tip{background:#fff7e0;border:1px solid #e0c060;padding:6px 10px;margin:8px 0;font-size:13px}'
  +'.lg{font-size:12px;columns:2;color:#333}.lg div{break-inside:avoid;padding:1px 0}.pb{break-before:page}button{font-size:15px;padding:6px 14px;margin-right:8px}'
  +'@media print{.np{display:none}body{padding:0}}'
  +'</style></head><body>'
  +'<h1>百鬼夜行 · '+head+'</h1><div class="meta">'+meta+'</div>'
  +'<div class="np"><button onclick="print()">打印</button><button onclick="if(confirm(\'清除你在本页填写的所有内容？\')){localStorage.removeItem(KEY);location.reload()}">清除本页填写</button>'
  +'<div class="tip">本页是离线文件：不联网也能打开、填写（自动保存在这台设备的浏览器里），也可以直接打印后手写。'+(D.blank?'':'表中数字是导出那一刻的状态，网站恢复后以服务器为准，请按本页记录在总控页补录。')+'</div></div>'
  +'<h2>1　队伍总表</h2><table><thead><tr><th>队伍</th><th>存活</th><th>冥币</th><th>♠</th><th>♦</th><th>♣</th><th>♥</th><th>已通关房间</th><th>终极</th><th>备注</th></tr></thead><tbody>'+teamRows+'</tbody></table>'
  +'<h2 class="pb">2　房间表</h2><table><thead><tr><th>房间</th><th>状态</th><th>当前队伍</th><th>开始时间</th><th>结果（胜 / 负）</th><th>淘汰者</th><th>重置完成</th></tr></thead><tbody>'+roomRows+'</tbody></table>'
  +'<h2 class="pb">3　人员与鬼市</h2><table><thead><tr><th>编号</th><th>状态</th><th>淘汰时间</th><th>位置</th><th>入鬼市时间</th><th>鬼市冥币</th><th>复活时间</th></tr></thead><tbody>'+players+'</tbody></table>'
  +'<h2 class="pb">4　流水记录（继续记录从这里写）</h2><table><thead><tr><th>时间</th><th>队伍 / 编号</th><th>事件</th><th>冥币变动</th><th>记录人</th></tr></thead><tbody>'+blankLog+'</tbody></table>'+lastLog
  +snap
  +'<script>var KEY="bd-sheet-'+(D.blank?'blank':D.at)+'";(function(){var s={};try{s=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}'
  +'document.querySelectorAll("[data-k]").forEach(function(e){var key=e.dataset.k;if(key in s){if(e.type==="checkbox")e.checked=s[key];else e.textContent=s[key]}'
  +'e.addEventListener(e.type==="checkbox"?"change":"input",function(){try{s[key]=e.type==="checkbox"?e.checked:e.textContent;localStorage.setItem(KEY,JSON.stringify(s))}catch(x){}})})})()<\/script>'
  +'</body></html>';
}
