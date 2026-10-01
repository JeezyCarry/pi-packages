---
name: package-pi-nocd
description: |
  Package-specific context for @gotgenes/pi-nocd.
  Load when working on code, tests, or docs in packages/pi-nocd/.
---

# pi-nocd

Pi extension that injects the resolved working directory into the system prompt so the agent never `cd`-prefixes a command into the directory it is already in.

## Upstream assumptions

The `/upstream-impact` watchlist for this package; the `upstream-watch` skill defines the impact classes.
Paths are relative to the Pi checkout.

| Our assumption                                                                                                                         | Upstream file                                                                                                                                           | Breaks as                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Pi's prompt already states the working directory, so the extension only adds the prohibition                                           | `packages/coding-agent/src/core/system-prompt.ts` (`buildSystemPromptSections`, the cwd section)                                                        | Behavioral-silent: the block's premise and the agent's cwd source drift apart                                     |
| `event.systemPrompt` is a flat string, and returning `{ systemPrompt }` from `before_agent_start` replaces it without losing structure | `packages/coding-agent/src/core/extensions/runner.ts` (`emitBeforeAgentStart`); `packages/coding-agent/src/core/system-prompt.ts` (`forceSystemPrompt`) | Behavioral-silent: a returned string flattens a sectioned prompt, losing per-section updates and cache boundaries |
| `before_agent_start` handlers chain, each seeing the previous handler's prompt, so the `includes(block)` idempotency check works       | `packages/coding-agent/src/core/extensions/runner.ts` (`emitBeforeAgentStart` loop)                                                                     | Behavioral-silent: duplicate blocks stack                                                                         |
| A subagent inherits the parent's prompt text verbatim, so `findOurBlock` can rewrite the parent's block in place                       | `packages/coding-agent/src/core/system-prompt.ts`; `packages/coding-agent/src/core/extensions/runner.ts`                                                | Behavioral-silent: the child carries the parent's cwd, or two blocks                                              |
| `ctx.cwd` is the session working directory                                                                                             | `packages/coding-agent/src/core/extensions/types.ts` (`ExtensionContext.cwd`); `packages/coding-agent/src/core/session-cwd.ts`                          | Behavioral-silent: the injected directory is wrong                                                                |

`test/working-directory-prompt.test.ts` runs against hand-written prompts, not one Pi assembled, so it is not a canary.
