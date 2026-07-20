import { AI_ANSWERS, QUESTIONS, VIDEO_URL } from "./questions.js";

const DEMO_RESULTS = Object.freeze({
  count: 7,
  questions: {
    q1: {
      counts: { "祷告": 2, "读经": 0, "分享": 2, "上台服事": 1, "其实都怕": 2, "都不怕": 0 },
      other: [],
    },
    q2: {
      counts: { "事情太多": 3, "意见太多": 4, "找不到人": 2, "加入后很难退出": 2, "沟通太绕": 3, "没服事过 / 不确定": 0 },
      other: [],
    },
    q3: [...AI_ANSWERS.q3],
    q4: [...AI_ANSWERS.q4],
    q5: [...AI_ANSWERS.q5],
  },
});

const hostApp = document.querySelector("#hostApp");
const stage = document.querySelector("#stage");
const barCount = document.querySelector("#barCount");
const connectionLabel = document.querySelector("#connectionLabel");
const statusDot = document.querySelector("#statusDot");
let view = "waiting";
let questionIndex = 0;
let submissionCount = 0;
let resultCache = emptyResults();
let aiAnswerQuestionId = null;

function emptyResults() {
  return {
    count: 0,
    questions: {
      q1: { counts: {}, other: [] },
      q2: { counts: {}, other: [] },
      q3: [],
      q4: [],
      q5: [],
    },
  };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function normalizeResults(payload = {}) {
  const source = payload.questions || payload.results || payload;
  const normalized = emptyResults();
  normalized.count = Number(payload.count ?? payload.submissionCount ?? 0);

  for (const id of ["q1", "q2"]) {
    const question = source[id] || {};
    normalized.questions[id] = {
      counts: question.counts || question.options || {},
      other: question.other || question.others || [],
    };
  }

  for (const id of ["q3", "q4", "q5"]) {
    const question = source[id] || [];
    normalized.questions[id] = Array.isArray(question)
      ? question
      : question.answers || question.texts || [];
  }
  return normalized;
}

function setConnection(ok, label = ok ? "LIVE" : "RETRYING") {
  connectionLabel.textContent = label;
  statusDot.classList.toggle("is-offline", !ok);
}

function updateCount(count) {
  submissionCount = Number(count || 0);
  barCount.textContent = `${submissionCount} 份回答`;
  const waitingCount = document.querySelector("#waitingCount");
  if (waitingCount) waitingCount.textContent = String(submissionCount);
  const startButton = document.querySelector("#startReveal");
  if (startButton) startButton.disabled = submissionCount === 0;
}

async function refreshResults() {
  resultCache = normalizeResults(DEMO_RESULTS);
  updateCount(resultCache.count);
  setConnection(true, "DEMO");
  return resultCache;
}

function startPolling() {
  setConnection(true, "DEMO");
}

function stopPolling() {}

function keyboardHint(items) {
  const wrap = element("div", "keyboard-hints");
  items.forEach(([key, label]) => {
    const item = element("span", "keyboard-hint");
    item.append(element("kbd", "mono", key), document.createTextNode(label));
    wrap.append(item);
  });
  return wrap;
}

function renderWaiting() {
  view = "waiting";
  aiAnswerQuestionId = null;
  stage.className = "host-stage waiting-stage";
  stage.replaceChildren();

  const copy = element("section", "waiting-copy");
  copy.append(
    element("p", "eyebrow", "STATIC DEMO"),
    element("h1", "serif", "教会里那些大家都懂，但平常不太讲的事"),
    element("p", "waiting-lede", "活动已结束，这里保留 7 份示例回答供浏览。"),
  );

  const actions = element("div", "waiting-actions");
  const start = button("开始揭晓", "primary-button host-primary", startReveal);
  start.id = "startReveal";
  start.disabled = submissionCount === 0;
  actions.append(start, element("span", "waiting-help", "只读演示，不会收集新回答"));
  copy.append(actions);

  const scan = element("aside", "scan-panel");
  const qrFrame = element("div", "qr-frame");
  qrFrame.id = "qrCode";
  qrFrame.classList.add("demo-mark");
  qrFrame.append(element("span", "serif", "DEMO"));
  scan.append(
    element("p", "scan-kicker mono", "ARCHIVED ACTIVITY"),
    qrFrame,
    element("p", "scan-copy", "原活动已下线；当前内容来自内置示例。"),
  );
  const counter = element("div", "response-counter");
  const number = element("strong", "serif", String(submissionCount));
  number.id = "waitingCount";
  counter.append(element("span", "mono", "RECEIVED"), number, element("span", "counter-label", "份回答"));
  scan.append(counter);

  const footer = element("footer", "stage-footer");
  footer.append(
    element("span", "mono stage-id", "WAITING ROOM"),
    keyboardHint([["→", "开始揭晓"]]),
  );

  stage.append(copy, scan, footer);
  startPolling();
}

async function startReveal() {
  if (submissionCount === 0) return;
  stopPolling();
  try {
    await refreshResults();
    questionIndex = 0;
    renderQuestion();
  } catch (error) {
    setConnection(false);
    window.alert(error.message || "暂时读取不到结果，请稍后再试。");
    startPolling();
  }
}

function renderProgress() {
  const progress = element("div", "question-progress");
  QUESTIONS.forEach((question, index) => {
    const mark = element("span", "progress-mark");
    mark.classList.toggle("is-current", index === questionIndex);
    mark.classList.toggle("is-past", index < questionIndex);
    mark.setAttribute("aria-label", `第 ${index + 1} 题`);
    progress.append(mark);
  });
  return progress;
}

function renderBarResults(question, data) {
  const result = element("section", "bar-results");
  if (question.id === "q2") {
    result.append(element("p", "result-note", "一人可选两项 · 数字代表被选择次数"));
  }

  const allOptions = [...question.options, "其他"];
  const counts = allOptions.map((option) => Number(data.counts?.[option] || 0));
  const max = Math.max(1, ...counts);
  const chart = element("div", "result-chart");

  allOptions.forEach((option, index) => {
    const row = element("div", "result-row");
    const meta = element("div", "result-meta");
    meta.append(element("span", "result-option", option), element("strong", "serif result-count", String(counts[index])));
    const track = element("div", "result-track");
    const fill = element("div", "result-fill");
    fill.style.setProperty("--bar-width", `${(counts[index] / max) * 100}%`);
    track.append(fill);
    row.append(meta, track);
    chart.append(row);
  });
  result.append(chart);

  const otherAnswers = (data.other || []).filter((value) => typeof value === "string" && value.trim());
  if (otherAnswers.length) {
    const otherWrap = element("div", "other-results");
    otherWrap.append(element("p", "mono other-title", "其他回答"));
    const cards = element("div", "other-card-list");
    otherAnswers.forEach((answer) => cards.append(element("div", "other-card", answer)));
    otherWrap.append(cards);
    result.append(otherWrap);
  }
  return result;
}

function renderAnswerCards(answers, { ai = false } = {}) {
  const cleanAnswers = answers.filter((value) => typeof value === "string" && value.trim());
  if (!cleanAnswers.length) {
    const empty = element("section", "empty-results");
    empty.append(element("span", "empty-mark", "—"), element("p", "serif", "这一题暂时没有回答"));
    return empty;
  }

  const grid = element("section", "answer-card-grid");
  grid.classList.toggle("has-many", cleanAnswers.length > 6);
  cleanAnswers.slice(0, 12).forEach((answer, index) => {
    const card = element("article", "answer-card");
    card.classList.toggle("is-ai", ai);
    if (Array.from(answer).length > 42) card.classList.add("is-dense");
    if (Array.from(answer).length > 54) card.classList.add("is-compact");
    card.style.setProperty("--delay", `${Math.min(index * 100, 700)}ms`);
    const indexLabel = ai ? `AI ${String(index + 1).padStart(2, "0")}` : String(index + 1).padStart(2, "0");
    card.append(element("span", "mono answer-index", indexLabel), element("p", "serif", answer));
    grid.append(card);
  });
  return grid;
}

function renderTextResults(question, answers) {
  const showingAi = aiAnswerQuestionId === question.id;
  const examples = AI_ANSWERS[question.id] || [];
  const shell = element("section", "text-result-view");
  const toolbar = element("header", "text-result-toolbar");
  toolbar.append(
    element("p", "text-result-label", showingAi ? "AI 示例视角 · 不计入现场回答" : "大家的匿名回答"),
  );

  const toggle = button(showingAi ? "返回大家的回答" : "AI回答", "secondary-button ai-answer-toggle", () => {
    aiAnswerQuestionId = showingAi ? null : question.id;
    renderQuestion();
  });
  toggle.setAttribute("aria-pressed", String(showingAi));
  toolbar.append(toggle);

  shell.append(toolbar, renderAnswerCards(showingAi ? examples : answers, { ai: showingAi }));
  return shell;
}

function renderRevealedResult(question) {
  const data = resultCache.questions[question.id];
  return question.type === "text" ? renderTextResults(question, data || []) : renderBarResults(question, data || { counts: {}, other: [] });
}

function navButton(label, direction, disabled, handler) {
  const node = button(label, "secondary-button nav-button", handler);
  node.disabled = disabled;
  node.dataset.direction = direction;
  return node;
}

function renderQuestion() {
  view = "question";
  stopPolling();
  const question = QUESTIONS[questionIndex];
  stage.className = `host-stage question-stage question-${question.type}`;
  stage.replaceChildren();

  const header = element("header", "question-header");
  const meta = element("div", "question-meta");
  meta.append(
    element("span", "mono question-kicker", `QUESTION ${question.number} / 05`),
    element("span", "question-total", `${submissionCount} 份回答`),
  );
  header.append(meta, element("h1", "serif", question.title), renderProgress());

  const resultArea = element("div", "host-result-area");
  resultArea.append(renderRevealedResult(question));

  const footer = element("footer", "stage-footer question-footer");
  const previous = navButton("← 上一题", "previous", questionIndex === 0, previousQuestion);
  const nextLabel = questionIndex === QUESTIONS.length - 1 ? "结束页 →" : "下一题 →";
  const next = navButton(nextLabel, "next", false, nextQuestion);
  footer.append(previous, keyboardHint([["← →", "切换题目"]]), next);

  stage.append(header, resultArea, footer);
}

function previousQuestion() {
  if (view === "final") {
    questionIndex = QUESTIONS.length - 1;
    aiAnswerQuestionId = null;
    renderQuestion();
    return;
  }
  if (view !== "question" || questionIndex === 0) return;
  questionIndex -= 1;
  aiAnswerQuestionId = null;
  renderQuestion();
}

function nextQuestion() {
  if (view === "waiting") {
    startReveal();
    return;
  }
  if (view !== "question") return;
  if (questionIndex >= QUESTIONS.length - 1) {
    renderFinal();
    return;
  }
  questionIndex += 1;
  aiAnswerQuestionId = null;
  renderQuestion();
}

function renderFinal() {
  view = "final";
  stopPolling();
  stage.className = "host-stage final-stage";
  stage.replaceChildren();

  const content = element("section", "final-content");
  content.append(
    element("p", "eyebrow", "THAT'S ALL, FOLKS"),
    element("h1", "serif", "好了，来看看别人家的教会吐槽大会。"),
    element("p", "final-copy", "网页结果会留在这里，视频将在新的标签页打开。"),
  );
  const link = element("a", "primary-button video-button");
  link.href = VIDEO_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.append(document.createTextNode("打开视频，从 01:52 开始"), element("span", "video-arrow", "↗"));
  content.append(link);

  const tally = element("aside", "final-tally");
  tally.append(
    element("span", "mono", "TONIGHT'S WALL"),
    element("strong", "serif", String(submissionCount)),
    element("span", "tally-label", "份匿名回答"),
    element("span", "tally-rule"),
    element("p", "", "谢谢每一个愿意讲点实话的人。"),
  );

  const footer = element("footer", "stage-footer");
  footer.append(navButton("← 回到第五题", "previous", false, previousQuestion), keyboardHint([["←", "返回结果"]]));
  stage.append(content, tally, footer);
}

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, button, a") || hostApp.hidden) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    nextQuestion();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    previousQuestion();
  }
});

resultCache = normalizeResults(DEMO_RESULTS);
updateCount(resultCache.count);
renderWaiting();
