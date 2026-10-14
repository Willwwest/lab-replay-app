// Team runs: pick the running order, run each athlete through the live
// screen, and watch the standings update on every device. The spectator
// screen (?team=CODE) shows the runner on course with a live clock.
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Link2,
  Play,
  Radio,
  Search,
  SkipForward,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Chip,
  Empty,
  Field,
  IconButton,
  Input,
  Section,
  Tag,
} from "./ds/index.jsx";
import { api } from "./service.js";
import { clock, seconds } from "./format.js";
import { ENDINGS } from "./runs.js";
import "./team.css";

const POLL = 1000;
const ORDINAL = (n) => {
  const tens = n % 100;
  const s =
    tens >= 11 && tens <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
};

// The team session, refreshed every second. `offset` maps this device's
// clock onto the server's, so a live run's clock reads the same everywhere.
export function useTeam(key) {
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const offset = useRef(0);
  const load = useRef(null);
  useEffect(() => {
    if (!key) return setView(null);
    let live = true;
    load.current = async () => {
      const sent = Date.now();
      try {
        const v = await api(`/teams/${encodeURIComponent(key)}`);
        if (!live) return;
        const back = Date.now();
        offset.current = v.now - (sent + back) / 2;
        setView(v);
        setError("");
      } catch (e) {
        if (live) setError(e.message);
      }
    };
    load.current();
    const t = setInterval(() => load.current(), POLL);
    // Hidden tabs poll rarely; catch up the moment the screen is back.
    const back = () => document.visibilityState === "visible" && load.current();
    document.addEventListener("visibilitychange", back);
    return () => {
      live = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [key]);
  return {
    view,
    error,
    refresh: () => load.current?.(),
    serverNow: () => Date.now() + offset.current,
  };
}

// Seconds on the live runner's clock, ticking between polls.
function useLiveClock(view, serverNow) {
  const [, tick] = useState(0);
  const live = view?.live;
  const running = live?.phase === "running" && live.startedAt && !live.ended;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);
  if (!live?.startedAt) return null;
  if (live.ended) return live.ended.at;
  return Math.max(0, (serverNow() - live.startedAt) / 1000);
}

/* ---------- Picking the running order ---------- */

export function TeamPicker({ members, lineup, onChange }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = members.filter((m) => !q || m.name.toLowerCase().includes(q));
  const toggle = (id) =>
    onChange(
      lineup.includes(id) ? lineup.filter((x) => x !== id) : [...lineup, id],
    );
  return (
    <div className="rp-pick">
      <div className="rp-pick-find">
        <Field label="Find athletes">
          <Input
            value={query}
            onChange={setQuery}
            placeholder="Search the roster"
          />
        </Field>
        <Search size={16} aria-hidden="true" />
      </div>
      <div className="rp-pick-chips" role="group" aria-label="Roster">
        {shown.map((m) => (
          <Chip
            key={m.id}
            on={lineup.includes(m.id)}
            onClick={() => toggle(m.id)}
          >
            {m.name}
          </Chip>
        ))}
        {!shown.length && <p className="ds-note">No one matches “{query}”.</p>}
      </div>
      <div className="rp-pick-order">
        <span className="ds-field-label">
          Running order · {lineup.length} athlete
          {lineup.length === 1 ? "" : "s"}
        </span>
        {lineup.length === 0 ? (
          <p className="ds-note">Tap names above in the order they'll run.</p>
        ) : (
          <ol aria-label="Running order">
            {lineup.map((id, i) => (
              <li key={id}>
                <span className="rp-point-n">{i + 1}</span>
                <b>{members.find((m) => m.id === id)?.name ?? id}</b>
                <IconButton
                  label={`Move ${members.find((m) => m.id === id)?.name} earlier`}
                  icon={ArrowUp}
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...lineup];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    onChange(next);
                  }}
                />
                <IconButton
                  label={`Take ${members.find((m) => m.id === id)?.name} out`}
                  icon={Trash2}
                  tone="danger"
                  onClick={() => toggle(id)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/* ---------- The standings, shared by the panel and the spectator ---------- */

function Standings({ view, liveSeconds, dark }) {
  return (
    <ol
      className={`rp-standings ${dark ? "is-dark" : ""}`.trim()}
      aria-label="Standings"
    >
      {view.standings.map((r) => (
        <li
          key={r.memberId ?? `${r.order}`}
          className={r.onCourse ? "is-live" : r.mine ? "is-mine" : undefined}
        >
          <span className={`rp-standings-place rp-standings-place-${r.rank}`}>
            {r.rank ? ORDINAL(r.rank) : "—"}
          </span>
          <span className="rp-standings-name">
            <b>{r.name}</b>
            <small>
              {r.onCourse
                ? "On course"
                : r.status === "clean"
                  ? `${r.runs} run${r.runs === 1 ? "" : "s"}`
                  : r.status === "no clean run"
                    ? `${ENDINGS[r.last?.ended] ?? "Ran"} · ${r.last?.passed} passed`
                    : "Waiting"}
            </small>
          </span>
          <span className="rp-standings-time">
            {r.onCourse && liveSeconds != null ? (
              <Tag tone="live">{clock(liveSeconds)}</Tag>
            ) : r.best != null ? (
              seconds(r.best)
            ) : r.runs ? (
              <Tag tone="neutral">No clean run</Tag>
            ) : (
              ""
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

// One dot per obstacle: passed, failed, skipped, the one they're on, to come.
function Marks({ view }) {
  const live = view.live;
  if (!live) return null;
  return (
    <ol className="rp-team-marks" aria-label="Obstacles">
      {view.course.points.map((p, i) => {
        const m = live.marks[i];
        return (
          <li
            key={i}
            className={
              m
                ? `is-${m.result}`
                : i === live.marks.length
                  ? "is-now"
                  : undefined
            }
            title={`${i + 1}. ${p.label}${m ? `: ${m.result}` : ""}`}
          >
            <span className="sr-only">
              {i + 1}. {p.label}:{" "}
              {m ? m.result : i === live.marks.length ? "now" : "to come"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- The coach's panel while a team run is open ---------- */

export function TeamPanel({ teamId, onRun, onEnd, onSay, onError }) {
  const { view, error, serverNow } = useTeam(teamId);
  const secs = useLiveClock(view, serverNow);
  const [busy, setBusy] = useState(false);
  if (!view)
    return (
      <Section title="Team run" note={error || "Opening the team run…"}>
        {error && (
          <Button variant="secondary" onClick={() => onEnd(false)}>
            Leave this team run
          </Button>
        )}
      </Section>
    );
  const link = `${location.origin}${location.pathname}?team=${view.code}`;
  const done = new Set(view.results.map((r) => r.memberId));
  const waiting = view.athletes.filter((a) => !done.has(a.memberId));
  const live = view.live;

  async function end() {
    if (!confirm("End this team run? The standings stay in the runs.")) return;
    setBusy(true);
    try {
      await api(`/teams/${view.id}/close`, { method: "POST", body: "{}" });
      onEnd(true);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title={`Team run · ${view.course.name}`}
      note={`${view.athletes.length} athletes, ${done.size} done. Spectators open the link below or enter code ${view.code}.`}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon={Link2}
            onClick={() =>
              navigator.clipboard
                ?.writeText(link)
                .then(() => onSay("Spectator link copied."))
                .catch(() => onSay(link))
            }
          >
            Copy spectator link
          </Button>
          <Button
            variant="dark"
            size="sm"
            icon={Square}
            disabled={busy}
            onClick={end}
          >
            End team run
          </Button>
        </>
      }
    >
      <div className="rp-team">
        <Card
          as="section"
          tone="ink"
          className="rp-team-next"
          aria-label="Up next"
        >
          {live ? (
            <>
              <span className="eyebrow">
                <Radio size={14} aria-hidden="true" /> On course
              </span>
              <h2 className="ds-h2">
                {view.athletes.find((a) => a.memberId === live.memberId)?.name}
              </h2>
              <p className="rp-team-clock">
                {secs == null ? "Getting ready" : clock(secs)}
              </p>
              <Marks view={view} />
            </>
          ) : view.next ? (
            <>
              <span className="eyebrow">Up next</span>
              <h2 className="ds-h2">{view.next.name}</h2>
              <p className="ds-note">
                {waiting.length - 1
                  ? `Then ${waiting
                      .slice(1, 4)
                      .map((a) => a.name.split(" ")[0])
                      .join(", ")}${waiting.length > 4 ? "…" : ""}`
                  : "Last one to run."}
              </p>
              <Button icon={Play} onClick={() => onRun(view.next, view)}>
                Start {view.next.name.split(" ")[0]}'s run
              </Button>
            </>
          ) : (
            <>
              <span className="eyebrow">Everyone has run</span>
              <h2 className="ds-h2">
                {view.standings[0]?.best != null
                  ? `${view.standings[0].name} wins`
                  : "No clean runs"}
              </h2>
              <p className="ds-note">
                Give anyone another go below, or end the team run.
              </p>
            </>
          )}
        </Card>
        <Card as="section" aria-labelledby="rp-standings-title">
          <CardHead
            title={<span id="rp-standings-title">Standings</span>}
            note="Best clean run counts. Updates every second on every screen."
          />
          <Standings view={view} liveSeconds={secs} />
        </Card>
      </div>

      <Card as="section" pad="md" aria-label="Running order">
        <CardHead
          title="Running order"
          note="Run anyone now, or give them another go."
        />
        <ul className="rp-team-queue">
          {view.athletes.map((a) => (
            <li key={a.memberId}>
              <b>{a.name}</b>
              <Tag tone={done.has(a.memberId) ? "good" : "outline"}>
                {done.has(a.memberId) ? "Ran" : "Waiting"}
              </Tag>
              <Button
                variant="secondary"
                size="sm"
                icon={done.has(a.memberId) ? Play : SkipForward}
                disabled={!!live}
                onClick={() => onRun(a, view)}
              >
                {done.has(a.memberId) ? "Run again" : "Run now"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

/* ---------- The spectator screen ---------- */

export function Spectate({ code, connected }) {
  const { view, error, serverNow } = useTeam(connected ? code : "");
  const secs = useLiveClock(view, serverNow);
  if (!connected)
    return (
      <Card>
        <Empty icon={Users} title="Connect to watch this team run">
          Use the account menu at the top right.
        </Empty>
      </Card>
    );
  if (!view)
    return (
      <Card>
        <Empty icon={Users} title={error || "Finding the team run…"} />
      </Card>
    );
  const live = view.live;
  const point = live && view.course.points[live.marks.length];
  return (
    <section className="rp-watch" aria-label={`Team run: ${view.course.name}`}>
      <header className="rp-watch-head">
        <div>
          <span className="eyebrow">Team run · code {view.code}</span>
          <h2>{view.course.name}</h2>
        </div>
        <Tag tone={view.status === "open" ? "live" : "neutral"}>
          {view.status === "open" ? "Live" : "Finished"}
        </Tag>
      </header>
      <div className="rp-watch-grid">
        <div className="rp-watch-live" aria-live="polite">
          {live ? (
            <>
              <span className="eyebrow">On course</span>
              <b className="rp-watch-name">{live.name}</b>
              <span className="rp-watch-clock">
                {secs == null ? "Ready" : clock(secs)}
              </span>
              <Marks view={view} />
              <p>
                {live.ended
                  ? `${ENDINGS[live.ended.reason]} at ${seconds(live.ended.at)}`
                  : point
                    ? `${live.marks.length + 1} of ${view.course.points.length} · ${point.label}`
                    : "Finishing"}
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">
                {view.status === "open" ? "Between runs" : "Final standings"}
              </span>
              <b className="rp-watch-name">
                {view.status === "open"
                  ? "Next runner coming up"
                  : view.standings[0]?.best != null
                    ? `${view.standings[0].name} wins`
                    : "No clean runs"}
              </b>
            </>
          )}
        </div>
        <Standings view={view} liveSeconds={secs} dark />
      </div>
    </section>
  );
}
