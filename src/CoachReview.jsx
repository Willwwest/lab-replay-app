// Who the take belongs to, and the coach's assessment of it.
import React from "react";
import { Download } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Field,
  Input,
  Select,
  Tag,
  TextArea,
} from "./ds/index.jsx";
import { seconds } from "./format.js";
import { GRADES } from "./workflow.js";

export function TakeDetails({ take, members, onChange }) {
  return (
    <Card
      as="section"
      pad="md"
      aria-label="Take details"
      className="rp-details"
    >
      <Field
        label="Member"
        hint={
          members.length ? undefined : "Connect the roster to pick a member."
        }
      >
        {members.length ? (
          <Select
            value={take.memberId || ""}
            onChange={(id) =>
              onChange({
                memberId: id,
                member: members.find((m) => m.id === id)?.name || "",
              })
            }
            options={[
              { value: "", label: "Assign to a member" },
              ...members.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        ) : (
          <Input
            value={take.member}
            onChange={(member) => onChange({ member })}
            placeholder="Member name"
          />
        )}
      </Field>
      <Field label="Course">
        <Input
          value={take.course}
          onChange={(course) => onChange({ course })}
          placeholder="Course name or layout"
        />
      </Field>
    </Card>
  );
}

export function CoachReview({ take, analysis, onChange, onExport }) {
  const summary = analysis?.result?.summary;
  return (
    <Card as="section" aria-labelledby="rp-coach-title" className="rp-coach">
      <header className="ds-card-head">
        <div>
          <h3 className="ds-h3" id="rp-coach-title">
            Coach review
          </h3>
          <p className="ds-note">
            Point to what the member can see in the replay.
          </p>
        </div>
        <Tag tone={take.grade === "Not reviewed" ? "outline" : "good"}>
          {take.grade === "Not reviewed" ? "Not reviewed" : "Assessed"}
        </Tag>
      </header>
      <Field label="Assessment">
        <Select
          value={take.grade}
          onChange={(grade) => onChange({ grade })}
          options={GRADES.map((g) => ({ value: g, label: g }))}
        />
      </Field>
      <Field label="What went well">
        <TextArea
          rows={4}
          value={take.notes}
          onChange={(notes) => onChange({ notes })}
          placeholder="Something the member can see in the replay."
        />
      </Field>
      <Field label="Focus for the next attempt">
        <TextArea
          rows={3}
          value={take.cue}
          onChange={(cue) => onChange({ cue })}
          placeholder="One clear cue or practice task."
        />
      </Field>
      {summary && (
        <Card tone="muted" pad="md" className="rp-tracking">
          <CardHead
            title={`${summary.coverage}% tracked`}
            note={`${summary.trackedFrames} of ${summary.framesSampled} sampled frames over ${seconds(summary.duration)}. Coverage describes how visible the member was, not how well they moved.`}
          />
        </Card>
      )}
      <Button variant="secondary" icon={Download} onClick={onExport}>
        Export member review
      </Button>
    </Card>
  );
}
