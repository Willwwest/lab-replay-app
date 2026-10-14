// The capture screen: the camera full screen, the kid at the top, one big
// button at the bottom. "Record" films with a running clock; "Timed course"
// adds Pass / Fail / Skip for each obstacle. After each recording: keep it
// or retake it, then pick the next kid and go again. The camera stays open
// until the screen closes.
import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Film,
  Settings2,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";
import {
  Button,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Switch,
  Tag,
} from "./ds/index.jsx";
import Sheet from "./Sheet.jsx";
import KidPicker from "./KidPicker.jsx";
import { useCamera } from "./camera.js";
import { videoDuration } from "./hooks.js";
import { cue, keepAwake, unlockAudio } from "./cues.js";
import { canBurn } from "./hud.js";
import { clock, firstName, initials, seconds } from "./format.js";
import {
  ENDINGS,
  FAIL_LIMITS,
  capWarning,
  createRun,
  current,
  fails,
  finish,
  mark,
  pace,
  splits,
  tick,
  toAttempt,
  undo,
} from "./runs.js";
import "./capture.css";

const MODES = [
  { value: "record", label: "Record" },
  { value: "course", label: "Timed course" },
];
const RESULTS = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "skip", label: "Skip" },
];
const WORD = { pass: "Pass", fail: "Fail", skip: "Skip" };
const TONE = { pass: "good", fail: "bad", skip: "neutral" };

export default function CaptureScreen({
  kid,
  onKid,
  members,
  here,
  courses,
  mode: firstMode = "record",
  courseId: firstCourse,
  settings,
  onSettings,
  bestFor,
  onSave,
  onClose,
  onOpenTake,
  team,
}) {
  const [mode, setMode] = useState(team ? "course" : firstMode);
  const [courseId, setCourseId] = useState(firstCourse ?? courses[0]?.id ?? "");
  const [n, setN] = useState(0);
  const [sheet, setSheet] = useState(null); // "kid" | "settings"
  const [saved, setSaved] = useState(null); // { takeId, kid }
  const [busy, setBusy] = useState(false); // a recording is under way
  const hud = useRef(() => ({}));
  const camera = useCamera(true, settings.overlay !== false, hud);
  const course =
    mode === "course"
      ? (team?.course ??
        courses.find((c) => c.id === courseId) ??
        courses[0] ??
        null)
      : null;
  const release = useRef(() => {});

  useEffect(() => {
    document.body.style.overflow = "hidden";
    keepAwake().then((r) => (release.current = r));
    return () => {
      document.body.style.overflow = "";
      release.current();
    };
  }, []);

  // Closing the camera during a team run takes the athlete off course for
  // everyone watching.
  useEffect(() => () => team?.onLive({ clear: true }), []);

  function again() {
    setSaved(null);
    setN((x) => x + 1);
  }

  return (
    <div className="rp-cap" role="dialog" aria-modal="true" aria-label="Camera">
      <video
        className="rp-cap-live"
        ref={camera.preview}
        autoPlay
        muted
        playsInline
      />
      {!camera.ready && !camera.error && (
        <p className="rp-cap-wait">Opening the camera…</p>
      )}
      {camera.error ? (
        <div className="rp-cap-error" role="alert">
          <p>{camera.error}</p>
          <Button onClick={onClose}>Back</Button>
        </div>
      ) : saved ? (
        <Saved
          saved={saved}
          members={members}
          here={here}
          team={team}
          onKid={onKid}
          onAgain={again}
          onOpen={() => onOpenTake(saved.takeId)}
          onClose={onClose}
        />
      ) : (
        <Shot
          // A new mode, course or rule starts a fresh recording.
          key={`${n}-${mode}-${course?.id ?? course?.name ?? ""}-${settings.rules.timeCap}-${settings.rules.failLimit}`}
          kid={kid}
          mode={mode}
          course={course}
          courses={courses}
          settings={settings}
          camera={camera}
          hud={hud}
          team={team}
          best={kid && course ? bestFor(kid.id ?? kid.memberId, course) : null}
          onMode={setMode}
          onBusy={setBusy}
          openKid={() => setSheet("kid")}
          openSettings={() => setSheet("settings")}
          onClose={onClose}
          onRetake={again}
          onSave={async (result) => {
            const takeId = await onSave(result);
            setSaved({ takeId, kid: result.kid });
          }}
        />
      )}

      {sheet === "kid" && (
        <KidPicker
          members={members}
          here={here}
          current={kid?.memberId}
          allowNone={mode === "record"}
          note={
            mode === "record"
              ? "Or record without a kid and assign it later in Takes."
              : "Timed runs count toward each kid's personal best."
          }
          onPick={(id) => {
            onKid(id ? members.find((m) => m.id === id) : null);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "settings" && (
        <CaptureSettings
          mode={mode}
          team={team}
          courses={courses}
          courseId={courseId}
          onCourse={setCourseId}
          settings={settings}
          onSettings={onSettings}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/* ---------- One recording ---------- */

function Shot({
  kid,
  mode,
  course,
  courses,
  settings,
  camera,
  hud,
  team,
  best,
  onMode,
  onBusy,
  openKid,
  openSettings,
  onClose,
  onRetake,
  onSave,
}) {
  const timed = mode === "course" && !!course;
  const [run, setRun] = useState(() =>
    timed
      ? createRun({ course, rules: settings.rules })
      : createRun({ quick: true, course: { name: "Recording" } }),
  );
  const [phase, setPhase] = useState("ready"); // ready, countdown, running, done
  const [count, setCount] = useState(3);
  const [now, setNow] = useState(0);
  const [results, setResults] = useState([]);
  const [video, setVideo] = useState(null);
  const [filming, setFilming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const zero = useRef(0);
  const warned = useRef(false);
  const mainKey = useRef(null);
  const opts = { sound: settings.sound, haptics: settings.haptics };
  const elapsed = () => (performance.now() - zero.current) / 1000;
  const onLive = team?.onLive ?? (() => {});
  const bestPace = pace(best);

  useEffect(() => onBusy(phase !== "ready"), [phase]);
  useEffect(() => {
    if (timed) onLive({ phase: "ready", marks: [] });
  }, []);
  useEffect(() => () => video && URL.revokeObjectURL(video.url), [video]);

  const blocked = !camera.ready
    ? "Waiting for the camera"
    : mode === "course" && !course
      ? "Save a course from a take's Course tab to time it"
      : mode === "course" && !kid
        ? "Pick who's running"
        : "";

  function begin() {
    if (blocked) return;
    unlockAudio();
    if (timed && settings.countdown) {
      onLive({ phase: "countdown", marks: [] });
      setPhase("countdown");
      setCount(3);
      cue("count", opts);
    } else go();
  }

  useEffect(() => {
    if (phase !== "countdown") return;
    const t = setTimeout(() => {
      if (count > 1) {
        setCount(count - 1);
        cue("count", opts);
      } else go();
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  function go() {
    zero.current = performance.now();
    camera.start();
    setFilming(true);
    cue("go", opts);
    onLive({ phase: "running", elapsed: 0, marks: [] });
    setPhase("running");
    setNow(0);
    setTimeout(() => mainKey.current?.focus(), 0);
  }

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      const t = elapsed();
      setNow(t);
      setRun((r) => tick(r, t));
    }, 50);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "running" && !warned.current && capWarning(run, now)) {
      warned.current = true;
      cue("warn", opts);
    }
  }, [now]);

  // The recording ended: stop filming and show it back.
  useEffect(() => {
    if (!run.ended || phase !== "running") return;
    const clean =
      run.ended.reason === "finished" &&
      run.marks.every((m) => m.result === "pass");
    cue(timed ? (clean ? "finish" : "end") : "finish", opts);
    setNow(run.ended.at);
    setPhase("done");
    onLive({
      phase: "done",
      elapsed: run.ended.at,
      marks: run.marks,
      ended: run.ended,
    });
    setSaid(
      timed
        ? `${ENDINGS[run.ended.reason]} at ${seconds(run.ended.at)}.`
        : `Recorded ${seconds(run.ended.at)}.`,
    );
    camera.stop(camera.burned.current ? 1000 : 500).then((blob) => {
      setFilming(false);
      if (blob?.size) setVideo({ blob, url: URL.createObjectURL(blob) });
      else setError("The recording came out empty. Retake it.");
    });
  }, [run.ended]);

  function press(result) {
    if (phase !== "running" || run.ended) return;
    const at = elapsed();
    const i = run.marks.length;
    const next = mark(run, result, at);
    setRun(next);
    if (!next.ended) {
      cue(result, opts);
      onLive({ phase: "running", elapsed: at, marks: next.marks });
    }
    setSaid(
      `${run.course.points[i].label}: ${WORD[result]} at ${seconds(at)}.`,
    );
  }
  function back() {
    const next = undo(run);
    setRun(next);
    onLive({ phase: "running", elapsed: elapsed(), marks: next.marks });
  }
  function stop() {
    if (phase === "running") setRun(finish(run, elapsed()));
  }

  // Keyboard, for a laptop beside the course.
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === " " || e.key === "Enter") && e.target.closest?.("button"))
        return;
      const k = e.key.toLowerCase();
      if (!timed) {
        if (k === " " || k === "escape") {
          e.preventDefault();
          stop();
        }
        return;
      }
      const map = { p: "pass", " ": "pass", f: "fail", s: "skip" };
      if (map[k]) {
        e.preventDefault();
        press(map[k]);
      } else if (k === "u" || k === "backspace") {
        e.preventDefault();
        back();
      } else if (k === "escape") {
        e.preventDefault();
        stop();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  async function keep() {
    setSaving(true);
    setError("");
    try {
      const duration = await videoDuration(video.blob, run.ended.at);
      const takeId = crypto.randomUUID();
      const attempt =
        timed && kid
          ? toAttempt(run, {
              memberId: kid.memberId ?? kid.id,
              member: kid.name ?? kid.member,
              results,
              takeId,
              clipEnd: duration,
            })
          : null;
      await onSave({
        takeId,
        kid,
        mode: timed ? "course" : "record",
        course,
        run,
        attempt,
        blob: video.blob,
        duration,
        burned: camera.burned.current,
      });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const rows = splits(run);
  const at = current(run);
  const point = at == null ? null : run.course.points[at];
  const warn = capWarning(run, now) && phase === "running";
  const labelOf = (i) => run.course.points[i]?.label ?? `Lap ${i + 1}`;
  const clean =
    run.ended?.reason === "finished" &&
    run.course.points.every(
      (_, i) => (results[i] ?? rows[i]?.result) === "pass",
    );
  const kidName = kid?.name ?? kid?.member;
  hud.current = () => ({
    t: run.ended ? run.ended.at : phase === "running" ? elapsed() : 0,
    member: kidName ?? "",
    course: timed ? run.course.name : "",
    index: run.marks.length,
    total: timed ? run.course.points.length : 0,
    label: point?.label,
    warn,
    marks: run.marks.map((m, i) => ({ ...m, label: labelOf(i) })),
    ended: run.ended
      ? timed
        ? `${clean ? "Clean run" : ENDINGS[run.ended.reason]} · ${seconds(run.ended.at)}`
        : `${seconds(run.ended.at)}`
      : null,
  });
  const flash =
    timed &&
    phase === "running" &&
    run.marks.length &&
    now - run.marks.at(-1).at < 1.6
      ? { ...run.marks.at(-1), label: labelOf(run.marks.length - 1) }
      : null;
  const delta =
    timed && rows.length && bestPace[rows.length - 1] != null
      ? rows.at(-1).end - bestPace[rows.length - 1]
      : null;

  return (
    <>
      <p className="sr-only" role="status" aria-live="assertive">
        {said}
      </p>
      {video && (
        <video
          className="rp-cap-replay"
          src={video.url}
          controls
          playsInline
          autoPlay
          muted
          aria-label="Recording of this run"
        />
      )}

      <header className={`rp-cap-top ${warn ? "is-warn" : ""}`.trim()}>
        <IconButton
          label="Close camera"
          icon={X}
          onClick={() => {
            if (phase === "running" || phase === "countdown") stop();
            else if (
              phase !== "done" ||
              confirm("Close without keeping this recording?")
            )
              onClose();
          }}
        />
        <button
          className="rp-cap-kid"
          onClick={openKid}
          disabled={phase !== "ready" || !!team}
          aria-label={
            kidName ? `Recording ${kidName}. Change` : "No kid picked. Pick one"
          }
        >
          <span className="avatar" aria-hidden="true">
            {kidName ? initials(kidName) : "?"}
          </span>
          <span>
            <b>{kidName ?? "No kid"}</b>
            <small>
              {kidName
                ? timed
                  ? run.course.name
                  : "Recording"
                : "Saves to Takes to assign later"}
            </small>
          </span>
          {phase === "ready" && !team && (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </button>
        {phase === "ready" && (
          <IconButton
            label="Capture settings"
            icon={Settings2}
            onClick={openSettings}
          />
        )}
      </header>

      {phase === "ready" && !team && (
        <div className="rp-cap-modes">
          <Segmented
            label="What to capture"
            options={MODES}
            value={mode}
            onChange={onMode}
          />
        </div>
      )}

      {phase === "running" && (
        <div className="rp-cap-hud" aria-hidden="true">
          <span className="rp-cap-rec">
            {camera.burned.current ? "Timer in video" : "Recording"}
          </span>
          <b className={warn ? "is-warn" : undefined}>{clock(now)}</b>
          {point && (
            <span>
              {at + 1} of {run.course.points.length} · {point.label}
            </span>
          )}
          {delta != null && (
            <span className={delta <= 0 ? "is-ahead" : "is-behind"}>
              {seconds(Math.abs(delta))} {delta <= 0 ? "ahead of" : "behind"}{" "}
              best
            </span>
          )}
        </div>
      )}
      {flash && (
        <span className={`rp-cap-flash is-${flash.result}`} aria-hidden="true">
          {flash.label} · {WORD[flash.result]} {clock(flash.at)}
        </span>
      )}
      {phase === "countdown" && (
        <div className="rp-cap-count" aria-live="assertive">
          {count}
        </div>
      )}

      <footer className="rp-cap-bottom">
        {phase === "ready" && (
          <>
            {timed && (
              <p className="rp-cap-note">
                {run.course.points.length} obstacles
                {settings.rules.timeCap
                  ? ` · cap ${seconds(settings.rules.timeCap)}`
                  : ""}
                {settings.rules.failLimit
                  ? ` · ${settings.rules.failLimit} fail limit`
                  : ""}
              </p>
            )}
            <button
              ref={mainKey}
              className="rp-shutter"
              onClick={begin}
              disabled={!!blocked}
              aria-label={timed ? "Start the run" : "Start recording"}
            >
              <span />
            </button>
            <p className="rp-cap-note">
              {blocked ||
                (timed
                  ? "Tap to start. Mark each obstacle as it's cleared."
                  : kidName
                    ? `Tap to record ${firstName(kidName)}.`
                    : "Tap to record. Assign the kid later.")}
            </p>
          </>
        )}

        {phase === "running" && !timed && (
          <>
            <button
              ref={mainKey}
              className="rp-shutter is-recording"
              onClick={stop}
              aria-label="Stop recording"
            >
              <span />
            </button>
            <p className="rp-cap-note">Tap to stop.</p>
          </>
        )}

        {phase === "running" && timed && !run.ended && (
          <div className="rp-cap-keys">
            <button
              className="rp-key rp-key-fail"
              onClick={() => press("fail")}
            >
              <X size={26} aria-hidden="true" /> Fail
            </button>
            <button
              ref={mainKey}
              className="rp-key rp-key-pass"
              onClick={() => press("pass")}
            >
              <Check size={26} aria-hidden="true" /> Pass
            </button>
            <div className="rp-cap-minor">
              <Button
                variant="light"
                size="sm"
                icon={SkipForward}
                onClick={() => press("skip")}
              >
                Skip
              </Button>
              <Button
                variant="light"
                size="sm"
                icon={Undo2}
                disabled={!run.marks.length}
                onClick={back}
              >
                Undo
              </Button>
              <Button variant="light" size="sm" onClick={stop}>
                End run
              </Button>
            </div>
            {run.rules.failLimit > 0 && (
              <Tag tone={fails(run) ? "bad" : "outline"}>
                Fails {fails(run)} of {run.rules.failLimit}
              </Tag>
            )}
          </div>
        )}

        {phase === "done" && (
          <section className="rp-cap-done" aria-label="Keep this recording?">
            <div className="rp-cap-done-head">
              <h2>
                {timed
                  ? clean
                    ? `Clean run in ${seconds(run.ended.at)}`
                    : `${ENDINGS[run.ended.reason]} at ${seconds(run.ended.at)}`
                  : `${seconds(run.ended.at)} recorded`}
              </h2>
              <p>
                {kidName
                  ? `${kidName}${timed ? ` · ${run.course.name}` : ""}`
                  : "No kid yet: it goes to Takes to assign."}
              </p>
            </div>
            {timed && rows.length > 0 && (
              <ol className="rp-cap-splits" aria-label="Splits">
                {rows.map((r, i) => (
                  <li key={i}>
                    <span>
                      {i + 1}. {r.label}
                    </span>
                    <Segmented
                      label={`${r.label} result`}
                      options={RESULTS}
                      value={results[i] ?? r.result}
                      onChange={(v) => {
                        const next = [...results];
                        next[i] = v;
                        setResults(next);
                      }}
                    />
                    <b>{clock(r.end)}</b>
                  </li>
                ))}
              </ol>
            )}
            {filming && <p className="rp-cap-note">Finishing the recording…</p>}
            {error && (
              <p className="rp-inline is-error" role="alert">
                {error}
              </p>
            )}
            <div className="rp-cap-done-acts">
              <Button
                icon={Check}
                disabled={saving || filming || !video}
                onClick={keep}
              >
                {saving ? "Saving…" : "Keep"}
              </Button>
              <Button variant="light" disabled={saving} onClick={onRetake}>
                Retake
              </Button>
            </div>
          </section>
        )}
      </footer>
    </>
  );
}

/* ---------- After keeping: on to the next kid ---------- */

function Saved({
  saved,
  members,
  here,
  team,
  onKid,
  onAgain,
  onOpen,
  onClose,
}) {
  const name = saved.kid?.name ?? saved.kid?.member;
  const next = members.filter(
    (m) =>
      here.includes(m.id) && m.id !== (saved.kid?.id ?? saved.kid?.memberId),
  );
  return (
    <footer className="rp-cap-bottom">
      <section className="rp-cap-done" aria-label="Saved">
        <div className="rp-cap-done-head">
          <h2>
            <Check size={22} aria-hidden="true" /> Saved
          </h2>
          <p>
            {name
              ? `${name}'s take is in Takes, ready to check.`
              : "It's in Takes. Assign a kid there."}
          </p>
        </div>
        {team ? (
          <div className="rp-cap-done-acts">
            <Button onClick={onClose}>Back to the team run</Button>
          </div>
        ) : (
          <>
            {next.length > 0 && (
              <>
                <span className="ds-field-label">Next up</span>
                <div className="rp-cap-next" data-scroll-x>
                  {next.map((m) => (
                    <button
                      key={m.id}
                      className="rp-cap-next-kid"
                      onClick={() => {
                        onKid(m);
                        onAgain();
                      }}
                    >
                      <span className="avatar" aria-hidden="true">
                        {initials(m.name)}
                      </span>
                      {firstName(m.name)}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="rp-cap-done-acts">
              <Button
                onClick={() => {
                  onKid(null);
                  onAgain();
                }}
              >
                Record another
              </Button>
              <Button variant="light" icon={Film} onClick={onOpen}>
                Open take
              </Button>
              <Button variant="light" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </section>
    </footer>
  );
}

/* ---------- Settings ---------- */

function CaptureSettings({
  mode,
  team,
  courses,
  courseId,
  onCourse,
  settings,
  onSettings,
  onClose,
}) {
  const set = (k) => (v) => onSettings({ ...settings, [k]: v });
  const rules = settings.rules;
  return (
    <Sheet
      title="Capture settings"
      onClose={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {mode === "course" && (
        <>
          {team ? (
            <div className="ds-field">
              <span className="ds-field-label">Course</span>
              <p className="rp-inline">
                {team.course.name}, set by the team run.
              </p>
            </div>
          ) : (
            <Field
              label="Course"
              hint={
                courses.length
                  ? undefined
                  : "Save a course from a take's Course tab first."
              }
            >
              <Select
                value={courseId}
                onChange={onCourse}
                options={
                  courses.length
                    ? courses.map((c) => ({ value: c.id, label: c.name }))
                    : [{ value: "", label: "No saved courses" }]
                }
                disabled={!courses.length}
              />
            </Field>
          )}
          <Field label="Time cap (seconds)" hint="Leave empty for no cap.">
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              value={rules.timeCap || ""}
              onChange={(v) =>
                onSettings({
                  ...settings,
                  rules: { ...rules, timeCap: Number(v) || 0 },
                })
              }
              placeholder="No cap"
            />
          </Field>
          <div className="ds-field">
            <span className="ds-field-label">Fail limit</span>
            <Segmented
              label="Fail limit"
              options={FAIL_LIMITS.map((x) => ({
                value: x,
                label: x ? String(x) : "Off",
              }))}
              value={rules.failLimit}
              onChange={(v) =>
                onSettings({ ...settings, rules: { ...rules, failLimit: v } })
              }
            />
          </div>
          <Switch
            checked={settings.countdown}
            onChange={set("countdown")}
            label="3-2-1 countdown"
          />
        </>
      )}
      <Switch
        checked={settings.overlay}
        onChange={set("overlay")}
        label="Timer on the video"
        note={
          canBurn()
            ? "Burns the clock (and each split) into the recording."
            : "This browser records the camera without the timer."
        }
      />
      <Switch
        checked={settings.sound}
        onChange={set("sound")}
        label="Sound cues"
      />
      <Switch
        checked={settings.haptics}
        onChange={set("haptics")}
        label="Vibration"
        note="On phones that support it. iPhones don't."
      />
    </Sheet>
  );
}
