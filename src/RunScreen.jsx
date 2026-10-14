// The live run, full screen: a countdown, the clock, the obstacle the
// athlete is on, big Pass and Fail keys, splits with pace against the
// personal best, then the result with corrections before saving.
import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Film,
  Flag,
  RotateCcw,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";
import { Button, Segmented, Tag } from "./ds/index.jsx";
import { RECORD_TYPES, videoDuration } from "./hooks.js";
import { cue, keepAwake, unlockAudio } from "./cues.js";
import { canBurn, drawHud } from "./hud.js";
import { clock, seconds } from "./format.js";
import {
  ENDINGS,
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

const RESULTS = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "skip", label: "Skip" },
];
const TONE = { pass: "good", fail: "bad", skip: "neutral" };
const WORD = { pass: "Pass", fail: "Fail", skip: "Skip" };

// The camera for a filmed run: opened before the countdown, recording
// from Go to the end of the run. With `burn`, each camera frame is drawn
// onto a canvas with the timer overlay and the canvas is what's recorded,
// so the clock and splits are in the video itself. `hud` is a ref to a
// function returning the overlay's current state.
function useRunCamera(film, burn, hud) {
  const stream = useRef(null);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const preview = useRef(null);
  const raf = useRef(0);
  const burned = useRef(false);
  const [ready, setReady] = useState(!film);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!film) return;
    let live = true;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (preview.current) preview.current.srcObject = s;
        setReady(true);
      })
      .catch(() =>
        setError(
          "The camera didn't open. Allow camera access, or turn off Film the run.",
        ),
      );
    if (!navigator.mediaDevices?.getUserMedia)
      setError("Filming needs HTTPS or localhost. Turn off Film the run.");
    return () => {
      live = false;
      cancelAnimationFrame(raf.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [film]);

  function start() {
    if (!stream.current) return;
    let source = stream.current;
    const v = preview.current;
    burned.current = false;
    if (burn && canBurn() && v?.videoWidth) {
      const scale = Math.min(1, 1280 / v.videoWidth);
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      const ctx = c.getContext("2d");
      const draw = () => {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        drawHud(ctx, c.width, c.height, hud.current());
        raf.current = requestAnimationFrame(draw);
      };
      draw();
      source = c.captureStream(30);
      burned.current = true;
    }
    const type = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(source, type ? { mimeType: type } : {});
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.start(500);
    recorder.current = r;
  }

  // Resolves with the recording, or null when nothing was filmed. `tail`
  // keeps recording a moment longer, so a burned-in result card is seen.
  function stop(tail = 0) {
    const r = recorder.current;
    if (!r || r.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      setTimeout(() => {
        r.onstop = () => {
          cancelAnimationFrame(raf.current);
          stream.current?.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks.current, { type: r.mimeType }));
        };
        r.stop();
      }, tail);
    });
  }

  return { preview, ready, error, start, stop, burned };
}

// `onLive` (team runs) receives the run's state as it changes, for the
// service to pass on to every screen watching.
export default function RunScreen({
  setup,
  best,
  onSave,
  onClose,
  onAgain,
  onLive = () => {},
}) {
  const [run, setRun] = useState(() =>
    createRun({ course: setup.course, rules: setup.rules, quick: setup.quick }),
  );
  const [phase, setPhase] = useState("ready"); // ready, countdown, running, done
  const [count, setCount] = useState(3);
  const [now, setNow] = useState(0);
  const [results, setResults] = useState([]);
  const [video, setVideo] = useState(null); // { blob, url }
  const [filming, setFilming] = useState(setup.film); // recording not back yet
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const zero = useRef(0);
  const warned = useRef(false);
  const release = useRef(() => {});
  // What the burned-in overlay shows, read on every recorded frame.
  const hud = useRef(() => ({}));
  const camera = useRunCamera(setup.film, setup.overlay !== false, hud);
  const passKey = useRef(null);
  const opts = { sound: setup.sound, haptics: setup.haptics };
  const elapsed = () => (performance.now() - zero.current) / 1000;
  const bestPace = pace(best);

  // Lock page scroll behind the overlay; keep the screen on.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    keepAwake().then((r) => (release.current = r));
    return () => {
      document.body.style.overflow = "";
      release.current();
    };
  }, []);

  useEffect(() => {
    onLive({ phase: "ready", marks: [] });
  }, []);

  function begin() {
    unlockAudio();
    onLive({ phase: "countdown", marks: [] });
    if (!setup.countdown) return go();
    setPhase("countdown");
    setCount(3);
    cue("count", opts);
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
    cue("go", opts);
    onLive({ phase: "running", elapsed: 0, marks: [] });
    setPhase("running");
    setNow(0);
    setTimeout(() => passKey.current?.focus(), 0);
  }

  // The clock, and the cap.
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

  // The run ended: stop filming and show the result.
  useEffect(() => {
    if (!run.ended || phase !== "running") return;
    const clean =
      run.ended.reason === "finished" &&
      run.marks.every((m) => m.result === "pass");
    cue(clean ? "finish" : "end", opts);
    setNow(run.ended.at);
    setPhase("done");
    onLive({
      phase: "done",
      elapsed: run.ended.at,
      marks: run.marks,
      ended: run.ended,
    });
    setSaid(`${ENDINGS[run.ended.reason]} at ${seconds(run.ended.at)}.`);
    release.current();
    // A moment past the finish: the result card when the timer is burned
    // in, and otherwise enough for the encoder to flush the last frames
    // (a very short recording can otherwise come out empty).
    camera.stop(camera.burned.current ? 1000 : 500).then((blob) => {
      setFilming(false);
      if (blob?.size) setVideo({ blob, url: URL.createObjectURL(blob) });
      else if (setup.film)
        setError(
          "The recording came out empty. You can still save the timing.",
        );
    });
  }, [run.ended]);

  useEffect(() => () => video && URL.revokeObjectURL(video.url), [video]);

  function press(result) {
    if (phase !== "running" || run.ended) return;
    const at = elapsed();
    const i = run.marks.length;
    const next = mark(run, result, at);
    setRun(next);
    if (!next.ended) {
      cue(run.quick ? "pass" : result, opts);
      onLive({ phase: "running", elapsed: at, marks: next.marks });
    }
    setSaid(
      run.quick
        ? `Lap ${i + 1} at ${seconds(at)}.`
        : `${run.course.points[i].label}: ${WORD[result]} at ${seconds(at)}.`,
    );
  }

  function back() {
    const next = undo(run);
    setRun(next);
    onLive({ phase: "running", elapsed: elapsed(), marks: next.marks });
  }

  function stop() {
    if (phase === "running") setRun(finish(run, elapsed()));
    else if (phase !== "done") onClose();
  }

  // Keyboard: P or Space pass, F fail, S skip, U undo, Escape ends.
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = e.target.closest?.("button");
      const k = e.key.toLowerCase();
      if ((k === " " || k === "enter") && onButton) return;
      const map = { p: "pass", " ": "pass", f: "fail", s: "skip" };
      if (map[k] && (map[k] === "pass" || !run.quick)) {
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

  async function save() {
    setSaving(true);
    setError("");
    try {
      let attempt;
      if (video) {
        const takeId = crypto.randomUUID();
        const duration = await videoDuration(video.blob, run.ended.at);
        attempt = toAttempt(run, {
          ...setup.who,
          results,
          takeId,
          clipEnd: duration,
        });
        await onSave({
          attempt,
          run,
          blob: video.blob,
          duration,
          burned: camera.burned.current,
        });
      } else {
        attempt = toAttempt(run, { ...setup.who, results });
        await onSave({ attempt, run });
      }
      setSaved(attempt);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const rows = splits(run);
  const at = current(run);
  const point = at == null ? null : run.course.points[at];
  const warn = capWarning(run, now) && phase === "running";
  const lastSplit = rows.at(-1);
  const delta =
    lastSplit && !run.quick && bestPace[rows.length - 1] != null
      ? lastSplit.end - bestPace[rows.length - 1]
      : null;
  const clean =
    run.ended?.reason === "finished" &&
    run.course.points.every(
      (_, i) => (results[i] ?? rows[i]?.result) === "pass",
    );
  const labelOf = (i) =>
    run.quick ? `Lap ${i + 1}` : run.course.points[i].label;
  hud.current = () => ({
    t: run.ended ? run.ended.at : phase === "running" ? elapsed() : 0,
    member: setup.who.member,
    course: run.course.name,
    index: run.marks.length,
    total: run.quick ? 0 : run.course.points.length,
    label: point?.label,
    warn,
    marks: run.marks.map((m, i) => ({ ...m, label: labelOf(i) })),
    ended: run.ended
      ? `${
          run.ended.reason === "finished" &&
          run.marks.every((m) => m.result === "pass")
            ? "Clean run"
            : ENDINGS[run.ended.reason]
        } · ${seconds(run.ended.at)}`
      : null,
  });
  const flash =
    phase === "running" && run.marks.length && now - run.marks.at(-1).at < 1.6
      ? { ...run.marks.at(-1), label: labelOf(run.marks.length - 1) }
      : null;
  const record =
    clean &&
    run.ended &&
    (best == null || run.ended.at < best.seconds) &&
    !!setup.who.memberId;

  return (
    <div
      className={`rp-run ${warn ? "is-warn" : ""}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label="Live run"
    >
      <p className="sr-only" role="status" aria-live="assertive">
        {said}
      </p>
      <div className="rp-run-inner">
        <header className="rp-run-bar">
          <div className="rp-run-who">
            <span className="eyebrow">{setup.who.member || "Unassigned"}</span>
            <b>{run.course.name}</b>
          </div>
          <div className="rp-tags">
            {run.rules.timeCap > 0 && (
              <Tag tone={warn ? "warn" : "outline"}>
                Cap {seconds(run.rules.timeCap)}
              </Tag>
            )}
            {run.rules.failLimit > 0 && (
              <Tag tone={fails(run) ? "bad" : "outline"}>
                Fails {fails(run)} of {run.rules.failLimit}
              </Tag>
            )}
            {setup.film && phase === "running" && (
              <Tag tone="live">Filming</Tag>
            )}
          </div>
          {phase === "done" ? (
            <Button
              variant="light"
              size="sm"
              icon={X}
              onClick={() =>
                (saved || confirm("Close without saving this run?")) &&
                onClose()
              }
            >
              Close
            </Button>
          ) : (
            <Button variant="light" size="sm" icon={Flag} onClick={stop}>
              {phase === "running" ? "End run" : "Cancel"}
            </Button>
          )}
        </header>

        {setup.film && phase !== "done" && (
          <div className="rp-run-cam">
            <video ref={camera.preview} autoPlay muted playsInline />
            {phase === "running" && (
              <div className="rp-run-hud" aria-hidden="true">
                <b>{clock(now)}</b>
                {point && (
                  <span>
                    {at + 1} of {run.course.points.length} · {point.label}
                  </span>
                )}
              </div>
            )}
            {flash && (
              <span
                className={`rp-run-flash is-${flash.result}`}
                aria-hidden="true"
              >
                {flash.label} · {WORD[flash.result] ?? "Lap"} {clock(flash.at)}
              </span>
            )}
            {setup.film && phase === "running" && (
              <span className="rp-run-rec" aria-hidden="true">
                {camera.burned.current ? "Timer in video" : "Recording"}
              </span>
            )}
            {!camera.ready && !camera.error && (
              <span className="rp-run-cam-note">Opening the camera…</span>
            )}
          </div>
        )}
        {camera.error && (
          <p className="rp-inline is-error" role="alert">
            {camera.error}
          </p>
        )}

        {phase === "ready" && (
          <div className="rp-run-start">
            <p className="rp-run-hint">
              {run.quick
                ? "Tap Lap at each split and Finish at the end."
                : `${run.course.points.length} obstacles. Mark each one as the athlete clears it.`}
            </p>
            <button
              className="rp-run-key rp-run-pass"
              autoFocus
              disabled={!camera.ready}
              onClick={begin}
            >
              {setup.countdown ? "Start countdown" : "Go"}
            </button>
            <p className="rp-run-keys">
              Keyboard: P or Space pass · F fail · S skip · U undo · Esc ends
            </p>
          </div>
        )}

        {phase === "countdown" && (
          <div className="rp-run-count" aria-live="assertive">
            {count}
          </div>
        )}

        {(phase === "running" || phase === "done") && (
          <div className="rp-run-clock">
            <span className="rp-run-time">{clock(now)}</span>
            {phase === "running" && delta != null && (
              <span className={`rp-run-pace ${delta <= 0 ? "is-ahead" : ""}`}>
                {seconds(Math.abs(delta))} {delta <= 0 ? "ahead of" : "behind"}{" "}
                best
              </span>
            )}
          </div>
        )}

        {phase === "running" && !run.ended && (
          <>
            <div className="rp-run-now">
              {run.quick ? (
                <b>Lap {run.marks.length + 1}</b>
              ) : (
                <>
                  <span className="rp-point-n">{at + 1}</span>
                  <div>
                    <b>{point.label}</b>
                    <span>
                      {point.skill || "Obstacle"} · {at + 1} of{" "}
                      {run.course.points.length}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className={`rp-run-pad ${run.quick ? "is-quick" : ""}`.trim()}>
              {!run.quick && (
                <button
                  className="rp-run-key rp-run-fail"
                  onClick={() => press("fail")}
                >
                  <X size={28} aria-hidden="true" /> Fail
                </button>
              )}
              <button
                ref={passKey}
                className="rp-run-key rp-run-pass"
                onClick={() => press("pass")}
              >
                <Check size={28} aria-hidden="true" />{" "}
                {run.quick ? "Lap" : "Pass"}
              </button>
              {run.quick ? (
                <Button variant="light" icon={Flag} onClick={stop}>
                  Finish
                </Button>
              ) : (
                <Button
                  variant="light"
                  icon={SkipForward}
                  onClick={() => press("skip")}
                >
                  Skip
                </Button>
              )}
              <Button
                variant="light"
                icon={Undo2}
                disabled={!run.marks.length}
                onClick={back}
              >
                Undo
              </Button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="rp-run-result">
            <h2>
              {clean
                ? `Clean run in ${seconds(run.ended.at)}`
                : `${ENDINGS[run.ended.reason]} at ${seconds(run.ended.at)}`}
            </h2>
            <div className="rp-tags">
              {record && <Tag tone="live">New personal best</Tag>}
              {best && !record && clean && (
                <Tag tone="outline">
                  Best is {seconds(best.seconds)} (
                  {seconds(run.ended.at - best.seconds)} off)
                </Tag>
              )}
              {!run.quick && (
                <Tag tone="outline">
                  {
                    rows.filter((r, i) => (results[i] ?? r.result) === "pass")
                      .length
                  }{" "}
                  of {run.course.points.length} passed
                </Tag>
              )}
            </div>
            {video && (
              <video
                className="rp-run-replay"
                src={video.url}
                controls
                playsInline
                aria-label="Recording of this run"
              />
            )}
            {filming && <p className="rp-run-hint">Finishing the recording…</p>}
          </div>
        )}

        {rows.length > 0 && (
          <ol className="rp-run-splits" aria-label="Splits">
            {rows.map((r, i) => {
              const result = results[i] ?? r.result;
              const was = bestPace[i];
              return (
                <li key={i}>
                  <span className="rp-run-n">{i + 1}</span>
                  <span className="rp-run-label">
                    <b>{r.label}</b>
                    {r.skill && <small>{r.skill}</small>}
                  </span>
                  <span className="rp-run-mark">
                    {phase === "done" && !run.quick && !saved ? (
                      <Segmented
                        label={`${r.label} result`}
                        options={RESULTS}
                        value={result}
                        onChange={(v) => {
                          const next = [...results];
                          next[i] = v;
                          setResults(next);
                        }}
                      />
                    ) : (
                      !run.quick && (
                        <Tag tone={TONE[result]}>{WORD[result]}</Tag>
                      )
                    )}
                  </span>
                  <span className="rp-run-times">
                    <b>{clock(r.end)}</b>
                    <small>
                      +{seconds(r.seconds)}
                      {was != null && !run.quick
                        ? ` · ${r.end - was <= 0 ? "−" : "+"}${Math.abs(r.end - was).toFixed(1)} vs best`
                        : ""}
                    </small>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {phase === "done" && (
          <div className="rp-run-actions">
            {error && (
              <p className="rp-inline is-error" role="alert">
                {error}
              </p>
            )}
            {saved ? (
              <>
                <p className="rp-run-saved" role="status">
                  <Check size={18} aria-hidden="true" /> Saved
                  {video ? " as a take with its attempt scored" : ""}.
                </p>
                <Button key="again" icon={RotateCcw} onClick={onAgain}>
                  Run again
                </Button>
                {saved.takeId && (
                  <Button
                    key="review"
                    variant="light"
                    icon={Film}
                    onClick={() => onClose(saved.takeId)}
                  >
                    Open in Review
                  </Button>
                )}
                <Button key="next" variant="light" onClick={() => onClose()}>
                  Next athlete
                </Button>
              </>
            ) : (
              <>
                <Button
                  key="save"
                  icon={Check}
                  disabled={saving || filming}
                  onClick={save}
                >
                  {saving ? "Saving…" : "Save run"}
                </Button>
                <Button
                  key="discard"
                  variant="light"
                  onClick={() => {
                    if (confirm("Discard this run?")) onClose();
                  }}
                >
                  Discard
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
