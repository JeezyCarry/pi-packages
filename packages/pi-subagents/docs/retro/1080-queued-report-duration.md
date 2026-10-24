---
issue: 1080
issue_title: "pi-subagents: get_subagent_result reports a queued agent's Duration as running time"
---

# Retro: #1080 — pi-subagents: get_subagent_result reports a queued agent's Duration as running time

## Stage: Planning (2026-10-24T15:14:02Z)

### Session summary

Reproduced the defect with a disposable spike through `GetResultTool.execute`.
It also surfaced a sibling the issue omits: a run stopped while queued reports its queue time as `Duration: 5.0s`.
The operator chose to show the queue time rather than hide it, with the same `queued <seconds>` wording for both cases, rendered by one private `formatRunDuration` helper that `buildReport` and `buildGetResultDetails` call, leaving the shared `formatDuration` untouched.
The plan is one `fix:` step plus the roadmap landing step; the `/subagents:sessions` navigator's identical defect for a queued resume was filed as [#1085] and dispositioned as a new Phase 23 step after this one.

### Observations

- The operator answered the first rendering gate (word / omit / relabeled queue time) with "can we show the queue time?"; a second gate settled the wording among three measured shapes, choosing `Duration: queued 5.0s` because it keeps `AgentReport.duration` a single string.
- The spike's first `stopped.abort()` left the run queued; a queued run is stopped with `Subagent.stopQueued()`, not `abort()`.
- The spike seeded `startedAt`, so the claim that a never-admitted run's `startedAt` is its enqueue time rests on reading `subagent-run.ts` and `Subagent.resume`, as the plan's Risks section says.
- The Tidy-First assessor recommended nothing; its optional fixture-string update in `get-result-report.test.ts` (`"130.0s (running)"` beside `status: "queued"`) is folded into the fix step.
- Rejected: a `neverStarted` predicate on `RunOutcome`.
  It would have one caller, and the other sites branch on `queued` and `stoppedWhileQueued` as separate arms.
- The first draft of [#1085] named the navigator command `/agents`; `pi.registerCommand` shows it is `/subagents:sessions`, and the issue was edited before the disposition was recorded.

#### Deferred tidyings

- `src/tools/get-result-tool.ts`: `buildReport` and `buildGetResultDetails` still compute about eight fields identically; this is already recorded under [#947]'s deferred tidyings.

[#947]: https://github.com/gotgenes/pi-packages/issues/947
[#1085]: https://github.com/gotgenes/pi-packages/issues/1085
