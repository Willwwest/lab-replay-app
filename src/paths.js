// Where the app is served from: "/" in development, "/<repo>/" on GitHub
// Pages. Public files are resolved against it.
export const BASE = import.meta.env?.BASE_URL ?? "/";

// A public file by its path ("gym-layout.png" or "/gym-layout.png"). Stored
// paths stay root-relative so saved courses work wherever the app runs.
export const asset = (path) =>
  /^(data:|blob:|https?:)/.test(path)
    ? path
    : `${BASE}${String(path).replace(/^\//, "")}`;

// The LAB member app, for the account menu link.
export const MEMBER_APP =
  import.meta.env?.VITE_MEMBER_APP ?? "http://127.0.0.1:5173/";
