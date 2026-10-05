# CLAUDE.md — 百鬼夜行 / Borderland 交接说明

> 给接手这个仓库的 Claude 会话。先完整读完本文件再动手。

## 0. 和用户合作的方式（重要）

- 用户：Catherine（Cornell 机械工程 2030 届，CSSA 宣传部成员），负责为 CSSA 万圣节竞技活动「百鬼夜行 / Borderland」做现场控制网站。
- **全部用中文回复。** 回复简洁，先给结论；不要长篇复述过程。
- 用户要求**省 token**：先想清楚再动手；一个步骤一次写完、自己测完，步骤结束时汇报一次即可，中途不要频繁提问。
- 动手前如果方案有重大变化，先说明再做；小改动直接做。
- 用户经常小步迭代 UI 文案/布局，每次只改她说的那一处，不要顺手改别的；改完说清楚改了什么、没改什么。
- **绝对不要修改**用户上传过的那份多人共享的活动策划 docx（只读）。
- 不要在对话里索要或展示任何密钥（Cloudflare API Token、ADMIN_PIN 的生产值）。密钥只填进 GitHub Secrets / Cloudflare。
- **没让开始就不要动手。** 用户说“先和我商量”时，只讨论方案、给推荐默认值，等她明确说“开始/做吧”再改代码（2026-10-04 因提前动手被要求回退）。
- 活动日期：**2026-10-20**。8 队 × 6 人（2026-10-04 新规则），约 14 名工作人员（8 Dealer + 判官/孟婆/黑白无常/大屏/总控），一栋教学楼，约 2.5 小时。

## 1. 项目现状（截至 2026-10-02）

| 阶段 | 状态 |
|---|---|
| 原型（单文件 HTML Artifact） | 完成，作为参考：https://claude.ai/artifact/26hA3Aa8H2F1841fg3kPaP （正式版不再以它为准） |
| B1 核对 Cloudflare 平台规则 | 完成（见 §4） |
| B2 拆分规则/页面 | 完成 → `shared/rules.js` + `web/public/app.js` |
| B3 游戏服务器 + 实时同步 | 完成 → `worker/src/index.js` |
| B4 PIN 登录 + 总控工具 | 完成（名单导入除外，见 §6） |
| 本地测试 | 多设备联测 20 项 + 重启恢复 3 项全部通过；同时在「Worker 单进程」和「Pages + Worker」两种方式下都跑过 |
| C 部署上线 | 完成：GitHub Actions 推送 main 自动部署（约 25 秒），Secrets 已填；自定义域名 `borderland.catmin.io` 待确认（见 §5） |
| 氛围升级（2026-10-04 起） | 装饰层已于 10-04 回退（用户不满意，网站回到无装饰状态）；素材仍在 `assets/atmosphere/`；等用户确认登录页方案后再做（见 §7.5） |
| UI 换皮（Design 稿） | 基本完成并已在 main 上线（没有单独分支），按「工作人员页 鬼火版 v5」+「视觉方案 1b」完成，待用户看截图确认后合并（见 §7）；另有 Dealer 绑定、双语、动画新决定（见 §5.5） |

## 2. 架构

```
浏览器（PIN 登录）── WebSocket /api/ws ──▶ Pages Function（web/functions/api/[[path]].js，只做转发）
                                          ──▶ Worker "borderland-game" 里的 Durable Object "Game"（idFromName('main')，全场只有一个）
```

- **为什么网页放 Cloudflare Pages、服务器单独一个 Worker**：最终要挂到 CSSA 官网子域名（如 game.cornellcssa.org），CSSA 的 DNS 可能不在 Cloudflare。Pages 绑定外部 DNS 子域名只需一条 CNAME；Worker Custom Domain 必须域名在同账号 Cloudflare 上。Durable Object 不能定义在 Pages 项目里，所以 DO 放独立 Worker，Pages 通过 `script_name` 绑定。
- **规则只有一份**：`shared/rules.js`。服务器执行（权威），浏览器只用它的辅助函数做显示。`npm run build` 会把它复制到 `web/public/rules.js`（该副本已 gitignore）。
- rules.js 用模块级 `S`：调用前先 `use(state)`。`apply(state, me, action)` 做角色权限检查并分发；`viewFor(state, me)` 按角色过滤（玩家看不到日志、商铺后台、别队技能卡、不属于自己的通知）。
- **服务器时钟**：`clock = {running, base, at}`，游戏时间 = running ? base + (now-at)/1000 : base。每次操作前服务器设 `S.t`；浏览器用服务器下发的 clock 和时间差自己算，所以各屏一致。总控有开始/暂停。
- **存储**：DO 的 SQLite 存储（KV API）。键：`state`、`clock`、`auth`（pins + sessions）、`snap:<毫秒时间戳>`（每 10 次成功操作自动快照，保留 30 个；重置/恢复前也会快照）。日志超过 1500 条截断。
- **登录**：`POST /api/login {pin}` → `{token, me}`；浏览器存 localStorage（键 `borderland.session`）。输错 PIN 不锁定（2026-10-03 去掉：现场大家共用一个 Wi‑Fi 出口地址，锁定会误伤全场）。`?pin=123456` 链接可自动登录（以后印二维码用）。
- **开发者模式**：Worker 密钥 `DEV_PIN`（值由用户定，不写进仓库；GitHub Secret `DEV_PIN`，没设就关闭；本地写在 `.dev.vars`）登录得到 `role:'dev'`，收到全量状态；网页右上角下拉框选视角（总控/Dealer/判官/孟婆/大屏/任一玩家），玩家视角在浏览器里用 `viewFor` 过滤。旁边「只读 / 可操作」开关（默认只读，刷新后回到只读）：可操作时每个操作带 `as:{role,pid}`，服务器以该视角身份执行（权限照常检查；`admin.*` 只在总控视角可用）；只读时弹窗「知道了」只在本机生效。**仓库是公开的，PIN 不要写进代码**；活动当天前删掉（`wrangler secret delete DEV_PIN` 并删 GitHub Secret）。
- **Dealer 绑定房间**：Dealer 的 PIN 记录带 `rooms:[房间id]`，登录下发 `me.rooms`。生成 PIN 时，没人负责的房间轮流分给还没有房间的 Dealer（默认 8 个 Dealer = 一人一间；绑定前生成的旧 Dealer PIN 再点一次「生成」就会分到房间）；标签自动写成「Dealer 3♠」。`rules.apply` 拒绝 Dealer 对自己房间以外的 `enter/finish`（`me.rooms` 不是数组 = 全部房间，用于总控和开发者视角）。总控在 PIN 列表每个 Dealer 行下点 8 张牌改绑定（`admin.setrooms`），改完服务器以 4002 关掉该 Dealer 的连接让它重连拿到新房间。Dealer 页只显示自己的房间，只有一间时不显示房间选择。
- **管理员 PIN** 不在数据里，是 Worker 的密钥 `ADMIN_PIN`（本地在 `worker/.dev.vars`，值 888888，仅本地）。其他 PIN 由总控在网页上生成，存在 `auth.pins`。重置某个 PIN 会让用旧 PIN 登录的会话立即失效（服务器关闭其 socket，code 4001）。
- **WebSocket 协议**：服务器 → `hello {me,S,clock,now}`、`state {S,clock,now}`、`res {id,ok,msg,data}`、`pong`。浏览器 → `act {id, a:{type,...}}`、`ping`（每 20s；60s 没收到任何消息就判定假死并重连）。
- **防止打字被冲掉**：有输入框/下拉框获得焦点时，收到的新状态先不重绘，失焦后再重绘。

### 角色 → 页面

| 角色 | 页面（tab） |
|---|---|
| player 玩家 | 大屏（第一页，同大屏）+ 本队（状态、买命助力、通知与任务）；终极开启后只有终极单页 |
| wuchang 黑白无常 | 待接的人（接到了 / 送入鬼市）+ 待确认 |
| dealer | Dealer 房间（放行入场、赢/输结算） |
| judge 判官 | 判官（任务判定、勾魂令） |
| mengpo 孟婆 | 鬼市（待入鬼市 check-in/确认、买命；技能卡关闭） |
| screen 大屏 | 大屏（房间状态 + 队伍排名），只读 |
| ctrl 总控 | 以上所有工作人员页 + 生死簿（各队状态、改冥币、发布公告/任务、全场日志、**总控工具**：计时、生成/查看/重置 PIN、下载 PIN CSV、备份恢复、载入演示数据、重置游戏） |

## 3. 当前游戏规则（2026-10-04 会议新版，以 shared/rules.js 为准）

- **8 队 × 6 人**（红蓝绿黄紫橙青粉，id R B G Y P O C K），玩家编号如 `B-02`。8 个房间（扑克牌）：3♠ 一二三纸扎人、5♠ 奈何桥、4♦ 生死簿、6♦ 符咒密码、3♣ 冥界传话、5♣ 心有灵犀、5♥ 少数派、7♥ 孟婆的交易（**2026-10-04 取消双队，全部单队房间**；7♥ 玩法待定）。**一人一间 Dealer**（PIN 固定绑定，不能自选）。总控有「开局随机分房」按钮（每队随机一间，只在还没打过任何房间时可用）。
- 进房：**队伍须满员（存活 6/6）**、房间未满、不在别的房间、没打过这张牌、未进入终极。
- **赢房**：拿牌 + 牌号×100 冥币。**输房：每个房间都淘汰 1 人**：现场抽签，Dealer 在结算时选出被淘汰者（`picks`）。
- **淘汰流程**：`alive → out`（全屏红色通知「请留在原地，等黑白无常来接你」）→ 黑白无常页左栏点「接到了」`picked` → 右栏点「送入鬼市」`market`（若孟婆先登记，右栏按钮变「确认入鬼市」，不用再点一次）（check-in 发 300 冥币、开始计时）→ 孟婆也可 check-in；**两人谁点都行，另一方点确认**（总控随时可确认）→ 5 分钟 + 1000 冥币买命复活 → 10 分钟保护期。鬼市/淘汰时玩家页强制深色 + 整页红光，**通行证本身变红色主题并合并状态信息（已待/合计冥币），不再有单独横幅**。
- **队友助力 1:1**（`RATE=1`），只能给鬼市里的队友，不累计。
- **勾魂令**：判官点名别队存活队员，可填「位置」；终极队不能被勾魂；日志写「第 N 次勾魂」。
- **终极**：四花色集齐 + **全员活着** + **积分 ≥ 2000（当前余额）**。条件满足后，总控在生死簿点「开启终极任务」（可取消），该队玩家页变成**单页终极界面**（文案是占位 `FINAL_MSG`，告诉他们去一楼大厅）。线索机制已删除（花色不再对应线索）。
- **任务类型**：公告（保留）/ 鬼门开（全场播报，先到先得）/ sidequest（题库 `QUESTS`，占位两条；只发给一个队伍，选队按人数少的在前，不全场播报，各自完成）。
- **技能卡整体关闭**：`FEATURES.cards=false`，商铺/购买/使用/上架都返回「技能卡暂未开放」，代码保留，改 true 重开。
- 玩家大屏页排名**不高亮本队**（试过，她觉得不好看，已去掉）。玩家本队页的「被淘汰的队友」栏（含 1:1 助力）只给存活玩家显示；淘汰/鬼市中的人看不到这一栏。
- **玩家第一页 = 大屏同样内容**（`viewFor` 对玩家的 log 只含播报行），第二页才是本队。
- **新角色 黑白无常**（`wuchang`，1 人，PIN 固定）：页面显示「待接的人」（谁在哪里被淘汰）+ 接到了 / 送入鬼市；总控、孟婆页显示状态。
- 总控可改队伍冥币（`setscore`）。
- 演示数据：R-03 淘汰待接、B-06 已接到、B-05/P-02 在鬼市，另有鬼门开公告和 R 队 sidequest。

**我（Claude）替她选的默认值，她没逐条确认**：满员才能进房；终极文案占位；sidequest 默认奖励 100；check-in 发 300 冥币；终极条件用当前余额。5♥/7♥ 她说“双队 pk 房间取消”，我理解为保留 8 房间、改成单队（四花色仍需 ♥）。

存活人数用队伍实际人数（`size(tid)`）而不是固定 6，旧数据（6 队×7 人）不会显示 7/6；旧数据上线后要点「重置」才会变成 8 队。

**2026-10-04 实现进度**：新规则已在 `shared/rules.js`/`worker`/`app.js`/`style.css` 全部实现，sync 测试（62 PIN 等）和 restart 测试全过；`admin.setrooms` 已删，Dealer 与房间固定 i↔ROOMS[i]。§3 以外各节里关于 6 队×7 人、2:1、线索、技能卡、setrooms 的旧描述以 §3 为准。

**规则未定稿**：10 月 10 日左右冻结。仍待团队决定的：鬼市关门时没买回的人怎么办；房间状态是否公开显示占用队伍；最终奖项按什么算。改规则 = 只改 `shared/rules.js`（以及 app.js 里对应的显示文案/HINTS），然后跑测试。

## 4. 已核对的 Cloudflare 事实（2026-10-02）

- Durable Objects 在 Workers 免费计划可用，但**必须用 SQLite 存储**（wrangler 里用 `new_sqlite_classes`）。免费额度：每天 10 万请求、13,000 GB-s、500 万行读、10 万行写、总 5GB。WebSocket 收到的消息按 20:1 计请求。本活动用量远低于上限。
- Pages 自定义子域名不要求域名在 Cloudflare：在外部 DNS 加 CNAME 指向 `<项目>.pages.dev`，**并且**要在 Pages 后台添加该域名（只加 CNAME 会 522）。
- Worker Custom Domain 需要域名是同账号的 Cloudflare zone。
- Pages 不能定义 DO，必须绑定另一个 Worker 里的 DO。**本地**用 `wrangler pages dev` 时配置文件里的 DO 绑定不生效，要加 `--do GAME=Game@borderland-game`（已写进 `npm run dev:pages`）。

## 5. 下一步：阶段 C 部署（用户配合约 30 分钟）

用户的域名：**catmin.io**（在 Cloudflare 上买的）。测试期可用 `borderland.catmin.io` 或 pages.dev；最终迁到 CSSA 子域名（权限还在问）。

建议做法（还没做）：用 **GitHub Actions + Cloudflare API Token** 自动部署，用户不需要敲命令。
1. 写 `.github/workflows/deploy.yml`：push 到 main 时 → `npm ci` → `npm run build` → `wrangler deploy`（worker/）→ `wrangler pages deploy web/public --project-name borderland`（在 web/ 目录下运行，以便带上 functions/ 和 wrangler.jsonc）。首次需要 Pages 项目存在，可先 `wrangler pages project create borderland --production-branch main`。
2. **先上 Cloudflare 文档核对** API Token 需要的权限（预计：Account › Workers Scripts:Edit、Account › Cloudflare Pages:Edit、Account › Account Settings:Read；绑域名另说），再给用户逐步点击说明。
3. 用户在 GitHub 仓库 Settings › Secrets and variables › Actions 添加：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`ADMIN_PIN`（生产管理员 PIN，用户自己定，不要发在对话里）。workflow 里用 `wrangler secret put ADMIN_PIN` 从 secret 写入 Worker。
4. 部署后先用 pages.dev 测；再在 Pages 项目里加自定义域名 `borderland.catmin.io`（同账号 zone，DNS 自动配）。
5. 用户真机测试：2–3 台手机 + 电脑，分别用玩家/判官/大屏 PIN 登录，验证同步、锁屏后恢复。
6. 注意 package.json 里 wrangler 版本（本地用的是 4.146.0）；`package-lock.json` 还没有，CI 用 `npm ci` 前需要先生成并提交。

## 5.5 新增决定（2026-10-02，优先级：C 部署 → Dealer 绑定 → 换皮 + 双语 → 动画）

1. **（2026-10-03 已完成）Dealer 改成 PIN 绑定房间**：每个房间一个 Dealer PIN（一个 PIN 可绑多个房间）；服务器只允许 Dealer 操作自己绑定的房间（改 `shared/rules.js` 的权限检查 + `worker/src/index.js` 的 PIN 数据）。Dealer 登录后直接进入自己的房间；只绑一个房间时不显示房间选择。总控保留全部房间权限，并可在 PIN 列表里修改绑定。
2. **中英双语**：右上角「EN / 中」切换；第一次打开跟随系统语言，手动切换后记住（localStorage）。规则消息、日志、系统通知改成「消息键 + 参数」，由网页翻译；工作人员手输的内容（公告、任务、技能卡名等）不翻译。**英文译名先列清单给用户确认再用。** 10/10 前完成。
3. **动画（有时间再做）**：大屏播报（勾魂符纸盖印、率先完成播报条）、排名旗幡换位 + 冥币数字滚动、玩家通知符纸展开。纯 CSS，尊重 `prefers-reduced-motion`。
4. **UI 换皮**：照用户在 Claude Design 做的两份稿——「百鬼夜行 视觉方案 v2」和「tmp-staff」（链接之后发）。只改网页文件，不动规则和服务器；电脑 1440 + 手机 390 都适配；只做浅色，大屏另给深色配色；设计稿和现有功能冲突的先问用户。

## 6. 之后的待办

- **名单导入**：真实名单（姓名、队伍、邮箱）出来后，在总控工具加 CSV 导入，给玩家加姓名；PIN 生成后可选发邮件（Google Apps Script 或邮件服务）或打印带 `?pin=` 二维码的卡片。PIN 绑定到人，不绑定队伍。
- **UI 换皮**：见 §7。
- **大屏深色配色**：只给大屏做一套深色颜色值，当天按场地灯光选择。
- **加固**：60 台设备压力测试；当天应急手册（断网切纸质记录、之后补录）。
- **时间线**：10/10 规则冻结 → 10/13 左右彩排 → 彩排后导入正式名单、生成 PIN、切到 CSSA 子域名、发 PIN → 10/20 活动 → 活动后导出日志、删除数据、下线。

## 7. UI 设计稿

- 用户在 Claude Design 里做了「百鬼夜行 视觉方案 v2」（宣纸浅色、扑克牌房间卡、旗幡式队伍排名、印章、全场播报、玩家手机页和全屏通知弹窗）。用户很喜欢这个风格。队伍色改成传统颜料色：红 #b3332a、蓝 #2f5b94、绿 #2e7d5b、黄 #d6a21e、紫 #74488c、橙 #d47a2c。
- 计划：用户把 Design 分享链接发来后，用 Artifact 工具 `read` 读取设计稿 HTML，把配色/字体/组件搬进 `web/public/style.css` 和 app.js 的视图函数。**只换样式和结构，不碰规则和服务器**，换完重跑测试。
- 大屏和玩家页照设计稿；登录页让 Design 补；工作人员页按同一风格自己套。所有页面都要适配电脑（1440）和手机（390），不能出现横向滚动；只做浅色版，大屏另给深色色值。
- 换皮放在部署上线之后做。

- **2026-10-03 更新**：用户改用 1b「鬼火 · 冥府档案」风格：工作人员页用「工作人员页 鬼火版 v5」（浅色、所有下拉框改点选按钮、手机底部分页、页头鬼火），大屏和玩家页用「视觉方案」里的 1b（深浅两色，页头按钮切换，按设备记住），登录页深色（鬼火、眼睛、盖章动画，`ghost-ambience.js`）。队伍色改用 1b 颜色（只在 app.js 的 `TC` 里替换显示，rules.js 不动）。玩家手机页也分页（本队 / 任务 / 鬼市 / 房间），保留「全部房间」。
- **2026-10-03 深色**：所有页面都有「深色/浅色」按钮，按设备分三份记住（`borderland.theme.screen` 大屏默认深色、`.player` 玩家默认浅色、`.staff` 工作人员页默认浅色）；颜色全部走 `:root[data-theme=dark]` 变量。背景动画（`ghost-ambience.js`，跟 `data-tone` 走）：浅色 = 白色方孔纸钱，淡、慢，像落叶一样左右摆着往右下飘；深色 = 鬼火从下往上升，到顶部或碰到大屏内容就淡出、在底部重生；登录页始终深色鬼火 + 眼睛（手机也是 9 团鬼火；`data-free=1`，鬼火和眼睛只在登录卡片外的空白处；瞳孔跟随鼠标；手机上看向手指点到/划过的位置，抬手后保持；指针移动时多睁开几双，停 2.5 秒后恢复）。工作人员页和玩家页：电脑上，以及手机深色时，用大屏的全窗口背景（`screen` 模式 + `data-free=1`：鬼火和眼睛只出现在没有面板/文字的空白处——用 `elementFromPoint` 检查，鬼火升到面板后面就淡出，眼睛每次睁开前随机找一块空地；`data-top` = 顶栏和标签下沿；清掉大屏留下的 `data-keep`）；手机浅色时只在页头 150px 一条飘纸钱（`page`）；大屏全屏（`screen`，固定眼位）。**在鬼市的玩家**：玩家页强制深色、隐藏深浅按钮、`data-more=1` 多睁两双眼，买命回队后恢复自己的设置。
- **酆都通行证（2026-10-03，玩家页顶部）**：定稿设计在 Claude Design 画布「冥府通行证设计」。浅宣纸色文牒（`.wen`）：书法标题「酆都通行证」+ 小字「冥府签发」（当地政府签发，所以落款是冥府）、细线内框 + 四角主题绿角标、「持证人 编号 / 所属 队名」、右侧状态方印（存活 / 保护中 / 鬼市，朱文，边缘粗糙 + 印色浓淡由 `index.html` 里的 SVG 滤镜 `#sealInk`、纸纹 `#paperGrain` 做）+ 提示（小心勾魂 / 保护期还剩 N 分钟 / 已待 m:ss）。印色走变量：存活 `--accent`、保护中 `--warn`、鬼市 `--red`；深色模式自动换纸色。电脑放在左栏顶部（`.pcol.l` 里第一个），右侧任务区同高开始；手机重排成「标题 / 细线 / 编号 + 印章」。其他页面和标签里仍写「冥府」，是否统一成「酆都」待用户定。
- **鬼市页（2026-10-03 重排）**：浏览器整页滚动（`body.natscroll` 只用在鬼市页，取消电脑上「固定一屏、#view 内部滚动」）；电脑左 60% 孟婆买命（每人一张紧凑卡：第一行编号/队伍/已停留 m:ss/5 分钟（满了变强调色，超过 5 分钟如实显示；不再显示资格标签），第二行本人冥币输入/队友助力数值/合计/买命按钮，按钮不可用时写原因），右 40% 技能卡（标签「购买技能卡 / 各队持有 N」；点选买家后在商品行里直接「卖给 X」，没有技能卡下拉框）；「上架新技能卡」在标题旁，点开是弹窗（Esc/取消/点背景关闭）。<960px 单列。1600×842 下 4 人 + 5 张卡的所有按钮都在第一屏。
- **玩家页重排（2026-10-03）**：电脑 ≥1100 宽：顶部紧凑身份栏（编号/状态/队伍一行）；主体 2/3 + 1/3（`.pcol.l`：队伍概况一行〔冥币/存活/四色碎片〕+ 技能卡一行（空时只一句提示）+「全部房间」4 列 × 2 行，本队所在房间 `.room.mine` 红框；`.pcol.r`：当前任务与通知〔未读或进行中的任务〕+ 折叠的「历史消息」（`ui.histOpen`）+ 鬼市队友）。「本队进行中」大卡片只在手机（`.mobonly`）保留。玩家页也用 `body.natscroll`（整页滚动）。房间卡网格 `auto-fill minmax(140px)`，窄屏自动两列。鬼市买命卡的本人冥币输入框内有 ▲▼（±100，`data-a=mcoin`）。
- **电脑分页**：宽 ≥1100 时玩家页（`.page.allin`）不分页，所有部分按列并排（每列 ≥420px，`auto-fill`），通行证横跨整行；窄于 1100 仍用顶部分页。生死簿内容多，保留分页；Dealer / 判官本来就是两栏。
- 换皮时按现有规则做、之后要改规则的设计功能（用户已确认要加）：技能卡按队伍买、已用技能卡划线保留、房间计时 + 日志操作人、改冥币写原因。

- **2026-10-03 交互**：发布（发给谁 / 选择队员）、修改队伍（队伍下拉、冥币 ±100 步进、线索 8 张牌点选，点牌后要再点「确认」才生效）都用 app.js 里的 `dd()` 下拉组件；类型/完成方式仍是分段按钮。PIN 列表每行有「复制」。震动：`buzz()` + 画面抖动。安卓用 `navigator.vibrate`；iPhone 没有这个接口，改用点击隐藏的 `<input type=checkbox switch>` 触发一下触感（iOS 17.4+，iOS 只在真实点击后才允许，26.5 起多段只响第一下），所以 iPhone 上服务器推来的弹窗不会震，要真震只能做推送通知（需加到主屏 + 授权，未做）；登录错误、盖章落下（0.6 s）、玩家全屏弹窗出现时（被淘汰用更长的震动）。登录卡片宽度不再被错误提示撑宽。

## 7.5 氛围升级方向（2026-10-04，用户确认）

- **方向**：保留「鬼火 + 纸钱」，叠加中式志怪民俗：彼岸花、骨花（白骨色花枝藤蔓）、纸人、铜钱、红绸、长舌鬼面等；现代感靠版式、字体、磨砂面板，不要过于古风死板。参考图风格：低照度、冷青绿光 + 一抹血红、雾、散落铜钱。**不照搬游戏角色。** 程序画的 SVG 装饰被用户否决（太丑），改用她在 Midjourney 生成的图片素材（`assets/atmosphere/`，见该目录 README）。**用户明确要求克制：每个页面只放 2–3 件素材，不要堆叠；先少放，她说不够再加。**
- **分区铁律**：装饰区（登录页整页、大屏背景和边框、页头、空白处、空状态、全屏弹窗）要做足、不简化；功能区（按钮、数字、表单、房间卡、排名、任务文字）底板不透明、对比度和字号不为装饰让步，装饰不得压在上面。
- **步骤**：①背景层（登录页 + 大屏，已完成）→ ②纸人童子（白眼 + 红腮红）+ 空状态 + 淘汰/勾魂弹窗 → ③玩家页/工作人员页组件质感统一（磨砂面板、符纸边、印章）→ ④大屏志怪主视觉（需要给舞台留出边框区放大面积装饰，目前舞台铺满，角落装饰会压到标题和排名，所以大屏现在只留底部花丛）。每步截图给用户确认。
- **步骤 1 实现（图片版）**：`web/public/decor.js` 往 `#decor` 里写 `<img>`（`#decor` 在 `#amb` 之前，鬼火画布盖在它上面）：底部彼岸花丛带（`img/lily-strip.webp`，18 张左右镜像拼接，接缝连续）、淡雾（`fog.webp`，opacity .17，底部渐隐 mask）、骨花（`bone-flower.webp`，右下，茎在画面外，花丛盖住茎根）。样式在 `style.css` 末尾。显示规则：登录页 = 花丛 + 雾 + 骨花；大屏和深色全屏页 = 只有一条低矮花丛（`clamp(44px,7vh,76px)`，opacity .7，不能压到全场播报文字）；浅色页不显示。`prefers-reduced-motion` 关雾动画。只部署三张图（约 0.7MB），其余素材留在 `assets/atmosphere/`，不会上线。
- 下一步（步骤 2）：纸人童子（`paper-child-teal.webp`）用在玩家空状态、淘汰/勾魂全屏弹窗；红绸、符纸可用在弹窗/公告卡。同样克制，一处一件。
- **已知问题（原有，非本次引入）**：总控账号在「大屏」标签看大屏时，舞台高度塌成约 20px（`--k` 缩放为负，`#view` 高度不足）；用大屏角色/开发者「大屏」视角则正常。活动当天用大屏角色 PIN，不受影响，有空再修。

- **2026-10-04 回退**：`decor.js`、`web/public/img/`、index.html/style.css 里的装饰全部撤掉（回到 36b879c 的网页文件）。用户新想法（只讨论过，未开始）：**登录页改成两个纸人童子一左一右（青 / 粉），鬼火先去掉，雾保留**。新素材：龟裂能面具长舌（`mask-longtongue.webp`）。其余页面是否也去鬼火、花丛/骨花是否保留，待用户确认。
- **2026-10-04 眼睛只看近处**：指针移动期间（`active`）只有离指针 ≤ `RF`（= 0.4×短边×1.6）的眼睛保持睁开；更远的 0.2 秒后开始闭上，新睁开的眼睛也只在 `RF` 内出现（登录页随机选空地的分支同样限制）。改动只在 `ghost-ambience.js`；Playwright 实测登录页左右两侧指针移动时，远处亮眼数为 0。
- **2026-10-04 鼠标静止时眼睛不再频繁换**：指针不动（`target` 在且 `!active`）时，`RF` 内的眼睛一直睁着；新眼睛出现间隔 ×3，新睁开的眼睛停留 ×4；登录页「唤醒最近的眼睛」（`wakeNear`）停留也 ×4（原先它唤醒的眼睛在 R 外，3–5 秒闭上又被同一分支唤醒，是主要的循环来源）。实测鼠标静止 14 秒睁眼次数 5–6 → 1–2。

## 8. 开发与测试

```bash
npm install                                   # 首次
printf 'ADMIN_PIN=888888\nDEV_PIN=<本地随便定>\n' > worker/.dev.vars   # 仅本地
npm run dev                                   # http://localhost:8787（Worker 同时托管网页，单进程）
node tests/sync.test.mjs [baseUrl]            # 多设备联测，需要服务器在跑；默认 http://localhost:8787
node tests/restart.test.mjs                   # 自己启停 wrangler，测重启后自动重连与数据保留（运行前先停掉 npm run dev）
npm run dev:pages                             # 正式部署的路径（Pages+Worker），需要 Worker 的 dev 也在跑
```

坑：
- 测试用 Playwright（全局安装；Chromium 在 `/opt/pw-browsers/chromium`）。ESM 不认 NODE_PATH，需要 `ln -s $(npm root -g)/playwright node_modules/playwright`。
- 用 `pkill -f` 停 wrangler 时，**不要和启动命令写在同一条 Bash 里**，否则会匹配到自己并杀掉当前 shell（exit 144）。用 `pkill -f "[w]rangler.*dev.jsonc"` 单独执行。
- `web/public/app.js` 里的视图函数最初是从原型脚本切出来的；改页面时直接改 app.js。
- 联测脚本里选队伍时注意演示数据中哪些队正在房间里（会被规则拒绝入场）。

## 9. 文件速查

- `shared/rules.js` — 规则 + `apply` + `viewFor` + 演示数据 `seed`
- `worker/src/index.js` — Durable Object `Game`、登录、WebSocket、总控管理操作（`admin.*`）
- `worker/wrangler.jsonc`（生产）、`worker/wrangler.dev.jsonc`（本地，带 assets）
- `web/public/index.html`、`style.css`、`app.js` — 网页
- `web/functions/api/[[path]].js` — Pages 转发
- `web/wrangler.jsonc` — Pages 配置（DO 绑定 script_name=borderland-game）
- `tests/` — 联测
