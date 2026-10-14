// LAB Replay: record a course run, pick the clip, coach it, and publish it
// to the member's portfolio in the LAB app.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Download,
  Layers,
  MessageSquare,
  Play,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Button,
  IconButton,
  SaveBar,
  Section,
  Stat,
  StatStrip,
} from "./ds/index.jsx";
import { AppBar, Hero, Masthead, NextStep, Toast } from "./Shell.jsx";
import TakeLibrary from "./TakeLibrary.jsx";
import Capture from "./Capture.jsx";
import { ClipCard, Player } from "./Player.jsx";
import { CoachReview, TakeDetails } from "./CoachReview.jsx";
import KeyFrames from "./KeyFrames.jsx";
import CourseEditor from "./CourseEditor.jsx";
import AttemptReview from "./AttemptReview.jsx";
import PortfolioDelivery from "./PortfolioDelivery.jsx";
import Requests from "./Requests.jsx";
import RunView from "./RunView.jsx";
import Compare from "./Compare.jsx";
import { Spectate } from "./Team.jsx";
import Messages, { useThreads } from "./Messages.jsx";
import {
  useAnalysis,
  useCapture,
  useDraft,
  useLibrary,
  usePortfolio,
  useRoster,
  useScrolled,
  useToast,
  videoDuration,
} from "./hooks.js";
import { put } from "./storage.js";
import { pushRun, syncPending } from "./sync.js";
import { buildAttempt } from "./attempts.js";
import {
  day,
  download,
  firstName,
  reviewHtml,
  stamp,
  videoExtension,
} from "./format.js";
import { analysisFor, nextStep } from "./workflow.js";
import "./replay.css";

// Where each workflow step lives on the page.
const ANCHOR = {
  member: "take",
  course: "course",
  analysis: "clip",
  coaching: "coaching",
  attempt: "attempt",
  portfolio: "portfolio",
};

function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "start" });
  el.querySelector("input, select, textarea, button")?.focus({
    preventScroll: true,
  });
}

export default function App() {
  const { toast, say, fail, clear } = useToast();
  const scrolled = useScrolled();
  const library = useLibrary(fail);
  const roster = useRoster(fail);
  const [view, setView] = useState("review");
  const [selectedId, setSelectedId] = useState(null);
  const [memberFilter, setMemberFilter] = useState("");
  const [destination, setDestination] = useState("browser");
  const [now, setNow] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [url, setUrl] = useState("");
  const [runBest, setRunBest] = useState(null);
  const [compareWith, setCompareWith] = useState(null);
  const inbox = useThreads(!!roster.account);
  const [thread, setThread] = useState(null); // { memberId, runId }
  const openThread = (memberId, runId) => {
    setThread(memberId ? { memberId, runId } : null);
    setTimeout(inbox.refresh, 600);
  };
  // ?team=CODE opens the spectator screen for a team run.
  const [watch, setWatch] = useState(
    () => new URLSearchParams(location.search).get("team") ?? "",
  );
  const go = (v) => {
    if (watch) {
      setWatch("");
      history.replaceState(null, "", location.pathname);
    }
    setView(v);
  };
  const video = useRef(null);
  const file = useRef(null);

  const take = library.takes.find((t) => t.id === selectedId) ?? null;
  const draft = useDraft(take, library.saveTake);
  const t = draft.view;
  const takeJobs = useMemo(
    () => library.jobs.filter((j) => j.takeId === selectedId),
    [library.jobs, selectedId],
  );
  const portfolio = usePortfolio(take);
  const analysis = useAnalysis(library, () =>
    say("Analysis ready. Check the sampled frames and add your coaching."),
  );
  const done = t ? analysisFor(takeJobs, t.start, t.end) : null;
  const step = t ? nextStep(t, takeJobs, portfolio.review) : null;
  const queued = library.jobs.filter((j) => j.status === "queued").length;

  const perform =
    (fn) =>
    async (...args) => {
      try {
        await fn(...args);
      } catch (e) {
        fail(e.message || "Something went wrong. Try again.");
      }
    };

  const capture = useCapture({
    onTake: (blob, name, hint) => perform(ingest)(blob, name, hint),
    onError: fail,
  });

  // Share runs saved while the service was away once a coach connects.
  useEffect(() => {
    if (!roster.account) return;
    syncPending().then(
      (n) =>
        n && say(`Shared ${n} saved run${n === 1 ? "" : "s"} with the team.`),
    );
  }, [roster.account?.id]);

  // Sends an attempt to the service; on failure it stays local and pending.
  async function share(attempt) {
    if (!roster.account || !attempt.memberId) return;
    try {
      await pushRun(attempt);
    } catch {
      say("Saved on this device. It will be shared when the service is back.");
    }
  }

  // Open the newest take once the library loads.
  useEffect(() => {
    if (library.ready) setSelectedId(library.takes[0]?.id ?? null);
  }, [library.ready]);

  useEffect(() => {
    setNow(0);
    if (!take) return setUrl("");
    const u = URL.createObjectURL(take.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [take?.id, take?.blob]);

  function select(id) {
    if (
      id !== selectedId &&
      draft.dirty &&
      !confirm("Discard your unsaved changes to this take?")
    )
      return;
    setSelectedId(id);
    setView("review");
  }

  async function ingest(blob, name, hint) {
    const duration = await videoDuration(blob, hint);
    await draft.commit();
    const next = {
      id: crypto.randomUUID(),
      name,
      blob,
      member: roster.members.find((m) => m.id === memberFilter)?.name || "",
      memberId: memberFilter,
      course: "",
      duration,
      start: 0,
      end: duration,
      createdAt: new Date().toISOString(),
      frames: [],
      notes: "",
      cue: "",
      grade: "Not reviewed",
    };
    await library.saveTake(next);
    setSelectedId(next.id);
    setView("review");
    say("Take saved as a draft. Set the clip when you're ready.");
  }

  // The course name is shared by the take and its course map.
  const edit = (fields) =>
    draft.patch((d) =>
      "course" in fields && d.courseMap
        ? {
            ...fields,
            courseMap: { ...d.courseMap, name: fields.course || "Course" },
          }
        : fields,
    );

  async function commit(extra) {
    const saved = await draft.commit();
    return extra ? library.saveTake({ ...saved, ...extra }) : saved;
  }

  function seek(time) {
    if (!video.current) return;
    video.current.currentTime = Math.min(time, take.duration);
    setNow(time);
  }

  function saveFrame() {
    const v = video.current;
    if (!v?.videoWidth) throw Error("Wait for the video to load.");
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = (640 * v.videoHeight) / v.videoWidth;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    edit({
      frames: [
        ...t.frames,
        {
          id: crypto.randomUUID(),
          time: v.currentTime,
          image: c.toDataURL("image/jpeg", 0.8),
          note: "",
        },
      ],
    });
  }

  async function requestAnalysis() {
    const saved = await commit();
    const job = await analysis.request(saved, destination);
    setView("requests");
    scrollTo(0, 0);
    say(
      job.destination === "browser"
        ? "Clip requested. Start it when this device is ready."
        : "Request saved on this device. Download its manifest for a worker; no video was uploaded.",
    );
  }

  async function saveAttempt(rows) {
    const saved = await commit();
    const attempt = buildAttempt(saved, rows, saved.start, saved.end);
    await put("attempts", attempt);
    await library.saveTake({ ...saved, attempt });
    await share(attempt);
  }

  // A finished live run. Filmed runs become a take with the attempt on it,
  // so Review opens with every obstacle already scored and timed.
  async function saveRun({ attempt, run, blob, duration, course, burned }) {
    await put("attempts", attempt);
    await share(attempt);
    if (!blob) return;
    const take = {
      id: attempt.takeId,
      name: `Run ${new Date().toLocaleTimeString()}`,
      blob,
      member: attempt.member,
      memberId: attempt.memberId,
      course: run.course.name,
      duration,
      start: 0,
      end: duration,
      createdAt: attempt.createdAt,
      frames: [],
      notes: "",
      cue: "",
      grade: "Not reviewed",
      // The timer is already in the picture; portfolio clips don't add one.
      burned: !!burned,
      ...(run.quick
        ? {}
        : {
            courseMap: {
              name: course.name,
              background: course.background ?? "/gym-layout.png",
              layoutName: course.layoutName ?? "LAB gym layout",
              version: 1,
              points: course.points.map((p, i) => ({
                ...p,
                id: p.id ?? crypto.randomUUID(),
                time: attempt.obstacles[i].start,
              })),
            },
            attempt,
          }),
    };
    await library.saveTake(take);
    say("Run saved. Its video is in the session library.");
  }

  async function deleteTake() {
    if (
      !confirm(
        "Delete this take, its review and its finished requests from this device?",
      )
    )
      return;
    await library.removeTake(take);
    draft.discard();
    setSelectedId(library.takes.find((x) => x.id !== take.id)?.id ?? null);
    say("Take deleted.");
  }

  function onStep() {
    if (step.target === "requests") return setView("requests");
    goTo(ANCHOR[step.id]);
  }

  const hero = watch
    ? {
        eyebrow: `Team run · code ${watch.toUpperCase()}`,
        title: ["Watch it", "live."],
        lead: "The runner on course, their clock, and the standings, updated every second.",
      }
    : view === "messages"
      ? {
          eyebrow: "Messages",
          title: ["Talk with", "families."],
          lead: inbox.unread
            ? `${inbox.unread} new message${inbox.unread === 1 ? "" : "s"} from families.`
            : "Share a run, say what went well, answer questions. Families reply in the LAB app.",
        }
      : view === "run"
        ? {
            eyebrow: `Live run · ${day(new Date().toISOString())}`,
            title: ["Time the run.", "Mark it live."],
            lead: "Tap pass, fail or skip as each obstacle is cleared. Film it and the splits land on the video.",
          }
        : view === "requests"
          ? {
              eyebrow: "Analysis",
              title: ["Only the clips", "you choose."],
              lead: queued
                ? `${queued} waiting. Each request keeps the clip you set when you asked.`
                : "Nothing waiting. Request a clip from under a take's video.",
            }
          : t
            ? {
                eyebrow: `${day(t.createdAt)} · ${stamp(t.duration)} take`,
                title: [
                  t.member ? `${firstName(t.member)}'s` : "Unassigned",
                  `${t.courseMap?.name || t.course || "take"}.`,
                ],
                lead: `Clip ${stamp(t.start)}–${stamp(t.end)} · ${t.grade} · ${t.frames.length} key frame${t.frames.length === 1 ? "" : "s"}`,
              }
            : {
                eyebrow: `Replay · ${day(new Date().toISOString())}`,
                title: ["Record the course.", "Coach the replay."],
                lead: "Record or import a take. Nothing is analyzed until you choose a clip and ask for it.",
              };

  return (
    <div className="app">
      <AppBar
        scrolled={scrolled}
        roster={roster}
        nav={[
          {
            id: "review",
            label: "Review",
            icon: Play,
            active: !watch && view === "review",
            go: () => go("review"),
          },
          {
            id: "run",
            label: "Run",
            icon: Timer,
            active: !watch && view === "run",
            go: () => go("run"),
          },
          {
            id: "messages",
            label: "Messages",
            icon: MessageSquare,
            count: inbox.unread,
            countLabel: `${inbox.unread} new`,
            active: !watch && view === "messages",
            go: () => go("messages"),
          },
          {
            id: "requests",
            label: "Requests",
            icon: Layers,
            count: queued,
            active: !watch && view === "requests",
            go: () => go("requests"),
          },
        ]}
      />
      <Masthead>
        <Hero
          {...hero}
          aside={
            watch ? null : view === "review" && step ? (
              <NextStep step={step} onGo={onStep} />
            ) : view === "run" && runBest ? (
              <section className="cf-next" aria-label="Personal best">
                <span className="eyebrow">Personal best</span>
                <h2>{runBest.best.seconds.toFixed(1)}s</h2>
                <p>
                  {runBest.who.member} · {runBest.course} ·{" "}
                  {day(runBest.best.createdAt)}
                </p>
              </section>
            ) : null
          }
          actions={
            !watch &&
            ["review", "requests"].includes(view) && (
              <>
                <Button
                  variant={t ? "light" : "primary"}
                  icon={Camera}
                  disabled={capture.open}
                  onClick={perform(capture.openCamera)}
                >
                  Record a take
                </Button>
                <Button
                  variant="light"
                  icon={Upload}
                  onClick={() => file.current.click()}
                >
                  Import video
                </Button>
                <input
                  ref={file}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={perform(async (e) => {
                    const f = e.target.files[0];
                    e.target.value = "";
                    if (f) await ingest(f, f.name);
                  })}
                />
              </>
            )
          }
        />
      </Masthead>

      <main>
        {capture.open && <Capture capture={capture} onError={fail} />}

        {watch ? (
          <Spectate code={watch} connected={!!roster.account} />
        ) : view === "messages" ? (
          <Messages
            connected={!!roster.account}
            members={roster.members}
            threads={inbox.threads}
            open={thread}
            onOpen={openThread}
            onSent={inbox.refresh}
            onError={fail}
          />
        ) : view === "run" ? (
          <RunView
            members={roster.members}
            connected={!!roster.account}
            takeCourse={t?.courseMap}
            onSaveRun={saveRun}
            onOpenTake={select}
            onBest={setRunBest}
            onSay={say}
            onError={fail}
            onSendRun={(attempt) => {
              openThread(attempt.memberId, attempt.id);
              go("messages");
            }}
          />
        ) : view === "requests" ? (
          <Requests
            jobs={library.jobs}
            analysis={analysis}
            onRun={analysis.run}
            onCancel={analysis.cancel}
            onOpen={select}
            onError={fail}
          />
        ) : (
          <>
            <TakeLibrary
              takes={library.takes}
              jobs={library.jobs}
              selectedId={selectedId}
              onSelect={select}
              members={roster.members}
              memberFilter={memberFilter}
              onMemberFilter={(id) => {
                setMemberFilter(id);
                const first = library.takes.find(
                  (x) => !id || x.memberId === id,
                );
                if (first) select(first.id);
              }}
            />
            {!library.ready && <p className="ds-note">Opening your library…</p>}
            {t && (
              <>
                <StatStrip cols={3}>
                  <Stat
                    tone="sky"
                    label="Clip"
                    value={Math.max(0, t.end - t.start).toFixed(1)}
                    unit="s"
                  >
                    <small>of a {t.duration.toFixed(1)}s take</small>
                  </Stat>
                  <Stat
                    tone="mint"
                    label="Tracking"
                    value={done ? done.result.summary.coverage : "—"}
                    unit={done ? "%" : undefined}
                  >
                    <small>
                      {done ? "of sampled frames" : "Not analyzed yet"}
                    </small>
                  </Stat>
                  <Stat
                    tone="lavender"
                    label="Key frames"
                    value={t.frames.length}
                  >
                    <small>chosen for the member</small>
                  </Stat>
                </StatStrip>

                <Section
                  title="Video and coaching"
                  note="Scrub to the moment, set the clip, then write what comes next."
                  actions={
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        onClick={() =>
                          download(
                            take.blob,
                            `lab-take.${videoExtension(take.blob)}`,
                          )
                        }
                      >
                        Original video
                      </Button>
                      <IconButton
                        label="Delete take"
                        icon={Trash2}
                        tone="danger"
                        onClick={perform(deleteTake)}
                      />
                    </>
                  }
                >
                  <div className="rp-review">
                    <div className="rp-review-main">
                      <Player
                        url={url}
                        take={t}
                        videoRef={video}
                        now={now}
                        onTime={setNow}
                        speed={speed}
                        onSpeed={(s) => {
                          setSpeed(s);
                          if (video.current) video.current.playbackRate = s;
                        }}
                        loop={loop}
                        onSeek={seek}
                        onSaveFrame={perform(saveFrame)}
                        onError={fail}
                      />
                      <div id="clip">
                        <ClipCard
                          take={t}
                          now={now}
                          onChange={edit}
                          loop={loop}
                          onLoop={setLoop}
                          destination={destination}
                          onDestination={setDestination}
                          onRequest={perform(requestAnalysis)}
                          analysis={done}
                        />
                      </div>
                    </div>
                    <div className="rp-review-side">
                      <div id="take">
                        <TakeDetails
                          take={t}
                          members={roster.members}
                          onChange={edit}
                        />
                      </div>
                      <div id="coaching">
                        <CoachReview
                          take={t}
                          analysis={done}
                          onChange={edit}
                          onExport={() =>
                            download(
                              new Blob(
                                [
                                  reviewHtml(t, [
                                    ...t.frames,
                                    ...(done?.result.frames ?? []),
                                  ]),
                                ],
                                { type: "text/html" },
                              ),
                              "lab-replay-review.html",
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </Section>

                <div id="frames">
                  <KeyFrames
                    take={t}
                    sampled={done?.result.frames ?? []}
                    onChange={edit}
                    onSeek={seek}
                  />
                </div>
                <div id="compare">
                  <Compare
                    key={t.id}
                    take={t}
                    takes={library.takes}
                    request={compareWith}
                    onAddFrame={(frame) =>
                      edit({ frames: [...t.frames, frame] })
                    }
                    onError={fail}
                  />
                </div>
                <div id="course">
                  <CourseEditor
                    key={t.id}
                    take={t}
                    now={now}
                    onChange={edit}
                    onError={fail}
                    onSay={say}
                  />
                </div>
                <div id="attempt">
                  <AttemptReview
                    take={t}
                    now={now}
                    onSave={saveAttempt}
                    onSeek={seek}
                    canCompare={(id) =>
                      !!id &&
                      id !== t.id &&
                      library.takes.some((x) => x.id === id)
                    }
                    onCompare={(id) => {
                      setCompareWith({ id, n: Date.now() });
                      goTo("compare");
                    }}
                  />
                </div>
                <div id="portfolio">
                  <Section
                    title="Member portfolio"
                    note="Publish the clip, course map, coaching and key frames to the member's LAB portfolio. Families see it in the LAB app."
                  >
                    <PortfolioDelivery
                      key={t.id}
                      take={t}
                      jobs={takeJobs}
                      portfolio={portfolio}
                      connected={!!roster.account}
                      onCommit={commit}
                      onSay={say}
                    />
                  </Section>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <SaveBar
        show={draft.dirty}
        message={`Unsaved changes to ${t?.member ? `${firstName(t.member)}'s take` : "this take"}`}
        onSave={perform(async () => {
          await draft.commit();
          say("Take saved.");
        })}
        onDiscard={draft.discard}
      />
      <Toast toast={toast} onClose={clear} />
    </div>
  );
}
