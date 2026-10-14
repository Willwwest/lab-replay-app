// Analysis requests: only clips a coach chose, each frozen as requested.
import React from "react";
import { Download, Film, Layers, Play, X } from "lucide-react";
import {
  Button,
  Card,
  Empty,
  Section,
  Stat,
  StatStrip,
  Tag,
} from "./ds/index.jsx";
import { day, download, stamp } from "./format.js";
import { destinationLabel } from "./workflow.js";

const STATUS = {
  queued: { tone: "warn", label: "Queued" },
  running: { tone: "live", label: "Running" },
  completed: { tone: "good", label: "Completed" },
  failed: { tone: "bad", label: "Failed" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

function manifest(job) {
  const body = {
    ...job,
    source: { takeId: job.takeId, uploadRequired: true },
    clip: { startSeconds: job.start, endSeconds: job.end },
    schema: "lab-replay-job/v1",
  };
  download(
    new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }),
    "analysis-request.json",
  );
}

export default function Requests({
  jobs,
  analysis,
  onRun,
  onCancel,
  onOpen,
  onError,
}) {
  const count = (...s) => jobs.filter((j) => s.includes(j.status)).length;
  const safely = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      onError(e.message);
    }
  };
  return (
    <Section
      title="Analysis requests"
      note="Browser requests run one at a time on this device and stop if you cancel. Reloading never restarts one."
    >
      <StatStrip cols={4}>
        <Stat tone="sky" label="Queued" value={count("queued")} />
        <Stat tone="lavender" label="Running" value={count("running")} />
        <Stat tone="mint" label="Completed" value={count("completed")} />
        <Stat
          tone="lime"
          label="Stopped"
          value={count("failed", "cancelled")}
        />
      </StatStrip>
      {!jobs.length ? (
        <Card>
          <Empty icon={Layers} title="No requests yet">
            Choose a clip under a take's video and request analysis.
          </Empty>
        </Card>
      ) : (
        <ul className="rp-jobs">
          {[...jobs].reverse().map((j) => {
            const s = STATUS[j.status];
            const local = j.destination === "browser";
            return (
              <li key={j.id}>
                <Card as="article" pad="md" className="rp-job">
                  <div className="rp-job-main">
                    <div className="rp-tags">
                      <Tag tone={s.tone}>{s.label}</Tag>
                      <Tag tone="outline">
                        {destinationLabel(j.destination)}
                      </Tag>
                    </div>
                    <h3 className="ds-h3">
                      {j.member}{" "}
                      <span className="rp-job-course">· {j.course}</span>
                    </h3>
                    <p className="ds-note">
                      Clip {stamp(j.start)}–{stamp(j.end)} · requested{" "}
                      {day(j.requestedAt)}
                    </p>
                    {j.status === "running" && (
                      <div className="rp-meter">
                        <progress
                          max="100"
                          value={analysis.progress}
                          aria-label="Analysis progress"
                        />
                        <span className="ds-note">
                          {analysis.progress}% · sampling the clip
                        </span>
                      </div>
                    )}
                    {j.error && <p className="rp-inline is-error">{j.error}</p>}
                    {!local && j.status === "queued" && (
                      <p className="ds-note">
                        Waiting for a worker connection. The request is stored
                        on this device only.
                      </p>
                    )}
                  </div>
                  <div className="rp-actions">
                    {j.status === "queued" && local && (
                      <Button
                        variant="dark"
                        icon={Play}
                        disabled={analysis.busy}
                        onClick={safely(() => onRun(j))}
                      >
                        Start analysis
                      </Button>
                    )}
                    {j.status === "queued" && !local && (
                      <Button
                        variant="secondary"
                        icon={Download}
                        onClick={() => manifest(j)}
                      >
                        Manifest
                      </Button>
                    )}
                    {["queued", "running"].includes(j.status) && (
                      <Button
                        variant="secondary"
                        icon={X}
                        onClick={safely(() => onCancel(j))}
                      >
                        Cancel request
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      icon={Film}
                      onClick={() => onOpen(j.takeId)}
                    >
                      Open take
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
