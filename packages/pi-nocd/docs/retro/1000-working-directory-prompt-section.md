---
issue: 1000
issue_title: "pi-nocd: returning a forced `systemPrompt` drops Pi 0.99.2's `<mcp_servers>` section"
---

# Retro: #1000 — pi-nocd: returning a forced `systemPrompt` drops Pi 0.99.2's `<mcp_servers>` section

## Stage: Planning (2026-10-02T05:37:53Z)

### Session summary

Reproduced the defect on Pi 1.0.0 through the real CLI: `<mcp_servers>` was present without pi-nocd and missing with it, and a spike that assigns `sections.working_directory` restored it.
Planned the fix as a breaking change: the handler only assigns `event.systemPromptOptions.sections.working_directory`, the string path and its safeguards are deleted, and the peer floor moves to `>=1.0.0`.
The plan is in `packages/pi-nocd/docs/plans/1000-working-directory-prompt-section.md`.

### Observations

- The issue proposed keeping the string return as a fallback for hosts older than 0.86.
  The operator chose instead to raise the floor to 1.0.0 and drop the string path entirely.
  That removes `ensureWorkingDirectoryPrompt`, `findOurBlock`, the idempotency check, and the foreign-heading suppression.
- The string path also covered a second case that a floor raise does not touch: an earlier handler that forces the prompt.
  The operator accepted losing the block there, as ADR 0015 did for pi-permission-system.
  Measured with pi-ask 1.2.0: when it loads ahead of the spike, the sentence count is 0; when it loads after, the count is 1.
- The operator's main concern was pi-subagents.
  The #640 guarantee is now held by pi-subagents' `inheritedIdentity` cut, which drops everything from `<cwd>` onward, plus each child's own pi-nocd.
  No section-shape test pinned an extension section after `<cwd>`, so plan step 1 adds one to pi-subagents.
  At planning time it passed on current source and was killed by an early `return prompt;`.
- The plan stays in the pi-nocd directory even though step 1 adds a pi-subagents test: that test is the only pi-subagents change, and pi-nocd is the only package released.
- The `# Working Directory` heading is dropped (operator's call): the section content is the sentence only, the same way Pi writes its own sections.
- [#846] becomes moot because the rewrite branch it asks about is deleted; close it at `/ship`.
- The tidy-first assessor recommended no preparatory commits.
  It found `.pi/skills/package-pi-nocd/SKILL.md`'s `findOurBlock` row, which the plan's docs step now updates.
- Run the end-to-end check (plan step 5) before `/ship`; #999's check was skipped and caught this issue only afterwards.
  The probe lives at `/tmp/nocd-e2e/probe.ts`.

## Stage: Implementation — TDD (2026-10-02T05:50:11Z)

### Session summary

Completed all five plan steps: the pi-subagents pin, the devDependency bump to Pi 1.0.0, the breaking fix, the README and skill update, and the end-to-end check. pi-nocd's suite went from 11 tests to 7: the 7-test `ensureWorkingDirectoryPrompt` suite and the heading test were removed, and 3 handler tests plus 1 exact-sentence test were added. pi-subagents' `prompts.test.ts` gained 1 test, 81 in total.

### Observations

- Every killing mutation hit exactly the tests the plan predicted:
  - restoring a `systemPrompt` return reddened 1 test (the `undefined`-return test);
  - deleting the assignment reddened 2 (both section tests);
  - replacing `sections` wholesale reddened 1 (the preserve-existing test);
  - prepending the heading reddened 1 (the exact-sentence test);
  - an early `return prompt;` in `inheritedIdentity` reddened the pi-subagents pin.
- The handler tests' Red step proved nothing about their assertions: they all crashed on the missing `event.systemPrompt`.
  The mutations above are what shows each assertion discriminates.
- End-to-end on Pi 1.0.0 (fresh `pi -p`, `builtin:mcp`, one configured server): without pi-nocd, `<mcp_servers>` 1 and `<working_directory>` 0.
  With the working tree's pi-nocd, `<mcp_servers>` 1, `<working_directory>` 1, and `# Working Directory` 0.
- Deviation: I amended the fix commit's message to put `BREAKING CHANGE:` in the final paragraph, below `Refs #1000`, matching the precedent of pi-permission-system's floor raise.
- Pre-completion reviewer: WARN.
  - `packages/pi-subagents/docs/decisions/0006-inherited-prompt-is-identity-only.md` (line 91) still cites [#846] as tracking pi-nocd's rewrite path.
    This is ADR history, so the fix is to close [#846] at `/ship`, not to edit the ADR.
  - pi-subagents' `unanchored` no-skills path returns a parent's prompt unchanged when its `<cwd>` body does not match `toPromptPath(inherited.cwd)`.
    The reviewer found no way to reach it.

## Stage: Sync (worktree) (2026-10-02T05:51:48Z)

### Session summary

`pnpm run lint` and `pnpm fallow dead-code` both passed from the worktree root.
The plan's marker is `**Release:** ship independently`, and the fix commit is breaking, so the release is a major for `pi-nocd`.
Close [#846] at `/ship`, as resolved by this change.

**Peer session transcript:** `/Users/chris/.pi/agent/sessions/--Users-chris-development-pi-pi-packages-worktrees-issue-1000--/2026-10-02T05-19-02-442Z_01a0fb0d-372a-75d5-a4a8-22b377487141.jsonl` — read with `read_session_file({ path: "<path>" })` for message-level verification at land/retro time.

### Observations

- Decide at `/ship` whether to leave a comment on issue #1000 pointing at the load-order caveat (an earlier forcing handler, such as pi-ask 1.2.0, still drops the section).
- The plan's end-to-end check (Pi 1.0.0, one configured server) ran during the TDD stage and passed.

## Stage: Final Retrospective (2026-10-02T06:01:22Z)

### Session summary

The root session fast-forward-merged the branch, pushed it, and confirmed CI passed on `f7499134`.
It closed #1000 and [#846], then released `pi-nocd` 2.0.0 on its own; `pi-subagents` gained only a test and had nothing to release.
The issue went from planning to release with no rework commits, and every stage gate (lint, `fallow`, CI, release) passed on its first run.

### Observations

#### What went well

- The reproduction probe built in planning (`/tmp/nocd-e2e/probe.ts`, a `before_provider_request` hook that dumps the provider payload from a fresh `pi -p`) did three jobs.
  It reproduced the defect, priced the pi-ask load-order caveat, and served as the TDD stage's end-to-end check unchanged.
  That closed the gap #999 left, where the end-to-end check was skipped and this defect surfaced only afterwards.
- Raising the peer floor did more than remove a version check: it deleted `ensureWorkingDirectoryPrompt`, `findOurBlock`, and the three string-path safeguards, and it resolved [#846] as a side effect.
  The operator, not the agent, put that option on the table.
- Every killing mutation in the TDD stage reddened exactly the number of tests the plan predicted (1, 2, 1, 1, and the pi-subagents pin).
  Because the plan named its mutations, verifying the pins took one edit and one run per mutation.

#### What caused friction (agent side)

- `premature-convergence` — The first planning `ask_user` gate listed the design as "settled (not asked)": keep the string path and keep the `>=0.75.0` floor.
  Its two questions both assumed that premise.
  The operator answered with a question about raising the floor, which is the option `clarification-gates` § *The option space* says to offer ("name it and offer the option that removes it").
  The skill had been loaded one turn before the gate.
  User-caught.
  Impact: two extra explanation turns (the forced-prompt case split, then a pi-subagents walkthrough after "the latter" was ambiguous) before the operator chose; no plan rework.
- `instruction-violation` — In `/ship` I passed `ci_watch` a hand-retyped run ID (`36971037060`) instead of the one `ci_find` returned (`36971047060`).
  Self-identified on the immediate 404.
  Impact: one failed tool call; no rework.
- `instruction-violation` — In the sync stage, a literal `\u2014` escape and a `[#1000]` self-link went into the retro note.
  Self-identified before commit; `pi-autoformat` had already decoded the escape.
  Impact: one `perl` fix, folded into the same commit.

#### What caused friction (user side)

- The operator settled the design's main fork (raise the floor and drop the string path) through two follow-up questions rather than through the gate's options.
  If the operator had stated their floor preference, or noted that ADR 0015 had already accepted the forced-prompt loss, when invoking `/plan-issue`, the first gate could have been one question.

### Diagnostic details

- **Model-performance correlation** — Planning and TDD ran on `claude-opus-5-5`, and sync ran on `claude-sonnet-5-5`.
  Both subagents ran on `claude-sonnet-5-5`, attributed from their own transcripts: the `tidy-first-assessor` (it correctly recommended no preparatory commits) and the `pre-completion-reviewer`.
  The reviewer re-derived the #640 invariant across the `full`, `portable`, and nested shapes, and it found the theoretical `unanchored` path.
  No mismatches.
- **Feedback-loop gap analysis** — The TDD stage ran the target test file after each Red and Green step, plus each mutation, and ran `check` after the floor bump.
  Full gates ran at the baseline and at the end, and `/ship` re-ran lint and `fallow` on the merged tree.
  No gap.

### Changes made

None; the operator confirmed that no rule changes were needed (see the proposals considered in the session).

[#846]: https://github.com/gotgenes/pi-packages/issues/846
