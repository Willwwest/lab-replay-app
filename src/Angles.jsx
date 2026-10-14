// The other cameras' takes of this recording, on the Watch tab: each one
// plays beside this take, lined up at the same instant.
import React from "react";
import { Columns2, Video } from "lucide-react";
import { Button, Card, CardHead } from "./ds/index.jsx";
import { together } from "./compare.js";
import { awaitingAngles } from "./angles.js";
import { stamp } from "./format.js";

export default function Angles({ take, takes, onCompare }) {
  if (!take.sync) return null;
  const others = takes.filter((t) => together(take, t));
  const waiting = awaitingAngles([take]).length > 0;
  return (
    <Card
      as="section"
      pad="md"
      className="rp-angles"
      aria-label="Camera angles"
    >
      <CardHead
        title="Camera angles"
        note={
          others.length
            ? "Filmed at the same time from another phone. Side by side lines them up to the same instant."
            : waiting
              ? "Waiting for the other cameras' clips. They come in on their own."
              : "No other camera sent a clip of this recording."
        }
      />
      {others.length > 0 && (
        <ul className="rp-angles-takes">
          {others.map((o) => (
            <li key={o.id}>
              <Video size={18} aria-hidden="true" />
              <span>
                <b>{o.angle || (o.angleOf ? "Other camera" : "Host camera")}</b>
                <small>{stamp(o.duration)}</small>
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={Columns2}
                aria-label={`Side by side with ${o.angle || "the other camera"}`}
                onClick={() => onCompare(o.id)}
              >
                Side by side
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
