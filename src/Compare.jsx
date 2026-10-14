// Two takes side by side (or one over the other as a ghost), playing
// together from a shared moment: the clip start or any obstacle both
// attempts timed. A is the open take; B follows it.
import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Layers2,
  Pause,
  Play,
  Star,
  Swords,
  Video,
} from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Section,
  Segmented,
  Select,
  Tag,
} from "./ds/index.jsx";
import { color } from "./ds/tokens.js";
import { day, seconds } from "./format.js";
import {
  alignments,
  bAt,
  candidates,
  defaultAlignment,
  partner,
  span,
  splitDeltas,
  takeLabel,
  together,
  whose,
} from "./compare.js";
import "./compare.css";

const SPEEDS = [
  { value: 0.25, label: "¼×" },
  { value: 0.5, label: "½×" },
  { value: 1, label: "1×" },
];
const MODES = [
  { value: "side", label: "Side by side" },
  { value: "ghost", label: "Ghost" },
];
const signed = (t) => `${t < 0 ? "−" : "+"}${Math.abs(t).toFixed(1)}s`;

function useBlobUrl(blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return setUrl("");
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

// Draws one video frame into a box, letterboxed, with a caption bar.
function drawFrame(ctx, video, x, w, h, caption) {
  ctx.fillStyle = color.ink;
  ctx.fillRect(x, 0, w, h);
  if (video.videoWidth) {
    const s = Math.min(w / video.videoWidth, (h - 48) / video.videoHeight);
    const vw = video.videoWidth * s;
    const vh = video.videoHeight * s;
    ctx.drawImage(video, x + (w - vw) / 2, (h - 48 - vh) / 2, vw, vh);
  }
  ctx.fillStyle = color.navy;
  ctx.fillRect(x, h - 48, w, 48);
  ctx.fillStyle = color.white;
  ctx.font = "600 22px 'Work Sans', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, x + 16, h - 24, w - 32);
}

export default function Compare({ take, takes, request, onAddFrame, onError }) {
  const list = candidates(take, takes);
  const [bId, setBId] = useState(() => partner(take, takes)?.id ?? "");
  const b = list.find((t) => t.id === bId) ?? null;
  const aligns = b ? alignments(take, b) : [];
  const [alignValue, setAlignValue] = useState("");
  const align =
    aligns.find((x) => x.value === alignValue) ?? defaultAlignment(aligns);
  const [nudge, setNudge] = useState(0);
  const [mode, setMode] = useState("side");
  const [ghost, setGhost] = useState(50);
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState({ a: take.duration, b: b?.duration ?? 0 });
  const refA = useRef(null);
  const refB = useRef(null);
  const raf = useRef(0);
  const urlA = useBlobUrl(take.blob);
  const urlB = useBlobUrl(b?.blob);
  const deltas = b ? splitDeltas(take, b) : null;
  const range = align ? span(dur.a, align.a) : { from: 0, to: 0 };
  const headToHead = b && !b.model && b.memberId !== take.memberId;

  // Put both videos at shared time tt.
  function place(tt) {
    const A = refA.current;
    const B = refB.current;
    if (!A || !B || !align) return;
    const next = Math.min(Math.max(tt, range.from), range.to);
    A.currentTime = align.a + next;
    B.currentTime = bAt(next, align.b, nudge, dur.b).time;
    setT(next);
  }

  function pause() {
    cancelAnimationFrame(raf.current);
    refA.current?.pause();
    refB.current?.pause();
    setPlaying(false);
  }

  function play() {
    const A = refA.current;
    const B = refB.current;
    if (!A || !B) return;
    if (t >= range.to - 0.05) place(range.from);
    A.playbackRate = B.playbackRate = speed;
    A.play().catch(() => {});
    setPlaying(true);
    const loop = () => {
      const tt = A.currentTime - align.a;
      const pos = bAt(tt, align.b, nudge, dur.b);
      if (!pos.inside) {
        if (!B.paused) B.pause();
        if (Math.abs(B.currentTime - pos.time) > 0.05) B.currentTime = pos.time;
      } else {
        if (B.paused && !A.paused) B.play().catch(() => {});
        // Keep B within two frames of where A says it should be.
        if (Math.abs(B.currentTime - pos.time) > 0.08) B.currentTime = pos.time;
      }
      setT(tt);
      if (A.ended || A.paused || tt >= range.to) return pause();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // "Side by side" from an earlier attempt picks that take.
  useEffect(() => {
    if (request?.id && list.some((x) => x.id === request.id))
      setBId(request.id);
  }, [request?.n]);

  // A new partner or alignment starts from the shared moment, paused.
  useEffect(() => {
    pause();
    setNudge(0);
    setAlignValue("");
    setDur((d) => ({ ...d, b: b?.duration ?? 0 }));
  }, [bId]);
  useEffect(() => {
    pause();
    place(0);
  }, [bId, align?.value, align?.a, align?.b, dur.a, dur.b]);
  useEffect(() => {
    if (!playing) place(t);
  }, [nudge]);
  useEffect(() => {
    if (refA.current) refA.current.playbackRate = speed;
    if (refB.current) refB.current.playbackRate = speed;
  }, [speed]);

  function still() {
    try {
      const A = refA.current;
      const B = refB.current;
      if (!A?.videoWidth || !B?.videoWidth)
        throw Error("Wait for both videos to load.");
      pause();
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 408;
      const ctx = c.getContext("2d");
      drawFrame(
        ctx,
        A,
        0,
        640,
        408,
        `${take.member || "This take"} · ${day(take.createdAt)}`,
      );
      drawFrame(
        ctx,
        B,
        640,
        640,
        408,
        `${whose(b, "Other take")} · ${day(b.createdAt)}`,
      );
      ctx.fillStyle = color.cyan;
      ctx.fillRect(638, 0, 4, 408);
      onAddFrame({
        id: crypto.randomUUID(),
        time: A.currentTime,
        image: c.toDataURL("image/jpeg", 0.85),
        note: b.model
          ? `Side by side with the model clip "${b.model.title}".${b.model.note ? ` Watch for: ${b.model.note}` : ""}`
          : `Side by side with ${b.member || "another take"} on ${day(b.createdAt)}.`,
      });
    } catch (e) {
      onError(e.message);
    }
  }

  const where = align
    ? `${signed(t)} from ${align.value === "clip" ? "the clip start" : align.label.replace(/^\d+\. /, "")}`
    : "";

  return (
    <Section
      title="Side by side"
      note="Play this take with another run, lined up at the same moment."
      actions={
        list.length > 0 && (
          <div className="rp-compare-pick">
            <Field label="Compare with">
              <Select
                value={bId}
                onChange={setBId}
                options={[
                  { value: "", label: "Choose a take" },
                  ...list.map((x) => ({
                    value: x.id,
                    label: `${takeLabel(x)} · ${day(x.createdAt)}${x.attempt?.completed ? ` · ${seconds(x.attempt.seconds)}` : ""}`,
                  })),
                ]}
              />
            </Field>
          </div>
        )
      }
    >
      {!list.length ? (
        <Card>
          <Empty icon={Columns2} title="Nothing to compare yet">
            Record or import another take. Runs of the same course line up at
            each obstacle.
          </Empty>
        </Card>
      ) : !b ? (
        <Card>
          <Empty icon={Columns2} title="Choose a take to compare">
            Pick one above. The fastest clean run of this course is suggested
            when there is one.
          </Empty>
        </Card>
      ) : (
        <>
          <Card
            as="section"
            tone="ink"
            pad="md"
            className="rp-compare"
            aria-label="Comparison"
          >
            <div className={`rp-compare-stage is-${mode}`}>
              <figure className="rp-compare-a">
                <video
                  ref={refA}
                  src={urlA || undefined}
                  muted
                  playsInline
                  preload="auto"
                  aria-label="This take"
                  onLoadedMetadata={(e) => {
                    const a = e.currentTarget.duration;
                    if (Number.isFinite(a)) setDur((d) => ({ ...d, a }));
                  }}
                />
                <figcaption>
                  <Tag tone="live">A</Tag> {take.member || "This take"} ·{" "}
                  {day(take.createdAt)}
                </figcaption>
              </figure>
              <figure
                className="rp-compare-b"
                style={mode === "ghost" ? { opacity: ghost / 100 } : undefined}
              >
                <video
                  ref={refB}
                  src={urlB || undefined}
                  muted
                  playsInline
                  preload="auto"
                  aria-label="Compared take"
                  onLoadedMetadata={(e) => {
                    const length = e.currentTarget.duration;
                    setDur((d) => ({
                      ...d,
                      b: Number.isFinite(length) ? length : b.duration,
                    }));
                  }}
                />
                <figcaption>
                  <Tag tone="outline">B</Tag> {whose(b, "Other take")} ·{" "}
                  {day(b.createdAt)}
                </figcaption>
              </figure>
            </div>

            <input
              className="rp-compare-scrub"
              type="range"
              min={range.from}
              max={range.to}
              step="0.01"
              value={t}
              aria-label="Position"
              aria-valuetext={where}
              onChange={(e) => {
                pause();
                place(Number(e.target.value));
              }}
            />
            <div className="rp-transport">
              <span className="rp-time">
                {signed(t)}{" "}
                <small>
                  from{" "}
                  {align.value === "clip"
                    ? "clip start"
                    : align.label.replace(/^\d+\. /, "")}
                </small>
              </span>
              <div className="rp-actions">
                <Button
                  icon={playing ? Pause : Play}
                  onClick={playing ? pause : play}
                >
                  {playing ? "Pause" : "Play both"}
                </Button>
                <Button
                  variant="light"
                  size="sm"
                  icon={ChevronLeft}
                  title="Both back a tenth of a second"
                  onClick={() => {
                    pause();
                    place(t - 0.1);
                  }}
                >
                  −0.1s
                </Button>
                <Button
                  variant="light"
                  size="sm"
                  icon={ChevronRight}
                  title="Both forward a tenth of a second"
                  onClick={() => {
                    pause();
                    place(t + 0.1);
                  }}
                >
                  +0.1s
                </Button>
              </div>
              <Segmented
                label="Comparison speed"
                options={SPEEDS}
                value={speed}
                onChange={setSpeed}
              />
            </div>
            <div className="rp-transport">
              <Segmented
                label="Layout"
                options={MODES}
                value={mode}
                onChange={setMode}
              />
              {mode === "ghost" && (
                <label className="rp-compare-ghost">
                  <Layers2 size={16} aria-hidden="true" />
                  <span>B opacity</span>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={ghost}
                    onChange={(e) => setGhost(Number(e.target.value))}
                  />
                  <b>{ghost}%</b>
                </label>
              )}
              <Button variant="light" size="sm" icon={Camera} onClick={still}>
                Save as key frame
              </Button>
            </div>
          </Card>

          <div className="rp-compare-detail">
            <Card as="section" pad="md" aria-labelledby="rp-align-title">
              <header className="ds-card-head">
                <div>
                  <h3 className="ds-h3" id="rp-align-title">
                    Line them up
                  </h3>
                  <p className="ds-note">
                    {align.value === "sync"
                      ? "Two cameras on the same run, lined up by when each started filming. Nudge B if one looks a frame off."
                      : aligns.length > 1
                        ? "Both start from the same obstacle. Nudge B if a timing was tapped late."
                        : "These runs don't share timed obstacles, so they line up at each clip's start."}
                  </p>
                </div>
                {headToHead && (
                  <Tag tone="info" icon={Swords}>
                    Head to head
                  </Tag>
                )}
                {together(take, b) && (
                  <Tag tone="info" icon={Video}>
                    {b.angle || "Other camera"}
                  </Tag>
                )}
                {b.model && (
                  <Tag tone="brand" icon={Star}>
                    Model clip
                  </Tag>
                )}
              </header>
              <Field label="Line up at">
                <Select
                  value={align.value}
                  onChange={setAlignValue}
                  options={aligns.map((x) => ({
                    value: x.value,
                    label: x.label,
                  }))}
                  disabled={aligns.length < 2}
                />
              </Field>
              <div className="rp-compare-nudge">
                <span className="ds-field-label">Nudge B</span>
                <div className="rp-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      pause();
                      setNudge((n) => Math.round((n - 0.1) * 10) / 10);
                    }}
                  >
                    B earlier
                  </Button>
                  <b className="rp-compare-offset" aria-live="polite">
                    {nudge === 0 ? "No offset" : `B ${signed(nudge)}`}
                  </b>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      pause();
                      setNudge((n) => Math.round((n + 0.1) * 10) / 10);
                    }}
                  >
                    B later
                  </Button>
                </div>
              </div>
            </Card>

            <Card as="section" pad="md" aria-labelledby="rp-split-title">
              <CardHead
                title={<span id="rp-split-title">Obstacle times</span>}
                note={
                  deltas
                    ? "A minus B. Faster is shorter."
                    : "Times compare when both takes have a scored attempt on the same course."
                }
              />
              {deltas && (
                <table className="rp-compare-table">
                  <thead>
                    <tr>
                      <th scope="col">Obstacle</th>
                      <th scope="col">A</th>
                      <th scope="col">B</th>
                      <th scope="col">A vs B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deltas.rows.map((r, i) => (
                      <tr key={i}>
                        <th scope="row">
                          {i + 1}. {r.label}
                        </th>
                        <td>{r.a == null ? r.resultA : seconds(r.a)}</td>
                        <td>{r.b == null ? r.resultB : seconds(r.b)}</td>
                        <td>
                          <Delta value={r.delta} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Whole run</th>
                      <td>{seconds(deltas.a.seconds)}</td>
                      <td>{seconds(deltas.b.seconds)}</td>
                      <td>
                        {deltas.total == null ? (
                          <Tag tone="neutral">Not both clean</Tag>
                        ) : (
                          <Delta value={deltas.total} />
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </Section>
  );
}

function Delta({ value }) {
  if (value == null) return <span className="ds-note">—</span>;
  if (Math.abs(value) < 0.05) return <Tag tone="neutral">Even</Tag>;
  return value < 0 ? (
    <Tag tone="good">{seconds(-value)} faster</Tag>
  ) : (
    <Tag tone="bad">{seconds(value)} slower</Tag>
  );
}
