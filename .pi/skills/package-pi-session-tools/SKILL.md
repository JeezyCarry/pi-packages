---
name: package-pi-session-tools
description: |
  Package-specific context for @gotgenes/pi-session-tools.
  Load when working on code, tests, or docs in packages/pi-session-tools/.
---

# pi-session-tools

Pi extension providing session metadata tools (naming, transcripts, sibling and subagent session lookup) for multi-session workflows.

## Upstream assumptions

The `/upstream-impact` watchlist for this package; the `upstream-watch` skill defines the impact classes.
Paths are relative to the Pi checkout.
This package re-implements Pi's session layout by reading files, so most of its rows are behavioral-silent: a mismatch yields an empty or wrong listing, not an error.

| Our assumption                                                                                                             | Upstream file                                                                                                                  | Breaks as                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| A cwd's session directory name is `--<cwd>--` with path separators replaced by `-`                                         | `packages/coding-agent/src/core/session-manager.ts` (`getDefaultSessionDirPath`)                                               | Behavioral-silent: the lookup misses the real directory                           |
| The sessions root is `~/.pi/agent/sessions`                                                                                | `packages/coding-agent/src/config.ts` (`getAgentDir`, `getSessionsDir`)                                                        | Behavioral-silent: `PI_CODING_AGENT_DIR` users get no sessions                    |
| A session file is `<ts>_<id>.jsonl`, its first line a `type: "session"` header, and its entries a tree via `id`/`parentId` | `packages/coding-agent/src/core/session-manager.ts` (file naming, `SessionHeader`, `SessionEntry`)                             | Behavioral-silent: malformed lines are skipped, so reads come back empty or wrong |
| The `SessionEntry` type set is the one `format-transcript.ts` switches on                                                  | `packages/coding-agent/src/core/session-manager.ts` (`SessionEntry` union)                                                     | Coverage-gap: a new entry type is dropped from transcripts                        |
| The live leaf is `getLeafId()`, and branch resolution mirrors `buildSessionPath`                                           | `packages/coding-agent/src/core/session-manager.ts` (`getLeafId`, `getEntries`, `buildSessionPath`)                            | Behavioral-silent: live entries are marked abandoned                              |
| Message roles and part shapes: `assistant`/`toolResult`/`bashExecution`, `toolCall` parts with `id`                        | `packages/ai/src/types.ts` (`AssistantMessage`, `ToolResultMessage`, `ToolCall`); `packages/coding-agent/src/core/messages.ts` | Behavioral-silent: read through runtime guards, so a rename prints "unknown"      |
| The built-in tool names `formatToolArgs` special-cases                                                                     | `packages/coding-agent/src/core/tools/index.ts` (`allToolNames`)                                                               | Behavioral-silent: arguments fall back to the generic formatter                   |
| The `app.tools.expand` keybinding id exists                                                                                | `packages/coding-agent/src/core/keybindings.ts`                                                                                | Behavioral-silent: a wrong or empty key hint                                      |

Subagent sessions under `<parent>/tasks/` are a `pi-subagents` layout, not Pi's; that assumption lives in this repo.
`test/session-file.test.ts` pins the encoding against our own formula; a probe that builds a real `SessionManager` session and compares its directory is the real canary.
