// Takes: every recording on this device, filtered by what it needs next:
// a kid assigned, a coach's check, or nothing (analyzed). Assigning a kid is
// one tap from the list.
import React from "react";
import { Film, Inbox } from "lucide-react";
import { Button, Card, Empty, Segmented, Tag } from "./ds/index.jsx";
import { PageHead } from "./Shell.jsx";
import { day, stamp } from "./format.js";
import { takeStatus } from "./workflow.js";

const when = (iso) => {
  const d = new Date(iso);
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : day(iso);
};

export function TakeCard({ take, jobs, onOpen, onAssign }) {
  const s = takeStatus(take, jobs);
  const name = take.member || "No kid yet";
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
          <b className={take.memberId ? undefined : "is-none"}>{name}</b>
          <small>
            {take.courseMap?.name || take.course || "Recording"} ·{" "}
            {when(take.createdAt)}
          </small>
        </span>
        <Tag tone={s.tone}>{s.label}</Tag>
      </button>
      {!take.memberId && onAssign && (
        <Button size="sm" variant="dark" onClick={onAssign}>
          Assign
        </Button>
      )}
    </li>
  );
}

export const FILTERS = {
  assign: (t) => !t.memberId,
  check: (t, s) => !!t.memberId && ["check", "checked"].includes(s.id),
  analyzed: (t, s) => ["analyzing", "analyzed", "shared"].includes(s.id),
  all: () => true,
};

export default function Takes({
  takes,
  jobs,
  ready,
  filter,
  onFilter,
  onOpen,
  onAssign,
  onRecord,
}) {
  const status = (t) => takeStatus(t, jobs);
  const count = (f) => takes.filter((t) => FILTERS[f](t, status(t))).length;
  const shown = takes.filter((t) => FILTERS[filter](t, status(t)));
  const options = [
    { value: "assign", label: `To assign · ${count("assign")}` },
    { value: "check", label: `To check · ${count("check")}` },
    { value: "analyzed", label: `Analyzed · ${count("analyzed")}` },
    { value: "all", label: `All · ${takes.length}` },
  ];
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
