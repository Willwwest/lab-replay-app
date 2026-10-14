// LAB design system components. Pages compose these; they don't restyle them.
// Rules live in DESIGN-SYSTEM.md; the style guide renders at ?ds.
import React, { useId } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./tokens.css";
import "./components.css";

const cx = (...c) => c.filter(Boolean).join(" ");

// Small uppercase label above a heading or a value.
export function Eyebrow({ tone = "accent", children }) {
  return (
    <span className={cx("ds-eyebrow", `ds-eyebrow-${tone}`)}>{children}</span>
  );
}

// A titled block of a page: heading, one-line note, actions on the right.
// `toolbar` holds controls that need a full row (filters, a pill row).
export function Section({
  title,
  note,
  actions,
  toolbar,
  children,
  className,
}) {
  return (
    <section className={cx("ds-section", className)}>
      {(title || actions) && (
        <header className="ds-section-head">
          <div>
            {title && <h2 className="ds-h2">{title}</h2>}
            {note && <p className="ds-note">{note}</p>}
          </div>
          {actions && <div className="ds-section-actions">{actions}</div>}
        </header>
      )}
      {toolbar && <div className="ds-section-toolbar">{toolbar}</div>}
      {children}
    </section>
  );
}

// Surfaces: plain white, ink (dark highlight), muted (inset), tint (pastel).
export function Card({
  tone = "plain",
  pad = "lg",
  as: Tag = "div",
  className,
  children,
  ...rest
}) {
  return (
    <Tag
      className={cx("ds-card", `ds-card-${tone}`, `ds-pad-${pad}`, className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Card header: title, optional note, and something on the right.
export function CardHead({ title, note, aside }) {
  return (
    <header className="ds-card-head">
      <div>
        <h3 className="ds-h3">{title}</h3>
        {note && <p className="ds-note">{note}</p>}
      </div>
      {aside}
    </header>
  );
}

// A status or attribute label. Tones: neutral, info, good, warn, bad, care,
// brand, outline, and the tenure tones first, week, month, sixty.
// `color` sets a data color (a shirt tier) for tone="swatch".
export function Tag({ tone = "neutral", icon: Icon, title, color, children }) {
  return (
    <em
      className={cx("ds-tag", `ds-tag-${tone}`)}
      title={title}
      style={color ? { "--tag": color } : undefined}
    >
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </em>
  );
}

// One choice from a few, as pills. Works as a radio group.
export function Segmented({
  label,
  options,
  value,
  onChange,
  size = "md",
  disabled,
}) {
  return (
    <div
      className={cx("ds-seg", `ds-seg-${size}`)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => {
        const v = typeof o === "object" ? o.value : o;
        const l = typeof o === "object" ? o.label : o;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// A labeled control. The label sits above; a hint below.
// The hint is linked as a description, so it isn't read as part of the name.
export function Field({ label, hint, hideLabel, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="ds-field">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "ds-field-label"}>
        {label}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(children, { id, "aria-describedby": hintId })
        : children}
      {hint && (
        <small className="ds-field-hint" id={hintId}>
          {hint}
        </small>
      )}
    </div>
  );
}

export function Select({ value, onChange, options, disabled, id, ...rest }) {
  return (
    <span className="ds-select">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  );
}

export function Input({ value, onChange, id, ...rest }) {
  return (
    <input
      className="ds-input"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function TextArea({ value, onChange, rows = 2, disabled, id, ...rest }) {
  return (
    <textarea
      className="ds-textarea"
      id={id}
      rows={rows}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function IconButton({
  label,
  icon: Icon,
  onClick,
  tone = "plain",
  disabled,
  size = 18,
}) {
  return (
    <button
      type="button"
      className={cx("ds-iconbtn", `ds-iconbtn-${tone}`)}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}

// Buttons map onto the app's pill buttons. Variants: primary (cyan),
// dark (navy), secondary (outline), light (outline on dark).
export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  className,
  children,
  ...rest
}) {
  const v = {
    primary: "cyan",
    dark: "navy",
    secondary: "outline",
    light: "ds-btn-light",
  }[variant];
  return (
    <button
      type="button"
      className={cx("button", v, size === "sm" && "compact", className)}
      {...rest}
    >
      {Icon && <Icon size={18} aria-hidden="true" />}
      {children}
    </button>
  );
}

// Pastel stat tiles in a joined strip, as on the kid app's home screen.
export function StatStrip({ children, cols }) {
  return (
    <div
      className={cx("stat-strip", "ds-statstrip")}
      style={cols ? { "--cols": cols } : undefined}
    >
      {children}
    </div>
  );
}
export function Stat({ tone = "sky", label, value, unit, children }) {
  return (
    <section className={cx("stat-tile", `tile-${tone}`, "ds-stat")}>
      <span className="eyebrow">{label}</span>
      <strong className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </strong>
      {children}
    </section>
  );
}

// A chart's frame: title, note, legend, the chart, then its table view.
export function ChartCard({ title, note, legend, children, table, className }) {
  return (
    <Card as="section" className={cx("ds-chartcard", className)}>
      <CardHead title={title} note={note} aside={legend} />
      <div className="ds-chartcard-body">{children}</div>
      {table}
    </Card>
  );
}

// A coach as a round mark with their initials; role shapes the color.
export function CoachMark({ initials, role, size = 36, title }) {
  return (
    <span
      className={cx("ds-coach", role && `ds-coach-${role}`)}
      style={{ "--mark": `${size}px` }}
      title={title}
    >
      {initials}
    </span>
  );
}

// Several coach marks, overlapping a little: the crew on a block.
export function MarkStack({ marks, size = 30 }) {
  return (
    <span className="ds-coach-stack">
      {marks.map((m) => (
        <CoachMark
          key={m.id ?? m.initials}
          initials={m.initials}
          role={m.role}
          size={size}
          title={m.title}
        />
      ))}
    </span>
  );
}

// An on/off setting that takes effect right away.
export function Switch({ checked, onChange, label, note, disabled }) {
  return (
    <label className="ds-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ds-switch-track" aria-hidden="true" />
      <span className="ds-switch-text">
        <b>{label}</b>
        {note && <small>{note}</small>}
      </span>
    </label>
  );
}

// Appears when a form has unsaved changes. One save for everything on it.
export function SaveBar({
  show,
  message = "Unsaved changes",
  onSave,
  onDiscard,
  saveLabel = "Save",
}) {
  if (!show) return null;
  return (
    <div className="ds-savebar" role="region" aria-label="Unsaved changes">
      <span>{message}</span>
      <div>
        <Button variant="light" size="sm" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="ds-empty">
      {Icon && <Icon size={28} aria-hidden="true" />}
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

// A toggle pill for picking several from a list.
export function Chip({ on, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className="ds-chip"
      aria-pressed={!!on}
      disabled={disabled}
      onClick={onClick}
    >
      {on && <Check size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}
