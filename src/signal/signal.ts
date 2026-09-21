import type { Logger, SignalCallback, SignalErrorCallback, SignalType, SignalValue } from '../types';

/** Notified after every write, including inbound writes that were deduplicated. Used by resync. */
export type SignalWriteListener = (type: SignalType, name: string) => void;

interface Subscriber<T> {
  callback: SignalCallback<T>;
  errorCallback: SignalErrorCallback | undefined;
}

const SUBSCRIPTION_ID_PAD = 5;

/**
 * One named signal in one type bucket: current and previous value, the "has anything ever written
 * to me" flag `getState` relies on, and a set of subscribers that each receive the current value
 * synchronously on subscribe (the BehaviorSubject replay CH5 consumers depend on for first render).
 */
export class Signal<T extends SignalValue> {
  private _value: T;
  private _prevValue: T;
  private _hasChanged = false;
  private _receivedFromHost = false;
  private lastSubscriptionId = 0;
  private readonly subscribers = new Map<string, Subscriber<T>>();

  constructor(
    public readonly name: string,
    public readonly type: SignalType,
    seed: T,
    private readonly logger: Logger,
    private readonly onWrite: SignalWriteListener | undefined,
  ) {
    this._value = seed;
    this._prevValue = seed;
  }

  get value(): T {
    return this._value;
  }

  get prevValue(): T {
    return this._prevValue;
  }

  /** True once anything, local or host, has written to this signal. Until then the value is a seed. */
  get hasChanged(): boolean {
    return this._hasChanged;
  }

  /** True once the host has written to this signal. Resync only resets such signals. */
  get receivedFromHost(): boolean {
    return this._receivedFromHost;
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Registers a subscriber and immediately invokes it with the current value. Returns the id to
   * pass to {@link unsubscribe}; ids look like `fb200-00003` and keep growing past five digits
   * instead of colliding.
   */
  subscribe(callback: SignalCallback<T>, errorCallback?: SignalErrorCallback): string {
    this.lastSubscriptionId += 1;
    const id = `${this.name}-${String(this.lastSubscriptionId).padStart(SUBSCRIPTION_ID_PAD, '0')}`;
    const subscriber: Subscriber<T> = { callback, errorCallback };
    this.subscribers.set(id, subscriber);
    this.invoke(subscriber, this._value);
    return id;
  }

  /** Returns whether a subscription with that id existed. */
  unsubscribe(id: string): boolean {
    return this.subscribers.delete(id);
  }

  /**
   * Writes a value and notifies subscribers.
   *
   * Inbound (`fromHost`) writes are deduplicated with `===`, so scalars that did not change are
   * silent while objects, which always arrive as new references, always notify. Local writes
   * never deduplicate. `hasChanged` is set before the dedupe check so a host reporting a genuine
   * initial `false`/`0`/`''` still marks the signal as carrying real data.
   *
   * @returns `true` when subscribers were notified.
   */
  write(value: T, fromHost: boolean): boolean {
    this._hasChanged = true;
    if (fromHost) {
      this._receivedFromHost = true;
      if (this._value === value) {
        this.onWrite?.(this.type, this.name);
        return false;
      }
    }
    this._prevValue = this._value;
    this._value = value;
    this.notify(value);
    this.onWrite?.(this.type, this.name);
    return true;
  }

  private notify(value: T): void {
    // Iterate over a copy: a callback may subscribe or unsubscribe while we are notifying. Anything
    // removed mid-loop is skipped; anything added mid-loop already got its replay and is not
    // notified a second time.
    for (const [id, subscriber] of Array.from(this.subscribers)) {
      if (this.subscribers.has(id)) {
        this.invoke(subscriber, value);
      }
    }
  }

  private invoke(subscriber: Subscriber<T>, value: T): void {
    try {
      subscriber.callback(value);
    } catch (error) {
      this.logger.error(`Subscriber of signal "${this.name}" threw`, error);
      if (subscriber.errorCallback) {
        try {
          subscriber.errorCallback(error);
        } catch (secondary) {
          this.logger.error(`Error callback of signal "${this.name}" threw`, secondary);
        }
      }
    }
  }
}
