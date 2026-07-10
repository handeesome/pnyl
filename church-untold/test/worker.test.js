import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENT_ID, Q1_OPTIONS, Q2_OPTIONS } from "../src/constants.js";
import worker from "../src/worker.js";

class MemoryD1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    if (this.sql.startsWith("DELETE FROM submissions WHERE expires_at <= ?")) {
      const before = this.database.rows.length;
      this.database.rows = this.database.rows.filter((row) => row.expires_at > this.values[0]);
      return { success: true, meta: { changes: before - this.database.rows.length } };
    }

    if (this.sql.startsWith("INSERT INTO submissions")) {
      const [id, event_id, answers_json, created_at, expires_at] = this.values;
      this.database.rows.push({ id, event_id, answers_json, created_at, expires_at });
      return { success: true, meta: { changes: 1 } };
    }

    if (this.sql.startsWith("DELETE FROM submissions WHERE event_id = ?")) {
      const before = this.database.rows.length;
      this.database.rows = this.database.rows.filter((row) => row.event_id !== this.values[0]);
      return { success: true, meta: { changes: before - this.database.rows.length } };
    }

    throw new Error(`Unsupported run SQL: ${this.sql}`);
  }

  async first() {
    if (this.sql.startsWith("SELECT COUNT(*) AS count")) {
      const [eventId, now] = this.values;
      return {
        count: this.database.rows.filter(
          (row) => row.event_id === eventId && row.expires_at > now,
        ).length,
      };
    }
    throw new Error(`Unsupported first SQL: ${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith("SELECT answers_json FROM submissions")) {
      const [eventId, now] = this.values;
      return {
        success: true,
        results: this.database.rows
          .filter((row) => row.event_id === eventId && row.expires_at > now)
          .sort((left, right) => left.created_at.localeCompare(right.created_at))
          .map(({ answers_json }) => ({ answers_json })),
      };
    }
    throw new Error(`Unsupported all SQL: ${this.sql}`);
  }
}

class MemoryD1 {
  constructor(rows = []) {
    this.rows = structuredClone(rows);
  }

  prepare(sql) {
    return new MemoryD1Statement(this, sql);
  }
}

function createEnvironment(rows = []) {
  return {
    DB: new MemoryD1(rows),
    HOST_PASSCODE: "correct horse battery staple",
    ASSETS: {
      fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`),
    },
  };
}

function blankAnswers() {
  return {
    q1: { choice: null, other: null },
    q2: { choices: [], other: null },
    q3: "",
    q4: "",
    q5: "",
  };
}

function jsonRequest(path, answers, extra = {}) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(extra.headers || {}) },
    body: JSON.stringify({ answers }),
  });
}

async function responseJson(response) {
  const data = await response.json();
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(response.headers.get("Content-Type"), /^application\/json/);
  return data;
}

function storedRow(answers, overrides = {}) {
  return {
    id: crypto.randomUUID(),
    event_id: EVENT_ID,
    answers_json: JSON.stringify(answers),
    created_at: "2026-07-11T00:00:00.000Z",
    expires_at: "2099-07-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("POST /api/answers", () => {
  it("stores only normalized anonymous answers for 24 hours", async () => {
    const env = createEnvironment();
    const answers = blankAnswers();
    answers.q1 = { choice: "其他", other: "  临时领诗\n也很怕  " };
    answers.q2 = { choices: ["事情太多", "其他"], other: "  排期太突然  " };
    answers.q3 = "  散会后一直等爸妈  ";

    const response = await worker.fetch(jsonRequest("/api/answers", answers), env);
    assert.equal(response.status, 201);
    assert.deepEqual(await responseJson(response), { ok: true });
    assert.equal(env.DB.rows.length, 1);

    const row = env.DB.rows[0];
    assert.equal(row.event_id, EVENT_ID);
    assert.deepEqual(Object.keys(row).sort(), ["answers_json", "created_at", "event_id", "expires_at", "id"]);
    assert.equal(new Date(row.expires_at).getTime() - new Date(row.created_at).getTime(), 86_400_000);
    assert.deepEqual(JSON.parse(row.answers_json), {
      ...answers,
      q1: { choice: "其他", other: "临时领诗 也很怕" },
      q2: { choices: ["事情太多", "其他"], other: "排期太突然" },
      q3: "散会后一直等爸妈",
    });
  });

  it("rejects empty, malformed, extra, invalid, duplicate, and overlong answers", async (testContext) => {
    const cases = [
      ["all blank", blankAnswers()],
      ["extra answer key", { ...blankAnswers(), q6: "no" }],
      ["invalid q1 option", { ...blankAnswers(), q1: { choice: "唱歌", other: null } }],
      ["orphaned q1 other", { ...blankAnswers(), q1: { choice: "祷告", other: "补充" } }],
      ["too many q2 choices", { ...blankAnswers(), q2: { choices: ["事情太多", "意见太多", "找不到人"], other: null } }],
      ["duplicate q2 choice", { ...blankAnswers(), q2: { choices: ["事情太多", "事情太多"], other: null } }],
      ["overlong text", { ...blankAnswers(), q3: "会".repeat(61) }],
    ];

    for (const [name, answers] of cases) {
      await testContext.test(name, async () => {
        const env = createEnvironment();
        const response = await worker.fetch(jsonRequest("/api/answers", answers), env);
        assert.equal(response.status, 400);
        assert.equal(env.DB.rows.length, 0);
        assert.equal(typeof (await responseJson(response)).error, "string");
      });
    }
  });

  it("requires JSON and caps request bodies", async () => {
    const env = createEnvironment();
    const wrongType = await worker.fetch(new Request("https://example.test/api/answers", {
      method: "POST",
      body: "not json",
    }), env);
    assert.equal(wrongType.status, 415);

    const tooLarge = await worker.fetch(new Request("https://example.test/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filler: "x".repeat(9000) }),
    }), env);
    assert.equal(tooLarge.status, 413);
  });
});

describe("status, host results, reset, and retention", () => {
  it("purges expired rows before every API route and returns the live count", async () => {
    const valid = blankAnswers();
    valid.q3 = "还有效";
    const env = createEnvironment([
      storedRow(valid, { expires_at: "2000-01-01T00:00:00.000Z" }),
      storedRow(valid),
    ]);

    const response = await worker.fetch(new Request("https://example.test/api/status"), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), { count: 1 });
    assert.equal(env.DB.rows.length, 1);

    await worker.fetch(new Request("https://example.test/api/does-not-exist"), env);
    assert.equal(env.DB.rows.length, 1);
  });

  it("requires a host passcode and returns deterministic aggregates", async () => {
    const first = blankAnswers();
    first.q1 = { choice: "祷告", other: null };
    first.q2 = { choices: ["事情太多", "其他"], other: "临时通知" };
    first.q3 = "自动低头";

    const second = blankAnswers();
    second.q1 = { choice: "其他", other: "领诗" };
    second.q2 = { choices: ["事情太多"], other: null };
    second.q5 = "提前排班";

    const env = createEnvironment([storedRow(first), storedRow(second)]);
    const unauthorized = await worker.fetch(new Request("https://example.test/api/results"), env);
    assert.equal(unauthorized.status, 401);

    const response = await worker.fetch(new Request("https://example.test/api/results", {
      headers: { "X-Host-Passcode": env.HOST_PASSCODE },
    }), env);
    assert.equal(response.status, 200);
    const data = await responseJson(response);

    assert.equal(data.count, 2);
    assert.equal(data.questions.q1.counts["祷告"], 1);
    assert.equal(data.questions.q1.counts["其他"], 1);
    assert.deepEqual(data.questions.q1.other, ["领诗"]);
    assert.equal(data.questions.q2.counts["事情太多"], 2);
    assert.equal(data.questions.q2.counts["其他"], 1);
    assert.deepEqual(data.questions.q2.other, ["临时通知"]);
    assert.deepEqual(data.questions.q3, ["自动低头"]);
    assert.deepEqual(data.questions.q4, []);
    assert.deepEqual(data.questions.q5, ["提前排班"]);
    assert.deepEqual(Object.keys(data.questions.q1.counts), Q1_OPTIONS);
    assert.deepEqual(Object.keys(data.questions.q2.counts), Q2_OPTIONS);
    assert.ok(!Number.isNaN(Date.parse(data.generatedAt)));
  });

  it("accepts Bearer auth and reset deletes only the fixed event", async () => {
    const answers = blankAnswers();
    answers.q4 = "答案";
    const env = createEnvironment([
      storedRow(answers),
      storedRow(answers, { event_id: "another-event" }),
    ]);

    const response = await worker.fetch(new Request("https://example.test/api/host/reset", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.HOST_PASSCODE}` },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), { ok: true, deleted: 1 });
    assert.equal(env.DB.rows.length, 1);
    assert.equal(env.DB.rows[0].event_id, "another-event");
  });

  it("hourly scheduled cleanup removes expired rows", async () => {
    const answers = blankAnswers();
    answers.q5 = "答案";
    const env = createEnvironment([
      storedRow(answers, { expires_at: "2026-07-11T00:59:59.000Z" }),
      storedRow(answers, { expires_at: "2026-07-11T02:00:00.000Z" }),
    ]);
    const pending = [];

    await worker.scheduled(
      { scheduledTime: Date.parse("2026-07-11T01:00:00.000Z") },
      env,
      { waitUntil: (promise) => pending.push(promise) },
    );
    await Promise.all(pending);
    assert.equal(env.DB.rows.length, 1);
    assert.equal(env.DB.rows[0].expires_at, "2026-07-11T02:00:00.000Z");
  });
});

describe("static asset routing", () => {
  it("redirects the root and forwards non-API paths to Static Assets", async () => {
    const env = createEnvironment();
    const root = await worker.fetch(new Request("https://example.test/"), env);
    assert.equal(root.status, 302);
    assert.equal(root.headers.get("Location"), "https://example.test/host");

    const asset = await worker.fetch(new Request("https://example.test/answer"), env);
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), "asset:/answer");
  });
});
