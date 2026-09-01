"use client";

import { useEffect, useState } from "react";

import { FUN_UI_CHANGE_EVENT } from "@/components/settings/fun-ui";

/** Reads the data-fun-ui attribute FunUiScript.tsx sets on <html> before paint, and
 *  re-reads it when FunUiToggle.tsx flips it live. Starts `false` on the server and
 *  the very first client render (matching FunUiScript's default of "off" when
 *  nothing is stored yet) so hydration never mismatches; if the user has it turned
 *  on, this flips true one effect-tick after mount. */
export function useFunUi(): boolean {
  const [funUi, setFunUi] = useState(false);

  useEffect(() => {
    const read = () => setFunUi(document.documentElement.getAttribute("data-fun-ui") === "on");
    read();
    window.addEventListener(FUN_UI_CHANGE_EVENT, read);
    return () => window.removeEventListener(FUN_UI_CHANGE_EVENT, read);
  }, []);

  return funUi;
}
