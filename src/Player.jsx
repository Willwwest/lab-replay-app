// The take's video with frame-level transport, and the clip to analyze.
import React from "react";
import { ArrowRight, Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Field,
  Input,
  Segmented,
  Switch,
  Tag,
} from "./ds/index.jsx";
import { seconds, stamp } from "./format.js";
import { DESTINATIONS } from "./workflow.js";

const SPEEDS = [
  { value: 0.25, label: "¼×" },
  { value: 0.5, label: "½×" },
  { value: 1, label: "1×" },
  { value: 1.5, label: "1.5×" },
];

export function Player({
  url,
  take,
  videoRef,
  now,
  onTime,
  speed,
  onSpeed,
  loop,
  onSeek,
  onSaveFrame,
  onError,
}) {
  return (
    <Card
      as="section"
      tone="ink"
      pad="md"
      className="rp-player"
      aria-label="Video"
    >
      <div className="rp-video">
        <video
          key={url}
          ref={videoRef}
          src={url || undefined}
          controls
          playsInline
          onLoadedMetadata={(e) => (e.currentTarget.playbackRate = speed)}
          onError={() =>
            onError("This browser can't play this video. Try an MP4 export.")
          }
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            onTime(v.currentTime);
            if (loop && v.currentTime >= take.end) {
              v.currentTime = take.start;
              v.play().catch(() => {});
            }
          }}
        />
      </div>
      <div className="rp-transport">
        <span className="rp-time" aria-live="off">
          {stamp(now)} <small>/ {stamp(take.duration)}</small>
        </span>
        <Segmented
          label="Playback speed"
          size="md"
          options={SPEEDS}
          value={speed}
          onChange={onSpeed}
        />
        <div className="rp-actions">
          <Button
            variant="light"
            size="sm"
            icon={ChevronLeft}
            title="Back a tenth of a second"
            onClick={() => onSeek(Math.max(0, now - 0.1))}
          >
            −0.1s
          </Button>
          <Button
            variant="light"
            size="sm"
            icon={ChevronRight}
            title="Forward a tenth of a second"
            onClick={() => onSeek(now + 0.1)}
          >
            +0.1s
          </Button>
          <Button size="sm" icon={Bookmark} onClick={onSaveFrame}>
            Save frame
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ClipCard({
  take,
  now,
  onChange,
  loop,
  onLoop,
  destination,
  onDestination,
  onRequest,
  analysis,
}) {
  const length = Math.max(0, take.end - take.start);
  const pct = (t) => `${(t / take.duration) * 100}%`;
  return (
    <Card as="section" className="rp-clip" aria-labelledby="rp-clip-title">
      <header className="ds-card-head">
        <div>
          <h3 className="ds-h3" id="rp-clip-title">
            Clip
          </h3>
          <p className="ds-note">
            Only this interval is analyzed, rendered and published.
          </p>
        </div>
        <Tag tone="info">{seconds(length)} selected</Tag>
      </header>
      <div className="rp-range" aria-hidden="true">
        <span
          className="rp-range-fill"
          style={{ left: pct(take.start), width: pct(length) }}
        />
        <span className="rp-range-head" style={{ left: pct(now) }} />
      </div>
      <div className="rp-clip-bounds">
        {[
          ["start", "Clip start"],
          ["end", "Clip end"],
        ].map(([field, label]) => (
          <div className="rp-bound" key={field}>
            <Field label={`${label} (seconds)`}>
              <Input
                type="number"
                min="0"
                max={take.duration}
                step=".1"
                value={take[field]}
                onChange={(v) => onChange({ [field]: Number(v) })}
              />
            </Field>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ [field]: Number(now.toFixed(2)) })}
            >
              Use playhead
            </Button>
          </div>
        ))}
      </div>
      <Switch
        checked={loop}
        onChange={onLoop}
        label="Loop the clip"
        note="Playback jumps back to the start at the end of the clip."
      />
      <div className="rp-request">
        <div className="ds-field">
          <span className="ds-field-label" id="rp-dest">
            Process with
          </span>
          <Segmented
            label="Process with"
            options={DESTINATIONS}
            value={destination}
            onChange={onDestination}
          />
        </div>
        <Button
          variant="dark"
          icon={ArrowRight}
          disabled={!!analysis}
          onClick={onRequest}
        >
          {analysis ? "Clip analyzed" : "Request analysis"}
        </Button>
      </div>
      {destination !== "browser" && (
        <p className="ds-note">
          Onsite and remote workers aren't connected yet. The request saves a
          manifest you can download from Requests; no video is uploaded.
        </p>
      )}
    </Card>
  );
}
