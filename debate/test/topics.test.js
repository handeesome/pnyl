import assert from "node:assert/strict";
import test from "node:test";

import { HIDDEN_TASKS, TOPICS, supportTask } from "../public/topics.js";

test("ships exactly ten two-sided faith debate topics", () => {
  assert.equal(TOPICS.length, 10);
  assert.equal(new Set(TOPICS.map((topic) => topic.id)).size, TOPICS.length);

  for (const topic of TOPICS) {
    assert.ok(topic.title.includes("？"));
    assert.equal(topic.tension.length, 2);
    assert.equal(topic.considerations.length, 2);
    assert.equal(topic.changes.length, 3);
    assert.equal(topic.verses.length, 3);
    assert.ok(topic.caseStudy.title && topic.caseStudy.text && topic.caseStudy.question);
    assert.ok(topic.safety);
  }

  const workTopic = TOPICS.find((topic) => topic.id === "sunday-overtime");
  assert.ok(workTopic, "the adult work-and-faith topic should be present");
  assert.match(workTopic.title, /工作|加班|升职/);

  const replacementIds = [
    "peace-or-decide",
    "private-or-public-conflict",
    "invite-or-respect-silence",
    "accept-loss-or-advocate",
    "persist-or-pause-service"
  ];
  assert.ok(replacementIds.every((topicId) => TOPICS.some((topic) => topic.id === topicId)));
});

test("keeps hidden tasks suitable for the private phone view", () => {
  assert.equal(HIDDEN_TASKS.length, 5);
  assert.equal(new Set(HIDDEN_TASKS.map((task) => task.id)).size, HIDDEN_TASKS.length);
  assert.ok(HIDDEN_TASKS.every((task) => task.title && task.prompt));
  for (const taskId of ["name-the-cost", "ask-before-answer", "best-version"]) {
    assert.match(HIDDEN_TASKS.find((task) => task.id === taskId).prompt, /至少三次/);
  }
  assert.match(HIDDEN_TASKS.find((task) => task.id === "ask-before-answer").prompt, /不要反问/);
  assert.match(HIDDEN_TASKS.find((task) => task.id === "best-version").prompt, /总结对方/);

  const support = supportTask("小明");
  assert.equal(support.id, "support-teammate");
  assert.match(support.prompt, /小明/);
  assert.match(support.prompt, /表达一次赞赏/);
  assert.match(support.prompt, /不需要固定句式/);
});
