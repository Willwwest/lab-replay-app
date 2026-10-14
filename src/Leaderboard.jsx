// Each member's best clean run on a course, from every coach's runs on the
// service. Refreshes while open, so a run saved on another device shows up.
import React, { useEffect, useState } from "react";
import { Medal, Trophy } from "lucide-react";
import {
  Card,
  Empty,
  Field,
  Section,
  Segmented,
  Select,
  Tag,
} from "./ds/index.jsx";
import { api } from "./service.js";
import { day, seconds } from "./format.js";
import "./board.css";

const PERIODS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];
// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st.
const place = (n) => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};
const REFRESH = 10000;

export default function Leaderboard({
  connected,
  courseKey,
  highlight,
  version,
}) {
  const [courses, setCourses] = useState([]);
  const [chosen, setChosen] = useState("");
  const [period, setPeriod] = useState("month");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  // Follow the course picked for the next run when it has runs.
  useEffect(() => {
    if (courseKey && courses.some((c) => c.courseKey === courseKey))
      setChosen(courseKey);
  }, [courseKey, courses]);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    const load = () =>
      api("/courses")
        .then((list) => live && setCourses(list))
        .catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, REFRESH);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [connected, version]);

  const key = chosen || courses[0]?.courseKey || "";
  useEffect(() => {
    if (!connected || !key) return setRows(null);
    let live = true;
    const load = () =>
      api(`/leaderboard?course=${encodeURIComponent(key)}&period=${period}`)
        .then((r) => {
          if (!live) return;
          setRows(r);
          setError("");
        })
        .catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, REFRESH);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [connected, key, period, version]);

  const course = courses.find((c) => c.courseKey === key);

  return (
    <Section
      title="Leaderboard"
      note="Each member's best clean run, from every coach's timed runs and scored videos."
      actions={
        connected &&
        courses.length > 0 && (
          <div className="rp-ranks-pick">
            <Field label="Leaderboard course">
              <Select
                value={key}
                onChange={setChosen}
                options={courses.map((c) => ({
                  value: c.courseKey,
                  label: `${c.course} · ${c.runs} run${c.runs === 1 ? "" : "s"}`,
                }))}
              />
            </Field>
          </div>
        )
      }
      toolbar={
        connected &&
        courses.length > 0 && (
          <Segmented
            label="Period"
            options={PERIODS}
            value={period}
            onChange={setPeriod}
          />
        )
      }
    >
      {!connected ? (
        <Card>
          <Empty icon={Trophy} title="Connect the roster to see leaderboards">
            Runs are shared through the local service once a coach is connected.
          </Empty>
        </Card>
      ) : error && !rows ? (
        <p className="rp-inline is-error" role="alert">
          {error}
        </p>
      ) : !courses.length ? (
        <Card>
          <Empty icon={Trophy} title="No shared runs yet">
            Save a timed run for a roster member and it ranks here.
          </Empty>
        </Card>
      ) : rows && rows.length === 0 ? (
        <Card>
          <Empty icon={Medal} title="No clean runs in this period">
            {course?.course} has runs, but none finished clean{" "}
            {period === "all" ? "yet" : `this ${period}`}.
          </Empty>
        </Card>
      ) : (
        <ol className="rp-ranks" aria-label={`${course?.course} leaderboard`}>
          {(rows ?? []).map((r) => (
            <li
              key={r.memberId ?? `${r.rank}-${r.seconds}`}
              className={r.memberId === highlight ? "is-next" : undefined}
            >
              <span className={`rp-ranks-rank rp-ranks-rank-${r.rank}`}>
                {place(r.rank)}
              </span>
              <span className="rp-ranks-name">
                <b>{r.name}</b>
                <small>
                  {day(r.at)} · {r.runs} run{r.runs === 1 ? "" : "s"}
                </small>
              </span>
              <span className="rp-ranks-tag">
                {r.memberId === highlight && <Tag tone="live">Up next</Tag>}
              </span>
              <b className="rp-ranks-time">{seconds(r.seconds)}</b>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
