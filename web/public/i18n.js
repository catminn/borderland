// 玩家端英文版：只翻译「玩家看得到的」文字。
// 做法：页面照旧用中文拼出 HTML，最后在显示前把标签之间的文字（和少数属性）换成英文。
// 查不到的文字原样留着（中文），所以漏翻不会出错，只是还没翻。
const KEY='borderland.lang';
let lang='zh';
try{const v=localStorage.getItem(KEY);lang=v==='en'||v==='zh'?v:'zh';}catch{/* 无痕模式 */}
export const getLang=()=>lang;
export function setLang(v){lang=v==='en'?'en':'zh';try{localStorage.setItem(KEY,lang);}catch{/* ignore */}document.documentElement.lang=lang==='en'?'en':'zh-CN';}
document.documentElement.lang=lang==='en'?'en':'zh-CN';

const CJK=/[㐀-鿿（）　-〿]/;
// 房间名（和 ROOMS 的 name 一一对应）
const RN={'一二三纸扎人':'Paper Doll 1-2-3','红线劫':'Red Thread Trial','生死时速':'Life-or-Death Rush','孟婆的交易':"Meng Po's Deal",'冥界传话':'Ghost Whispers','心有灵犀':'Mind Meld','生死簿':'Book of Life and Death','符咒密码':'Talisman Code'};
const D={
  '游戏中（':'Playing (','你在这里（':'You are here (','）':')','金币':'coins','分页':'Pages','场地平面图':'Floor plan','⏱ 已截止':'⏱ Closed','已截止':'Closed',
  // 通用 / 页头
  '百鬼夜行':'Phantom Parade','Cornell CSSA 万圣夜':'Cornell CSSA Halloween Night','CORNELL CSSA 万圣夜':'CORNELL CSSA HALLOWEEN NIGHT',
  '输入 6 位 PIN':'Enter your 6-digit PIN','进入':'Enter','PIN 印在你的身份卡上':'Your PIN is on your ID card','PIN 不正确，请核对身份卡':'Wrong PIN, please check your ID card','PIN 不正确':'Wrong PIN',
  '连接中…':'Connecting…','已连接':'Connected','重连中…':'Reconnecting…','本地展示':'Local demo','退出':'Log out','浅色':'Light','深色':'Dark','玩家':'Player','切换深浅色':'Switch light/dark',
  '正在连接服务器…':'Connecting to the server…','游戏时钟':'Game clock','知道了':'Got it','下一步':'Next','取消':'Cancel','确认':'Confirm',
  // 标签
  '我的':'Me','大屏':'Board','地图':'Map','我的信息':'My info','通知':'Notices','公告':'Announcement','鬼门开':'Ghost Gate',
  // 取昵称
  '欢迎来到CSSA万圣夜':'Welcome to CSSA Halloween Night','取个昵称，显示在大屏排行榜上（最多 12 字）。':'Pick a nickname for the leaderboard (max 12 characters).','昵称':'Nickname','进入游戏':'Start playing','找不到这个编号':'ID not found',
  // 通行证
  '酆都通行证':'Underworld Pass','冥府签发':'Issued by the Underworld','持证人':'Holder','名号':'Name',
  '挑战失败':'Challenge failed','请自行去鬼市登记，不然黑白无常会来抓你哟！':'Please go register at the Ghost Market yourself, or the Wuchang will come and get you!','黑白无常已抓到你，正在送你去鬼市':'The Wuchang has caught you and is taking you to the Ghost Market',
  '你在鬼市':'You are in the Ghost Market','金币已冻结':'Your coins are frozen','你中奖了':'You won a prize','请到台前领取':'please collect it at the front',
  // 彩券
  '我的彩券':'My Tickets','张':'tickets','彩券越多，最终抽奖越容易中奖':'More tickets, better odds in the final raffle','你已中奖，不再参与后面的抽取':'You already won, so you are out of the remaining draws',
  '金币÷100':'Coins','花色':'Suits','八间房':'Rooms','集齐四种花色':'All 4 suits','八间房全部成功':'All 8 rooms',
  '体能':'Physical','逻辑':'Logic','团队配合':'Teamwork','心理':'Mind',
  // 记录
  '我的记录':'My Record','解谜题':'Puzzles','还没有进过房间。':'No rooms entered yet.','游戏中':'In progress','失败':'Failed','中途离开':'Left early',
  '暂时没有新通知。':'No new notices.','已读':'Read','已截止':'Closed','历史消息':'History','收起 ▲':'Collapse ▲','展开 ▼':'Expand ▼',
  // 状态
  '在场':'Alive','待抓':'Caught?','已抓到':'Caught','鬼市':'Ghost Market','中奖':'Winner','（在鬼市）':'(in Ghost Market)',
  // 大屏
  '剩余时间':'Time left','已暂停':'Paused','全场播报':'Live Feed','暂无播报':'Nothing yet','金币排行':'Coin Ranking','还没有人上榜':'Nobody on the board yet',
  '榜单已封，最后冲刺':'Ranking frozen, final sprint!','开放':'Open','重置中':'Resetting','已关闭':'Closed','开放中':'Open','✓ 你已成功':'✓ Cleared','你在这里':'You are here','✓ 已成功':'✓ Cleared',
  // 抽奖
  '压轴抽奖':'Grand Raffle','每人限得一件':'One prize per person','即将开始':'Starting soon','并列第一':'Tied for first','待抽':'Pending','揭晓中':'Revealing','待确认':'Confirming','已颁发':'Awarded',
  '第一名':'1st place','抽中':'Drawn','金币大亨奖':'Coin Tycoon Prize','大奖':'Grand Prize','小奖一':'Prize 1','小奖二':'Prize 2','小奖三':'Prize 3',
  // 地图
  '走 廊':'Corridor','走廊':'Corridor','最终抽奖集合点':'Grand Raffle meeting point','入口':'Entrance','不排队':'No queue','info desk':'info desk','困难':'Hard','简易':'Easy',
  // 弹窗
  '新通知':'New notice','全场通知':'Announcement','时间到':"Time's up",'所有房间关闭，房里的人打完这一局。':'All rooms are closed. Players inside finish their current round.','请到开奖地点集合，参加压轴抽奖。':'Please gather at the raffle area for the Grand Raffle.',
  '最终名次':'Final Ranking','有人赎你':'You were ransomed','赎人成功':'Ransom successful','你复活了':'You are back','自赎成功':'You bought yourself out','你已进入鬼市':'You entered the Ghost Market','有人救了你':'Someone saved you','你中奖了！':'You won!',
  // 新手引导
  '看你的通行证、金币、彩券和每一间房的记录。':'Your pass, coins, tickets, and your record in every room.','看剩余时间、金币排行和全场播报。':'Time left, coin ranking, and the live feed.','看所有房间的位置和状态。有问题就去 info desk。':'Where every room is and whether it is open. Questions? Go to the info desk.',
  '终极目标':'The Big Goal',
  '每 100 金币兑换 1 张彩券，集齐花色和房间还有额外彩券奖励。\n彩券越多，最终的鬼市大抽奖越容易中奖。\n另外，金币最多的人也会获得大奖哟！':'Every 100 coins turns into 1 raffle ticket, and collecting suits and clearing rooms earns bonus tickets.\nThe more tickets you have, the better your odds in the final Ghost Market raffle.\nThe player with the most coins also wins a grand prize!',
  '鬼门已开！想参加的请按判官指示集合。':'The ghost gate is open! Follow the Judge to join in.','鬼门再开！想参加的请按判官指示集合。':'The ghost gate opens again! Follow the Judge to join in.','阎王点名':"Yama's Roll Call",'生死一线':'Life on the Line',
};
// 带数字 / 名字的句子。$1 $2 是捕获的内容；名字（编号 + 昵称）原样保留。
const P=[
  [/^#(\d+) 谜题$/,m=>'Puzzle #'+m[1]],
  [/^(♠|♥|♣|♦)(\d) (\S+) (开放|已关闭|重置中|游戏中 (\d) 人)$/,m=>m[1]+m[2]+' '+(RN[m[3]]||m[3])+' '+(m[4]==='开放'?'Open':m[4]==='已关闭'?'Closed':m[4]==='重置中'?'Resetting':'Playing, '+m[5]+(m[5]==='1'?' player':' players'))],
  [/^(\d+) ?人$/,(m)=>m[1]==='1'?'1 player':m[1]+' players'],
  [/^(\d+) ?张$/,(m)=>m[1]+' tickets'],
  [/^游戏中 ?(\d+) ?人$/,(m)=>'In play, '+m[1]],
  [/^在场 (\d+) 人(?:　鬼市 (\d+) 人)?$/,(m)=>'Alive '+m[1]+(m[2]?'   Market '+m[2]:'')],
  [/^排第 (\d+) 名$/,(m)=>'Ranked #'+m[1]],
  [/^金币 (\d+)$/,(m)=>'Coins '+m[1]],
  [/^实体筹码赢到 (\d+) 可自赎$/,(m)=>'Win '+m[1]+' chips to buy yourself out'],
  [/^「(.*)」，请到台前领取$/,(m)=>'"'+tn(m[1])+'", please collect it at the front'],
  [/^剩余 (\d+:\d+)$/,(m)=>'Left '+m[1]],
  [/^历史消息（(\d+)）$/,(m)=>'History ('+m[1]+')'],
  [/^成功　\+(\d+)$/,(m)=>'Cleared  +'+m[1]],
  [/^你的最终名次：第 (\d+) 名（金币 (\d+)）$/,(m)=>'Your final rank: #'+m[1]+' ('+m[2]+' coins)'],
  [/^(\d+) 金币$/,(m)=>m[1]+' coins'],
  [/^鬼门开：你是第 (\d+) 名$/,(m)=>'Ghost Gate: you came in #'+m[1]],
  [/^找判官选奖励：(\d+) 金币 \/ 救一个人 \/ 拿一个花色。$/,(m)=>'See the Judge to pick a reward: '+m[1]+' coins / save someone / take a suit.'],
  [/^原因：挑战 (\S+) 失败。请自行去鬼市登记，不然黑白无常会来抓你哟！$/,(m)=>'Reason: failed '+m[1]+'. Please go register at the Ghost Market yourself, or the Wuchang will come and get you!'],
  [/^金币已冻结。用实体筹码赢到 (\d+) 就能自赎；待满 15 分钟，不管赚没赚到都可以复活。也可以求助朋友，用五百金币助力你复活哦！$/,(m)=>'Your coins are frozen. Win '+m[1]+' chips to buy yourself out, or wait 15 minutes and you can come back no matter what. You can also ask a friend to chip in 500 coins and bring you back!'],
  [/^你回到了人间，金币已解冻。$/,()=>'You are back among the living and your coins are unfrozen.'],
  [/^金币已解冻。$/,()=>'Your coins are unfrozen.'],
  [/^你被 (.+) 花 (\d+) 金币赎了出来，金币已解冻。$/,(m)=>'You were ransomed by '+m[1]+' for '+m[2]+' coins. Your coins are unfrozen.'],
  [/^你花 (\d+) 金币赎出了 (.+)。$/,(m)=>'You paid '+m[1]+' coins to ransom '+m[2]+'.'],
  [/^(.+) 用鬼门开奖励把你救了回来。$/,(m)=>m[1]+' used a Ghost Gate reward to bring you back.'],
  [/^恭喜获得「(.*)」！请到台前领取。$/,(m)=>'Congratulations! You won "'+tn(m[1])+'"! Please collect it at the front.'],
  [/^恭喜中奖：「(.*)」！请到台前领取。$/,(m)=>'Congratulations! You won "'+tn(m[1])+'"! Please collect it at the front.'],
  // 全场播报
  [/^(.+) 赢下 (♠|♥|♣|♦)(\d)，\+(\d+) 金币(（独自通关）)?$/,(m)=>m[1]+' cleared '+m[2]+m[3]+', +'+m[4]+' coins'+(m[5]?' (solo)':'')],
  [/^(.+) 挑战 (♠|♥|♣|♦)(\d) 失败，进入鬼市$/,(m)=>m[1]+' failed '+m[2]+m[3]+' and entered the Ghost Market'],
  [/^(.+) 在鬼市赢够筹码，自赎回到人间$/,(m)=>m[1]+' won enough chips and bought their way back'],
  [/^(.+) 花 (\d+) 金币把 (.+) 从鬼市赎了出来$/,(m)=>m[1]+' paid '+m[2]+' coins to ransom '+m[3]+' from the Ghost Market'],
  [/^(.+) 喝下孟婆汤复活$/,(m)=>m[1]+' drank Meng Po soup and is back'],
  [/^鬼门开「(.*)」开启：最先完成的 (\d+) 人有奖励$/,(m)=>'Ghost Gate "'+tg(m[1])+'" is open: the first '+m[2]+' to finish get rewards'],
  [/^(.+) 第 (\d+) 个完成鬼门开「(.*)」$/,(m)=>m[1]+' finished Ghost Gate "'+tg(m[3])+'" in place #'+m[2]],
  [/^(.+) 鬼门开奖励：\+(\d+) 金币$/,(m)=>m[1]+' Ghost Gate reward: +'+m[2]+' coins'],
  [/^(.+) 用鬼门开奖励救出了 (.+)$/,(m)=>m[1]+' used a Ghost Gate reward to save '+m[2]],
  [/^(.+) 鬼门开奖励：拿到花色 (♠|♥|♣|♦)$/,(m)=>m[1]+' Ghost Gate reward: got suit '+m[2]],
  [/^鬼门开结束(（3 人奖励已发完）)?$/,(m)=>'Ghost Gate closed'+(m[1]?' (all 3 rewards given)':'')],
  [/^(.+) 获得「(.*)」$/,(m)=>m[1]+' won "'+tn(m[2])+'"'],
  [/^(\d+) 改名 (.*) → (.*)$/,(m)=>m[1]+' renamed '+m[2]+' → '+m[3]],
  [/^(\d+) 取名 (.*)$/,(m)=>m[1]+' chose the name '+m[2]],
];
// 奖品名 / 鬼门名：默认的翻，判官自己改过的原样
const PRIZE={'金币大亨奖':'Coin Tycoon Prize','大奖':'Grand Prize','小奖一':'Prize 1','小奖二':'Prize 2','小奖三':'Prize 3'};
function tn(s){return PRIZE[s]||s;}
function tg(s){return D[s]||s;}

const HARD=/^(简易|困难)(体能|逻辑|团队配合|心理)$/;
const KIND={'体能':'Physical','逻辑':'Logic','团队配合':'Teamwork','心理':'Mind'};
function part(s){
  const t=s.trim();let m;
  if(RN[t])return RN[t];
  if((m=HARD.exec(t)))return (m[1]==='简易'?'Easy ':'Hard ')+KIND[m[2]];
  if(t==='多人')return 'Many players';
  if((m=/^每轮(\d)-(\d)人$/.exec(t)))return m[1]+'–'+m[2]+' per round';
  if((m=/^(\d)人$/.exec(t)))return m[1]==='1'?'1 player':m[1]+' players';
  if((m=/^(\d+)秒$/.exec(t)))return m[1]+' s';
  if(t==='1v1 回合制')return '1v1 turn-based';
  return null;
}
export function trSeg(s){
  if(lang!=='en'||!CJK.test(s))return s;
  const lead=/^\s*/.exec(s)[0],tail=/\s*$/.exec(s)[0],t=s.trim();let r=null;
  if(Object.prototype.hasOwnProperty.call(D,t))r=D[t];
  else if(RN[t])r=RN[t];
  else{for(const [re,f] of P){const m=re.exec(t);if(m){r=f(m);break;}}}
  if(r==null&&t.includes(' · ')){const a=t.split(' · ').map(x=>part(x)||trSeg(x));if(a.every(x=>!CJK.test(x)))r=a.join(' · ');}
  if(r==null)return s;
  return lead+r+tail;
}
const ENT=/&(?:amp|lt|gt|quot|#\d+);/g;
const un=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const en=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function trHtml(h){
  if(lang!=='en'||!CJK.test(h))return h;
  return h.replace(/>([^<>]+)(?=<)/g,(m,t)=>CJK.test(t)?'>'+en(trSeg(un(t))):m)
    .replace(/\b(aria-label|placeholder|title|alt)="([^"]*)"/g,(m,a,v)=>CJK.test(v)?a+'="'+en(trSeg(un(v))).replace(/"/g,'&quot;')+'"':m);
}
export const t=s=>trSeg(s);
export function hasCjk(s){return CJK.test(s);}
void ENT;
