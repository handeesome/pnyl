import { HIDDEN_TASKS, TOPICS, supportTask } from "../public/topics.js";

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 12 * 1024;
const ROOM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_LENGTH = 6;
const PHASES = Object.freeze(["interests", "sides", "debate", "response", "summary"]);
const TOPIC_IDS = new Set(TOPICS.map((topic) => topic.id));
const INVISIBLE_FORMATTING = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/u;

class ValidationError extends Error {}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function methodNotAllowed(allowed) {
  return json({ error: "Method not allowed." }, 405, { Allow: allowed });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

async function parseJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ValidationError("Content-Type must be application/json.");
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new ValidationError("Request body is too large.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    throw new ValidationError("Request body is too large.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

function cleanNickname(value) {
  if (typeof value !== "string") throw new ValidationError("昵称格式不正确。");
  const cleaned = value.normalize("NFC").replace(INVISIBLE_FORMATTING, "").trim().replace(/\s+/gu, " ");
  if (!cleaned || Array.from(cleaned).length > 12 || CONTROL_CHARACTERS.test(cleaned)) {
    throw new ValidationError("昵称需要是 1–12 个字符。");
  }
  return cleaned;
}

function normalizePreferences(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > TOPICS.length) {
    throw new ValidationError("请至少选择一道感兴趣的辩论题目。");
  }
  if (value.some((topicId) => typeof topicId !== "string" || !TOPIC_IDS.has(topicId))) {
    throw new ValidationError("选择中包含不存在的辩论题目。");
  }
  if (new Set(value).size !== value.length) throw new ValidationError("辩论题目不能重复选择。");
  return [...value];
}

function normalizeSide(value) {
  if (!["A", "B"].includes(value)) throw new ValidationError("请选择 A 方或 B 方。");
  return value;
}

function sessionTtlMs() {
  return SESSION_TTL_MS;
}

function randomString(length, alphabet = ROOM_ALPHABET) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function randomIndex(length) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % length;
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function purgeExpired(db, now = new Date()) {
  const expired = "SELECT id FROM debate_sessions WHERE expires_at <= ?";
  await db.prepare(`DELETE FROM debate_task_releases WHERE session_id IN (${expired})`).bind(now.toISOString()).run();
  await db.prepare(`DELETE FROM debate_votes WHERE session_id IN (${expired})`).bind(now.toISOString()).run();
  await db.prepare(`DELETE FROM debate_participants WHERE session_id IN (${expired})`).bind(now.toISOString()).run();
  await db.prepare("DELETE FROM debate_sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
}

async function findSession(db, room, now) {
  return db.prepare(
    `SELECT id, host_token_hash, phase, topic_id, created_at, updated_at, expires_at,
      EXISTS(SELECT 1 FROM debate_task_releases WHERE session_id = debate_sessions.id) AS tasks_assigned
      FROM debate_sessions WHERE id = ? AND expires_at > ?`
  ).bind(room, now.toISOString()).first();
}

async function requireSession(db, room, now) {
  const session = await findSession(db, room, now);
  if (!session) return { response: json({ error: "这个房间不存在或已经结束。" }, 404) };
  return { session };
}

async function requireHost(request, db, room, now) {
  const found = await requireSession(db, room, now);
  if (found.response) return found;
  const supplied = request.headers.get("X-Host-Token");
  if (!supplied) return { response: json({ error: "需要主持人权限。" }, 401) };
  if (!secureEqual(await hashToken(supplied), found.session.host_token_hash)) {
    return { response: json({ error: "主持人权限无效。" }, 401) };
  }
  return found;
}

async function requireVote(request, db, room, now) {
  const found = await requireSession(db, room, now);
  if (found.response) return found;
  const voterId = request.headers.get("X-Voter-Id");
  const voterToken = request.headers.get("X-Voter-Token");
  if (!voterId || !voterToken) return { response: json({ error: "匿名投票凭证无效。" }, 401) };
  const vote = await db.prepare(
    "SELECT id, voter_token_hash FROM debate_votes WHERE id = ? AND session_id = ?"
  ).bind(voterId, room).first();
  if (!vote || !secureEqual(await hashToken(voterToken), vote.voter_token_hash)) {
    return { response: json({ error: "匿名投票凭证无效。" }, 401) };
  }
  return { session: found.session, vote };
}

async function requireParticipant(request, db, room, now) {
  const found = await requireSession(db, room, now);
  if (found.response) return found;
  const participantId = request.headers.get("X-Participant-Id");
  const participantToken = request.headers.get("X-Participant-Token");
  if (!participantId || !participantToken) {
    return { response: json({ error: "需要参与者凭证。" }, 401) };
  }
  const participant = await db.prepare(
    "SELECT id, nickname, side, task_id, task_title, task_prompt, avatar_index, joined_at, participant_token_hash FROM debate_participants WHERE id = ? AND session_id = ?"
  ).bind(participantId, room).first();
  if (!participant || !secureEqual(await hashToken(participantToken), participant.participant_token_hash)) {
    return { response: json({ error: "参与者凭证无效，请重新扫码加入。" }, 401) };
  }
  return { session: found.session, participant };
}

function publicSession(session) {
  return {
    room: session.id,
    phase: session.phase,
    topicId: session.topic_id || null,
    tasksAssigned: Boolean(session.tasks_assigned),
    expiresAt: session.expires_at
  };
}

function publicParticipant(participant) {
  return {
    id: participant.id,
    nickname: participant.nickname,
    side: participant.side,
    task: participant.task_id ? {
      id: participant.task_id,
      title: participant.task_title,
      prompt: participant.task_prompt
    } : null,
    avatarIndex: Number(participant.avatar_index),
    joinedAt: participant.joined_at
  };
}

function publicHostParticipant(participant) {
  const item = publicParticipant(participant);
  delete item.task;
  return item;
}

async function createSession(db, now) {
  const hostToken = crypto.randomUUID();
  const hostTokenHash = await hashToken(hostToken);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const room = randomString(ROOM_LENGTH);
    try {
      await db.prepare(
        "INSERT INTO debate_sessions (id, host_token_hash, phase, topic_id, created_at, updated_at, expires_at) VALUES (?, ?, 'interests', NULL, ?, ?, ?)"
      ).bind(room, hostTokenHash, createdAt, createdAt, expiresAt).run();
      return json({ room, hostToken, phase: "interests", expiresAt }, 201);
    } catch (error) {
      if (attempt === 5) throw error;
    }
  }
  return json({ error: "暂时无法创建房间。" }, 503);
}

async function listParticipants(db, room) {
  const query = await db.prepare(
    "SELECT id, nickname, side, task_id, task_title, task_prompt, avatar_index, joined_at FROM debate_participants WHERE session_id = ? ORDER BY joined_at ASC"
  ).bind(room).all();
  return (Array.isArray(query.results) ? query.results : []).map(publicHostParticipant);
}

async function aggregateVotes(db, room) {
  const query = await db.prepare(
    "SELECT preferences_json FROM debate_votes WHERE session_id = ? ORDER BY created_at ASC"
  ).bind(room).all();
  const rows = Array.isArray(query.results) ? query.results : [];
  const preferenceCounts = Object.fromEntries(TOPICS.map((topic) => [topic.id, 0]));
  for (const row of rows) {
    let preferences;
    try {
      preferences = normalizePreferences(JSON.parse(row.preferences_json));
    } catch {
      continue;
    }
    for (const topicId of preferences) preferenceCounts[topicId] += 1;
  }
  return { voteCount: rows.length, preferenceCounts };
}

async function hostPayload(db, session) {
  const [participants, votes] = await Promise.all([
    listParticipants(db, session.id),
    aggregateVotes(db, session.id)
  ]);
  return { session: publicSession(session), participants, ...votes };
}

async function getHostView(request, db, room, now) {
  const found = await requireHost(request, db, room, now);
  if (found.response) return found.response;
  return json(await hostPayload(db, found.session));
}

function chooseTask(participant, participants) {
  const teammates = participants.filter((item) => item.id !== participant.id && item.side === participant.side);
  const tasks = [...HIDDEN_TASKS];
  if (teammates.length) tasks.push(supportTask(teammates[randomIndex(teammates.length)].nickname));
  return tasks[randomIndex(tasks.length)];
}

async function assignTasks(db, room, now) {
  const query = await db.prepare(
    "SELECT id, nickname, side FROM debate_participants WHERE session_id = ? ORDER BY joined_at ASC"
  ).bind(room).all();
  const participants = Array.isArray(query.results) ? query.results : [];
  if (participants.length === 0) throw new ValidationError("还没有人完成站队。");
  for (const participant of participants) {
    const task = chooseTask(participant, participants);
    await db.prepare(
      "UPDATE debate_participants SET task_id = ?, task_title = ?, task_prompt = ?, updated_at = ? WHERE id = ? AND session_id = ?"
    ).bind(task.id, task.title, task.prompt, now.toISOString(), participant.id, room).run();
  }
  await db.prepare(
    "INSERT OR REPLACE INTO debate_task_releases (session_id, released_at) VALUES (?, ?)"
  ).bind(room, now.toISOString()).run();
}

async function updateHostView(request, db, room, now) {
  const found = await requireHost(request, db, room, now);
  if (found.response) return found.response;
  const body = await parseJson(request);
  if (!isPlainObject(body) || typeof body.action !== "string") {
    throw new ValidationError("主持操作格式不正确。");
  }
  const updatedAt = now.toISOString();

  if (body.action === "select-topic") {
    if (!hasExactKeys(body, ["action", "topicId"]) || !TOPIC_IDS.has(body.topicId)) {
      throw new ValidationError("请选择题库中的一道辩论题目。");
    }
    await db.prepare("DELETE FROM debate_task_releases WHERE session_id = ?").bind(room).run();
    await db.prepare(
      "UPDATE debate_sessions SET topic_id = ?, phase = 'sides', updated_at = ? WHERE id = ?"
    ).bind(body.topicId, updatedAt, room).run();
  } else if (body.action === "assign-tasks") {
    if (!hasExactKeys(body, ["action"]) || found.session.phase !== "sides") {
      throw new ValidationError("只能在站队阶段发放任务。");
    }
    await assignTasks(db, room, now);
  } else if (body.action === "delete-participant") {
    if (!hasExactKeys(body, ["action", "participantId"]) || typeof body.participantId !== "string") {
      throw new ValidationError("请选择要移除的参与者。");
    }
    const deletedParticipant = await db.prepare(
      "SELECT nickname FROM debate_participants WHERE id = ? AND session_id = ?"
    ).bind(body.participantId, room).first();
    await db.prepare("DELETE FROM debate_participants WHERE id = ? AND session_id = ?")
      .bind(body.participantId, room).run();
    if (deletedParticipant?.nickname && found.session.tasks_assigned) {
      const orphanedPrompt = supportTask(deletedParticipant.nickname).prompt;
      const affectedQuery = await db.prepare(
        "SELECT id FROM debate_participants WHERE session_id = ? AND task_id = 'support-teammate' AND task_prompt = ?"
      ).bind(room, orphanedPrompt).all();
      for (const affected of Array.isArray(affectedQuery.results) ? affectedQuery.results : []) {
        const replacement = HIDDEN_TASKS[randomIndex(HIDDEN_TASKS.length)];
        await db.prepare(
          "UPDATE debate_participants SET task_id = ?, task_title = ?, task_prompt = ?, updated_at = ? WHERE id = ? AND session_id = ?"
        ).bind(replacement.id, replacement.title, replacement.prompt, updatedAt, affected.id, room).run();
      }
    }
  } else if (body.action === "set-phase") {
    if (!hasExactKeys(body, ["action", "phase"]) || !PHASES.includes(body.phase) || body.phase === "interests") {
      throw new ValidationError("活动阶段无效。");
    }
    if (!found.session.topic_id) throw new ValidationError("请先选择今晚的辩论题目。");
    if (body.phase === "debate" && !found.session.tasks_assigned) {
      throw new ValidationError("请先确认站队完成并发放任务。");
    }
    await db.prepare("UPDATE debate_sessions SET phase = ?, updated_at = ? WHERE id = ?")
      .bind(body.phase, updatedAt, room).run();
  } else if (body.action === "reset") {
    if (!hasExactKeys(body, ["action"])) throw new ValidationError("重置操作格式不正确。");
    await db.prepare("DELETE FROM debate_task_releases WHERE session_id = ?").bind(room).run();
    await db.prepare("DELETE FROM debate_votes WHERE session_id = ?").bind(room).run();
    await db.prepare("DELETE FROM debate_participants WHERE session_id = ?").bind(room).run();
    await db.prepare("UPDATE debate_sessions SET phase = 'interests', topic_id = NULL, updated_at = ? WHERE id = ?")
      .bind(updatedAt, room).run();
  } else {
    throw new ValidationError("未知的主持操作。");
  }

  const session = await findSession(db, room, now);
  return json(await hostPayload(db, session));
}

async function recoverHost(request, env, room, now) {
  const found = await requireSession(env.DB, room, now);
  if (found.response) return found.response;
  if (typeof env.HOST_RECOVERY_CODE !== "string" || !env.HOST_RECOVERY_CODE) {
    return json({ error: "管理员恢复功能尚未配置。" }, 503);
  }
  const body = await parseJson(request);
  if (!hasExactKeys(body, ["recoveryCode"]) || typeof body.recoveryCode !== "string") {
    throw new ValidationError("请输入管理员恢复码。");
  }
  const [suppliedHash, expectedHash] = await Promise.all([
    hashToken(body.recoveryCode),
    hashToken(env.HOST_RECOVERY_CODE)
  ]);
  if (!secureEqual(suppliedHash, expectedHash)) {
    return json({ error: "房间码或管理员恢复码不正确。" }, 401);
  }
  const hostToken = crypto.randomUUID();
  await env.DB.prepare("UPDATE debate_sessions SET host_token_hash = ?, updated_at = ? WHERE id = ?")
    .bind(await hashToken(hostToken), now.toISOString(), room).run();
  return json({ room, hostToken, expiresAt: found.session.expires_at });
}

async function submitVote(request, db, room, now) {
  const found = await requireSession(db, room, now);
  if (found.response) return found.response;
  if (found.session.phase !== "interests") {
    return json({ error: "匿名选题已经结束，请直接选择立场加入。" }, 409);
  }
  const body = await parseJson(request);
  if (!hasExactKeys(body, ["preferences"])) throw new ValidationError("匿名选题格式不正确。");
  const preferences = normalizePreferences(body.preferences);
  const voterId = crypto.randomUUID();
  const voterToken = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO debate_votes (id, session_id, voter_token_hash, preferences_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(voterId, room, await hashToken(voterToken), JSON.stringify(preferences), now.toISOString()).run();
  return json({
    session: publicSession(found.session),
    credentials: { voterId, voterToken },
    selectedCount: preferences.length
  }, 201);
}

async function validateVote(request, db, room, now) {
  const found = await requireVote(request, db, room, now);
  if (found.response) return found.response;
  return json({ ok: true, session: publicSession(found.session) });
}

async function joinSide(request, db, room, now) {
  const found = await requireSession(db, room, now);
  if (found.response) return found.response;
  if (found.session.phase === "interests" || !found.session.topic_id) {
    return json({ error: "主持人还没有公布今晚的辩论题目。" }, 409);
  }
  const body = await parseJson(request);
  if (!hasExactKeys(body, ["nickname", "side"])) throw new ValidationError("站队提交格式不正确。");
  const nickname = cleanNickname(body.nickname);
  const side = normalizeSide(body.side);
  const participantId = crypto.randomUUID();
  const participantToken = crypto.randomUUID();
  const joinedAt = now.toISOString();
  const countRow = await db.prepare("SELECT COUNT(*) AS count FROM debate_participants WHERE session_id = ?")
    .bind(room).first();
  const avatarIndex = Number(countRow?.count || 0) % 12;
  let task = null;

  try {
    await db.prepare(
      "INSERT INTO debate_participants (id, session_id, participant_token_hash, nickname, nickname_key, preferences_json, side, task_id, task_title, task_prompt, avatar_index, joined_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, NULL, NULL, NULL, ?, ?, ?)"
    ).bind(
      participantId,
      room,
      await hashToken(participantToken),
      nickname,
      nickname.toLocaleLowerCase("zh-CN"),
      side,
      avatarIndex,
      joinedAt,
      joinedAt
    ).run();
  } catch (error) {
    if (/unique/i.test(String(error?.message || error))) {
      return json({ error: "这个昵称已经有人用了，请换一个。" }, 409);
    }
    throw error;
  }

  if (found.session.tasks_assigned) {
    const participantsQuery = await db.prepare(
      "SELECT id, nickname, side FROM debate_participants WHERE session_id = ? ORDER BY joined_at ASC"
    ).bind(room).all();
    const participants = Array.isArray(participantsQuery.results) ? participantsQuery.results : [];
    const current = participants.find((participant) => participant.id === participantId);
    task = chooseTask(current, participants);
    await db.prepare(
      "UPDATE debate_participants SET task_id = ?, task_title = ?, task_prompt = ? WHERE id = ? AND session_id = ?"
    ).bind(task.id, task.title, task.prompt, participantId, room).run();
  }

  const session = await findSession(db, room, now);
  return json({
    session: publicSession(session),
    participant: {
      id: participantId,
      nickname,
      side,
      task,
      avatarIndex,
      joinedAt
    },
    credentials: { participantId, participantToken }
  }, 201);
}

async function getParticipantView(request, db, room, now) {
  const found = await requireParticipant(request, db, room, now);
  if (found.response) return found.response;
  return json({ session: publicSession(found.session), participant: publicParticipant(found.participant) });
}

async function handleApi(request, env, now) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/sessions") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const body = await parseJson(request);
    if (!hasExactKeys(body, [])) throw new ValidationError("创建房间时不需要额外资料。");
    return createSession(env.DB, now);
  }

  const match = path.match(/^\/api\/sessions\/([2-9A-HJ-NP-Z]{6})\/(host|vote|join|participant|public|recover)$/);
  if (!match) return json({ error: "API route not found." }, 404);
  const [, room, resource] = match;

  if (resource === "host") {
    if (request.method === "GET") return getHostView(request, env.DB, room, now);
    if (request.method === "PATCH") return updateHostView(request, env.DB, room, now);
    return methodNotAllowed("GET, PATCH");
  }
  if (resource === "recover") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return recoverHost(request, env, room, now);
  }
  if (resource === "public") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const found = await requireSession(env.DB, room, now);
    return found.response || json({ session: publicSession(found.session) });
  }
  if (resource === "vote") {
    if (request.method === "POST") return submitVote(request, env.DB, room, now);
    if (request.method === "GET") return validateVote(request, env.DB, room, now);
    return methodNotAllowed("GET, POST");
  }
  if (resource === "join") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return joinSide(request, env.DB, room, now);
  }
  if (request.method === "GET") return getParticipantView(request, env.DB, room, now);
  return methodNotAllowed("GET");
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return new Response("Static assets binding is not configured.", { status: 503 });
      }
      return env.ASSETS.fetch(request);
    }
    if (!env.DB) return json({ error: "Database binding is not configured." }, 503);

    const now = new Date();
    try {
      await purgeExpired(env.DB, now);
      return await handleApi(request, env, now);
    } catch (error) {
      if (error instanceof ValidationError) return json({ error: error.message }, 400);
      console.error("Debate API request failed:", error instanceof Error ? error.message : "Unknown error");
      return json({ error: "Internal server error." }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    const scheduledAt = Number.isFinite(controller.scheduledTime)
      ? new Date(controller.scheduledTime)
      : new Date();
    ctx.waitUntil(purgeExpired(env.DB, scheduledAt));
  }
};

export default worker;
export { cleanNickname, normalizePreferences, normalizeSide, publicParticipant, sessionTtlMs };
