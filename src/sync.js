// Shares saved attempts (timed runs and scored videos) with the service,
// so every coach sees them and leaderboards can rank them. An attempt
// that couldn't be sent stays on this device, marked unsynced, and is
// sent the next time the roster is connected.
import { all, put } from "./storage.js";
import { api } from "./service.js";

export async function pushRun(attempt) {
  if (!attempt.memberId) return attempt;
  await api("/runs", { method: "POST", body: JSON.stringify(attempt) });
  const synced = { ...attempt, synced: true };
  await put("attempts", synced);
  return synced;
}

// Sends every attempt that hasn't been shared yet. Returns how many went.
export async function syncPending() {
  const pending = (await all("attempts")).filter(
    (a) => a.memberId && !a.synced,
  );
  let sent = 0;
  for (const a of pending) {
    try {
      await pushRun(a);
      sent++;
    } catch {
      // Still offline or refused; it stays pending.
    }
  }
  return sent;
}
