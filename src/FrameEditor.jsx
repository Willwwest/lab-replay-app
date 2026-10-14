// Drawing on a key frame, full screen: arrows, lines, circles, angles that
// read their own degrees, text labels and freehand. Drag to draw; tap for a
// default-size mark. The selected mark shows handles to drag; Move drags a
// whole mark. Body finds the kid's pose on the still and shows the angle at
// each joint; tapping a reading (or a joint, with Angle) turns it into an
// angle mark the coach can adjust. Done keeps the marks on the frame; the
// clean still is kept too, so a drawing can always be changed or removed.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  DraftingCompass,
  Eraser,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  PersonStanding,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, IconButton, Input } from "./ds/index.jsx";
import {
  INKS,
  MAX_SHAPES,
  MAX_TEXT,
  clean,
  create,
  describe,
  extend,
  hit,
  move,
  render,
  setHandle,
} from "./drawing.js";
import {
  angleMark,
  found,
  jointAngles,
  nearestJoint,
  poseRecord,
  renderSkeleton,
} from "./pose.js";
import { useLayer } from "./route.js";
import { useFit } from "./hooks.js";
import { stamp } from "./format.js";
import "./draw.css";

const TOOLBAR = [
  { value: "move", label: "Move", icon: MousePointer2 },
  { value: "arrow", label: "Arrow", icon: MoveUpRight },
  { value: "line", label: "Line", icon: Minus },
  { value: "circle", label: "Circle", icon: Circle },
  { value: "angle", label: "Angle", icon: DraftingCompass },
  { value: "text", label: "Text", icon: Type },
  { value: "pen", label: "Freehand", icon: Pencil },
];
const HINT = {
  move: "Drag a mark to move it, or its dots to reshape it.",
  arrow: "Drag from where it starts to where it points.",
  line: "Drag to draw a line.",
  circle: "Drag from the middle outwards.",
  angle: "Tap a joint, then drag the three dots onto the body.",
  text: "Type a label, then tap where it goes.",
  pen: "Draw with your finger.",
};

export default function FrameEditor({ frame, onDone, onClose, findBody }) {
  const [shapes, setShapes] = useState(() => clean(frame.drawing?.shapes));
  const [past, setPast] = useState([]);
  const [tool, setTool] = useState("arrow");
  const [ink, setInk] = useState("cyan");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [size, setSize] = useState(null); // the image's own pixels
  const [busy, setBusy] = useState(false);
  const [pose, setPose] = useState(frame.pose ?? null);
  const [body, setBody] = useState(!!frame.drawing?.body);
  const [finding, setFinding] = useState(false);
  const [bodyError, setBodyError] = useState("");
  const stage = useRef(null);
  const canvas = useRef(null);
  const drag = useRef(null);
  const box = useFit(stage, size?.w, size?.h); // shown, CSS pixels
  const dismiss = useLayer(onClose);
  const changed = past.length > 0 || body !== !!frame.drawing?.body;
  const showBody = body && found(pose);
  const joints = showBody ? jointAngles(pose.landmarks, box.w, box.h) : [];
  const layers = useCallback(
    (ctx, w, h) => showBody && renderSkeleton(ctx, pose.landmarks, w, h),
    [showBody, pose],
  );

  const close = () => {
    if (changed && !confirm("Discard the marks you drew?")) return;
    dismiss();
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !box.w) return;
    const dpr = devicePixelRatio || 1;
    c.width = Math.round(box.w * dpr);
    c.height = Math.round(box.h * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.w, box.h);
    layers(ctx, box.w, box.h);
    render(ctx, draft ? [...shapes, draft] : shapes, box.w, box.h, {
      selected,
    });
  }, [shapes, draft, selected, box, layers]);

  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input, textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected)
        removeSelected();
      else if (e.key === "Escape") close();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  function commit(next) {
    setPast((p) => [...p, shapes]);
    setShapes(next);
  }
  function undo() {
    if (!past.length) return;
    setShapes(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSelected(null);
  }
  function removeSelected() {
    commit(shapes.filter((s) => s.id !== selected));
    setSelected(null);
  }

  const at = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  function down(e) {
    if (!box.w) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    const found = hit(shapes, p, box.w, box.h, selected);
    // Handles of the selected mark work with any tool; Move also grabs
    // whole marks.
    if (found && (found.handle || tool === "move")) {
      setSelected(found.id);
      drag.current = { ...found, from: p, before: shapes, moved: false };
      return;
    }
    if (tool === "move") return setSelected(null);
    if (shapes.length >= MAX_SHAPES) return;
    const opts = { ink, text: text.trim(), w: box.w, h: box.h };
    if (tool === "text") {
      if (!opts.text) return;
      const s = create("text", p, null, opts);
      commit([...shapes, s]);
      setSelected(s.id);
      setText("");
      return;
    }
    if (tool === "angle") {
      const joint = nearestJoint(joints, p, box.w, box.h);
      const s = joint ? angleMark(joint, ink) : create("angle", p, null, opts);
      commit([...shapes, s]);
      setSelected(s.id);
      return;
    }
    setSelected(null);
    setDraft(
      tool === "pen"
        ? create("pen", p, null, opts)
        : { ...create(tool, p, p, opts), start: p },
    );
  }

  function moveTo(e) {
    const p = at(e);
    const d = drag.current;
    if (d) {
      d.moved = true;
      setShapes(
        d.before.map((s) =>
          s.id !== d.id
            ? s
            : d.handle
              ? setHandle(s, d.handle, p)
              : move(s, p.x - d.from.x, p.y - d.from.y),
        ),
      );
      return;
    }
    if (!draft) return;
    setDraft((s) =>
      s.type === "pen" ? extend(s, p, box.w, box.h) : { ...s, b: p },
    );
  }

  function up() {
    const d = drag.current;
    drag.current = null;
    if (d) {
      if (d.moved) setPast((past) => [...past, d.before]);
      return;
    }
    if (!draft) return;
    const s =
      draft.type === "pen"
        ? draft
        : create(draft.type, draft.start, draft.b, {
            ink,
            w: box.w,
            h: box.h,
          });
    setDraft(null);
    if (s.type === "pen" && s.points.length < 2) return;
    commit([...shapes, s]);
    setSelected(s.id);
  }

  async function toggleBody() {
    setBodyError("");
    if (body) return setBody(false);
    setBody(true);
    if (pose) return;
    setFinding(true);
    try {
      setPose(poseRecord(await findBody(frame.image)));
    } catch (e) {
      setBody(false);
      setBodyError(e.message || "Couldn't look for the body. Try again.");
    } finally {
      setFinding(false);
    }
  }

  const addJoint = (joint) => {
    const s = angleMark(joint, ink);
    commit([...shapes, s]);
    setSelected(s.id);
  };

  async function done() {
    setBusy(true);
    try {
      await onDone(shapes, { pose, body: showBody, layers });
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  const sel = shapes.find((s) => s.id === selected);
  // Inks recolor the selected mark too.
  function pickInk(value) {
    setInk(value);
    if (sel && sel.ink !== value)
      commit(shapes.map((s) => (s.id === sel.id ? { ...s, ink: value } : s)));
  }

  return createPortal(
    <div
      className="rp-draw"
      role="dialog"
      aria-modal="true"
      aria-label={`Draw on the frame at ${stamp(frame.time)}`}
    >
      <header className="rp-draw-top">
        <IconButton label="Close without saving" icon={X} onClick={close} />
        <div className="rp-draw-title">
          <b>Draw on {stamp(frame.time)}</b>
          <small>{HINT[tool]}</small>
        </div>
        <Button size="sm" disabled={busy || finding} onClick={done}>
          Done
        </Button>
      </header>

      <div className="rp-draw-stage" ref={stage}>
        <div
          className="rp-draw-frame"
          style={{ width: box.w || undefined, height: box.h || undefined }}
        >
          <img
            src={frame.image}
            alt=""
            onLoad={(e) =>
              setSize({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
          />
          <canvas
            ref={canvas}
            role="img"
            aria-label={
              shapes.length
                ? `Marks: ${shapes.map((s) => describe(s, box.w, box.h)).join("; ")}`
                : "No marks yet"
            }
            onPointerDown={down}
            onPointerMove={moveTo}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {sel ? `Selected: ${describe(sel, box.w, box.h)}` : ""}
      </p>

      <footer className="rp-draw-bar">
        <div
          className="rp-draw-tools"
          role="radiogroup"
          aria-label="Tool"
          data-scroll-x
        >
          {TOOLBAR.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={tool === value}
              aria-label={label}
              title={label}
              onClick={() => setTool(value)}
            >
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="rp-draw-row">
          <div className="rp-draw-inks" role="radiogroup" aria-label="Color">
            {INKS.map((i) => (
              <button
                key={i.value}
                type="button"
                role="radio"
                aria-checked={ink === i.value}
                aria-label={i.label}
                title={i.label}
                style={{ "--ink": i.hex }}
                onClick={() => pickInk(i.value)}
              />
            ))}
          </div>
          <button
            type="button"
            className="rp-draw-body"
            aria-pressed={body}
            disabled={finding}
            onClick={toggleBody}
          >
            <PersonStanding size={20} aria-hidden="true" />
            {finding ? "Finding the body…" : "Body"}
          </button>
          {tool === "text" && (
            <div className="rp-draw-text">
              <Input
                aria-label="Label text"
                placeholder="Label, then tap the frame"
                maxLength={MAX_TEXT}
                value={text}
                onChange={setText}
              />
            </div>
          )}
          <div className="rp-draw-acts">
            <IconButton
              label="Undo"
              icon={Undo2}
              disabled={!past.length}
              onClick={undo}
            />
            <IconButton
              label="Delete the selected mark"
              icon={Trash2}
              disabled={!sel}
              onClick={removeSelected}
            />
            <IconButton
              label="Clear all marks"
              icon={Eraser}
              disabled={!shapes.length}
              onClick={() => {
                commit([]);
                setSelected(null);
              }}
            />
          </div>
        </div>
        {(bodyError || (body && !finding && pose)) && (
          <div className="rp-draw-joints" role="status">
            {bodyError ? (
              <p>{bodyError}</p>
            ) : !found(pose) ? (
              <p>
                No body found on this frame. Try one where the kid is in view
                from head to feet.
              </p>
            ) : (
              <>
                <p>
                  Tap a reading to add it as an angle. Measured on the picture,
                  so the camera's position changes it.
                </p>
                <ul aria-label="Joint angles" data-scroll-x>
                  {joints.map((j) => (
                    <li key={j.key}>
                      <button type="button" onClick={() => addJoint(j)}>
                        {j.label} <b>{j.degrees}°</b>
                      </button>
                    </li>
                  ))}
                  {!joints.length && <li>No joint is clear enough to read.</li>}
                </ul>
              </>
            )}
          </div>
        )}
      </footer>
    </div>,
    document.body,
  );
}
