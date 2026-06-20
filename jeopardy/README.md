# 认识团契的弟兄姊妹

一个无构建、无外部依赖的静态团契破冰活动页面。直接打开 `index.html` 就可以运行。

## 文件结构

```text
index.html
assets/
  css/
    styles.css
  js/
    app.js
content/
  site-content.js
  jeopardy-content.js
```

- `index.html`：页面入口，只负责加载样式、内容配置和应用逻辑。
- `assets/css/styles.css`：视觉主题、布局、卡片、弹窗、Jeopardy 棋盘等样式。
- `assets/js/app.js`：状态保存、随机分组、座位分配、计分、翻卡、计时和页面渲染逻辑。
- `content/site-content.js`：站点标题、导航、首页主题、游戏一文案和 M&M 问题。
- `content/jeopardy-content.js`：Jeopardy 类别规则、分值和所有题目。

## 替换活动内容

改首页主题：编辑 `content/site-content.js` 里的 `site` 和 `home`。

改游戏一：编辑 `content/site-content.js` 里的 `gameOne.rules`。每个颜色规则格式如下：

```js
{ color: "红色", hex: "#b94b3f", prompt: "这周一个开心瞬间" }
```

改 Jeopardy 题库：编辑 `content/jeopardy-content.js`。

- `values` 控制棋盘分值。
- `categoryRules` 控制点击类别后看到的规则说明。
- `board` 控制每个类别、每个分值下的题目。
- 普通题目用字符串。
- 禁词描述题用 `{ text, forbidden }`。
- 两队共同题在对应类别里加 `sharedValues: [500]`。

## 运行和发布

本地直接双击或用浏览器打开 `index.html`。也可以把整个文件夹上传到 Netlify、Vercel 或任意静态站点服务，发布根目录即可。

活动数据保存在当前浏览器的 `localStorage` 中，key 是：

```text
fellowship-jeopardy-state:v1
```

刷新页面会恢复人员、座位、队伍、分数和 Jeopardy 翻卡进度。换浏览器或换设备不会自动同步。右上角“重置整场”会清空本机保存的数据。
