// Who in a family has watched a published portfolio clip. Each guardian
// account's first and latest view and how many times, as the coach sees it.
export function viewSummary(rows) {
  if (!rows.length) return { count: 0, first: null, last: null, names: [] };
  const byLast = [...rows].sort((a, b) => b.last.localeCompare(a.last));
  return {
    count: rows.reduce((n, r) => n + r.count, 0),
    first: rows.map((r) => r.first).sort()[0],
    last: byLast[0].last,
    names: [...new Set(byLast.map((r) => r.name))],
  };
}
