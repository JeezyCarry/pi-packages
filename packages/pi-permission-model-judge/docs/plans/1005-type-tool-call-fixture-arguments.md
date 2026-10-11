---
issue: 1005
issue_title: "pi-permission-model-judge: assistant-message test fixture fails to typecheck against Pi 0.99.2 (`JsonObject` arguments)"
---

# Type the tool-call test fixtures' arguments from `ToolCall["arguments"]`

## Release Recommendation

**Release:** ship independently

This package has no architecture roadmap and no release-batch membership.
The change touches only `test/`, so its `test:` commit is skipped by `cliff.toml` and `next-version.sh` is expected to print nothing for this package; `/ship` should confirm that rather than cut a release.

## Problem Statement

Pi 0.86.0 narrowed `ToolCall.arguments` from `Record<string, any>` to `JsonObject`.
The package's test fixture `assistantToolCall(args: Record<string, unknown>, …)` passes its argument straight into a `toolCall` content part, so once the `@earendil-works/*` devDependencies are bumped past 0.86 the fixture fails `tsc` with `TS2322: Type 'Record<string, unknown>' is not assignable to type 'JsonObject'`.
Production code compiles and all 69 tests pass at 0.99.2 and 1.0.0; the defect only blocks the next devDependency bump.

## Goals

- `pnpm --filter @gotgenes/pi-permission-model-judge run check` is clean against both the pinned 0.84.4 and Pi 1.0.0.
- No runtime or test-behavior change; the suite stays at 69 passing tests.
- Not breaking: the change is confined to `test/`.

## Non-Goals

- Bumping the `@earendil-works/*` devDependencies to 1.0.0 — that is the bump this unblocks, done separately.
- The sibling fixture failure in `pi-subagents` ([#1004]) — same triage band, different package.
- The `Record<string, unknown>` casts in `test/config-schema.test.ts:21,30` and the uses in `src/config-schema.ts` and `src/config-loader.ts` — none flows into `ToolCall.arguments`, and the 1.0.0 spike below reported no error there.
- A shared `ToolCallArgs` alias, or deriving `completeReporting`'s type via `Parameters<typeof assistantToolCall>[0]` — the assessor rejected both as indirection over two uses.

## Background

- `test/fixtures/assistant-message.ts` — `assistantToolCall(args, name)` wraps one `toolCall` part in `assistantReply`.
  Callers: `test/typo-reviewer.test.ts:45,179`, `test/extension.test.ts:419`, `test/model-review.test.ts:29,63`.
- `test/model-review.test.ts:28` — `completeReporting(args: Record<string, unknown>)` forwards `args` into `assistantToolCall`.
  The issue's suggested fix does not mention it.
- Pi checkout (`../../pi/packages/ai/src/types.ts:421,452-453`): `arguments: JsonObject`, with `JsonObject = { [key: string]: JsonValue }`.
  The pinned 0.84.4 `dist/types.d.ts:260` declares `arguments: Record<string, any>`, and `ToolCall` is re-exported from the package index (`export * from "./types.ts"`).

## Design Overview

Type both parameters from the field they fill, `ToolCall["arguments"]`, so they track whichever Pi version is installed:

```ts
import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";

export function assistantToolCall(
  args: ToolCall["arguments"],
  name = "claude_code_report_verdict",
): AssistantMessage { … }
```

```ts
function completeReporting(args: ToolCall["arguments"]): Mock<CompleteFn> { … }
```

### Evidence (measured spike, reverted)

Produced in this worktree by editing the two files, running `pnpm add -D @earendil-works/pi-ai@1.0.0 @earendil-works/pi-coding-agent@1.0.0`, then restoring `package.json`/`pnpm-lock.yaml` and reinstalling:

| Configuration                         | `tsc --noEmit`                                   | Tests     |
| ------------------------------------- | ------------------------------------------------ | --------- |
| Fixture change only, Pi 1.0.0         | `test/model-review.test.ts(29,46): error TS2345` | not run   |
| Fixture + `completeReporting`, 1.0.0  | clean                                            | 69 passed |
| Fixture + `completeReporting`, 0.84.4 | clean                                            | 69 passed |

The issue's suggested fix alone moves the error rather than clearing it; `completeReporting` must change in the same commit.

## Module-Level Changes

- `test/fixtures/assistant-message.ts` — add `ToolCall` to the type import; `assistantToolCall`'s `args` becomes `ToolCall["arguments"]`.
- `test/model-review.test.ts` — add `ToolCall` to the line-1 type import; `completeReporting`'s `args` becomes `ToolCall["arguments"]`.
- Predicted unchanged: `test/typo-reviewer.test.ts`, `test/extension.test.ts` — every call passes a string-valued literal, assignable to `JsonObject` (spike: clean at 1.0.0).
- Predicted unchanged: `package.json`, `pnpm-lock.yaml`, docs, `.pi/skills/package-pi-permission-model-judge/SKILL.md` — no symbol, dependency, or documented mechanism changes.

## Test Impact Analysis

The change is type-only; no test is added, removed, or rewritten.
The testable surface is `tsc` against the newer Pi, which the pinned 0.84.4 cannot exercise (`Record<string, any>` accepts both old and new annotations).

## TDD Order

1. **Type the tool-call fixture arguments** (`test/fixtures/assistant-message.ts`, `test/model-review.test.ts`).
   - Red: in a scratch bump (`pnpm --filter @gotgenes/pi-permission-model-judge add -D @earendil-works/pi-ai@1.0.0 @earendil-works/pi-coding-agent@1.0.0`), `pnpm --filter @gotgenes/pi-permission-model-judge run check` reports `TS2322` at `assistant-message.ts(45,45)`.
   - Green: apply both annotation changes; `check` is clean and `test` reports 69 passed at 1.0.0.
   - Restore: `git checkout -- packages/pi-permission-model-judge/package.json pnpm-lock.yaml && pnpm install`; re-run `check` and `test` at 0.84.4 (clean, 69 passed).
   - Killing mutation: revert `completeReporting`'s parameter to `Record<string, unknown>` — `check` at 1.0.0 must report `TS2345` at `model-review.test.ts(29,46)`.
   - Commit: `test(pi-permission-model-judge): type tool-call fixture arguments as ToolCall["arguments"] (#1005)` — the scratch bump must not be committed.

## Risks and Mitigations

- **The scratch bump leaks into the commit.**
  Mitigation: the step restores `package.json` and the lockfile before committing; `git status --short` must list only the two test files.
- **`minimumReleaseAge` blocks installing 1.0.0 at implementation time.**
  Mitigation: the planning spike installed it successfully; if it is refused, use 0.99.2, which the issue reports the same error against.

## Open Questions

None.

[#1004]: https://github.com/gotgenes/pi-packages/issues/1004
