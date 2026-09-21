import { SIGNAL_TYPES, seedValueFor } from './signal-type';
import { Signal, type SignalWriteListener } from './signal';
import type { Logger, SignalType, SignalValue, SignalValueOf } from '../types';

/** Read-only view of one signal for diagnostics. */
export interface SignalSnapshot {
  value: SignalValue;
  prevValue: SignalValue;
  hasChanged: boolean;
  receivedFromHost: boolean;
  subscriberCount: number;
}

export type RegistrySnapshot = Record<SignalType, Record<string, SignalSnapshot>>;

/**
 * Four name→signal maps, one per type. A name may exist in several buckets at once; RCB handling
 * depends on this, with one join carrying both a `number` signal and an `object` signal.
 */
export class SignalRegistry {
  private readonly buckets: Record<SignalType, Map<string, Signal<SignalValue>>> = {
    boolean: new Map(),
    number: new Map(),
    string: new Map(),
    object: new Map(),
  };

  constructor(
    private readonly logger: Logger,
    private readonly onWrite: SignalWriteListener | undefined,
  ) {}

  /** Get a signal, creating it with its seed value on a miss unless `create` is `false`. */
  get<T extends SignalType>(type: T, name: string): Signal<SignalValueOf<T>>;
  get<T extends SignalType>(type: T, name: string, create: true): Signal<SignalValueOf<T>>;
  get<T extends SignalType>(type: T, name: string, create: boolean): Signal<SignalValueOf<T>> | null;
  get<T extends SignalType>(type: T, name: string, create = true): Signal<SignalValueOf<T>> | null {
    const bucket = this.buckets[type];
    let signal = bucket.get(name);
    if (signal === undefined) {
      if (!create) {
        return null;
      }
      signal = new Signal<SignalValue>(name, type, seedValueFor(type), this.logger, this.onWrite);
      bucket.set(name, signal);
    }
    return signal as unknown as Signal<SignalValueOf<T>>;
  }

  has(type: SignalType, name: string): boolean {
    return this.buckets[type].has(name);
  }

  /** Every signal across all buckets, boolean → number → string → object. */
  *signals(): IterableIterator<Signal<SignalValue>> {
    for (const type of SIGNAL_TYPES) {
      yield* this.buckets[type].values();
    }
  }

  get size(): number {
    return SIGNAL_TYPES.reduce((total, type) => total + this.buckets[type].size, 0);
  }

  snapshot(): RegistrySnapshot {
    const out = { boolean: {}, number: {}, string: {}, object: {} } as RegistrySnapshot;
    for (const signal of this.signals()) {
      out[signal.type][signal.name] = {
        value: signal.value,
        prevValue: signal.prevValue,
        hasChanged: signal.hasChanged,
        receivedFromHost: signal.receivedFromHost,
        subscriberCount: signal.subscriberCount,
      };
    }
    return out;
  }

  clear(): void {
    for (const type of SIGNAL_TYPES) {
      this.buckets[type].clear();
    }
  }
}
