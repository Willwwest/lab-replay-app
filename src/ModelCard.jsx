// Marking a take as a model clip: an example of how a skill should look,
// which any take can be played beside on its Watch tab.
import React from "react";
import { Star } from "lucide-react";
import {
  Card,
  CardHead,
  Field,
  Input,
  Switch,
  Tag,
  TextArea,
} from "./ds/index.jsx";

export const MODEL_TITLE = 60;

export default function ModelCard({ take, coach, onChange }) {
  const m = take.model;
  const set = (fields) => onChange({ model: { ...m, ...fields } });
  return (
    <Card as="section" pad="md" className="rp-model" aria-label="Model clip">
      <CardHead
        title="Model clip"
        note="An example of how it should look. Coaches can play any take beside it, and it shows under Models in Takes."
        aside={
          m && (
            <Tag tone="brand" icon={Star}>
              Model
            </Tag>
          )
        }
      />
      <Switch
        checked={!!m}
        onChange={(on) =>
          onChange({
            model: on
              ? {
                  title: take.courseMap?.name || take.course || "Model clip",
                  note: "",
                  by: coach,
                  at: new Date().toISOString(),
                }
              : null,
          })
        }
        label="Use as a model clip"
        note="Its clip (start to end) is what gets compared."
      />
      {m && (
        <>
          <Field label="Title">
            <Input
              value={m.title}
              maxLength={MODEL_TITLE}
              placeholder="Clean lache on the rings"
              onChange={(title) => set({ title })}
            />
          </Field>
          <Field label="What to watch for">
            <TextArea
              rows={2}
              value={m.note}
              placeholder="Hips stay high through the release."
              onChange={(note) => set({ note })}
            />
          </Field>
        </>
      )}
    </Card>
  );
}
