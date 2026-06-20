const CONTENT = window.ACTIVITY_CONTENT || {};
const STORAGE_KEY = CONTENT.storageKey || "fellowship-jeopardy-state:v1";
const SITE = CONTENT.site || {};
const STAGES = CONTENT.stages || [];
const HOME = CONTENT.home || {};
const GAME_ONE = CONTENT.gameOne || {};
const JEOPARDY = CONTENT.jeopardy || {};
const BOARD = JEOPARDY.board || [];
const CATEGORY_RULES = JEOPARDY.categoryRules || {};
const VALUES = JEOPARDY.values || [100, 200, 300, 400, 500];

if (SITE.documentTitle) {
  document.title = SITE.documentTitle;
}
    let state = loadState();
    let ui = {
      modal: null,
      editingParticipantId: null,
      activeCell: null,
      activeCategoryId: null,
      activeTeamId: null,
      teamDraft: null,
      timer: null,
      justRevealed: null,
      scoreFlashTeam: null,
      stableModalRender: false,
      spotlight: null
      };

    function defaultState() {
      return {
        version: 1,
        stage: "home",
        participants: [],
        seating: null,
        teams: null,
        currentTeam: "A",
        currentPickerId: null,
        pickerCounts: {},
        board: {}
      };
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return { ...defaultState(), ...parsed };
      } catch (error) {
        return defaultState();
      }
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function formatContent(template, values = {}) {
      return String(template ?? "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
    }

    function uid() {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    function participantById(id) {
      return state.participants.find((person) => person.id === id) || null;
    }

    function participantName(id) {
      return participantById(id)?.nickname || "暂无人员";
    }

    function otherTeam(teamId) {
      return teamId === "A" ? "B" : "A";
    }

    function teamById(teamId) {
      return state.teams?.[teamId] || null;
    }

    function teamName(teamId) {
      return teamById(teamId)?.name || `${teamId}队`;
    }

    function teamMembers(teamId) {
      const team = teamById(teamId);
      if (!team) return [];
      return team.memberIds
        .map((id) => participantById(id))
        .filter(Boolean);
    }

    function cellKey(categoryId, value) {
      return `${categoryId}:${value}`;
    }

    function categoryById(categoryId) {
      return BOARD.find((category) => category.id === categoryId);
    }

    function getPrompts(categoryId, value) {
      return categoryById(categoryId).prompts[value] || [];
    }

    function isSharedCell(category, value) {
      return Boolean(category.sharedValues?.includes(Number(value)));
    }

    function getCell(categoryId, value) {
      const category = categoryById(categoryId);
      const prompts = getPrompts(categoryId, value);
      const key = cellKey(categoryId, value);
      const saved = state.board[key] || {};
      const count = prompts.length;
      return {
        key,
        categoryId,
        value: Number(value),
        shared: isSharedCell(category, value),
        revealed: Array.from({ length: count }, (_, index) => Boolean(saved.revealed?.[index])),
        concealed: Array.from({ length: count }, (_, index) => Boolean(saved.concealed?.[index])),
        cardOwners: Array.from({ length: count }, (_, index) => saved.cardOwners?.[index] || null),
        helpers: saved.helpers || {},
        completed: Boolean(saved.completed)
      };
    }

    function ensureCell(categoryId, value) {
      const cell = getCell(categoryId, value);
      state.board[cell.key] = {
        revealed: cell.revealed,
        concealed: cell.concealed,
        cardOwners: cell.cardOwners,
        helpers: cell.helpers,
        completed: cell.completed
      };
      return state.board[cell.key];
    }

    function getDuration(categoryId, value) {
      if (categoryId !== "timed") return 0;
      if (Number(value) === 500) return 300;
      if (Number(value) === 400) return 90;
      return 60;
    }

    function formatTime(seconds) {
      const safe = Math.max(0, Number(seconds) || 0);
      const minutes = Math.floor(safe / 60);
      const rest = safe % 60;
      return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    }

    function render() {
      const app = document.getElementById("app");
      app.className = `app-shell${ui.stableModalRender ? " modal-refresh-stable" : ""}`;
      app.innerHTML = `
        ${renderHeader()}
        ${renderStage()}
        ${renderModal()}
        ${renderSpotlight()}
      `;
      ui.stableModalRender = false;
    }

    function renderInsideModal() {
      ui.stableModalRender = true;
      render();
    }

    function renderSpotlight() {
      if (!ui.spotlight) return "";
      return `
        <div class="spotlight" aria-live="polite">
          <div class="spotlight-card">
            <div class="spotlight-kicker mono">${escapeHtml(ui.spotlight.kicker)}</div>
            <h2 class="spotlight-title serif">${escapeHtml(ui.spotlight.title)}</h2>
            <div class="spotlight-lines">
              ${ui.spotlight.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
            </div>
          </div>
        </div>
      `;
    }

    function showSpotlight(kicker, title, lines = []) {
      const key = uid();
      ui.spotlight = { key, kicker, title, lines };
      if (ui.modal) renderInsideModal();
      else render();
      setTimeout(() => {
        if (ui.spotlight?.key === key) {
          ui.spotlight = null;
          if (ui.modal) renderInsideModal();
          else render();
        }
      }, 2000);
    }

    function renderHeader() {
      const nav = STAGES.map((stage) => `
        <button type="button" class="${state.stage === stage.id ? "active" : ""}" onclick="setStage('${stage.id}')">
          ${escapeHtml(stage.label)}
        </button>
      `).join("");
      const brandTitle = SITE.brandTitle || SITE.documentTitle || "活动";
      const brandSubtitle = SITE.brandSubtitle || "";

      return `
        <header class="topbar">
          <div class="topbar-main">
            <div class="brand">
              <div class="brand-title serif">${escapeHtml(brandTitle)}</div>
              ${brandSubtitle ? `<div class="brand-subtitle mono">${escapeHtml(brandSubtitle)}</div>` : ""}
            </div>
            <nav class="nav" aria-label="阶段导航">${nav}</nav>
            <div class="topbar-actions">
              <button type="button" class="soft-button" onclick="openParticipantModal()">添加人员</button>
              <button type="button" class="danger-button" onclick="resetActivity()">重置整场</button>
            </div>
          </div>
          ${state.stage === "jeopardy" && state.teams ? renderScoreStrip() : ""}
        </header>
      `;
    }

    function renderScoreStrip() {
      return `
        <div class="score-strip">
          ${renderTeamScore("A")}
          <div class="picker-panel">
            <span>当前选题人</span>
            <strong class="serif">${escapeHtml(participantName(state.currentPickerId))}</strong>
            <span>${escapeHtml(teamName(state.currentTeam))}</span>
          </div>
          ${renderTeamScore("B")}
        </div>
      `;
    }

    function renderTeamScore(teamId) {
      const team = teamById(teamId);
      return `
        <div class="team-score">
          <button type="button" class="team-name-button" onclick="openTeamModal('${teamId}')">
            <strong class="serif">${escapeHtml(team?.name || `${teamId}队`)}</strong>
            <span>${teamMembers(teamId).length} 人，点击查看成员</span>
          </button>
          <div class="score-number mono">${team?.score || 0}</div>
          <div class="score-controls" aria-label="${escapeHtml(team?.name || teamId)} 调分">
            <button type="button" onclick="addScore('${teamId}', 100)">+100</button>
            <button type="button" onclick="addScore('${teamId}', -100)">-100</button>
          </div>
        </div>
      `;
    }

    function renderStage() {
      if (state.stage === "game1") return renderGameOne();
      if (state.stage === "jeopardy") return renderJeopardy();
      return renderHome();
    }

    function renderHome() {
      const primaryAction = HOME.primaryAction || { label: "进入游戏一", stage: "game1" };
      const secondaryAction = HOME.secondaryAction || { label: "先添加人员" };
      const points = HOME.points || [];
      return `
        <main class="page hero">
          <section>
            <div class="eyebrow mono">${escapeHtml(HOME.eyebrow || "")}</div>
            <h1 class="serif">${escapeHtml(HOME.title || "")}</h1>
            <p class="hero-lede">${escapeHtml(HOME.lede || "")}</p>
            <div class="hero-points">
              ${points.map((point) => `
                <div class="point">
                  <strong class="serif">${escapeHtml(point.title)}</strong>
                  <span>${escapeHtml(point.body)}</span>
                </div>
              `).join("")}
            </div>
            <div class="game-actions">
              <button type="button" class="ink-button" onclick="setStage('${primaryAction.stage || "game1"}')">${escapeHtml(primaryAction.label)}</button>
              <button type="button" class="soft-button" onclick="openParticipantModal()">${escapeHtml(secondaryAction.label)}</button>
            </div>
          </section>
          <aside class="side-panel">
            <div class="section-head">
              <div>
                <h2 class="serif">${escapeHtml(HOME.participantPanelTitle || "参与人员")}</h2>
                <p class="muted">${escapeHtml(formatContent(HOME.participantPanelDescription, { count: state.participants.length }))}</p>
              </div>
            </div>
            ${renderParticipantList()}
          </aside>
        </main>
      `;
    }

    function renderParticipantList() {
      if (state.participants.length === 0) {
        return `<div class="empty-state">${escapeHtml(HOME.emptyParticipants || "还没有添加人员。")}</div>`;
      }

      return `
        <ul class="participant-list">
          ${state.participants.map((person, index) => `
            <li class="participant-row">
              <span class="person-index mono">${index + 1}</span>
              <strong>${escapeHtml(person.nickname)}</strong>
              <span class="row-actions">
                <button type="button" onclick="openParticipantModal('${person.id}')">改名</button>
                <button type="button" onclick="deleteParticipant('${person.id}')">删除</button>
              </span>
            </li>
          `).join("")}
        </ul>
      `;
    }

    function renderGameOne() {
      const nextAction = GAME_ONE.nextAction || { label: "进入 Jeopardy", stage: "jeopardy" };
      const rules = GAME_ONE.rules || [];
      return `
        <main class="page">
          <div class="section-head">
            <div>
              <div class="eyebrow mono">${escapeHtml(GAME_ONE.eyebrow || "")}</div>
              <h2 class="serif">${escapeHtml(GAME_ONE.title || "")}</h2>
              <p class="muted">${escapeHtml(GAME_ONE.description || "")}</p>
            </div>
            <button type="button" class="ink-button" onclick="setStage('${nextAction.stage || "jeopardy"}')">${escapeHtml(nextAction.label)}</button>
          </div>

          <div class="rules-grid">
            ${rules.map((rule) => `
              <div class="rule-tile">
                <strong class="serif"><span class="swatch" style="background:${escapeHtml(rule.hex)}"></span>${escapeHtml(rule.color)}</strong>
                <div class="muted">${escapeHtml(rule.prompt)}</div>
              </div>
            `).join("")}
          </div>

          <div class="game-actions">
            <button type="button" class="ink-button" onclick="assignSeats()">${escapeHtml(GAME_ONE.seatActionLabel || "分配座位")}</button>
            <button type="button" class="soft-button" onclick="openParticipantModal()">${escapeHtml(GAME_ONE.lateParticipantActionLabel || "添加人员")}</button>
            <span class="status-note">${escapeHtml(GAME_ONE.statusNote || "")}</span>
          </div>

          <section class="seating-wrap">
            <div class="section-head">
              <div>
                <h2 class="serif">${escapeHtml(GAME_ONE.seatingTitle || "座位")}</h2>
                <p class="muted">${escapeHtml(state.seating ? GAME_ONE.seatingReadyDescription : GAME_ONE.seatingEmptyDescription)}</p>
              </div>
            </div>
            ${renderSeating()}
          </section>
        </main>
      `;
    }

    function renderSeating() {
      if (!state.seating?.orderIds?.length) {
        return `<div class="empty-state">${escapeHtml(formatContent(GAME_ONE.emptySeating, { count: state.participants.length }))}</div>`;
      }

      const layout = buildSeatPositions(state.seating.orderIds);
      return `
        <div class="seating-diagram" style="--diagram-height:${layout.height}px; --seat-size:${layout.seatSize}px; --seat-font:${layout.fontSize}px; --table-height:${layout.tableHeight}px; --table-top:${layout.tableTop}%; ">
          <div class="u-table mono">${escapeHtml(GAME_ONE.tableLabel || "桌面")}</div>
          ${layout.seats.map((seat) => `
            <div class="seat-node" style="left:${seat.x}%; top:${seat.y}%;">
              <div class="seat-name serif">${escapeHtml(participantName(seat.id))}</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function buildSeatPositions(orderIds) {
      const n = orderIds.length;
      const seatSize = n <= 10 ? 112 : n <= 14 ? 100 : 88;
      const fontSize = n <= 10 ? 22 : n <= 14 ? 20 : 18;
      if (n === 1) {
        return {
          height: 360,
          seatSize,
          fontSize,
          tableHeight: 150,
          tableTop: 50,
          seats: [{ id: orderIds[0], x: 50, y: 78 }]
        };
      }

      const bottomCount = n <= 2 ? n : n <= 4 ? n : n === 5 ? 3 : 4;
      const remaining = Math.max(0, n - bottomCount);
      const leftCount = Math.ceil(remaining / 2);
      const rightCount = remaining - leftCount;
      const maxSide = Math.max(leftCount, rightCount, 1);
      const gap = n <= 12 ? 20 : 16;
      const topMargin = 22;
      const bottomBand = seatSize + 42;
      const height = Math.max(460, topMargin + maxSide * seatSize + (maxSide - 1) * gap + bottomBand);
      const sideStartY = topMargin + seatSize / 2;
      const sideStep = seatSize + gap;
      const bottomY = height - seatSize / 2 - 16;
      const tableTopPx = Math.max(42, sideStartY - seatSize * 0.36);
      const tableBottomPx = Math.max(tableTopPx + seatSize * 1.35, bottomY - seatSize * 0.68);
      const tableHeight = Math.round(tableBottomPx - tableTopPx);
      const tableTop = ((tableTopPx + tableHeight / 2) / height) * 100;
      const bottomStartX = bottomCount <= 2 ? 38 : bottomCount === 3 ? 30 : 25;
      const bottomEndX = 100 - bottomStartX;
      const seats = [];
      let cursor = 0;

      for (let i = 0; i < leftCount; i += 1) {
        seats.push({
          id: orderIds[cursor++],
          x: 15,
          y: ((sideStartY + i * sideStep) / height) * 100
        });
      }

      for (let i = 0; i < bottomCount && cursor < n; i += 1) {
        const ratio = bottomCount === 1 ? 0.5 : i / (bottomCount - 1);
        seats.push({
          id: orderIds[cursor++],
          x: bottomStartX + ratio * (bottomEndX - bottomStartX),
          y: (bottomY / height) * 100
        });
      }

      for (let i = rightCount - 1; i >= 0 && cursor < n; i -= 1) {
        seats.push({
          id: orderIds[cursor++],
          x: 85,
          y: ((sideStartY + i * sideStep) / height) * 100
        });
      }

      return { height, seatSize, fontSize, tableHeight, tableTop, bottomCount, seats };
    }

    function renderJeopardy() {
      return `
        <main class="page">
          <div class="section-head">
            <div>
              <div class="eyebrow mono">${escapeHtml(JEOPARDY.eyebrow || "")}</div>
              <h2 class="serif">${escapeHtml(JEOPARDY.title || "Jeopardy")}</h2>
              <p class="muted">${escapeHtml(JEOPARDY.description || "")}</p>
            </div>
            ${state.teams ? `<button type="button" class="soft-button" onclick="openTeamSetup(true)">${escapeHtml(JEOPARDY.regroupActionLabel || "重新随机分组")}</button>` : ""}
          </div>
          ${state.teams ? renderBoard() : `<div class="empty-state">${escapeHtml(JEOPARDY.setupEmpty || "")}</div><div class="game-actions"><button class="ink-button" onclick="openTeamSetup(true)">${escapeHtml(JEOPARDY.setupActionLabel || "开始分组")}</button></div>`}
        </main>
      `;
    }

    function renderBoard() {
      return `
        <div class="board-scroll">
          <div class="board">
            ${BOARD.map((category) => `
              <div class="board-column">
                <button type="button" class="category-button serif" onclick="openCategoryModal('${category.id}')">${escapeHtml(category.title)}</button>
                ${VALUES.map((value) => renderScoreCell(category, value)).join("")}
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    function renderScoreCell(category, value) {
      const cell = getCell(category.id, value);
      const status = cell.completed ? "done" : cell.revealed.some(Boolean) ? "in-progress" : "";
      const label = cell.completed ? "已翻开" : cell.revealed.some(Boolean) ? "进行中" : "点击选择";
      return `
        <button type="button" class="score-cell ${status}" onclick="openCell('${category.id}', ${value})">
          <strong class="mono">${value}</strong>
          <span>${label}</span>
        </button>
      `;
    }

    function renderModal() {
      if (ui.modal === "participant") return renderParticipantModal();
      if (ui.modal === "teamSetup") return renderTeamSetupModal(true);
      if (ui.modal === "category") return renderCategoryModal();
      if (ui.modal === "team") return renderTeamModal();
      if (ui.modal === "cell") return renderCellModal();
      return "";
    }

    function renderParticipantModal() {
      const editing = ui.editingParticipantId ? participantById(ui.editingParticipantId) : null;
      const teamsExist = Boolean(state.teams) && !editing;
      return `
        <div class="modal-backdrop" onclick="closeModal()">
          <section class="modal narrow-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
            <header class="modal-header">
              <h2 class="modal-title serif">${editing ? "修改昵称" : "添加人员"}</h2>
              <button type="button" class="close-button" onclick="closeModal()">关闭</button>
            </header>
            <form onsubmit="submitParticipant(event)">
              <div class="modal-body">
                <div class="field">
                  <label for="nickname">Nickname</label>
                  <input id="nickname" name="nickname" autocomplete="off" value="${escapeHtml(editing?.nickname || "")}" required maxlength="28" autofocus>
                </div>
                ${teamsExist ? `
                  <div class="field">
                    <label for="teamChoice">Jeopardy 已经分组，新人放到哪里？</label>
                    <select id="teamChoice" name="teamChoice">
                      <option value="none">只加入总名单</option>
                      <option value="A">加入 ${escapeHtml(teamName("A"))}</option>
                      <option value="B">加入 ${escapeHtml(teamName("B"))}</option>
                    </select>
                  </div>
                ` : ""}
              </div>
              <footer class="modal-footer">
                <span class="status-note">${editing ? "只会修改显示名称，不改变座位或队伍。" : "添加后会保存到本机浏览器。"}</span>
                <button type="submit" class="ink-button">${editing ? "保存" : "添加"}</button>
              </footer>
            </form>
          </section>
        </div>
      `;
    }

    function renderTeamSetupModal(canClose) {
      if (!ui.teamDraft) ui.teamDraft = createTeamDraft();
      const draft = ui.teamDraft;
      return `
        <div class="modal-backdrop" onclick="closeModal()">
          <section class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
            <header class="modal-header">
              <h2 class="modal-title serif">随机分组</h2>
              ${canClose ? `<button type="button" class="close-button" onclick="closeModal()">关闭</button>` : `<span class="status-note">确认分组后开始 Jeopardy</span>`}
            </header>
            <div class="modal-body">
              <p class="rule-text">系统会平衡人数随机分成两队。确认后，A 队随机一人先选题；之后每完成一格，两队自动轮换。</p>
              ${state.participants.length < 2 ? `<p class="empty-state">当前少于 2 人。仍然可以建队，但建议先添加人员。</p>` : ""}
              <div class="team-draft">
                ${renderDraftTeam("A", draft.A)}
                ${renderDraftTeam("B", draft.B)}
              </div>
            </div>
            <footer class="modal-footer">
              <button type="button" class="soft-button" onclick="randomizeTeamDraft()">重新随机</button>
              <button type="button" class="ink-button" onclick="confirmTeams()">确认分组</button>
            </footer>
          </section>
        </div>
      `;
    }

    function renderDraftTeam(teamId, ids) {
      return `
        <section class="team-block">
          <div class="field">
            <label for="teamName${teamId}">${teamId} 队名称</label>
            <input id="teamName${teamId}" value="${teamId}队" maxlength="18">
          </div>
          <h3 class="serif">${teamId} 队成员</h3>
          ${ids.length ? `
            <ul class="plain-list">
              ${ids.map((id, index) => `
                <li class="participant-row">
                  <span class="person-index mono">${index + 1}</span>
                  <strong>${escapeHtml(participantName(id))}</strong>
                  <span class="faint">随机</span>
                </li>
              `).join("")}
            </ul>
          ` : `<div class="empty-state">暂无成员</div>`}
        </section>
      `;
    }

    function renderCategoryModal() {
      const rule = CATEGORY_RULES[ui.activeCategoryId];
      if (!rule) return "";
      return `
        <div class="modal-backdrop" onclick="closeModal()">
          <section class="modal narrow-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
            <header class="modal-header">
              <h2 class="modal-title serif">${escapeHtml(rule.title)}</h2>
              <button type="button" class="close-button" onclick="closeModal()">关闭</button>
            </header>
            <div class="modal-body">
              <p class="rule-text">${escapeHtml(rule.rule)}</p>
              ${rule.example ? `<pre class="example-lines">${escapeHtml(rule.example)}</pre>` : ""}
            </div>
          </section>
        </div>
      `;
    }

    function renderTeamModal() {
      const team = teamById(ui.activeTeamId);
      if (!team) return "";
      return `
        <div class="modal-backdrop" onclick="closeModal()">
          <section class="modal narrow-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
            <header class="modal-header">
              <h2 class="modal-title serif">${escapeHtml(team.name)}</h2>
              <button type="button" class="close-button" onclick="closeModal()">关闭</button>
            </header>
            <div class="modal-body">
              <p class="rule-text">当前分数：<strong class="mono">${team.score}</strong></p>
              ${team.memberIds.length ? `
                <ul class="participant-list">
                  ${team.memberIds.map((id, index) => `
                    <li class="participant-row">
                      <span class="person-index mono">${index + 1}</span>
                      <strong>${escapeHtml(participantName(id))}</strong>
                      <span class="faint">${id === state.currentPickerId ? "当前选题人" : "成员"}</span>
                    </li>
                  `).join("")}
                </ul>
              ` : `<div class="empty-state">这个队伍暂时没有成员。</div>`}
            </div>
          </section>
        </div>
      `;
    }

    function renderCellModal() {
      if (!ui.activeCell) return "";
      const { categoryId, value } = ui.activeCell;
      const category = categoryById(categoryId);
      const prompts = getPrompts(categoryId, value);
      const cell = getCell(categoryId, value);
      const canFinish = cell.revealed.every(Boolean);
      const alreadyDone = cell.completed;
      const timerHtml = categoryId === "timed" ? renderTimer(categoryId, value) : "";
      const footerNote = alreadyDone ? "这一格已经完成，可以复看内容。" : canFinish ? "两张卡已经翻开，可以完成并切换到下一队。" : "可以返回，不会强制翻开剩余卡片。";

      return `
        <div class="modal-backdrop" onclick="closeModal()">
          <section class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
            <header class="modal-header">
              <div>
                <div class="eyebrow mono">${escapeHtml(category.title)} · ${value}</div>
                <h2 class="modal-title serif">${cell.shared ? "两队共同题" : "两张隐藏卡"}</h2>
              </div>
              <button type="button" class="close-button" onclick="closeModal()">返回</button>
            </header>
            <div class="modal-body">
              ${renderPopupScoreControls()}
              <div class="prompt-grid">
                ${prompts.map((prompt, index) => renderPromptCard(categoryId, value, prompt, index, cell)).join("")}
              </div>
            </div>
            <footer class="modal-footer">
              ${timerHtml || `<span class="status-note">${footerNote}</span>`}
              <div class="game-actions" style="margin:0">
                <button type="button" class="soft-button" onclick="closeModal()">返回</button>
                <button type="button" class="ink-button" onclick="finishCell()" ${alreadyDone || !canFinish ? "disabled" : ""}>完成</button>
              </div>
            </footer>
          </section>
        </div>
      `;
    }

    function renderPopupScoreControls() {
      if (!state.teams) return "";
      return `
        <div class="popup-score-controls">
          <span class="status-note">手动计分</span>
          <strong class="serif popup-score-team ${ui.scoreFlashTeam === "A" ? "score-flash" : ""}">${escapeHtml(teamName("A"))}: <span class="mono">${state.teams.A.score}</span></strong>
          <div class="score-controls">
            <button type="button" onclick="addScore('A', 100, true)">+100</button>
            <button type="button" onclick="addScore('A', -100, true)">-100</button>
          </div>
          <strong class="serif popup-score-team ${ui.scoreFlashTeam === "B" ? "score-flash" : ""}">${escapeHtml(teamName("B"))}: <span class="mono">${state.teams.B.score}</span></strong>
          <div class="score-controls">
            <button type="button" onclick="addScore('B', 100, true)">+100</button>
            <button type="button" onclick="addScore('B', -100, true)">-100</button>
          </div>
        </div>
      `;
    }

    function renderTimer(categoryId, value) {
      const duration = getDuration(categoryId, value);
      if (!duration) return "";
      if (!ui.timer || ui.timer.key !== cellKey(categoryId, value)) {
        resetTimerState(categoryId, value);
      }
      return `
        <div class="footer-timer">
          <div class="timer-time mono" data-timer-time>${formatTime(ui.timer.remaining)}</div>
          <button type="button" class="ink-button" onclick="startTimer()">${ui.timer.running ? "继续中" : "开始"}</button>
          <button type="button" class="soft-button" onclick="pauseTimer()">暂停</button>
          <button type="button" class="soft-button" onclick="resetTimer()">重置</button>
          <span class="status-note">${Number(value) === 500 ? "共同题：两队各自讨论并设计方案，不需要抽起始人。" : "读完题目后再开始倒数。"}</span>
        </div>
      `;
    }

    function renderPromptCard(categoryId, value, prompt, index, cell) {
      const revealed = cell.revealed[index];
      const owner = predictedOwner(cell, index);
      const concealed = cell.concealed[index];
      const helperKey = `${index}`;
      const helper = cell.helpers[helperKey] || {};

      if (!revealed) {
        if (needsPreRevealHelper(categoryId)) {
          return renderPreRevealHelper(categoryId, value, index, owner, helper);
        }
        const helperLabel = cell.shared ? "共同题" : cell.revealed.some(Boolean) ? `${escapeHtml(teamName(otherTeam(state.currentTeam)))} 待选` : "空白卡片";
        return `
          <div class="prompt-card blank">
            <button type="button" class="blank-card-button" onclick="revealCard(${index})">
              <span>
                <strong class="serif">点击翻开</strong>
                <span class="muted">${helperLabel}</span>
              </span>
            </button>
          </div>
        `;
      }

      if (concealed) {
        return `
          <div class="prompt-card">
            <div class="covered">
              <div>
                <div class="eyebrow mono">${escapeHtml(ownerLabel(owner))}</div>
                <h3 class="serif">白板已盖回</h3>
                <p>题目内容暂时隐藏，方便其他队友重新面向大屏。</p>
                <button type="button" class="soft-button" onclick="toggleConceal(${index})">重新显示</button>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="prompt-card">
          <article class="card-face ${ui.justRevealed === `${cell.key}:${index}` ? "reveal-animate" : ""}">
            <div class="card-owner mono">
              <span>${escapeHtml(ownerLabel(owner))}</span>
              <span>Card ${index + 1}</span>
            </div>
            ${renderPromptContent(categoryId, prompt, helper)}
            ${renderHelper(categoryId, value, index, owner, helper)}
          </article>
        </div>
      `;
    }

    function predictedOwner(cell, index) {
      if (cell.shared) return "shared";
      if (cell.cardOwners[index]) return cell.cardOwners[index];
      return cell.revealed.some(Boolean) ? otherTeam(state.currentTeam) : state.currentTeam;
    }

    function needsPreRevealHelper(categoryId) {
      return categoryId === "teammate" || categoryId === "taboo" || categoryId === "story";
    }

    function helperReady(categoryId, helper) {
      if (categoryId === "teammate") return Array.isArray(helper.pair) && helper.pair.length === 2;
      if (categoryId === "taboo") return Boolean(helper.describer);
      if (categoryId === "story") return Boolean(helper.roles?.five && helper.roles?.three && helper.roles?.two);
      return true;
    }

    function renderPreRevealHelper(categoryId, value, index, owner, helper) {
      const ready = helperReady(categoryId, helper);
      const ownerText = owner === "shared" ? "两队共同题" : teamName(owner);
      let title = "先完成随机";
      let body = "";
      let action = "";

      if (categoryId === "teammate") {
        title = "先随机回答者和被了解者";
        body = ready
          ? `${participantName(helper.pair[0])} 回答，${participantName(helper.pair[1])} 提前写下答案。`
          : `${ownerText} 需要先抽出两个人。`;
        action = `<button type="button" class="soft-button" onclick="drawTeammatePair(${index})">随机回答者 / 被了解者</button>`;
      } else if (categoryId === "taboo") {
        title = "先随机描述者";
        body = ready
          ? `描述者：${participantName(helper.describer)}。描述者可以看题，其他人暂时不要看。`
          : `${ownerText} 需要先抽出一位描述者。`;
        action = `<button type="button" class="soft-button" onclick="drawDescriber(${index})">随机描述者</button>`;
      } else if (categoryId === "story") {
        title = "先随机五三二分工";
        body = ready
          ? `5字：${participantName(helper.roles.five)}，3字：${participantName(helper.roles.three)}，2字：${participantName(helper.roles.two)}。`
          : `${ownerText} 需要先抽出三位成员。`;
        action = `<button type="button" class="soft-button" onclick="drawStoryRoles(${index})">随机 5 / 3 / 2</button>`;
      }

      return `
        <div class="prompt-card blank">
          <div class="pre-reveal">
            <div>
              <div class="eyebrow mono">${escapeHtml(ownerText)}</div>
              <h3 class="serif">${escapeHtml(title)}</h3>
              <p class="helper-line">${escapeHtml(body)}</p>
              <div class="game-actions" style="justify-content:center">
                ${action}
                <button type="button" class="ink-button" onclick="revealCard(${index})" ${ready ? "" : "disabled"}>翻开题目</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderPromptContent(categoryId, prompt, helper = {}) {
      if (categoryId === "teammate") {
        return `<div class="prompt-text serif">${escapeHtml(formatTeammatePrompt(prompt, helper))}</div>`;
      }
      if (categoryId === "taboo" && typeof prompt === "object") {
        return `
          <div class="prompt-text serif">${escapeHtml(prompt.text)}</div>
          <div class="forbidden-list">
            禁词：${prompt.forbidden.map(escapeHtml).join("、")}
          </div>
        `;
      }
      return `<div class="prompt-text serif">${escapeHtml(prompt)}</div>`;
    }

    function formatTeammatePrompt(prompt, helper) {
      if (!Array.isArray(helper.pair) || helper.pair.length < 2) return String(prompt);
      const answerer = participantName(helper.pair[0]);
      const subject = participantName(helper.pair[1]);
      const question = String(prompt).replace(/^B/, subject);
      return `${answerer}回答：${question}`;
    }

    function renderHelper(categoryId, value, index, owner, helper = null) {
      if (!owner || owner === "shared") {
        return categoryId === "timed" && Number(value) === 500
          ? `<div class="helper-panel"><div class="helper-line">共同题不抽人。两队各自讨论 5 分钟后给出方案。</div></div>`
          : "";
      }

      if (!helper) {
        const cell = getCell(ui.activeCell.categoryId, ui.activeCell.value);
        helper = cell.helpers[`${index}`] || {};
      }

      if (categoryId === "teammate") {
        return `
          <div class="helper-panel">
            <div class="helper-line">${helper.pair ? `${escapeHtml(participantName(helper.pair[0]))} 回答，${escapeHtml(participantName(helper.pair[1]))} 提前写下答案。` : "已经翻开。若这里没有人名，返回后重新抽人。"}</div>
          </div>
        `;
      }

      if (categoryId === "taboo") {
        return `
          <div class="helper-panel">
            <div class="game-actions" style="margin:0">
              <button type="button" class="soft-button" onclick="toggleConceal(${index})">盖回白板</button>
            </div>
            <div class="helper-line">${helper.describer ? `描述者：${escapeHtml(participantName(helper.describer))}` : "先让描述者看题，看完后可以盖回白板。"}</div>
          </div>
        `;
      }

      if (categoryId === "timed") {
        return `
          <div class="helper-panel">
            <button type="button" class="soft-button" onclick="drawStarter(${index})">随机起始人</button>
            <div class="helper-line">${helper.starter ? `从 ${escapeHtml(participantName(helper.starter))} 开始，队伍按座位或站位顺序轮流。` : "抽一个起始人，然后队伍轮流说。"}</div>
          </div>
        `;
      }

      if (categoryId === "story") {
        const roles = helper.roles;
        return `
          <div class="helper-panel">
            <div class="helper-line">${
              roles
                ? `5字：${escapeHtml(participantName(roles.five))}，3字：${escapeHtml(participantName(roles.three))}，2字：${escapeHtml(participantName(roles.two))}`
                : "从本队随机三个人，分别负责 5 字、3 字、2 字。"
            }</div>
          </div>
        `;
      }

      return "";
    }

    function ownerLabel(owner) {
      if (owner === "shared") return "两队共同题";
      if (!owner) return "未分配";
      return `${teamName(owner)} 的题`;
    }

    function setStage(stage) {
      state.stage = stage;
      saveState();
      closeTimer();
      ui.modal = null;
      ui.activeCell = null;
      if (stage === "jeopardy" && !state.teams) {
        ui.teamDraft = createTeamDraft();
        ui.modal = "teamSetup";
      }
      render();
    }

    function openParticipantModal(id = null) {
      ui.modal = "participant";
      ui.editingParticipantId = id;
      closeTimer();
      render();
      setTimeout(() => document.getElementById("nickname")?.focus(), 0);
    }

    function submitParticipant(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const nickname = form.nickname.value.trim();
      if (!nickname) return;

      const duplicate = state.participants.some((person) =>
        person.nickname.trim().toLowerCase() === nickname.toLowerCase() &&
        person.id !== ui.editingParticipantId
      );
      if (duplicate && !confirm("这个 nickname 已经存在，仍然继续吗？")) return;

      if (ui.editingParticipantId) {
        const person = participantById(ui.editingParticipantId);
        if (person) person.nickname = nickname;
      } else {
        const id = uid();
        state.participants.push({ id, nickname, createdAt: Date.now() });
        const teamChoice = form.teamChoice?.value;
        if (state.teams && (teamChoice === "A" || teamChoice === "B")) {
          state.teams[teamChoice].memberIds.push(id);
          if (state.currentTeam === teamChoice && !state.currentPickerId) {
            state.currentPickerId = choosePicker(teamChoice);
          }
        }
      }

      saveState();
      if (ui.editingParticipantId) {
        closeModal();
      } else {
        renderInsideModal();
        setTimeout(() => document.getElementById("nickname")?.focus(), 0);
      }
    }

    function deleteParticipant(id) {
      const person = participantById(id);
      if (!person) return;
      if (!confirm(`确定删除 ${person.nickname} 吗？`)) return;

      state.participants = state.participants.filter((item) => item.id !== id);
      if (state.seating) {
        state.seating.orderIds = state.seating.orderIds.filter((item) => item !== id);
      }
      if (state.teams) {
        for (const teamId of ["A", "B"]) {
          state.teams[teamId].memberIds = state.teams[teamId].memberIds.filter((item) => item !== id);
        }
      }
      delete state.pickerCounts[id];
      if (state.currentPickerId === id) {
        state.currentPickerId = choosePicker(state.currentTeam);
      }
      saveState();
      render();
    }

    function resetActivity() {
      if (!confirm("确定重置整场活动吗？所有人员、分组、分数和翻牌进度都会清空。")) return;
      closeTimer();
      state = defaultState();
      localStorage.removeItem(STORAGE_KEY);
      ui = {
        modal: null,
        editingParticipantId: null,
        activeCell: null,
        activeCategoryId: null,
        activeTeamId: null,
        teamDraft: null,
        timer: null,
        justRevealed: null,
        scoreFlashTeam: null,
        stableModalRender: false,
        spotlight: null
      };
      render();
    }

    function assignSeats() {
      if (state.participants.length === 0) {
        alert("请先添加人员。");
        return;
      }
      state.seating = {
        orderIds: shuffle(state.participants.map((person) => person.id)),
        generatedAt: Date.now()
      };
      saveState();
      render();
    }

    function openTeamSetup(force = false) {
      if (state.teams && !confirm("已经有分组了，要重新随机分组吗？这会保留人员名单，但清空队伍分数和 Jeopardy 翻牌进度。")) return;
      ui.teamDraft = createTeamDraft();
      ui.modal = "teamSetup";
      closeTimer();
      render();
    }

    function createTeamDraft() {
      const ids = shuffle(state.participants.map((person) => person.id));
      return {
        A: ids.filter((_, index) => index % 2 === 0),
        B: ids.filter((_, index) => index % 2 === 1)
      };
    }

    function randomizeTeamDraft() {
      ui.teamDraft = createTeamDraft();
      render();
    }

    function confirmTeams() {
      if (!ui.teamDraft) ui.teamDraft = createTeamDraft();
      const aName = document.getElementById("teamNameA")?.value.trim() || "A队";
      const bName = document.getElementById("teamNameB")?.value.trim() || "B队";

      state.teams = {
        A: { id: "A", name: aName, memberIds: [...ui.teamDraft.A], score: 0 },
        B: { id: "B", name: bName, memberIds: [...ui.teamDraft.B], score: 0 }
      };
      state.currentTeam = "A";
      state.currentPickerId = choosePicker("A");
      state.board = {};
      saveState();
      closeModal();
    }

    function choosePicker(teamId) {
      const ids = teamMembers(teamId).map((person) => person.id);
      if (!ids.length) return null;
      const counts = state.pickerCounts || {};
      const min = Math.min(...ids.map((id) => counts[id] || 0));
      const candidates = ids.filter((id) => (counts[id] || 0) === min);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      counts[chosen] = (counts[chosen] || 0) + 1;
      state.pickerCounts = counts;
      return chosen;
    }

    function openCategoryModal(categoryId) {
      ui.modal = "category";
      ui.activeCategoryId = categoryId;
      closeTimer();
      render();
    }

    function openTeamModal(teamId) {
      ui.modal = "team";
      ui.activeTeamId = teamId;
      closeTimer();
      render();
    }

    function addScore(teamId, delta, flash = false) {
      if (!state.teams?.[teamId]) return;
      state.teams[teamId].score += delta;
      if (flash) {
        ui.scoreFlashTeam = teamId;
      }
      saveState();
      if (ui.modal) renderInsideModal();
      else render();
      if (flash) ui.scoreFlashTeam = null;
    }

    function openCell(categoryId, value) {
      if (!state.teams) {
        openTeamSetup(true);
        return;
      }
      ui.activeCell = { categoryId, value: Number(value) };
      ui.modal = "cell";
      ui.justRevealed = null;
      ui.scoreFlashTeam = null;
      resetTimerState(categoryId, value);
      render();
    }

    function revealCard(index) {
      if (!ui.activeCell) return;
      const { categoryId, value } = ui.activeCell;
      const fullCell = getCell(categoryId, value);
      const helper = fullCell.helpers[String(index)] || {};
      if (needsPreRevealHelper(categoryId) && !helperReady(categoryId, helper)) {
        alert("请先完成这张卡片的随机抽人。");
        return;
      }
      const cell = ensureCell(categoryId, value);
      if (cell.revealed[index]) return;

      const category = categoryById(categoryId);
      const shared = isSharedCell(category, value);
      const revealedCount = cell.revealed.filter(Boolean).length;
      cell.revealed[index] = true;
      cell.concealed[index] = false;
      cell.cardOwners[index] = shared
        ? "shared"
        : revealedCount === 0
          ? state.currentTeam
          : otherTeam(state.currentTeam);
      if (fullCell.cardOwners[index]) {
        cell.cardOwners[index] = fullCell.cardOwners[index];
      }
      ui.justRevealed = `${cellKey(categoryId, value)}:${index}`;
      saveState();
      renderInsideModal();
      ui.justRevealed = null;
    }

    function finishCell() {
      if (!ui.activeCell) return;
      const { categoryId, value } = ui.activeCell;
      const cell = ensureCell(categoryId, value);
      if (cell.completed) {
        closeModal();
        return;
      }
      if (!cell.revealed.every(Boolean)) return;

      cell.completed = true;
      state.currentTeam = otherTeam(state.currentTeam);
      state.currentPickerId = choosePicker(state.currentTeam);
      const nextTeamName = teamName(state.currentTeam);
      const nextPickerName = participantName(state.currentPickerId);
      saveState();
      closeModal();
      showSpotlight("下一位选题人", nextPickerName, [nextTeamName]);
    }

    function helperOwner(index) {
      if (!ui.activeCell) return null;
      const cell = getCell(ui.activeCell.categoryId, ui.activeCell.value);
      return predictedOwner(cell, index);
    }

    function updateHelper(index, updater) {
      if (!ui.activeCell) return;
      const fullCell = getCell(ui.activeCell.categoryId, ui.activeCell.value);
      const cell = ensureCell(ui.activeCell.categoryId, ui.activeCell.value);
      const key = String(index);
      if (!cell.cardOwners[index]) {
        cell.cardOwners[index] = predictedOwner(fullCell, index);
      }
      cell.helpers[key] = cell.helpers[key] || {};
      updater(cell.helpers[key]);
      saveState();
      renderInsideModal();
    }

    function pickFromOwner(index, count) {
      const owner = helperOwner(index);
      const ids = teamMembers(owner).map((person) => person.id);
      if (ids.length < count) {
        alert(`这个队伍至少需要 ${count} 人才能随机。`);
        return null;
      }
      return shuffle(ids).slice(0, count);
    }

    function drawTeammatePair(index) {
      const picked = pickFromOwner(index, 2);
      if (!picked) return;
      updateHelper(index, (helper) => {
        helper.pair = picked;
      });
      showSpotlight("队友了解", "随机结果", [
        `回答者：${participantName(picked[0])}`,
        `被了解者：${participantName(picked[1])}`
      ]);
    }

    function drawDescriber(index) {
      const picked = pickFromOwner(index, 1);
      if (!picked) return;
      updateHelper(index, (helper) => {
        helper.describer = picked[0];
      });
      showSpotlight("禁词描述", participantName(picked[0]), ["描述者"]);
    }

    function drawStarter(index) {
      const picked = pickFromOwner(index, 1);
      if (!picked) return;
      updateHelper(index, (helper) => {
        helper.starter = picked[0];
      });
      showSpotlight("限时说出", participantName(picked[0]), ["起始人"]);
    }

    function drawStoryRoles(index) {
      const picked = pickFromOwner(index, 3);
      if (!picked) return;
      updateHelper(index, (helper) => {
        helper.roles = { five: picked[0], three: picked[1], two: picked[2] };
      });
      showSpotlight("五三二圣经故事", "随机分工", [
        `5字：${participantName(picked[0])}`,
        `3字：${participantName(picked[1])}`,
        `2字：${participantName(picked[2])}`
      ]);
    }

    function toggleConceal(index) {
      if (!ui.activeCell) return;
      const cell = ensureCell(ui.activeCell.categoryId, ui.activeCell.value);
      if (!cell.revealed[index]) return;
      cell.concealed[index] = !cell.concealed[index];
      saveState();
      renderInsideModal();
    }

    function resetTimerState(categoryId, value) {
      closeTimer();
      const duration = getDuration(categoryId, value);
      if (!duration) {
        ui.timer = null;
        return;
      }
      ui.timer = {
        key: cellKey(categoryId, value),
        duration,
        remaining: duration,
        running: false,
        handle: null
      };
    }

    function startTimer() {
      if (!ui.timer || ui.timer.running) return;
      ui.timer.running = true;
      ui.timer.handle = setInterval(() => {
        if (!ui.timer) return;
        ui.timer.remaining = Math.max(0, ui.timer.remaining - 1);
        if (ui.timer.remaining === 0) {
          pauseTimer(false);
        }
        updateTimerDisplay();
      }, 1000);
      renderInsideModal();
    }

    function updateTimerDisplay() {
      const el = document.querySelector("[data-timer-time]");
      if (el && ui.timer) el.textContent = formatTime(ui.timer.remaining);
    }

    function pauseTimer(shouldRender = true) {
      if (!ui.timer) return;
      if (ui.timer.handle) clearInterval(ui.timer.handle);
      ui.timer.handle = null;
      ui.timer.running = false;
      if (shouldRender) renderInsideModal();
    }

    function resetTimer() {
      if (!ui.timer) return;
      pauseTimer(false);
      ui.timer.remaining = ui.timer.duration;
      renderInsideModal();
    }

    function closeTimer() {
      if (ui.timer?.handle) clearInterval(ui.timer.handle);
      ui.timer = null;
    }

    function closeModal() {
      closeTimer();
      ui.modal = null;
      ui.editingParticipantId = null;
      ui.activeCell = null;
      ui.activeCategoryId = null;
      ui.activeTeamId = null;
      ui.justRevealed = null;
      ui.scoreFlashTeam = null;
      render();
    }

    window.setStage = setStage;
    window.openParticipantModal = openParticipantModal;
    window.submitParticipant = submitParticipant;
    window.deleteParticipant = deleteParticipant;
    window.resetActivity = resetActivity;
    window.assignSeats = assignSeats;
    window.openTeamSetup = openTeamSetup;
    window.randomizeTeamDraft = randomizeTeamDraft;
    window.confirmTeams = confirmTeams;
    window.openCategoryModal = openCategoryModal;
    window.openTeamModal = openTeamModal;
    window.addScore = addScore;
    window.openCell = openCell;
    window.revealCard = revealCard;
    window.finishCell = finishCell;
    window.drawTeammatePair = drawTeammatePair;
    window.drawDescriber = drawDescriber;
    window.drawStarter = drawStarter;
    window.drawStoryRoles = drawStoryRoles;
    window.toggleConceal = toggleConceal;
    window.startTimer = startTimer;
    window.pauseTimer = pauseTimer;
    window.resetTimer = resetTimer;
    window.closeModal = closeModal;

    render();

