"use client";

import { useState } from "react";

import { FUN_UI_CHANGE_EVENT, FUN_UI_STORAGE_KEY, resolveInitialFunUi, type FunUiPreference } from "./fun-ui";

/** The fun-UI switch, on the My Settings page (src/app/settings/page.tsx). Swaps
 *  Jarvis's plain "✦" glyph for the traced mascot character everywhere Jarvis
 *  appears (docked launcher, chat panel header, dashboard greeting) — nothing else
 *  about the app changes, so this is safe to flip on and off at will. */
export function FunUiToggle() {
  const [funUi, setFunUi] = useState<FunUiPreference>(() => {
    if (typeof window === "undefined") return "off";
    return resolveInitialFunUi(localStorage.getItem(FUN_UI_STORAGE_KEY));
  });

  function setFunUiPreference(next: FunUiPreference) {
    setFunUi(next);
    localStorage.setItem(FUN_UI_STORAGE_KEY, next);
    document.documentElement.setAttribute("data-fun-ui", next);
    window.dispatchEvent(new Event(FUN_UI_CHANGE_EVENT));
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--bt-text)]">Jarvis mascot</p>
        <p className="text-xs text-[var(--bt-muted)]">Show Jarvis as your custom character instead of the plain ✦ icon.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={funUi === "on"}
        onClick={() => setFunUiPreference(funUi === "on" ? "off" : "on")}
        className="relative h-6 w-11 shrink-0 rounded-full transition"
        style={{ background: funUi === "on" ? "var(--bt-primary)" : "var(--bt-border)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: funUi === "on" ? "1.375rem" : "0.125rem" }}
        />
      </button>
    </div>
  );
}
