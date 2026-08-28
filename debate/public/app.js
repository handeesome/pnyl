import { TOPICS } from "./topics.js";
import { createSession, getHostSession, recoverHostSession, updateHostSession } from "./api.js";
import { renderQrCode } from "./qr.js";
import { applyDemoAction, createDemoSession } from "./demo.js";

const HOST_SESSION_KEY = "pnyl-debate:host-session:v1";
const POLL_INTERVAL = 2200;
const PHASES = ["interests", "sides", "debate", "response", "summary"];
const PHASE_INFO = {
  interests: { label: "匿名选题", hint: "每个人先匿名多选感兴趣的辩论题目，不收集昵称。" },
  sides: { label: "填写昵称并站队", hint: "题目已经公布；大家在手机填写昵称并一次性选择 A 方或 B 方。" },
  debate: { label: "双方陈述", hint: "先用自己的理由。投影只显示两队成员，不公开任何人的小任务。" },
  response: { label: "回应与案例", hint: "先把对方的理由说到最好，再回应；需要时可以打开案例。" },
  summary: { label: "最后看两边", hint: "不用达成一致，只确认双方真正保护了什么、承担了什么。" }
};

const app = document.querySelector("#app");
const progressLabel = document.querySelector("#progressLabel");
const progressBar = document.querySelector("#progressBar");
const participantCount = document.querySelector("#participantCount");
const roomCode = document.querySelector("#roomCode");
const connectionDot = document.querySelector("#connectionDot");
const connectionLabel = document.querySelector("#connectionLabel");
const stageFooter = document.querySelector("#stageFooter");
const stageHint = document.querySelector("#stageHint");
const backButton = document.querySelector("#backButton");
const nextButton = document.querySelector("#nextButton");
const demoButton = document.querySelector("#demoButton");
const showQrButton = document.querySelector("#showQrButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const recoverButton = document.querySelector("#recoverButton");
const resetButton = document.querySelector("#resetButton");
const qrDialog = document.querySelector("#qrDialog");
const recoverDialog = document.querySelector("#recoverDialog");
const recoverForm = document.querySelector("#recoverForm");
const recoverError = document.querySelector("#recoverError");
const confirmDialog = document.querySelector("#confirmDialog");
const resetError = document.querySelector("#resetError");

let auth = loadAuth();
let sessionData = null;
let pollTimer = null;
let requestInFlight = false;
let caseRevealed = false;
let changeIndex = 0;
let topicSelectionOpen = false;
let demoMode = false;
let demoBaseSession = null;

function loadAuth() {
  try {
    const saved = JSON.parse(localStorage.getItem(HOST_SESSION_KEY));
    if (saved?.room && saved?.hostToken) return saved;
  } catch {
    // A new room will be created below.
  }
  return null;
}

function saveAuth() {
  localStorage.setItem(HOST_SESSION_KEY, JSON.stringify(auth));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function topicById(topicId) {
  return TOPICS.find((topic) => topic.id === topicId) || null;
}

function setConnection(ok, label = ok ? "LIVE" : "RETRYING") {
  connectionDot.classList.toggle("is-offline", !ok);
  connectionLabel.textContent = label;
}

function avatar(participant, small = false, deletable = false) {
  const name = escapeHTML(participant.nickname);
  const core = `<span class="avatar avatar-${Number(participant.avatarIndex) % 12} ${small ? "avatar-small" : ""}" title="${name}" aria-label="${name}"><span>${name}</span></span>`;
  if (!deletable) return core;
  return `<span class="avatar-wrap">${core}<button class="avatar-remove" data-delete-participant="${participant.id}" data-participant-name="${name}" type="button" aria-label="从房间移除 ${name}">×</button></span>`;
}

function participantList(items, emptyText, deletable = false) {
  return items.length
    ? `<div class="avatar-list">${items.map((item) => avatar(item, false, deletable)).join("")}</div>`
    : `<div class="empty-roster">${emptyText}</div>`;
}

function joinUrl() {
  const url = new URL("join/", window.location.href);
  url.searchParams.set("room", auth.room);
  return url.href;
}

function stageHead(kicker, title, lede) {
  return `<header class="stage-head">
    <div class="eyebrow mono">${kicker}</div>
    <h1 class="serif">${title}</h1>
    ${lede ? `<p class="lede">${lede}</p>` : ""}
  </header>`;
}

function demoBanner() {
  return `<section class="demo-banner" role="status">
    <span class="demo-chip mono">DEMO</span>
    <div><strong>你正在预览完整流程</strong><p>示例票数和昵称只在这台电脑显示，不会改变真实房间。</p></div>
    <div class="demo-banner-actions"><button class="ghost-button" data-restart-demo type="button">从头演示</button><button class="soft-button" data-leave-demo type="button">退出演示</button></div>
  </section>`;
}

function renderLobby(data) {
  const selectingTopic = topicSelectionOpen;
  const counts = data.preferenceCounts || Object.fromEntries(TOPICS.map((topic) => [topic.id, 0]));
  const maxVotes = Math.max(0, ...Object.values(counts));
  const rankedTopics = TOPICS.map((topic, originalIndex) => ({ topic, originalIndex, count: Number(counts[topic.id] || 0) }))
    .sort((left, right) => right.count - left.count || left.originalIndex - right.originalIndex);

  app.innerHTML = `${selectingTopic
    ? stageHead("HOST PICKS THE QUESTION", "主持人，今晚选哪一题？", "匿名投票已经汇总。票数提供参考，最终由主持人点击决定今晚真正进入的辩论题目。")
    : demoMode
      ? stageHead("DEMO TOPIC PICK", "先看演示票数怎么汇总", "这里放入了八份示例投票。点击底部“进入主题选择”，就能继续预览后面的流程。")
      : stageHead("ANONYMOUS TOPIC PICK", "今晚最想辩哪一题？", "这是匿名选择。现在只多选你感兴趣的辩论题目，不需要填写昵称；等人数到齐后，主持人点击下一步进入主题选择。")}
    <div class="lobby-layout">
      ${demoMode ? `<aside class="scan-panel demo-scan-panel">
        <div class="scan-kicker mono">READY TO PREVIEW</div>
        <div class="demo-vote-count"><strong class="serif">${data.voteCount}</strong><span>份示例投票</span></div>
        <p class="scan-copy">系统也准备了八位虚拟参与者。选题后，他们会自动出现在两边的队伍中。</p>
        <div class="demo-preview-avatars" aria-label="虚拟参与者">${data.participants.map((participant) => avatar(participant, true)).join("")}</div>
        <div class="demo-preview-note"><strong>${data.participants.length} 位虚拟参与者</strong><span>不会写入真实房间</span></div>
      </aside>` : `<aside class="scan-panel">
        <div class="scan-kicker mono">SCAN TO VOTE</div>
        <div id="qrCode" class="qr-frame" aria-label="参与者加入二维码"></div>
        <p class="scan-copy">扫码匿名选择辩论题目。定题以后，手机才会请你填写昵称并站队。</p>
        <div class="anonymous-badge"><span aria-hidden="true">◎</span><strong>不收集昵称</strong><small>每份选择只计入题目总数</small></div>
        <div class="manual-join">
          <span>扫码不方便？手机打开</span>
          <strong class="join-address">debate.ducenhan.com/join</strong>
          <small>再输入六位房间码</small>
        </div>
        <div class="manual-code"><span>房间码</span><strong class="mono">${escapeHTML(auth.room)}</strong></div>
        <div class="joined-summary"><strong class="serif">${data.voteCount}</strong><span>份匿名选择</span></div>
      </aside>`}
      <section class="preference-board" aria-label="辩论题目兴趣排名">
        <div class="board-heading">
          <div><span class="eyebrow mono">LIVE RESULTS</span><h2 class="serif">大家想辩的题目</h2></div>
          <span class="board-note">匿名多选 · 主持人最终定题</span>
        </div>
        <div class="preference-list">
          ${rankedTopics.map(({ topic, count }, rank) => {
            const isLeader = count > 0 && count === maxVotes;
            const width = maxVotes ? Math.max(7, (count / maxVotes) * 100) : 0;
            return `<article class="preference-card ${isLeader ? "is-leader" : ""} ${selectingTopic ? "" : "no-action"}">
              <div class="preference-rank mono">${String(rank + 1).padStart(2, "0")}</div>
              <div class="preference-main">
                <div class="preference-title-row"><h3>${escapeHTML(topic.title)}</h3>${isLeader ? `<span class="leader-badge">当前最高兴趣</span>` : ""}</div>
                <div class="vote-track"><span style="width:${width}%"></span></div>
                <div class="anonymous-result-note">匿名选择 · 不显示个人答案</div>
              </div>
              <div class="vote-count"><strong class="serif">${count}</strong><span>人感兴趣</span></div>
              ${selectingTopic ? `<button class="choose-topic-button" data-select-topic="${topic.id}" type="button">就辩这题</button>` : ""}
            </article>`;
          }).join("")}
        </div>
      </section>
    </div>`;
  const qrCode = document.querySelector("#qrCode");
  if (qrCode) renderQrCode(qrCode, joinUrl());
}

function sideBoard(topic, participants, showGuides = false) {
  const sideA = participants.filter((participant) => participant.side === "A");
  const sideB = participants.filter((participant) => participant.side === "B");
  return `<section class="side-board" aria-label="双方成员">
    ${topic.tension.map((position, index) => {
      const side = index === 0 ? "A" : "B";
      const members = side === "A" ? sideA : sideB;
      const guide = topic.considerations[index];
      return `<article class="side-card side-${side.toLowerCase()}">
        <div class="side-label mono">${side} 方</div>
        <h2 class="serif">${escapeHTML(position)}</h2>
        ${showGuides ? `<div class="side-guide"><span>把这一方说到最好</span><h3>${escapeHTML(guide.label)}</h3><p>${escapeHTML(guide.text)}</p></div>` : ""}
        <div class="roster-heading"><span>这一方有</span><strong>${members.length} 人</strong></div>
        ${participantList(members, "还没有人站到这一方", true)}
      </article>`;
    }).join("")}
  </section>`;
}

function optionalCase(topic) {
  if (!caseRevealed) {
    return `<section class="optional-case closed">
      <div><span class="eyebrow mono">OPTIONAL CASE</span><h2 class="serif">题目太抽象？</h2><p>需要时再打开一个具体案例，不需要就直接回应。</p></div>
      <button class="soft-button" data-toggle-case type="button">显示具体案例</button>
    </section>`;
  }
  const change = topic.changes[changeIndex];
  return `<section class="optional-case open">
    <div class="case-heading"><div><span class="eyebrow mono">COMMON CASE</span><h2 class="serif">${escapeHTML(topic.caseStudy.title)}</h2></div><button class="ghost-button" data-toggle-case type="button">收起案例</button></div>
    <p class="case-text">${escapeHTML(topic.caseStudy.text)}</p>
    <div class="case-question"><strong>现在选：</strong>${escapeHTML(topic.caseStudy.question)}</div>
    <div class="change-tabs">${topic.changes.map((item, index) => `<button class="${index === changeIndex ? "active" : ""}" data-change="${index}" type="button"><span class="mono">0${index + 1}</span>${escapeHTML(item.label)}</button>`).join("")}</div>
    <article class="change-card"><span class="mono">只改变一个事实</span><p>${escapeHTML(change.text)}</p><strong>知道这个变化后，你还站原来的一方吗？</strong></article>
  </section>`;
}

function renderSides(data, topic) {
  const joinedCount = data.participants.length;
  const tasksAssigned = data.session.tasksAssigned;
  app.innerHTML = `${stageHead("THE QUESTION IS SET", escapeHTML(topic.title), tasksAssigned
    ? "队伍已经锁定，隐藏任务也已发到每个人的手机。之后扫码加入的人仍可以直接填写昵称并选择一边。"
    : "手机已经自动进入站队页面。现在才会收集昵称；每个人只能选一次，提交后不能换边。")}
    <div class="phone-instruction ${tasksAssigned ? "tasks-sent" : ""}">
      <span class="phone-icon" aria-hidden="true">${tasksAssigned ? "✓" : "↗"}</span>
      <div><strong>${tasksAssigned ? "隐藏任务已经发放" : "现在看手机，填写昵称并站队"}</strong><p>${tasksAssigned ? "任务需要点击才会揭晓，并且只显示在个人手机上。" : "等所有人选完后，由主持人统一发放任务。"}</p></div>
      <div class="side-progress"><strong class="serif">${joinedCount}</strong><span>人已站队 · ${data.voteCount} 份匿名选择</span></div>
    </div>
    ${sideBoard(topic, data.participants)}`;
}

function renderDiscussion(data, topic, phase) {
  const isResponse = phase === "response";
  const isSummary = phase === "summary";
  const kicker = isSummary ? "NO WINNER · TWO HONEST SIDES" : isResponse ? "RESPOND · TEST" : "SPEAK FOR YOUR SIDE";
  const title = isSummary ? "最后，把两边都说到最好" : isResponse ? "第二轮：先听懂，再回应" : "第一轮：先为自己这一方说话";
  const lede = isSummary
    ? "不投票选赢家，也不要求站到同一边。只看今晚有没有让更多人开口，并把自己的理由说清楚。"
    : isResponse ? `今晚的辩论题目：${topic.title}` : "每次只讲一个理由。先不用页面上的参考论点，也不用急着证明另一边很荒谬。";
  app.innerHTML = `${stageHead(kicker, title, escapeHTML(lede))}
    <article class="debate-question"><span class="mono">TONIGHT'S QUESTION</span><h2 class="serif">${escapeHTML(topic.title)}</h2></article>
    ${sideBoard(topic, data.participants, isResponse || isSummary)}
    ${isResponse ? optionalCase(topic) : ""}
    ${topic.safety ? `<aside class="safety-note"><strong>主持提醒</strong><span>${escapeHTML(topic.safety)}</span></aside>` : ""}`;
}

function renderCurrent() {
  if (!sessionData) return;
  const { session, participants, voteCount } = sessionData;
  const phase = session.phase;
  const phaseIndex = PHASES.indexOf(phase);
  const info = PHASE_INFO[phase];
  progressLabel.textContent = `${String(phaseIndex + 1).padStart(2, "0")} / ${String(PHASES.length).padStart(2, "0")} · ${info.label}`;
  progressBar.style.width = `${((phaseIndex + 1) / PHASES.length) * 100}%`;
  participantCount.textContent = phase === "interests" ? `${voteCount} 份匿名选择` : `${participants.length} 人`;
  roomCode.textContent = demoMode ? "DEMO MODE" : `ROOM ${session.room}`;
  stageHint.textContent = phase === "sides" && session.tasksAssigned
    ? "任务已经发放；准备好后开始辩论。"
    : info.hint;

  const topic = topicById(session.topicId);
  if (phase === "interests") renderLobby(sessionData);
  else if (!topic) renderFatal("房间缺少有效辩论题目，请开始新一局。");
  else if (phase === "sides") renderSides(sessionData, topic);
  else renderDiscussion(sessionData, topic, phase);
  if (demoMode) app.insertAdjacentHTML("afterbegin", demoBanner());

  stageFooter.hidden = false;
  demoButton.disabled = false;
  demoButton.textContent = demoMode ? "退出演示" : "演示流程";
  demoButton.classList.toggle("is-active", demoMode);
  demoButton.setAttribute("aria-pressed", String(demoMode));
  showQrButton.disabled = demoMode;
  showQrButton.title = demoMode ? "退出演示后可以显示真实房间二维码" : "";
  resetButton.textContent = demoMode ? "重新演示" : "新一局";
  backButton.hidden = phase === "interests" && !topicSelectionOpen;
  backButton.disabled = phase === "sides";
  nextButton.hidden = phase === "summary" || (phase === "interests" && topicSelectionOpen);
  nextButton.disabled = (phase === "interests" && voteCount < 1) || (phase === "sides" && participants.length < 1);
  nextButton.textContent = phase === "interests"
    ? "进入主题选择 →"
    : phase === "sides" ? session.tasksAssigned ? "开始辩论 →" : "确认站队完成，发放任务 →"
    : phase === "debate" ? "进入回应 →" : "最后看两边 →";
}

function renderFatal(message) {
  app.innerHTML = `<section class="fatal-state"><div class="eyebrow mono">ROOM UNAVAILABLE</div><h1 class="serif">这个房间暂时用不了</h1><p>${escapeHTML(message)}</p><div class="fatal-actions"><button class="soft-button" data-open-recovery type="button">恢复已有房间</button><button class="ink-button" data-create-room type="button">建立新房间</button></div></section>`;
  stageFooter.hidden = true;
}

async function establishRoom(forceNew = false) {
  setConnection(false, "CONNECTING");
  demoMode = false;
  demoBaseSession = null;
  if (forceNew) {
    localStorage.removeItem(HOST_SESSION_KEY);
    auth = null;
  }
  if (auth) {
    try {
      sessionData = await getHostSession(auth.room, auth.hostToken);
      setConnection(true);
      renderCurrent();
      startPolling();
      return;
    } catch (error) {
      if (error.status !== 401 && error.status !== 404) {
        renderFatal(error.message);
        return;
      }
      localStorage.removeItem(HOST_SESSION_KEY);
      auth = null;
    }
  }

  try {
    const created = await createSession();
    auth = { room: created.room, hostToken: created.hostToken };
    saveAuth();
    sessionData = await getHostSession(auth.room, auth.hostToken);
    setConnection(true);
    renderCurrent();
    startPolling();
  } catch (error) {
    setConnection(false, "OFFLINE");
    renderFatal(error.message || "无法连接活动服务器。");
  }
}

async function refresh() {
  if (!auth || requestInFlight || demoMode) return;
  requestInFlight = true;
  try {
    const latest = await getHostSession(auth.room, auth.hostToken);
    const changed = JSON.stringify(latest) !== JSON.stringify(sessionData);
    sessionData = latest;
    setConnection(true);
    if (changed) renderCurrent();
  } catch (error) {
    setConnection(false);
    if (error.status === 401 || error.status === 404) {
      clearInterval(pollTimer);
      renderFatal(error.message);
    }
  } finally {
    requestInFlight = false;
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = window.setInterval(refresh, POLL_INTERVAL);
}

async function hostAction(action, value = {}) {
  if (demoMode) {
    sessionData = applyDemoAction(sessionData, action, value);
    renderCurrent();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (!auth || requestInFlight) return;
  requestInFlight = true;
  try {
    sessionData = await updateHostSession(auth.room, auth.hostToken, action, value);
    setConnection(true);
    renderCurrent();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } finally {
    requestInFlight = false;
  }
}

function enterDemoMode() {
  if (!sessionData || demoMode) return;
  clearInterval(pollTimer);
  demoBaseSession = { ...sessionData.session };
  demoMode = true;
  topicSelectionOpen = false;
  caseRevealed = false;
  changeIndex = 0;
  sessionData = createDemoSession(demoBaseSession);
  setConnection(true, "DEMO");
  renderCurrent();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restartDemoMode() {
  if (!demoMode) return;
  topicSelectionOpen = false;
  caseRevealed = false;
  changeIndex = 0;
  sessionData = createDemoSession(demoBaseSession || sessionData.session);
  renderCurrent();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function exitDemoMode() {
  if (!demoMode || !auth || requestInFlight) return;
  requestInFlight = true;
  demoButton.disabled = true;
  setConnection(false, "CONNECTING");
  try {
    const latest = await getHostSession(auth.room, auth.hostToken);
    demoMode = false;
    demoBaseSession = null;
    topicSelectionOpen = false;
    sessionData = latest;
    setConnection(true);
    renderCurrent();
    startPolling();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setConnection(false, "RETRYING");
    window.alert(error.message || "暂时无法返回真实房间，请稍后再试。");
  } finally {
    requestInFlight = false;
    demoButton.disabled = false;
  }
}

function openQrDialog() {
  if (!auth) return;
  document.querySelector("#dialogRoomCode").textContent = auth.room;
  renderQrCode(document.querySelector("#dialogQrCode"), joinUrl());
  qrDialog.hidden = false;
  document.querySelector("#closeQrDialog").focus();
}

function openRecoveryDialog() {
  recoverError.hidden = true;
  recoverForm.reset();
  recoverForm.elements.room.value = auth?.room || "";
  recoverDialog.hidden = false;
  recoverForm.elements.room.focus();
}

app.addEventListener("click", async (event) => {
  if (event.target.closest("[data-leave-demo]")) {
    await exitDemoMode();
    return;
  }
  if (event.target.closest("[data-restart-demo]")) {
    restartDemoMode();
    return;
  }
  const topicButton = event.target.closest("[data-select-topic]");
  if (topicButton) {
    caseRevealed = false;
    changeIndex = 0;
    topicSelectionOpen = false;
    try { await hostAction("select-topic", { topicId: topicButton.dataset.selectTopic }); }
    catch (error) { window.alert(error.message || "选题没有成功，请稍后再试。"); }
    return;
  }
  const deleteButton = event.target.closest("[data-delete-participant]");
  if (deleteButton) {
    const name = deleteButton.dataset.participantName;
    if (!window.confirm(`确定从这一局移除「${name}」吗？`)) return;
    try { await hostAction("delete-participant", { participantId: deleteButton.dataset.deleteParticipant }); }
    catch (error) { window.alert(error.message || "暂时无法移除这位参与者。"); }
    return;
  }
  if (event.target.closest("[data-toggle-case]")) {
    caseRevealed = !caseRevealed;
    renderCurrent();
    return;
  }
  const changeButton = event.target.closest("[data-change]");
  if (changeButton) {
    changeIndex = Number(changeButton.dataset.change);
    renderCurrent();
    return;
  }
  if (event.target.closest("[data-create-room]")) establishRoom(true);
  if (event.target.closest("[data-open-recovery]")) openRecoveryDialog();
});

backButton.addEventListener("click", async () => {
  const phase = sessionData?.session.phase;
  if (phase === "interests" && topicSelectionOpen) {
    topicSelectionOpen = false;
    renderCurrent();
    return;
  }
  const previous = { debate: "sides", response: "debate", summary: "response" }[phase];
  if (previous) {
    try { await hostAction("set-phase", { phase: previous }); }
    catch (error) { window.alert(error.message || "暂时无法返回上一步。"); }
  }
});

nextButton.addEventListener("click", async () => {
  const phase = sessionData?.session.phase;
  try {
    if (phase === "interests") {
      topicSelectionOpen = true;
      renderCurrent();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (phase === "sides" && !sessionData.session.tasksAssigned) {
      await hostAction("assign-tasks");
      return;
    }
    const next = { sides: "debate", debate: "response", response: "summary" }[phase];
    if (next) await hostAction("set-phase", { phase: next });
  } catch (error) {
    window.alert(error.message || "暂时无法进入下一步。");
  }
});

showQrButton.addEventListener("click", openQrDialog);
document.querySelector("#closeQrDialog").addEventListener("click", () => { qrDialog.hidden = true; });
qrDialog.addEventListener("click", (event) => { if (event.target === qrDialog) qrDialog.hidden = true; });

recoverButton.addEventListener("click", openRecoveryDialog);
document.querySelector("#cancelRecover").addEventListener("click", () => { recoverDialog.hidden = true; });
recoverDialog.addEventListener("click", (event) => { if (event.target === recoverDialog) recoverDialog.hidden = true; });
recoverForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const room = recoverForm.elements.room.value.trim().toUpperCase();
  const recoveryCode = recoverForm.elements.recoveryCode.value;
  recoverError.hidden = true;
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(room)) {
    recoverError.textContent = "请输入六位房间码。";
    recoverError.hidden = false;
    return;
  }
  const submitButton = document.querySelector("#confirmRecover");
  submitButton.disabled = true;
  try {
    const recovered = await recoverHostSession(room, recoveryCode);
    auth = { room: recovered.room, hostToken: recovered.hostToken };
    saveAuth();
    demoMode = false;
    demoBaseSession = null;
    sessionData = await getHostSession(auth.room, auth.hostToken);
    recoverDialog.hidden = true;
    setConnection(true);
    renderCurrent();
    startPolling();
  } catch (error) {
    recoverError.textContent = error.message || "暂时无法恢复房间。";
    recoverError.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    // Fullscreen is optional.
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
});

demoButton.addEventListener("click", async () => {
  if (demoMode) await exitDemoMode();
  else enterDemoMode();
});

resetButton.addEventListener("click", () => {
  if (demoMode) {
    restartDemoMode();
    return;
  }
  resetError.hidden = true;
  confirmDialog.hidden = false;
  document.querySelector("#cancelReset").focus();
});

document.querySelector("#cancelReset").addEventListener("click", () => { confirmDialog.hidden = true; });
document.querySelector("#confirmReset").addEventListener("click", async () => {
  try {
    topicSelectionOpen = false;
    await hostAction("reset");
    confirmDialog.hidden = true;
  } catch (error) {
    resetError.textContent = error.message || "暂时无法重置。";
    resetError.hidden = false;
  }
});
confirmDialog.addEventListener("click", (event) => { if (event.target === confirmDialog) confirmDialog.hidden = true; });

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!qrDialog.hidden) qrDialog.hidden = true;
    else if (!recoverDialog.hidden) recoverDialog.hidden = true;
    else if (!confirmDialog.hidden) confirmDialog.hidden = true;
    return;
  }
  if (event.key === "ArrowLeft" && !backButton.disabled) backButton.click();
  if (event.key === "ArrowRight" && !nextButton.hidden && !nextButton.disabled) nextButton.click();
});

establishRoom();
