import { describe, expect, it, vi } from 'vitest';

import { Signal, type SignalWriteListener } from './signal';
import type { Logger } from '../types';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeBoolean(onWrite?: SignalWriteListener, logger: Logger = makeLogger()) {
  return new Signal<boolean>('fb1', 'boolean', false, logger, onWrite);
}

describe('Signal', () => {
  it('starts at the seed with nothing changed', () => {
    const s = new Signal<number>('fb7', 'number', 0, makeLogger(), undefined);
    expect(s.name).toBe('fb7');
    expect(s.type).toBe('number');
    expect(s.value).toBe(0);
    expect(s.prevValue).toBe(0);
    expect(s.hasChanged).toBe(false);
    expect(s.receivedFromHost).toBe(false);
    expect(s.subscriberCount).toBe(0);
  });

  describe('subscribe', () => {
    it('replays the current value synchronously', () => {
      const s = makeBoolean();
      s.write(true, false);
      const cb = vi.fn();
      s.subscribe(cb);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('mints zero-padded ids that grow past five digits instead of colliding', () => {
      const s = makeBoolean();
      const first = s.subscribe(() => undefined);
      expect(first).toBe('fb1-00001');
      expect(s.unsubscribe(first)).toBe(true);
      for (let i = 2; i <= 99_999; i++) {
        s.unsubscribe(s.subscribe(() => undefined));
      }
      expect(s.subscribe(() => undefined)).toBe('fb1-100000');
    });

    it('tracks subscriber count and unsubscribe returns whether the id existed', () => {
      const s = makeBoolean();
      const a = s.subscribe(() => undefined);
      const b = s.subscribe(() => undefined);
      expect(s.subscriberCount).toBe(2);
      expect(s.unsubscribe(a)).toBe(true);
      expect(s.unsubscribe(a)).toBe(false);
      expect(s.unsubscribe('nope')).toBe(false);
      expect(s.subscriberCount).toBe(1);
      expect(s.unsubscribe(b)).toBe(true);
      expect(s.subscriberCount).toBe(0);
    });
  });

  describe('write from local code', () => {
    it('notifies every subscriber, updates prevValue, never deduplicates', () => {
      const s = makeBoolean();
      const cb = vi.fn();
      s.subscribe(cb);
      cb.mockClear();

      expect(s.write(true, false)).toBe(true);
      expect(s.write(true, false)).toBe(true);
      expect(cb).toHaveBeenCalledTimes(2);
      expect(s.value).toBe(true);
      expect(s.prevValue).toBe(true);
      expect(s.hasChanged).toBe(true);
      expect(s.receivedFromHost).toBe(false);
    });
  });

  describe('write from host', () => {
    it('deduplicates identical scalars but still marks hasChanged and receivedFromHost', () => {
      const s = makeBoolean();
      const cb = vi.fn();
      s.subscribe(cb);
      cb.mockClear();

      expect(s.write(false, true)).toBe(false);
      expect(cb).not.toHaveBeenCalled();
      expect(s.hasChanged).toBe(true);
      expect(s.receivedFromHost).toBe(true);
      expect(s.prevValue).toBe(false);

      expect(s.write(true, true)).toBe(true);
      expect(cb).toHaveBeenCalledWith(true);
      expect(s.prevValue).toBe(false);
    });

    it('always notifies for new object references and dedupes the same reference', () => {
      const s = new Signal<object>('o', 'object', {}, makeLogger(), undefined);
      const cb = vi.fn();
      s.subscribe(cb);
      cb.mockClear();

      const a = { x: 1 };
      expect(s.write(a, true)).toBe(true);
      expect(s.write({ x: 1 }, true)).toBe(true);
      expect(s.write(s.value, true)).toBe(false);
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('write listener', () => {
    it('fires after every write, including deduplicated ones', () => {
      const onWrite = vi.fn();
      const s = makeBoolean(onWrite);
      s.write(false, true);
      s.write(true, true);
      s.write(true, false);
      expect(onWrite).toHaveBeenCalledTimes(3);
      expect(onWrite).toHaveBeenCalledWith('boolean', 'fb1');
    });

    it('fires after subscribers have been notified', () => {
      const order: string[] = [];
      const s = makeBoolean(() => order.push('onWrite'));
      s.subscribe(() => order.push('subscriber'));
      order.length = 0;
      s.write(true, false);
      expect(order).toEqual(['subscriber', 'onWrite']);
    });
  });

  describe('subscriber safety', () => {
    it('skips a subscriber that was unsubscribed by an earlier callback in the same notification', () => {
      const s = makeBoolean();
      const second = vi.fn();
      let secondId = '';
      s.subscribe(() => {
        if (secondId) {
          s.unsubscribe(secondId);
        }
      });
      secondId = s.subscribe(second);
      second.mockClear();

      s.write(true, false);
      expect(second).not.toHaveBeenCalled();
      expect(s.subscriberCount).toBe(1);
    });

    it('does not double-notify a subscriber added during a notification', () => {
      const s = makeBoolean();
      const late = vi.fn();
      let added = false;
      // Subscribe `late` from inside the write notification (not the replay, which runs with `false`).
      s.subscribe((v) => {
        if (v === true && !added) {
          added = true;
          s.subscribe(late);
        }
      });
      s.write(true, false);
      // Exactly one call: the replay at subscribe time, with the already-updated value.
      expect(late).toHaveBeenCalledTimes(1);
      expect(late).toHaveBeenCalledWith(true);
    });

    it('catches a throwing callback, logs it, routes it to that subscription errCb, and keeps going', () => {
      const logger = makeLogger();
      const s = makeBoolean(undefined, logger);
      const boom = new Error('boom');
      const errCb = vi.fn();
      const other = vi.fn();
      s.subscribe(() => {
        throw boom;
      }, errCb);
      s.subscribe(other);
      other.mockClear();
      errCb.mockClear();

      s.write(true, false);

      expect(errCb).toHaveBeenCalledWith(boom);
      expect(other).toHaveBeenCalledWith(true);
      expect(logger.error).toHaveBeenCalledWith('Subscriber of signal "fb1" threw', boom);
    });

    it('logs when the error callback itself throws', () => {
      const logger = makeLogger();
      const s = makeBoolean(undefined, logger);
      const secondary = new Error('secondary');
      s.subscribe(
        () => {
          throw new Error('primary');
        },
        () => {
          throw secondary;
        },
      );
      expect(logger.error).toHaveBeenCalledWith('Error callback of signal "fb1" threw', secondary);
    });

    it('logs a throwing callback with no error callback and continues', () => {
      const logger = makeLogger();
      const s = makeBoolean(undefined, logger);
      s.subscribe(() => {
        throw new Error('x');
      });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(() => s.write(true, false)).not.toThrow();
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });
});
