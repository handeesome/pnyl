import { TOPICS } from "../topics.js";
import { getParticipantSession, getPublicSession, joinSide, submitVote, validateVote } from "../api.js";

const POLL_INTERVAL = 2200;
const roomFromUrl = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() || "";
const mobileApp = document.querySelector("#mobileApp");
const statusDot = document.querySelector("#statusDot");
const statusLabel = document.querySelector("#statusLabel");

let room = roomFromUrl;
let participantCredentials = loadCredentials("participant");
let voteCredentials = loadCredentials("vote");
let currentData = null;
let currentSignature = "";
let pollTimer = null;
let requestInFlight = false;
let taskRevealed = false;
let revealedTaskId = null;

function storageKey(kind) {
  return `pnyl-debate:${kind}:${room}:v1`;
}

function loadCredentials(kind) {
  if (!roomFromUrl) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(`pnyl-debate:${kind}:${roomFromUrl}:v1`));
    if (kind === "participant" && saved?.participantId && saved?.participantToken) return saved;
    if (kind === "vote" && saved?.voterId && saved?.voterToken) return saved;
  } catch {
    // The correct form will be shown after the room is checked.
  }
  return null;
}

function saveParticipantCredentials(credentials) {
  participantCredentials = credentials;
  localStorage.setItem(storageKey("participant"), JSON.stringify(credentials));
}

function saveVoteCredentials(credentials, selectedCount) {
  voteCredentials = { ...credentials, selectedCount };
  localStorage.setItem(storageKey("vote"), JSON.stringify(voteCredentials));
}

function clearParticipantCredentials() {
  if (room) localStorage.removeItem(storageKey("participant"));
  participantCredentials = null;
  taskRevealed = false;
  revealedTaskId = null;
}

function clearVoteCredentials() {
  if (room) localStorage.removeItem(storageKey("vote"));
  voteCredentials = null;
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
  statusDot.classList.toggle("is-offline", !ok);
  statusLabel.textContent = label;
}

function shell(kicker, title, body, footer = "") {
  mobileApp.innerHTML = `<section class="mobile-card">
    <header class="mobile-head"><span class="eyebrow mono">${kicker}</span><h1 class="serif">${title}</h1></header>
    ${body}
    ${footer}
  </section>`;
}

function renderRoomEntry() {
  shell("ENTER A ROOM", "输入投影上的房间码", `<form id="roomForm" class="room-form">
    <label for="roomInput">六位房间码</label>
    <input id="roomInput" name="room" maxlength="6" minlength="6" autocomplete="off" autocapitalize="characters" placeholder="例如 7H3K9P" required>
    <div id="formError" class="form-error" hidden></div>
    <button class="primary-button" type="submit">进入房间</button>
  </form>`);
}

function renderVoteForm(message = "") {
  shell("ANONYMOUS TOPIC PICK", "你想辩哪些题目？", `<form id="voteForm" class="join-form">
    ${message ? `<div class="notice">${escapeHTML(message)}</div>` : ""}
    <div class="anonymous-callout"><span aria-hidden="true">◎</span><div><strong>这是匿名选择</strong><p>这里不会收集昵称。主持人只能看到每道辩论题目的总数，不能看到谁选了什么。</p></div></div>
    <fieldset>
      <legend><span>选择感兴趣的辩论题目</span><small>可以多选，至少一题</small></legend>
      <div class="topic-options">
        ${TOPICS.map((topic, index) => `<label class="topic-option">
          <input type="checkbox" name="preferences" value="${topic.id}">
          <span class="checkbox" aria-hidden="true"></span>
          <span class="topic-number mono">${String(index + 1).padStart(2, "0")}</span>
          <span>${escapeHTML(topic.title)}</span>
        </label>`).join("")}
      </div>
    </fieldset>
    <div id="formError" class="form-error" hidden></div>
    <button id="submitVote" class="primary-button" type="submit">匿名提交</button>
  </form>`);
}

function renderVoteWaiting(session) {
  const selectedCount = Number(voteCredentials?.selectedCount || 0);
  shell("ANONYMOUS VOTE RECEIVED", "匿名选择已收到", `<div class="success-mark" aria-hidden="true">✓</div>
    <p class="center-copy">${selectedCount ? `你选择了 ${selectedCount} 道感兴趣的辩论题目。` : "你的辩论题目选择已经计入总数。"}这份选择没有绑定昵称。</p>
    <div class="waiting-box"><span class="pulse-dot"></span><div><strong>等主持人决定今晚的题目</strong><p>定题后，这里会自动让你填写昵称并选择一边。</p></div></div>`,
    `<div class="privacy-note">匿名选题已经提交，不能重复提交或重新编辑。</div>`);
  currentData = { session };
}

function renderSideJoin(session, message = "") {
  const topic = topicById(session.topicId);
  if (!topic) return renderProblem("主持人选择的辩论题目暂时无法读取。");
  shell("THE QUESTION IS SET", escapeHTML(topic.title), `<form id="sideJoinForm" class="join-form side-join-form">
    ${message ? `<div class="notice">${escapeHTML(message)}</div>` : ""}
    <div class="identity-step"><span class="mono">NOW</span><p><strong>现在才填写昵称</strong><br>昵称会显示在投影的队伍头像里。</p></div>
    <label class="field-label" for="nickname">你的昵称</label>
    <input id="nickname" name="nickname" maxlength="12" autocomplete="nickname" placeholder="1–12 个字符，不能和别人重复" required>
    <fieldset>
      <legend><span>选择你要支持的一边</span><small>提交后不能换边</small></legend>
      <div class="side-choices">
        ${topic.tension.map((position, index) => {
          const side = index === 0 ? "A" : "B";
          return `<label class="side-choice side-${side.toLowerCase()}">
            <input type="radio" name="side" value="${side}">
            <span class="side-letter mono">${side} 方</span>
            <strong>${escapeHTML(position)}</strong>
            <i>选择这一边</i>
          </label>`;
        }).join("")}
      </div>
    </fieldset>
    <div class="locked-note"><span aria-hidden="true">⌁</span>选定后不能自由换边，请想好再提交。</div>
    <div id="formError" class="form-error" hidden></div>
    <button id="submitSide" class="primary-button" type="submit">确认昵称和立场</button>
  </form>`);
  currentData = { session };
}

function taskMarkup(task, active = false) {
  if (!task) {
    return `<div class="waiting-box compact"><span class="pulse-dot"></span><div><strong>立场已经锁定</strong><p>等所有人选完边后，主持人会统一发放隐藏任务。</p></div></div>`;
  }
  const isRevealed = taskRevealed && revealedTaskId === task.id;
  return `<section class="secret-task ${active ? "active" : ""} ${isRevealed ? "is-revealed" : "is-covered"}">
    <div class="secret-label"><span class="mono">YOUR SECRET MISSION</span><i>只在你的手机显示</i></div>
    ${isRevealed ? `<div class="task-content"><h2 class="serif">${escapeHTML(task.title)}</h2><p>${escapeHTML(task.prompt)}</p></div>` : ""}
    ${isRevealed ? `<button class="task-reveal-button revealed" type="button" disabled>任务已揭晓</button>` : `<button class="task-cover" data-reveal-task type="button"><span aria-hidden="true">?</span><strong>点击揭晓我的任务</strong><small>别让旁边的人看到</small></button>`}
  </section>`;
}

function renderSides(data) {
  const { participant, session } = data;
  const topic = topicById(session.topicId);
  if (!topic) return renderProblem("今晚的辩论题目暂时无法读取。");
  const position = topic.tension[participant.side === "A" ? 0 : 1];
  shell(`YOU ARE ON SIDE ${participant.side}`, `${escapeHTML(participant.nickname)}，你已站到 ${participant.side} 方`, `<article class="locked-side side-${participant.side.toLowerCase()}">
      <span class="side-letter mono">${participant.side} 方</span><strong>${escapeHTML(position)}</strong><small>立场已锁定，不能更换</small>
    </article>
    ${taskMarkup(participant.task)}`,
    `<div class="waiting-box compact"><span class="pulse-dot"></span><div><strong>${participant.task ? "任务已经发放" : "等主持人统一发放任务"}</strong><p>${participant.task ? "点击揭晓后收好任务，等待大屏幕开始辩论。" : "这个页面会自动更新，不需要刷新。"}</p></div></div>`);
}

function renderActive(data) {
  const { participant, session } = data;
  const topic = topicById(session.topicId);
  if (!topic) return renderProblem("今晚的辩论题目暂时无法读取。");
  const phaseCopy = {
    debate: ["辩论开始了", "把自己的理由说出来，也给队友留出开口的空间。"],
    response: ["现在进入回应", "先听懂对方最有力的理由，再回应。"],
    summary: ["今晚来到最后", "不必选赢家；看看你是否更懂两边。"]
  }[session.phase] || ["请看大屏幕", "跟随主持人的流程。"];
  shell(`YOU ARE ON SIDE ${participant.side}`, phaseCopy[0], `<article class="active-topic"><span>今晚的辩论题目</span><h2>${escapeHTML(topic.title)}</h2><strong class="side-pill side-${participant.side.toLowerCase()}">${participant.side} 方 · ${escapeHTML(topic.tension[participant.side === "A" ? 0 : 1])}</strong></article>
    ${taskMarkup(participant.task, true)}
    <p class="phase-copy">${phaseCopy[1]}</p>`);
}

function renderProblem(message) {
  shell("SOMETHING WENT WRONG", "暂时进不去", `<p class="center-copy">${escapeHTML(message)}</p><button class="primary-button" data-retry type="button">重新试一次</button>`);
}

function renderParticipantData(data) {
  if (data.participant.task?.id !== revealedTaskId && !taskRevealed) revealedTaskId = null;
  currentData = data;
  if (data.session.phase === "interests") {
    clearParticipantCredentials();
    clearVoteCredentials();
    renderVoteForm("主持人已经开始新一局，请重新匿名选择。");
  } else if (data.session.phase === "sides") renderSides(data);
  else renderActive(data);
}

function dataSignature(data, kind) {
  return `${kind}:${JSON.stringify(data)}`;
}

async function loadLatest({ showResetMessage = false } = {}) {
  if (!room) {
    setConnection(false, "NO ROOM");
    renderRoomEntry();
    return;
  }

  if (participantCredentials) {
    try {
      const data = await getParticipantSession(room, participantCredentials);
      const signature = dataSignature(data, "participant");
      setConnection(true);
      if (signature !== currentSignature) {
        currentSignature = signature;
        renderParticipantData(data);
      }
      return;
    } catch (error) {
      if (error.status !== 401 && error.status !== 404) throw error;
      clearParticipantCredentials();
      showResetMessage = true;
    }
  }

  if (voteCredentials) {
    try {
      const data = await validateVote(room, voteCredentials);
      const signature = dataSignature(data, "vote");
      setConnection(true);
      if (data.session.phase === "interests") {
        if (signature !== currentSignature) {
          currentSignature = signature;
          renderVoteWaiting(data.session);
        }
      } else {
        clearVoteCredentials();
        currentSignature = dataSignature({ session: data.session }, "public");
        renderSideJoin(data.session, showResetMessage ? "你的原站队记录已失效，请重新加入。" : "");
      }
      return;
    } catch (error) {
      if (error.status !== 401 && error.status !== 404) throw error;
      clearVoteCredentials();
      showResetMessage = true;
    }
  }

  const data = await getPublicSession(room);
  const signature = dataSignature(data, "public");
  setConnection(true, `ROOM ${room}`);
  if (signature !== currentSignature || showResetMessage) {
    currentSignature = signature;
    if (data.session.phase === "interests") {
      renderVoteForm(showResetMessage ? "这局已经更新，请重新匿名选择辩论题目。" : "");
    } else {
      renderSideJoin(data.session, showResetMessage ? "你的原站队记录已失效，请重新加入。" : "");
    }
  }
}

async function restore() {
  try {
    await loadLatest();
    if (room) startPolling();
  } catch (error) {
    setConnection(false, "OFFLINE");
    renderProblem(error.message || "无法连接房间。");
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = window.setInterval(refresh, POLL_INTERVAL);
}

async function refresh() {
  if (requestInFlight || !room) return;
  requestInFlight = true;
  try {
    await loadLatest();
  } catch (error) {
    setConnection(false);
    if (error.status === 404) {
      clearInterval(pollTimer);
      renderProblem("这个房间不存在或已经结束。");
    }
  } finally {
    requestInFlight = false;
  }
}

mobileApp.addEventListener("submit", async (event) => {
  if (event.target.id === "roomForm") {
    event.preventDefault();
    const nextRoom = event.target.elements.room.value.trim().toUpperCase();
    if (!/^[2-9A-HJ-NP-Z]{6}$/.test(nextRoom)) {
      const error = event.target.querySelector("#formError");
      error.textContent = "请输入投影上的六位房间码。";
      error.hidden = false;
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("room", nextRoom);
    window.location.replace(url);
    return;
  }

  if (event.target.id === "voteForm") {
    event.preventDefault();
    const form = event.target;
    const preferences = [...form.querySelectorAll('input[name="preferences"]:checked')].map((input) => input.value);
    const errorBox = form.querySelector("#formError");
    if (!preferences.length) {
      errorBox.textContent = "请至少选择一道感兴趣的辩论题目。";
      errorBox.hidden = false;
      return;
    }
    const button = form.querySelector("#submitVote");
    button.disabled = true;
    button.textContent = "正在匿名提交…";
    requestInFlight = true;
    try {
      const data = await submitVote(room, preferences);
      saveVoteCredentials(data.credentials, data.selectedCount);
      currentSignature = dataSignature({ ok: true, session: data.session }, "vote");
      setConnection(true);
      renderVoteWaiting(data.session);
    } catch (error) {
      errorBox.textContent = error.message || "暂时提交不了，请稍后再试。";
      errorBox.hidden = false;
      button.disabled = false;
      button.textContent = "匿名提交";
    } finally {
      requestInFlight = false;
    }
    return;
  }

  if (event.target.id !== "sideJoinForm") return;
  event.preventDefault();
  const form = event.target;
  const nickname = form.elements.nickname.value.trim();
  const side = form.elements.side.value;
  const errorBox = form.querySelector("#formError");
  if (!nickname || !side) {
    errorBox.textContent = !nickname ? "请先填写昵称。" : "请选择 A 方或 B 方。";
    errorBox.hidden = false;
    return;
  }
  const button = form.querySelector("#submitSide");
  button.disabled = true;
  button.textContent = "正在加入…";
  requestInFlight = true;
  try {
    const data = await joinSide(room, nickname, side);
    saveParticipantCredentials(data.credentials);
    clearVoteCredentials();
    currentSignature = dataSignature({ session: data.session, participant: data.participant }, "participant");
    setConnection(true);
    renderParticipantData({ session: data.session, participant: data.participant });
  } catch (error) {
    errorBox.textContent = error.message || "暂时无法加入，请稍后再试。";
    errorBox.hidden = false;
    button.disabled = false;
    button.textContent = "确认昵称和立场";
  } finally {
    requestInFlight = false;
  }
});

mobileApp.addEventListener("change", (event) => {
  const sideInput = event.target.closest('input[name="side"]');
  if (!sideInput) return;
  mobileApp.querySelectorAll(".side-choice").forEach((choice) => choice.classList.toggle("selected", choice.contains(sideInput)));
});

mobileApp.addEventListener("click", (event) => {
  if (event.target.closest("[data-reveal-task]") && currentData?.participant?.task) {
    taskRevealed = true;
    revealedTaskId = currentData.participant.task.id;
    if (currentData.session.phase === "sides") renderSides(currentData);
    else renderActive(currentData);
    return;
  }
  if (event.target.closest("[data-retry]")) restore();
});

restore();
