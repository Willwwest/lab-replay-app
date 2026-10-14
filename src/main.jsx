import React from "react";
import { createRoot } from "react-dom/client";
// The shell's base rules come before the ds components that refine them.
import "./ds/tokens.css";
import "./shell.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
