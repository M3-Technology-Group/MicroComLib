import { describe, expect, it } from 'vitest';

import { SIGNAL_TYPES, normalizeSignalType, seedValueFor, signalTypeOfValue } from './signal-type';

describe('normalizeSignalType', () => {
  it.each([
    ['b', 'boolean'],
    ['boolean', 'boolean'],
    ['B', 'boolean'],
    ['Boolean', 'boolean'],
    ['n', 'number'],
    ['number', 'number'],
    ['numeric', 'number'],
    ['NUMERIC', 'number'],
    ['s', 'string'],
    ['string', 'string'],
    ['o', 'object'],
    ['object', 'object'],
    ['OBJECT', 'object'],
  ] as const)('maps %j to %j', (input, expected) => {
    expect(normalizeSignalType(input)).toBe(expected);
  });

  it.each(['', 'bool', 'int', 'x', ' b', 'b '])('returns null for unrecognised %j', (input) => {
    expect(normalizeSignalType(input)).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(normalizeSignalType(undefined)).toBeNull();
    expect(normalizeSignalType(null)).toBeNull();
    expect(normalizeSignalType(1)).toBeNull();
    expect(normalizeSignalType({})).toBeNull();
  });
});

describe('seedValueFor', () => {
  it('returns the upstream seed per type', () => {
    expect(seedValueFor('boolean')).toBe(false);
    expect(seedValueFor('number')).toBe(0);
    expect(seedValueFor('string')).toBe('');
    expect(seedValueFor('object')).toEqual({});
  });

  it('returns a fresh object each time', () => {
    expect(seedValueFor('object')).not.toBe(seedValueFor('object'));
  });
});

describe('signalTypeOfValue', () => {
  it('dispatches on typeof with object as fallback', () => {
    expect(signalTypeOfValue(true)).toBe('boolean');
    expect(signalTypeOfValue(3)).toBe('number');
    expect(signalTypeOfValue('x')).toBe('string');
    expect(signalTypeOfValue({})).toBe('object');
    expect(signalTypeOfValue([])).toBe('object');
    expect(signalTypeOfValue(null)).toBe('object');
    expect(signalTypeOfValue(undefined)).toBe('object');
  });
});

describe('SIGNAL_TYPES', () => {
  it('lists the four buckets', () => {
    expect(SIGNAL_TYPES).toEqual(['boolean', 'number', 'string', 'object']);
  });
});
