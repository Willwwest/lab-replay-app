// The design tokens for code that can't read CSS variables (ECharts).
// Mirrors ds/tokens.css; ds.test.js fails if a value here drifts from it.
export const color = {
  ink: "#090d19",
  navy: "#0f0e54",
  royal: "#1557be",
  cyan: "#22bced",
  cyanInk: "#0b86b5",
  sky: "#a1e2f7",
  mint: "#c2e6db",
  skyPale: "#e1f4fa",
  white: "#ffffff",
  gray100: "#e6eaf3",
  gray300: "#c9d1e3",
  gray500: "#767b96",
  gray700: "#464b66",
  gray900: "#13162a",
  textOnInk2: "#bfd2ee",
};

export const data = {
  series: ["#1557be", "#22bced"],
  muted: "#c9d1e3",
  goal: "#2fb28b",
  goalInk: "#0e5a44",
  alert: "#c2410c",
  seq: ["#e3f6fd", "#b4e7f8", "#6fd0f1", "#22aee0", "#0b86b5", "#075c80"],
};

// The floor board (TV) and its 3D scene.
export const zone = {
  class: "#f2b01e",
  open: "#3fe0ae",
  paused: "#ff5a4e",
  closed: "#464b66",
  amenity: "#8ea3c9",
};

export const scene = {
  void: "#04060d",
  floor: "#121a30",
  wall: "#0b1020",
  turf: "#b9c0cd",
  red: "#c8243a",
  blue: "#2147b8",
  truss: "#d5dae3",
  wood: "#c99a5b",
  black: "#23262f",
  white: "#f2f4f8",
  screen: "#22bced",
};

// "r,g,b" and "rgba(r,g,b,a)" from a token, for canvas and SVG attributes
// that can't read CSS variables.
export const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16},${(n >> 8) & 255},${n & 255}`;
};
export const alpha = (hex, a) => `rgba(${rgb(hex)},${a})`;

export const font = {
  body: "'Work Sans', Arial, sans-serif",
};

// CSS name for each value above, for the drift test.
export const cssNames = {
  "color.ink": "--ds-ink",
  "color.navy": "--ds-navy",
  "color.royal": "--ds-royal",
  "color.cyan": "--ds-cyan",
  "color.cyanInk": "--ds-cyan-ink",
  "color.sky": "--ds-sky",
  "color.mint": "--ds-mint",
  "color.skyPale": "--ds-sky-pale",
  "color.white": "--ds-white",
  "color.gray100": "--ds-gray-100",
  "color.gray300": "--ds-gray-300",
  "color.gray500": "--ds-gray-500",
  "color.gray700": "--ds-gray-700",
  "color.gray900": "--ds-gray-900",
  "color.textOnInk2": "--ds-text-on-ink-2",
  "data.series.0": "--ds-data-1",
  "data.series.1": "--ds-data-2",
  "data.muted": "--ds-data-muted",
  "data.goal": "--ds-data-goal",
  "data.goalInk": "--ds-good",
  "data.alert": "--ds-data-alert",
  "data.seq.0": "--ds-seq-1",
  "data.seq.1": "--ds-seq-2",
  "data.seq.2": "--ds-seq-3",
  "data.seq.3": "--ds-seq-4",
  "data.seq.4": "--ds-seq-5",
  "data.seq.5": "--ds-seq-6",
  ...Object.fromEntries(
    Object.keys(zone).map((k) => [`zone.${k}`, `--ds-zone-${k}`]),
  ),
  ...Object.fromEntries(
    Object.keys(scene).map((k) => [`scene.${k}`, `--ds-scene-${k}`]),
  ),
};
