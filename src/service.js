// Client for the local Replay service (npm run service), proxied at
// /replay-api. The demo session lasts for this browser tab.
const TOKEN = "replay-service-token";
const ACCOUNT = "replay-service-account";

let token = sessionStorage.getItem(TOKEN) || "";
// Where the service is. An empty VITE_REPLAY_API (the hosted build) means
// there is no service: shared features say so instead of calling one.
const API = import.meta.env?.VITE_REPLAY_API ?? "/replay-api";
export const hasService = !!API;

export async function api(path, options = {}) {
  if (!API)
    throw Error(
      "This copy of Replay has no shared service, so rosters, leaderboards, team runs and messages are off. Everything else works on this device.",
    );
  const res = await fetch(API + path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body instanceof Blob
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {}
    const error = Error(
      body?.error || "Replay service is unavailable. Start npm run service.",
    );
    error.status = res.status;
    throw error;
  }
  return options.video ? res.blob() : res.json();
}

export function savedAccount() {
  try {
    return token ? JSON.parse(sessionStorage.getItem(ACCOUNT)) : null;
  } catch {
    return null;
  }
}

export async function connect(phone) {
  const data = await api("/session", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  token = data.token;
  sessionStorage.setItem(TOKEN, token);
  sessionStorage.setItem(ACCOUNT, JSON.stringify(data.account));
  return data.account;
}

export function disconnect() {
  token = "";
  sessionStorage.removeItem(TOKEN);
  sessionStorage.removeItem(ACCOUNT);
}
