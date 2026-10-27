/**
 * Shown when the Handy / Jarvis surface should be visible but cannot draft yet
 * (UI flag off, or ANTHROPIC_API_KEY missing). Prefer this over hiding the whole
 * panel so staff never land on a blank manual-only Proposals tab and wonder
 * where notes → estimate → proposal went.
 */

export function JarvisSetupNotice({
  uiEnabled,
  anthropicConfigured,
  title = "Draft with Jarvis (Handy-style)",
  hint = "Paste scope notes and photos here to draft a cost-coded estimate and client-facing proposal. Everything stays DRAFT until you review and send.",
}: {
  readonly uiEnabled: boolean;
  readonly anthropicConfigured: boolean;
  readonly title?: string;
  readonly hint?: string;
}) {
  const missing: string[] = [];
  if (!uiEnabled) missing.push("NEXT_PUBLIC_JARVIS_UI_ENABLED=true (rebuild required for production)");
  if (!anthropicConfigured) missing.push("ANTHROPIC_API_KEY");

  return (
    <div
      className="flex min-h-[16rem] flex-col justify-center gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4 sm:min-h-[20rem] sm:p-5"
      style={{ borderColor: "var(--bt-border)" }}
      role="status"
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--bt-text)]">
        <span aria-hidden>✦</span> {title}
      </div>
      <p className="text-sm text-[var(--bt-muted)]">{hint}</p>
      <div
        className="rounded-lg border px-3 py-2.5 text-sm"
        style={{
          borderColor: "color-mix(in srgb, var(--bt-warning, #b45309) 35%, transparent)",
          background: "color-mix(in srgb, var(--bt-warning, #b45309) 10%, transparent)",
          color: "var(--bt-text)",
        }}
      >
        <p className="font-medium">Jarvis is not ready to draft yet.</p>
        <p className="mt-1 text-xs text-[var(--bt-muted)]">
          Set these in the environment, then restart or redeploy:
        </p>
        <ul className="mt-1.5 list-inside list-disc text-xs text-[var(--bt-muted)]">
          {missing.map((item) => (
            <li key={item}>
              <code className="rounded bg-black/5 px-1 py-0.5 text-[11px]">{item}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
