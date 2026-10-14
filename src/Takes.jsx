// Takes: every recording on this device, filtered by what it needs next:
// a kid assigned, a coach's check, or nothing (analyzed). Assigning a kid is
// one tap from the list. Search, a month and a tag narrow it further.
import React from "react";
import { Film, Inbox, Search } from "lucide-react";
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Input,
  Segmented,
  Select,
  Tag,
} from "./ds/index.jsx";
import { monthLabel, months, searchTakes, tagCounts } from "./search.js";
import { PageHead } from "./Shell.jsx";
import { day, stamp } from "./format.js";
import { needsKid, takeStatus } from "./workflow.js";

const when = (iso) => {
  const d = new Date(iso);
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : day(iso);
};

export function TakeCard({ take, jobs, onOpen, onAssign }) {
  const s = takeStatus(take, jobs);
  const name = take.member || take.model?.title || "No kid yet";
  return (
    <li className="rp-tc">
      <button
        className="rp-tc-main"
        onClick={onOpen}
        aria-label={`${name}, ${take.courseMap?.name || take.course || "recording"}, ${when(take.createdAt)}, ${s.label}`}
      >
        <span className="rp-tc-thumb">
          {take.thumb ? (
            <img src={take.thumb} alt="" />
          ) : (
            <Film size={22} aria-hidden="true" />
          )}
          <small>{stamp(take.duration)}</small>
        </span>
        <span className="rp-tc-text">
          <b className={take.memberId || take.model ? undefined : "is-none"}>
            {name}
          </b>
          <small>
            {take.courseMap?.name || take.course || "Recording"} ·{" "}
            {when(take.createdAt)}
          </small>
        </span>
        <span className="rp-tags">
          {take.model && s.id !== "model" && <Tag tone="brand">Model</Tag>}
          {take.angle && <Tag tone="info">{take.angle}</Tag>}
          <Tag tone={s.tone}>{s.label}</Tag>
        </span>
      </button>
      {needsKid(take) && onAssign && (
        <Button size="sm" variant="dark" onClick={onAssign}>
          Assign
        </Button>
      )}
    </li>
  );
}

export const FILTERS = {
  assign: needsKid,
  check: (t, s) => !!t.memberId && ["check", "checked"].includes(s.id),
  analyzed: (t, s) => ["analyzing", "analyzed", "shared"].includes(s.id),
  models: (t) => !!t.model,
  all: () => true,
};

export default function Takes({
  takes,
  jobs,
  ready,
  filter,
  onFilter,
  search,
  onSearch,
  onOpen,
  onAssign,
  onRecord,
}) {
  const status = (t) => takeStatus(t, jobs);
  const found = searchTakes(takes, search);
  const searching = !!(search.query.trim() || search.tag || search.month);
  const count = (f) => found.filter((t) => FILTERS[f](t, status(t))).length;
  const shown = found.filter((t) => FILTERS[filter](t, status(t)));
  const options = [
    { value: "assign", label: `To assign · ${count("assign")}` },
    { value: "check", label: `To check · ${count("check")}` },
    { value: "analyzed", label: `Analyzed · ${count("analyzed")}` },
    { value: "models", label: `Models · ${count("models")}` },
    { value: "all", label: `All · ${found.length}` },
  ];
  const tags = tagCounts(takes).slice(0, 12);
  const monthList = months(takes);
  const set = (fields) => onSearch({ ...search, ...fields });
  const empty = {
    assign: ["Nothing to assign", "Recordings without a kid show here."],
    check: [
      "Nothing to check",
      "New recordings wait here until a coach checks them for analysis.",
    ],
    analyzed: [
      "Nothing analyzed yet",
      "Checked takes you send for analysis show here.",
    ],
    models: [
      "No model clips yet",
      "On a take's Share tab, turn on Use as a model clip. Models show how a skill should look.",
    ],
    all: ["No takes yet", "Record from the Floor."],
  }[filter];
  return (
    <>
      <PageHead
        eyebrow="Takes"
        title="Recordings"
        sub="Stored on this device. Assign a kid, check it, then send the good ones for analysis."
      />
      <main className="rp-page">
        <div className="rp-find" role="search">
          <div className="rp-find-row">
            <span className="rp-find-q">
              <Search size={18} aria-hidden="true" />
              <Field label="Search takes" hideLabel>
                <Input
                  type="search"
                  value={search.query}
                  onChange={(query) => set({ query })}
                  placeholder="Kid, course, obstacle, note or #tag"
                />
              </Field>
            </span>
            {monthList.length > 0 && (
              <Field label="Month" hideLabel>
                <Select
                  value={search.month}
                  onChange={(month) => set({ month })}
                  options={[
                    { value: "", label: "Any month" },
                    ...monthList.map((m) => ({
                      value: m,
                      label: monthLabel(m),
                    })),
                  ]}
                />
              </Field>
            )}
          </div>
          {tags.length > 0 && (
            <div
              className="rp-find-tags"
              role="group"
              aria-label="Tags"
              data-scroll-x
            >
              {tags.map(({ tag, count }) => (
                <Chip
                  key={tag}
                  on={search.tag === tag}
                  onClick={() => set({ tag: search.tag === tag ? "" : tag })}
                >
                  {tag} · {count}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <div className="rp-filters">
          <Segmented
            label="Show"
            options={options}
            value={filter}
            onChange={onFilter}
          />
        </div>
        {!ready ? (
          <p className="ds-note">Opening your takes…</p>
        ) : shown.length === 0 && searching ? (
          <Card>
            <Empty icon={Search} title="No takes match">
              Try another word, or clear the search to see every take.
            </Empty>
            <Button
              variant="secondary"
              onClick={() => onSearch({ query: "", tag: "", month: "" })}
            >
              Clear search
            </Button>
          </Card>
        ) : shown.length === 0 ? (
          <Card>
            <Empty icon={Inbox} title={empty[0]}>
              {empty[1]}
            </Empty>
            {filter === "all" && <Button onClick={onRecord}>Record</Button>}
          </Card>
        ) : (
          <ul className="rp-tcs" aria-label="Takes">
            {shown.map((t) => (
              <TakeCard
                key={t.id}
                take={t}
                jobs={jobs}
                onOpen={() => onOpen(t.id)}
                onAssign={() => onAssign(t.id)}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
