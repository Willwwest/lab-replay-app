// Renders the clip with the course map on the local service, then
// publishes it to the member's portfolio in the LAB app (or withdraws it).
import React, { useState } from "react";
import { Check, Circle, Send, Undo2, Wand2 } from "lucide-react";
import { Button, Card, CardHead, Tag } from "./ds/index.jsx";
import { api } from "./service.js";
import { coursePNG } from "./CourseEditor.jsx";
import { seconds } from "./format.js";
import { analysisFor, steps } from "./workflow.js";

const STATUS = {
  rendering: { tone: "info", label: "Rendering" },
  ready: { tone: "warn", label: "Ready to publish" },
  published: { tone: "good", label: "Published" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
  failed: { tone: "bad", label: "Render failed" },
};

export default function PortfolioDelivery({
  take,
  jobs,
  portfolio,
  connected,
  onCommit,
  onSay,
}) {
  const { review, setReview, error, setError, url } = portfolio;
  const [busy, setBusy] = useState(false);
  const checks = steps(take, jobs, review).filter(
    (s) => s.id !== "portfolio" && !(s.optional && !s.done),
  );
  const blocked = checks.some((s) => !s.done);
  const status = review ? STATUS[review.status] : null;

  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const saved = await onCommit();
      const job = analysisFor(jobs, saved.start, saved.end);
      const image = await coursePNG(saved.courseMap);
      const asset = await api("/assets", { method: "POST", body: saved.blob });
      const output = await api("/reviews", {
        method: "POST",
        body: JSON.stringify({
          submissionId: crypto.randomUUID(),
          assetId: asset.id,
          memberId: saved.memberId,
          takeId: saved.id,
          start: saved.start,
          end: saved.end,
          course: saved.courseMap,
          courseImage: image,
          attempt: saved.attempt || null,
          timer: !saved.burned,
          grade: saved.grade,
          notes: saved.notes,
          cue: saved.cue,
          frames: saved.frames.filter(
            (f) => f.time >= saved.start && f.time <= saved.end,
          ),
          analysis: {
            id: job.id,
            status: job.status,
            start: job.start,
            end: job.end,
            summary: job.result.summary,
          },
        }),
      });
      setReview(output);
      await onCommit({ portfolioId: output.id });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(name) {
    setBusy(true);
    setError("");
    try {
      setReview(
        await api(`/reviews/${review.id}/${name}`, {
          method: "POST",
          body: "{}",
        }),
      );
      onSay(
        name === "publish"
          ? `Published to ${take.member || "the member"}'s portfolio.`
          : "Withdrawn. The member can no longer open it.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="section"
      className="rp-portfolio"
      aria-labelledby="rp-portfolio-title"
    >
      <header className="ds-card-head">
        <div>
          <h3 className="ds-h3" id="rp-portfolio-title">
            Portfolio clip
          </h3>
          <p className="ds-note">
            An MP4 of the clip with the course map in the corner, rendered on
            the local service. Silent.
          </p>
        </div>
        <Tag tone={status?.tone ?? "outline"}>
          {status?.label ?? "Not prepared"}
        </Tag>
      </header>

      <ul className="rp-checks" aria-label="Before preparing">
        {checks.map((s) => (
          <li key={s.id} className={s.done ? "is-done" : ""}>
            {s.done ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Circle size={18} aria-hidden="true" />
            )}
            <span>{s.label}</span>
            <span className="sr-only">{s.done ? "done" : "to do"}</span>
          </li>
        ))}
        {!connected && (
          <li>
            <Circle size={18} aria-hidden="true" />
            <span>Connect the roster (top right)</span>
          </li>
        )}
      </ul>

      {(error || review?.error) && (
        <p className="rp-inline is-error" role="alert">
          {error || review.error}
        </p>
      )}

      {url && (
        <video
          className="rp-portfolio-video"
          controls
          playsInline
          src={url}
          aria-label="Prepared portfolio clip"
        />
      )}
      {review && (
        <CardHead
          title={review.course.name}
          note={`Frozen at ${seconds(review.start)}–${seconds(review.end)} of the take. Later edits need a new clip.`}
        />
      )}

      <div className="rp-actions">
        <Button
          variant={review ? "secondary" : "dark"}
          icon={Wand2}
          disabled={
            busy || blocked || !connected || review?.status === "rendering"
          }
          onClick={prepare}
        >
          {busy && !review
            ? "Uploading…"
            : review
              ? "Prepare a new clip"
              : "Prepare portfolio clip"}
        </Button>
        {review?.status === "rendering" && (
          <span className="rp-inline" role="status">
            Clipping the video and adding the course map…
          </span>
        )}
        {review?.status === "ready" && (
          <Button
            variant="dark"
            icon={Send}
            disabled={busy || !url}
            onClick={() => act("publish")}
          >
            Publish to member portfolio
          </Button>
        )}
        {review?.status === "published" && (
          <Button
            variant="secondary"
            icon={Undo2}
            disabled={busy}
            onClick={() => act("withdraw")}
          >
            Withdraw from portfolio
          </Button>
        )}
      </div>
    </Card>
  );
}
