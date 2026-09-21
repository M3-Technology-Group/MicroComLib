import type { SignalRegistry } from '../signal/signal-registry';
import type { Logger, RcbExtendedObject, RcbSimpleObject } from '../types';

/** How often a ramp writes an interpolated value into the analog signal. */
export const RCB_INTERVAL_DURATION_MS = 100;

const hasOwn = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

/** `{ rcb: { value, time } }`, as the control system sends a Ramped Control Block. */
export function isRcbObject(value: unknown): value is RcbSimpleObject {
  if (typeof value !== 'object' || value === null || !hasOwn(value, 'rcb')) {
    return false;
  }
  const rcb = (value as { rcb: unknown }).rcb;
  return typeof rcb === 'object' && rcb !== null && hasOwn(rcb, 'value') && hasOwn(rcb, 'time');
}

/** The object-signal form of "this analog is at `value` and not ramping". */
export function completedRcb(value: number): RcbSimpleObject {
  return { rcb: { value, time: 0 } };
}

interface RampTimers {
  timeout: ReturnType<typeof setTimeout>;
  interval: ReturnType<typeof setInterval> | undefined;
}

/**
 * Ramped Control Blocks: "ramp this analog to X over Y ms", used for volume fades, dimming and
 * slider animation. An inbound RCB is annotated with its start point and written to the object
 * signal (what an animated slider consumes), while a 100 ms interval writes linearly interpolated
 * integers into the number signal so plain numeric consumers see the ramp too. Rounding is
 * direction-aware so the target is never reported before it is reached. Any plain analog update
 * for the same join cancels the ramp.
 */
export class RcbController {
  private readonly ramps = new Map<string, RampTimers>();

  constructor(
    private readonly registry: SignalRegistry,
    private readonly logger: Logger,
  ) {}

  /** Number of joins currently ramping. */
  get activeRamps(): number {
    return this.ramps.size;
  }

  /** A plain analog arrived: stop any ramp, write it, and mirror a completed RCB to the object signal. */
  receiveInteger(name: string, value: number): void {
    this.clear(name);
    this.registry.get('number', name).write(value, true);
    this.registry.get('object', name).write(completedRcb(value), true);
  }

  /** An RCB arrived: start ramping from the analog's current value. */
  receiveRcb(name: string, rcb: RcbSimpleObject): void {
    const startv = this.registry.get('number', name).value;
    this.clear(name);
    const extended: RcbExtendedObject = {
      rcb: { value: rcb.rcb.value, time: rcb.rcb.time, startv, startt: Date.now() },
    };
    this.logger.debug(`rcb "${name}" ${startv} → ${extended.rcb.value} over ${extended.rcb.time}ms`);

    const timeout = setTimeout(() => this.finish(name, extended), extended.rcb.time);
    const interval =
      RCB_INTERVAL_DURATION_MS < extended.rcb.time
        ? setInterval(() => this.step(name, extended), RCB_INTERVAL_DURATION_MS)
        : undefined;
    this.ramps.set(name, { timeout, interval });

    this.registry.get('object', name).write(extended, true);
  }

  /** Cancels the ramp on one join, if any. */
  clear(name: string): void {
    const timers = this.ramps.get(name);
    if (timers === undefined) {
      return;
    }
    clearTimeout(timers.timeout);
    if (timers.interval !== undefined) {
      clearInterval(timers.interval);
    }
    this.ramps.delete(name);
  }

  clearAll(): void {
    for (const name of Array.from(this.ramps.keys())) {
      this.clear(name);
    }
  }

  private step(name: string, rcb: RcbExtendedObject): void {
    // y = m·x + b, with x = elapsed ms, b = start value, m = (target − start) / duration.
    const slope = (rcb.rcb.value - rcb.rcb.startv) / rcb.rcb.time;
    const elapsed = Date.now() - rcb.rcb.startt;
    const raw = slope * elapsed + rcb.rcb.startv;
    const value = slope > 0 ? Math.floor(raw) : slope < 0 ? Math.ceil(raw) : Math.round(raw);
    const signal = this.registry.get('number', name);
    if (signal.value !== value) {
      signal.write(value, true);
    }
  }

  private finish(name: string, rcb: RcbExtendedObject): void {
    this.registry.get('number', name).write(rcb.rcb.value, true);
    this.registry.get('object', name).write(completedRcb(rcb.rcb.value), true);
    this.clear(name);
  }
}
