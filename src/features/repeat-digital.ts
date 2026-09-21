import type { RepeatDigitalValue, SignalApi } from '../types';

/** The key CH5 buttons publish press state under. */
export const REPEAT_DIGITAL_KEY = 'repeatdigital';
export const REPEAT_DIGITAL_DEFAULT_INTERVAL_MS = 250;

export function repeatDigital(value: boolean): RepeatDigitalValue {
  return { [REPEAT_DIGITAL_KEY]: value };
}

export function isRepeatDigitalValue(value: unknown): value is RepeatDigitalValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[REPEAT_DIGITAL_KEY] === 'boolean'
  );
}

/** Unwraps `{ repeatdigital: x }` to `x`, passing anything else through, as CH5 components do on receive. */
export function unwrapRepeatDigital<T>(value: T): T | boolean {
  return isRepeatDigitalValue(value) ? value.repeatdigital : value;
}

/**
 * Press-and-hold digitals. A held join publishes `{repeatdigital:true}` immediately and again on
 * every interval until released, then publishes `{repeatdigital:false}` once. The periodic re-send
 * lets the control system drop the press if the page disappears mid-hold.
 */
export class RepeatDigitalController {
  private readonly held = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly api: Pick<SignalApi, 'publishEvent'>,
    private readonly intervalMs: number = REPEAT_DIGITAL_DEFAULT_INTERVAL_MS,
  ) {}

  get heldCount(): number {
    return this.held.size;
  }

  isHeld(name: string): boolean {
    return this.held.has(name);
  }

  /** Idempotent: holding an already-held join or releasing an unheld one does nothing. */
  set(name: string, held: boolean): void {
    if (held) {
      if (this.held.has(name)) {
        return;
      }
      this.api.publishEvent('object', name, repeatDigital(true));
      this.held.set(
        name,
        setInterval(() => this.api.publishEvent('object', name, repeatDigital(true)), this.intervalMs),
      );
      return;
    }
    const timer = this.held.get(name);
    if (timer === undefined) {
      return;
    }
    clearInterval(timer);
    this.held.delete(name);
    this.api.publishEvent('object', name, repeatDigital(false));
  }

  /** Releases every held join, publishing the falling edge for each. */
  releaseAll(): void {
    for (const name of Array.from(this.held.keys())) {
      this.set(name, false);
    }
  }
}
