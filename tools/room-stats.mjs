// 各房间统计（只读）。用法：node tools/room-stats.mjs <网址> [输出csv]
// 总控 PIN 在运行时输入（不会显示、不会保存）。需要 Node 22+。
import { writeFileSync } from 'fs';
const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!BASE) { console.log('用法：node tools/room-stats.mjs https://cssa-borderland.pages.dev [players.csv]'); process.exit(1); }
const pin = await new Promise(res => {
  process.stdout.write('总控 PIN：'); const si = process.stdin; si.setRawMode?.(true); si.resume(); let s = '';
  si.on('data', c => { for (const ch of c.toString()) { if (ch === '\r' || ch === '\n') { si.setRawMode?.(false); si.pause(); console.log(); return res(s); } if (ch === '\x03') process.exit(); if (ch === '\x7f') s = s.slice(0, -1); else s += ch; } });
});
const j = await (await fetch(BASE + '/api/login', { method: 'POST', body: JSON.stringify({ pin }) })).json();
if (!j.token) { console.log('登录失败'); process.exit(1); }
const ws = new WebSocket(BASE.replace('http', 'ws') + '/api/ws?token=' + j.token);
const S = await new Promise(r => { ws.onmessage = e => { const m = JSON.parse(e.data); if (m.S) r(m.S); }; });
ws.close();
const OK = r => r === 'win' || (typeof r === 'string' && r.startsWith('w:'));
const rooms = [['4S','♠4','一二三纸扎人'],['8S','♠8','红线劫'],['4H','♥4','生死时速'],['8H','♥8','孟婆的交易'],['4C','♣4','冥界传话'],['8C','♣8','心有灵犀'],['4D','♦4','生死簿'],['8D','♦8','符咒密码']];
const ps = S.players.filter(p => p.on);   // 已上榜（取了昵称或进过房间）
console.log(`上榜玩家 ${ps.length} 人（身份卡共 ${S.players.length} 张）\n`);
console.log('房间'.padEnd(14), '成功', '失败', '正在玩', '没玩过(上榜里)');
for (const [id, card, name] of rooms) {
  let ok = 0, lose = 0, in_ = 0, none = 0;
  for (const p of ps) {
    const h = (p.hist || []).filter(x => x.rid === id);
    if (p.inRoom === id) in_++;
    else if (h.some(x => OK(x.res))) ok++;
    else if (h.length) lose++;
    else none++;
  }
  console.log((card + ' ' + name).padEnd(12), String(ok).padStart(4), String(lose).padStart(4), String(in_).padStart(5), String(none).padStart(8));
}
console.log('\n"失败"= 只有失败记录、没成功过；"没玩过"= 从没进过这间房。');
if (process.argv[3]) {
  const rows = [['编号','昵称','状态','金币','花色','正在房间',...rooms.map(r => r[1])]];
  for (const p of S.players) rows.push([p.id, p.nick, p.st, p.score, (p.cards||[]).join(''), p.inRoom || '',
    ...rooms.map(([id]) => { const h = (p.hist||[]).filter(x => x.rid === id); return p.inRoom === id ? '正在玩' : h.some(x => OK(x.res)) ? '成功' : h.length ? '失败' : ''; })]);
  writeFileSync(process.argv[3], '﻿' + rows.map(r => r.join(',')).join('\n')); console.log('已写入 ' + process.argv[3]);
}
