// Picking a kid: who's in the gym first, then everyone, with a search.
// `mode="here"` toggles kids in and out of today's list instead.
import React, { useState } from "react";
import { Check, Search } from "lucide-react";
import { Button, Field, Input, Tag } from "./ds/index.jsx";
import Sheet from "./Sheet.jsx";
import { initials } from "./format.js";

export default function KidPicker({
  members,
  here,
  title = "Who's running?",
  note,
  mode = "pick",
  current,
  allowNone,
  onPick,
  onToggle,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (m) => !q || m.name.toLowerCase().includes(q);
  const inGym = members.filter((m) => here.includes(m.id) && match(m));
  const rest = members.filter((m) => !here.includes(m.id) && match(m));

  const row = (m) => {
    const on = mode === "here" ? here.includes(m.id) : current === m.id;
    return (
      <li key={m.id}>
        <button
          className="rp-kid-row"
          aria-pressed={mode === "here" ? on : undefined}
          aria-current={mode === "pick" && on ? "true" : undefined}
          onClick={() => (mode === "here" ? onToggle(m.id, !on) : onPick(m.id))}
        >
          <span className="avatar" aria-hidden="true">
            {initials(m.name)}
          </span>
          <b>{m.name}</b>
          {mode === "here" ? (
            on ? (
              <Tag tone="good" icon={Check}>
                Here
              </Tag>
            ) : (
              <span className="rp-kid-add">Add</span>
            )
          ) : (
            on && <Tag tone="live">Up</Tag>
          )}
        </button>
      </li>
    );
  };

  return (
    <Sheet
      title={title}
      note={note}
      onClose={onClose}
      footer={
        mode === "here" ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          allowNone && (
            <Button variant="secondary" onClick={() => onPick(null)}>
              No kid · assign later
            </Button>
          )
        )
      }
    >
      <div className="rp-kid-find">
        <Field label="Search the roster" hideLabel>
          <Input
            value={query}
            onChange={setQuery}
            placeholder="Search the roster"
            type="search"
          />
        </Field>
        <Search size={16} aria-hidden="true" />
      </div>
      {inGym.length > 0 && (
        <>
          <span className="ds-field-label">In the gym · {inGym.length}</span>
          <ul className="rp-kids" aria-label="In the gym">
            {inGym.map(row)}
          </ul>
        </>
      )}
      <span className="ds-field-label">
        {mode === "here"
          ? "Everyone"
          : here.length
            ? "Everyone else"
            : "Everyone"}
      </span>
      <ul className="rp-kids" aria-label="Everyone">
        {rest.map(row)}
        {!inGym.length && !rest.length && (
          <li className="ds-note">No one matches “{query}”.</li>
        )}
      </ul>
    </Sheet>
  );
}
