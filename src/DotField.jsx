import React, { useEffect, useRef } from "react";
import "./dotfield.css";
import { alpha, color } from "./ds/tokens.js";

/*
 * Ambient backdrop: the brand's dot texture laid on a slowly rolling
 * surface, seen in perspective. A fixed world grid of dots is displaced
 * by three summed sine waves and projected onto a 2D canvas. Crests run
 * white, troughs mint; depth fades dots toward the horizon.
 *
 * Runs at ~30fps, pauses offscreen and in background tabs, and draws a
 * single still frame under prefers-reduced-motion.
 */
const CAM_Y = 1.1; // camera height above the plane
const NEAR = 1.2;
const FAR = 13;
const STEP = 0.2; // grid spacing, both axes
const AMP = 0.18; // peak wave height
const SPEED = 0.00035; // wave time per ms
const FRAME_MS = 33;
const COLORS = [color.mint, color.skyPale, color.white]; // mint → white
const ALPHAS = 10;

function height(x, z, t) {
  return (
    0.08 * Math.sin(x * 1.1 + t * 1.1) +
    0.06 * Math.sin(z * 1.5 - t * 1.4) +
    0.04 * Math.sin(x * 1.9 + z * 0.9 + t * 0.7)
  );
}

export default function DotField({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const buckets = COLORS.map(() => Array.from({ length: ALPHAS }, () => []));
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;

    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      if (!w || !h) return;
      const f = Math.max(h * 1.1, w * 0.36);
      const horizon = h * 0.24 + py * 10;
      const cx = w * 0.5 + px * 18;
      for (const set of buckets) for (const b of set) b.length = 0;

      for (let z = NEAR; z < FAR; z += STEP) {
        const p = f / z;
        const half = (w * 0.5 + 40) / p;
        const depth = 1 - (z - NEAR) / (FAR - NEAR);
        const r = Math.max(0.5, 0.013 * p);
        for (let x = Math.ceil(-half / STEP) * STEP; x <= half; x += STEP) {
          const y = height(x, z, t);
          const sy = horizon + (CAM_Y - y) * p;
          if (sy > h + 6) continue;
          const sx = cx + x * p;
          const crest = Math.min(1, Math.max(0, (y + AMP) / (2 * AMP)));
          const alpha = depth ** 1.6 * (0.4 + 0.6 * crest);
          const ci = Math.min(
            COLORS.length - 1,
            Math.floor(crest * COLORS.length),
          );
          const ai = Math.min(ALPHAS - 1, Math.floor(alpha * ALPHAS));
          if (ai > 0) buckets[ci][ai].push(sx, sy, r);
        }
      }

      for (let c = 0; c < COLORS.length; c++) {
        for (let a = 1; a < ALPHAS; a++) {
          const pts = buckets[c][a];
          if (!pts.length) continue;
          ctx.fillStyle = alpha(COLORS[c], (a + 0.5) / ALPHAS);
          ctx.beginPath();
          for (let i = 0; i < pts.length; i += 3) {
            const [x, y, r] = [pts[i], pts[i + 1], pts[i + 2]];
            if (r < 1.1) {
              ctx.rect(x - r, y - r, r * 2, r * 2);
            } else {
              ctx.moveTo(x + r, y);
              ctx.arc(x, y, r, 0, Math.PI * 2);
            }
          }
          ctx.fill();
        }
      }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      last = now;
      px += (tx - px) * 0.04;
      py += (ty - py) * 0.04;
      draw(now * SPEED);
    }

    function start() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (reduce.matches) {
        draw(12);
        return;
      }
      if (onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function onPointer(e) {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    }

    resize();
    draw(reduce.matches ? 12 : performance.now() * SPEED);
    canvas.classList.add("is-ready");
    start();

    const ro = new ResizeObserver(() => {
      resize();
      draw(reduce.matches ? 12 : last * SPEED);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      start();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", start);
    reduce.addEventListener("change", start);
    if (finePointer)
      window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", start);
      reduce.removeEventListener("change", start);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={`dot-field ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
