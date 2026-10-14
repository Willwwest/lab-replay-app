// The capture screen's camera: opened once and kept open between
// recordings, so a coach can record one kid after another. With `burn`,
// each camera frame is drawn onto a canvas with the timer overlay and the
// canvas is what's recorded, so the clock is in the video itself. `hud` is
// a ref to a function returning the overlay's current state.
import { useEffect, useRef, useState } from "react";
import { RECORD_TYPES } from "./hooks.js";
import { canBurn, drawHud } from "./hud.js";

export function useCamera(on, burn, hud) {
  const stream = useRef(null);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const preview = useRef(null);
  const raf = useRef(0);
  const burned = useRef(false);
  const [ready, setReady] = useState(!on);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!on) return;
    let live = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "The camera needs HTTPS. Open Replay from its https:// address.",
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
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
          "The camera didn't open. Allow camera access in the browser's settings, then try again.",
        ),
      );
    return () => {
      live = false;
      cancelAnimationFrame(raf.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  // Re-attach the stream if the preview element was remounted.
  useEffect(() => {
    if (preview.current && stream.current && !preview.current.srcObject)
      preview.current.srcObject = stream.current;
  });

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

  // Resolves with the recording (or null). `tail` keeps recording a moment
  // past the finish: the result card when burned in, and otherwise enough
  // for the encoder to flush the last frames. The camera stays open.
  function stop(tail = 0) {
    const r = recorder.current;
    if (!r || r.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      setTimeout(() => {
        r.onstop = () => {
          cancelAnimationFrame(raf.current);
          resolve(
            chunks.current.length
              ? new Blob(chunks.current, { type: r.mimeType })
              : null,
          );
        };
        r.stop();
      }, tail);
    });
  }

  return { preview, ready, error, start, stop, burned };
}

// A small still from a recording, for lists of takes.
export function thumbnail(blob, at = 0.6) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const done = (value) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(value);
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => {
      v.currentTime = Math.min(at, (v.duration || 1) / 2);
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 240;
        c.height = Math.round((240 * v.videoHeight) / v.videoWidth) || 135;
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        done(c.toDataURL("image/jpeg", 0.7));
      } catch {
        done(null);
      }
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    v.src = url;
  });
}
