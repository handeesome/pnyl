import assert from "node:assert/strict";
import test from "node:test";
import { applyDemoAction, createDemoSession } from "../public/demo.js";

test("creates a balanced local demo without changing the real session", () => {
  const realSession = { room: "ABC234", phase: "interests", expiresAt: "2026-01-01T06:00:00.000Z" };
  const demo = createDemoSession(realSession);

  assert.equal(demo.session.room, realSession.room);
  assert.equal(demo.voteCount, 8);
  assert.equal(demo.participants.length, 8);
  assert.equal(demo.participants.filter((person) => person.side === "A").length, 4);
  assert.equal(demo.participants.filter((person) => person.side === "B").length, 4);
  assert.equal(demo.preferenceCounts["accept-or-confront"], 5);
  assert.equal(realSession.topicId, undefined);
});

test("walks through topic selection, task release, and every discussion phase", () => {
  let demo = createDemoSession({ room: "ABC234" });
  demo = applyDemoAction(demo, "select-topic", { topicId: "accept-or-confront" });
  assert.equal(demo.session.phase, "sides");
  assert.equal(demo.session.tasksAssigned, false);

  demo = applyDemoAction(demo, "assign-tasks");
  assert.equal(demo.session.tasksAssigned, true);

  for (const phase of ["debate", "response", "summary"]) {
    demo = applyDemoAction(demo, "set-phase", { phase });
    assert.equal(demo.session.phase, phase);
  }
});

test("demo actions return new data and can remove a virtual participant", () => {
  const original = createDemoSession({ room: "ABC234" });
  const updated = applyDemoAction(original, "delete-participant", { participantId: "demo-participant-1" });

  assert.equal(original.participants.length, 8);
  assert.equal(updated.participants.length, 7);
  assert.equal(updated.participants.some((person) => person.id === "demo-participant-1"), false);
});
