---
issue: 1036
issue_title: "Repair prose lines that rumdl's MD018 fix turned into headings"
---

# Repair the prose lines and heading levels that rumdl's MD018 fix damaged

## Release Recommendation

**Release:** ship independently

Every file this plan touches is a plan, retro, triage note, or evidence brief, all outside every package's release scope, so `/ship` cuts no release.
The issue carries `scope:repo` and belongs to no improvement roadmap.

## Problem Statement

Before `.rumdl.toml` set `[MD018] magiclink = true`, `rumdl fmt` (via `pi-autoformat` after each `Write`/`Edit` and the pre-commit hook) read a prose line that starts with an issue reference, such as `#981 shipped …`, as a heading missing its space.
Its fix turned the line into a heading, and the result passes `rumdl check`, so the damage is still in the tree.
The issue asks to turn each such heading back into the prose line it was.

## Goals

- Restore all 25 damaged prose lines across 12 files: `#N` with no space, the lost final `.`, and the line rejoined to the paragraph it was split from.
- Restore the 98 real headings, in 10 of those files, that the same formatter pass demoted by one or two levels.
- Leave `pnpm run lint` green and the detection greps empty.

## Non-Goals

- A lint check that rejects a `## 981 shipped …`-shaped heading.
  The operator declined it: `magiclink = true` prevents new damage, and [#1037]'s step 4 re-verifies that setting under the upgraded rumdl, which is the only realistic way the damage returns.
- Upgrading rumdl ([#1037]).
- Real numbered headings: ADR titles (`# 0013 — …`), numbered design sections (`### 1. …`), and the README's `### 22.0.0 — …` version headings are authored and stay.

## Background

### What the old fix did

Reproduced with the pinned rumdl 0.2.24 in `/tmp/md018`, running `rumdl fmt --config old.toml` where `old.toml` is `.rumdl.toml` minus its `[MD018]` section, on a sample holding `#315 has landed: the thing.` mid-paragraph.
The one pass:

1. Prefixed the line with `##` (MD018 + the heading-level fixes).
2. Dropped its trailing `.` (MD026).
3. Inserted a blank line before and after it (MD022), splitting its paragraph.
4. Demoted later, unrelated headings (`## Goals` → `### Goals`, `#### What went well` → `##### What went well`).
   The demotion is not a uniform cascade: in a second sample, a `### B` after the first fake heading kept its level while `## C` and `### D` after a later one dropped.

The same sample under the current `.rumdl.toml` reported `No issues found` and was left byte-identical, including the possessive form `#3's third.`.
The guard holds; no new damage is being written.

### Why git cannot recover the originals

`git log -S'#<N><text>'` finds no undamaged form of any of the 25 lines: `pi-autoformat` and the pre-commit `rumdl fmt` rewrote each file before its first commit containing the line.
The issue's suggested `git log -S` recovery therefore does not apply.

### Where the originals are

The Pi session transcripts under `~/.pi/agent/sessions/` hold each file's authored text in its `Write` `content` and `Edit` `newText` arguments.
A scan of every pi-packages session directory found authoring calls for all 12 files, and from them (measured):

- every one of the 25 lines originally ended in `.`;
- whether each line originally had a blank line above and below it (table below);
- the authored level of every heading in the 12 files — each current heading's text matched an authored heading, and the 98 whose level differs are listed below.

The probes are `/tmp/md018-recover.mjs`, `/tmp/md018-table.mjs`, and `/tmp/md018-levels2.mjs`; they are throwaway and need not survive into `/build-plan`, because their output is recorded here.

### Inventory beyond the issue's regex

The issue's grep (`'^#{1,6} [0-9]{2,4} [a-z(]'`) finds 21 lines in 11 files.
It misses four possessive forms, `## 665's`, `## 837's`, `## 917's`, `## 671's`.
The full detector is:

```bash
grep -rnE '^#{1,6} [0-9]{2,4}([ '"'"'][a-z(]|'"'"'s )' --include='*.md' . --exclude-dir=node_modules | grep -v -e CHANGELOG -e '^./.pi/npm'
```

It prints 25 lines in 12 files today (measured).
A wider sweep, `'^(> )?#{1,6} [0-9]+([^0-9]|$)'`, surfaced nothing else beyond authored numbered headings.

## Design Overview

The repair is data-driven: the two tables below are the whole specification.
`/build-plan` applies them with a throwaway Node script in `/tmp` (operator's choice over hand edits), then verifies the result against the same tables.

### Order of application

Apply per file, heading levels first and prose lines second, and within the prose pass work bottom-up.
The heading table is keyed by current line numbers, and the prose repair deletes blank lines, which would shift every later line number.
The script asserts each target line's current text before changing it (the heading text for a level fix, the `#{n} <N>` prefix for a prose fix) and aborts on a mismatch rather than editing a moved line.

### Prose-line repair

For each row: replace the leading `#{1,6} <N>` with `#<N>`, append `.`, and delete the blank line above (`join above`) and/or below (`join below`) when the authored text had none.
A row marked `keep` leaves that blank line.

| File                                                                                            | Line | Above | Below |
| ----------------------------------------------------------------------------------------------- | ---- | ----- | ----- |
| `docs/plans/0775-evidence/pi-subagents.md`                                                      | 24   | join  | join  |
| `docs/plans/0775-evidence/pi-subagents.md`                                                      | 33   | join  | keep  |
| `docs/triage/2026-10-02-backlog.md`                                                             | 202  | join  | keep  |
| `docs/triage/2026-10-02-backlog.md`                                                             | 234  | join  | join  |
| `docs/triage/2026-10-02-backlog.md`                                                             | 242  | keep  | join  |
| `docs/triage/2026-10-02-backlog.md`                                                             | 244  | join  | keep  |
| `docs/triage/2026-08-05-backlog.md`                                                             | 76   | keep  | join  |
| `docs/triage/2026-08-05-backlog.md`                                                             | 126  | join  | join  |
| `docs/triage/2026-08-05-backlog.md`                                                             | 128  | join  | keep  |
| `docs/triage/2026-08-05-backlog.md`                                                             | 162  | join  | keep  |
| `docs/triage/2026-09-15-backlog.md`                                                             | 197  | join  | join  |
| `docs/triage/2026-09-15-backlog.md`                                                             | 351  | keep  | keep  |
| `docs/triage/2026-09-15-backlog.md`                                                             | 424  | join  | keep  |
| `packages/pi-permission-system/docs/plans/0316-fold-build-forwarding-deps.md`                   | 17   | join  | keep  |
| `packages/pi-permission-system/docs/plans/0511-retire-residual-getplatform-threading.md`        | 18   | keep  | join  |
| `packages/pi-permission-system/docs/plans/0928-mcp-prefix-named-server-derivation.md`           | 12   | keep  | join  |
| `packages/pi-permission-system/docs/retro/0508-bash-external-directory-windows-drive-letter.md` | 41   | keep  | join  |
| `packages/pi-permission-system/docs/retro/0815-reachable-non-deny-tool-exposure.md`             | 90   | keep  | join  |
| `packages/pi-permission-system/docs/retro/0910-absolute-path-bash-rule-relative-spelling.md`    | 37   | join  | join  |
| `packages/pi-permission-system/docs/retro/0910-absolute-path-bash-rule-relative-spelling.md`    | 78   | join  | keep  |
| `packages/pi-permission-model-judge/docs/retro/0625-authenticate-model-judge-review-call.md`    | 102  | keep  | join  |
| `packages/pi-subagents/docs/retro/0664-abort-all-on-interrupt-policy-setting.md`                | 12   | keep  | join  |
| `packages/pi-subagents/docs/retro/0664-abort-all-on-interrupt-policy-setting.md`                | 70   | keep  | join  |
| `packages/pi-subagents/docs/retro/0664-abort-all-on-interrupt-policy-setting.md`                | 74   | keep  | join  |
| `packages/pi-subagents/docs/retro/0664-abort-all-on-interrupt-policy-setting.md`                | 76   | join  | keep  |

Adjacent rows interact: in `2026-10-02-backlog.md`, 242 `join below` and 244 `join above` name the same blank line (243), and likewise 126/128 in `2026-08-05-backlog.md` and 74/76 in `0664`.
The script deletes a blank line once, however many rows name it.
A line at end of file (`0910`:78) keeps its trailing newline.

### Heading-level repair

Each entry is `line (current→authored)`; set the heading's `#` count to the authored level and leave its text alone.
Anchor slugs do not depend on level, so no link changes (the only numeric-anchor link in the tree, `README.md`'s `#2200--project-config-requires-project-trust`, targets an authored heading).

| File                                                                                         | Count | Headings                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/0775-evidence/pi-subagents.md`                                                   | 4     | 39 (3→2), 137 (4→3), 157 (3→2), 175 (3→2)                                                                                                                                                                                                           |
| `docs/triage/2026-10-02-backlog.md`                                                          | 15    | 204 (3→2), 206 (4→3), 214 (4→3), 219 (4→3), 227 (4→3), 238 (4→3), 246 (4→2), 282 (4→2), 306 (4→2), 329 (4→2), 347 (4→2), 349 (5→3), 358 (5→3), 362 (5→3), 367 (4→2)                                                                                 |
| `docs/triage/2026-08-05-backlog.md`                                                          | 6     | 82 (3→2), 111 (3→2), 148 (3→2), 164 (3→2), 173 (3→2), 190 (3→2)                                                                                                                                                                                     |
| `docs/triage/2026-09-15-backlog.md`                                                          | 11    | 208 (4→3), 216 (4→3), 225 (3→2), 324 (3→2), 353 (3→2), 375 (3→2), 393 (3→2), 395 (4→3), 414 (4→3), 418 (4→3), 428 (3→2)                                                                                                                             |
| `packages/pi-permission-system/docs/plans/0316-fold-build-forwarding-deps.md`                | 13    | 19 (3→2), 28 (3→2), 35 (3→2), 53 (3→2), 55 (4→3), 81 (4→3), 108 (4→3), 121 (4→3), 126 (3→2), 157 (3→2), 168 (3→2), 183 (3→2), 195 (3→2)                                                                                                             |
| `packages/pi-permission-system/docs/plans/0511-retire-residual-getplatform-threading.md`     | 16    | 29 (3→2), 35 (3→2), 46 (3→2), 66 (3→2), 68 (4→3), 76 (4→3), 104 (4→3), 116 (4→3), 138 (4→3), 143 (4→3), 149 (3→2), 172 (3→2), 183 (3→2), 190 (3→2), 216 (3→2), 227 (3→2)                                                                            |
| `packages/pi-permission-system/docs/plans/0928-mcp-prefix-named-server-derivation.md`        | 23    | 16 (3→2), 40 (3→2), 55 (3→2), 71 (3→2), 73 (4→3), 81 (4→3), 90 (4→3), 97 (4→3), 104 (3→2), 106 (4→3), 120 (4→3), 147 (4→3), 161 (4→3), 167 (3→2), 169 (4→3), 178 (4→3), 186 (4→3), 195 (4→3), 204 (3→2), 225 (3→2), 244 (3→2), 295 (3→2), 315 (3→2) |
| `packages/pi-permission-system/docs/retro/0815-reachable-non-deny-tool-exposure.md`          | 3     | 107 (5→4), 123 (5→4), 130 (4→3)                                                                                                                                                                                                                     |
| `packages/pi-permission-model-judge/docs/retro/0625-authenticate-model-judge-review-call.md` | 4     | 119 (5→4), 126 (5→4), 131 (5→4), 137 (4→3)                                                                                                                                                                                                          |
| `packages/pi-subagents/docs/retro/0664-abort-all-on-interrupt-policy-setting.md`             | 3     | 28 (4→3), 45 (4→3), 68 (4→3)                                                                                                                                                                                                                        |

The two files with no level damage are `0508` and `0910`, whose fake headings sit at the end of a section or file.

## Module-Level Changes

- The 12 files in the prose table: prose-line repair; 10 of them also get the heading-level repair.
- No `src/`, `test/`, config, skill, or prompt file changes.
- Predicted unchanged: `.rumdl.toml` (the guard is already in place and verified above), and `.pi/skills/markdown-conventions/SKILL.md` (it names no MD018 behavior to correct).

## Test Impact Analysis

No code changes, so the verification surface is commands, each dry-run at planning time:

1. The full detector from Background prints 25 lines today; after the repair it prints nothing.
2. The issue's narrower grep prints 21 lines today; after the repair it prints nothing.
3. `rumdl check` on the 12 files passes today (measured: the damage is lint-clean) and must still pass; then `pnpm run lint`.
4. A re-run of `/tmp/md018-levels2.mjs` prints the 10-row table today; after the repair it prints nothing.
   If `/tmp` was cleared, rebuild the check from the heading table instead: every listed heading's text sits at its authored level.
5. `git diff --stat` touches exactly the 12 files, and `git diff` shows only `#` counts, the 25 rewritten lines, and deleted blank lines — `git diff | grep '^[-+]' | grep -vE '^(\+\+\+|---)'` contains no other changed text.

## Invariants at risk

- The pre-commit `rumdl fmt` and `pi-autoformat` must not re-damage the repaired lines on commit.
  Pinned by the `/tmp/md018` repro: the current config leaves `#315 …` and `#3's …` lines untouched; the build re-checks it by running `rumdl fmt` on the 12 files after the repair and confirming `git diff` gains nothing.
- Rejoined lines must not join two sentences on one line: each table row restores a line break-separated sentence; no row merges lines.

## TDD Order

There are no test cycles; this is a `/build-plan` change.

1. Write `/tmp/md018-repair.mjs` from the two tables (heading levels first, then prose lines bottom-up, asserting each target line's current text first), run it, and run the five verification commands.
   Commit: `docs: restore prose lines and heading levels damaged by rumdl's MD018 fix (#1036)`.

## Risks and Mitigations

- **A file moves before `/build-plan` runs**, invalidating line numbers.
  The script asserts each line's text before editing and aborts on mismatch; on abort, re-derive the line numbers with the detector grep and by heading text.
- **An authored heading level was later changed on purpose**, and the transcript map would revert it.
  The map takes the latest authoring call per heading text, and every listed change moves a heading back toward its sibling sections' level (plan `##` sections, retro `####` subsections), so none reads as an intentional restructure.
- **Damage in a file with no surviving fake heading** (a fake heading hand-fixed earlier, its demotions left behind) would be missed.
  None is known; the inventory is bounded by the 25 surviving fake headings.

## Open Questions

None.

[#1037]: https://github.com/gotgenes/pi-packages/issues/1037
