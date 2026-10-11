/**
 * pi-nocd — Add an instruction against `cd`-prefixing the working directory.
 *
 * Hooks `before_agent_start` and writes a `working_directory` section to the
 * system prompt forbidding `cd`-into-cwd command prefixes. Pi's prompt already
 * states the resolved CWD in its `<cwd>` section, but ships no instruction
 * against `cd`-prefixing it. This adds that rule to defeat the habit of
 * prefixing commands with `cd $(pwd) &&`.
 *
 * The handler edits `systemPromptOptions.sections` and returns nothing. A
 * returned `systemPrompt` would become Pi's forced prompt, which drops every
 * section a later handler adds (such as builtin:mcp's `<mcp_servers>`).
 *
 * A subagent child writes its own section for its own cwd: pi-subagents drops
 * everything from the parent's `<cwd>` section onward, this section included,
 * when it builds the child's prompt.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildWorkingDirectoryPrompt,
  WORKING_DIRECTORY_SECTION,
} from "./working-directory-prompt.js";

export default function piNocd(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event, ctx) => {
    event.systemPromptOptions.sections[WORKING_DIRECTORY_SECTION] =
      buildWorkingDirectoryPrompt(ctx.cwd);
  });
}
