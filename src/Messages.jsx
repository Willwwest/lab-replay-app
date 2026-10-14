// Messages with families: one thread per kid. Coaches can attach a shared
// run, and families reply from the LAB app. Threads refresh every few
// seconds while open.
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MessageSquare,
  Paperclip,
  Send,
  Timer,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  IconButton,
  Section,
  Select,
  Tag,
  TextArea,
} from "./ds/index.jsx";
import { api } from "./service.js";
import { day, seconds } from "./format.js";
import { ENDINGS } from "./runs.js";
import "./messages.css";

const LIST_POLL = 5000;
const THREAD_POLL = 3000;

const when = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : day(iso);
};

// The thread list and the unread total, for the nav badge too.
export function useThreads(connected) {
  const [threads, setThreads] = useState([]);
  const load = useRef(() => {});
  useEffect(() => {
    if (!connected) return setThreads([]);
    let live = true;
    load.current = () =>
      api("/threads")
        .then((t) => live && setThreads(t))
        .catch(() => {});
    load.current();
    const t = setInterval(() => load.current(), LIST_POLL);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [connected]);
  return {
    threads,
    unread: threads.reduce((n, t) => n + t.unread, 0),
    refresh: () => load.current(),
  };
}

export function RunCard({ run }) {
  return (
    <div className="rp-msg-run">
      <Timer size={18} aria-hidden="true" />
      <div>
        <b>
          {run.course} · {seconds(run.seconds)}
        </b>
        <small>
          {day(run.at)} · {run.passed} of {run.obstacles} passed
        </small>
      </div>
      <Tag tone={run.completed ? "good" : "neutral"}>
        {run.completed ? "Clean" : (ENDINGS[run.ended] ?? "Not clean")}
      </Tag>
    </div>
  );
}

function Thread({ memberId, draftRun, onBack, onSent, onError }) {
  const [thread, setThread] = useState(null);
  const [text, setText] = useState("");
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(draftRun ?? "");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const count = thread?.messages.length ?? 0;

  useEffect(() => {
    let live = true;
    const load = () =>
      api(`/threads/${memberId}`)
        .then((t) => live && setThread(t))
        .catch((e) => live && onError(e.message));
    load();
    api(`/runs?member=${memberId}`)
      .then((r) => live && setRuns(r))
      .catch(() => {});
    const t = setInterval(load, THREAD_POLL);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [memberId]);
  useEffect(() => setRunId(draftRun ?? ""), [draftRun, memberId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  async function send() {
    setBusy(true);
    try {
      const message = await api(`/threads/${memberId}`, {
        method: "POST",
        body: JSON.stringify({ text, runId: runId || undefined }),
      });
      setThread((t) => ({ ...t, messages: [...t.messages, message] }));
      setText("");
      setRunId("");
      onSent();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this message for everyone?")) return;
    try {
      await api(`/threads/${memberId}/${id}`, { method: "DELETE" });
      setThread((t) => ({
        ...t,
        messages: t.messages.filter((m) => m.id !== id),
      }));
    } catch (e) {
      onError(e.message);
    }
  }

  const attached = runs.find((r) => r.id === runId);
  // Under the latest coach message: whether the family has opened it.
  const lastCoach = thread?.messages.findLast((m) => m.author.kind === "staff");
  const seen =
    lastCoach &&
    thread.familySeenAt &&
    thread.familySeenAt >= lastCoach.createdAt;
  return (
    <Card as="section" className="rp-thread" aria-label="Conversation">
      <header className="rp-thread-head">
        <IconButton
          label="Back to conversations"
          icon={ArrowLeft}
          onClick={onBack}
        />
        <CardHead
          title={thread?.name ?? "…"}
          note="Coaches and this member's family. Families reply in the LAB app."
        />
      </header>
      <ol className="rp-msgs" aria-label="Messages">
        {thread?.messages.length === 0 && (
          <li className="rp-msgs-empty">
            <Empty icon={MessageSquare} title="No messages yet">
              Say what went well, or attach a run.
            </Empty>
          </li>
        )}
        {thread?.messages.map((m) => {
          const coach = m.author.kind === "staff";
          return (
            <li key={m.id} className={coach ? "is-coach" : "is-family"}>
              <div className="rp-msg">
                <span className="rp-msg-who">
                  {m.author.name} · {when(m.createdAt)}
                </span>
                {m.text && <p>{m.text}</p>}
                {m.run && <RunCard run={m.run} />}
                {m === lastCoach && (
                  <small
                    className={`rp-msg-seen ${seen ? "is-seen" : ""}`.trim()}
                  >
                    {seen
                      ? `Seen by the family · ${when(thread.familySeenAt)}`
                      : "Not seen by the family yet"}
                  </small>
                )}
              </div>
              {coach && (
                <IconButton
                  label="Delete message"
                  icon={Trash2}
                  tone="danger"
                  size={16}
                  onClick={() => remove(m.id)}
                />
              )}
            </li>
          );
        })}
        <li ref={end} aria-hidden="true" />
      </ol>
      <div className="rp-compose">
        <Field label="Message">
          <TextArea
            rows={3}
            value={text}
            maxLength={2000}
            placeholder={`Write to ${thread?.name.split(" ")[0] ?? "the"}'s family`}
            onChange={setText}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy)
                send();
            }}
          />
        </Field>
        <div className="rp-compose-foot">
          {runs.length > 0 && (
            <div className="rp-compose-attach">
              <Field label="Attach a run">
                <Select
                  value={runId}
                  onChange={setRunId}
                  options={[
                    { value: "", label: "No run" },
                    ...runs.map((r) => ({
                      value: r.id,
                      label: `${r.course} · ${seconds(r.seconds)} · ${day(r.createdAt)}`,
                    })),
                  ]}
                />
              </Field>
            </div>
          )}
          <Button
            variant="dark"
            icon={Send}
            disabled={busy || (!text.trim() && !runId)}
            onClick={send}
          >
            Send
          </Button>
        </div>
        {attached && (
          <div className="rp-compose-preview">
            <Paperclip size={16} aria-hidden="true" />
            <RunCard
              run={{
                ...attached,
                at: attached.createdAt,
                passed: attached.obstacles.filter((o) => o.result === "pass")
                  .length,
                obstacles: attached.obstacles.length,
              }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Messages({
  connected,
  members,
  threads,
  open,
  onOpen,
  onSent,
  onError,
}) {
  const [pick, setPick] = useState("");
  if (!connected)
    return (
      <Section title="Messages" note="Talk with families about their kid.">
        <Card>
          <Empty
            icon={MessageSquare}
            title="Connect the roster to message families"
          >
            Use the account menu at the top right.
          </Empty>
        </Card>
      </Section>
    );
  const withThread = new Set(threads.map((t) => t.memberId));
  return (
    <Section
      title="Messages"
      note="One conversation per member, with their family. Families read and reply in the LAB app."
    >
      <div className={`rp-messages ${open ? "is-open" : ""}`.trim()}>
        <Card as="section" className="rp-threads" aria-label="Conversations">
          <div className="rp-threads-new">
            <Field label="Message a family">
              <Select
                value={pick}
                onChange={(id) => {
                  setPick("");
                  if (id) onOpen(id);
                }}
                options={[
                  { value: "", label: "Choose a member" },
                  ...members
                    .filter((m) => !withThread.has(m.id))
                    .map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            </Field>
          </div>
          {threads.length === 0 ? (
            <Empty icon={MessageSquare} title="No conversations yet">
              Pick a member above to start one.
            </Empty>
          ) : (
            <ul className="rp-threads-list">
              {threads.map((t) => (
                <li key={t.memberId}>
                  <button
                    className="rp-thread-row"
                    aria-current={open?.memberId === t.memberId || undefined}
                    onClick={() => onOpen(t.memberId)}
                  >
                    <span className="avatar" aria-hidden="true">
                      {t.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <span className="rp-thread-row-text">
                      <b>{t.name}</b>
                      <small>
                        {t.last
                          ? `${t.last.author.kind === "staff" ? "" : `${t.last.author.name}: `}${t.last.text || "Shared a run"}`
                          : "No messages yet"}
                      </small>
                    </span>
                    <span className="rp-thread-row-meta">
                      {t.last && <small>{when(t.last.createdAt)}</small>}
                      {t.unread > 0 && <Tag tone="live">{t.unread} new</Tag>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {open ? (
          <Thread
            key={open.memberId}
            memberId={open.memberId}
            draftRun={open.runId}
            onBack={() => onOpen(null)}
            onSent={onSent}
            onError={onError}
          />
        ) : (
          <Card className="rp-thread-none">
            <Empty icon={MessageSquare} title="Choose a conversation">
              Messages and shared runs show here.
            </Empty>
          </Card>
        )}
      </div>
    </Section>
  );
}
