/**
 * format-transcript.ts — Formats Pi session entries as a human-readable transcript.
 *
 * Preserves conversation flow (user/assistant turns, tool calls, metadata events)
 * while dropping noise (thinking content, image data, token usage, tool result bodies).
 */

import { TurnLedger } from "./turn-ledger.js";

/**
 * Minimal structural supertype for session entries.
 * Accepts SDK SessionEntry[] without index-signature conflicts.
 * Formatter functions cast to Record<string, unknown> internally where they
 * need to access fields beyond `type`.
 */
export interface TranscriptEntry {
  type: string;
}

/** Rendering choices a caller can make about how much of each turn to show. */
export interface TranscriptOptions {
  /**
   * Replace each user turn's body with a length placeholder.
   * A stage-attribution pass wants the shape of a session, not its prompts.
   */
  elideUserText?: boolean;
}

interface ToolResultInfo {
  toolName: string;
  isError: boolean;
}

/**
 * Extract plain text from user message content.
 * Handles both string content and TextContent[] arrays (skipping images).
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type: "text"; text: string } =>
          typeof c === "object" &&
          c !== null &&
          (c as { type: string }).type === "text" &&
          typeof (c as { text: string }).text === "string",
      )
      .map((c) => c.text)
      .join("");
  }
  return "";
}

/** Extract a brief one-line argument hint for well-known tool names. */
function extractToolArgHint(
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    case "Read":
    case "Edit":
    case "Write":
    case "find":
      if (typeof args.path === "string") return `path: ${args.path}`;
      break;
    case "Bash":
      if (typeof args.command === "string") {
        return `command: ${args.command.slice(0, 80)}`;
      }
      break;
    case "Grep":
      if (typeof args.pattern === "string") return `pattern: ${args.pattern}`;
      break;
    default: {
      // Fall back to first key-value pair
      for (const [key, val] of Object.entries(args)) {
        if (typeof val === "string") return `${key}: ${val}`;
        break; // only inspect the first entry
      }
    }
  }
  return "";
}

function formatToolCallLine(
  toolCall: Record<string, unknown>,
  resultMap: Map<string, ToolResultInfo>,
): string {
  const name = typeof toolCall.name === "string" ? toolCall.name : "unknown";
  const id = typeof toolCall.id === "string" ? toolCall.id : "";
  const rawArgs = toolCall.arguments;
  const args =
    typeof rawArgs === "object" && rawArgs !== null
      ? (rawArgs as Record<string, unknown>)
      : {};

  const hint = extractToolArgHint(name, args);
  const sep = hint ? ` \u2014 ${hint}` : "";

  const result = id ? resultMap.get(id) : undefined;
  const status = result ? (result.isError ? "error" : "completed") : "pending";

  return `  [tool] ${name}${sep} \u2192 ${status}`;
}

/** Build a map of toolCallId → result info from all toolResult message entries. */
function buildToolResultMap(
  entries: TranscriptEntry[],
): Map<string, ToolResultInfo> {
  const map = new Map<string, ToolResultInfo>();
  for (const entry of entries) {
    const msg = messageOf(entry);
    if (msg?.role !== "toolResult") continue;
    const toolCallId = typeof msg.toolCallId === "string" ? msg.toolCallId : "";
    if (!toolCallId) continue;
    map.set(toolCallId, {
      toolName: typeof msg.toolName === "string" ? msg.toolName : "unknown",
      isError: msg.isError === true,
    });
  }
  return map;
}

/** Collect all toolCallIds that appear in assistant message content arrays. */
function collectAssistantToolCallIds(entries: TranscriptEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    const msg = messageOf(entry);
    if (msg?.role !== "assistant") continue;
    for (const id of toolCallIdsOf(msg)) ids.add(id);
  }
  return ids;
}

/** The message a `message` entry carries, or `undefined` for any other entry. */
function messageOf(
  entry: TranscriptEntry,
): Record<string, unknown> | undefined {
  if (entry.type !== "message") return undefined;
  const message = (entry as unknown as Record<string, unknown>).message;
  return typeof message === "object" && message !== null
    ? (message as Record<string, unknown>)
    : undefined;
}

/** An entry's `id`, unguarded: the ledger records only string ids. */
function idOf(entry: TranscriptEntry): unknown {
  return (entry as unknown as Record<string, unknown>).id;
}

/** The ids of the `toolCall` parts in a message's content array. */
function toolCallIdsOf(message: Record<string, unknown>): string[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const ids: string[] = [];
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const p = part as Record<string, unknown>;
    if (p.type === "toolCall" && typeof p.id === "string") ids.push(p.id);
  }
  return ids;
}

function formatUserMessage(
  message: Record<string, unknown>,
  num: number,
  options: TranscriptOptions,
): string {
  const text = extractTextContent(message.content);
  const body = options.elideUserText
    ? `[text elided: ${text.length} chars]`
    : text;
  return `${num}. user\n${body}`;
}

function formatAssistantMessage(
  message: Record<string, unknown>,
  num: number,
  resultMap: Map<string, ToolResultInfo>,
): string {
  const provider =
    typeof message.provider === "string" ? message.provider : "unknown";
  const model = typeof message.model === "string" ? message.model : "unknown";
  const header = `${num}. assistant [${provider}/${model}]`;

  const content = message.content;
  if (!Array.isArray(content)) return header;

  const lines: string[] = [header];
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const p = part as Record<string, unknown>;
    if (p.type === "text" && typeof p.text === "string") {
      lines.push(p.text);
    } else if (p.type === "toolCall") {
      lines.push(formatToolCallLine(p, resultMap));
    }
    // thinking content is intentionally omitted
  }
  return lines.join("\n");
}

const BRANCH_SUMMARY_SNIPPET_LENGTH = 100;

/**
 * Format a non-message session entry (compaction, model change, etc.).
 * `ledger` names a context edit's target in transcript terms.
 */
function formatMetadataEntry(
  entry: TranscriptEntry,
  ledger: TurnLedger,
): string | null {
  // Cast once to access all non-type fields through runtime guards.
  const e = entry as unknown as Record<string, unknown>;
  switch (entry.type) {
    case "compaction": {
      const tokens = typeof e.tokensBefore === "number" ? e.tokensBefore : 0;
      return `[compaction] Context compacted (${tokens} tokens before)`;
    }
    case "model_change": {
      const provider = typeof e.provider === "string" ? e.provider : "unknown";
      const modelId = typeof e.modelId === "string" ? e.modelId : "unknown";
      return `[model change] \u2192 ${provider}/${modelId}`;
    }
    case "thinking_level_change": {
      const level =
        typeof e.thinkingLevel === "string" ? e.thinkingLevel : "unknown";
      return `[thinking] \u2192 ${level}`;
    }
    case "session_info": {
      // An empty name is the SDK's explicit title clear, not a stage boundary.
      const name = typeof e.name === "string" ? e.name.trim() : "";
      return name ? `[session] \u2192 ${name}` : null;
    }
    case "branch_marker":
      return formatBranchMarker(e);
    case "branch_summary": {
      const summary = typeof e.summary === "string" ? e.summary : "";
      const snippet = summary.slice(0, BRANCH_SUMMARY_SNIPPET_LENGTH);
      const ellipsis =
        summary.length > BRANCH_SUMMARY_SNIPPET_LENGTH ? "..." : "";
      return `[branch] ${snippet}${ellipsis}`;
    }
    case "context_edit":
      return formatContextEdit(e, ledger);
    default:
      // custom, label, custom_message, usage: omitted
      return null;
  }
}

/**
 * Format a context edit: which earlier entry it changed, and whether that
 * entry was dropped from model context (`replacement: null`) or rewritten.
 */
function formatContextEdit(
  edit: Record<string, unknown>,
  ledger: TurnLedger,
): string {
  const targetId = typeof edit.targetId === "string" ? edit.targetId : "";
  const effect =
    edit.replacement === null ? "omitted from context" : "replaced in context";
  return `[context edit] ${ledger.describe(targetId)} ${effect}`;
}

/**
 * Format a synthetic branch marker.
 *
 * `omitted` stands in for a run of abandoned entries that live-path rendering
 * dropped, and names the parameter that brings them back; the begin/end pair
 * brackets the same run when the caller asked to see it.
 */
function formatBranchMarker(marker: Record<string, unknown>): string | null {
  const count = typeof marker.count === "number" ? marker.count : 0;
  const entries = count === 1 ? "1 entry" : `${count} entries`;
  switch (marker.marker) {
    case "omitted":
      return `[abandoned branch] ${entries} omitted (branches: "all" to include)`;
    case "abandoned_begin":
      return `[abandoned branch begins] ${entries}`;
    case "abandoned_end":
      return "[abandoned branch ends]";
    default:
      return null;
  }
}

/**
 * Format the leading system message as counts: its instruction text, sections,
 * and tools are the whole prompt, which no reader wants verbatim.
 */
function formatSystemPrompt(message: Record<string, unknown>): string {
  const { instructionChars, sections, toolsAdded } = readSystemMessage(message);
  const counts = [
    instructionChars > 0 ? `${instructionChars} chars` : "",
    countOf(sections.length, "section"),
    countOf(toolsAdded.length, "tool"),
  ].filter(Boolean);
  return `[system] prompt: ${counts.length > 0 ? counts.join(", ") : "empty"}`;
}

/** Format a later system message by naming what it changes. */
function formatSystemUpdate(message: Record<string, unknown>): string {
  const {
    instructionChars,
    sections,
    sectionsRemoved,
    toolsAdded,
    toolsRemoved,
  } = readSystemMessage(message);
  const clauses = [
    instructionChars > 0 ? `instructions: ${instructionChars} chars` : "",
    namedClause("sections", sections),
    namedClause("sections removed", sectionsRemoved),
    namedClause("tools added", toolsAdded),
    namedClause("tools removed", toolsRemoved),
  ].filter(Boolean);
  return `[system] update \u2014 ${clauses.length > 0 ? clauses.join("; ") : "no changes"}`;
}

interface SystemMessageSummary {
  instructionChars: number;
  /** Sections set by this message. */
  sections: string[];
  /** Sections this message removes (`null`-valued). */
  sectionsRemoved: string[];
  toolsAdded: string[];
  toolsRemoved: string[];
}

function readSystemMessage(
  message: Record<string, unknown>,
): SystemMessageSummary {
  const rawSections =
    typeof message.sections === "object" && message.sections !== null
      ? Object.entries(message.sections as Record<string, unknown>)
      : [];
  return {
    instructionChars: extractTextContent(message.content).length,
    sections: rawSections.filter(([, v]) => v !== null).map(([k]) => k),
    sectionsRemoved: rawSections.filter(([, v]) => v === null).map(([k]) => k),
    toolsAdded: toolNamesOf(message.toolsAdded),
    toolsRemoved: toolNamesOf(message.toolsRemoved),
  };
}

function toolNamesOf(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((tool) =>
      typeof tool === "object" && tool !== null
        ? (tool as Record<string, unknown>).name
        : undefined,
    )
    .filter((name): name is string => typeof name === "string");
}

function countOf(count: number, noun: string): string {
  if (count === 0) return "";
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function namedClause(label: string, names: string[]): string {
  return names.length > 0 ? `${label}: ${names.join(", ")}` : "";
}

/** Format a bashExecution message entry (command + exit code, no output). */
function formatBashMessage(message: Record<string, unknown>): string {
  const command = typeof message.command === "string" ? message.command : "";
  const exitCode =
    typeof message.exitCode === "number" ? message.exitCode : undefined;
  if (message.cancelled === true || exitCode === undefined) {
    return `  [bash] ${command} (cancelled)`;
  }
  return `  [bash] ${command} (exit: ${exitCode})`;
}

/**
 * Format a session entry array as a human-readable transcript.
 *
 * Sequential numbering counts only user and assistant conversation turns.
 * Tool results are folded into their corresponding assistant tool call lines
 * by matching toolCallId. Orphan tool results (no matching call) render
 * as standalone lines. Entries are separated by `---` dividers.
 */
export function formatTranscript(
  entries: TranscriptEntry[],
  options: TranscriptOptions = {},
): string {
  const resultMap = buildToolResultMap(entries);
  const assistantToolCallIds = collectAssistantToolCallIds(entries);

  const parts: string[] = [];
  const ledger = new TurnLedger();
  // The first system message is the prompt; later ones update it.
  let promptSeen = false;

  for (const entry of entries) {
    if (entry.type !== "message") {
      if (entry.type === "custom_message") {
        ledger.recordCustomMessage(idOf(entry));
      }
      const formatted = formatMetadataEntry(entry, ledger);
      if (formatted !== null) parts.push(formatted);
      continue;
    }

    const message = messageOf(entry);
    if (!message) continue;

    const role = message.role;
    const entryId = idOf(entry);

    if (role === "user") {
      const turn = ledger.numberTurn(entryId, "user", []);
      parts.push(formatUserMessage(message, turn, options));
    } else if (role === "assistant") {
      const turn = ledger.numberTurn(
        entryId,
        "assistant",
        toolCallIdsOf(message),
      );
      parts.push(formatAssistantMessage(message, turn, resultMap));
    } else if (role === "toolResult") {
      const toolCallId =
        typeof message.toolCallId === "string" ? message.toolCallId : "";
      const toolName =
        typeof message.toolName === "string" ? message.toolName : "unknown";
      ledger.recordToolResult(entryId, toolCallId, toolName);
      // Render only orphan results (not folded into an assistant message)
      if (!assistantToolCallIds.has(toolCallId)) {
        const status = message.isError === true ? "error" : "completed";
        parts.push(`  [result] ${toolName} \u2192 ${status}`);
      }
    } else if (role === "bashExecution") {
      parts.push(formatBashMessage(message));
    } else if (role === "system") {
      parts.push(
        promptSeen ? formatSystemUpdate(message) : formatSystemPrompt(message),
      );
      promptSeen = true;
    }
    // custom, compactionSummary, branchSummary message roles: omitted
  }

  return parts.join("\n\n---\n\n");
}
