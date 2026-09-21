import { completedRcb } from './rcb';
import { toJoinNumberSignalName } from '../signal/signal-name';
import type { SignalRegistry } from '../signal/signal-registry';
import type { Logger, ResyncRange, ResyncRangeEntry, SignalType } from '../types';

export const RESYNC_SIGNAL_NAME = 'Csig.State_Synchronization';
export const RESYNC_DEFAULT_TIMEOUT_MS = 60_000;

/** The `state` values the control system sends on {@link RESYNC_SIGNAL_NAME}. */
export const ResyncState = {
  startOfUpdate: 'StartOfUpdate',
  startOfUpdateRange: 'StartOfUpdateRange',
  startOfUpdateRangeSO: 'StartOfUpdateRangeSO',
  endOfUpdate: 'EndOfUpdate',
  clearAll: 'ClearAll',
  clearRange: 'ClearRange',
} as const;

type PendingResets = Record<SignalType, Set<string>>;

const freshPending = (): PendingResets => ({
  boolean: new Set(),
  number: new Set(),
  string: new Set(),
  object: new Set(),
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Keeps UI state honest across a control-system reconnect or program reload.
 *
 * On `StartOfUpdate` every signal the host has ever written is marked "pending reset" (minus
 * excluded prefixes). The control system then re-sends every join it still drives; each write
 * clears that name. On `EndOfUpdate` (or after a stuck-state timeout) whatever is still pending
 * is reset to its default, so a button the program no longer drives goes dark instead of staying
 * lit forever. `StartOfUpdateRange` is the multi-control-system variant that names explicit join
 * ranges instead of snapshotting everything. Objects are never reset, matching upstream.
 */
export class ResyncController {
  private pending = freshPending();
  private outstandingUpdates = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly registry: SignalRegistry,
    private readonly logger: Logger,
    private readonly timeoutMs: number = RESYNC_DEFAULT_TIMEOUT_MS,
  ) {}

  /** True between a window-opening start message and the matching end (or timeout). */
  get inUpdate(): boolean {
    return this.timer !== undefined;
  }

  /** Number of names currently marked for reset. */
  get pendingCount(): number {
    return this.pending.boolean.size + this.pending.number.size + this.pending.string.size + this.pending.object.size;
  }

  /** Entry point for every value received on {@link RESYNC_SIGNAL_NAME}. Invalid requests are logged, never thrown. */
  handle(request: unknown): void {
    if (!isObject(request) || typeof request['state'] !== 'string') {
      this.logger.warn('Ignoring invalid resync request', request);
      return;
    }
    const state = request['state'];
    const value = isObject(request['value']) ? request['value'] : {};

    switch (state) {
      case ResyncState.startOfUpdate: {
        const excludePrefixes = value['excludePrefixes'];
        if (!Array.isArray(excludePrefixes)) {
          this.logger.warn('Ignoring StartOfUpdate without excludePrefixes', request);
          return;
        }
        this.startOfUpdate(excludePrefixes.map(String));
        return;
      }
      case ResyncState.startOfUpdateRange:
      case ResyncState.startOfUpdateRangeSO: {
        const range = value['range'];
        if (!isObject(range)) {
          this.logger.warn(`Ignoring ${state} without range`, request);
          return;
        }
        this.startOfUpdateRange(state === ResyncState.startOfUpdateRange, range as unknown as ResyncRange);
        return;
      }
      case ResyncState.endOfUpdate:
        this.endOfUpdate();
        return;
      default:
        this.logger.debug(`Ignoring resync state "${state}"`);
    }
  }

  /** Called by the registry after every write. A written name no longer needs resetting. */
  onWrite(type: SignalType, name: string): void {
    if (this.inUpdate) {
      this.pending[type].delete(name);
    }
  }

  dispose(): void {
    this.disarmTimer();
    this.outstandingUpdates = 0;
    this.pending = freshPending();
  }

  static shouldInclude(excludePrefixes: readonly string[], name: string): boolean {
    return name !== RESYNC_SIGNAL_NAME && !excludePrefixes.some((prefix) => name.startsWith(prefix));
  }

  private startOfUpdate(excludePrefixes: string[]): void {
    this.logger.debug('Resync StartOfUpdate', excludePrefixes);
    this.armTimer();
    this.outstandingUpdates += 1;
    this.pending = freshPending();
    for (const signal of this.registry.signals()) {
      if (signal.receivedFromHost && ResyncController.shouldInclude(excludePrefixes, signal.name)) {
        this.pending[signal.type].add(signal.name);
      }
    }
  }

  private startOfUpdateRange(opensWindow: boolean, range: ResyncRange): void {
    this.logger.debug('Resync StartOfUpdateRange', range);
    if (opensWindow) {
      this.armTimer();
      this.outstandingUpdates += 1;
    }
    this.addRange('boolean', range.boolean);
    this.addRange('number', range.numeric);
    this.addRange('string', range.string);
  }

  private addRange(type: SignalType, entry: ResyncRangeEntry | undefined): void {
    if (!isObject(entry)) {
      return;
    }
    const joinLow = typeof entry.joinLow === 'number' ? entry.joinLow : 0;
    const joinHigh = typeof entry.joinHigh === 'number' ? entry.joinHigh : 0;
    if (!(joinLow === 0 && joinHigh === 0)) {
      for (let join = joinLow; join <= joinHigh; join++) {
        this.pending[type].add(toJoinNumberSignalName(String(join)));
      }
    }
    if (Array.isArray(entry.stateNames)) {
      for (const name of entry.stateNames) {
        this.pending[type].add(String(name));
      }
    }
  }

  private endOfUpdate(): void {
    this.logger.debug(`Resync EndOfUpdate (${this.outstandingUpdates} outstanding)`);
    if (this.outstandingUpdates > 0) {
      this.outstandingUpdates -= 1;
      if (this.outstandingUpdates === 0) {
        this.resetRemaining();
      }
    }
  }

  private resetRemaining(): void {
    this.outstandingUpdates = 0;
    this.disarmTimer();
    this.logger.debug(`Resync resetting ${this.pendingCount} stale signals`);

    for (const name of this.pending.boolean) {
      this.registry.get('boolean', name, false)?.write(false, true);
    }
    for (const name of this.pending.number) {
      const signal = this.registry.get('number', name, false);
      if (signal !== null) {
        signal.write(0, true);
        this.registry.get('object', name, false)?.write(completedRcb(0), true);
      }
    }
    for (const name of this.pending.string) {
      this.registry.get('string', name, false)?.write('', true);
    }
    // Object signals are deliberately left alone, as upstream does.

    this.pending = freshPending();
  }

  private armTimer(): void {
    this.disarmTimer();
    this.timer = setTimeout(() => {
      this.logger.warn(`Resync timed out waiting for EndOfUpdate (${this.outstandingUpdates} outstanding)`);
      this.resetRemaining();
    }, this.timeoutMs);
  }

  private disarmTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
