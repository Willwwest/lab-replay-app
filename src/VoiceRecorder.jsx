// Recording a voice-over, full screen: the take plays on a canvas the coach
// controls (play, pause, step, slow down) and draws on with a finger, with
// their camera in a corner if they like. Record captures that canvas and the
// microphone together; afterwards the coach watches it back and keeps it or
// records again. Nothing records until Start recording.
import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  Mic,
  MoveUpRight,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, IconButton, Segmented } from "./ds/index.jsx";
import { create, extend } from "./drawing.js";
import { useFit, videoDuration } from "./hooks.js";
import { useLayer } from "./route.js";
import { clock } from "./format.js";
import {
  H,
  MAX_SECONDS,
  W,
  compose,
  level,
  voiceRecord,
  voiceType,
  within,
} from "./voiceover.js";
import "./voice.css";

const TOOLS = [
  { value: "pen", label: "Freehand", icon: Pencil },
  { value: "arrow", label: "Arrow", icon: MoveUpRight },
  { value: "circle", label: "Circle", icon: Circle },
];
const SPEEDS = [
  { value: 0.25, label: "¼×" },
  { value: 0.5, label: "½×" },
  { value: 1, label: "1×" },
];

export default function VoiceRecorder({
  take,
  url,
  caption,
  coach,
  onSave,
  onClose,
}) {
  const canvas = useRef(null);
  const source = useRef(null);
  const selfie = useRef(null);
  const stage = useRef(null);
  const meter = useRef(null);
  const mic = useRef(null);
  const cam = useRef(null);
  const recorder = useRef(null);
  const started = useRef(0);
  const marks = useRef({ shapes: [], draft: null });
  const [micReady, setMicReady] = useState(false);
  const [error, setError] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [phase, setPhase] = useState("ready"); // ready, recording, saving, review
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState("pen");
  const [count, setCount] = useState(0); // marks on screen
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null); // { blob, url, duration }
  const [now, setNow] = useState(take.start);
  const box = useFit(stage, W, H);
  const dismiss = useLayer(onClose);
  const supported =
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";

  // The microphone, and a meter so the coach can see it's hearing them.
  useEffect(() => {
    if (!supported) {
      setError("This browser can't record a voice-over. Try Chrome or Safari.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "The microphone needs HTTPS. Open Replay from its https:// address.",
      );
      return;
    }
    let live = true;
    let audio;
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        mic.current = s;
        try {
          audio = new AudioContext();
          const analyser = audio.createAnalyser();
          analyser.fftSize = 512;
          audio.createMediaStreamSource(s).connect(analyser);
          mic.current.analyser = analyser;
        } catch {}
        setMicReady(true);
      })
      .catch(() =>
        setError(
          "The microphone didn't open. Allow microphone access in the browser's settings, then try again.",
        ),
      );
    return () => {
      live = false;
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      mic.current?.getTracks().forEach((t) => t.stop());
      audio?.close().catch(() => {});
    };
  }, []);

  // The coach's own camera, only while it's switched on.
  useEffect(() => {
    if (!camOn) return;
    let live = true;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: false,
      })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        cam.current = s;
        if (selfie.current) selfie.current.srcObject = s;
      })
      .catch(() => {
        setCamOn(false);
        setError("Your camera didn't open, so the voice-over is voice only.");
      });
    return () => {
      live = false;
      cam.current?.getTracks().forEach((t) => t.stop());
      cam.current = null;
      if (selfie.current) selfie.current.srcObject = null;
    };
  }, [camOn]);

  // Draw every frame: the take, the marks, the camera, the mic level.
  useEffect(() => {
    let raf;
    let last = 0;
    const samples = new Uint8Array(512);
    const loop = (ts) => {
      const v = source.current;
      const ctx = canvas.current?.getContext("2d");
      if (v && ctx) {
        if (!v.paused && v.currentTime >= take.end) {
          v.pause();
          v.currentTime = take.end;
        }
        const { shapes, draft } = marks.current;
        compose(ctx, {
          video: v,
          cam: cam.current ? selfie.current : null,
          shapes: draft ? [...shapes, draft] : shapes,
          caption,
          t: v.currentTime - take.start,
        });
        if (ts - last > 120) {
          last = ts;
          setNow(v.currentTime);
          if (recorder.current?.state === "recording") {
            const s = (performance.now() - started.current) / 1000;
            setElapsed(s);
            if (s >= MAX_SECONDS) stop();
          }
        }
      }
      const a = mic.current?.analyser;
      if (a && meter.current) {
        a.getByteTimeDomainData(samples);
        meter.current.style.setProperty("--level", level(samples).toFixed(2));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [caption, take.start, take.end]);

  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

  const video = () => source.current;
  function seek(t) {
    const v = video();
    if (!v) return;
    v.currentTime = within(t, take);
    setNow(v.currentTime);
  }
  function togglePlay() {
    const v = video();
    if (!v) return;
    if (v.paused) {
      if (v.currentTime >= take.end - 0.05) v.currentTime = take.start;
      v.playbackRate = speed;
      v.play().catch(() => {});
    } else v.pause();
  }

  function start() {
    setError("");
    const v = video();
    const stream = new MediaStream([
      ...canvas.current.captureStream(30).getVideoTracks(),
      ...mic.current.getAudioTracks(),
    ]);
    const type = voiceType();
    const r = new MediaRecorder(stream, {
      ...(type ? { mimeType: type } : {}),
      videoBitsPerSecond: 2_500_000,
    });
    const chunks = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      stream.getVideoTracks().forEach((t) => t.stop());
      const length = (performance.now() - started.current) / 1000;
      const blob = new Blob(chunks, { type: r.mimeType });
      try {
        const duration = await videoDuration(blob, length);
        setResult({ blob, url: URL.createObjectURL(blob), duration });
        setPhase("review");
      } catch (e) {
        setError(e.message);
        setPhase("ready");
      }
    };
    r.start(500);
    recorder.current = r;
    started.current = performance.now();
    setElapsed(0);
    setPhase("recording");
    if (v?.paused) togglePlay();
  }

  function stop() {
    const r = recorder.current;
    if (r?.state !== "recording") return;
    video()?.pause();
    setPhase("saving");
    r.stop();
  }

  function again() {
    setResult(null);
    setPhase("ready");
  }

  async function keep() {
    setPhase("saving");
    try {
      await onSave(
        voiceRecord({
          takeId: take.id,
          blob: result.blob,
          duration: result.duration,
          coach,
          camera: camOn,
        }),
      );
      dismiss();
    } catch (e) {
      setError(e.message);
      setPhase("review");
    }
  }

  function close() {
    if (
      (phase === "recording" || phase === "review") &&
      !confirm("Throw this voice-over away?")
    )
      return;
    dismiss();
  }

  // Drawing on the picture with a finger, while it plays or paused.
  const at = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    marks.current.draft =
      tool === "pen"
        ? create("pen", p, null, { ink: "gold" })
        : { ...create(tool, p, p, { ink: "gold", w: W, h: H }), start: p };
  }
  function moveTo(e) {
    const d = marks.current.draft;
    if (!d) return;
    const p = at(e);
    marks.current.draft =
      d.type === "pen" ? extend(d, p, W, H) : { ...d, b: p };
  }
  function up() {
    const d = marks.current.draft;
    marks.current.draft = null;
    if (!d) return;
    const s =
      d.type === "pen"
        ? d
        : create(d.type, d.start, d.b, { ink: "gold", w: W, h: H });
    if (s.type === "pen" && s.points.length < 2) return;
    marks.current.shapes = [...marks.current.shapes, s];
    setCount(marks.current.shapes.length);
  }
  function clearMarks() {
    marks.current.shapes = [];
    setCount(0);
  }

  const recording = phase === "recording";
  const review = phase === "review" && result;
  const paused = !playing;

  return createPortal(
    <div
      className="rp-voice"
      role="dialog"
      aria-modal="true"
      aria-label="Record a voice-over"
    >
      <header className="rp-voice-top">
        <IconButton label="Close" icon={X} onClick={close} />
        <div className="rp-voice-title">
          <b>{review ? "Watch it back" : "Voice-over"}</b>
          <small>
            {review
              ? `${clock(result.duration)} recorded. Keep it, or record again.`
              : recording
                ? "Talk them through it. Pause, step and draw as you go."
                : "Talk through the clip while it plays. You can pause, step and draw."}
          </small>
        </div>
        {recording && (
          <span className="rp-voice-rec" role="status">
            <i aria-hidden="true" /> {clock(elapsed)}
          </span>
        )}
      </header>

      <div className="rp-voice-stage" ref={stage}>
        <canvas
          ref={canvas}
          width={W}
          height={H}
          hidden={!!review}
          style={{ width: box.w || undefined, height: box.h || undefined }}
          role="img"
          aria-label={`The clip, ${count} mark${count === 1 ? "" : "s"} drawn`}
          onPointerDown={down}
          onPointerMove={moveTo}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {review && (
          <video
            className="rp-voice-review"
            src={result.url}
            controls
            playsInline
            style={{ width: box.w || undefined, height: box.h || undefined }}
            aria-label="The voice-over you recorded"
          />
        )}
      </div>
      <video
        ref={source}
        className="rp-voice-source"
        src={url || undefined}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => (e.currentTarget.currentTime = take.start)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <video
        ref={selfie}
        className="rp-voice-source"
        muted
        playsInline
        autoPlay
      />

      {error && (
        <p className="rp-voice-error" role="alert">
          {error}
        </p>
      )}

      <footer className="rp-voice-bar">
        {review ? (
          <div className="rp-voice-go">
            <Button variant="light" icon={RotateCcw} onClick={again}>
              Record again
            </Button>
            <Button icon={Check} disabled={phase === "saving"} onClick={keep}>
              Keep voice-over
            </Button>
          </div>
        ) : (
          <>
            <div className="rp-voice-transport">
              <Button
                variant="light"
                size="sm"
                icon={paused ? Play : Pause}
                onClick={togglePlay}
              >
                {paused ? "Play" : "Pause"}
              </Button>
              <IconButton
                label="Back one second"
                icon={ChevronLeft}
                onClick={() => seek(now - 1)}
              />
              <input
                type="range"
                className="rp-voice-scrub"
                min={take.start}
                max={take.end}
                step="0.05"
                value={now}
                aria-label="Position in the clip"
                aria-valuetext={clock(now - take.start)}
                onChange={(e) => seek(Number(e.target.value))}
              />
              <IconButton
                label="Forward one second"
                icon={ChevronRight}
                onClick={() => seek(now + 1)}
              />
              <Segmented
                label="Speed"
                options={SPEEDS}
                value={speed}
                onChange={(s) => {
                  setSpeed(s);
                  if (video()) video().playbackRate = s;
                }}
              />
            </div>
            <div className="rp-voice-row">
              <div
                className="rp-voice-tools"
                role="radiogroup"
                aria-label="Draw with"
              >
                {TOOLS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={tool === value}
                    aria-label={label}
                    title={label}
                    onClick={() => setTool(value)}
                  >
                    <Icon size={20} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <IconButton
                label="Clear the marks"
                icon={Eraser}
                disabled={!count}
                onClick={clearMarks}
              />
              <button
                type="button"
                className="rp-voice-toggle"
                aria-pressed={camOn}
                onClick={() => setCamOn((c) => !c)}
              >
                {camOn ? (
                  <Camera size={18} aria-hidden="true" />
                ) : (
                  <CameraOff size={18} aria-hidden="true" />
                )}
                My camera
              </button>
              <span
                className="rp-voice-meter"
                ref={meter}
                title="Microphone level"
              >
                <Mic size={18} aria-hidden="true" />
                <span aria-hidden="true" />
                <span className="sr-only">
                  {micReady ? "Microphone on" : "Microphone off"}
                </span>
              </span>
            </div>
            <div className="rp-voice-go">
              {recording || phase === "saving" ? (
                <Button
                  className="rp-voice-stop"
                  icon={Square}
                  disabled={phase === "saving"}
                  onClick={stop}
                >
                  Stop recording
                </Button>
              ) : (
                <Button
                  className="rp-voice-start"
                  icon={Mic}
                  disabled={!micReady}
                  onClick={start}
                >
                  Start recording
                </Button>
              )}
            </div>
          </>
        )}
      </footer>
    </div>,
    document.body,
  );
}
