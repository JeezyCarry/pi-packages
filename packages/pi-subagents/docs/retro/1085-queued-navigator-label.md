---
issue: 1085
issue_title: "pi-subagents: /subagents:sessions labels a queued resume's queue time as running"
---

# Retro: #1085 — pi-subagents: /subagents:sessions labels a queued resume's queue time as running

## Stage: Planning (2026-10-24T16:56:35Z)

### Session summary

Reproduced the defect with a disposable spike that drove a real `Subagent` through `resume()` behind a `gatedScheduler`, then `stopQueued()`, and labeled each state with the real `listNavigableAgents`.
The operator chose [#1080]'s `queued <seconds>` wording verbatim (`queued · queued 3.0s`), and the plan moves `formatRunDuration` into `src/ui/display.ts` over a narrow `RunTiming` so `get_subagent_result` and the navigator share one decision.
The plan is a `refactor:` move, a `fix:` for the label, and the roadmap landing; the persisted (post-`/reload`) row was filed as [#1086] and dispositioned as the next Phase 23 step.

### Observations

- The spike surfaced a third path the issue omits: a resume stopped while queued is persisted to `subagents:record` without `stoppedWhileQueued`, so after `/reload` its snapshot row still reads `stopped · 3.0s`.
  The operator deferred it ([#1086]) rather than widening this step to a session-entry field.
- Rejected: a label-only branch that merges the status and duration segments (`· queued 3.0s`) to avoid the repeated word; the operator preferred one shared wording across carriers.
- The persisted loop passes `{ ...run, stoppedWhileQueued: false }` to `buildLabel`, a deliberate seam [#1086] deletes.
- The Tidy-First assessor recommended the `formatRunDuration` move as the one preparatory commit (now Step 1) and found no structural contradictions: `makeNavigable` is the only literal `NavigableSubagent`, and `formatDuration` has no caller outside the package and no direct test.
- The still-running `(running)` arm of `formatDuration` has no test today; Step 1's unit tests add one.
- The spike's in-memory released row came back unlisted because the stub session has no `outputFile`, so that row is pinned by a `makeNavigable` fixture only.

[#1080]: https://github.com/gotgenes/pi-packages/issues/1080
[#1086]: https://github.com/gotgenes/pi-packages/issues/1086
