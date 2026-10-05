# 百鬼夜行 · CSSA 万圣节竞技控制台

现场实时控制台：每个人用 6 位 PIN 登录，只看到自己角色的页面；所有操作在服务器上按规则执行，再实时推送到所有屏幕。

## 结构

| 目录 | 内容 |
|---|---|
| `shared/rules.js` | **全部游戏规则**。服务器和网页共用，改规则只改这里。 |
| `worker/` | 游戏服务器（Cloudflare Worker + Durable Object），保存数据、执行操作、推送更新。 |
| `web/public/` | 网页（登录、大屏、玩家手机、Dealer、生死簿、判官、鬼市）。 |
| `web/functions/` | 把 `/api/*` 转给游戏服务器。 |
| `tests/` | 多设备联测、重启恢复测试。 |

## 角色

玩家 · Dealer · 判官 · 孟婆 · 总控 · 大屏。总控能看所有工作人员页面，并在「生死簿」底部有总控工具：
开始/暂停计时、生成和重置 PIN、下载 PIN 表、查看和恢复备份、载入演示数据、重置游戏。

管理员 PIN 不存在数据里，而是部署时设置的密钥 `ADMIN_PIN`。

## 本地开发

```bash
npm install
echo 'ADMIN_PIN=888888' > worker/.dev.vars
npm run dev          # http://localhost:8787 ，一个进程跑网页 + 服务器
npm test             # 另开终端：多设备联测
```

## 部署（Cloudflare）

1. 游戏服务器：`npm run deploy:game`，并设置密钥 `cd worker && wrangler secret put ADMIN_PIN`
2. 网页：`npm run deploy:web`（Pages 项目名 `borderland`）
3. 自定义域名在 Pages 项目里添加；外部 DNS 的子域名只需一条 CNAME 指向 `cssa-borderland.pages.dev`。
