---
issue: 948
issue_title: "feat(pi-github-tools): refuse an issue_close comment citing an unresolvable commit SHA"
pr: 993
---

# Retro: #948 — refuse an `issue_close` comment citing an unresolvable commit SHA

## Stage: PR Review (2026-10-05T17:49:07Z)

### Session summary

PR #993 by @mvanhorn adds a pre-publication guard to `closeIssue`: every distinct lowercase word-bounded 7–40 character hex token in the comment must resolve via `git rev-parse --verify <token>^{commit}`, or the close is refused before `gh` runs, with an explicit `skip_sha_validation` escape hatch.
The underlying problem (#948 — fabricated or mistyped SHAs published in `/ship` close comments, seven-plus incidents) is confirmed on current `main`.
The operator chose to adopt the PR, pushing maintainer trims onto the contributor's branch and rebase-merging, released as a non-breaking `feat`.

### Evaluation

Verify gate:

- Reproduced on `main` (head `48d19814`): a scratch Vitest test calling `closeIssue` with the #980 fabricated SHA `7e0816d2c3902d0752c6c02ecf5b0ef2fb15c8e0` expected a rejection and failed — `gh` was called.
  Scratch file deleted.
- Not already fixed: `git log -S rev-parse -- packages/pi-github-tools/src` finds no guard; #948 is open with no plan or retro.
- PR head `43150c68` in a scratch worktree: `pnpm run check` passes, `pnpm run lint` clean, `pi-github-tools` tests 119/119; CI `check` SUCCESS; `git merge-tree` against current `main` is clean despite base `22bb303f` predating the 6.0.0 release.
- Blast radius, measured over the operator's comments on the last 300 closed issues: 783 distinct candidate tokens, 14 unresolvable locally — several are genuine fabrications the guard targets (`7e0816d2c390…`, `6577b790d3d1…`), a few are `…`-truncated possibly-foreign citations, and one is a numeric ID (`1779818869394`).
  Three all-digit tokens (`13911174`, `64852465`, `98360207`) are real SHAs, so excluding digit-only tokens would trade false positives for missed citations; keep the PR's regex.

Valuable, keep as-is:

- Seam: the check sits in `closeIssue` after reason validation and before the sole `gh` mutation, so a refusal publishes nothing.
- Answers to the issue's open questions: hard refusal (not warn-and-post), no ancestry check (consistent with the #980 comment), and an explicit opt-out `skip_sha_validation`.
  `issue_close` is the only publishing surface in the package, so no other tool needs the guard.
- Reuses the existing `git()` helper in `src/lib/github.ts`; `src/lib/` stays free of Pi imports; the abort signal threads through every `git` call.
- Test coverage in `test/lib/issue.test.ts` and the new `test/tools/issue-close.test.ts` fails without the fix and covers dedupe, ordering, boundaries, abort, and the escape hatch.

Change before merging (maintainer fixups pushed to the PR branch):

- `src/tools/issue-close.ts`: the tool `description` grows from one sentence to seven and is sent to the model on every request — cut it to about two sentences (refuses unresolvable SHAs; `skip_sha_validation` is for foreign or non-commit hashes) and leave detail on the parameter description.
  Loosen the `test/tools/issue-close.test.ts` assertions that pin the deleted phrases.
- `README.md`: trim the repetitive `issue_close` prose and the non-goals rewrite to the behavior and the escape hatch.
- Optional: the paired `throwIfAborted` calls around each `git` call in `rejectUnresolvedCommitShas` are slightly over-defensive but correct; leave unless trimming is free.

Behavior: `issue_close` now refuses comments it previously posted (foreign SHAs, long hex-or-digit IDs); the operator ruled this a non-breaking `feat` given the opt-out.

### Decision and attribution

Direction: adopt PR #993 mostly as-is — push the description/README trims as maintainer commits onto `fix/948-issue-close-sha-validation` (`maintainerCanModify: true`), then `gh pr merge 993 --rebase` to keep per-commit authorship.
Release as `feat(pi-github-tools)` (minor), not `feat!`.
Non-goals: ancestry-on-`main` checking, guarding issue numbers, a digit-only-token exclusion.

Attribution: any maintainer commit that rewrites the contributor's content carries

```text
Co-authored-by: Matt Van Horn <455140+mvanhorn@users.noreply.github.com>
```

The ship-stage close comment on #948 / PR #993 thanks @mvanhorn by name and links the landed SHA(s).
Reference the PR as `Refs #993`, never `Closes #993`.

## Stage: Ship (2026-10-05T23:39:52Z)

### Session summary

Same session as the PR Review.
Pushed one maintainer commit (`b25b7050`) onto the contributor's branch trimming the tool description, README, and the package skill's "sole external binary" line, approved the fork CI run, pushed the triage note, and rebase-merged PR #993 (contributor commit `38d9adb1`).
CI on `main` passed, #948 closed with a credited comment, PR #993 got a thank-you comment, and `pi-github-tools` 6.1.0 released.

## Stage: Final Retrospective (2026-10-05T23:39:52Z)

### Session summary

One session took third-party PR #993 from review through release: verify gate, scratch-worktree checks, a measured false-positive sweep, maintainer fixups on the contributor's branch, rebase-merge, close, and release of `pi-github-tools` 6.1.0.
No rework was needed; the one blemish is a changelog entry that shipped unscoped and unlinked.

### Observations

#### What went well

- Measuring the regex against real data settled a design question the PR left implicit.
  Running the PR's pattern over the operator's comments on 300 closed issues found 783 candidate tokens, 14 unresolvable (mostly genuine fabrications), and three all-digit tokens that are real SHAs, which ruled out the tempting "skip digit-only tokens" tweak before it was proposed.
- The `/pr-review` "push fixups onto the contributor's branch, then `gh pr merge --rebase`" ending worked end to end for the first time here: `maintainerCanModify` was `true`, the fork push re-triggered an `action_required` CI run that one `approve` call released, and `main` stayed linear with Matt's authorship on `38d9adb1`.

#### What caused friction (agent side)

- `missing-context` — the adopt-as-is review checklist did not check the contributor's commit header.
  `38d9adb1` is `feat: refuse issue-close comments …` with no `(pi-github-tools)` scope and no issue reference, so the 6.1.0 `CHANGELOG.md` lists the feature unscoped with no `#948` link, while the trailing `docs` commit carries the `closes #948` link.
  Release scoping is by path, so the version bump was still correct.
  Impact: a cosmetic changelog blemish that is now permanent; no rework.

#### What caused friction (user side)

- "Let's proceed forward" after the review summary covered pushing fixups, merging, closing, and releasing in one turn.
  It worked here because the summary named `/ship #948` as the next step, but the landing went through `/ship`'s steps without the template being invoked; naming `/ship 948` explicitly would have loaded the template rather than relying on the agent to read it from disk.

### Diagnostic details

- **Feedback-loop gap analysis** — `pnpm run check`, `pnpm run lint`, and the package tests ran on the PR head before evaluation and again after the fixup edits, before committing; CI ran on both the fork head and `main`.
  No gap.

### Changes made

1. `.pi/prompts/pr-review.md`: the adopt-as-is ending now checks each contributor commit header for `type(<pkg>):` and names the two remedies (reword on the branch, or `--squash` with a conforming subject plus `Co-authored-by:`).
