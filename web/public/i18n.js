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
  '剩余时间':'Time left','已暂停':'Paused','全场播报':'Live Feed','播报':'Live','暂无播报':'Nothing yet','金币排行':'Coin Ranking','还没有人上榜':'Nobody on the board yet',
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
  '欢迎来到 CSSA 万圣夜！':'Welcome to CSSA Halloween Night!','地府全体工作人员竭诚为您服务，祝您今晚玩得愉快，平安返程！':'All Underworld staff are at your service. Have a great night, and a safe trip back!',
  '跳过':'Skip','待入鬼市':'To register','押送中':'Escorted','挑战中':'In play','挑战中（':'In play (','简单':'Easy',
  '请自行前往鬼市登记，不然黑白无常会来抓你哟！':'Please go register at the Ghost Market yourself, or the Wuchang will come and get you!','黑白无常正在送你去鬼市，到达后请找孟婆登记。':'The Wuchang is taking you to the Ghost Market. Register with Meng Po when you arrive.',
  '鬼市暂住中':'Staying in the Ghost Market','金币暂时冻结':'Your coins are temporarily frozen','你已中奖，后续抽奖不再参与。好运也给其他人留一点！':'You already won, so you are out of the remaining draws. Leave some luck for the others!',
  '金币折算':'Coins','花色奖励':'Suit bonus','全通关':'All rooms','通关全部八间房':'Clear all 8 rooms','解谜所得':'Puzzle earnings','通关奖励':'Reward',
  '还没有闯关记录，去地图上挑一间试试吧！':'No challenges yet. Pick a room on the map and give it a try!','暂时没有新通知。有时候没消息也是好消息。':'No new notices. Sometimes no news is good news.',
  '金币、通知和闯关记录都在这里，随时可以回来查看':'Your coins, notices and challenge record are all here. Come back any time.','在这里查看剩余时间、金币排行和全场播报。':'See the time left, coin ranking and live feed here.','在这里查看房间位置和开放状态。有问题可以去info desk找地府工作人员。':'See where the rooms are and whether they are open. Questions? Ask the Underworld staff at the info desk.',
  '每100金币计作1张彩券，集齐四种花色额外获得5张，通关全部八间房额外获得10张。\n彩券越多，压轴抽奖越容易中奖；金币最多的人还有大奖哦！':'Every 100 coins counts as 1 raffle ticket. Collect all 4 suits for 5 extra tickets, and clear all 8 rooms for 10 more.\nThe more tickets you have, the better your odds in the Grand Raffle, and whoever has the most coins wins a grand prize too!',
  '时间到，准备开奖！':"Time's up, raffle time!",'最后15分钟，排行榜已隐藏！':'Last 15 minutes, the ranking is hidden!','看热闹不嫌事大的判官表示，现在分出胜负还太早，决定先把排行榜藏起来。想偷偷干票大的弯道超鬼，现在正是时候！':'The Judge, who loves a good show, says it is too early to call a winner and has hidden the ranking. If you want to pull off a sneaky comeback, now is the time!',
  '欢迎来到鬼市！':'Welcome to the Ghost Market!','复活成功':'Revival successful','你复活了！':'You are back!','有人来赎你了！':'Someone is ransoming you!','有人救了你！':'Someone saved you!','恭喜获得':'Congratulations',
  '金币已解冻，请继续努力生存！孟婆表示希望下次晚点见到你。':'Your coins are unfrozen. Keep fighting to survive! Meng Po hopes to see you a little later next time.',
  '通过你的好运和努力，你终于将自己赎出了鬼市！金币已解冻，请继续努力生存，感谢你对地府业务的支持！':'Through your luck and effort, you have bought your way out of the Ghost Market! Your coins are unfrozen. Keep fighting to survive, and thank you for supporting Underworld business!',
  '请找判官任选一项奖励：300 金币、救回一名玩家，或获得一种花色。':'Find the Judge and pick one reward: 300 coins, save a player, or take a suit.',
  '判官反复核对过了，今晚确实数你最有钱。请到台前领取你的大奖！':'The Judge double-checked: you really are the richest tonight. Please collect your grand prize at the front!',
  '鬼门已开！想参加的请按判官指示集合。':'The ghost gate is open! Follow the Judge to join in.','鬼门再开！想参加的请按判官指示集合。':'The ghost gate opens again! Follow the Judge to join in.','阎王点名':"Yama's Roll Call",'生死一线':'Life on the Line',
};
// 带数字 / 名字的句子。$1 $2 是捕获的内容；名字（编号 + 昵称）原样保留。
const P=[
  [/^#(\d+) 谜题$/,m=>'Puzzle #'+m[1]],
  [/^(♠|♥|♣|♦)(\d) (\S+) (开放中|已关闭|重置中|游戏中)$/,m=>m[1]+m[2]+' '+(RN[m[3]]||m[3])+' '+(m[4]==='开放中'?'Open':m[4]==='已关闭'?'Closed':m[4]==='重置中'?'Resetting':'Playing')],
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
  [/^鬼门开：你是第 (\d+) 名！?$/,(m)=>'Ghost Gate: you came in #'+m[1]+'!'],
  [/^找判官选奖励：(\d+) 金币 \/ 救一个人 \/ 拿一个花色。$/,(m)=>'See the Judge to pick a reward: '+m[1]+' coins / save someone / take a suit.'],
  [/^原因：挑战 (\S+) 失败。请自行去鬼市登记，不然黑白无常会来抓你哟！$/,(m)=>'Reason: failed '+m[1]+'. Please go register at the Ghost Market yourself, or the Wuchang will come and get you!'],
  [/^金币已冻结。用实体筹码赢到 (\d+) 就能自赎；待满 15 分钟，不管赚没赚到都可以复活。也可以求助朋友，用五百金币助力你复活哦！$/,(m)=>'Your coins are frozen. Win '+m[1]+' chips to buy yourself out, or wait 15 minutes and you can come back no matter what. You can also ask a friend to chip in 500 coins and bring you back!'],
  [/^通过你的努力，你终于逃脱了鬼市，请继续努力生存哦！$/,()=>'Through your own effort, you have finally escaped the Ghost Market. Keep fighting to survive!'],
  [/^金币已解冻。$/,()=>'Your coins are unfrozen.'],
  [/^你被 (.+) 花 (\d+) 金币赎了出来，金币已解冻。$/,(m)=>'You were ransomed by '+m[1]+' for '+m[2]+' coins. Your coins are unfrozen.'],
  [/^你花 (\d+) 金币赎出了 (.+)。$/,(m)=>'You paid '+m[1]+' coins to ransom '+m[2]+'.'],
  [/^(.+) 用鬼门开奖励把你救了回来。$/,(m)=>m[1]+' used a Ghost Gate reward to bring you back.'],
  [/^恭喜获得「(.*)」！今晚的金币没白攒，请到台前领取你的大奖！$/,(m)=>'Congratulations! You won "'+tn(m[1])+'"! Your coins tonight were not saved in vain. Please collect your grand prize at the front!'],
  [/^恭喜中奖：「(.*)」！请到台前领取。$/,(m)=>'Congratulations! You won "'+tn(m[1])+'"! Please collect it at the front.'],
  [/^很遗憾，你没能通过 (\S+) 的挑战！请自行前往【鬼市】找孟婆登记，不然黑白无常会来抓你哟！$/,(m)=>'Sorry, you did not pass '+m[1]+'! Please go to the Ghost Market and register with Meng Po yourself, or the Wuchang will come and get you!'],
  [/^金币已暂时冻结，接下来就看你手气如何了！\s*筹码攒到 (\d+) 即可找孟婆自赎复活；手气不佳也没关系，好心的孟婆允许你待满 15 分钟后复活。还可以找场上的朋友花 (\d+) 金币赎你出去哦！$/,(m)=>'Your coins are temporarily frozen, and from here it is down to your luck! Reach '+m[1]+' chips and Meng Po will let you buy your way out. If luck is not on your side, kind Meng Po lets you leave after 15 minutes. You can also ask a friend at the venue to pay '+m[2]+' coins to ransom you!'],
  [/^实体筹码攒到 (\d+)，可找孟婆自赎$/,(m)=>'Reach '+m[1]+' chips and ask Meng Po to buy your way out'],
  [/^(.+) 花 (\d+) 金币把你赎出了鬼市，金币已解冻。看来你在人间的人缘还不错哦！$/,(m)=>m[1]+' paid '+m[2]+' coins to ransom you from the Ghost Market. Your coins are unfrozen. Looks like you are well liked up there!'],
  [/^你花 (\d+) 金币赎出了 (.+)，对方已恢复挑战资格。感谢你对地府业务的支持！$/,(m)=>'You paid '+m[1]+' coins to ransom '+m[2]+'. They can challenge rooms again. Thank you for supporting Underworld business!'],
  [/^(.+) 用鬼门开的奖励把你救了回来。你已恢复挑战资格，金币已解冻，请继续努力生存！$/,(m)=>m[1]+' used a Ghost Gate reward to bring you back. You can challenge rooms again and your coins are unfrozen. Keep fighting to survive!'],
  [/^恭喜获得「(.*)」！$/,(m)=>'Congratulations! You won "'+tn(m[1])+'"!'],
  [/^恭喜抽中「(.*)」，请到台前领取。$/,(m)=>'Congratulations! You drew "'+tn(m[1])+'". Please collect it at the front.'],
  [/^\+(\d+)彩券$/,(m)=>'+'+m[1]+' tickets'],
  [/^挑战中 · (\d+)人$/,(m)=>'In play, '+m[1]],
  [/^各房间停止接收新玩家，正在挑战的玩家请完成本局。\s*结束后前往「(.*)」集合，参加压轴抽奖。辛苦生存到现在，看看今晚能带走什么吧！$/,(m)=>'No new players are being admitted to any room, and anyone mid-challenge should finish the round. Afterwards head to "'+tg(m[1])+'" for the Grand Raffle. You have survived this far, so see what you can take home tonight!'],
  [/^鬼门已开！想争这一轮奖励的玩家，请前往(.+)找判官。奖励有限，先完成先得！$/,(m)=>'The Ghost Gate is open! Head to '+tg(m[1])+' and find the Judge if you want a shot at this round of rewards. Rewards are limited, first to finish wins!'],
  [/^鬼门再开！新一轮挑战开始，请前往(.+)找判官。这次能不能抓住机会，就看你了！$/,(m)=>'The Ghost Gate opens again! A new challenge begins. Head to '+tg(m[1])+' and find the Judge. Whether you seize the chance is up to you!'],
  [/^(.+) 挑战 (♠|♥|♣|♦)(\d) 失败，即将前往鬼市$/,(m)=>m[1]+' failed '+m[2]+m[3]+' and is heading to the Ghost Market'],
  [/^(.+) 进入鬼市，金币冻结$/,(m)=>m[1]+' entered the Ghost Market, coins frozen'],
  // 全场播报
  [/^(.+) 赢下 (♠|♥|♣|♦)(\d)，\+(\d+) 金币(（独自通关）)?$/,(m)=>m[1]+' cleared '+m[2]+m[3]+', +'+m[4]+' coins'+(m[5]?' (solo)':'')],
  [/^(.+) 挑战 (♠|♥|♣|♦)(\d) 失败，进入鬼市$/,(m)=>m[1]+' failed '+m[2]+m[3]+' and entered the Ghost Market'],
  [/^(.+) 在鬼市赢够筹码，逃出了鬼市$/,(m)=>m[1]+' won enough chips and escaped the Ghost Market'],
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
