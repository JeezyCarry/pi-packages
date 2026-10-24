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
