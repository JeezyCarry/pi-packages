import { describe, expect, it } from "vitest";
import { formatTranscript } from "#src/format-transcript";
import { BRANCH_MARKER_TYPE, type BranchMarkerEntry } from "#src/session-tree";

function omittedMarker(count: number): BranchMarkerEntry {
  return { type: BRANCH_MARKER_TYPE, marker: "omitted", count };
}

function beginMarker(count: number): BranchMarkerEntry {
  return { type: BRANCH_MARKER_TYPE, marker: "abandoned_begin", count };
}

function endMarker(): BranchMarkerEntry {
  return { type: BRANCH_MARKER_TYPE, marker: "abandoned_end" };
}

function makeUserEntry(content: unknown, id = "1") {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "2026-01-01T00:00:00Z",
    message: {
      role: "user",
      content,
      timestamp: 1000,
    },
  };
}

function makeAssistantEntry(
  textParts: string | string[],
  provider = "anthropic",
  model = "claude-sonnet-4-20250514",
  id = "2",
) {
  const contentArr = (Array.isArray(textParts) ? textParts : [textParts]).map(
    (t) => ({ type: "text", text: t }),
  );
  return {
    type: "message",
    id,
    parentId: "1",
    timestamp: "2026-01-01T00:00:01Z",
    message: {
      role: "assistant",
      content: contentArr,
      provider,
      model,
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 2000,
    },
  };
}

function makeBashCallEntry(id: string, callId: string, command: string) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "t",
    message: {
      role: "assistant",
      content: [
        { type: "toolCall", id: callId, name: "bash", arguments: { command } },
      ],
      provider: "p",
      model: "m",
    },
  };
}

function makeToolResultEntry(
  id: string,
  toolCallId: string,
  toolName: string,
  isError = false,
) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "t",
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [{ type: "text", text: "output" }],
      isError,
    },
  };
}

/** Shaped after Pi's `ContextEditEntry`: `replacement: null` omits the target. */
function makeContextEditEntry(
  id: string,
  targetId: string,
  replacement: { content: unknown } | null,
) {
  return {
    type: "context_edit",
    id,
    parentId: null,
    timestamp: "t",
    targetId,
    replacement,
  };
}

describe("formatTranscript — tool calls and result folding", () => {
  it("formats an assistant message with a single tool call and correlated result", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Let me read that file." },
            {
              type: "toolCall",
              id: "tc-1",
              name: "Read",
              arguments: { path: "src/auth.ts" },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "Read",
          content: [{ type: "text", text: "file contents here" }],
          isError: false,
        },
      },
    ];
    expect(formatTranscript(entries)).toBe(
      "1. assistant [anthropic/claude-sonnet-4-20250514]\nLet me read that file.\n  [tool] Read — path: src/auth.ts → completed",
    );
  });

  it("marks a tool call as error when the result is an error", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-2",
              name: "Bash",
              arguments: { command: "pnpm vitest run" },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-2",
          toolName: "Bash",
          content: [{ type: "text", text: "FAIL" }],
          isError: true,
        },
      },
    ];
    expect(formatTranscript(entries)).toBe(
      "1. assistant [anthropic/claude-sonnet-4-20250514]\n  [tool] Bash — command: pnpm vitest run → error",
    );
  });

  it("handles parallel tool calls with out-of-order results", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-a",
              name: "Read",
              arguments: { path: "a.ts" },
            },
            {
              type: "toolCall",
              id: "tc-b",
              name: "Read",
              arguments: { path: "b.ts" },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      // results arrive in reverse order
      {
        type: "message",
        id: "3",
        parentId: "2",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-b",
          toolName: "Read",
          content: [],
          isError: false,
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-a",
          toolName: "Read",
          content: [],
          isError: false,
        },
      },
    ];
    const result = formatTranscript(entries);
    expect(result).toBe(
      "1. assistant [anthropic/claude-sonnet-4-20250514]\n" +
        "  [tool] Read — path: a.ts → completed\n" +
        "  [tool] Read — path: b.ts → completed",
    );
  });

  it("renders orphan tool result (no matching call) as standalone line", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "missing-id",
          toolName: "Read",
          content: [],
          isError: false,
        },
      },
    ];
    expect(formatTranscript(entries)).toBe("  [result] Read → completed");
  });

  it("extracts path hint for Read tool", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "Read",
              arguments: { path: "src/index.ts" },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "Read",
          content: [],
          isError: false,
        },
      },
    ];
    expect(formatTranscript(entries)).toContain("Read — path: src/index.ts");
  });

  it("extracts command hint for Bash tool, truncated to 80 chars", () => {
    const longCmd = `pnpm vitest run ${"x".repeat(100)}`;
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "Bash",
              arguments: { command: longCmd },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "Bash",
          content: [],
          isError: false,
        },
      },
    ];
    const result = formatTranscript(entries);
    expect(result).toContain("Bash — command: pnpm vitest run ");
    // hint is capped at 80 chars
    const hint = /Bash — command: (.+?) →/.exec(result)?.[1] ?? "";
    expect(hint.length).toBeLessThanOrEqual(80);
  });

  it("extracts path hint for Edit tool", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "Edit",
              arguments: { path: "src/foo.ts", edits: [] },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "Edit",
          content: [],
          isError: false,
        },
      },
    ];
    expect(formatTranscript(entries)).toContain("Edit — path: src/foo.ts");
  });

  it("extracts pattern hint for Grep tool", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "Grep",
              arguments: { pattern: "formatTranscript", path: "src" },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "Grep",
          content: [],
          isError: false,
        },
      },
    ];
    expect(formatTranscript(entries)).toContain(
      "Grep — pattern: formatTranscript",
    );
  });

  it("falls back to first key-value for unknown tool", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "custom_tool",
              arguments: { query: "find me something" },
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "custom_tool",
          content: [],
          isError: false,
        },
      },
    ];
    expect(formatTranscript(entries)).toContain(
      "custom_tool — query: find me something",
    );
  });

  it("shows no arg hint when tool arguments are empty", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "get_session_name",
              arguments: {},
            },
          ],
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
      },
      {
        type: "message",
        id: "2",
        parentId: "1",
        timestamp: "t",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "get_session_name",
          content: [],
          isError: false,
        },
      },
    ];
    expect(formatTranscript(entries)).toContain(
      "  [tool] get_session_name → completed",
    );
  });
});

describe("formatTranscript — metadata entries", () => {
  it("formats a compaction entry", () => {
    const entries = [
      {
        type: "compaction",
        id: "1",
        parentId: null,
        timestamp: "t",
        summary: "summary text",
        firstKeptEntryId: "abc",
        tokensBefore: 48000,
      },
    ];
    expect(formatTranscript(entries)).toBe(
      "[compaction] Context compacted (48000 tokens before)",
    );
  });

  it("formats a model_change entry", () => {
    const entries = [
      {
        type: "model_change",
        id: "1",
        parentId: null,
        timestamp: "t",
        provider: "anthropic",
        modelId: "claude-opus-4-20250514",
      },
    ];
    expect(formatTranscript(entries)).toBe(
      "[model change] → anthropic/claude-opus-4-20250514",
    );
  });

  it("renders every model_change it is handed, leaving phantom pruning to entry selection", () => {
    const entries = [
      {
        type: "model_change",
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      },
      {
        type: "model_change",
        provider: "anthropic",
        modelId: "claude-opus-4-20250514",
      },
    ];
    expect(formatTranscript(entries)).toBe(
      "[model change] → anthropic/claude-sonnet-4-20250514\n\n---\n\n[model change] → anthropic/claude-opus-4-20250514",
    );
  });

  it("formats a thinking_level_change entry", () => {
    const entries = [
      {
        type: "thinking_level_change",
        id: "1",
        parentId: null,
        timestamp: "t",
        thinkingLevel: "high",
      },
    ];
    expect(formatTranscript(entries)).toBe("[thinking] → high");
  });

  it("formats a branch_summary entry with truncated snippet", () => {
    const longSummary = "This is a very long branch summary. ".repeat(10);
    const entries = [
      {
        type: "branch_summary",
        id: "1",
        parentId: null,
        timestamp: "t",
        fromId: "x",
        summary: longSummary,
      },
    ];
    const result = formatTranscript(entries);
    expect(result).toMatch(/^\[branch\] /);
    expect(result.length).toBeLessThan(longSummary.length);
  });

  it("formats a short branch_summary without truncation", () => {
    const entries = [
      {
        type: "branch_summary",
        id: "1",
        parentId: null,
        timestamp: "t",
        fromId: "x",
        summary: "Short summary.",
      },
    ];
    expect(formatTranscript(entries)).toBe("[branch] Short summary.");
  });

  it("formats a bashExecution message", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "bashExecution",
          command: "git status",
          output: "On branch main\nnothing to commit",
          exitCode: 0,
          cancelled: false,
          truncated: false,
          timestamp: 1000,
        },
      },
    ];
    expect(formatTranscript(entries)).toBe("  [bash] git status (exit: 0)");
  });

  it("formats a bashExecution message with undefined exit code", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: {
          role: "bashExecution",
          command: "sleep 5",
          output: "",
          exitCode: undefined,
          cancelled: true,
          truncated: false,
          timestamp: 1000,
        },
      },
    ];
    expect(formatTranscript(entries)).toBe("  [bash] sleep 5 (cancelled)");
  });

  it("omits custom entries", () => {
    const entries = [
      {
        type: "custom",
        id: "1",
        parentId: null,
        timestamp: "t",
        customType: "my-ext",
        data: { key: "value" },
      },
    ];
    expect(formatTranscript(entries)).toBe("");
  });

  it("omits label entries", () => {
    const entries = [
      {
        type: "label",
        id: "1",
        parentId: null,
        timestamp: "t",
        targetId: "x",
        label: "my label",
      },
    ];
    expect(formatTranscript(entries)).toBe("");
  });

  it("renders a session_info entry as a stage boundary", () => {
    const entries = [
      {
        type: "session_info",
        id: "1",
        parentId: null,
        timestamp: "t",
        name: "#934 Ship — Audit and prune the agent documentation",
      },
    ];
    expect(formatTranscript(entries)).toBe(
      "[session] → #934 Ship — Audit and prune the agent documentation",
    );
  });

  it("omits a session_info entry whose name is an explicit clear", () => {
    const entries = [
      {
        type: "session_info",
        id: "1",
        parentId: null,
        timestamp: "t",
        name: "   ",
      },
    ];
    expect(formatTranscript(entries)).toBe("");
  });

  it("omits custom_message entries", () => {
    const entries = [
      {
        type: "custom_message",
        id: "1",
        parentId: null,
        timestamp: "t",
        customType: "my-ext",
        content: "some content",
        display: true,
      },
    ];
    expect(formatTranscript(entries)).toBe("");
  });

  it("places metadata entries between conversation turns with separators", () => {
    const entries = [
      {
        type: "message",
        id: "1",
        parentId: null,
        timestamp: "t",
        message: { role: "user", content: "Hello", timestamp: 1000 },
      },
      {
        type: "compaction",
        id: "2",
        parentId: "1",
        timestamp: "t",
        summary: "compacted",
        firstKeptEntryId: "1",
        tokensBefore: 10000,
      },
      {
        type: "model_change",
        id: "3",
        parentId: "2",
        timestamp: "t",
        provider: "anthropic",
        modelId: "claude-opus-4-20250514",
      },
      {
        type: "message",
        id: "4",
        parentId: "3",
        timestamp: "t",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hi" }],
          provider: "anthropic",
          model: "claude-opus-4-20250514",
        },
      },
    ];
    const result = formatTranscript(entries);
    expect(result).toBe(
      "1. user\nHello\n\n---\n\n[compaction] Context compacted (10000 tokens before)\n\n---\n\n[model change] → anthropic/claude-opus-4-20250514\n\n---\n\n2. assistant [anthropic/claude-opus-4-20250514]\nHi",
    );
  });
});

describe("formatTranscript — basic message formatting", () => {
  it("returns empty string for empty entries", () => {
    expect(formatTranscript([])).toBe("");
  });

  it("formats a user message with string content", () => {
    const entries = [makeUserEntry("How do I fix the login bug?")];
    expect(formatTranscript(entries)).toBe(
      "1. user\nHow do I fix the login bug?",
    );
  });

  it("formats a user message with TextContent array, joining text parts", () => {
    const entries = [
      makeUserEntry([
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ]),
    ];
    expect(formatTranscript(entries)).toBe("1. user\nHello world");
  });

  it("skips non-text content (images) in user message array", () => {
    const entries = [
      makeUserEntry([
        { type: "text", text: "What is in this image?" },
        { type: "image", data: "base64data", mimeType: "image/png" },
      ]),
    ];
    expect(formatTranscript(entries)).toBe("1. user\nWhat is in this image?");
  });

  it("formats an assistant message with model attribution", () => {
    const entries = [
      makeAssistantEntry(
        "Let me help you.",
        "anthropic",
        "claude-opus-4-20250514",
      ),
    ];
    expect(formatTranscript(entries)).toBe(
      "1. assistant [anthropic/claude-opus-4-20250514]\nLet me help you.",
    );
  });

  it("uses [unknown/unknown] when provider/model fields are absent", () => {
    const entry = {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "t",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hi" }],
      },
    };
    expect(formatTranscript([entry])).toBe(
      "1. assistant [unknown/unknown]\nHi",
    );
  });

  it("assigns sequential turn numbers across user and assistant messages", () => {
    const entries = [
      makeUserEntry("First", "1"),
      makeAssistantEntry(
        "Second",
        "anthropic",
        "claude-sonnet-4-20250514",
        "2",
      ),
      makeUserEntry("Third", "3"),
    ];
    const result = formatTranscript(entries);
    expect(result).toContain("1. user\nFirst");
    expect(result).toContain(
      "2. assistant [anthropic/claude-sonnet-4-20250514]\nSecond",
    );
    expect(result).toContain("3. user\nThird");
  });

  it("joins entries with --- separator", () => {
    const entries = [
      makeUserEntry("Hello", "1"),
      makeAssistantEntry(
        "Hi there",
        "anthropic",
        "claude-sonnet-4-20250514",
        "2",
      ),
    ];
    expect(formatTranscript(entries)).toBe(
      "1. user\nHello\n\n---\n\n2. assistant [anthropic/claude-sonnet-4-20250514]\nHi there",
    );
  });

  it("omits thinking content from assistant message", () => {
    const entry = {
      type: "message",
      id: "1",
      parentId: null,
      timestamp: "t",
      message: {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "Let me reason...",
            thinkingSignature: "sig",
          },
          { type: "text", text: "The answer is 42." },
        ],
        provider: "anthropic",
        model: "claude-opus-4-20250514",
      },
    };
    expect(formatTranscript([entry])).toBe(
      "1. assistant [anthropic/claude-opus-4-20250514]\nThe answer is 42.",
    );
  });

  it("concatenates multiple text blocks in assistant message", () => {
    const entries = [makeAssistantEntry(["First block.", "Second block."])];
    expect(formatTranscript(entries)).toBe(
      "1. assistant [anthropic/claude-sonnet-4-20250514]\nFirst block.\nSecond block.",
    );
  });
});

describe("formatTranscript — eliding user text", () => {
  const mixed = [
    makeUserEntry("a long prompt body"),
    makeAssistantEntry("the reply"),
    {
      type: "session_info",
      id: "3",
      parentId: "2",
      timestamp: "t",
      name: "#940 TDD",
    },
    makeUserEntry("another prompt", "4"),
  ];

  it("replaces a user body with its length", () => {
    const result = formatTranscript(mixed, { elideUserText: true });
    expect(result).toContain("1. user\n[text elided: 18 chars]");
    expect(result).toContain("3. user\n[text elided: 14 chars]");
    expect(result).not.toContain("a long prompt body");
  });

  it("numbers turns exactly as the unelided transcript does", () => {
    const turnHeaders = (text: string) =>
      text.split("\n").filter((line) => /^\d+\. (user|assistant)/.test(line));
    expect(
      turnHeaders(formatTranscript(mixed, { elideUserText: true })),
    ).toEqual(turnHeaders(formatTranscript(mixed)));
  });

  it("leaves assistant turns, tool lines, and metadata untouched", () => {
    const withoutUserTurns = (text: string) =>
      text
        .split("\n\n---\n\n")
        .filter((block) => !/^\d+\. user\n/.test(block))
        .join("\n\n---\n\n");
    expect(
      withoutUserTurns(formatTranscript(mixed, { elideUserText: true })),
    ).toBe(withoutUserTurns(formatTranscript(mixed)));
  });

  it("still renders a turn whose body is empty", () => {
    const result = formatTranscript([makeUserEntry("")], {
      elideUserText: true,
    });
    expect(result).toBe("1. user\n[text elided: 0 chars]");
  });

  it("renders the body when the option is absent", () => {
    expect(formatTranscript([makeUserEntry("hello")], {})).toBe(
      "1. user\nhello",
    );
  });
});

describe("branch markers", () => {
  it("names the omitted count and how to see the entries", () => {
    expect(formatTranscript([omittedMarker(331)])).toBe(
      '[abandoned branch] 331 entries omitted (branches: "all" to include)',
    );
  });

  it("renders a single omitted entry in the singular", () => {
    expect(formatTranscript([omittedMarker(1)])).toBe(
      '[abandoned branch] 1 entry omitted (branches: "all" to include)',
    );
  });

  it("brackets an abandoned run", () => {
    expect(
      formatTranscript([
        beginMarker(2),
        makeUserEntry("retracted", "2"),
        endMarker(),
      ]),
    ).toBe(
      "[abandoned branch begins] 2 entries\n\n---\n\n" +
        "1. user\nretracted\n\n---\n\n" +
        "[abandoned branch ends]",
    );
  });

  it("omits a marker whose variant it does not recognize", () => {
    const unknownVariant = {
      type: BRANCH_MARKER_TYPE,
      marker: "nonsense",
    } as unknown as BranchMarkerEntry;
    expect(formatTranscript([unknownVariant, makeUserEntry("hello")])).toBe(
      "1. user\nhello",
    );
  });
});

describe("context edits", () => {
  it("marks an omitted user turn where the edit happened, without renumbering", () => {
    const entries = [
      makeUserEntry("first question", "u1"),
      makeAssistantEntry("first answer", "p", "m", "a1"),
      makeContextEditEntry("e1", "u1", null),
      makeUserEntry("second question", "u2"),
    ];
    expect(formatTranscript(entries)).toBe(
      [
        "1. user\nfirst question",
        "2. assistant [p/m]\nfirst answer",
        "[context edit] turn 1 (user) omitted from context",
        "3. user\nsecond question",
      ].join("\n\n---\n\n"),
    );
  });

  it("marks a replaced turn as replaced", () => {
    const entries = [
      makeUserEntry("q", "u1"),
      makeAssistantEntry("long answer", "p", "m", "a1"),
      makeContextEditEntry("e1", "a1", { content: "short answer" }),
    ];
    expect(formatTranscript(entries).split("\n\n---\n\n").at(-1)).toBe(
      "[context edit] turn 2 (assistant) replaced in context",
    );
  });

  it("names a tool-result target by its tool and its call's turn", () => {
    const entries = [
      makeUserEntry("build it", "u1"),
      makeBashCallEntry("a1", "call-1", "make"),
      makeToolResultEntry("r1", "call-1", "bash", true),
      makeContextEditEntry("e1", "a1", null),
      makeContextEditEntry("e2", "r1", null),
    ];
    expect(formatTranscript(entries)).toBe(
      [
        "1. user\nbuild it",
        "2. assistant [p/m]\n  [tool] bash — command: make → error",
        "[context edit] turn 2 (assistant) omitted from context",
        "[context edit] bash result from turn 2 omitted from context",
      ].join("\n\n---\n\n"),
    );
  });

  it("names a target outside the rendered entries by its id", () => {
    const entries = [makeContextEditEntry("e1", "abc123", null)];
    expect(formatTranscript(entries)).toBe(
      "[context edit] entry abc123 (outside this transcript) omitted from context",
    );
  });

  it("names a custom-message target", () => {
    const entries = [
      {
        type: "custom_message",
        id: "c1",
        parentId: null,
        timestamp: "t",
        customType: "my-ext",
        content: "injected",
        display: false,
      },
      makeContextEditEntry("e1", "c1", null),
    ];
    expect(formatTranscript(entries)).toBe(
      "[context edit] custom message omitted from context",
    );
  });

  it("keeps usage entries silent", () => {
    const entries = [
      {
        type: "usage",
        id: "1",
        parentId: null,
        timestamp: "t",
        kind: "cache_warm",
        provider: "p",
        model: "m",
        usage: { input: 1, output: 0 },
      },
    ];
    expect(formatTranscript(entries)).toBe("");
  });
});

/** Shaped after Pi's `SystemMessage` as persisted in real sessions (content `""`). */
function makeSystemEntry(
  id: string,
  fields: {
    content?: unknown;
    sections?: Record<string, string | null>;
    toolsAdded?: { name: string }[];
    toolsRemoved?: { name: string }[];
  },
) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "t",
    message: { role: "system", content: "", timestamp: 0, ...fields },
  };
}

function sectionsNamed(...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, `<${name}>`]));
}

function toolsNamed(...names: string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

describe("system messages", () => {
  const leadingSections = sectionsNamed(
    "preamble",
    "tools",
    "rules",
    "docs",
    "addendum",
    "project_context",
    "skills",
    "cwd",
  );
  const leadingTools = toolsNamed(
    ...Array.from({ length: 21 }, (_, i) => `tool${i}`),
  );

  describe("the first system message, the prompt", () => {
    it("renders section and tool counts", () => {
      const entries = [
        makeSystemEntry("s1", {
          sections: leadingSections,
          toolsAdded: leadingTools,
        }),
      ];
      expect(formatTranscript(entries)).toBe(
        "[system] prompt: 8 sections, 21 tools",
      );
    });

    it("uses the singular for one section and one tool", () => {
      const entries = [
        makeSystemEntry("s1", {
          sections: sectionsNamed("preamble"),
          toolsAdded: toolsNamed("read"),
        }),
      ];
      expect(formatTranscript(entries)).toBe(
        "[system] prompt: 1 section, 1 tool",
      );
    });

    it("counts instruction text by characters", () => {
      const entries = [
        makeSystemEntry("s1", {
          content: [{ type: "text", text: "Be terse." }],
          sections: sectionsNamed("cwd"),
        }),
      ];
      expect(formatTranscript(entries)).toBe(
        "[system] prompt: 9 chars, 1 section",
      );
    });

    it("renders an empty prompt as empty", () => {
      expect(formatTranscript([makeSystemEntry("s1", {})])).toBe(
        "[system] prompt: empty",
      );
    });

    it("consumes no turn number", () => {
      const entries = [
        makeSystemEntry("s1", { sections: sectionsNamed("cwd") }),
        makeUserEntry("hello", "u1"),
      ];
      expect(formatTranscript(entries)).toBe(
        "[system] prompt: 1 section\n\n---\n\n1. user\nhello",
      );
    });
  });

  describe("a later system message, an update", () => {
    const prompt = makeSystemEntry("s1", {
      sections: leadingSections,
      toolsAdded: leadingTools,
    });

    function renderUpdate(update: ReturnType<typeof makeSystemEntry>): string {
      return formatTranscript([prompt, update]).split("\n\n---\n\n")[1] ?? "";
    }

    it("names the sections and tools it changes", () => {
      const update = makeSystemEntry("s2", {
        sections: sectionsNamed("project_context", "skills"),
        toolsAdded: toolsNamed("subagent"),
        toolsRemoved: toolsNamed("subagent"),
      });
      expect(renderUpdate(update)).toBe(
        "[system] update — sections: project_context, skills; tools added: subagent; tools removed: subagent",
      );
    });

    it("lists null-valued sections as removed", () => {
      const update = makeSystemEntry("s2", {
        sections: { skills: "<skills>", docs: null },
      });
      expect(renderUpdate(update)).toBe(
        "[system] update — sections: skills; sections removed: docs",
      );
    });

    it("counts added instruction text by characters", () => {
      const update = makeSystemEntry("s2", { content: "Stop early." });
      expect(renderUpdate(update)).toBe(
        "[system] update — instructions: 11 chars",
      );
    });

    it("renders an update with nothing in it as no changes", () => {
      expect(renderUpdate(makeSystemEntry("s2", {}))).toBe(
        "[system] update — no changes",
      );
    });
  });
});
