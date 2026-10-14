// Stills the coach chose, with a note each and any marks drawn on them,
// and the frames analysis sampled.
import React from "react";
import { Bookmark, Pencil, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Field,
  IconButton,
  Section,
  TextArea,
} from "./ds/index.jsx";
import { stamp } from "./format.js";
import { still } from "./stills.js";

export default function KeyFrames({ take, sampled, onChange, onSeek, onDraw }) {
  const setFrames = (frames) => onChange({ frames });
  const kept = take.frames;
  // A sampled frame the coach kept shows once, as their pick.
  const fresh = sampled.filter((s) => !kept.some((k) => k.time === s.time));
  return (
    <Section
      title="Key frames"
      note="Pause on a useful moment and save the frame. Draw on it to point things out. Notes and drawings go to the member with the review."
    >
      {!kept.length && !fresh.length ? (
        <p className="rp-inline">
          None yet. Pause on a moment and tap Save frame or Draw under the
          video.
        </p>
      ) : (
        <div className="rp-frames">
          {kept.map((f) => (
            <Card as="article" pad="sm" key={f.id} className="rp-frame">
              <button
                className="rp-frame-image"
                onClick={() => onSeek(f.time)}
                aria-label={`Play from ${stamp(f.time)}`}
              >
                <img src={still(f)} alt="" />
                <span>{stamp(f.time)}</span>
              </button>
              <Field label={`Note at ${stamp(f.time)}`} hideLabel>
                <TextArea
                  rows={2}
                  value={f.note}
                  placeholder="What should the member notice?"
                  onChange={(note) =>
                    setFrames(
                      kept.map((x) => (x.id === f.id ? { ...x, note } : x)),
                    )
                  }
                />
              </Field>
              <div className="rp-frame-foot">
                <span className="eyebrow">
                  {f.marked ? "Drawn on" : "Coach pick"}
                </span>
                <div className="rp-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Pencil}
                    aria-label={`Draw on the frame at ${stamp(f.time)}`}
                    onClick={() => onDraw(f.id)}
                  >
                    Draw
                  </Button>
                  <IconButton
                    label={`Remove frame at ${stamp(f.time)}`}
                    icon={Trash2}
                    tone="danger"
                    onClick={() => setFrames(kept.filter((x) => x.id !== f.id))}
                  />
                </div>
              </div>
            </Card>
          ))}
          {fresh.map((f) => (
            <Card
              as="article"
              pad="sm"
              tone="muted"
              key={f.id}
              className="rp-frame"
            >
              <button
                className="rp-frame-image"
                onClick={() => onSeek(f.time)}
                aria-label={`Play from ${stamp(f.time)}`}
              >
                <img src={f.image} alt="" />
                <span>{stamp(f.time)}</span>
              </button>
              <p className="ds-note">Sampled by analysis.</p>
              <Button
                variant="secondary"
                size="sm"
                icon={Bookmark}
                onClick={() =>
                  setFrames([
                    ...kept,
                    { ...f, id: crypto.randomUUID(), note: "" },
                  ])
                }
              >
                Keep for review
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
