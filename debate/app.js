import { TOPICS, ROLE_SETS } from "./topics.js";

const STORAGE_KEY = "pnyl-between-sides-v1";
const STAGES = [
  { label: "共同选题", hint: "大家口头商量后，由主持人选定今晚的问题。", time: "5 分钟" },
  { label: "输入名单", hint: "输入 6–8 人；下一步会随机分组。", time: "3 分钟" },
  { label: "分组与角色", hint: "这只是暂时代言任务，不代表任何人的真实立场。", time: "3 分钟" },
  { label: "小组准备", hint: "不用把所有问题答完；先让每个思考镜头都贡献一点。", time: "8–10 分钟" },
  { label: "双方分享", hint: "可以多人接力。目标是把这一边说得合理，不是把另一边说倒。", time: "每组约 4 分钟" },
  { label: "变量情境", hint: "每次只改变一个条件，看看原来的论点需要加上什么界线。", time: "10–12 分钟" },
  { label: "开放交流", hint: "阵营到这里结束。现在可以赞同、修正或重新组合任何观点。", time: "10 分钟" },
  { label: "全局总结", hint: "不是标准答案，而是一张帮助大家看见全局的地图。", time: "5 分钟" }
];

const defaultState = () => ({ stage: 0, topicId: null, names: [], teams: null, sideOrder: [0, 1], shareSide: 0, scenarioIndex: 0, versesOpen: false, swapPick: null });
let state = loadState();

const app = document.querySelector("#app");
const progressLabel = document.querySelector("#progressLabel");
const progressBar = document.querySelector("#progressBar");
const stageHint = document.querySelector("#stageHint");
const backButton = document.querySelector("#backButton");
const nextButton = document.querySelector("#nextButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const resetButton = document.querySelector("#resetButton");
const confirmDialog = document.querySelector("#confirmDialog");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaultState(), ...saved };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function selectedTopic() {
  return TOPICS.find(topic => topic.id === state.topicId) || null;
}

function shuffle(items) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function makeTeams() {
  const names = shuffle(state.names);
  const split = Math.ceil(names.length / 2);
  state.teams = [names.slice(0, split), names.slice(split)];
  state.sideOrder = Math.random() > 0.5 ? [0, 1] : [1, 0];
}

function rolesFor(team) {
  const roles = ROLE_SETS[team.length] || ROLE_SETS[4];
  return team.map((participant, index) => ({ participant, role: roles[index % roles.length].name, prompt: roles[index % roles.length].prompt }));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function head(kicker, title, lede, time = true) {
  return `<header class="stage-head"><div class="eyebrow mono">${kicker}</div><h1 class="serif">${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}${time ? `<span class="time-note">建议 ${STAGES[state.stage].time}</span>` : ""}</header>`;
}

function renderTopics() {
  app.innerHTML = `${head("CHOOSE ONE TENSION", "今晚，我们想把哪一个问题想得更明白？", "这里没有热门排名，也不用急着表态。先一起看看：哪一种张力最贴近我们现在的生活？")}
    <section class="topic-grid" aria-label="十个讨论主题">
      ${TOPICS.map((topic, index) => `<button class="topic-card ${state.topicId === topic.id ? "selected" : ""}" data-topic="${topic.id}" type="button" aria-pressed="${state.topicId === topic.id}"><div class="topic-index mono">${String(index + 1).padStart(2, "0")}</div><h2 class="serif">${topic.title}</h2><p>${topic.tension}</p></button>`).join("")}
    </section>`;
}

function renderNames() {
  const topic = selectedTopic();
  app.innerHTML = `${head("GATHER THE ROOM", "先把今晚在场的人放进来", `已选主题：${topic.title}`)}
    <div class="setup-grid">
      <section class="panel">
        <h2 class="serif">参与者名单</h2>
        <p class="quiet-note">输入 6–8 个名字。名单只保存在这台电脑，不会上传。</p>
        <form id="nameForm" class="name-form"><input id="nameInput" maxlength="20" autocomplete="off" placeholder="输入名字后按 Enter" aria-label="参与者名字"><button class="ink-button" type="submit">加入</button></form>
        <div class="count-status">现在有 <strong>${state.names.length}</strong> 人${state.names.length < 6 ? "，还需要至少 " + (6 - state.names.length) + " 人" : state.names.length > 8 ? "，请减少到 8 人" : "，可以继续"}。</div>
      </section>
      <section class="panel">
        <h2 class="serif">今晚在场</h2>
        <div class="name-list">${state.names.length ? state.names.map((name, index) => `<span class="name-chip">${escapeHTML(name)}<button type="button" data-remove-name="${index}" aria-label="移除 ${escapeHTML(name)}">×</button></span>`).join("") : `<div class="empty-box">名字会出现在这里</div>`}</div>
      </section>
    </div>`;
}

function renderTeams() {
  const topic = selectedTopic();
  app.innerHTML = `${head("TEMPORARY ADVOCACY", "认真替一个立场说话，但不必假装这就是你", "可以交换成员，让两组更平衡。思考镜头不是职位，只提醒每个人从不同角度贡献一点。")}
    <div class="principle-banner"><strong>先把真实倾向留在心里。</strong> 今晚分配的是一项理解任务，不是给任何人贴标签。</div>
    <section class="team-grid">
      ${state.teams.map((team, teamIndex) => {
        const side = topic.sides[state.sideOrder[teamIndex]];
        return `<article class="team-card"><header class="team-head"><div class="side-label mono">${teamIndex === 0 ? "TEAM A" : "TEAM B"}</div><h2 class="serif">${side.label}</h2><div class="team-side">${side.brief}</div></header><div class="member-list">${rolesFor(team).map((member, index) => { const picked = state.swapPick?.team === teamIndex && state.swapPick?.index === index; return `<div class="member-row ${picked ? "swap-picked" : ""}"><div><strong>${escapeHTML(member.participant)}</strong><div class="member-role">${member.role}</div></div><button class="move-button" data-swap="${teamIndex}:${index}" type="button">${picked ? "已选择，点另一组成员" : "选择交换"}</button></div><div class="role-prompt">${member.prompt}</div>`; }).join("")}</div></article>`;
      }).join("")}
    </section>`;
}

function renderPreparation() {
  const topic = selectedTopic();
  app.innerHTML = `${head("BUILD THE STRONGEST CASE", topic.title, "两组分开整理：为什么一个认真、善意的基督徒可能持有你们被分配的立场？")}
    <div class="principle-banner">不要急着反驳另一组。先把自己这一边说到让不认同的人也能承认：<strong>这确实有道理。</strong></div>
    <section class="side-grid">${state.teams.map((team, teamIndex) => { const side = topic.sides[state.sideOrder[teamIndex]]; return `<article class="side-card"><div class="side-label mono">${teamIndex === 0 ? "TEAM A" : "TEAM B"}</div><h2 class="serif">${side.label}</h2><p>${side.brief}</p><div class="name-list">${rolesFor(team).map(member => `<span class="name-chip">${escapeHTML(member.participant)} · ${member.role}</span>`).join("")}</div></article>`; }).join("")}</section>
    <div class="prompt-list"><div class="prompt-tile"><strong>这边保护什么？</strong>它最担心另一边失去什么重要价值？</div><div class="prompt-tile"><strong>现实中何时成立？</strong>想一个普通、可信的处境，不用找极端案例。</div><div class="prompt-tile"><strong>走太远会怎样？</strong>主动说出本方需要的条件与界线。</div></div>
    <section class="scripture-area"><button id="toggleVerses" class="soft-button" type="button" aria-expanded="${state.versesOpen}">${state.versesOpen ? "收起经文入口" : "需要一点提示？查看经文入口"}</button>${state.versesOpen ? `<div class="scripture-list">${topic.verses.map(verse => `<article class="scripture-card"><strong class="serif">${verse.ref}</strong><p>${verse.note}</p></article>`).join("")}</div>` : ""}</section>`;
}

function renderSharing() {
  const topic = selectedTopic();
  const teamIndex = state.shareSide;
  const side = topic.sides[state.sideOrder[teamIndex]];
  app.innerHTML = `${head("LISTEN FOR THE VALUE", "双方分享", "可以多人接力。听的时候先找这边保护的价值，不需要立即回应。")}
    <section class="share-focus"><div><div class="eyebrow mono">现在分享 · ${teamIndex === 0 ? "TEAM A" : "TEAM B"}</div><h2 class="serif">${side.label}</h2><p>${side.brief}</p><div class="name-list" style="justify-content:center">${state.teams[teamIndex].map(name => `<span class="name-chip">${escapeHTML(name)}</span>`).join("")}</div><div class="share-switch"><button class="soft-button" data-share="0" type="button" ${teamIndex === 0 ? "disabled" : ""}>A 组分享</button><button class="soft-button" data-share="1" type="button" ${teamIndex === 1 ? "disabled" : ""}>B 组分享</button></div></div></section>`;
}

function renderScenarios() {
  const topic = selectedTopic();
  const scenario = topic.scenarios[state.scenarioIndex];
  app.innerHTML = `${head("CHANGE ONE THING", "如果只改变一个条件呢？", "每揭示一张卡，两组先短聊：原来的立场需要增加什么条件、例外或界线？")}
    <section class="scenario-stage"><nav class="scenario-nav" aria-label="情境变量">${topic.scenarios.map((item, index) => `<button class="scenario-tab ${index === state.scenarioIndex ? "active" : ""}" data-scenario="${index}" type="button"><span class="mono">0${index + 1}</span> · 改变${item.changed}</button>`).join("")}</nav><article class="scenario-card" key="${state.scenarioIndex}"><div class="scenario-changed mono">ONLY ONE VARIABLE · ${scenario.changed}</div><h2 class="serif">${scenario.text}</h2><div class="scenario-question">两组各自判断：你们原来的论点是否需要增加一个条件？为什么？</div></article></section>`;
}

function renderDiscussion() {
  const topic = selectedTopic();
  app.innerHTML = `${head("NO MORE SIDES", "现在，阵营结束", `回到今晚的问题：${topic.title}`)}
    <div class="principle-banner">这里可以赞同、修正或重新组合任何观点。没有人需要说明自己一开始站哪边。</div>
    <section class="discussion-grid"><article class="question-block"><span class="mono">01 · WHAT MOVED?</span><h2 class="serif">哪个变量最容易改变我们的判断？它暴露了什么原则？</h2></article><article class="question-block"><span class="mono">02 · WHAT IS FEARED?</span><h2 class="serif">两边各自最害怕失去的东西是什么？这种担心合理在哪里？</h2></article><article class="question-block"><span class="mono">03 · WHAT REMAINS?</span><h2 class="serif">无论处境怎样变化，有什么价值或界线始终不能牺牲？</h2></article></section>
    <aside class="safety-note"><strong>主持提醒：</strong>${topic.safety}</aside>`;
}

function renderSummary() {
  const topic = selectedTopic();
  const summary = topic.summary;
  app.innerHTML = `${head("A MAP, NOT A VERDICT", "把全局摊开来看", "以下不是标准答案，而是把讨论中常见的基督徒思路放在同一张地图上。", false)}
    <section class="summary-section"><h2 class="serif">共同问题</h2><div class="summary-card summary-wide"><p>${summary.common}</p></div></section>
    <section class="summary-grid summary-section"><article class="summary-card"><h3 class="serif">两边最强的提醒</h3><ul>${summary.strengths.map(item => `<li>${item}</li>`).join("")}</ul></article><article class="summary-card"><h3 class="serif">两边都可能走过头</h3><ul>${summary.extremes.map(item => `<li>${item}</li>`).join("")}</ul></article><article class="summary-card"><h3 class="serif">真正改变判断的变量</h3><p>${summary.variables}</p></article><article class="summary-card"><h3 class="serif">可能的整合方向</h3><p>${summary.integration}</p></article><article class="summary-card summary-wide"><h3 class="serif">仍然没有被简单消除的张力</h3><p>${summary.unresolved}</p></article></section>
    <section class="summary-section"><h2 class="serif">回到经文</h2><div class="scripture-list">${topic.verses.map(verse => `<article class="scripture-card"><strong class="serif">${verse.ref}</strong><p>${verse.note}</p></article>`).join("")}</div></section>
    <section class="summary-section"><h2 class="serif">延伸来源</h2><div class="source-list">${topic.sources.map(source => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label} ↗</a>`).join("")}</div></section>
    <aside class="safety-note"><strong>最后提醒：</strong>${topic.safety}</aside>`;
}

function render() {
  if (state.stage > 0 && !selectedTopic()) state.stage = 0;
  if (state.stage > 1 && (!state.teams || state.names.length < 6 || state.names.length > 8)) state.stage = 1;
  [renderTopics, renderNames, renderTeams, renderPreparation, renderSharing, renderScenarios, renderDiscussion, renderSummary][state.stage]();
  const info = STAGES[state.stage];
  progressLabel.textContent = `${String(state.stage + 1).padStart(2, "0")} / 08 · ${info.label}`;
  progressBar.style.width = `${((state.stage + 1) / STAGES.length) * 100}%`;
  stageHint.textContent = info.hint;
  backButton.disabled = state.stage === 0;
  nextButton.hidden = state.stage === STAGES.length - 1;
  nextButton.disabled = (state.stage === 0 && !state.topicId) || (state.stage === 1 && (state.names.length < 6 || state.names.length > 8));
  nextButton.textContent = state.stage === 6 ? "查看全局总结 →" : "下一步 →";
  saveState();
  app.focus({ preventScroll: true });
}

app.addEventListener("click", event => {
  const topicButton = event.target.closest("[data-topic]");
  if (topicButton) { state.topicId = topicButton.dataset.topic; state.teams = null; render(); return; }
  const removeButton = event.target.closest("[data-remove-name]");
  if (removeButton) { state.names.splice(Number(removeButton.dataset.removeName), 1); state.teams = null; render(); return; }
  const swapButton = event.target.closest("[data-swap]");
  if (swapButton) {
    const [team, index] = swapButton.dataset.swap.split(":").map(Number);
    if (!state.swapPick || state.swapPick.team === team) {
      state.swapPick = { team, index };
    } else {
      const first = state.swapPick;
      [state.teams[first.team][first.index], state.teams[team][index]] = [state.teams[team][index], state.teams[first.team][first.index]];
      state.swapPick = null;
    }
    render(); return;
  }
  const shareButton = event.target.closest("[data-share]");
  if (shareButton) { state.shareSide = Number(shareButton.dataset.share); render(); return; }
  const scenarioButton = event.target.closest("[data-scenario]");
  if (scenarioButton) { state.scenarioIndex = Number(scenarioButton.dataset.scenario); render(); return; }
  if (event.target.closest("#toggleVerses")) { state.versesOpen = !state.versesOpen; render(); }
});

app.addEventListener("submit", event => {
  if (event.target.id !== "nameForm") return;
  event.preventDefault();
  const input = event.target.querySelector("#nameInput");
  const name = input.value.trim();
  if (!name || state.names.length >= 8 || state.names.some(item => item.toLowerCase() === name.toLowerCase())) return;
  state.names.push(name); state.teams = null; render();
  requestAnimationFrame(() => document.querySelector("#nameInput")?.focus());
});

backButton.addEventListener("click", () => { if (state.stage > 0) { state.stage -= 1; render(); } });
nextButton.addEventListener("click", () => {
  if (state.stage === 0 && !state.topicId) return;
  if (state.stage === 1) {
    if (state.names.length < 6 || state.names.length > 8) return;
    makeTeams();
  }
  if (state.stage < STAGES.length - 1) { state.stage += 1; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch { /* Fullscreen is optional. */ }
});
document.addEventListener("fullscreenchange", () => { fullscreenButton.textContent = document.fullscreenElement ? "退出全屏" : "全屏"; });

resetButton.addEventListener("click", () => { confirmDialog.hidden = false; document.querySelector("#cancelReset").focus(); });
document.querySelector("#cancelReset").addEventListener("click", () => { confirmDialog.hidden = true; });
document.querySelector("#confirmReset").addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); state = defaultState(); confirmDialog.hidden = true; render(); });
confirmDialog.addEventListener("click", event => { if (event.target === confirmDialog) confirmDialog.hidden = true; });

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !confirmDialog.hidden) { confirmDialog.hidden = true; return; }
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowLeft" && !backButton.disabled) backButton.click();
  if (event.key === "ArrowRight" && !nextButton.hidden && !nextButton.disabled) nextButton.click();
});

render();
