import { TOPICS, PARTICIPATION_TASKS } from "./topics.js";

const STORAGE_KEY = "pnyl-between-sides-v2";
const STAGES = [
  { label: "共同选题", hint: "先选一个今晚真的想聊的问题。", time: "5 分钟" },
  { label: "输入名单", hint: "至少 2 人；名单只用来随机发一张小任务。", time: "3 分钟" },
  { label: "案例和任务", hint: "所有人讨论同一个虚构案例；任务可以随时换。", time: "3–5 分钟" },
  { label: "第一轮讨论", hint: "只说自己真实的判断，不需要替任何一边说话。", time: "10–12 分钟" },
  { label: "情况变化", hint: "每次只增加一个新事实，看看判断有没有改变。", time: "10–12 分钟" },
  { label: "回到经文", hint: "经文不是用来压过别人，而是肯定和修正刚才的想法。", time: "10 分钟" },
  { label: "最后整理", hint: "不用达成一致，只看见两种常见考虑。", time: "5 分钟" }
];

const defaultState = () => ({
  stage: 0,
  topicId: null,
  names: [],
  taskAssignments: [],
  changeIndex: 0
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
    <div class="case-question"><strong>一起回答：</strong>${topic.caseStudy.question}</div>
  </article>`;
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
  app.innerHTML = `${head("CHOOSE A QUESTION", "今晚想聊哪一个两难？", "题目里有两股真实拉力，但今晚不分队。每个人都只说自己真正怎么想。")}
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
        <p class="quiet-note">至少输入 2 个名字。下一步会为每个人随机发一张很小的参与任务；任务不代表立场，也可以随时换。</p>
        <form id="nameForm" class="name-form"><input id="nameInput" maxlength="20" autocomplete="off" placeholder="输入名字后按 Enter" aria-label="参与者名字"><button class="ink-button" type="submit">加入名单</button></form>
        <div class="count-status">现在有 <strong>${state.names.length}</strong> 人${state.names.length < 2 ? "，还需要至少 " + (2 - state.names.length) + " 人" : "，可以继续"}。</div>
      </section>
      <section class="panel">
        <h2 class="serif">今晚在场</h2>
        <div class="name-list">${state.names.length ? state.names.map((name, index) => `<span class="name-chip">${escapeHTML(name)}<button type="button" data-remove-name="${index}" aria-label="移除 ${escapeHTML(name)}">×</button></span>`).join("") : `<div class="empty-box">名字会出现在这里</div>`}</div>
      </section>
    </div>`;
}

function renderCaseAndTasks() {
  const topic = selectedTopic();
  app.innerHTML = `${head("ONE CASE, MANY ANSWERS", "先认识同一个案例", "案例是虚构的。你可以只谈案例，不需要分享自己的类似经历。")}
    ${caseBlock(topic)}
    <section class="task-section">
      <div class="section-heading"><div><div class="eyebrow mono">ONE SMALL PART</div><h2 class="serif">每个人只拿一个小任务</h2></div><p>任务只要求一句话，可以在任何时候完成；不规定发言顺序。觉得不合适就换一张。</p></div>
      ${taskCards()}
    </section>
    ${topic.safety ? `<aside class="safety-note"><strong>主持提醒：</strong>${topic.safety}</aside>` : ""}`;
}

function renderFirstDiscussion() {
  const topic = selectedTopic();
  app.innerHTML = `${head("YOUR REAL VIEW", "第一轮：只说自己怎么想", "不需要让两边人数一样，也不用替现场没人赞成的观点说话。")}
    <div class="principle-banner"><strong>从案例开始：</strong>说出你认为下一步该做什么，以及最重要的一个理由。</div>
    ${caseBlock(topic, true)}
    <section class="task-reminder"><h2 class="serif">今晚的小任务</h2>${taskRoster()}</section>`;
}

function renderChanges() {
  const topic = selectedTopic();
  const change = topic.changes[state.changeIndex];
  app.innerHTML = `${head("CHANGE ONE THING", "如果情况有了变化", "这不是额外挑战。我们只给同一个案例增加一个新事实。")}
    <section class="scenario-stage">
      <nav class="scenario-nav" aria-label="情况变化">${topic.changes.map((item, index) => `<button class="scenario-tab ${index === state.changeIndex ? "active" : ""}" data-change="${index}" type="button"><span class="mono">0${index + 1}</span> · ${item.label}</button>`).join("")}</nav>
      <article class="scenario-card">
        <div class="scenario-changed mono">现在只增加 · ${change.label}</div>
        <h2 class="serif">${change.text}</h2>
        <div class="scenario-question"><strong>再想一次：</strong><br>知道这个变化后，你的判断变了吗？为什么？</div>
      </article>
    </section>`;
}

function renderScripture() {
  const topic = selectedTopic();
  app.innerHTML = `${head("READ AFTER LISTENING", "现在回到经文", "先听过彼此的真实想法，再让经文拓宽、肯定或修正我们的判断。")}
    <div class="principle-banner"><strong>读完每段都问：</strong>它肯定了刚才的哪一点？又可能纠正哪一点？</div>
    <section class="scripture-list">${topic.verses.map(verse => `<article class="scripture-card"><strong class="serif">${verse.ref}</strong><p>${verse.note}</p></article>`).join("")}</section>
    <section class="task-reminder"><h2 class="serif">任务提醒</h2>${taskRoster()}</section>`;
}

function renderSummary() {
  const topic = selectedTopic();
  app.innerHTML = `${head("TWO THINGS TO HOLD", "最后看见两种常见考虑", "这不是标准答案，也不要求大家最后选同一边。", false)}
    <section class="consideration-grid">${topic.considerations.map((item, index) => `<article class="consideration-card consideration-${index + 1}"><div class="side-label mono">${index === 0 ? "ONE CONSIDERATION" : "ANOTHER CONSIDERATION"}</div><h2 class="serif">${item.label}</h2><p>${item.text}</p></article>`).join("")}</section>`;
}

const RENDERERS = [renderTopics, renderNames, renderCaseAndTasks, renderFirstDiscussion, renderChanges, renderScripture, renderSummary];

function render() {
  if (!Number.isInteger(state.stage) || state.stage < 0 || state.stage >= STAGES.length) state.stage = 0;
  if (state.stage > 0 && !selectedTopic()) state.stage = 0;
  if (state.stage > 1 && state.names.length < 2) state.stage = 1;
  if (state.stage > 1 && !assignmentsMatchNames()) assignTasks();
  const topic = selectedTopic();
  if (!Number.isInteger(state.changeIndex) || state.changeIndex < 0 || (topic && state.changeIndex >= topic.changes.length)) state.changeIndex = 0;

  RENDERERS[state.stage]();
  const info = STAGES[state.stage];
  progressLabel.textContent = `${String(state.stage + 1).padStart(2, "0")} / ${String(STAGES.length).padStart(2, "0")} · ${info.label}`;
  progressBar.style.width = `${((state.stage + 1) / STAGES.length) * 100}%`;
  stageHint.textContent = info.hint;
  backButton.disabled = state.stage === 0;
  nextButton.hidden = state.stage === STAGES.length - 1;
  nextButton.disabled = (state.stage === 0 && !state.topicId) || (state.stage === 1 && state.names.length < 2);
  nextButton.textContent = ["下一步 →", "发任务 →", "开始讨论 →", "看看情况变化 →", "一起读经文 →", "最后整理 →"][state.stage] || "下一步 →";
  saveState();
}

app.addEventListener("click", event => {
  const topicButton = event.target.closest("[data-topic]");
  if (topicButton) {
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
