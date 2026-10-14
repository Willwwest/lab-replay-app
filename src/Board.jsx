// Board: the leaderboard for each course, and team runs (athletes take
// turns on one course while everyone watches). Both need the team service.
import React, { useState } from "react";
import { Play, Trophy } from "lucide-react";
import {
  Button,
  Card,
  Empty,
  Field,
  Section,
  Segmented,
  Select,
} from "./ds/index.jsx";
import { PageHead } from "./Shell.jsx";
import Leaderboard from "./Leaderboard.jsx";
import { TeamPanel, TeamPicker } from "./Team.jsx";
import { api } from "./service.js";
import { createRun, runKey } from "./runs.js";

export default function Board({
  shared,
  members,
  courses,
  teamId,
  upNext,
  onTeam,
  onRun,
  version,
  onSay,
  onError,
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [lineup, setLineup] = useState([]);
  const [view, setView] = useState(teamId ? "team" : "ranks");
  const course = courses.find((c) => c.id === courseId) ?? courses[0];

  async function start() {
    try {
      if (!course) throw Error("Save a course from a take's Course tab first.");
      if (lineup.length < 2) throw Error("Pick at least two athletes.");
      const team = await api("/teams", {
        method: "POST",
        body: JSON.stringify({
          course: {
            name: course.name,
            courseKey: runKey(createRun({ course })),
            points: course.points,
          },
          rules: course.rules ?? {},
          athletes: lineup,
        }),
      });
      setLineup([]);
      onTeam(team.id);
      setView("team");
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Board"
        title="Leaderboards and team runs"
        sub="Best clean runs on each course, and the team taking turns on one."
      />
      <main className="rp-page">
        {!shared ? (
          <Card>
            <Empty icon={Trophy} title="Boards need the team service">
              Leaderboards and team runs are shared between coaches through the
              Replay service, which this copy isn't connected to.
            </Empty>
          </Card>
        ) : (
          <>
            <div className="rp-tabs">
              <Segmented
                label="Board sections"
                size="lg"
                options={[
                  { value: "ranks", label: "Leaderboard" },
                  {
                    value: "team",
                    label: teamId ? "Team run · live" : "Team run",
                  },
                ]}
                value={view}
                onChange={setView}
              />
            </div>
            {view === "ranks" ? (
              <Leaderboard
                connected={shared}
                courseKey=""
                highlight={upNext ?? ""}
                version={version}
              />
            ) : teamId ? (
              <TeamPanel
                teamId={teamId}
                onRun={onRun}
                onEnd={(closed) => {
                  onTeam("");
                  if (closed)
                    onSay(
                      "Team run ended. Every run stays on the leaderboard.",
                    );
                }}
                onSay={onSay}
                onError={onError}
              />
            ) : (
              <Section
                title="Team run"
                note="Pick a course and who's running, in order. Each athlete runs on the camera; the standings update on every phone."
              >
                <Card className="rp-team-setup">
                  <Field
                    label="Course"
                    hint={
                      courses.length
                        ? undefined
                        : "Save a course from a take's Course tab first."
                    }
                  >
                    <Select
                      value={course?.id ?? ""}
                      onChange={setCourseId}
                      disabled={!courses.length}
                      options={
                        courses.length
                          ? courses.map((c) => ({ value: c.id, label: c.name }))
                          : [{ value: "", label: "No saved courses" }]
                      }
                    />
                  </Field>
                  <TeamPicker
                    members={members}
                    lineup={lineup}
                    onChange={setLineup}
                  />
                  <div className="rp-actions">
                    <Button icon={Play} onClick={start}>
                      Start team run
                    </Button>
                  </div>
                </Card>
              </Section>
            )}
          </>
        )}
      </main>
    </>
  );
}
