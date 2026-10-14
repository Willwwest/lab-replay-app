// This phone as another camera on someone else's recording: join with the
// host's code, aim, and it films whenever the host phone films, then sends
// its clip back to the host. The camera stays open for the next run.
import React, { useEffect, useRef, useState } from "react";
import { Video, X } from "lucide-react";
import { Button, Field, IconButton, Input, Tag } from "./ds/index.jsx";
import { useCamera } from "./camera.js";
import { keepAwake } from "./cues.js";
import { clock, seconds } from "./format.js";
import { useLayer } from "./route.js";
import { joinAngles, leaveAngles, sendClip, useAngleCamera } from "./angles.js";
import "./capture.css";

const KEY = "replay-angle-camera";
const remembered = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
};

export default function AngleCamera({ connected, onClose }) {
  const [code, setCode] = useState(() => remembered().code ?? "");
  const [label, setLabel] = useState(() => remembered().label ?? "");
  const [camera, setCamera] = useState(() => remembered().camera ?? "");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false); // filming or sending
  const session = useAngleCamera(code, camera);
  const dismiss = useLayer(onClose);
  const joined = !!(camera && session.view?.status === "open");
  const release = useRef(() => {});

  useEffect(() => {
    document.body.style.overflow = "hidden";
    keepAwake().then((r) => (release.current = r));
    return () => {
      document.body.style.overflow = "";
      release.current();
    };
  }, []);

  // A session that ended, or a code the service doesn't know, goes back to
  // the code screen.
  useEffect(() => {
    const closed = session.view?.status === "closed";
    if (camera && (closed || /No camera session/.test(session.error))) {
      forget();
      setError(
        closed
          ? "The host ended camera angles."
          : "That code isn't open any more.",
      );
    }
  }, [session.view?.status, session.error]);

  function forget() {
    setCamera("");
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
  }

  async function join() {
    setJoining(true);
    setError("");
    try {
      const { view, camera: c } = await joinAngles(code, label.trim());
      const next = { code: view.code, label: c.label, camera: c.id };
      setCode(next.code);
      setLabel(next.label);
      setCamera(next.camera);
      try {
        sessionStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
    } catch (e) {
      setError(e.message);
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    if (busy.current && !confirm("Stop filming and leave?")) return;
    if (camera) await leaveAngles(code, camera);
    forget();
    dismiss();
  }

  const host = session.view?.host?.name ?? "the host";
  return (
    <div
      className="rp-cap"
      role="dialog"
      aria-modal="true"
      aria-label="Camera angle"
    >
      <header className="rp-cap-top">
        <IconButton label="Leave camera angles" icon={X} onClick={leave} />
        <span className="rp-cap-kid">
          <span className="avatar" aria-hidden="true">
            <Video size={18} />
          </span>
          <span>
            <b>{joined ? label : "Be a camera angle"}</b>
            <small>
              {joined
                ? `${host}'s session · ${code}`
                : "Film the same run from here"}
            </small>
          </span>
        </span>
        <span />
      </header>

      {joined ? (
        <Filming
          code={code}
          camera={camera}
          session={session}
          host={host}
          busy={busy}
        />
      ) : (
        <div className="rp-angle-join">
          {!connected ? (
            <p className="rp-inline">Camera angles need the team service.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <p className="rp-angle-lead">
                On the host phone, open the camera's settings and choose Add
                camera angles to get a code.
              </p>
              <Field label="Code from the host phone">
                <Input
                  value={code}
                  onChange={(v) => setCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={8}
                  placeholder="ABCDE"
                />
              </Field>
              <Field label="Where this phone is">
                <Input
                  value={label}
                  onChange={setLabel}
                  maxLength={30}
                  placeholder="Wall side"
                />
              </Field>
              {error && (
                <p className="rp-inline is-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={joining || code.trim().length < 4}
              >
                {joining ? "Joining…" : "Join"}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// The camera, following the host: films while its recording runs and
// sends the clip once it stops. A retake on the host sends nothing.
function Filming({ code, camera, session, host, busy }) {
  const hud = useRef(() => ({}));
  const lens = useCamera(true, false, hud);
  const local = useRef(null); // { id, startedAt, sending }
  const last = useRef(""); // the recording this phone last sent a clip of
  const [state, setState] = useState({ phase: "waiting" });
  const [sent, setSent] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const r = session.view?.recording;

  // The host can still retake after this phone sent its clip.
  useEffect(() => {
    if (r?.discarded && r.id === last.current) {
      last.current = "";
      setSent((n) => n - 1);
      setState({
        phase: "waiting",
        note: "The host retook it, so that clip was thrown away.",
      });
    }
  }, [r?.id, r?.discarded]);

  useEffect(() => {
    if (!lens.ready || lens.error) return;
    const mine = local.current;
    if (!mine && r?.live) {
      lens.start();
      local.current = {
        id: r.id,
        startedAt: session.serverNow(),
        sending: false,
      };
      busy.current = true;
      setState({ phase: "recording", member: r.member });
    } else if (mine && !mine.sending && (mine.id !== r?.id || !r.live)) {
      // Stopped, discarded, or replaced by a newer recording.
      finish(mine, mine.id !== r?.id || r.discarded, r?.member);
    }
  }, [r?.id, r?.live, r?.discarded, lens.ready]);

  useEffect(() => {
    if (state.phase !== "recording") return;
    const t = setInterval(
      () => setElapsed((session.serverNow() - local.current.startedAt) / 1000),
      200,
    );
    return () => clearInterval(t);
  }, [state.phase]);

  async function finish(mine, discarded, member) {
    mine.sending = true;
    const blob = await lens.stop(300);
    const duration = (session.serverNow() - mine.startedAt) / 1000;
    try {
      if (discarded || !blob?.size) {
        setState({
          phase: "waiting",
          note: "The host retook it, so nothing was sent.",
        });
        return;
      }
      setState({ phase: "sending" });
      await sendClip(code, {
        camera,
        recording: mine.id,
        startedAt: mine.startedAt,
        duration,
        blob,
      });
      setSent((n) => n + 1);
      last.current = mine.id;
      setState({
        phase: "waiting",
        note: `Sent a ${seconds(duration)} clip${member ? ` of ${member}` : ""} to the host.`,
      });
    } catch (e) {
      setState({ phase: "waiting", note: e.message, error: true });
    } finally {
      local.current = null;
      busy.current = false;
    }
  }

  const status =
    state.phase === "recording"
      ? `Filming${state.member ? ` ${state.member}` : ""} · ${clock(elapsed)}`
      : state.phase === "sending"
        ? "Sending the clip to the host…"
        : (state.note ?? `Ready. Films when ${host} records.`);

  return (
    <>
      <video
        className="rp-cap-live"
        ref={lens.preview}
        autoPlay
        muted
        playsInline
      />
      {!lens.ready && !lens.error && (
        <p className="rp-cap-wait">Opening the camera…</p>
      )}
      <footer className="rp-cap-bottom">
        {lens.error ? (
          <p className="rp-inline is-error" role="alert">
            {lens.error}
          </p>
        ) : (
          <p
            className={`rp-angle-status is-${state.phase}${state.error ? " is-error" : ""}`}
            role="status"
          >
            {state.phase === "recording" && <i aria-hidden="true" />}
            {status}
          </p>
        )}
        {sent > 0 && (
          <p className="rp-cap-note">
            <Tag tone="good">{sent} sent</Tag> Each clip goes to the host phone,
            lined up with its take.
          </p>
        )}
      </footer>
    </>
  );
}
