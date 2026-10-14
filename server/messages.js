// Messages between coaches and a kid's family: one thread per kid. Any
// coach and that kid's guardians can read and write it. A message can
// carry a shared course run. Reads are tracked per account for unread
// counts.
import { canRead } from "./access.js";

export const MAX_TEXT = 2000;

export function validateMessage(body, account, member, runs) {
  if (!member) throw Error("No thread for that member.");
  if (!canRead(account, member.id)) throw Error("No access to this thread.");
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  let run = null;
  if (body?.runId) {
    const r = runs.find((x) => x.id === body.runId);
    if (!r || r.memberId !== member.id)
      throw Error("Attach one of this member's shared runs.");
    run = {
      id: r.id,
      course: r.course,
      seconds: r.seconds,
      completed: r.completed,
      ended: r.ended,
      passed: r.obstacles.filter((o) => o.result === "pass").length,
      obstacles: r.obstacles.length,
      at: r.createdAt,
    };
  }
  if (!text && !run) throw Error("Write a message or attach a run.");
  if (text.length > MAX_TEXT)
    throw Error(`Keep messages under ${MAX_TEXT} characters.`);
  return {
    id: crypto.randomUUID(),
    memberId: member.id,
    author: {
      kind: account.kind,
      id: account.id,
      // From the server's account, never the client.
      name: account.name ?? "Family",
    },
    text,
    run,
    createdAt: new Date().toISOString(),
  };
}

// Threads this account can see, newest activity first. Families see a
// thread for each of their kids even before anyone writes; coaches see the
// threads that have messages.
export function threads(account, members, messages, reads) {
  const visible = members.filter((m) => canRead(account, m.id));
  const rows = visible.map((m) => {
    const mine = messages
      .filter((x) => x.memberId === m.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const seen = reads[m.id] ?? "";
    return {
      memberId: m.id,
      name: m.name,
      count: mine.length,
      last: mine.at(-1) ?? null,
      unread: mine.filter(
        (x) =>
          x.createdAt > seen &&
          !(x.author.kind === account.kind && x.author.id === account.id),
      ).length,
    };
  });
  return rows
    .filter((r) => account.kind !== "staff" || r.count > 0)
    .sort((a, b) =>
      (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? ""),
    );
}
