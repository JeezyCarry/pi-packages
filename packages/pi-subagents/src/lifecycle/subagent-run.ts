/**
 * subagent-run.ts — One run of a subagent and the handles it holds until it ends.
 *
 * A subagent is a sequence of runs: the initial run, then one per resume. Each
 * run is born with its own abort lever and its caller-signal wiring, and keeps
 * the record observer's unsubscribe until it ends, so nothing a run wires
 * outlives it on the per-agent record.
 */

/** Which run of a subagent this is: the one that created its session, or a resume of it. */
export type RunKind = "initial" | "resume";

/** One run of a subagent (the initial run or a resume) and the handles it holds until it ends. */
export class SubagentRun {
	private readonly controller = new AbortController();
	private detachCallerSignal?: () => void;
	private unsubscribeObserver?: () => void;

	/**
	 * Wire the caller's signal, when there is one, so firing it calls onCallerAbort.
	 *
	 * A signal that has already fired never fires again, so a listener on it would
	 * be dead on arrival: the run is born aborted instead. onCallerAbort is not
	 * called for it — the run is not yet anyone's current run, so the owner
	 * reads `aborted` once it holds the run.
	 */
	constructor(
		readonly kind: RunKind,
		callerSignal: AbortSignal | undefined,
		onCallerAbort: () => void,
	) {
		if (!callerSignal) return;
		if (callerSignal.aborted) {
			this.controller.abort();
			return;
		}
		const listener = () => onCallerAbort();
		callerSignal.addEventListener("abort", listener, { once: true });
		this.detachCallerSignal = () => callerSignal.removeEventListener("abort", listener);
	}

	/** The run's own lever, handed to the turn loop. */
	get signal(): AbortSignal {
		return this.controller.signal;
	}

	get aborted(): boolean {
		return this.controller.signal.aborted;
	}

	abort(): void {
		this.controller.abort();
	}

	/** Keep the record-observer unsubscribe until the run ends. */
	attachObserver(unsubscribe: () => void): void {
		this.unsubscribeObserver = unsubscribe;
	}

	/** Detach the caller signal and unsubscribe the observer. Idempotent. */
	release(): void {
		this.unsubscribeObserver?.();
		this.unsubscribeObserver = undefined;
		this.detachCallerSignal?.();
		this.detachCallerSignal = undefined;
	}
}
