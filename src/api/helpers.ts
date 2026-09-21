import type { RepeatDigitalController } from '../features/repeat-digital';
import type { SignalApi, SignalValue } from '../types';

/**
 * Convenience wrappers matching the extension methods ch5-svelte types against. None of these
 * exist in CrComLib itself; they are thin sugar over `publishEvent`.
 */

/** Rising then falling edge. With `holdMs` the falling edge is delayed that long. */
export function pulseDigital(api: Pick<SignalApi, 'publishEvent'>, name: string, holdMs?: number): void {
  api.publishEvent('boolean', name, true);
  if (holdMs === undefined || !(holdMs > 0)) {
    api.publishEvent('boolean', name, false);
    return;
  }
  setTimeout(() => api.publishEvent('boolean', name, false), holdMs);
}

export function setAnalog(api: Pick<SignalApi, 'publishEvent'>, name: string, value: number): void {
  api.publishEvent('number', name, value);
}

export function setSerial(api: Pick<SignalApi, 'publishEvent'>, name: string, value: string): void {
  api.publishEvent('string', name, value);
}

export function setObject(api: Pick<SignalApi, 'publishEvent'>, name: string, value: object): void {
  api.publishEvent('object', name, value);
}

/**
 * Picks the join type from the value. Booleans go through the RepeatDigital hold so `setState`
 * and `setDigital` agree on what "true" means on the wire.
 */
export function setState(
  api: Pick<SignalApi, 'publishEvent'>,
  repeatDigital: RepeatDigitalController,
  name: string,
  value: SignalValue,
): void {
  switch (typeof value) {
    case 'boolean':
      repeatDigital.set(name, value);
      return;
    case 'number':
      setAnalog(api, name, value);
      return;
    case 'string':
      setSerial(api, name, value);
      return;
    default:
      setObject(api, name, value);
  }
}
