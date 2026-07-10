const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求没有成功，请稍后再试。");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function submitAnswers(answers) {
  const response = await fetch("/api/answers", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ answers }),
  });
  return parseResponse(response);
}

export async function getStatus() {
  const response = await fetch("/api/status", { cache: "no-store" });
  return parseResponse(response);
}

export async function getResults(passcode) {
  const response = await fetch("/api/results", {
    cache: "no-store",
    headers: { "X-Host-Passcode": passcode },
  });
  return parseResponse(response);
}

export async function resetEvent(passcode) {
  const response = await fetch("/api/host/reset", {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-Host-Passcode": passcode },
    body: "{}",
  });
  return parseResponse(response);
}
