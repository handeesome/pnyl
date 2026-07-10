# pnyl sharing pages

这个项目放了一些给 PNYL 分享和活动使用的个人小网页。整体都比较轻量，主要是为了现场带活动、做互动、展示内容时方便打开使用。

## 访问链接

- 主入口：https://pnyl.netlify.app/
- 愛之語線上測驗：https://pnyl.netlify.app/5lovelanguages/
- 教会团契大富翁：https://pnyl.netlify.app/monopoly/
- 认识团契的弟兄姊妹：https://pnyl.netlify.app/jeopardy/
- 教会匿名互动墙：https://untold.ducenhan.com/answer

## 文件夹说明

### `5lovelanguages/`

愛之語線上測驗页面。主题是五种爱的语言，通过问卷和结果图表帮助参与者了解自己更容易接收和表达爱的方式。里面包含页面本体、图片资源，以及本地引用的 Vue、Chart.js 和 Bootstrap 文件。

### `monopoly/`

教会团契大富翁页面。主题是信仰成长、团契生活和互动任务，包含玩家注册、主持人控制台、玩家提交内容、题目/事件内容，以及一个 `大富翁.xlsx` 辅助文件。`leancloud-init-fixed.html` 是相关数据表初始化工具。

公开版默认使用本地模式，数据只保存在当前浏览器的 `localStorage`。多人同步是主动关闭的，因为公开仓库不内置 LeanCloud 配置；如果临时需要云端同步，可以打开 `monopoly/?setupLeanCloud=1` 在当前浏览器里填写自己的 LeanCloud App ID、App Key 和 Server URL。

### `jeopardy/`

认识团契弟兄姊妹的 Jeopardy/破冰活动页面。主题是通过 M&M 问题、随机座位、分组、翻卡题库和计分，帮助大家更自然地认识彼此。题库和页面内容已经拆在 `content/` 里，样式和逻辑分别放在 `assets/css/` 和 `assets/js/`。

### `church-untold/`

“教会里那些大家都懂，但平常不太讲的事”匿名互动页面。源代码保留在本仓库，正式活动由 Cloudflare Workers Static Assets + D1 提供 `/answer` 手机答题、`/host` 投影揭晓和 24 小时匿名数据清理。主入口页链接到独立的 Cloudflare 活动网址。

这是一次性活动。结束后可先从主入口隐藏活动链接，待答案过期后删除 Cloudflare Worker 与 D1；仓库中的源代码不会受影响。若仍要在 Netlify 上公开保留，应另做只读归档页，而不是保留无法连接 API 的答题表单。

## 其他文件

- `index.html`：简单入口页面，链接到几个活动小网页。
- `README.md`：这个总览文件。


