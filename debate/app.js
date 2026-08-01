import { TOPICS, PARTICIPATION_TASKS } from "./topics.js";

const STORAGE_KEY = "pnyl-between-sides-v3";
const STAGES = [
  { label: "共同选题", hint: "每题都有明确的 A、B 两方。", time: "5 分钟" },
  { label: "输入名单", hint: "至少 2 人；名单只用来随机发一张小任务。", time: "3 分钟" },
  { label: "自由选边", hint: "选你真正支持的一方；任务可以随时换。", time: "3–5 分钟" },
  { label: "双方陈述", hint: "围绕所选立场给理由，不另开新题。", time: "10–12 分钟" },
  { label: "回应或案例", hint: "先回应另一方；需要时再显示具体案例。", time: "10–12 分钟" },
  { label: "回到经文", hint: "看经文分别支持或提醒了哪一方。", time: "10 分钟" },
  { label: "最后看两边", hint: "不用达成一致，只把双方立场看清楚。", time: "5 分钟" }
];

const defaultState = () => ({
  stage: 0,
  topicId: null,
  names: [],
  taskAssignments: [],
  changeIndex: 0,
  caseRevealed: false
});

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

function assignTasks() {
  const taskIds = PARTICIPATION_TASKS.map(task => task.id);
  const deck = [];
  while (deck.length < state.names.length) deck.push(...shuffle(taskIds));
  state.taskAssignments = state.names.map((name, index) => ({ name, taskId: deck[index] }));
}

function taskById(taskId) {
  return PARTICIPATION_TASKS.find(task => task.id === taskId) || PARTICIPATION_TASKS[0];
}

function assignmentsMatchNames() {
  return state.taskAssignments.length === state.names.length && state.taskAssignments.every((assignment, index) =>
    assignment.name === state.names[index] && PARTICIPATION_TASKS.some(task => task.id === assignment.taskId)
  );
}

function rerollTask(index) {
  const assignment = state.taskAssignments[index];
  if (!assignment) return;
  const choices = PARTICIPATION_TASKS.filter(task => task.id !== assignment.taskId);
  assignment.taskId = choices[Math.floor(Math.random() * choices.length)].id;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function head(kicker, title, lede, time = true) {
  return `<header class="stage-head"><div class="eyebrow mono">${kicker}</div><h1 class="serif">${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}${time ? `<span class="time-note">建议 ${STAGES[state.stage].time}</span>` : ""}</header>`;
}

function caseBlock(topic, compact = false) {
  return `<article class="case-card ${compact ? "case-card-compact" : ""}">
    <div class="case-kicker mono">共同案例 · ${topic.shortTitle}</div>
    <h2 class="serif">${topic.caseStudy.title}</h2>
    <p class="case-text">${topic.caseStudy.text}</p>
    <div class="case-question"><strong>围绕案例辩论：</strong>${topic.caseStudy.question} 请用案例中的事实说明理由。</div>
  </article>`;
}

function sideBoard(topic, compact = false) {
  return `<section class="side-grid ${compact ? "side-grid-compact" : ""}" aria-label="本题的两个立场">
    ${topic.tension.map((position, index) => {
      const detail = topic.considerations[index];
      return `<article class="side-card side-${index + 1}">
        <div class="side-tag mono">${index === 0 ? "A 方支持" : "B 方支持"}</div>
        <h2 class="serif">${position}</h2>
        <h3>${detail.label}</h3>
        <p>${detail.text}</p>
      </article>`;
    }).join("")}
  </section>`;
}

function optionalCase(topic, compact = false) {
  return `<section class="optional-case">
    <div class="optional-case-head">
      <div>
        <div class="eyebrow mono">OPTIONAL CASE</div>
        <h2 class="serif">需要一个具体例子吗？</h2>
        <p>如果题目已经够清楚，可以不用案例；觉得太抽象时再打开。</p>
      </div>
      <button class="soft-button case-toggle" data-toggle-case type="button" aria-expanded="${state.caseRevealed}" aria-controls="optionalCasePanel">${state.caseRevealed ? "收起具体案例" : "显示具体案例"}</button>
    </div>
    ${state.caseRevealed ? `<div id="optionalCasePanel">${caseBlock(topic, compact)}</div>` : ""}
  </section>`;
}

function taskCards() {
  return `<section class="task-grid" aria-label="随机参与任务">${state.taskAssignments.map((assignment, index) => {
    const task = taskById(assignment.taskId);
    return `<article class="task-card">
      <div class="task-card-head"><strong>${escapeHTML(assignment.name)}</strong><button class="reroll-button" data-reroll-task="${index}" type="button" aria-label="为 ${escapeHTML(assignment.name)} 换一张任务">换一张</button></div>
      <div class="task-name">${task.name}</div>
      <p>${task.prompt}</p>
    </article>`;
  }).join("")}</section>`;
}

function taskRoster() {
  return `<div class="task-roster" aria-label="参与任务提醒">${state.taskAssignments.map(assignment => {
    const task = taskById(assignment.taskId);
    return `<span class="name-chip">${escapeHTML(assignment.name)} · ${task.name}</span>`;
  }).join("")}</div>`;
}

function renderTopics() {
  app.innerHTML = `${head("CHOOSE A QUESTION", "今晚想辩哪一个两难？", "每题都有明确的 A、B 两方。选一个两边都有人可能真心支持的问题。")}
    <section class="topic-grid" aria-label="十个讨论主题">
      ${TOPICS.map((topic, index) => `<button class="topic-card ${state.topicId === topic.id ? "selected" : ""}" data-topic="${topic.id}" type="button" aria-pressed="${state.topicId === topic.id}"><div class="topic-index mono">${String(index + 1).padStart(2, "0")}</div><h2 class="serif">${topic.title}</h2><p>${topic.tension.join(" / ")}</p></button>`).join("")}
    </section>`;
}

function renderNames() {
  const topic = selectedTopic();
  app.innerHTML = `${head("WHO IS HERE", "输入今晚参加的人", `今晚讨论：${topic.title}`)}
    <div class="setup-grid">
      <section class="panel">
        <h2 class="serif">参与者名单</h2>
        <p class="quiet-note">至少输入 2 个名字。下一步每个人自由选边，再随机领取一个围绕立场发言的小任务；任务可以随时换。</p>
        <form id="nameForm" class="name-form"><input id="nameInput" maxlength="20" autocomplete="off" placeholder="输入名字后按 Enter" aria-label="参与者名字"><button class="ink-button" type="submit">加入名单</button></form>
        <div class="count-status">现在有 <strong>${state.names.length}</strong> 人${state.names.length < 2 ? "，还需要至少 " + (2 - state.names.length) + " 人" : "，可以继续"}。</div>
      </section>
      <section class="panel">
        <h2 class="serif">今晚在场</h2>
        <div class="name-list">${state.names.length ? state.names.map((name, index) => `<span class="name-chip">${escapeHTML(name)}<button type="button" data-remove-name="${index}" aria-label="移除 ${escapeHTML(name)}">×</button></span>`).join("") : `<div class="empty-box">名字会出现在这里</div>`}</div>
      </section>
    </div>`;
}

function renderSidesAndTasks() {
  const topic = selectedTopic();
  app.innerHTML = `${head("CHOOSE YOUR SIDE", "先选择你真正支持的一方", "不随机分立场。看完两方后，每个人选择自己此刻更支持的一边。")}
    <div class="principle-banner"><strong>怎么选边：</strong>人数不用平均，一边暂时没人也没关系；不要派人假装支持。讨论中可以随时换边。</div>
    ${sideBoard(topic)}
    ${optionalCase(topic)}
    <section class="task-section">
      <div class="section-heading"><div><div class="eyebrow mono">ONE SMALL PART</div><h2 class="serif">每个人拿一个发言任务</h2></div><p>任务只要求一个具体动作，不规定发言顺序。任务不适合就换一张，不需要解释。</p></div>
      ${taskCards()}
    </section>
    ${topic.safety ? `<aside class="safety-note"><strong>主持提醒：</strong>${topic.safety}</aside>` : ""}`;
}

function renderFirstDiscussion() {
  const topic = selectedTopic();
  app.innerHTML = `${head("ARGUE YOUR SIDE", "第一轮：为你选的一方说明理由", "A 方和 B 方轮流发言。每次只讲一个与本方主张直接有关的理由。")}
    <div class="principle-banner"><strong>发言格式：</strong>先说“我站 A／B 方”，再给一个理由。回应时，先指出你在回应对方的哪一条理由。</div>
    ${sideBoard(topic, true)}
    ${optionalCase(topic, true)}
    <section class="task-reminder"><h2 class="serif">今晚的小任务</h2>${taskRoster()}</section>`;
}

function renderChanges() {
  const topic = selectedTopic();
  const change = topic.changes[state.changeIndex];
  app.innerHTML = `${head("RESPOND OR TEST", "第二轮：回应，或者用案例检验", "先直接回应另一方刚才的理由。题目太抽象时，再显示具体案例。")}
    ${sideBoard(topic, true)}
    ${optionalCase(topic, true)}
    ${state.caseRevealed ? `<section class="scenario-section">
      <div class="section-heading"><div><div class="eyebrow mono">CHANGE ONE FACT</div><h2 class="serif">再改变一个事实</h2></div><p>每次只看一个变化，不把三个变化混在一起。</p></div>
      <section class="scenario-stage">
        <nav class="scenario-nav" aria-label="情况变化">${topic.changes.map((item, index) => `<button class="scenario-tab ${index === state.changeIndex ? "active" : ""}" data-change="${index}" type="button"><span class="mono">0${index + 1}</span> · ${item.label}</button>`).join("")}</nav>
        <article class="scenario-card">
          <div class="scenario-changed mono">现在只增加 · ${change.label}</div>
          <h2 class="serif">${change.text}</h2>
          <div class="scenario-question"><strong>再站一次：</strong><br>知道这个变化后，你还站原来一方吗？请说清它怎样影响 A 方或 B 方的理由。</div>
        </article>
      </section>
    </section>` : `<div class="case-closed-note"><strong>不用案例时：</strong>每方选出另一方最有力的一条理由，然后直接回应。不要另开新的话题。</div>`}
    <section class="task-reminder"><h2 class="serif">任务提醒</h2>${taskRoster()}</section>`;
}

function renderScripture() {
  const topic = selectedTopic();
  app.innerHTML = `${head("READ AFTER DEBATING", "现在回到经文", "先听完双方，再看经文怎样支持、限制或修正两边的理由。")}
    <div class="principle-banner"><strong>读完每段都问：</strong>它支持了哪一方的什么理由？又提醒那一方不能把什么说得太绝对？</div>
    <section class="scripture-list">${topic.verses.map(verse => `<article class="scripture-card"><strong class="serif">${verse.ref}</strong><p>${verse.note}</p></article>`).join("")}</section>
    <section class="task-reminder"><h2 class="serif">任务提醒</h2>${taskRoster()}</section>`;
}

function renderSummary() {
  const topic = selectedTopic();
  app.innerHTML = `${head("TWO CLEAR SIDES", "最后把两边放在一起", "这不是标准答案，也不要求大家最后选同一边。只确认双方真正主张什么。", false)}
    ${sideBoard(topic)}`;
}

const RENDERERS = [renderTopics, renderNames, renderSidesAndTasks, renderFirstDiscussion, renderChanges, renderScripture, renderSummary];

function render() {
  if (!Number.isInteger(state.stage) || state.stage < 0 || state.stage >= STAGES.length) state.stage = 0;
  if (state.stage > 0 && !selectedTopic()) state.stage = 0;
  if (state.stage > 1 && state.names.length < 2) state.stage = 1;
  if (state.stage > 1 && !assignmentsMatchNames()) assignTasks();
  const topic = selectedTopic();
  if (!Number.isInteger(state.changeIndex) || state.changeIndex < 0 || (topic && state.changeIndex >= topic.changes.length)) state.changeIndex = 0;
  if (typeof state.caseRevealed !== "boolean") state.caseRevealed = false;

  RENDERERS[state.stage]();
  const info = STAGES[state.stage];
  progressLabel.textContent = `${String(state.stage + 1).padStart(2, "0")} / ${String(STAGES.length).padStart(2, "0")} · ${info.label}`;
  progressBar.style.width = `${((state.stage + 1) / STAGES.length) * 100}%`;
  stageHint.textContent = info.hint;
  backButton.disabled = state.stage === 0;
  nextButton.hidden = state.stage === STAGES.length - 1;
  nextButton.disabled = (state.stage === 0 && !state.topicId) || (state.stage === 1 && state.names.length < 2);
  nextButton.textContent = ["输入名单 →", "自由选边 →", "开始辩论 →", "双方回应 →", "一起读经文 →", "最后看两边 →"][state.stage] || "下一步 →";
  saveState();
}

app.addEventListener("click", event => {
  const topicButton = event.target.closest("[data-topic]");
  if (topicButton) {
    if (state.topicId !== topicButton.dataset.topic) state.caseRevealed = false;
    state.topicId = topicButton.dataset.topic;
    state.changeIndex = 0;
    render();
    return;
  }

  const removeButton = event.target.closest("[data-remove-name]");
  if (removeButton) {
    state.names.splice(Number(removeButton.dataset.removeName), 1);
    state.taskAssignments = [];
    render();
    return;
  }

  const rerollButton = event.target.closest("[data-reroll-task]");
  if (rerollButton) {
    rerollTask(Number(rerollButton.dataset.rerollTask));
    render();
    return;
  }

  const caseButton = event.target.closest("[data-toggle-case]");
  if (caseButton) {
    state.caseRevealed = !state.caseRevealed;
    render();
    return;
  }

  const changeButton = event.target.closest("[data-change]");
  if (changeButton) {
    state.changeIndex = Number(changeButton.dataset.change);
    render();
  }
});

app.addEventListener("submit", event => {
  if (event.target.id !== "nameForm") return;
  event.preventDefault();
  const input = event.target.querySelector("#nameInput");
  const name = input.value.trim();
  if (!name || state.names.some(item => item.toLowerCase() === name.toLowerCase())) return;
  state.names.push(name);
  state.taskAssignments = [];
  render();
  requestAnimationFrame(() => document.querySelector("#nameInput")?.focus());
});

backButton.addEventListener("click", () => {
  if (state.stage > 0) {
    state.stage -= 1;
    render();
  }
});

nextButton.addEventListener("click", () => {
  if (state.stage === 0 && !state.topicId) return;
  if (state.stage === 1) {
    if (state.names.length < 2) return;
    if (!assignmentsMatchNames()) assignTasks();
  }
  if (state.stage < STAGES.length - 1) {
    state.stage += 1;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch { /* Fullscreen is optional. */ }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
});

resetButton.addEventListener("click", () => {
  confirmDialog.hidden = false;
  document.querySelector("#cancelReset").focus();
});

document.querySelector("#cancelReset").addEventListener("click", () => {
  confirmDialog.hidden = true;
});

document.querySelector("#confirmReset").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  confirmDialog.hidden = true;
  render();
});

confirmDialog.addEventListener("click", event => {
  if (event.target === confirmDialog) confirmDialog.hidden = true;
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !confirmDialog.hidden) {
    confirmDialog.hidden = true;
    return;
  }
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowLeft" && !backButton.disabled) backButton.click();
  if (event.key === "ArrowRight" && !nextButton.hidden && !nextButton.disabled) nextButton.click();
});

render();
