// Finding takes: tags a coach puts on them, and a search over who, what
// course, which obstacles, the coaching, the tags and the month.
export const MAX_TAGS = 12;
export const TAG_LENGTH = 30;

const fold = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Trimmed, single-spaced, no duplicates (ignoring case), within limits.
export function cleanTags(tags) {
  const out = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    const tag = String(t ?? "")
      .replace(/^#+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, TAG_LENGTH);
    if (tag && !out.some((x) => fold(x) === fold(tag))) out.push(tag);
  }
  return out.slice(0, MAX_TAGS);
}

export const hasTag = (take, tag) =>
  (take.tags ?? []).some((t) => fold(t) === fold(tag));

// "2026-10" for a take, from when it was recorded.
export const monthOf = (take) => (take.createdAt ?? "").slice(0, 7);

export const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
};

// Months that have takes, newest first.
export const months = (takes) =>
  [...new Set(takes.map(monthOf).filter(Boolean))].sort().reverse();

// Tags in use, most used first, then A–Z.
export function tagCounts(takes) {
  const counts = new Map();
  for (const t of takes)
    for (const tag of cleanTags(t.tags)) {
      const key = [...counts.keys()].find((k) => fold(k) === fold(tag)) ?? tag;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

// Tags worth offering on a take: its course, obstacles and skills, then
// the tags the coach uses most; none it already has.
export function suggestTags(take, takes, limit = 8) {
  const own = [
    take.courseMap?.name,
    ...(take.courseMap?.points ?? []).flatMap((p) => [p.label, p.skill]),
    ...(take.attempt?.obstacles ?? [])
      .filter((o) => o.result === "fail")
      .map((o) => `${o.label} fail`),
  ];
  const used = tagCounts(takes).map((x) => x.tag);
  return cleanTags([...own, ...used])
    .filter((t) => !hasTag(take, t))
    .slice(0, limit);
}

// Everything a take can be found by, folded for matching.
function haystack(take) {
  const month = take.createdAt
    ? new Date(take.createdAt).toLocaleDateString("en-US", {
        month: "long",
      })
    : "";
  return fold(
    [
      take.member,
      take.name,
      take.course,
      take.courseMap?.name,
      ...(take.courseMap?.points ?? []).flatMap((p) => [p.label, p.skill]),
      take.notes,
      take.cue,
      take.grade,
      ...(take.tags ?? []),
      take.model?.title,
      month,
    ]
      .filter(Boolean)
      .join(" \u0001 "),
  );
}

// Takes matching every word of the query (in any field), the tag and the
// month, when given. "#rings" in the query means the tag rings.
export function searchTakes(takes, { query = "", tag = "", month = "" } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const tags = words.filter((w) => w.startsWith("#")).map((w) => w.slice(1));
  const plain = words.filter((w) => !w.startsWith("#"));
  return takes.filter((t) => {
    if (month && monthOf(t) !== month) return false;
    if (tag && !hasTag(t, tag)) return false;
    if (
      tags.some((x) => x && !(t.tags ?? []).some((y) => fold(y).startsWith(x)))
    )
      return false;
    if (!plain.length) return true;
    const hay = haystack(t);
    return plain.every((w) => hay.includes(w));
  });
}
