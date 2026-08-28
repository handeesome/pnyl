import { TOPICS } from "./topics.js";

const DEMO_PREFERENCES = Object.freeze([
  ["peace-or-decide", "pray-or-release", "sunday-overtime"],
  ["peace-or-decide", "private-or-public-conflict", "accept-loss-or-advocate"],
  ["peace-or-decide", "giving-or-pause", "truth-or-relationship"],
  ["peace-or-decide", "invite-or-respect-silence", "persist-or-pause-service"],
  ["pray-or-release", "share-or-stop", "private-or-public-conflict"],
  ["sunday-overtime", "giving-or-pause", "truth-or-relationship"],
  ["share-or-stop", "accept-loss-or-advocate", "persist-or-pause-service"],
  ["peace-or-decide", "sunday-overtime", "private-or-public-conflict"]
]);

const DEMO_PEOPLE = Object.freeze([
  { nickname: "小明", side: "A" },
  { nickname: "佳宁", side: "B" },
  { nickname: "思远", side: "A" },
  { nickname: "若琳", side: "B" },
  { nickname: "阿哲", side: "A" },
  { nickname: "安然", side: "B" },
  { nickname: "嘉文", side: "A" },
  { nickname: "乐彤", side: "B" }
]);

const DEMO_PHASES = new Set(["sides", "debate", "response", "summary"]);
const TOPIC_IDS = new Set(TOPICS.map((topic) => topic.id));

function buildPreferenceCounts() {
  const counts = Object.fromEntries(TOPICS.map((topic) => [topic.id, 0]));
  for (const preferences of DEMO_PREFERENCES) {
    for (const topicId of preferences) counts[topicId] += 1;
  }
  return counts;
}

export function createDemoSession(baseSession = {}) {
  return {
    session: {
      room: baseSession.room || "DEMO",
      phase: "interests",
      topicId: null,
      tasksAssigned: false,
      expiresAt: baseSession.expiresAt || null
    },
    participants: DEMO_PEOPLE.map((person, index) => ({
      id: `demo-participant-${index + 1}`,
      nickname: person.nickname,
      side: person.side,
      avatarIndex: index,
      joinedAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`
    })),
    voteCount: DEMO_PREFERENCES.length,
    preferenceCounts: buildPreferenceCounts()
  };
}

export function applyDemoAction(current, action, value = {}) {
  const next = {
    session: { ...current.session },
    participants: current.participants.map((participant) => ({ ...participant })),
    voteCount: current.voteCount,
    preferenceCounts: { ...current.preferenceCounts }
  };

  if (action === "select-topic") {
    if (!TOPIC_IDS.has(value.topicId)) throw new Error("请选择题库中的一道辩论题目。");
    next.session.topicId = value.topicId;
    next.session.phase = "sides";
    next.session.tasksAssigned = false;
  } else if (action === "assign-tasks") {
    if (next.session.phase !== "sides") throw new Error("只能在站队阶段发放任务。");
    if (next.participants.length === 0) throw new Error("还没有人完成站队。");
    next.session.tasksAssigned = true;
  } else if (action === "delete-participant") {
    next.participants = next.participants.filter((participant) => participant.id !== value.participantId);
  } else if (action === "set-phase") {
    if (!DEMO_PHASES.has(value.phase)) throw new Error("活动阶段无效。");
    if (!next.session.topicId) throw new Error("请先选择今晚的辩论题目。");
    if (value.phase === "debate" && !next.session.tasksAssigned) {
      throw new Error("请先确认站队完成并发放任务。");
    }
    next.session.phase = value.phase;
  } else if (action === "reset") {
    return createDemoSession(next.session);
  } else {
    throw new Error("未知的演示操作。");
  }

  return next;
}
