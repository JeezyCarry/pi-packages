import { describe, expect, it } from "vitest";
import { TurnLedger } from "#src/turn-ledger";

describe("TurnLedger", () => {
  describe("numberTurn", () => {
    it("numbers turns sequentially across roles, starting at 1", () => {
      const ledger = new TurnLedger();
      expect([
        ledger.numberTurn("u1", "user", []),
        ledger.numberTurn("a1", "assistant", []),
        ledger.numberTurn("u2", "user", []),
      ]).toEqual([1, 2, 3]);
    });
  });

  describe("describe", () => {
    it("names a user turn by number and role", () => {
      const ledger = new TurnLedger();
      ledger.numberTurn("u1", "user", []);
      expect(ledger.describe("u1")).toBe("turn 1 (user)");
    });

    it("names an assistant turn by number and role", () => {
      const ledger = new TurnLedger();
      ledger.numberTurn("u1", "user", []);
      ledger.numberTurn("a1", "assistant", []);
      expect(ledger.describe("a1")).toBe("turn 2 (assistant)");
    });

    it("names a tool result by its tool and the turn that made the call", () => {
      const ledger = new TurnLedger();
      ledger.numberTurn("u1", "user", []);
      ledger.numberTurn("a1", "assistant", ["call-1"]);
      ledger.recordToolResult("r1", "call-1", "bash");
      expect(ledger.describe("r1")).toBe("bash result from turn 2");
    });

    it("names a tool result by its tool alone when its call never rendered", () => {
      const ledger = new TurnLedger();
      ledger.recordToolResult("r1", "call-unseen", "read");
      expect(ledger.describe("r1")).toBe("read result");
    });

    it("names a custom message", () => {
      const ledger = new TurnLedger();
      ledger.recordCustomMessage("c1");
      expect(ledger.describe("c1")).toBe("custom message");
    });

    it("falls back to the raw id for an entry it never saw", () => {
      const ledger = new TurnLedger();
      ledger.numberTurn("u1", "user", []);
      expect(ledger.describe("gone")).toBe(
        "entry gone (outside this transcript)",
      );
    });

    it("records nothing for an entry without a string id", () => {
      const ledger = new TurnLedger();
      expect(ledger.numberTurn(undefined, "user", [])).toBe(1);
      ledger.recordCustomMessage(42);
      expect(ledger.describe("undefined")).toBe(
        "entry undefined (outside this transcript)",
      );
      expect(ledger.describe("42")).toBe("entry 42 (outside this transcript)");
    });
  });
});
