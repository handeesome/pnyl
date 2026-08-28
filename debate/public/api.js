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

export async function createSession() {
  return parseResponse(await fetch("/api/sessions", {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}"
  }));
}

export async function getHostSession(room, hostToken) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/host`, {
    cache: "no-store",
    headers: { "X-Host-Token": hostToken }
  }));
}

export async function updateHostSession(room, hostToken, action, value = {}) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/host`, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, "X-Host-Token": hostToken },
    body: JSON.stringify({ action, ...value })
  }));
}

export async function recoverHostSession(room, recoveryCode) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/recover`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ recoveryCode })
  }));
}

export async function getPublicSession(room) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/public`, {
    cache: "no-store"
  }));
}

export async function submitVote(room, preferences) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/vote`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ preferences })
  }));
}

export async function validateVote(room, credentials) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/vote`, {
    cache: "no-store",
    headers: {
      "X-Voter-Id": credentials.voterId,
      "X-Voter-Token": credentials.voterToken
    }
  }));
}

export async function joinSide(room, nickname, side) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/join`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ nickname, side })
  }));
}

export async function getParticipantSession(room, credentials) {
  return parseResponse(await fetch(`/api/sessions/${encodeURIComponent(room)}/participant`, {
    cache: "no-store",
    headers: {
      "X-Participant-Id": credentials.participantId,
      "X-Participant-Token": credentials.participantToken
    }
  }));
}
