// The coach's score for this take's run of the course, and how the member
// has done on the same course before.
import React, { useEffect, useState } from "react";
import { Columns2, Crosshair, Flag, Play, Timer } from "lucide-react";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Section,
  Segmented,
  Stat,
  StatStrip,
  Tag,
} from "./ds/index.jsx";
import { all } from "./storage.js";
import { courseKey, progressFor } from "./attempts.js";
import { day, seconds } from "./format.js";

const RESULTS = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "skip", label: "Skip" },
];
const RESULT_TONE = { pass: "good", fail: "bad", skip: "neutral" };

export default function AttemptReview({
  take,
  now,
  onSave,
  onSeek,
  canCompare = () => false,
  onCompare,
}) {
  const points = take.courseMap?.points ?? [];
  const key = points.length ? courseKey(take.courseMap) : "";
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(take.attempt?.courseKey === key ? take.attempt.obstacles : []);
    setSaved(false);
    setError("");
  }, [take.id, key]);

  useEffect(() => {
    all("attempts")
      .then(setHistory)
      .catch((e) => setError(e.message));
  }, [take.id]);

  const stats = progressFor(history, take.memberId, key);
  const current = history.find((a) => a.takeId === take.id);
  const earlier = stats.history.filter((a) => a.takeId !== take.id);

  function change(i, field, value) {
    setSaved(false);
    setRows((old) => {
      const next = [...old];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(rows);
      setHistory(await all("attempts"));
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Course attempt"
      note="Score each obstacle. Timings are optional, in seconds of the original video, inside the clip."
      actions={
        key && (
          <>
            {current?.source === "timer" && (
              <Tag tone="info" icon={Timer}>
                Timed live
              </Tag>
            )}
            <Button variant="dark" icon={Flag} disabled={busy} onClick={save}>
              {busy ? "Saving…" : current ? "Update attempt" : "Save attempt"}
            </Button>
          </>
        )
      }
    >
      {(error || saved) && (
        <p
          className={`rp-inline ${error ? "is-error" : ""}`.trim()}
          role={error ? "alert" : "status"}
        >
          {error || "Attempt saved."}
        </p>
      )}
      {!key ? (
        <Card>
          <Empty icon={Flag} title="No obstacles to score">
            Add points to the course map first.
          </Empty>
        </Card>
      ) : (
        <ol className="rp-obstacles" aria-label="Obstacles">
          {points.map((p, i) => {
            const row = rows[i] || {};
            return (
              <li key={p.id ?? i}>
                <Card pad="md" className="rp-obstacle">
                  <header className="rp-obstacle-head">
                    <span className="rp-point-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="ds-h3">{p.label}</h3>
                      <p className="ds-note">
                        {p.skill || "No skill named on the course map."}
                      </p>
                    </div>
                    <Segmented
                      label={`Obstacle ${i + 1} result`}
                      options={RESULTS}
                      value={row.result}
                      onChange={(v) => change(i, "result", v)}
                    />
                  </header>
                  <div className="rp-obstacle-times">
                    {[
                      ["start", "Start"],
                      ["end", "Finish"],
                    ].map(([field, label]) => (
                      <div className="rp-bound" key={field}>
                        <Field label={`Obstacle ${i + 1} ${field}`} hideLabel>
                          <Input
                            type="number"
                            step=".1"
                            min={take.start}
                            max={take.end}
                            placeholder={`${label} (s)`}
                            value={row[field] ?? ""}
                            onChange={(v) => change(i, field, v)}
                          />
                        </Field>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Crosshair}
                          title={`Use the playhead as the ${label.toLowerCase()}`}
                          onClick={() =>
                            change(i, field, Number(now.toFixed(2)))
                          }
                        >
                          {label}
                        </Button>
                      </div>
                    ))}
                    {row.start != null && row.start !== "" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Play}
                        onClick={() => onSeek(Number(row.start))}
                      >
                        Watch
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <div className="rp-progress">
        <header>
          <h3 className="ds-h3">Member progress on this course</h3>
          <p className="ds-note">
            Attempts saved on this device. Personal best counts fully passed
            runs only.
          </p>
        </header>
        <StatStrip cols={3}>
          <Stat tone="sky" label="Attempts" value={stats.history.length} />
          <Stat tone="mint" label="Completed" value={stats.completed} />
          <Stat
            tone="lime"
            label="Personal best"
            value={stats.best == null ? "—" : stats.best.toFixed(1)}
            unit={stats.best == null ? undefined : "s"}
          />
        </StatStrip>
        {earlier.length > 0 && (
          <ul className="rp-history">
            {earlier.map((a) => {
              const passed = a.obstacles.filter((o) => o.result === "pass");
              return (
                <li key={a.id}>
                  <Card pad="md" className="rp-history-run">
                    <div>
                      <b>
                        {day(a.createdAt)} · {a.course}
                      </b>
                      <p className="ds-note">
                        <Timer size={14} aria-hidden="true" />{" "}
                        {seconds(a.seconds)} · {passed.length} of{" "}
                        {a.obstacles.length} passed
                      </p>
                      {canCompare(a.takeId) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Columns2}
                          onClick={() => onCompare(a.takeId)}
                        >
                          Side by side
                        </Button>
                      )}
                    </div>
                    <div className="rp-tags">
                      {a.obstacles.map((o, n) => (
                        <Tag key={n} tone={RESULT_TONE[o.result]}>
                          {o.label} · {o.result}
                          {o.seconds != null ? ` · ${seconds(o.seconds)}` : ""}
                        </Tag>
                      ))}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}
