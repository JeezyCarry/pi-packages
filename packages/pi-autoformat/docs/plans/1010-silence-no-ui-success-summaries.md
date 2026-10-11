---
issue: 1010
issue_title: "[pi-autoformat] console.log fallback paints over fullscreen TUI (in-process subagent sessions) and pollutes stdout in `pi -p`"
---

# Silence no-UI success summaries

## Release Recommendation

**Release:** ship independently

`@gotgenes/pi-autoformat` has no `docs/architecture/` roadmap, so this issue belongs to no release batch.
It is a self-contained, non-breaking `fix:` in one package (the operator classified it as non-breaking during planning), so it cuts a patch release on its own at ship time.

## Problem Statement

In a fullscreen interactive TUI session, in-process subagent workers that edit formattable files cause stray `[pi-autoformat] Autoformatted N file(s): …` lines to appear painted over the parent's input editor.
Two such lines can land on the same screen row, so two file paths render as one merged line.
The parent session itself shows no toast for these flushes.

Third-party report by @code-lixm, with a suggested patch (drop the info-level `console.log` fallback, keep `console.warn`).

### Verified mechanism

- Pi gives an in-process child session a no-op UI.
  Our own `pi-subagents` binds children with `session.bindExtensions({})` (`packages/pi-subagents/src/lifecycle/create-subagent-session.ts:298`), and Pi's runner substitutes `noOpUIContext` when no UI context is bound (`../pi/packages/coding-agent/src/core/extensions/runner.ts:565`, `hasUI()` at `:620`).
  So `ctx.hasUI === false` and `ctx.mode === "print"` in every child, whichever subagent extension spawned it; this repo's own setup is affected, not only `@tintinweb/pi-subagents`.
- `reportMessage()` (`src/extension.ts:272`) falls back to `console.log` for info and `console.warn` for warnings when `hasUI` is false.
  Interactive mode does not take over stdout (`main.ts`: `shouldTakeOverStdout = appMode !== "interactive" && …`), so a child's writes go straight to the TTY the parent TUI owns, and the differential renderer never repaints that row.
- The only `"info"` caller of `reportMessage` is the tail of `defaultReportFlushResult` (`src/extension.ts:583-587`), which runs on every successful flush in a no-UI context, so it fires once per child turn that formats a file.

### The `pi -p` stdout claim does not hold

The issue's title also claims the fallback pollutes stdout under `pi -p`.
It does not: Pi calls `takeOverStdout()` for every non-interactive mode (`core/output-guard.ts`), which reroutes `process.stdout.write` to stderr.
Measured during planning with a probe extension that `console.log`s and `console.warn`s on `session_start`, run as `pi -p --no-tools --no-extensions --no-session -e ./ext.ts` under the installed Pi 1.0.0: stdout was empty, and stderr carried both `PROBE-LOG hasUI=false mode=print` and `PROBE-WARN`.
The pinned dev dependency (0.79.1) has the same `takeOverStdout()` call in `dist/main.js:400`.
Under `pi -p` the info line is stderr noise, not stdout pollution.

## Goals

- In a no-UI context (in-process child sessions, `pi -p`, `pi --mode json`), a successful flush writes nothing to the console.
- Formatter failures and config issues keep their `console.warn` fallback unchanged.
- The interactive TUI and RPC paths (`hasUI === true`) are unchanged.
- The dead code the removal leaves behind (the legacy success-message builder and its helpers) goes in the same change.
- README and `docs/configuration.md` describe the new no-UI behavior.
- Non-breaking: the operator classified the removed lines as diagnostic logging rather than a contract, so this ships as `fix(pi-autoformat):`.

## Non-Goals

- **Failure and config-issue warnings from child sessions.**
  These still go through `console.warn` and can still paint over a parent TUI.
  The operator accepted this residual when choosing the reporter's patch over silencing all no-UI output: those warnings are rare (a formatter failure, or an invalid config), and silencing them would also drop the only signal `pi -p` users get for config issues.
  The child agent still receives formatter failures through the `autoformat-steering` message (`buildSteeringMessageContent`), which is unchanged.
- **Distinguishing a child session from `pi -p`.**
  Both report `hasUI === false` and `mode === "print"`; telling them apart would mean reading Pi internals (whether stdout is taken over), and the operator did not choose that direction.
- **A config switch for no-UI summaries.**
  The issue offered it as an alternative; it adds a mechanism for output nobody asked to keep.
- **The steering message (`pi.sendMessage` on `turn_end`).**
  It goes to the agent via the session, not the console, and is unaffected.

## Background

- `src/extension.ts:reportMessage` routes a message to `ctx.ui.notify` when `hasUI`, else to `console.warn` (warning/error) or `console.log` (info).
  Callers: `defaultReportFlushResult` failure branch (`"warning"`), its success tail (`"info"`, the only info caller), `defaultReportConfigIssues` (`"warning"`), and `queueFlush`'s runtime-error catch (`"warning"`).
- `defaultReportFlushResult` returns early on every `hasUI` success branch (`hideSummariesInTui`, then `setStatus`), so the success tail at `:583-587` only runs with `hasUI === false`.
- `buildLegacySuccessMessage` (`:534`) is called only from that tail.
  It is the only caller of `summarizeSuccessPaths` (`:358`) and the only reader of `FlushSummary.fallbackUsages` (`:372`), which `summarizeFallbackUsages` (`:334`) exists to fill.
  `collectAllFiles` (`:350`) stays live: `summarizeFlush` uses it at `:381`.
- `test/extension.test.ts` has three no-UI tests: success (`:917`, asserts `console.log` is called with the Autoformatted line), failures (`:965`, `console.warn`, asserts `log` not called), and config issues (`:1019`, `console.warn`).
- The acceptance suites run Pi in RPC mode (`hasUI === true`) and assert no console output; `grep -rn "Autoformatted\|console" test/acceptance*.ts test/fallback-acceptance.test.ts` returned nothing.

## Design Overview

Delete the no-UI success report at its source rather than muting it inside `reportMessage`.
With the only info caller gone, `reportMessage` no longer needs an info branch, so `NotificationType` narrows to `"warning" | "error"` and the no-UI branch becomes a single `console.warn`.

`defaultReportFlushResult` after the change:

```ts
if (result.groups.length === 0) { setAutoformatStatus(ctx, undefined); return; }
const summary = summarizeFlush(result, config);
if (summary.failureBatchCount > 0) { /* unchanged: setStatus if hasUI, reportMessage(..., "warning") */ return; }
// A successful flush is reported only in a UI. Without one, a console write lands on
// whatever owns the terminal, which for an in-process child session is the parent's TUI.
if (!ctx.hasUI) return;
if (config.hideSummariesInTui) { setAutoformatStatus(ctx, undefined); return; }
setAutoformatStatus(ctx, formatStatusLine(summary, ctx));
```

`reportMessage` after the narrowing:

```ts
type NotificationType = "warning" | "error";

function reportMessage(ctx, message, type: NotificationType): void {
  if (ctx.hasUI) { ctx.ui.notify(message, type); return; }
  console.warn(`[${AUTOFORMAT_EXTENSION_ID}] ${message}`);
}
```

`ctx.ui.notify` accepts `"info" | "warning" | "error"`, so a narrower argument type still type-checks.

What each no-UI scenario does after the change (interactive TUI and RPC are unchanged):

| Scenario                                  | Before                  | After             |
| ----------------------------------------- | ----------------------- | ----------------- |
| Child session, successful flush           | `console.log` over TUI  | silent            |
| Child session, formatter failure          | `console.warn` over TUI | unchanged         |
| Child session, config issue               | `console.warn` over TUI | unchanged         |
| `pi -p`, successful flush                 | stderr info line        | silent            |
| `pi -p`, formatter failure / config issue | stderr warning          | unchanged         |

The no-UI success message's fallback annotation (`[prettier (fallback after biome unavailable)]`) goes with it.
The interactive status line still renders fallback context through `formatterLabels`, pinned by `test/extension.test.ts:485`.

## Module-Level Changes

- `packages/pi-autoformat/src/extension.ts`
  - `defaultReportFlushResult`: replace the `hasUI`-success branches and the `"info"` tail with the early `if (!ctx.hasUI) return;` shape above.
  - Remove `buildLegacySuccessMessage`, `summarizeSuccessPaths`, `summarizeFallbackUsages`, and `FlushSummary.fallbackUsages` (field, assignment in `summarizeFlush`).
  - Step 2: narrow `NotificationType` to `"warning" | "error"`; collapse `reportMessage`'s no-UI branch to one `console.warn`.
- `packages/pi-autoformat/test/extension.test.ts`
  - `:917` "keeps non-interactive success summaries on console.log without setStatus" is renamed (e.g. "stays silent on non-interactive success") and asserts `console.log` and `console.warn` are not called and `setStatus` is not called.
  - `:965` and `:1019` are predicted unchanged: they assert the `console.warn` text, which neither step alters.
  - `:485` (fallback context in the status line) is predicted unchanged: it reads `setStatus` text built from `formatterLabels`, not `fallbackUsages`.
- `packages/pi-autoformat/README.md` `## Reporting` (`:118`): "Outside the TUI, summaries are written as prefixed log lines on `stdout` / `stderr`." becomes a statement that outside a UI only failures and config issues are written, as prefixed `stderr` warnings, and success is silent.
- `packages/pi-autoformat/docs/configuration.md:252` (`hideSummariesInTui`): "summaries go to `console.log` / `console.warn` as before" becomes: success summaries are not written, failures still go to `console.warn`.
  `:240` ("non-interactive log output (via `console.warn`)") stays accurate and is predicted unchanged.
- Predicted unchanged: `.pi/skills/package-pi-autoformat/SKILL.md` (it does not mention the console fallback; checked by grep for `console`, `stdout`, `Autoformatted`), `schemas/pi-autoformat.schema.json` (no config change), the acceptance suites (RPC mode, `hasUI === true`).
  There is no `docs/architecture/` directory for this package.

## Test Impact Analysis

1. No new seam is extracted; the change deletes a branch, so it enables no new unit tests.
2. The `:917` test's assertion flips from "logs the Autoformatted line" to "writes nothing"; no other test becomes redundant.
3. `:965` (failure warnings) and `:1019` (config-issue warnings) stay as they are: they pin the half of the no-UI fallback this change keeps, and step 2's `reportMessage` collapse must leave them green.

## Invariants at risk

- **Failures still surface without a UI.**
  Pinned by `test/extension.test.ts:965`, which drives the real `defaultReportFlushResult` (only the autoformatter and config loader are stubbed) and asserts the exact `console.warn` text.
- **Config issues still surface without a UI.**
  Pinned by `:1019`, which drives the real `defaultReportConfigIssues`.
- **The interactive success status line and its fallback context are unchanged.**
  Pinned by `:485` and the surrounding `hasUI` status-line tests.
- **`hideSummariesInTui` still clears the status on success in a UI.**
  Pinned by the `hideSummariesInTui` tests in `test/extension.test.ts` (the success case near `:847`, and `:864` for failures); the reordered branch must keep them green.

## TDD Order

1. **Red → green: silence the no-UI success summary and remove its dead builder.**
   - Test: rewrite `test/extension.test.ts:917` to assert, after `session_start` + `agent_end` with `hasUI: false` and a successful flush, that `console.log`, `console.warn`, and `setStatus` were not called.
     Red against current code (`console.log` is called with `[pi-autoformat] Autoformatted 1 file: /repo/a.ts`).
   - Green: restructure `defaultReportFlushResult` to the shape in Design Overview; delete `buildLegacySuccessMessage`, `summarizeSuccessPaths`, `summarizeFallbackUsages`, and `FlushSummary.fallbackUsages`.
   - Verify: `pnpm --filter @gotgenes/pi-autoformat run test`, `pnpm run check`, `pnpm run lint`, `pnpm fallow dead-code` (no newly dead symbol in `src/extension.ts`).
   - Killing mutation: add `reportMessage(options.ctx, "Autoformatted", "info");` immediately before the new `if (!options.ctx.hasUI) return;`; the rewritten `:917` test must go red on its `console.log` assertion.
     Deleting the `if (!options.ctx.hasUI) return;` line is expected to leave the test green: `setAutoformatStatus` already no-ops without a UI, so the early return is for clarity, not correctness.
   - Commit: `fix(pi-autoformat): stop writing success summaries to the console without a UI`, body explaining that in-process child sessions have no UI and their console output paints over the parent TUI, with the trailer `Co-authored-by: JoyceWil <42863578+code-lixm@users.noreply.github.com>` (the reporter's patch supplied the mechanism).
2. **Refactor: narrow `NotificationType` and collapse `reportMessage`.**
   - Change `NotificationType` to `"warning" | "error"`; make the no-UI branch an unconditional `console.warn`.
   - No new tests: `:965` and `:1019` pin the kept `console.warn` output and must stay green; `tsc` proves no `"info"` caller remains.
   - Verify: same commands as step 1.
   - Commit: `refactor(pi-autoformat): narrow reportMessage to warnings and errors`.
3. **Docs: describe the no-UI reporting behavior.**
   - Update `README.md` `## Reporting` and `docs/configuration.md` `hideSummariesInTui` as listed in Module-Level Changes.
   - Verify: `pnpm exec rumdl check packages/pi-autoformat/README.md packages/pi-autoformat/docs/configuration.md`; `grep -rn "console.log" packages/pi-autoformat/README.md packages/pi-autoformat/docs/configuration.md` returns nothing.
   - Commit: `docs(pi-autoformat): document silent success outside a UI`.

## Risks and Mitigations

- **A `pi -p` user relied on the stderr success line** (e.g. scripting on it).
  The operator classified this as non-breaking; the docs change in step 3 states the new behavior, and the CHANGELOG entry from step 1's `fix:` subject names it.
- **Reordering `defaultReportFlushResult`'s branches regresses `hideSummariesInTui` or the status line.**
  The early `!hasUI` return sits after the failure branch and before the `hideSummariesInTui` branch, so every `hasUI` path runs the same statements as today; the existing status-line and `hideSummariesInTui` tests pin it.
- **Child-session warnings still paint over the TUI.**
  This residual is accepted in Non-Goals; it is rare compared with the per-turn success line this change removes.

## Open Questions

None.
