// The first screen: who's coaching on this device. Remembered until the
// coach switches from the account menu.
import React from "react";
import DotField from "./DotField.jsx";
import { initials } from "./format.js";
import { asset } from "./paths.js";

export default function CoachGate({ coaches, onChoose }) {
  return (
    <main className="rp-gate">
      <div className="masthead-art" aria-hidden="true">
        <DotField />
      </div>
      <div className="rp-gate-inner">
        <img
          className="rp-gate-logo"
          src={asset("lab-replay-white.svg")}
          alt="LAB Replay"
        />
        <h1>Who's coaching?</h1>
        <p>Saved on this device. Switch any time from the menu.</p>
        <ul className="rp-gate-coaches" aria-label="Coaches">
          {coaches.map((c) => (
            <li key={c.id}>
              <button className="rp-gate-coach" onClick={() => onChoose(c)}>
                <span className="avatar" aria-hidden="true">
                  {initials(c.name)}
                </span>
                <b>{c.name}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
