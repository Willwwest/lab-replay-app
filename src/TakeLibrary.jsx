// Takes on this device, newest first, as a sideways rail of cards.
// The member picked here filters the rail and owns new recordings.
import React from "react";
import { Film } from "lucide-react";
import { Empty, Field, Section, Select, Tag } from "./ds/index.jsx";
import { day, stamp } from "./format.js";

function status(take, jobs) {
  if (take.portfolioId) return { tone: "good", label: "Portfolio" };
  const own = jobs.filter((j) => j.takeId === take.id);
  if (own.some((j) => j.status === "completed"))
    return { tone: "info", label: "Analyzed" };
  if (own.some((j) => ["queued", "running"].includes(j.status)))
    return { tone: "warn", label: "Requested" };
  return { tone: "outline", label: "Draft" };
}

export default function TakeLibrary({
  takes,
  jobs,
  selectedId,
  onSelect,
  members,
  memberFilter,
  onMemberFilter,
}) {
  const shown = takes.filter(
    (t) => !memberFilter || t.memberId === memberFilter,
  );
  const memberName = members.find((m) => m.id === memberFilter)?.name;
  return (
    <Section
      className="rp-library"
      title="Session library"
      note="Takes stay on this device. Nothing is uploaded or analyzed until you ask."
      actions={
        members.length > 0 && (
          <div className="rp-library-member">
            <Field label="Member" hint="New takes are assigned to this member.">
              <Select
                value={memberFilter}
                onChange={onMemberFilter}
                options={[
                  { value: "", label: "All members" },
                  ...members.map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            </Field>
          </div>
        )
      }
    >
      {shown.length === 0 ? (
        <div className="ds-card ds-card-plain">
          <Empty
            icon={Film}
            title={
              memberName ? `No takes for ${memberName} yet` : "No takes yet"
            }
          >
            Record a take or import a video from the camera roll.
          </Empty>
        </div>
      ) : (
        <div className="rp-takes" data-scroll-x role="list">
          {shown.map((t) => {
            const s = status(t, jobs);
            return (
              <button
                key={t.id}
                role="listitem"
                className="rp-take"
                aria-current={t.id === selectedId || undefined}
                onClick={() => onSelect(t.id)}
              >
                <span className="rp-take-head">
                  <Film size={18} aria-hidden="true" />
                  <Tag tone={s.tone}>{s.label}</Tag>
                </span>
                <b>{t.member || "Unassigned member"}</b>
                <span className="rp-take-meta">
                  {t.courseMap?.name || t.course || t.name}
                </span>
                <span className="rp-take-meta">
                  {stamp(t.duration)} · {day(t.createdAt)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}
