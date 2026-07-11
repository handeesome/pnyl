import test from "node:test";
import assert from "node:assert/strict";

import { AI_ANSWERS, MAX_TEXT_LENGTH } from "../public/assets/js/questions.js";

test("provides seven short AI examples for each fill-in-the-blank question", () => {
  assert.deepEqual(Object.keys(AI_ANSWERS).sort(), ["q3", "q4", "q5"]);

  for (const examples of Object.values(AI_ANSWERS)) {
    assert.equal(examples.length, 7);
    assert.equal(new Set(examples).size, examples.length);
    assert.ok(examples.every((answer) => typeof answer === "string" && answer.trim() === answer));
    assert.ok(examples.every((answer) => Array.from(answer).length <= MAX_TEXT_LENGTH));
  }
});
