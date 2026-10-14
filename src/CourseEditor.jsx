// The course as an ordered route on the gym layout. Points are normalized
// to the layout, so the map keeps its proportions at any size.
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Crosshair,
  Map as MapIcon,
  Plus,
  Save,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import {
  Button,
  Card,
  Empty,
  Field,
  IconButton,
  Input,
  Section,
  Select,
} from "./ds/index.jsx";
import { all, put } from "./storage.js";
import { color } from "./ds/tokens.js";
import { seconds } from "./format.js";
import { asset } from "./paths.js";

const W = 900;
const H = 1181;
const MAX_POINTS = 100;

export const emptyMap = (take) => ({
  name: take.course || "Course",
  points: [],
  background: "/gym-layout.png",
  layoutName: "LAB gym layout",
  version: 1,
});

const newPoint = (n, x = 0.5, y = 0.5) => ({
  id: crypto.randomUUID(),
  x,
  y,
  label: `Obstacle ${n}`,
  skill: "",
  time: null,
});

// The route drawn over the layout, as the PNG the service overlays on video.
export async function coursePNG(map) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color.white;
  ctx.fillRect(0, 0, W, H);
  if (map.background) {
    const img = new Image();
    img.src = asset(map.background);
    await img.decode();
    ctx.drawImage(img, 0, 0, W, H);
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 9;
  ctx.strokeStyle = color.cyanInk;
  ctx.beginPath();
  map.points.forEach((p, i) =>
    i ? ctx.lineTo(p.x * W, p.y * H) : ctx.moveTo(p.x * W, p.y * H),
  );
  ctx.stroke();
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  map.points.forEach((p, i) => {
    ctx.fillStyle = color.navy;
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color.white;
    ctx.fillText(i + 1, p.x * W, p.y * H);
  });
  return canvas.toDataURL("image/png");
}

// An imported layout, letterboxed onto the map's fixed proportions.
async function layoutImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color.white;
    ctx.fillRect(0, 0, W, H);
    const scale = Math.min(W / image.width, H / image.height);
    ctx.drawImage(
      image,
      (W - image.width * scale) / 2,
      (H - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CourseEditor({ take, now, onChange, onError, onSay }) {
  const [saved, setSaved] = useState([]);
  const file = useRef(null);
  const map = take.courseMap || emptyMap(take);
  const points = map.points;

  useEffect(() => {
    all("courses")
      .then(setSaved)
      .catch((e) => onError(e.message));
  }, []);

  const update = (next) => onChange({ courseMap: { ...map, ...next } });
  const setPoint = (i, fields) =>
    update({
      points: points.map((q, n) => (n === i ? { ...q, ...fields } : q)),
    });

  function addAt(e) {
    if (points.length >= MAX_POINTS) return;
    const svg = e.currentTarget;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
    update({
      points: [
        ...points,
        newPoint(
          points.length + 1,
          Math.max(0.025, Math.min(0.975, p.x / W)),
          Math.max(0.055, Math.min(0.97, p.y / H)),
        ),
      ],
    });
  }

  async function replaceLayout(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      update({ background: await layoutImage(f), layoutName: f.name });
    } catch (err) {
      onError(err.message);
    }
  }

  async function saveTemplate() {
    try {
      if (points.length < 2) throw Error("Add at least two route points.");
      const record = {
        ...map,
        id: crypto.randomUUID(),
        points: points.map((p) => ({ ...p, time: null })),
        savedAt: new Date().toISOString(),
      };
      await put("courses", record);
      setSaved((old) => [record, ...old]);
      onSay(`Saved “${map.name}” to your courses.`);
    } catch (e) {
      onError(e.message);
    }
  }

  function applyTemplate(id) {
    const c = saved.find((x) => x.id === id);
    if (!c) return;
    const { id: _, savedAt, ...template } = structuredClone(c);
    onChange({ courseMap: template, course: template.name });
  }

  return (
    <Section
      title="Course map"
      note="Tap the layout in course order, then name each obstacle and link it to the video."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon={Upload}
            onClick={() => file.current.click()}
          >
            Replace layout
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Save}
            onClick={saveTemplate}
          >
            Save course
          </Button>
          <input
            hidden
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={replaceLayout}
          />
        </>
      }
      toolbar={
        <div className="rp-course-pick">
          <Field label="Course name">
            <Input
              value={take.course}
              onChange={(course) => onChange({ course })}
              placeholder="Course name or layout"
            />
          </Field>
          {saved.length > 0 && (
            <Field label="Start from a saved course">
              <Select
                value=""
                onChange={applyTemplate}
                options={[
                  { value: "", label: "Choose a saved course" },
                  ...saved.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </Field>
          )}
        </div>
      }
    >
      <div className="rp-course">
        <Card pad="sm" className="rp-board">
          <svg
            className="rp-map"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${map.layoutName || "Course layout"} with ${points.length} route points. Tap to add a point.`}
            onClick={addAt}
          >
            <rect className="rp-map-ground" width={W} height={H} />
            {map.background && (
              <image href={asset(map.background)} width={W} height={H} />
            )}
            <polyline
              className="rp-map-route"
              points={points.map((p) => `${p.x * W},${p.y * H}`).join(" ")}
            />
            {points.map((p, i) => (
              <g key={p.id ?? i} className="rp-map-point">
                <circle cx={p.x * W} cy={p.y * H} r="20" />
                <text x={p.x * W} y={p.y * H + 7} textAnchor="middle">
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
          <div className="rp-actions">
            <Button
              variant="secondary"
              size="sm"
              icon={Undo2}
              disabled={!points.length}
              onClick={() => update({ points: points.slice(0, -1) })}
            >
              Undo point
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              disabled={points.length >= MAX_POINTS}
              onClick={() =>
                update({ points: [...points, newPoint(points.length + 1)] })
              }
            >
              Add point in the middle
            </Button>
          </div>
        </Card>
        {points.length === 0 ? (
          <Card className="rp-route-empty">
            <Empty icon={MapIcon} title="No route yet">
              Tap the first obstacle on the layout. Points connect in the order
              you tap them.
            </Empty>
          </Card>
        ) : (
          <ol className="rp-route" aria-label="Route points">
            {points.map((p, i) => (
              <li key={p.id ?? i}>
                <Card pad="md" className="rp-point">
                  <span className="rp-point-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <Field label={`Point ${i + 1} label`}>
                    <Input
                      value={p.label}
                      maxLength={100}
                      onChange={(label) => setPoint(i, { label })}
                    />
                  </Field>
                  <Field label={`Point ${i + 1} skill`}>
                    <Input
                      value={p.skill || ""}
                      maxLength={100}
                      placeholder="e.g. Swing transfer"
                      onChange={(skill) => setPoint(i, { skill })}
                    />
                  </Field>
                  <div className="rp-point-acts">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Crosshair}
                      onClick={() => setPoint(i, { time: now })}
                    >
                      {p.time == null ? "Link to playhead" : seconds(p.time)}
                    </Button>
                    <IconButton
                      label={`Move point ${i + 1} earlier`}
                      icon={ArrowUp}
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...points];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        update({ points: next });
                      }}
                    />
                    <IconButton
                      label={`Remove point ${i + 1}`}
                      icon={Trash2}
                      tone="danger"
                      onClick={() =>
                        update({ points: points.filter((_, n) => n !== i) })
                      }
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Section>
  );
}
