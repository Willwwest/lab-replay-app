// Who's in the gym on a day: coaches mark kids here (or not) so every
// coach's phone shows the same list.
export function validateHere(body, members) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.date ?? ""))
    throw Error("Give the day as YYYY-MM-DD.");
  if (!members.some((m) => m.id === body.memberId))
    throw Error("Choose a roster member.");
  if (typeof body.here !== "boolean") throw Error("Say whether they're here.");
  return { date: body.date, memberId: body.memberId, here: body.here };
}
