# 教会里那些大家都懂，但平常不太讲的事

一个为小型团契现场设计的一次性匿名互动墙。参与者用手机完成五道题，主持人通过投影页查看提交数量，并按题逐页揭晓匿名结果。

正式地址：

- 答题页：https://untold.ducenhan.com/answer/
- 主持页：https://untold.ducenhan.com/host/

## 功能

- 约 7–8 人使用手机匿名提交答案。
- 单选、多选和短文本题集中在同一张表单中。
- 主持页显示实时提交数量、QR 码和逐题揭晓结果。
- 主持人口令保护结果查看与清空操作。
- 每份回答在创建 24 小时后自动删除。
- 支持主持人手动清空测试或本场数据。
- 最后一页可在新标签页打开指定 YouTube 视频。

项目不收集姓名、邮箱、手机号等身份信息，也没有账号、排行榜或长期数据后台。

## 技术栈

- 原生 HTML、CSS 和 JavaScript
- Cloudflare Workers Static Assets
- Cloudflare D1
- Worker Cron Trigger
- Node.js 内置测试运行器

静态页面和 API 使用同一个域名，不需要额外配置 CORS。

## 项目结构

```text
church-untold/
├─ public/
│  ├─ answer/          # 手机答题页
│  ├─ host/            # 主持与投影页
│  └─ assets/          # 样式、页面逻辑和本地 QR 编码器
├─ src/
│  ├─ constants.js     # 活动标识、问题和选项
│  └─ worker.js        # API、鉴权、聚合与过期清理
├─ test/               # Worker 与 QR 自动化测试
├─ schema.sql          # D1 数据表和索引
├─ wrangler.jsonc      # Cloudflare 部署配置
└─ .dev.vars.example   # 本地环境变量示例
```

## 本地开发

需要 Node.js 22 或更新版本。

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

将 `.dev.vars` 中的 `HOST_PASSCODE` 改成本地测试口令，然后打开：

- `http://127.0.0.1:8787/answer/`
- `http://127.0.0.1:8787/host/`

如果 PowerShell 的脚本执行策略阻止 `npm` 或 `npx`，可以改用 `npm.cmd` 和 `npx.cmd`。

同一台设备需要反复测试提交时，使用：

```text
http://127.0.0.1:8787/answer/?test=1
```

测试模式的成功页会提供本机提交记录清除按钮；正式 QR 不包含该参数。

运行自动化测试：

```powershell
npm test
```

## API

| 方法 | 路径 | 用途 | 权限 |
|---|---|---|---|
| `POST` | `/api/answers` | 提交一份匿名答案 | 公开 |
| `GET` | `/api/status` | 获取当前有效提交数量 | 公开 |
| `GET` | `/api/results` | 获取聚合结果和匿名文本 | 主持人口令 |
| `POST` | `/api/host/reset` | 清空当前活动答案 | 主持人口令 |

主持人口令通过 `X-Host-Passcode` 或 Bearer Authorization 发送。主持页只把口令保存在当前标签页的 `sessionStorage` 中。

## Cloudflare 部署

当前生产环境已经配置好 D1、定时任务和 `untold.ducenhan.com` 自定义域名。普通更新只需：

```powershell
npm run deploy
```

在新的 Cloudflare 账号或环境中首次部署时：

```powershell
npx wrangler login
npx wrangler d1 create church-untold
```

将命令返回的 `database_id` 写入 `wrangler.jsonc`，然后执行：

```powershell
npm run db:remote
npx wrangler secret put HOST_PASSCODE
npm run deploy
```

`HOST_PASSCODE` 必须通过 Cloudflare Secret 设置，不能写进 `wrangler.jsonc`、`.dev.vars.example` 或 Git。真实的 `.dev.vars`、`node_modules` 和 `.wrangler` 本地状态已被 `.gitignore` 排除。

若使用其他域名，请修改 `wrangler.jsonc` 中 `routes[].pattern`，并确保该域名已经加入同一个 Cloudflare 账号。

## 数据与隐私

D1 只保存以下信息：

- 随机 UUID
- 固定活动 ID
- 五题答案 JSON
- 创建时间与过期时间

每次 API 请求都会顺便清理过期数据，Cron Trigger 也会每小时执行一次清理。答题页使用 `localStorage` 防止普通用户在同一浏览器重复提交，但清除浏览器数据或使用无痕窗口仍可能再次提交；这对本次小型活动是可接受的限制。

所有用户文本均会被规范化、限制为最多 60 个 Unicode 字符，并按普通文本渲染。

## 现场使用

1. 在投影电脑打开主持页并输入主持人口令。
2. 先清空测试数据。
3. 让参与者扫描等待页上的 QR 码并提交答案。
4. 确认提交数量后开始逐题揭晓。
5. 使用页面按钮、左右方向键切题；空格键揭晓当前题。
6. 活动结束后可再次手动清空，未清空的数据也会在 24 小时后自动删除。

活动前应分别用现场 Wi-Fi 和不使用 VPN 的手机流量测试答题页、提交 API 和主持页。自定义域名改善了 `workers.dev` 在中国大陆的可访问性，但现场网络测试仍是最终依据。

## 活动结束后

源代码可以长期保留在本仓库。若不再提供线上互动：

1. 从 PNYL 主入口隐藏活动链接。
2. 确认答案已清空或等待 24 小时过期。
3. 删除 Cloudflare Worker 和 D1 数据库。

如果只想保留展示效果，应另做不连接 API 的只读归档页，避免留下一个无法提交的表单。
