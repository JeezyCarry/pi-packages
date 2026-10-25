---
issue: 1086
issue_title: "pi-subagents: /subagents:sessions labels a reloaded resume stopped while queued with its queue time"
---

# Retro: #1086 — pi-subagents: /subagents:sessions labels a reloaded resume stopped while queued with its queue time

## Stage: Planning (2026-10-24T23:47:22Z)

### Session summary

Verified both halves of the defect in the source: `toPersistedRecord` copies no `stoppedWhileQueued`, and the persisted loop in `listNavigableAgents` hard-codes `stoppedWhileQueued: false`; the writer path runs `Subagent.stopQueued()` → `onRunFinished` → `SubagentEventsObserver.persistAndNotify`.
The plan is one `fix(pi-subagents):` step (writer, tolerant reader, and navigator call site together) plus the roadmap landing.
The roadmap step is `Release: independent`, so the plan ships independently.

### Observations

- No `ask_user` gate: the issue is the operator's own and its proposed change is unambiguous; the change is non-breaking (additive internal entry field, absent reads `false`, an older reader ignores the key).
- Decided without a gate: a non-boolean `stoppedWhileQueued` skips the entry, matching the file's `completedAt`/`outputFile` guard convention; the writer always writes the field, `false` included.
- Considered and rejected: a `refactor:` step for the writer/reader contract ahead of the `fix:`.
  The Tidy-First assessor noted that it changes the persisted entry shape, so it is not a pure refactor, and writing a field nothing reads has no outcome of its own; it was folded into the single `fix:` step.
- The assessor found no structural contradiction: the two `toHaveBeenCalledExactlyOnceWith("subagents:record", …)` assertions in `subagent-events-observer.test.ts` are the only exact-equality assertions on the entry, and `session-navigator.test.ts`'s raw-entry block (no `stoppedWhileQueued` key) stays unchanged as the end-to-end legacy pin.
- No new import edge: `session-navigation.ts` already imports `#src/persisted-record`.
- Newest triage (`docs/triage/2026-10-18-backlog.md`) predates this issue; no sibling issues or PRs touch `persisted-record.ts`.

#### Deferred tidyings

- `src/persisted-record.ts` — a shared optional-field guard in `asRunSummary`, rejected as a wrong abstraction (the new guard normalizes absence, the others pass `undefined` through).
- `test/persisted-record.test.ts`, `test/ui/session-navigation.test.ts`, `test/ui/session-navigator.test.ts` — three independent persisted-run fixtures of different shapes; unifying them is unrelated cleanup.

## Stage: Implementation — TDD (2026-10-25T00:04:41Z)

### Session summary

Both plan steps landed: the `fix(pi-subagents)` commit that records `stoppedWhileQueued` on the `subagents:record` entry, validates it in `asRunSummary`, and drops the `listNavigableAgents` adapter; and the `docs(pi-subagents)` roadmap landing (the check mark on the heading and the `S1086` node, plus a `Landed:` note).
The pi-subagents suite went from 2191 to 2196 tests (+5); `check`, root lint, the full repo test run, and `fallow dead-code` stayed green.

### Observations

- No deviations from the plan; the changed files match Module-Level Changes exactly.
- Red came up as predicted: 13 failing tests across the four files, all from the new field.
- Every planned killing mutation turned exactly the predicted tests red: writer (5), reader value (2), absent arm read as `true` (3: the legacy unit test and both legacy raw-entry navigator tests), guard removed (1), adapter restored (2).
- The commit hit the `git commit -F -` heredoc deny rule once; it was resolved by writing the message to a file.
- Pre-completion reviewer: WARN.
  Reviewer warnings: the non-boolean skip test covers only `"yes"`; `null` takes the same branch, so a `null` case would be a cheap extra pin (optional, non-blocking).

## Stage: Sync (worktree) (2026-10-25T00:16:27Z)

### Session summary

Pre-push `pnpm run lint` and `pnpm fallow dead-code` passed from the worktree root.
The plan's marker is `**Release:** ship independently`, with one `fix(pi-subagents):` commit (a patch); the plan names no follow-up issues.

**Peer session transcript:** `/Users/chris/.pi/agent/sessions/--Users-chris-development-pi-pi-packages-worktrees-issue-1086--/2026-10-24T23-44-08-201Z_01a1704c-de08-7690-8b56-99d0a7f363b2.jsonl`; read it with `read_session_file({ path: "<path>" })` for message-level verification at land/retro time.

### Observations

- The TDD stage's reviewer WARN was settled here by operator decision (add): the commit `test(pi-subagents): pin null and 0 as skipped stoppedWhileQueued values (#1086)` makes the skip test an `it.each` over `"yes"`, `null`, and `0`.
  Deleting the guard turned all three cases red; this test-only commit was not re-reviewed by the pre-completion reviewer.
- The first `ask_user` attempts were rejected for missing visible substance; the gate was then put in plain text.
