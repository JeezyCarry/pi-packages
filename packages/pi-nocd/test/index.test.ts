import type {
  ExtensionAPI,
  NormalizedBuildSystemPromptOptions,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import piNocd from "#src/index.js";
import { buildWorkingDirectoryPrompt } from "#src/working-directory-prompt.js";

/** The slice of the `before_agent_start` event and context the handler reads. */
interface TestEvent {
  systemPromptOptions: Pick<NormalizedBuildSystemPromptOptions, "sections">;
}

type BeforeAgentStartHandler = (
  event: TestEvent,
  ctx: { cwd: string },
) => unknown;

/** Register the extension against a stub `pi` and return its handler. */
function registerHandler(): BeforeAgentStartHandler {
  const handlers = new Map<string, BeforeAgentStartHandler>();
  const pi = {
    on: (event: string, handler: BeforeAgentStartHandler) => {
      handlers.set(event, handler);
    },
  };
  piNocd(pi as unknown as ExtensionAPI);
  const handler = handlers.get("before_agent_start");
  if (!handler) {
    throw new Error("piNocd registered no before_agent_start handler");
  }
  return handler;
}

function makeEvent(sections: Record<string, string> = {}): TestEvent {
  return { systemPromptOptions: { sections } };
}

describe("before_agent_start", () => {
  it("writes the block for the session's cwd as the working_directory section", () => {
    const event = makeEvent();

    registerHandler()(event, { cwd: "/srv/project" });

    expect(event.systemPromptOptions.sections).toEqual({
      working_directory: buildWorkingDirectoryPrompt("/srv/project"),
    });
  });

  it("leaves sections an earlier handler wrote in place", () => {
    const event = makeEvent({ mcp_servers: "- mcp__probe_srv (codemode)" });

    registerHandler()(event, { cwd: "/srv/project" });

    expect(event.systemPromptOptions.sections).toEqual({
      mcp_servers: "- mcp__probe_srv (codemode)",
      working_directory: buildWorkingDirectoryPrompt("/srv/project"),
    });
  });

  // A returned systemPrompt becomes Pi's forced prompt, which drops every
  // section a later handler adds, such as builtin:mcp's <mcp_servers>.
  it("returns nothing, so the prompt is not forced", () => {
    const result = registerHandler()(makeEvent(), { cwd: "/srv/project" });

    expect(result).toBeUndefined();
  });
});
