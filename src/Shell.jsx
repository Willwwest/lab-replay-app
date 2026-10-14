// The member app's coach shell: floating bar, gradient masthead with the
// dot field, the hero with its status and next step, and the toast.
import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, X } from "lucide-react";
import DotField from "./DotField.jsx";
import { Button } from "./ds/index.jsx";
import { initials } from "./format.js";
import { DEMO_COACHES } from "./hooks.js";
import { BASE, MEMBER_APP, asset } from "./paths.js";
import { hasService } from "./service.js";

export function AppBar({ scrolled, nav, roster }) {
  return (
    <header className={`appbar ${scrolled ? "is-scrolled" : ""}`.trim()}>
      <div className="appbar-inner">
        <a className="brand" href={BASE}>
          <img
            src={asset("lab-white.svg")}
            alt="The LAB — Learn. Adapt. Build."
          />
          <span className="rp-brand-name">Replay</span>
        </a>
        <nav className="primary-nav" aria-label="Replay">
          {nav.map((n) => (
            <button
              key={n.id}
              className={n.active ? "nav-item active" : "nav-item"}
              aria-current={n.active ? "page" : undefined}
              onClick={n.go}
            >
              <span className="nav-icon">
                <n.icon size={18} aria-hidden="true" />
              </span>
              <span>{n.label}</span>
              {n.count > 0 && (
                <span
                  className="nav-count"
                  aria-label={n.countLabel ?? `${n.count} waiting`}
                >
                  {n.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="appbar-controls">
          <AccountMenu roster={roster} />
        </div>
      </div>
    </header>
  );
}

function AccountMenu({ roster }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const { account } = roster;

  useEffect(() => {
    if (!open) return;
    const away = (e) => !wrap.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const choose = (phone) => {
    setOpen(false);
    roster.signIn(phone);
  };

  return (
    <div className="rp-account" ref={wrap}>
      <button
        className="chip-select"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={roster.busy}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar">{account ? initials(account.name) : "?"}</span>
        <span className="chip-name">
          {roster.busy
            ? "Connecting…"
            : account
              ? account.name
              : hasService
                ? "Connect roster"
                : "This device"}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="cc-menu" role="menu">
          <span className="eyebrow">
            {!hasService
              ? "Shared features are off in this copy"
              : account
                ? "Switch coach"
                : "Sign in as a demo coach"}
          </span>
          {hasService &&
            DEMO_COACHES.map((c) => (
              <button
                key={c.phone}
                role="menuitemradio"
                aria-checked={account?.name === c.name}
                onClick={() => choose(c.phone)}
              >
                {c.name}
                {account?.name === c.name && <Check size={16} />}
              </button>
            ))}
          <a role="menuitem" href={MEMBER_APP} onClick={() => setOpen(false)}>
            LAB member app <ArrowRight size={16} />
          </a>
          {account && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                roster.signOut();
              }}
            >
              Disconnect roster
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OutlineWords() {
  return (
    <span className="outline-words" aria-hidden="true">
      <span>LEARN</span>
      <span>ADAPT</span>
      <span>BUILD</span>
    </span>
  );
}

export function Masthead({ children }) {
  return (
    <section className="masthead">
      <div className="masthead-art" aria-hidden="true">
        <DotField />
        <OutlineWords />
      </div>
      <div className="masthead-inner">{children}</div>
    </section>
  );
}

// title is [plain, emphasis]: the emphasis renders in sky blue.
export function Hero({ eyebrow, title, lead, aside, actions }) {
  return (
    <div className={`cf-hero ${aside ? "" : "no-aside"}`.trim()}>
      <div className="cf-hero-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>
          {title[0]} <em>{title[1]}</em>
        </h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {aside && <div className="cf-hero-aside">{aside}</div>}
      {actions && <div className="cf-hero-actions">{actions}</div>}
    </div>
  );
}

// The next step for the selected take, as a glass card on the masthead.
export function NextStep({ step, onGo }) {
  return (
    <section className="cf-next" aria-label="Next step">
      <span className="eyebrow">
        {step.complete
          ? "All steps done"
          : `Next · step ${step.done + 1} of ${step.total}`}
      </span>
      <h2>{step.title}</h2>
      <p>{step.lead}</p>
      <Button onClick={onGo}>
        {step.action} <ArrowRight size={18} aria-hidden="true" />
      </Button>
    </section>
  );
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div
      className={`cc-toast ${toast.error ? "error" : ""}`.trim()}
      role={toast.error ? "alert" : "status"}
      key={toast.id}
    >
      <span>{toast.message}</span>
      <button aria-label="Dismiss" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
