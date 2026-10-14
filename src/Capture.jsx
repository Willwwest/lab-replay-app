// The live camera while recording a take. Audio is always off.
import React from "react";
import { Camera, RotateCcw, Square, X } from "lucide-react";
import { Button, Card, CardHead, Tag } from "./ds/index.jsx";

export default function Capture({ capture, onError }) {
  const run = (fn) => () => {
    try {
      fn();
    } catch (e) {
      onError(e.message);
    }
  };
  return (
    <Card as="section" tone="ink" className="rp-capture" aria-label="Camera">
      <CardHead
        title={capture.recording ? "Recording this take" : "Camera ready"}
        note="Audio off. Keep the take you want; discard the rest."
        aside={
          capture.recording ? (
            <Tag tone="live">Recording</Tag>
          ) : (
            <Tag tone="outline">Not recording</Tag>
          )
        }
      />
      <video
        className="rp-capture-video"
        ref={capture.preview}
        autoPlay
        muted
        playsInline
      />
      <div className="rp-actions">
        {capture.recording ? (
          <>
            <Button icon={Square} onClick={run(capture.keep)}>
              Keep take
            </Button>
            <Button
              variant="light"
              icon={RotateCcw}
              onClick={run(capture.restart)}
            >
              Discard and restart
            </Button>
            <Button variant="light" icon={X} onClick={run(capture.throwAway)}>
              Discard and close
            </Button>
          </>
        ) : (
          <>
            <Button icon={Camera} onClick={run(capture.start)}>
              Start recording
            </Button>
            <Button variant="light" onClick={capture.close}>
              Close camera
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
