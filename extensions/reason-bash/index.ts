/**
 * Force a `reason` on every bash tool call.
 *
 * Overrides the built-in `bash` tool (Pi supports overriding by registering a
 * tool with the same name) with a schema that REQUIRES a concise `reason`
 * describing the intent of the command. The reason is NOT executed — it exists
 * so the model always states why it is running a command, and so
 * pi-permission-system (which reads `input.reason`) can display the intent in
 * the approval dialog.
 *
 * Real execution is delegated unchanged to Pi's own bash tool via
 * `createBashTool`, so behavior, sandboxing, and bash permission rules are
 * preserved (the tool is still named `bash`, and `command` is still in input).
 *
 * Source of truth: this file (part of the pi-packages fork repo). Installed
 * into `~/.pi/agent/extensions/reason-bash/` by `install.sh`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
	const bash = createBashTool(process.cwd());

	pi.registerTool({
		...bash,
		description:
			"Execute a bash command in the current working directory. " +
			"You MUST provide a concise 'reason' stating the intent of this command " +
			"and what it accomplishes.",
		parameters: Type.Object({
			command: Type.String({ description: "The command line to execute" }),
			reason: Type.String({
				description:
					"Concise reason this command is run and what it accomplishes. Required on every call.",
			}),
			timeout: Type.Optional(
				Type.Number({ description: "Timeout in seconds (optional)" }),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return bash.execute(
				toolCallId,
				{
					command: params.command,
					...(params.timeout != null ? { timeout: params.timeout } : {}),
				},
				signal,
				onUpdate,
				ctx,
			);
		},
	});
}
