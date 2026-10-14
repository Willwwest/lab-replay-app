// One take, in four tabs: Watch (the video, the clip, the analysis gate,
// key frames, comparing), Course (the route and the scored attempt), Coach
// (assessment and cue, with what analysis found) and Share (portfolio,
// family, files). A short header says whose take it is and how far along.
import React, { useState } from "react";
import {
  Check,
  Columns2,
  Download,
  MessageSquare,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Empty,
  Section,
  Segmented,
} from "./ds/index.jsx";
import { PageHead } from "./Shell.jsx";
import { ClipCard, Player } from "./Player.jsx";
import { CoachReview } from "./CoachReview.jsx";
import KeyFrames from "./KeyFrames.jsx";
import Compare from "./Compare.jsx";
import CourseEditor from "./CourseEditor.jsx";
import AttemptReview from "./AttemptReview.jsx";
import PortfolioDelivery from "./PortfolioDelivery.jsx";
import AnalysisCard from "./AnalysisCard.jsx";
import FrameEditor from "./FrameEditor.jsx";
import { flatten } from "./stills.js";
import { detectStill } from "./analysis.js";
import VoiceOvers from "./VoiceOvers.jsx";
import VoiceRecorder from "./VoiceRecorder.jsx";
import { useVoiceovers } from "./hooks.js";
import { suggestTags } from "./search.js";
import ModelCard from "./ModelCard.jsx";
import Angles from "./Angles.jsx";
import { day, stamp } from "./format.js";
import { analysisFor, steps } from "./workflow.js";

export const TABS = [
  { value: "watch", label: "Watch" },
  { value: "course", label: "Course" },
  { value: "coach", label: "Coach" },
  { value: "share", label: "Share" },
];
const STAGES = [
  ["member", "Kid"],
  ["checked", "Checked"],
  ["analysis", "Analyzed"],
  ["coaching", "Coached"],
  ["portfolio", "Shared"],
];

export default function TakeScreen({ t, take, tab, onTab, ops }) {
  const [comparing, setComparing] = useState(false);
  const [drawing, setDrawing] = useState(null); // a key frame's id
  const drawn = t.frames.find((f) => f.id === drawing);
  const voices = useVoiceovers(t.id);
  const [talking, setTalking] = useState(false);

  // The marks (and the body, if shown), and a copy of the still with them
  // drawn in. A body found once stays with the frame, shown or not.
  async function keepDrawing(shapes, { pose, body, layers }) {
    const any = shapes.length > 0 || body;
    const marked = any ? await flatten(drawn.image, shapes, layers) : null;
    ops.edit({
      frames: t.frames.map((f) =>
        f.id === drawn.id
          ? {
              ...f,
              drawing: any ? { shapes, body } : null,
              marked,
              pose: pose ?? f.pose ?? null,
            }
          : f,
      ),
    });
  }
  const done = analysisFor(ops.jobs, t.start, t.end);
  const progress = steps(t, ops.jobs, ops.portfolio.review);
  const isDone = (id) => progress.find((s) => s.id === id)?.done;
  const player = (
    <Player
      url={ops.url}
      take={t}
      videoRef={ops.video}
      now={ops.now}
      onTime={ops.setNow}
      speed={ops.speed}
      onSpeed={ops.setSpeed}
      loop={ops.loop}
      onSeek={ops.seek}
      onSaveFrame={ops.saveFrame}
      onDraw={async () => {
        const f = await ops.saveFrame();
        if (f) setDrawing(f.id);
      }}
      onError={ops.fail}
    />
  );

  return (
    <>
      <PageHead
        back="Takes"
        onBack={ops.back}
        eyebrow={`${day(t.createdAt)} · ${stamp(t.duration)}`}
        title={t.member || t.model?.title || "No kid yet"}
        sub={t.courseMap?.name || t.course || "Recording"}
        actions={
          <Button
            variant={t.memberId ? "light" : "primary"}
            size="sm"
            icon={UserRound}
            onClick={ops.assign}
          >
            {t.memberId ? "Change kid" : "Assign a kid"}
          </Button>
        }
      >
        <ol className="rp-stages" aria-label="Progress">
          {STAGES.map(([id, label]) => (
            <li key={id} className={isDone(id) ? "is-done" : undefined}>
              {isDone(id) && <Check size={14} aria-hidden="true" />}
              {label}
              <span className="sr-only">{isDone(id) ? " done" : " to do"}</span>
            </li>
          ))}
        </ol>
      </PageHead>

      <main className="rp-page rp-take">
        <div className="rp-tabs">
          <Segmented
            label="Take sections"
            size="lg"
            options={TABS}
            value={tab}
            onChange={onTab}
          />
        </div>

        {tab === "watch" && (
          <>
            {player}
            <ClipCard
              take={t}
              now={ops.now}
              onChange={ops.edit}
              loop={ops.loop}
              onLoop={ops.setLoop}
            />
            <AnalysisCard
              take={t}
              jobs={ops.jobs}
              weekCount={ops.weekCount}
              progress={ops.analysis.progress}
              onCheck={ops.check}
              onUncheck={ops.uncheck}
              onSend={ops.send}
              onCancel={ops.cancel}
              onResults={() => onTab("coach")}
            />
            <KeyFrames
              take={t}
              sampled={done?.result.frames ?? []}
              onChange={ops.edit}
              onSeek={ops.seek}
              onDraw={setDrawing}
            />
            <Angles
              take={t}
              takes={ops.takes}
              onCompare={(id) => {
                ops.setCompareWith({ id, n: Date.now() });
                setComparing(true);
              }}
            />
            <VoiceOvers
              voices={voices}
              onRecord={() => {
                ops.video.current?.pause();
                setTalking(true);
              }}
            />
            {comparing ? (
              <Compare
                key={t.id}
                take={t}
                takes={ops.takes}
                request={ops.compareWith}
                onAddFrame={(frame) =>
                  ops.edit({ frames: [...t.frames, frame] })
                }
                onError={ops.fail}
              />
            ) : (
              <Card pad="md" className="rp-compare-cta">
                <CardHead
                  title="Compare with another run"
                  note="Play this take beside an earlier one or a model clip, lined up at the same obstacle."
                  aside={
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Columns2}
                      onClick={() => setComparing(true)}
                    >
                      Side by side
                    </Button>
                  }
                />
              </Card>
            )}
          </>
        )}

        {tab === "course" && (
          <>
            {player}
            <CourseEditor
              key={t.id}
              take={t}
              now={ops.now}
              onChange={ops.edit}
              onError={ops.fail}
              onSay={ops.say}
            />
            <AttemptReview
              take={t}
              now={ops.now}
              onSave={ops.saveAttempt}
              onSeek={ops.seek}
              canCompare={(id) =>
                !!id && id !== t.id && ops.takes.some((x) => x.id === id)
              }
              onCompare={(id) => {
                ops.setCompareWith({ id, n: Date.now() });
                setComparing(true);
                onTab("watch");
              }}
            />
          </>
        )}

        {tab === "coach" && (
          <CoachReview
            take={t}
            analysis={done}
            suggestions={suggestTags(t, ops.takes)}
            onChange={ops.edit}
            onExport={ops.exportReview}
          />
        )}

        {tab === "share" && (
          <>
            <Section
              title="Member portfolio"
              note="The clip with the course map, the coaching and key frames, in the family's LAB app."
            >
              <PortfolioDelivery
                key={t.id}
                take={t}
                jobs={ops.jobs}
                portfolio={ops.portfolio}
                voices={voices.list}
                connected={ops.shared}
                onCommit={ops.commit}
                onSay={ops.say}
              />
            </Section>
            <ModelCard take={t} coach={ops.coach} onChange={ops.edit} />
            <Card as="section" pad="md" aria-label="Family">
              <CardHead
                title="Message the family"
                note={
                  ops.shared
                    ? "Send a note, with this take's run attached if it has one."
                    : "Messages need the team service, which isn't connected."
                }
                aside={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={MessageSquare}
                    disabled={!ops.shared || !t.memberId}
                    onClick={ops.message}
                  >
                    Write
                  </Button>
                }
              />
            </Card>
            <Card as="section" pad="md" aria-label="Files">
              <CardHead
                title="Files"
                note="The original recording and a printable review, to keep or send yourself."
              />
              <div className="rp-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={ops.downloadOriginal}
                >
                  Original video
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={ops.exportReview}
                >
                  Review page
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Trash2}
                  onClick={ops.remove}
                >
                  Delete take
                </Button>
              </div>
            </Card>
          </>
        )}
        {drawn && (
          <FrameEditor
            key={drawn.id}
            frame={drawn}
            onDone={keepDrawing}
            findBody={detectStill}
            onClose={() => setDrawing(null)}
          />
        )}
        {talking && (
          <VoiceRecorder
            take={t}
            url={ops.url}
            caption={[t.member, t.courseMap?.name || t.course]
              .filter(Boolean)
              .join(" · ")}
            coach={ops.coach}
            onSave={async (v) => {
              await voices.add(v);
              ops.say("Voice-over saved with the take.");
            }}
            onClose={() => setTalking(false)}
          />
        )}
        {!take && (
          <Card>
            <Empty title="This take isn't on this device" />
          </Card>
        )}
      </main>
    </>
  );
}
