# 氛围素材（透明 WebP）

用户在 Midjourney 用纯黑底生成，已去黑底变透明、去掉生成器水印/印章（处理脚本思路：发光类 = 取最亮通道做 alpha；骨花 = 软阈值保留镂空；纸人/绸/符纸 = 阈值+填洞+羽化）。
**2026-10-04：网站上的装饰已回退，目前没有任何素材部署上线**；这里全是备份，要用时复制到 `web/public/img/` 再按显示尺寸压缩。

| 文件 | 内容 | 原用在 |
|---|---|---|
| lily-strip | 底部彼岸花丛 + 青鬼火（3:1，左右镜像可无缝拼） | 登录页、大屏、深色全屏页底部 |
| fog | 青色雾 | 登录页，极淡（opacity .17） |
| bone-flower | 骨花（茎是椎骨，茎端在图底边外） | 登录页右下，从花丛里长出来 |
| bone-bloom / bone-row | 单朵骨花 / 一排五朵白花（偏瓷白，不太像骨） | 备用 |
| lily-cluster | 三朵彼岸花特写 | 备用 |
| paper-child-teal / -pink | 纸人童子（白眼、红腮红），青绿 / 粉 | 步骤 2：空状态、淘汰/勾魂弹窗 |
| silk-hang | 垂挂红绸 | 备用（淘汰弹窗等） |
| mask-longtongue | 青绿龟裂能面具 + 红长舌（800×1736） | 备用（大屏/弹窗，不用在登录页） |
| talisman | 符纸 | 备用（公告/勾魂令卡片底） |

未入库：寺庙场景图 temple-bg（质感像游戏截图，来源不明，先不用）。

## 生成提示词要点（Midjourney v7）
- 通用：`isolated on a pure solid black background (#000000)`、`--v 7 --style raw --no text, watermark, logo, border`；一张图只放一个主体。
- 彼岸花丛：`dense field of red spider lilies ... teal ghost-fire wisps ... flowers only in the bottom 45%` `--ar 3:1`
- 骨花：用文字描述（肩胛骨做花瓣、肋骨做花蕊、椎骨做茎），**不要把别人的雕塑照片当参考图**。
- 纸人：`traditional Chinese joss paper effigy of a small child ... hollow glowing white eyes ... round red rouge circles on cheeks` `--ar 2:3`
