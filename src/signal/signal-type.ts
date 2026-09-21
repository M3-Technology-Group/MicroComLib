import type { SignalType, SignalValue } from '../types';

/**
 * Resolves any accepted spelling of a signal type to its canonical bucket, case-insensitively.
 * Returns `null` for anything unrecognised; callers decide whether that is an error.
 */
export function normalizeSignalType(type: unknown): SignalType | null {
  if (typeof type !== 'string') {
    return null;
  }
  switch (type.toLowerCase()) {
    case 'b':
    case 'boolean':
      return 'boolean';
    case 'n':
    case 'number':
    case 'numeric':
      return 'number';
    case 's':
    case 'string':
      return 'string';
    case 'o':
    case 'object':
      return 'object';
    default:
      return null;
  }
}

/**
 * The value a signal holds before anything has written to it. Objects are created fresh per call
 * so two signals never share a seed instance.
 */
export function seedValueFor(type: SignalType): SignalValue {
  switch (type) {
    case 'boolean':
      return false;
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'object':
      return {};
  }
}

/**
 * The bucket a runtime value belongs to, with `object` as the fallback for everything that is not a
 * boolean, number or string. This mirrors how upstream picks the outbound wire method: by
 * `typeof value`, not by the type string the caller passed.
 */
export function signalTypeOfValue(value: unknown): SignalType {
  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    default:
      return 'object';
  }
}

export const SIGNAL_TYPES: readonly SignalType[] = ['boolean', 'number', 'string', 'object'];
