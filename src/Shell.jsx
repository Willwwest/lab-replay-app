// The member app's coach shell: floating bar with pill navigation (an ink
// tab bar on phones), the gradient masthead, a compact page header, and the
// toast.
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  RefreshCw,
  X,
} from "lucide-react";
import DotField from "./DotField.jsx";
import { initials } from "./format.js";
import { BASE, MEMBER_APP, asset } from "./paths.js";
import { hasService } from "./service.js";

export function AppBar({ scrolled, nav, roster }) {
  return (
    <header className={`appbar ${scrolled ? "is-scrolled" : ""}`.trim()}>
      <div className="appbar-inner">
        <a className="brand" href={`${BASE}#/floor`}>
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
  const { coach, shared } = roster;

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

  return (
    <div className="rp-account" ref={wrap}>
      <button
        className="chip-select"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${coach.name} menu`}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(coach.name)}
        </span>
        <span className="chip-name">{coach.name}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="cc-menu" role="menu">
          <span className="eyebrow">Coaching as {coach.name}</span>
          <p className={`rp-account-sync ${shared ? "is-on" : ""}`.trim()}>
            {shared
              ? "Shared with the team: runs, the gym list, boards, messages."
              : hasService
                ? "The team service isn't answering. Work stays on this device."
                : "This copy works on this device only."}
          </p>
          {!shared && hasService && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                roster.retry();
              }}
            >
              <RefreshCw size={16} /> Try the service again
            </button>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              roster.signOut();
            }}
          >
            Switch coach
          </button>
          <a role="menuitem" href={MEMBER_APP} onClick={() => setOpen(false)}>
            LAB member app <ArrowRight size={16} />
          </a>
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

// The full gradient panel with the dot field: the Floor's command area.
export function Masthead({ children, className }) {
  return (
    <section className={`masthead ${className ?? ""}`.trim()}>
      <div className="masthead-art" aria-hidden="true">
        <DotField />
        <OutlineWords />
      </div>
      <div className="masthead-inner">{children}</div>
    </section>
  );
}

// A short header for every other screen: where you are, and a way back.
export function PageHead({
  eyebrow,
  title,
  sub,
  back,
  onBack,
  actions,
  children,
}) {
  return (
    <section className="masthead rp-head">
      <div className="masthead-art" aria-hidden="true" />
      <div className="masthead-inner rp-head-inner">
        {back && (
          <button className="rp-back" onClick={onBack}>
            <ChevronLeft size={18} aria-hidden="true" /> {back}
          </button>
        )}
        <div className="rp-head-row">
          <div className="rp-head-text">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1>{title}</h1>
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="rp-head-actions">{actions}</div>}
        </div>
        {children}
      </div>
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
