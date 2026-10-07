// 应急记录表：node tests/sheet.test.mjs（纯函数，不需要服务器）
import * as R from '../shared/rules.js';
import {sheetHtml} from '../web/public/offline-sheet.js';
let pass=0,fail=0;
const t=(name,ok)=>{if(ok){pass++;}else{fail++;console.log('FAIL',name);}};
const mk=(blank)=>{
  const S=R.newGame(true);
  const {size,alive,team,rstate,ROOMS}=R;
  return {S,D:{at:1760000000000,t:S.t,dur:S.dur||7200,blank,
    teams:S.teams.map(x=>({id:x.id,name:x.name,score:x.score,alive:alive(x.id).length,size:size(x.id),cards:x.cards,cleared:x.cleared,final:!!x.final,cap:x.cap})),
    rooms:ROOMS.map(r=>{const x=S.rooms.find(q=>q.id===r.id),st=rstate(x);return {id:r.id,card:r.card,name:r.name,st,team:st==='rsv'?(x.rt?team(x.rt).name:''):(x.teams||[]).map(i=>team(i).name).join('、'),at:x.at||0};}),
    players:S.players.map(p=>({id:p.id,team:p.team,st:p.st,outAt:p.outAt,at:p.at,inAt:p.inAt,coins:p.coins})),
    log:S.log.slice(0,40).map(l=>({t:l.t,text:l.text}))}};
};
const {S,D}=mk(false);
const h=sheetHtml(D);
t('完整 HTML',h.startsWith('<!doctype html>')&&h.endsWith('</html>'));
t('含全部队伍名',S.teams.every(x=>h.includes('>'+x.name+'<')));
t('含 48 名玩家',S.players.every(p=>h.includes('>'+p.id+'<')));
t('冥币写进表里',S.teams.some(x=>x.score>0&&h.includes('>'+x.score+'</td>')));
t('含 8 个房间',R.ROOMS.every(r=>h.includes(r.name)));
const m=h.match(/<script type="application\/json" id="snap">([\s\S]*?)<\/script>/);
t('内嵌快照可解析',!!m&&JSON.parse(m[1]).teams.length===8);
t('不引用外部资源',!/(src|href)=["']?https?:/.test(h)&&!/<link /.test(h));
const b=sheetHtml(mk(true).D);
t('空白表无快照',!b.includes('id="snap"'));
t('空白表无冥币数字',!S.teams.some(x=>x.score>0&&b.includes('>'+x.score+'</td>')));
t('空白表有 48 名玩家编号',S.players.every(p=>b.includes('>'+p.id+'<')));
t('转义',sheetHtml({...D,log:[{t:0,text:'<b>x</b>'}]}).includes('&lt;b&gt;x&lt;/b&gt;'));
console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
