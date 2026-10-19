# 百鬼夜行 · CSSA 万圣节竞技控制台

现场实时控制台（个人赛）：每个人用 6 位 PIN 登录，只看到自己角色的页面；所有操作在服务器上按规则执行，再实时推送到所有屏幕。

## 结构

| 目录 | 内容 |
|---|---|
| `shared/rules.js` | **全部游戏规则**。服务器和网页共用，改规则只改这里。 |
| `worker/` | 游戏服务器（Cloudflare Worker + Durable Object），保存数据、执行操作、推送更新。 |
| `web/public/` | 网页（登录、大屏、拍卖大屏、玩家手机、Dealer、判官、孟婆、黑白无常、生死簿）。 |
| `web/functions/` | 把 `/api/*` 转给游戏服务器。 |
| `tests/` | 规则测试、多设备联测、重启恢复测试。 |
| `docs/应急手册.md` | 断网 / 网站出问题时的现场流程。 |

## 角色

玩家 · Dealer · 判官（主持人，管鬼门开、解谜、拍卖）· 孟婆 · 黑白无常 · 大屏 · 总控。
总控能看所有页面，「生死簿 → 总控工具」里有计时、PIN、打印身份卡、备份恢复、演示数据、重置等。

## 本地开发

```bash
npm install
printf 'ADMIN_PIN=888888\nDEV_PIN=777777\n' > worker/.dev.vars
npm run dev                  # http://localhost:8787 ，一个进程跑网页 + 服务器
node tests/rules.test.mjs    # 纯规则
node tests/sync.test.mjs     # 另开终端：多设备联测（需要 Playwright）
```

## 部署

推送到 `main` 后 GitHub Actions 自动部署（`.github/workflows/deploy.yml`）：先部署 Worker `borderland-game`，再部署 Pages 项目 `cssa-borderland`。
需要的 GitHub Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`；可选 `ADMIN_PIN`、`DEV_PIN`。
自定义域名在 Pages 项目里添加；外部 DNS 的子域名加一条 CNAME 指向 `cssa-borderland.pages.dev`。
