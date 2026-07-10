import { EVENT_ID, Q1_OPTIONS, Q2_OPTIONS } from "./constants.js";

const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_TEXT_LENGTH = 60;
const OTHER_OPTION = "其他";

const ANSWER_KEYS = Object.freeze(["q1", "q2", "q3", "q4", "q5"]);
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
      ...extraHeaders,
    },
  });
}

function methodNotAllowed(allowed) {
  return json(
    { error: "Method not allowed." },
    405,
    { Allow: allowed },
  );
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

function cleanText(value, fieldName, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string${nullable ? " or null" : ""}.`);
  }

  const cleaned = value
    .normalize("NFC")
    .replace(INVISIBLE_FORMATTING, "")
    .trim()
    .replace(/\s+/gu, " ");

  if (CONTROL_CHARACTERS.test(cleaned)) {
    throw new ValidationError(`${fieldName} contains unsupported control characters.`);
  }
  if (Array.from(cleaned).length > MAX_TEXT_LENGTH) {
    throw new ValidationError(`${fieldName} must be at most ${MAX_TEXT_LENGTH} characters.`);
  }

  return nullable && cleaned === "" ? null : cleaned;
}

function normalizeAnswers(payload) {
  if (!hasExactKeys(payload, ["answers"]) || !hasExactKeys(payload.answers, ANSWER_KEYS)) {
    throw new ValidationError("The request body must contain exactly q1 through q5 under answers.");
  }

  const { q1, q2 } = payload.answers;
  if (!hasExactKeys(q1, ["choice", "other"])) {
    throw new ValidationError("q1 must contain exactly choice and other.");
  }
  if (q1.choice !== null && (typeof q1.choice !== "string" || !Q1_OPTIONS.includes(q1.choice))) {
    throw new ValidationError("q1.choice is not a valid option.");
  }
  const q1Other = cleanText(q1.other, "q1.other", { nullable: true });
  if (q1.choice !== OTHER_OPTION && q1Other !== null) {
    throw new ValidationError("q1.other is only allowed when 其他 is selected.");
  }

  if (!hasExactKeys(q2, ["choices", "other"])) {
    throw new ValidationError("q2 must contain exactly choices and other.");
  }
  if (!Array.isArray(q2.choices) || q2.choices.length > 2) {
    throw new ValidationError("q2.choices must be an array containing at most two options.");
  }
  if (q2.choices.some((choice) => typeof choice !== "string" || !Q2_OPTIONS.includes(choice))) {
    throw new ValidationError("q2.choices contains an invalid option.");
  }
  if (new Set(q2.choices).size !== q2.choices.length) {
    throw new ValidationError("q2.choices cannot contain duplicates.");
  }
  const q2Other = cleanText(q2.other, "q2.other", { nullable: true });
  if (!q2.choices.includes(OTHER_OPTION) && q2Other !== null) {
    throw new ValidationError("q2.other is only allowed when 其他 is selected.");
  }

  const normalized = {
    q1: { choice: q1.choice, other: q1Other },
    q2: { choices: [...q2.choices], other: q2Other },
    q3: cleanText(payload.answers.q3, "q3"),
    q4: cleanText(payload.answers.q4, "q4"),
    q5: cleanText(payload.answers.q5, "q5"),
  };

  const hasAnswer = normalized.q1.choice !== null
    || normalized.q2.choices.length > 0
    || normalized.q3 !== ""
    || normalized.q4 !== ""
    || normalized.q5 !== "";

  if (!hasAnswer) {
    throw new ValidationError("At least one question must be answered.");
  }

  return normalized;
}

async function purgeExpired(db, now = new Date()) {
  await db
    .prepare("DELETE FROM submissions WHERE expires_at <= ?")
    .bind(now.toISOString())
    .run();
}

async function parseSubmission(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { response: json({ error: "Content-Type must be application/json." }, 415) };
  }

  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { response: json({ error: "Request body is too large." }, 413) };
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return { response: json({ error: "Request body is too large." }, 413) };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { response: json({ error: "Request body must be valid JSON." }, 400) };
  }

  try {
    return { answers: normalizeAnswers(payload) };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { response: json({ error: error.message }, 400) };
    }
    throw error;
  }
}

async function createSubmission(request, db, now) {
  const parsed = await parseSubmission(request);
  if (parsed.response) return parsed.response;

  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + RETENTION_MS).toISOString();

  await db
    .prepare(
      "INSERT INTO submissions (id, event_id, answers_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      globalThis.crypto.randomUUID(),
      EVENT_ID,
      JSON.stringify(parsed.answers),
      createdAt,
      expiresAt,
    )
    .run();

  return json({ ok: true }, 201);
}

async function getStatus(db, now) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM submissions WHERE event_id = ? AND expires_at > ?")
    .bind(EVENT_ID, now.toISOString())
    .first();

  return json({ count: Number(row?.count || 0) });
}

function getSuppliedPasscode(request) {
  const headerPasscode = request.headers.get("X-Host-Passcode");
  if (headerPasscode !== null) return headerPasscode;

  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1] : null;
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(left)),
    globalThis.crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function requireHost(request, env) {
  if (typeof env.HOST_PASSCODE !== "string" || env.HOST_PASSCODE.length === 0) {
    return json({ error: "Host passcode is not configured." }, 503);
  }

  const supplied = getSuppliedPasscode(request);
  if (supplied === null || !(await constantTimeEqual(supplied, env.HOST_PASSCODE))) {
    return json(
      { error: "Host authorization required." },
      401,
      { "WWW-Authenticate": "Bearer" },
    );
  }

  return null;
}

function emptyCounts(options) {
  return Object.fromEntries(options.map((option) => [option, 0]));
}

async function getResults(db, now) {
  const query = await db
    .prepare(
      "SELECT answers_json FROM submissions WHERE event_id = ? AND expires_at > ? ORDER BY created_at ASC",
    )
    .bind(EVENT_ID, now.toISOString())
    .all();
  const rows = Array.isArray(query.results) ? query.results : [];

  const questions = {
    q1: { counts: emptyCounts(Q1_OPTIONS), other: [] },
    q2: { counts: emptyCounts(Q2_OPTIONS), other: [] },
    q3: [],
    q4: [],
    q5: [],
  };

  for (const row of rows) {
    let answers;
    try {
      answers = normalizeAnswers({ answers: JSON.parse(row.answers_json) });
    } catch {
      // A malformed legacy row should not make the live projector fail.
      continue;
    }

    if (answers.q1.choice !== null) {
      questions.q1.counts[answers.q1.choice] += 1;
      if (answers.q1.choice === OTHER_OPTION && answers.q1.other !== null) {
        questions.q1.other.push(answers.q1.other);
      }
    }

    for (const choice of answers.q2.choices) {
      questions.q2.counts[choice] += 1;
    }
    if (answers.q2.choices.includes(OTHER_OPTION) && answers.q2.other !== null) {
      questions.q2.other.push(answers.q2.other);
    }

    for (const key of ["q3", "q4", "q5"]) {
      if (answers[key] !== "") questions[key].push(answers[key]);
    }
  }

  return json({
    count: rows.length,
    questions,
    generatedAt: now.toISOString(),
  });
}

async function resetEvent(db) {
  const result = await db
    .prepare("DELETE FROM submissions WHERE event_id = ?")
    .bind(EVENT_ID)
    .run();

  return json({ ok: true, deleted: Number(result.meta?.changes || 0) });
}

async function handleApi(request, env, now) {
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  if (path === "/api/answers") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return createSubmission(request, env.DB, now);
  }

  if (path === "/api/status") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return getStatus(env.DB, now);
  }

  if (path === "/api/results") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const unauthorized = await requireHost(request, env);
    return unauthorized || getResults(env.DB, now);
  }

  if (path === "/api/host/reset") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    const unauthorized = await requireHost(request, env);
    return unauthorized || resetEvent(env.DB);
  }

  return json({ error: "API route not found." }, 404);
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      if (url.pathname === "/") {
        return Response.redirect(new URL("/host", url), 302);
      }
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return new Response("Static assets binding is not configured.", { status: 503 });
      }
      return env.ASSETS.fetch(request);
    }

    if (!env.DB) {
      return json({ error: "Database binding is not configured." }, 503);
    }

    const now = new Date();
    try {
      await purgeExpired(env.DB, now);
      return await handleApi(request, env, now);
    } catch (error) {
      console.error("API request failed:", error instanceof Error ? error.message : "Unknown error");
      return json({ error: "Internal server error." }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    const scheduledAt = Number.isFinite(controller.scheduledTime)
      ? new Date(controller.scheduledTime)
      : new Date();
    ctx.waitUntil(purgeExpired(env.DB, scheduledAt));
  },
};

export default worker;
