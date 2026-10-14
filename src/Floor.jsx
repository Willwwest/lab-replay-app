// The Floor: where a coach starts. Who's in the gym, tap who's up, then one
// big Record. Today's recordings sit underneath.
import React, { useState } from "react";
import { Camera, Inbox, Timer, Upload, UserPlus, Video } from "lucide-react";
import { Button, Card, Empty, Section, Tag } from "./ds/index.jsx";
import { Masthead } from "./Shell.jsx";
import { TakeCard } from "./Takes.jsx";
import { firstName, initials } from "./format.js";
import { needsKid } from "./workflow.js";

const greeting = (h = new Date().getHours()) =>
  h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
const isToday = (iso) =>
  new Date(iso).toDateString() === new Date().toDateString();

export default function Floor({
  coach,
  members,
  here,
  upNext,
  onUpNext,
  takes,
  jobs,
  needs = [],
  onRecord,
  onTimed,
  onImport,
  onBeAngle,
  onManageHere,
  onOpen,
  onAssign,
  onTakes,
}) {
  const kids = here.ids
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean);
  const up = members.find((m) => m.id === upNext);
  const today = takes.filter((t) => isToday(t.createdAt));
  const toAssign = takes.filter(needsKid).length;
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <Masthead className="rp-floor-head">
        <span className="eyebrow">{date}</span>
        <h1 className="rp-floor-hi">
          {greeting()},{" "}
          <em>{firstName(coach.name.replace(/^Coach\s+/, ""))}.</em>
        </h1>

        <section className="rp-here" aria-labelledby="rp-here-title">
          <div className="rp-here-head">
            <div>
              <h2 id="rp-here-title">In the gym</h2>
              <small>
                {kids.length
                  ? `${kids.length} here · tap who's up`
                  : "Add who's here to pick them with one tap"}
              </small>
            </div>
            <Button
              variant="light"
              size="sm"
              icon={UserPlus}
              onClick={onManageHere}
            >
              {kids.length ? "Edit" : "Add kids"}
            </Button>
          </div>
          {kids.length > 0 && (
            <div
              className="rp-here-kids"
              role="radiogroup"
              aria-label="Who's up"
              data-scroll-x
            >
              {kids.map((k) => (
                <button
                  key={k.id}
                  role="radio"
                  aria-checked={upNext === k.id}
                  className="rp-here-kid"
                  onClick={() => onUpNext(upNext === k.id ? null : k.id)}
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(k.name)}
                  </span>
                  <span>{firstName(k.name)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="rp-floor-go">
          <Button icon={Camera} className="rp-record" onClick={onRecord}>
            {up ? `Record ${firstName(up.name)}` : "Record"}
          </Button>
          <Button variant="light" icon={Timer} onClick={onTimed}>
            Timed course
          </Button>
        </div>
        <p className="rp-floor-hint">
          {up
            ? `${up.name} is up. Tap again to clear.`
            : "No one picked: the recording waits in Takes to be assigned."}
        </p>
      </Masthead>

      <main className="rp-page">
        {toAssign > 0 && (
          <button className="rp-banner" onClick={onTakes}>
            <Inbox size={18} aria-hidden="true" />
            <span>
              <b>
                {toAssign} take{toAssign === 1 ? "" : "s"} to assign
              </b>
              <small>Recorded without a kid. Assign them in Takes.</small>
            </span>
          </button>
        )}
        <NeedsYou needs={needs} upNext={upNext} onUpNext={onUpNext} />
        <Section
          title="Today"
          note="Recordings from today, newest first."
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={Upload}
                onClick={onImport}
              >
                Import a video
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={Video}
                onClick={onBeAngle}
              >
                Be a camera angle
              </Button>
            </>
          }
        >
          {today.length === 0 ? (
            <Card>
              <Empty icon={Camera} title="Nothing recorded today">
                Pick who's up, then Record.
              </Empty>
            </Card>
          ) : (
            <ul className="rp-tcs" aria-label="Today's takes">
              {today.map((t) => (
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
        </Section>
      </main>
    </>
  );
}

// Kids who need a coach: a cue waiting for a retry, a course without a
// clean run, here but not filmed, or not filmed for a while.
const SHOWN = 5;
function NeedsYou({ needs, upNext, onUpNext }) {
  const [all, setAll] = useState(false);
  if (!needs.length) return null;
  const shown = all ? needs : needs.slice(0, SHOWN);
  return (
    <Section
      title="Needs you"
      note="From cues, course runs and who's here. Make one up next to film them."
      actions={
        needs.length > SHOWN && (
          <Button variant="secondary" size="sm" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${needs.length}`}
          </Button>
        )
      }
    >
      <ul className="rp-needs" aria-label="Needs you">
        {shown.map((n) => (
          <li key={n.memberId} className="rp-need">
            <span className="avatar" aria-hidden="true">
              {initials(n.name)}
            </span>
            <span className="rp-need-text">
              <b>{n.name}</b>
              <small>
                {n.text}
                {n.also > 0 && ` · and ${n.also} more`}
              </small>
              {n.here && <Tag tone="info">Here</Tag>}
            </span>
            <Button
              size="sm"
              variant={upNext === n.memberId ? "dark" : "secondary"}
              aria-pressed={upNext === n.memberId}
              aria-label={`Make ${n.name} up next`}
              onClick={() =>
                onUpNext(upNext === n.memberId ? null : n.memberId)
              }
            >
              Up next
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
