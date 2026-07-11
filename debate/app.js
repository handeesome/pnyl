import { TOPICS, ROLE_SETS } from "./topics.js";

const STORAGE_KEY = "pnyl-between-sides-v1";
const STAGES = [
  { label: "共同选题", hint: "大家口头商量后，由主持人选定今晚的问题。", time: "5 分钟" },
  { label: "输入名单", hint: "至少 2 人即可开始；下一步会随机分成两组。", time: "3 分钟" },
  { label: "分组和分工", hint: "你只是暂时帮这一边说话，不代表你本人赞同。", time: "3 分钟" },
  { label: "分组准备", hint: "不用面面俱到。每个人完成自己的小任务就好。", time: "8–10 分钟" },
  { label: "两组分享", hint: "可以轮流补充。把自己这边说清楚就好，不用驳倒对方。", time: "每组约 4 分钟" },
  { label: "情境变化", hint: "每次只改变一件事：你们还坚持刚才的说法，还是需要承认一个例外？", time: "10–12 分钟" },
  { label: "一起聊聊", hint: "分组到这里结束。现在可以说回自己的想法。", time: "10 分钟" },
  { label: "最后梳理", hint: "这里没有标准答案，只是把刚才谈到的重点收在一起。", time: "5 分钟" }
];

const defaultState = () => ({ stage: 0, topicId: null, names: [], teams: null, sideOrder: [0, 1], shareSide: 0, scenarioIndex: 0, versesOpen: false, swapPick: null });
let state = loadState();
if (state.stage === 0) state.topicId = null;

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
  app.innerHTML = `${head("CHOOSE A QUESTION", "今晚想聊哪一个问题？", "不用马上选边。大家先看看，哪一题最贴近最近的生活？")}
    <section class="topic-grid" aria-label="十个讨论主题">
      ${TOPICS.map((topic, index) => `<button class="topic-card ${state.topicId === topic.id ? "selected" : ""}" data-topic="${topic.id}" type="button" aria-pressed="${state.topicId === topic.id}"><div class="topic-index mono">${String(index + 1).padStart(2, "0")}</div><h2 class="serif">${topic.title}</h2><p>${topic.tension}</p></button>`).join("")}
    </section>`;
}

function renderNames() {
  const topic = selectedTopic();
  app.innerHTML = `${head("WHO IS HERE", "输入今晚参加的人", `今晚讨论：${topic.title}`)}
    <div class="setup-grid">
      <section class="panel">
        <h2 class="serif">参与者名单</h2>
        <p class="quiet-note">至少输入 2 个名字，不设人数上限。6–8 人的讨论节奏通常最舒服，但人少或人多也可以继续。名单只保存在这台电脑，不会上传。</p>
        <form id="nameForm" class="name-form"><input id="nameInput" maxlength="20" autocomplete="off" placeholder="输入名字后按 Enter" aria-label="参与者名字"><button class="ink-button" type="submit">加入</button></form>
        <div class="count-status">现在有 <strong>${state.names.length}</strong> 人${state.names.length < 2 ? "，还需要至少 " + (2 - state.names.length) + " 人" : state.names.length < 6 ? "，可以继续；人数较少时每个人会多做一点" : state.names.length <= 8 ? "，很适合这个活动" : "，可以继续；同一种任务会分给不止一个人"}。</div>
      </section>
      <section class="panel">
        <h2 class="serif">今晚在场</h2>
        <div class="name-list">${state.names.length ? state.names.map((name, index) => `<span class="name-chip">${escapeHTML(name)}<button type="button" data-remove-name="${index}" aria-label="移除 ${escapeHTML(name)}">×</button></span>`).join("") : `<div class="empty-box">名字会出现在这里</div>`}</div>
      </section>
    </div>`;
}

function renderTeams() {
  const topic = selectedTopic();
  app.innerHTML = `${head("TRY THE OTHER SIDE", "先帮你分到的这一边说话", "这不是正式辩论，也没有固定发言顺序。每个人只要完成一个小任务。觉得分组不合适，可以交换成员。")}
    <div class="principle-banner"><strong>先不用说自己真正赞成哪边。</strong> 这里的分组只是今晚的任务，不是在给人贴标签。</div>
    <section class="team-grid">
      ${state.teams.map((team, teamIndex) => {
        const side = topic.sides[state.sideOrder[teamIndex]];
        return `<article class="team-card"><header class="team-head"><div class="side-label mono">${teamIndex === 0 ? "TEAM A" : "TEAM B"}</div><h2 class="serif">${side.label}</h2><div class="team-side">${side.brief}</div></header><div class="member-list">${rolesFor(team).map((member, index) => { const picked = state.swapPick?.team === teamIndex && state.swapPick?.index === index; return `<div class="member-row ${picked ? "swap-picked" : ""}"><div><strong>${escapeHTML(member.participant)}</strong><div class="member-role">${member.role}</div></div><button class="move-button" data-swap="${teamIndex}:${index}" type="button">${picked ? "已选择 · 再按取消" : "选择交换"}</button></div><div class="role-prompt">${member.prompt}</div>`; }).join("")}</div></article>`;
      }).join("")}
    </section>`;
}

function renderPreparation() {
  const topic = selectedTopic();
  app.innerHTML = `${head("GET READY", topic.title, "两组分开准备：为什么一个认真信主的人会这样想？")}
    <div class="principle-banner">先别想怎么反驳另一组。你们的目标只有一个：<strong>把自己这边的道理说清楚。</strong></div>
    <section class="side-grid">${state.teams.map((team, teamIndex) => { const side = topic.sides[state.sideOrder[teamIndex]]; return `<article class="side-card"><div class="side-label mono">${teamIndex === 0 ? "TEAM A" : "TEAM B"}</div><h2 class="serif">${side.label}</h2><p>${side.brief}</p><div class="name-list">${rolesFor(team).map(member => `<span class="name-chip">${escapeHTML(member.participant)} · ${member.role}</span>`).join("")}</div></article>`; }).join("")}</section>
    <div class="prompt-list"><div class="prompt-tile"><strong>为什么要这样选？</strong>这边最想保护什么人或什么事情？</div><div class="prompt-tile"><strong>举个普通的例子</strong>想想这种做法什么时候真的有帮助。</div><div class="prompt-tile"><strong>别把话说得太绝对</strong>先说清楚：这种做法什么时候不适用？</div></div>
    <section class="scripture-area"><button id="toggleVerses" class="soft-button" type="button" aria-expanded="${state.versesOpen}">${state.versesOpen ? "收起经文入口" : "需要一点提示？查看经文入口"}</button>${state.versesOpen ? `<div class="scripture-list">${topic.verses.map(verse => `<article class="scripture-card"><strong class="serif">${verse.ref}</strong><p>${verse.note}</p></article>`).join("")}</div>` : ""}</section>`;
}

function renderSharing() {
  const topic = selectedTopic();
  const teamIndex = state.shareSide;
  const side = topic.sides[state.sideOrder[teamIndex]];
  app.innerHTML = `${head("LISTEN FIRST", "两组轮流分享", "可以一个人开头，其他人接着补充。听对方说完再回应。")}
    <section class="share-focus"><div><div class="eyebrow mono">现在分享 · ${teamIndex === 0 ? "TEAM A" : "TEAM B"}</div><h2 class="serif">${side.label}</h2><p>${side.brief}</p><div class="name-list" style="justify-content:center">${state.teams[teamIndex].map(name => `<span class="name-chip">${escapeHTML(name)}</span>`).join("")}</div><div class="share-switch"><button class="soft-button" data-share="0" type="button" ${teamIndex === 0 ? "disabled" : ""}>A 组分享</button><button class="soft-button" data-share="1" type="button" ${teamIndex === 1 ? "disabled" : ""}>B 组分享</button></div></div></section>`;
}

function renderScenarios() {
  const topic = selectedTopic();
  const scenario = topic.scenarios[state.scenarioIndex];
  app.innerHTML = `${head("CHANGE ONE THING", "如果情况稍微变了，你们还会这样选吗？", "每次只看一个变化。两组不用重新辩论，只要决定：我们仍然坚持本方，还是要承认一个例外？")}
    <section class="scenario-stage"><nav class="scenario-nav" aria-label="情况变化">${topic.scenarios.map((item, index) => `<button class="scenario-tab ${index === state.scenarioIndex ? "active" : ""}" data-scenario="${index}" type="button"><span class="mono">0${index + 1}</span> · 改变${item.changed}</button>`).join("")}</nav><article class="scenario-card" key="${state.scenarioIndex}"><div class="scenario-changed mono">这次只改变 · ${scenario.changed}</div><h2 class="serif">${scenario.text}</h2><div class="scenario-question"><strong>两组各完成一句话：</strong><br>“有了这个变化，我们还是这样选／我们要改一下，因为……”</div></article></section>`;
}

function renderDiscussion() {
  const topic = selectedTopic();
  app.innerHTML = `${head("TALK TOGETHER", "现在说回自己的想法", `今晚的问题：${topic.title}`)}
    <div class="principle-banner">分组到这里就结束了。你可以同意任何一边，也可以改掉刚才的说法。不用交代自己一开始怎么想。</div>
    <section class="discussion-grid"><article class="question-block"><span class="mono">01 · WHAT CHANGED?</span><h2 class="serif">刚才哪一个情况最容易让你改变选择？为什么？</h2></article><article class="question-block"><span class="mono">02 · WHAT MATTERS?</span><h2 class="serif">两边分别在担心什么？这些担心哪里有道理？</h2></article><article class="question-block"><span class="mono">03 · WHAT STAYS?</span><h2 class="serif">不管情况怎么变，有什么东西一定不能丢？</h2></article></section>
    <aside class="safety-note"><strong>主持提醒：</strong>${topic.safety}</aside>`;
}

function renderSummary() {
  const topic = selectedTopic();
  const summary = topic.summary;
  app.innerHTML = `${head("LET'S WRAP UP", "最后把重点收一收", "这不是标准答案。它只是帮我们看看：两边为什么都有道理，又可能在哪里走过头。", false)}
    <section class="summary-section"><h2 class="serif">大家到底在争什么？</h2><div class="summary-card summary-wide"><p>${summary.common}</p></div></section>
    <section class="summary-grid summary-section"><article class="summary-card"><h3 class="serif">两边说对了什么</h3><ul>${summary.strengths.map(item => `<li>${item}</li>`).join("")}</ul></article><article class="summary-card"><h3 class="serif">两边可能错在哪里</h3><ul>${summary.extremes.map(item => `<li>${item}</li>`).join("")}</ul></article><article class="summary-card"><h3 class="serif">什么情况会改变选择</h3><p>${summary.variables}</p></article><article class="summary-card"><h3 class="serif">可以怎样一起考虑</h3><p>${summary.integration}</p></article><article class="summary-card summary-wide"><h3 class="serif">最后还是要自己判断的地方</h3><p>${summary.unresolved}</p></article></section>
    <section class="summary-section"><h2 class="serif">回到经文</h2><div class="scripture-list">${topic.verses.map(verse => `<article class="scripture-card"><strong class="serif">${verse.ref}</strong><p>${verse.note}</p></article>`).join("")}</div></section>
    <section class="summary-section"><h2 class="serif">延伸来源</h2><div class="source-list">${topic.sources.map(source => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label} ↗</a>`).join("")}</div></section>
    <aside class="safety-note"><strong>最后提醒：</strong>${topic.safety}</aside>`;
}

function render() {
  if (state.stage > 0 && !selectedTopic()) state.stage = 0;
  if (state.stage > 1 && (!state.teams || state.names.length < 2)) state.stage = 1;
  [renderTopics, renderNames, renderTeams, renderPreparation, renderSharing, renderScenarios, renderDiscussion, renderSummary][state.stage]();
  const info = STAGES[state.stage];
  progressLabel.textContent = `${String(state.stage + 1).padStart(2, "0")} / 08 · ${info.label}`;
  progressBar.style.width = `${((state.stage + 1) / STAGES.length) * 100}%`;
  stageHint.textContent = info.hint;
  backButton.disabled = state.stage === 0;
  nextButton.hidden = state.stage === STAGES.length - 1;
  nextButton.disabled = (state.stage === 0 && !state.topicId) || (state.stage === 1 && state.names.length < 2);
  nextButton.textContent = state.stage === 6 ? "看看最后总结 →" : "下一步 →";
  saveState();
}

app.addEventListener("click", event => {
  const topicButton = event.target.closest("[data-topic]");
  if (topicButton) { state.topicId = topicButton.dataset.topic; state.teams = null; render(); return; }
  const removeButton = event.target.closest("[data-remove-name]");
  if (removeButton) { state.names.splice(Number(removeButton.dataset.removeName), 1); state.teams = null; render(); return; }
  const swapButton = event.target.closest("[data-swap]");
  if (swapButton) {
    const [team, index] = swapButton.dataset.swap.split(":").map(Number);
    const clickedPickAgain = state.swapPick?.team === team && state.swapPick?.index === index;
    if (clickedPickAgain) {
      state.swapPick = null;
    } else if (!state.swapPick) {
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
  if (!name || state.names.some(item => item.toLowerCase() === name.toLowerCase())) return;
  state.names.push(name); state.teams = null; render();
  requestAnimationFrame(() => document.querySelector("#nameInput")?.focus());
});

backButton.addEventListener("click", () => { if (state.stage > 0) { state.stage -= 1; render(); } });
nextButton.addEventListener("click", () => {
  if (state.stage === 0 && !state.topicId) return;
  if (state.stage === 1) {
    if (state.names.length < 2) return;
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
