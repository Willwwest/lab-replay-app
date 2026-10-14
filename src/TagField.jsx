// A take's tags: the ones it has (tap to remove), a box to add one, and
// suggestions from its course and the tags already in use.
import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Chip, Field, Input } from "./ds/index.jsx";
import { MAX_TAGS, TAG_LENGTH, cleanTags } from "./search.js";

export default function TagField({ tags = [], suggestions = [], onChange }) {
  const [text, setText] = useState("");
  const full = tags.length >= MAX_TAGS;
  const add = (tag) => {
    if (!tag.trim()) return;
    onChange(cleanTags([...tags, tag]));
    setText("");
  };
  return (
    <div className="rp-tagfield">
      <div className="rp-bound">
        <Field label="Tags">
          <Input
            value={text}
            onChange={setText}
            maxLength={TAG_LENGTH}
            disabled={full}
            placeholder={full ? `Up to ${MAX_TAGS} tags` : "Add a tag"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(text);
              }
            }}
          />
        </Field>
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          disabled={full || !text.trim()}
          onClick={() => add(text)}
        >
          Add tag
        </Button>
      </div>
      <p className="ds-note">
        Find this take by its tags in Takes, or type #tag in search.
      </p>
      {tags.length > 0 && (
        <ul className="rp-tagfield-list" aria-label="Tags on this take">
          {tags.map((t) => (
            <li key={t}>
              <button
                type="button"
                className="rp-tagfield-tag"
                aria-label={`Remove the tag ${t}`}
                onClick={() => onChange(tags.filter((x) => x !== t))}
              >
                {t}
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && !full && (
        <div
          className="rp-tagfield-suggest"
          aria-label="Suggested tags"
          role="group"
        >
          {suggestions.map((s) => (
            <Chip key={s} onClick={() => add(s)}>
              + {s}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
