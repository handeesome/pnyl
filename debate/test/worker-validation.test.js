import assert from "node:assert/strict";
import test from "node:test";

import { cleanNickname, normalizePreferences, normalizeSide, publicParticipant, sessionTtlMs } from "../src/worker.js";

test("keeps rooms alive for six hours", () => {
  assert.equal(sessionTtlMs(), 6 * 60 * 60 * 1000);
});

test("normalizes valid nicknames and rejects invisible or oversized names", () => {
  assert.equal(cleanNickname("  小  明  "), "小 明");
  assert.equal(cleanNickname("佳宁\u200B"), "佳宁");
  assert.throws(() => cleanNickname(""));
  assert.throws(() => cleanNickname("这是一个超过十二个字符长度限制的昵称"));
});

test("accepts one or more unique topic preferences", () => {
  assert.deepEqual(normalizePreferences(["peace-or-decide", "pray-or-release"]), ["peace-or-decide", "pray-or-release"]);
  assert.throws(() => normalizePreferences([]));
  assert.throws(() => normalizePreferences(["not-a-topic"]));
  assert.throws(() => normalizePreferences(["pray-or-release", "pray-or-release"]));
});

test("accepts only the two locked debate sides", () => {
  assert.equal(normalizeSide("A"), "A");
  assert.equal(normalizeSide("B"), "B");
  assert.throws(() => normalizeSide("C"));
  assert.throws(() => normalizeSide(null));
});

test("serializes the private participant task for the phone", () => {
  const participant = publicParticipant({
    id: "p1",
    nickname: "小明",
    side: "A",
    task_id: "name-the-cost",
    task_title: "本方拆台员",
    task_prompt: "说出本方代价。",
    avatar_index: 2,
    joined_at: "2026-08-28T00:00:00.000Z"
  });
  assert.equal(participant.side, "A");
  assert.equal(participant.task.title, "本方拆台员");
  assert.equal("preferences" in participant, false);
});
