import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../logger';
import { SignalRegistry } from './signal-registry';

const logger = createLogger(false);

describe('SignalRegistry', () => {
  it('creates signals on demand with the seed value for their type', () => {
    const r = new SignalRegistry(logger, undefined);
    expect(r.get('boolean', 'a').value).toBe(false);
    expect(r.get('number', 'a').value).toBe(0);
    expect(r.get('string', 'a').value).toBe('');
    expect(r.get('object', 'a').value).toEqual({});
    expect(r.size).toBe(4);
  });

  it('returns the same instance on repeated gets and null when asked not to create', () => {
    const r = new SignalRegistry(logger, undefined);
    expect(r.get('number', 'x', false)).toBeNull();
    expect(r.has('number', 'x')).toBe(false);
    const created = r.get('number', 'x');
    expect(r.get('number', 'x')).toBe(created);
    expect(r.get('number', 'x', false)).toBe(created);
    expect(r.has('number', 'x')).toBe(true);
    expect(r.size).toBe(1);
  });

  it('keeps the same name separate per type bucket', () => {
    const r = new SignalRegistry(logger, undefined);
    const n = r.get('number', 'fb200');
    const o = r.get('object', 'fb200');
    n.write(5, true);
    expect(o.value).toEqual({});
    expect(r.get('boolean', 'fb200', false)).toBeNull();
  });

  it('threads the write listener into every signal it creates', () => {
    const onWrite = vi.fn();
    const r = new SignalRegistry(logger, onWrite);
    const s = r.get('string', 's');
    s.write('hello', true);
    expect(onWrite).toHaveBeenCalledWith('string', 's');
  });

  it('iterates all signals bucket by bucket', () => {
    const r = new SignalRegistry(logger, undefined);
    r.get('object', 'o1');
    r.get('boolean', 'b1');
    r.get('string', 's1');
    r.get('number', 'n1');
    r.get('boolean', 'b2');
    expect(Array.from(r.signals()).map((s) => `${s.type}:${s.name}`)).toEqual([
      'boolean:b1',
      'boolean:b2',
      'number:n1',
      'string:s1',
      'object:o1',
    ]);
  });

  it('produces a plain snapshot for diagnostics', () => {
    const r = new SignalRegistry(logger, undefined);
    const b = r.get('boolean', 'fb1');
    b.subscribe(() => undefined);
    b.write(true, true);
    r.get('string', 'label').write('x', false);

    expect(r.snapshot()).toEqual({
      boolean: {
        fb1: { value: true, prevValue: false, hasChanged: true, receivedFromHost: true, subscriberCount: 1 },
      },
      number: {},
      string: {
        label: { value: 'x', prevValue: '', hasChanged: true, receivedFromHost: false, subscriberCount: 0 },
      },
      object: {},
    });
  });

  it('clears every bucket', () => {
    const r = new SignalRegistry(logger, undefined);
    r.get('boolean', 'a');
    r.get('object', 'b');
    r.clear();
    expect(r.size).toBe(0);
    expect(r.get('boolean', 'a', false)).toBeNull();
  });
});
