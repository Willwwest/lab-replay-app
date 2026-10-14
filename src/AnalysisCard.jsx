// The gate before analysis. A recording starts raw; a coach trims it to the
// run and confirms it's worth coaching from ("checked"). Only then can it be
// sent, through a confirmation that names the clip length and how many
// clips this device has sent this week: analysis takes processing time.
import React, { useEffect, useState } from "react";
import { Check, Cpu, ScanEye, X } from "lucide-react";
import { Button, Card, CardHead, Segmented, Tag } from "./ds/index.jsx";
import Sheet from "./Sheet.jsx";
import { firstName, seconds } from "./format.js";
import { DESTINATIONS, analysisFor, isChecked } from "./workflow.js";

const CHECKS = [
  {
    id: "trim",
    label: "The clip is trimmed to the run",
    hint: "Start and end set above, no waiting around.",
  },
  { id: "frame", label: "{kid} is in frame from start to finish" },
  { id: "steady", label: "Steady and close enough to judge their form" },
];

export default function AnalysisCard({
  take,
  jobs,
  weekCount,
  progress,
  onCheck,
  onUncheck,
  onSend,
  onCancel,
  onResults,
}) {
  const clip = (j) => j.start === take.start && j.end === take.end;
  const done = analysisFor(jobs, take.start, take.end);
  const pending = jobs.find(
    (j) => clip(j) && ["queued", "running"].includes(j.status),
  );
  const last = [...jobs].reverse().find(clip);
  const checked = isChecked(take);
  const [ticks, setTicks] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [where, setWhere] = useState("browser");
  const length = Math.max(0, take.end - take.start);
  const kid = firstName(take.member) || "The athlete";

  useEffect(() => setTicks({}), [take.id, take.start, take.end]);
  const ready = CHECKS.every((c) => ticks[c.id]);

  if (done)
    return (
      <Card as="section" aria-label="Analysis" className="rp-ai is-done">
        <CardHead
          title="Analyzed"
          note={`${done.result.summary.coverage}% of sampled frames tracked over ${seconds(done.result.summary.duration)}. Tracking shows how visible ${kid} was, not how well they moved.`}
          aside={
            <Tag tone="good" icon={Check}>
              Done
            </Tag>
          }
        />
        <Button variant="secondary" icon={ScanEye} onClick={onResults}>
          See it with the coaching
        </Button>
      </Card>
    );

  if (pending)
    return (
      <Card as="section" aria-label="Analysis" className="rp-ai">
        <CardHead
          title={
            pending.status === "running" ? "Analyzing" : "Waiting its turn"
          }
          note={
            pending.destination !== "browser"
              ? "Saved for an onsite or remote worker. Nothing is uploaded yet."
              : pending.status === "running"
                ? `Working through the ${seconds(length)} clip on this device.`
                : "It starts when this device finishes the clip before it."
          }
          aside={
            <Tag tone="info">
              {pending.status === "running" ? `${progress}%` : "Queued"}
            </Tag>
          }
        />
        {pending.status === "running" && (
          <progress
            className="rp-ai-bar"
            max="100"
            value={progress}
            aria-label="Analysis progress"
          />
        )}
        <Button variant="secondary" icon={X} onClick={() => onCancel(pending)}>
          Cancel
        </Button>
      </Card>
    );

  if (!checked)
    return (
      <Card as="section" aria-label="Analysis" className="rp-ai is-raw">
        <CardHead
          title="Raw recording"
          note={
            take.memberId
              ? "This is the take as filmed. Before it goes for analysis, check it's one you'll coach from."
              : "Assign a kid first, then check the recording."
          }
          aside={<Tag tone="outline">Not checked</Tag>}
        />
        {take.memberId && (
          <>
            <ul className="rp-ai-checks">
              {CHECKS.map((c) => (
                <li key={c.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!ticks[c.id]}
                      onChange={(e) =>
                        setTicks({ ...ticks, [c.id]: e.target.checked })
                      }
                    />
                    <span>
                      <b>{c.label.replace("{kid}", kid)}</b>
                      {c.hint && <small>{c.hint}</small>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Button
              variant="dark"
              icon={Check}
              disabled={!ready}
              onClick={onCheck}
            >
              Mark as checked
            </Button>
          </>
        )}
        {last && ["failed", "cancelled"].includes(last.status) && (
          <p className="ds-note">
            The last analysis of this clip{" "}
            {last.status === "failed"
              ? `failed: ${last.error}`
              : "was cancelled"}
            .
          </p>
        )}
      </Card>
    );

  return (
    <Card as="section" aria-label="Analysis" className="rp-ai is-checked">
      <CardHead
        title="Ready for analysis"
        note={`Checked by ${take.checked.by}. The ${seconds(length)} clip is what gets analyzed.`}
        aside={
          <Tag tone="info" icon={Check}>
            Checked
          </Tag>
        }
      />
      <div className="rp-actions">
        <Button icon={Cpu} onClick={() => setConfirm(true)}>
          Send for analysis…
        </Button>
        <Button variant="secondary" onClick={onUncheck}>
          Not ready after all
        </Button>
      </div>
      {last && ["failed", "cancelled"].includes(last.status) && (
        <p className="ds-note">
          The last try{" "}
          {last.status === "failed" ? `failed: ${last.error}` : "was cancelled"}
          .
        </p>
      )}
      {confirm && (
        <Sheet
          title="Send for analysis?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button
                icon={Cpu}
                onClick={() => {
                  setConfirm(false);
                  onSend(where);
                }}
              >
                Send the {seconds(length)} clip
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Not now
              </Button>
            </>
          }
        >
          <div className="rp-ai-confirm">
            <b>{seconds(length)}</b>
            <span>
              {take.member} ·{" "}
              {take.courseMap?.name || take.course || "recording"}
            </span>
          </div>
          <p>
            Analysis works through every frame of the clip, so it takes
            processing time. Send the runs you'll actually coach from.
          </p>
          <p className="ds-note">
            Sent from this device in the last 7 days: <b>{weekCount}</b>
          </p>
          <details className="rp-ai-where">
            <summary>Where it runs</summary>
            <Segmented
              label="Process with"
              options={DESTINATIONS}
              value={where}
              onChange={setWhere}
            />
            <p className="ds-note">
              Onsite and remote workers aren't connected yet: those save a
              request you can download; nothing is uploaded.
            </p>
          </details>
        </Sheet>
      )}
    </Card>
  );
}
