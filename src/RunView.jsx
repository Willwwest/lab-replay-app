// Set up a live run (who, which course, the rules) and see recent runs.
// The run itself happens full screen in RunScreen.
import React, { useEffect, useMemo, useState } from "react";
import { Film, Send, Timer, Trophy } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Section,
  Segmented,
  Select,
  Switch,
  Tag,
} from "./ds/index.jsx";
import { all, put } from "./storage.js";
import { progressFor } from "./attempts.js";
import { day, seconds } from "./format.js";
import { ENDINGS, FAIL_LIMITS, createRun, runKey } from "./runs.js";
import RunScreen from "./RunScreen.jsx";
import Leaderboard from "./Leaderboard.jsx";
import { TeamPanel, TeamPicker } from "./Team.jsx";
import { api } from "./service.js";
import { pushRun } from "./sync.js";
import "./run.css";
import { canBurn } from "./hud.js";

const SETUP = "replay-run-setup";
const TEAM = "replay-team-id";
const MODES = [
  { value: "solo", label: "One athlete" },
  { value: "team", label: "Team run" },
];
const TAKE = "take";
const QUICK = "quick";

function remembered() {
  try {
    return JSON.parse(localStorage.getItem(SETUP)) ?? {};
  } catch {
    return {};
  }
}

// The fastest fully passed run, with its splits, for pace.
export function bestRun(history, memberId, key) {
  if (!memberId || !key) return null;
  const stats = progressFor(history, memberId, key);
  if (stats.best == null) return null;
  return stats.history.find((a) => a.completed && a.seconds === stats.best);
}

export default function RunView({
  members,
  connected,
  takeCourse,
  onSaveRun,
  onOpenTake,
  onBest,
  onSay,
  onError,
  onSendRun,
}) {
  const saved = useMemo(remembered, []);
  const [courses, setCourses] = useState([]);
  const [history, setHistory] = useState([]);
  const [memberId, setMemberId] = useState(saved.memberId ?? "");
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState(saved.courseId ?? "");
  const [quickName, setQuickName] = useState(saved.quickName ?? "");
  const [timeCap, setTimeCap] = useState("");
  const [failLimit, setFailLimit] = useState(0);
  const [flags, setFlags] = useState({
    film: false,
    overlay: true,
    countdown: true,
    sound: true,
    haptics: true,
    ...saved.flags,
  });
  const [live, setLive] = useState(null);
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState(saved.mode ?? "solo");
  const [lineup, setLineup] = useState([]);
  const [teamId, setTeamId] = useState(() => {
    try {
      return sessionStorage.getItem(TEAM) ?? "";
    } catch {
      return "";
    }
  });
  const team = connected && mode === "team";
  const keepTeam = (id) => {
    setTeamId(id);
    try {
      id ? sessionStorage.setItem(TEAM, id) : sessionStorage.removeItem(TEAM);
    } catch {}
  };

  const load = () =>
    Promise.all([all("courses"), all("attempts")])
      .then(([c, a]) => {
        setCourses(c.sort((x, y) => y.savedAt.localeCompare(x.savedAt)));
        setHistory(a);
      })
      .catch((e) => onError(e.message));
  useEffect(() => {
    load();
  }, []);

  const options = [
    ...(takeCourse?.points?.length
      ? [{ value: TAKE, label: `Open take: ${takeCourse.name}` }]
      : []),
    ...courses.map((c) => ({ value: c.id, label: c.name })),
    ...(team ? [] : [{ value: QUICK, label: "Quick run — just the clock" }]),
  ];
  const chosen = options.some((o) => o.value === courseId)
    ? courseId
    : options[0].value;
  const template = courses.find((c) => c.id === chosen);
  const course =
    chosen === TAKE ? takeCourse : chosen === QUICK ? null : template;
  const quick = chosen === QUICK;

  // Each saved course keeps the rules it was last run with.
  useEffect(() => {
    setTimeCap(template?.rules?.timeCap ? String(template.rules.timeCap) : "");
    setFailLimit(template?.rules?.failLimit ?? 0);
  }, [chosen, template?.id]);

  const member = members.find((m) => m.id === memberId);
  const who = member
    ? { memberId: member.id, member: member.name }
    : { memberId: "", member: name.trim() };
  const key = quick
    ? runKey(createRun({ quick: true, course: { name: quickName } }))
    : course
      ? runKey(createRun({ course }))
      : "";
  const best = bestRun(history, who.memberId, key);
  const runs = history
    .filter((a) => a.source === "timer")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  useEffect(() => {
    onBest(best ? { best, who, course: course?.name ?? quickName } : null);
  }, [best?.id, who.memberId, chosen]);

  async function start() {
    try {
      if (!team && !who.memberId && !who.member)
        throw Error("Choose who's running, or type their name.");
      if (team && lineup.length < 2)
        throw Error("Pick at least two athletes for a team run.");
      const cap = Number(timeCap);
      if (timeCap && !(cap > 0)) throw Error("Set the time cap in seconds.");
      const rules = { timeCap: timeCap ? cap : 0, failLimit };
      if (template) {
        const next = { ...template, rules };
        await put("courses", next);
        setCourses((old) => old.map((c) => (c.id === next.id ? next : c)));
      }
      try {
        localStorage.setItem(
          SETUP,
          JSON.stringify({
            memberId,
            courseId: chosen,
            quickName,
            flags,
            mode,
          }),
        );
      } catch {}
      if (team) {
        const view = await api("/teams", {
          method: "POST",
          body: JSON.stringify({
            course: {
              name: course.name,
              courseKey: key,
              points: course.points,
            },
            rules,
            athletes: lineup,
          }),
        });
        keepTeam(view.id);
        setLineup([]);
        return;
      }
      setLive({
        id: crypto.randomUUID(),
        who,
        quick,
        course: quick ? { name: quickName } : course,
        rules,
        ...flags,
      });
    } catch (e) {
      onError(e.message);
    }
  }

  const flag = (k) => (v) => setFlags((f) => ({ ...f, [k]: v }));

  // One athlete's run inside a team run.
  function runAthlete(athlete, view) {
    const teamCourse = { name: view.course.name, points: view.course.points };
    setLive({
      id: crypto.randomUUID(),
      who: { memberId: athlete.memberId, member: athlete.name },
      quick: false,
      course: teamCourse,
      rules: view.rules,
      ...flags,
      team: view.id,
      best: bestRun(history, athlete.memberId, view.course.courseKey),
    });
  }
  const teamPost = (path, body) =>
    api(`/teams/${live.team}/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  // A saved team run joins the standings; if it wasn't shared yet, share it.
  async function addToTeam(attempt) {
    const body = { memberId: attempt.memberId, runId: attempt.id };
    try {
      await teamPost("result", body);
    } catch {
      try {
        await pushRun(attempt);
        await teamPost("result", body);
      } catch (e) {
        onError(`Saved, but it couldn't join the team standings: ${e.message}`);
      }
    }
  }

  return (
    <>
      {connected && teamId ? (
        <TeamPanel
          teamId={teamId}
          onRun={runAthlete}
          onEnd={(closed) => {
            keepTeam("");
            if (closed)
              onSay("Team run ended. Every run stays on the leaderboard.");
          }}
          onSay={onSay}
          onError={onError}
        />
      ) : (
        <Section
          title="Set up the run"
          note="Pick who's running and the course. Marks are timed from Go."
        >
          <Card className="rp-setup">
            {connected && (
              <Segmented
                label="Run type"
                options={MODES}
                value={mode}
                onChange={setMode}
              />
            )}
            <div className="rp-setup-grid">
              {team ? null : members.length ? (
                <Field label="Who's running">
                  <Select
                    value={memberId}
                    onChange={setMemberId}
                    options={[
                      { value: "", label: "Choose a member" },
                      ...members.map((m) => ({ value: m.id, label: m.name })),
                    ]}
                  />
                </Field>
              ) : (
                <Field
                  label="Who's running"
                  hint="Connect the roster to keep personal bests."
                >
                  <Input
                    value={name}
                    onChange={setName}
                    placeholder="Athlete name"
                  />
                </Field>
              )}
              <Field
                label="Course"
                hint={
                  courses.length || takeCourse
                    ? undefined
                    : "Save a course from a take's course map to time it here."
                }
              >
                <Select
                  value={chosen}
                  onChange={setCourseId}
                  options={options}
                />
              </Field>
              {quick && (
                <Field
                  label="What are you timing?"
                  hint="Runs with the same name compare."
                >
                  <Input
                    value={quickName}
                    onChange={setQuickName}
                    placeholder="e.g. Warped wall"
                  />
                </Field>
              )}
              <Field label="Time cap (seconds)" hint="Leave empty for no cap.">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={timeCap}
                  onChange={setTimeCap}
                  placeholder="No cap"
                />
              </Field>
              <div className="ds-field">
                <span className="ds-field-label">Fail limit</span>
                <Segmented
                  label="Fail limit"
                  options={FAIL_LIMITS.map((n) => ({
                    value: n,
                    label: n ? String(n) : "Off",
                  }))}
                  value={failLimit}
                  onChange={setFailLimit}
                  disabled={quick}
                />
              </div>
            </div>

            {team && (
              <TeamPicker
                members={members}
                lineup={lineup}
                onChange={setLineup}
              />
            )}

            {course && !quick && (
              <ol className="rp-setup-course" aria-label="Obstacles in order">
                {course.points.map((p, i) => (
                  <li key={i}>
                    <span className="rp-point-n">{i + 1}</span>
                    <span>
                      <b>{p.label}</b>
                      {p.skill && <small>{p.skill}</small>}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="rp-setup-switches">
              <Switch
                checked={flags.film}
                onChange={flag("film")}
                label="Film the run"
                note="Saved as a take with the attempt already scored."
              />
              <Switch
                checked={flags.overlay}
                onChange={flag("overlay")}
                disabled={!flags.film}
                label="Timer on the video"
                note={
                  canBurn()
                    ? "Burns the clock and each split into the recording."
                    : "This browser records the camera without the timer."
                }
              />
              <Switch
                checked={flags.countdown}
                onChange={flag("countdown")}
                label="3-2-1 countdown"
              />
              <Switch
                checked={flags.sound}
                onChange={flag("sound")}
                label="Sound cues"
                note="Beeps on Go, each mark, ten seconds left and the end."
              />
              <Switch
                checked={flags.haptics}
                onChange={flag("haptics")}
                label="Vibration"
                note="On phones that support it. iPhones don't."
              />
            </div>

            <div className="rp-setup-go">
              {best && (
                <p className="ds-note">
                  <Trophy size={16} aria-hidden="true" /> {who.member}'s best
                  here: <b>{seconds(best.seconds)}</b> on {day(best.createdAt)}
                </p>
              )}
              <Button icon={Timer} onClick={start}>
                {team ? "Start team run" : "Start the run"}
              </Button>
            </div>
          </Card>
        </Section>
      )}

      <Leaderboard
        connected={connected}
        courseKey={key}
        highlight={who.memberId}
        version={version}
      />

      {!teamId && (
        <Section
          title="Recent runs"
          note="Timed runs saved on this device. Clean runs count toward personal bests."
        >
          {runs.length === 0 ? (
            <Card>
              <Empty icon={Timer} title="No timed runs yet">
                Start a run above. It saves here when you finish.
              </Empty>
            </Card>
          ) : (
            <ul className="rp-runs">
              {runs.map((a) => {
                const top = bestRun(history, a.memberId, a.courseKey);
                const passed = a.obstacles.filter((o) => o.result === "pass");
                return (
                  <li key={a.id}>
                    <Card pad="md" className="rp-run-row">
                      <div className="rp-run-row-time">
                        <b>{seconds(a.seconds)}</b>
                        <small>{day(a.createdAt)}</small>
                      </div>
                      <div>
                        <CardHead
                          title={a.member || "Unassigned"}
                          note={`${a.course} · ${passed.length} of ${a.obstacles.length} passed`}
                        />
                      </div>
                      <div className="rp-tags">
                        {top?.id === a.id && <Tag tone="live">Best</Tag>}
                        <Tag tone={a.completed ? "good" : "neutral"}>
                          {a.completed ? "Clean" : ENDINGS[a.ended]}
                        </Tag>
                        {a.takeId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Film}
                            onClick={() => onOpenTake(a.takeId)}
                          >
                            Video
                          </Button>
                        )}
                        {connected && a.memberId && a.synced && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Send}
                            onClick={() => onSendRun(a)}
                          >
                            Send to family
                          </Button>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {live && (
        <RunScreen
          key={live.id}
          setup={live}
          best={live.team ? live.best : best}
          onLive={
            live.team
              ? (state) =>
                  teamPost("live", {
                    memberId: live.who.memberId,
                    ...state,
                  }).catch(() => {})
              : undefined
          }
          onSave={async (result) => {
            await onSaveRun({ ...result, course: live.course });
            if (live.team) await addToTeam(result.attempt);
            await load();
            setVersion((n) => n + 1);
          }}
          onAgain={() => setLive({ ...live, id: crypto.randomUUID() })}
          onClose={(takeId) => {
            if (live.team) teamPost("live", { clear: true }).catch(() => {});
            setLive(null);
            if (takeId) onOpenTake(takeId);
          }}
        />
      )}
    </>
  );
}
