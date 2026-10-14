// LAB Replay, for coaches on the gym floor: pick who's up, record, keep it,
// next kid. Later: assign, check, send the good ones for analysis, coach
// and share. Screens: Floor, Takes, a take, Board, Messages, and the camera.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Film, Home, MessageSquare, Trophy } from "lucide-react";
import { SaveBar } from "./ds/index.jsx";
import { AppBar, PageHead, Toast } from "./Shell.jsx";
import CoachGate from "./CoachGate.jsx";
import Floor from "./Floor.jsx";
import Takes, { FILTERS } from "./Takes.jsx";
import TakeScreen, { TABS } from "./TakeScreen.jsx";
import Board from "./Board.jsx";
import CaptureScreen from "./CaptureScreen.jsx";
import KidPicker from "./KidPicker.jsx";
import Messages, { useThreads } from "./Messages.jsx";
import { Spectate } from "./Team.jsx";
import {
  COACHES,
  useAnalysis,
  useDraft,
  useHere,
  useLibrary,
  usePortfolio,
  useRoster,
  useScrolled,
  useSharedRuns,
  useToast,
  videoDuration,
} from "./hooks.js";
import { thumbnail } from "./camera.js";
import { useRoute } from "./route.js";
import { all, put } from "./storage.js";
import { api } from "./service.js";
import { pushRun, syncPending } from "./sync.js";
import { buildAttempt, progressFor } from "./attempts.js";
import { download, firstName, reviewHtml, videoExtension } from "./format.js";
import { shared } from "./stills.js";
import { runKey, createRun } from "./runs.js";
import { needsKid, takeStatus } from "./workflow.js";
import { allRuns, attention } from "./attention.js";
import { awaitingAngles, importAngles, useAngleHost } from "./angles.js";
import AngleCamera from "./AngleCamera.jsx";
import "./replay.css";
import "./coach.css";

const SETTINGS = "replay-capture";
const TEAM = "replay-team-id";
const DEFAULTS = {
  overlay: true,
  countdown: true,
  sound: true,
  haptics: true,
  rules: { timeCap: 0, failLimit: 0 },
};
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export default function App() {
  const { toast, say, fail, clear } = useToast();
  const roster = useRoster(fail);
  if (!roster.coach)
    return (
      <>
        <CoachGate coaches={COACHES} onChoose={roster.choose} />
        <Toast toast={toast} onClose={clear} />
      </>
    );
  return <Coaching roster={roster} toast={{ toast, say, fail, clear }} />;
}

function Coaching({ roster, toast: { toast, say, fail, clear } }) {
  const scrolled = useScrolled();
  const library = useLibrary(fail);
  const here = useHere(roster);
  const inbox = useThreads(roster.shared);
  const { route, go } = useRoute();
  const [upNext, setUpNext] = useState(null);
  const [capture, setCapture] = useState(null); // { mode, team }
  const [picker, setPicker] = useState(null); // { purpose, takeId }
  const [courses, setCourses] = useState([]);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULTS,
    ...read(SETTINGS, {}),
  }));
  const [takesFilter, setTakesFilter] = useState(null);
  const [takesSearch, setTakesSearch] = useState({
    query: "",
    tag: "",
    month: "",
  });
  const [teamId, setTeamId] = useState(
    () => sessionStorage.getItem(TEAM) ?? "",
  );
  const [thread, setThread] = useState(null);
  const [compareWith, setCompareWith] = useState(null);
  const [beAngle, setBeAngle] = useState(false);
  const angleHost = useAngleHost(roster.shared);
  const [boardVersion, setBoardVersion] = useState(0);
  const [now, setNow] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [url, setUrl] = useState("");
  const video = useRef(null);
  const file = useRef(null);
  const watch = new URLSearchParams(location.search).get("team") ?? "";

  const selectedId = route.screen === "take" ? route.id : null;
  const take = library.takes.find((t) => t.id === selectedId) ?? null;
  const draft = useDraft(take, library.saveTake);
  const t = draft.view;
  const jobs = useMemo(
    () => library.jobs.filter((j) => j.takeId === selectedId),
    [library.jobs, selectedId],
  );
  const portfolio = usePortfolio(take);
  const analysis = useAnalysis(library, () =>
    say("Analysis ready. See it with the coaching."),
  );
  const weekCount = library.jobs.filter(
    (j) => Date.now() - Date.parse(j.requestedAt) < 7 * 864e5,
  ).length;
  const toAssign = library.takes.filter(needsKid).length;
  const sharedRuns = useSharedRuns(roster.shared, boardVersion);
  const needs = useMemo(
    () =>
      attention({
        members: roster.members,
        here: here.ids,
        takes: library.takes,
        runs: allRuns(library.takes, sharedRuns),
      }),
    [roster.members, here.ids, library.takes, sharedRuns],
  );

  const perform =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        fail(e.message || "Something went wrong. Try again.");
      }
    };

  const loadCourses = () =>
    all("courses")
      .then((c) =>
        setCourses(c.sort((a, b) => b.savedAt.localeCompare(a.savedAt))),
      )
      .catch(() => {});
  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (!roster.shared) return;
    syncPending().then(
      (n) =>
        n && say(`Shared ${n} saved run${n === 1 ? "" : "s"} with the team.`),
    );
  }, [roster.account?.id]);

  // The camera is a screen: back closes it, and it can't open on a reload.
  useEffect(() => {
    if (route.screen !== "capture" && capture) setCapture(null);
    if (route.screen === "capture" && !capture) go("floor", { replace: true });
  }, [route.screen]);

  useEffect(() => {
    setNow(0);
    if (!take) return setUrl("");
    const u = URL.createObjectURL(take.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [take?.id, take?.blob]);

  // Other cameras' clips of takes kept here come in for a while after.
  const importing = useRef(false);
  const waiting = roster.shared && awaitingAngles(library.takes).length > 0;
  useEffect(() => {
    if (!waiting) return;
    const pull = async () => {
      if (importing.current) return;
      importing.current = true;
      try {
        const n = await importAngles(library.takes, library.saveTake);
        if (n) say(`${n} more camera angle${n === 1 ? "" : "s"} came in.`);
      } catch {
      } finally {
        importing.current = false;
      }
    };
    pull();
    const t = setInterval(pull, 3000);
    return () => clearInterval(t);
  }, [waiting, library.takes]);

  // A clip sent for analysis on this device starts as soon as it's free.
  useEffect(() => {
    if (analysis.busy) return;
    const next = library.jobs.find(
      (j) => j.status === "queued" && j.destination === "browser",
    );
    if (next) analysis.run(next);
  }, [library.jobs, analysis.busy]);

  async function share(attempt) {
    if (!roster.shared || !attempt?.memberId) return;
    try {
      await pushRun(attempt);
    } catch {
      say("Saved on this device. It will be shared when the service is back.");
    }
  }

  function openCapture(mode, team = null) {
    loadCourses();
    setCapture({ mode, team });
    go("capture");
  }
  const closeCapture = () => {
    if (route.screen === "capture") history.back();
    else setCapture(null);
  };

  function open(id, tab = "watch") {
    if (
      id !== selectedId &&
      draft.dirty &&
      !confirm("Discard your unsaved changes to this take?")
    )
      return;
    go(`take/${id}/${tab}`);
  }

  // Everything the camera keeps becomes a take; timed runs also save the
  // scored attempt and share it.
  async function saveCapture(result) {
    const {
      takeId,
      kid,
      mode,
      course,
      run,
      attempt,
      blob,
      duration,
      burned,
      sync,
    } = result;
    const member = kid
      ? { memberId: kid.id ?? kid.memberId, member: kid.name ?? kid.member }
      : { memberId: "", member: "" };
    if (attempt) {
      await put("attempts", attempt);
      await share(attempt);
      if (capture?.team) await addToTeam(capture.team.id, attempt);
    }
    const next = {
      id: takeId,
      name: `${mode === "course" ? "Run" : "Take"} ${new Date().toLocaleTimeString()}`,
      blob,
      ...member,
      course: mode === "course" ? run.course.name : "",
      duration,
      start: 0,
      end: duration,
      createdAt: new Date().toISOString(),
      frames: [],
      notes: "",
      cue: "",
      grade: "Not reviewed",
      burned: !!burned,
      ...(sync ? { sync } : {}),
      thumb: await thumbnail(blob),
      ...(mode === "course" && course
        ? {
            courseMap: {
              name: course.name,
              background: course.background ?? "/gym-layout.png",
              layoutName: course.layoutName ?? "LAB gym layout",
              version: 1,
              points: course.points.map((p, i) => ({
                ...p,
                id: p.id ?? crypto.randomUUID(),
                time: attempt?.obstacles[i]?.start ?? null,
              })),
            },
            ...(attempt ? { attempt } : {}),
          }
        : {}),
    };
    await library.saveTake(next);
    setBoardVersion((n) => n + 1);
    return takeId;
  }

  async function addToTeam(id, attempt) {
    const post = () =>
      api(`/teams/${id}/result`, {
        method: "POST",
        body: JSON.stringify({ memberId: attempt.memberId, runId: attempt.id }),
      });
    try {
      await post();
    } catch {
      try {
        await pushRun(attempt);
        await post();
      } catch (e) {
        fail(`Saved, but it couldn't join the team standings: ${e.message}`);
      }
    }
  }

  async function ingest(blob, name) {
    const duration = await videoDuration(blob);
    const kid = roster.members.find((m) => m.id === upNext);
    const next = {
      id: crypto.randomUUID(),
      name,
      blob,
      member: kid?.name ?? "",
      memberId: kid?.id ?? "",
      course: "",
      duration,
      start: 0,
      end: duration,
      createdAt: new Date().toISOString(),
      frames: [],
      notes: "",
      cue: "",
      grade: "Not reviewed",
      thumb: await thumbnail(blob),
    };
    await library.saveTake(next);
    say(kid ? `Imported for ${kid.name}.` : "Imported. Assign a kid in Takes.");
  }

  async function assign(takeId, memberId) {
    const stored = library.takes.find((x) => x.id === takeId);
    const m = roster.members.find((x) => x.id === memberId);
    if (!stored || !m) return;
    const fields = { memberId: m.id, member: m.name };
    // Other cameras' takes of the same recording are the same kid.
    const group = stored.sync?.group;
    for (const x of library.takes)
      if (x.id === takeId || (group && x.sync?.group === group)) {
        await library.saveTake({ ...x, ...fields });
        if (x.id === selectedId) draft.patch(fields);
      }
    say(`Assigned to ${m.name}.`);
  }

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
    v.pause();
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = (640 * v.videoHeight) / v.videoWidth;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    const frame = {
      id: crypto.randomUUID(),
      time: v.currentTime,
      image: c.toDataURL("image/jpeg", 0.8),
      note: "",
    };
    edit({ frames: [...t.frames, frame] });
    return frame;
  }

  const ops = {
    jobs,
    takes: library.takes,
    shared: roster.shared,
    portfolio,
    analysis,
    weekCount,
    url,
    video,
    now,
    setNow,
    speed,
    setSpeed: (s) => {
      setSpeed(s);
      if (video.current) video.current.playbackRate = s;
    },
    loop,
    setLoop,
    seek,
    edit,
    commit,
    say,
    fail,
    coach: roster.coach.name,
    compareWith,
    setCompareWith,
    back: () => go("takes"),
    saveFrame: perform(saveFrame),
    assign: () => setPicker({ purpose: "assign", takeId: selectedId }),
    check: perform(async () => {
      const saved = await commit();
      await library.saveTake({
        ...saved,
        checked: {
          start: saved.start,
          end: saved.end,
          by: roster.coach.name,
          at: new Date().toISOString(),
        },
      });
      say("Checked. It's ready to send for analysis.");
    }),
    uncheck: perform(async () => {
      const saved = await commit();
      await library.saveTake({ ...saved, checked: null });
    }),
    send: perform(async (destination) => {
      const saved = await commit();
      await analysis.request(saved, destination);
      say(
        destination === "browser"
          ? "Sent. Analysis runs on this device."
          : "Saved for a worker. Nothing was uploaded.",
      );
    }),
    cancel: perform((job) => analysis.cancel(job)),
    saveAttempt: async (rows) => {
      const saved = await commit();
      const attempt = buildAttempt(saved, rows, saved.start, saved.end);
      await put("attempts", attempt);
      await library.saveTake({ ...saved, attempt });
      await share(attempt);
    },
    exportReview: () =>
      download(
        new Blob([reviewHtml(t, t.frames.map(shared))], { type: "text/html" }),
        "lab-replay-review.html",
      ),
    downloadOriginal: () =>
      download(take.blob, `lab-take.${videoExtension(take.blob)}`),
    message: () => {
      setThread({ memberId: t.memberId, runId: t.attempt?.id });
      go("messages");
    },
    remove: perform(async () => {
      if (
        !confirm(
          "Delete this take, its review and its analysis from this device?",
        )
      )
        return;
      await library.removeTake(take);
      draft.discard();
      go("takes", { replace: true });
      say("Take deleted.");
    }),
  };

  const tabOf = TABS.some((x) => x.value === route.tab) ? route.tab : "watch";
  const filter =
    takesFilter ??
    (toAssign
      ? "assign"
      : library.takes.some((x) => FILTERS.check(x, takeStatus(x, library.jobs)))
        ? "check"
        : "all");
  const screen = watch ? "watch" : route.screen;

  return (
    <div className="app">
      <AppBar
        scrolled={scrolled}
        roster={roster}
        nav={[
          { id: "floor", label: "Floor", icon: Home },
          {
            id: "takes",
            label: "Takes",
            icon: Film,
            count: toAssign,
            countLabel: `${toAssign} to assign`,
          },
          { id: "board", label: "Board", icon: Trophy },
          {
            id: "messages",
            label: "Messages",
            icon: MessageSquare,
            count: inbox.unread,
            countLabel: `${inbox.unread} new`,
          },
        ].map((n) => ({
          ...n,
          active:
            !watch &&
            (screen === n.id || (n.id === "takes" && screen === "take")),
          go: () => {
            if (watch) location.href = `${location.pathname}#/${n.id}`;
            else go(n.id);
          },
        }))}
      />

      {screen === "watch" ? (
        <>
          <PageHead
            eyebrow={`Team run · code ${watch.toUpperCase()}`}
            title="Watch it live"
            sub="The runner on course, their clock and the standings, every second."
          />
          <main className="rp-page">
            <Spectate code={watch} connected={roster.shared} />
          </main>
        </>
      ) : screen === "take" && t ? (
        <TakeScreen
          t={t}
          take={take}
          tab={tabOf}
          onTab={(x) => go(`take/${t.id}/${x}`, { replace: true })}
          ops={ops}
        />
      ) : screen === "take" ? (
        <>
          <PageHead
            back="Takes"
            onBack={() => go("takes")}
            title="Take not found"
          />
          <main className="rp-page">
            <p className="ds-note">
              {library.ready ? "It isn't on this device." : "Opening…"}
            </p>
          </main>
        </>
      ) : screen === "takes" ? (
        <Takes
          takes={library.takes}
          jobs={library.jobs}
          ready={library.ready}
          filter={filter}
          onFilter={setTakesFilter}
          search={takesSearch}
          onSearch={setTakesSearch}
          onOpen={(id) => open(id)}
          onAssign={(id) => setPicker({ purpose: "assign", takeId: id })}
          onRecord={() => openCapture("record")}
        />
      ) : screen === "board" ? (
        <Board
          shared={roster.shared}
          members={roster.members}
          courses={courses}
          teamId={teamId}
          upNext={upNext}
          version={boardVersion}
          onTeam={(id) => {
            setTeamId(id);
            id
              ? sessionStorage.setItem(TEAM, id)
              : sessionStorage.removeItem(TEAM);
          }}
          onRun={(athlete, view) => {
            setUpNext(athlete.memberId);
            openCapture("course", {
              id: view.id,
              course: { name: view.course.name, points: view.course.points },
              onLive: (state) =>
                api(`/teams/${view.id}/live`, {
                  method: "POST",
                  body: JSON.stringify({
                    memberId: athlete.memberId,
                    ...state,
                  }),
                }).catch(() => {}),
            });
          }}
          onSay={say}
          onError={fail}
        />
      ) : screen === "messages" ? (
        <>
          <PageHead
            eyebrow="Messages"
            title="Families"
            sub={
              inbox.unread
                ? `${inbox.unread} new from families.`
                : "Share a run, say what went well. Families reply in the LAB app."
            }
          />
          <main className="rp-page">
            <Messages
              connected={roster.shared}
              members={roster.members}
              threads={inbox.threads}
              open={thread}
              onOpen={(memberId, runId) => {
                setThread(memberId ? { memberId, runId } : null);
                setTimeout(inbox.refresh, 600);
              }}
              onSent={inbox.refresh}
              onError={fail}
            />
          </main>
        </>
      ) : (
        <Floor
          coach={roster.coach}
          members={roster.members}
          here={here}
          upNext={upNext}
          onUpNext={setUpNext}
          takes={library.takes}
          jobs={library.jobs}
          needs={needs}
          onRecord={() => openCapture("record")}
          onTimed={() => openCapture("course")}
          onImport={() => file.current.click()}
          onBeAngle={() => setBeAngle(true)}
          onManageHere={() => setPicker({ purpose: "here" })}
          onOpen={(id) => open(id)}
          onAssign={(id) => setPicker({ purpose: "assign", takeId: id })}
          onTakes={() => {
            setTakesFilter("assign");
            go("takes");
          }}
        />
      )}
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

      {capture && (
        <CaptureScreen
          kid={roster.members.find((m) => m.id === upNext) ?? null}
          onKid={(m) => setUpNext(m?.id ?? null)}
          members={roster.members}
          here={here.ids}
          courses={courses}
          mode={capture.mode}
          settings={settings}
          onSettings={(s) => {
            setSettings(s);
            write(SETTINGS, s);
          }}
          bestFor={(memberId, course) => {
            const key = runKey(createRun({ course }));
            const stats = progressFor(
              library.takes.map((x) => x.attempt).filter(Boolean),
              memberId,
              key,
            );
            return stats.best == null
              ? null
              : stats.history.find(
                  (a) => a.completed && a.seconds === stats.best,
                );
          }}
          onSave={saveCapture}
          onClose={closeCapture}
          onOpenTake={(id) => {
            setCapture(null);
            go(`take/${id}/watch`, { replace: true });
          }}
          team={capture.team}
          angles={angleHost}
        />
      )}
      {beAngle && (
        <AngleCamera
          connected={roster.shared}
          onClose={() => setBeAngle(false)}
        />
      )}

      {picker?.purpose === "here" && (
        <KidPicker
          members={roster.members}
          here={here.ids}
          mode="here"
          title="Who's in the gym?"
          note={
            roster.shared
              ? "Every coach's phone sees this list today."
              : "Kept on this device today."
          }
          onToggle={(id, on) => here.set(id, on)}
          onClose={() => setPicker(null)}
        />
      )}
      {picker?.purpose === "assign" && (
        <KidPicker
          members={roster.members}
          here={here.ids}
          title="Whose take is this?"
          current={library.takes.find((x) => x.id === picker.takeId)?.memberId}
          onPick={perform(async (id) => {
            setPicker(null);
            await assign(picker.takeId, id);
          })}
          onClose={() => setPicker(null)}
        />
      )}

      <SaveBar
        show={screen === "take" && draft.dirty}
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
