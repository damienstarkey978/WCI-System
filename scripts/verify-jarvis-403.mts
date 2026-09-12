/**
 * Isolates why Jarvis's Anthropic call returns "403 status code (no body)" while a
 * plain, non-tool-runner call on the same API key succeeds (bill OCR's call worked
 * on this exact production account).
 *
 * Update (2026-09-12, from production Netlify logs): this 403 is now confirmed NOT
 * the same thing as the earlier "Jarvis hangs forever" bug — it fires in ~1.8s, a
 * fast direct rejection from Anthropic, not a killed/timed-out connection. A fast
 * 403 with no body most often means an account/key/permission problem rather than
 * something about the request shape — check the ANTHROPIC_API_KEY actually
 * configured for this Netlify function first (valid, not rotated/revoked, has
 * access to claude-opus-5 and to the beta tool-use feature) before assuming it's
 * code. This script still isolates the code-path angle in case it turns out to be
 * request-shape-dependent after all — the closest thing to Jarvis's actual failing
 * call: a toolRunner run with many tool schemas AND a vision (image) content block,
 * in addition to the simpler checks below. Whichever call is the FIRST to fail
 * narrows it down; if ALL of them fail identically, that itself is strong evidence
 * it's the API key/account, not the request.
 *
 * The same five checks (src/lib/jarvis/diagnostics.ts's runJarvis403Isolation) also
 * run from the app itself at /admin/diagnostics — that version runs inside the
 * actual deployed server process against production's real configured key, which is
 * a stronger test than this script gets from a checked-out repo's own .env file, and
 * needs no terminal.
 */
import { runJarvis403Isolation } from "@/lib/jarvis/diagnostics";

function report(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
}

const results = await runJarvis403Isolation();
for (const result of results) report(result.label, result.ok, result.detail);

console.log("\nWhichever of these is the FIRST to fail is where the 403 actually comes from.");
console.log("If ALL five fail with the identical status/type/body, that points at the API key or account, not the request shape.");
