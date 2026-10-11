---
issue: 1007
issue_title: "pi-session-tools: transcripts drop `context_edit` entries, so omitted messages read as live context"
---

# Render context edits and system messages in transcripts

## Release Recommendation

**Release:** ship independently

`pi-session-tools` has no `docs/architecture/` directory and therefore no improvement roadmap, so no `Release:` tag or batch governs this issue.
The newest triage ranks it 7th as a silent wrong result in the transcript tools `/retro` and the triage template read, which argues for shipping as soon as it is green.

## Problem Statement

A reader of `read_session`, `read_parent_session`, or `read_session_file` (usually an agent running `/retro`'s lenses) sees every message as if the model still had it in context.
In the issue's reproduction (a real Pi 1.0.0 session with entries `message, context_edit, message`) the transcript reads `1. user / first question --- 2. user / second question`.
Nothing marks that "first question" was omitted from the model's context from that point on.

Two entry shapes newer than this package's `0.79.1` devDependency pin fall through `formatTranscript` silently:

- `context_edit` entries (Pi 0.87.0) take `formatMetadataEntry`'s `default: null` branch.
- `role: "system"` message entries (Pi 0.86) match no arm of the message loop's role chain.

`usage` entries (Pi 0.81.0) take the same default branch, and that is correct: they are bookkeeping.

## Goals

- Render each `context_edit` entry at its position as a `[context edit]` line naming its target in transcript terms (turn number and role, or a tool result's tool and call turn) and whether it was omitted or replaced.
- Render each `role: "system"` message as a `[system]` line: counts for the first one in the transcript (the prompt), names for later ones (updates).
- Keep `usage` entries silent.
- Leave turn numbering, `details.summary` counts, and every existing line unchanged.
- **Not breaking.**
  The change only adds lines for entry shapes that previously rendered as nothing.
  No default, parameter, count, or existing line changes on upgrade.
  This matches how `[session]` lines were added (`39a4104f`, non-breaking `feat`).
  Commit types are `fix(pi-session-tools):` with no `!`.

## Non-Goals

- *Annotating the target turn's header* (option C at the gate).
  Declined: turns between the target and the edit did see the message, so a forward tag on the header misreads them.
- *Printing replacement or system-instruction text.*
  It renders as counts and names only, in line with how tool result bodies are dropped.
- *Bumping the `@earendil-works/*` devDependencies* past `0.79.1`.
  The formatter reads both shapes through runtime guards, so it needs no SDK types.
  Tests use hand fixtures shaped against Pi's source.
- *Updating the tool `description` strings in `src/index.ts`* (line ~272: "metadata events (compaction, model changes)").
  That enumeration already omits session renames, and it is predicted unchanged here.
- *Counting system messages or context edits in `details.summary`.*
  `summarizeEntries` already counts both toward `totalEntries` like every other metadata entry, and neither as a message.
- *Deciding "leading" by session position rather than window position.*
  See Risks.

## Background

- `src/format-transcript.ts`:
  - `formatTranscript` runs two whole-array pre-passes (`buildToolResultMap`, `collectAssistantToolCallIds`), then one forward loop.
  - The loop numbers user/assistant turns with a local `turnNum`, folds tool results, and sends non-message entries to `formatMetadataEntry`, a `switch` on `entry.type` whose `default` returns `null`.
  - The cast `(entry as unknown as Record<string, unknown>).message as Record<string, unknown> | undefined` appears three times.
- `src/entry-summary.ts`: `summarizeEntries` counts only user/assistant messages and toolCall parts.
  Predicted unchanged (the tidy-first assessor read it and confirmed this).
- `src/entry-selection.ts`: `filterByTypes` drops `context_edit` unless the caller lists it in `types`, and `offset`/`limit` windows can cut a target off from its edit.
  The formatter therefore needs a fallback label for a target it never saw.
- Pi's shapes (read in the `../pi` checkout at `9fba660cf`):
  - `ContextEditEntry` (`packages/coding-agent/src/core/session-manager.ts`) is `{ type: "context_edit", id, parentId, timestamp, targetId: string, replacement: { content } | null }`.
    `null` omits the target from model context, and any other value replaces only its content.
    `appendContextEdit` throws unless the target is already on the active branch and is a user, assistant, or toolResult message or a `custom_message`.
    So an edit always follows its target in write order.
    Pi itself writes edits in `AgentSession._omitRecoveryAttempt`, which omits a failed assistant message and its tool results.
  - `SystemMessage` (`packages/ai/src/types.ts`) is `{ role: "system", content: string | TextContent[], sections?: Record<string, string | null>, toolsAdded?: Tool[], toolsRemoved?: ToolReference[] }`.
    The first system message is the prompt, and later ones change it (`null` section = removed).
    `getCurrentSystemMessage` in `packages/ai/src/utils/transcript.ts` defines "leading" by position, the same way.
- The `package-pi-session-tools` skill's upstream table row for the `SessionEntry` set names this issue as an open coverage gap.

## Design Overview

### Evidence

Measured over this machine's 400 newest session files (`~/.pi/agent/sessions/*/*.jsonl`, organic data, read with a throwaway script):

- 117 files contain a `role: "system"` message.
  114 have exactly one (the leading prompt: content `""`, 8–9 sections, 21 tools added).
  3 have one mid-session update (e.g. `sections: project_context, skills`, `toolsAdded: [subagent]`, `toolsRemoved: [{name: "subagent"}]`).
- All 26 `context_edit` entries are `replacement: null` targeting an assistant message.
- The issue's reproduction (`message, context_edit, message`, rendered with no marker) came from a real `SessionManager` session on Pi 0.99.2 and 1.0.0.
  It was not re-run here, because the pinned `0.79.1` SDK has no `appendContextEdit`.

### Output

```text
1. user
first question
---
2. assistant [p/m]
  [tool] bash — command: make → error
---
[context edit] turn 2 (assistant) omitted from context
---
[context edit] bash result from turn 2 omitted from context
```

Target labels, resolved by `TurnLedger.describe(targetId)`:

| Target                                   | Label                                  |
| ---------------------------------------- | -------------------------------------- |
| user/assistant turn N                    | `turn N (user)` / `turn N (assistant)` |
| toolResult whose call rendered in turn N | `<toolName> result from turn N`        |
| toolResult whose call did not render     | `<toolName> result`                    |
| `custom_message` entry                   | `custom message`                       |
| id never seen in the rendered entries    | `entry <id> (outside this transcript)` |

Verb: `replacement === null` → `omitted from context`; anything else → `replaced in context`.

System lines (measured lengths from the real sessions above):

```text
[system] prompt: 8 sections, 21 tools
[system] update — sections: project_context, skills; tools added: subagent; tools removed: subagent
```

- Prompt form (first system message in the entries): `[system] prompt:` + comma-joined non-empty parts among `N chars` (instruction text, via `extractTextContent`), `N section(s)` (non-null keys), `N tool(s)` (`toolsAdded`).
  If all parts are empty: `[system] prompt: empty`.
- Update form: `[system] update —` + `; `-joined non-empty clauses among `instructions: N chars`, `sections: a, b` (non-null keys), `sections removed: c` (null-valued keys), `tools added: x, y`, `tools removed: z`.
  If every clause is empty: `[system] update — no changes`.
- A system message consumes no turn number.

### New collaborator: `TurnLedger` (`src/turn-ledger.ts`)

The ledger owns the turn counter (moved out of the loop's `let turnNum`) and the id → label facts that a later `context_edit` needs.
It can be fed forward-only because an edit always follows its target.

```ts
export class TurnLedger {
  /** Number the next user/assistant turn and remember its id and its tool calls. */
  numberTurn(entryId: unknown, role: "user" | "assistant", toolCallIds: readonly string[]): number;
  recordToolResult(entryId: unknown, toolCallId: string, toolName: string): void;
  recordCustomMessage(entryId: unknown): void;
  /** Transcript-terms label for a context-edit target. */
  describe(targetId: string): string;
}
```

`entryId` is `unknown` because entries arrive as `TranscriptEntry` (`{ type }`) and the id is read through a guard; a non-string id records nothing.

Consumer sketch (`formatTranscript` loop), Tell-Don't-Ask with no reach-through:

```ts
if (role === "user") {
  parts.push(formatUserMessage(message, ledger.numberTurn(entry.id, "user", []), options));
} else if (role === "assistant") {
  parts.push(formatAssistantMessage(message, ledger.numberTurn(entry.id, "assistant", toolCallIdsOf(message)), resultMap));
}
// metadata branch: if (entry.type === "custom_message") ledger.recordCustomMessage(id);
//                  formatMetadataEntry(entry, ledger)  → case "context_edit": formatContextEdit(e, ledger)
```

`formatMetadataEntry` gains a `ledger: TurnLedger` parameter (only its `describe` is read).
`TurnLedger` imports nothing from `format-transcript.ts`, so the new `format-transcript → turn-ledger` edge closes no cycle.
The "first system message seen" flag is a local `let promptSeen = false` in `formatTranscript`.
It is read by the system arm, set to `true` right after that arm renders, and never cleared; its whole lifecycle lands in one step (step 4).

## Module-Level Changes

- `src/format-transcript.ts`:
  - Extract `messageOf(entry)` and `toolCallIdsOf(message)` (step 1).
  - Route turn numbering through `TurnLedger` (step 2).
  - Add the `context_edit` arm (`formatContextEdit`), add `usage` to the `default` comment, and record `custom_message` and toolResult entries (step 3).
  - Add the `system` arm and `formatSystemMessage` (step 4).
  - Update the module doc comment and `formatMetadataEntry`'s doc comment.
- `src/turn-ledger.ts`: new (step 2).
- `test/turn-ledger.test.ts`: new (step 2).
- `test/format-transcript.test.ts`: new `describe("context edits")` and `describe("system messages")` blocks, plus `makeToolResultEntry`/`makeContextEditEntry`/`makeSystemEntry` fixtures beside `makeUserEntry` (steps 3–4).
- `README.md`: the transcript paragraph (line ~56, "metadata events (compaction, model changes, session renames)") gains context edits and system prompt changes, plus a short `[context edit]` / `[system]` description with the outside-window fallback (step 5).
- `.pi/skills/package-pi-session-tools/SKILL.md`: rewrite the `SessionEntry` upstream row ("`usage` and `context_edit` are not yet handled" → `context_edit` rendered, `usage` silent by design).
  Add rows for the `ContextEditEntry` shape (`targetId`, `replacement: null`) and the `SystemMessage` fields (`sections`, `toolsAdded`, `toolsRemoved`), both behavioral-silent (step 5).
- Predicted unchanged:
  - `src/entry-summary.ts`, because it counts by role and type, which neither shape changes (checked by the assessor and re-read here).
  - `src/entry-selection.ts`, because it passes entries through untyped.
  - `src/index.ts`, per Non-Goals.
  - `test/read-session*.test.ts` and `test/read-parent-session.test.ts`, because no fixture there carries either shape (`grep -n 'context_edit\|"system"' packages/pi-session-tools/test` returns nothing today).

## Test Impact Analysis

1. The new tests made possible by extraction are `TurnLedger` unit tests (label resolution, fallback, tool-result-to-turn mapping).
   Without the ledger they could only run through full transcripts.
2. No existing test becomes redundant.
   The turn-numbering tests (`assigns sequential turn numbers…`, the elide block's `numbers turns exactly…`) stay and pin step 2's move.
3. The tool-folding tests stay as-is.
   They exercise `buildToolResultMap`/`collectAssistantToolCallIds`, which step 1 only re-plumbs through `messageOf`/`toolCallIdsOf`.

## Invariants at risk

No roadmap phase governs this package, so there are no `Outcome:` bullets to inherit.
Two prior behaviors are touched:

- Turn numbering counts only user/assistant turns ([#251]).
  It is pinned by `format-transcript.test.ts` "assigns sequential turn numbers across user and assistant messages", and by step 4's new test that a system message consumes no number.
- Branch markers render unchanged ([#944]).
  They are pinned by the `describe("branch markers")` block.
  Markers have no `id`, so the ledger never records them, and `describe` on such an id falls back.

## TDD Order

1. **`refactor(pi-session-tools): read entry messages and tool-call ids through shared helpers`**
   - Extract `messageOf(entry): Record<string, unknown> | undefined` and `toolCallIdsOf(message): string[]` in `src/format-transcript.ts`.
   - Replace the three casts and `collectAssistantToolCallIds`'s inner scan.
   - This prepares step 2's ledger and step 4's system arm, which both read the message, and lets step 2 obtain an assistant turn's call ids without making `formatAssistantMessage` report them.
   - No new tests: the full `format-transcript.test.ts` suite must stay green.
   - Re-read moved code against `code-design` before committing.
2. **`refactor(pi-session-tools): number transcript turns through a TurnLedger`**
   - Add `src/turn-ledger.ts` per the Design Overview and replace `formatTranscript`'s `let turnNum` with `ledger.numberTurn(...)`.
   - `recordToolResult`/`recordCustomMessage`/`describe` exist and are unit-tested, but nothing reads `describe` yet.
   - Tests (`test/turn-ledger.test.ts`, one `describe` per concern):
     - Numbering: 1, 2, 3 across roles.
     - Labels: `turn N (user|assistant)`, `<tool> result from turn N`, `<tool> result` for an unknown call, `custom message`, and `entry <id> (outside this transcript)` for an unseen id.
     - A non-string `entryId` records nothing.
   - Killing mutations:
     - Make `describe` return the outside-transcript fallback unconditionally.
       This kills every label test except the fallback.
     - In `numberTurn`, skip recording `toolCallIds`.
       This kills the "result from turn N" test only.
     - Make `numberTurn` return the counter before incrementing.
       This kills numbering here, plus the existing turn-numbering tests in `format-transcript.test.ts`.
3. **`fix(pi-session-tools): mark messages a context edit omitted or replaced in transcripts`**
   - Add the `context_edit` arm (`formatContextEdit(e, ledger)`) to `formatMetadataEntry` and pass it the ledger.
   - Record toolResult entries (all of them, folded or orphan) and `custom_message` entries in the loop.
   - Add `usage` to the `default` comment.
   - Add the `makeToolResultEntry`/`makeContextEditEntry` fixtures.
   - Tests in `describe("context edits")`:
     - The issue's repro: user, assistant, edit(target = user id, null), user.
       The edit line sits third, with no turn renumbering.
     - Replacement renders `replaced in context`.
     - A tool-result target renders `bash result from turn 2`.
     - A target absent from the entries renders the fallback with its id.
     - A `custom_message` target renders `custom message`.
     - A `usage` entry renders nothing.
   - Killing mutations:
     - Change `replacement === null` to `!== null`.
       This kills the omitted and replaced tests.
     - Delete `case "context_edit"`.
       This kills every test in the block except `usage`.
     - Remove the toolResult `recordToolResult` call.
       This kills the tool-result-target test (it falls back).
     - Add `case "usage": return "[usage]"`.
       This kills the `usage` test.
4. **`fix(pi-session-tools): show system prompt and tool-set changes in transcripts`**
   - Add the `role === "system"` arm and `formatSystemMessage(message, isPrompt)`, with `promptSeen` declared, read, and set in this step.
   - Add the `makeSystemEntry` fixture, shaped like the measured real entries (content `""`).
   - Tests in `describe("system messages")`:
     - The first system message renders `[system] prompt: 8 sections, 21 tools`.
     - Singular `1 section, 1 tool`.
     - Non-empty content adds `N chars`.
     - The second renders `[system] update — sections: project_context, skills; tools added: subagent; tools removed: subagent`.
     - A null section renders under `sections removed:`.
     - An all-empty update renders `no changes`.
     - A user turn after a system message is still `1. user`.
   - Killing mutations:
     - Initialize `promptSeen = true`.
       This kills the prompt-form tests.
     - Delete the `promptSeen = true` assignment.
       This kills the update-form tests.
     - Call `ledger.numberTurn` in the system arm.
       This kills the numbering test.
     - Count `null`-valued sections as present.
       This kills the `sections removed:` test.
5. **`docs(pi-session-tools): document context-edit and system lines in transcripts`**
   - Update `README.md` and `.pi/skills/package-pi-session-tools/SKILL.md` per Module-Level Changes.
   - Verify with `pnpm exec rumdl check packages/pi-session-tools/README.md .pi/skills/package-pi-session-tools/SKILL.md`.

## Risks and Mitigations

- **Windowed "prompt" mislabel.**
  "Prompt" means the first system message in the rendered entries.
  A window that excludes the session's real leading message, but includes a later update, renders that update in prompt form (counts).
  All 3 measured updates sit hundreds of entries after the leading message, so a tail `limit` that catches one without the other is reachable.
  Mitigation: the counts stay true statements about that message.
  Deciding by session position would need the unwindowed array, so this is listed as a Non-Goal.
- **Ids absent on old or hand-built entries.**
  `entryId` is guarded as `unknown`.
  An unrecorded target falls back to the outside-transcript label with its id rather than throwing.
- **A future Pi target kind** (a new editable role).
  It would get the fallback label, which is truthful but less specific.
  The skill's new upstream row flags the `ContextEditEntry` assumption for `/upstream-impact`.
- **Fixture drift from Pi's real shape.**
  Fixtures are copied from field names in Pi's source at `9fba660cf` and from the measured session entries above.
  No `SessionManager` round-trip is possible at the `0.79.1` pin.

## Open Questions

- None blocking.
  Whether `src/index.ts`'s tool descriptions should enumerate metadata line kinds can be revisited if a reader is observed missing them.

[#251]: https://github.com/gotgenes/pi-packages/issues/251
[#944]: https://github.com/gotgenes/pi-packages/issues/944
