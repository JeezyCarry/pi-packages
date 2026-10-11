/**
 * turn-ledger.ts — Numbers transcript turns and remembers what each entry was.
 *
 * A context edit names its target by entry id, which a transcript never shows.
 * The ledger is fed forward as the transcript renders, so by the time an edit
 * arrives its target (always an earlier entry) has a label in transcript terms.
 */

export type TurnRole = "user" | "assistant";

export class TurnLedger {
  private turnCount = 0;
  private readonly labels = new Map<string, string>();
  private readonly callTurns = new Map<string, number>();

  /** Number the next user/assistant turn and remember its id and its tool calls. */
  numberTurn(
    entryId: unknown,
    role: TurnRole,
    toolCallIds: readonly string[],
  ): number {
    this.turnCount++;
    const turn = this.turnCount;
    this.label(entryId, `turn ${turn} (${role})`);
    for (const id of toolCallIds) this.callTurns.set(id, turn);
    return turn;
  }

  /** Remember a tool result by its tool and, when known, the turn that made the call. */
  recordToolResult(
    entryId: unknown,
    toolCallId: string,
    toolName: string,
  ): void {
    const turn = this.callTurns.get(toolCallId);
    this.label(
      entryId,
      turn === undefined
        ? `${toolName} result`
        : `${toolName} result from turn ${turn}`,
    );
  }

  recordCustomMessage(entryId: unknown): void {
    this.label(entryId, "custom message");
  }

  /** Transcript-terms label for a context-edit target. */
  describe(targetId: string): string {
    return (
      this.labels.get(targetId) ?? `entry ${targetId} (outside this transcript)`
    );
  }

  private label(entryId: unknown, label: string): void {
    if (typeof entryId === "string") this.labels.set(entryId, label);
  }
}
