import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../logger';
import { RCB_INTERVAL_DURATION_MS, RcbController, completedRcb, isRcbObject } from './rcb';
import { SignalRegistry } from '../signal/signal-registry';

const logger = createLogger(false);

describe('isRcbObject', () => {
  it('accepts the exact { rcb: { value, time } } shape and rejects everything else', () => {
    expect(isRcbObject({ rcb: { value: 1, time: 0 } })).toBe(true);
    expect(isRcbObject({ rcb: { value: 1, time: 500, startv: 0, startt: 1 } })).toBe(true);
    expect(isRcbObject({ rcb: { value: 1 } })).toBe(false);
    expect(isRcbObject({ rcb: { time: 1 } })).toBe(false);
    expect(isRcbObject({ rcb: null })).toBe(false);
    expect(isRcbObject({ rcb: 5 })).toBe(false);
    expect(isRcbObject({ repeatdigital: true })).toBe(false);
    expect(isRcbObject(null)).toBe(false);
    expect(isRcbObject(undefined)).toBe(false);
    expect(isRcbObject('rcb')).toBe(false);
    expect(isRcbObject(Object.create({ rcb: { value: 1, time: 1 } }))).toBe(false);
  });
});

describe('completedRcb', () => {
  it('builds the time-zero form', () => {
    expect(completedRcb(42)).toEqual({ rcb: { value: 42, time: 0 } });
  });
});

describe('RcbController', () => {
  let registry: SignalRegistry;
  let rcb: RcbController;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    registry = new SignalRegistry(logger, undefined);
    rcb = new RcbController(registry, logger);
  });

  afterEach(() => {
    rcb.clearAll();
    vi.useRealTimers();
  });

  it('exposes the interval constant upstream uses', () => {
    expect(RCB_INTERVAL_DURATION_MS).toBe(100);
  });

  describe('receiveInteger', () => {
    it('writes the number and mirrors a completed rcb to the object signal', () => {
      rcb.receiveInteger('fb1', 7);
      expect(registry.get('number', 'fb1').value).toBe(7);
      expect(registry.get('number', 'fb1').receivedFromHost).toBe(true);
      expect(registry.get('object', 'fb1').value).toEqual({ rcb: { value: 7, time: 0 } });
      expect(rcb.activeRamps).toBe(0);
    });

    it('interrupts an in-flight ramp', () => {
      const numbers: number[] = [];
      registry.get('number', 'fb1').subscribe((v) => numbers.push(v));
      rcb.receiveRcb('fb1', { rcb: { value: 1000, time: 1000 } });
      vi.advanceTimersByTime(250);
      expect(numbers).toEqual([0, 100, 200]);
      expect(rcb.activeRamps).toBe(1);

      rcb.receiveInteger('fb1', 5);
      expect(rcb.activeRamps).toBe(0);
      vi.advanceTimersByTime(2000);
      expect(numbers).toEqual([0, 100, 200, 5]);
      expect(registry.get('object', 'fb1').value).toEqual({ rcb: { value: 5, time: 0 } });
    });
  });

  describe('receiveRcb', () => {
    it('writes the extended rcb with the current analog as start point', () => {
      registry.get('number', 'fb1').write(250, true);
      const objects: object[] = [];
      registry.get('object', 'fb1').subscribe((v) => objects.push(v));

      rcb.receiveRcb('fb1', { rcb: { value: 1000, time: 3000 } });

      expect(objects.at(-1)).toEqual({ rcb: { value: 1000, time: 3000, startv: 250, startt: 1_000_000 } });
      expect(rcb.activeRamps).toBe(1);
    });

    it('creates the analog signal (start 0) when none exists yet', () => {
      expect(registry.has('number', 'fb9')).toBe(false);
      rcb.receiveRcb('fb9', { rcb: { value: 10, time: 50 } });
      expect(registry.has('number', 'fb9')).toBe(true);
      expect((registry.get('object', 'fb9').value as { rcb: { startv: number } }).rcb.startv).toBe(0);
    });

    it('interpolates upward every 100 ms with floor rounding and finishes at the target', () => {
      const numbers: number[] = [];
      registry.get('number', 'fb1').subscribe((v) => numbers.push(v));
      const objects: object[] = [];
      registry.get('object', 'fb1').subscribe((v) => objects.push(v));

      rcb.receiveRcb('fb1', { rcb: { value: 15, time: 1000 } });
      vi.advanceTimersByTime(999);
      // 0.015 per ms: 1.5→1, 3, 4.5→4, 6, 7.5→7, 9, 10.5→10, 12, 13.5→13
      expect(numbers).toEqual([0, 1, 3, 4, 6, 7, 9, 10, 12, 13]);

      vi.advanceTimersByTime(1);
      expect(numbers.at(-1)).toBe(15);
      expect(objects.at(-1)).toEqual({ rcb: { value: 15, time: 0 } });
      expect(rcb.activeRamps).toBe(0);

      vi.advanceTimersByTime(5000);
      expect(numbers.at(-1)).toBe(15);
    });

    it('interpolates downward with ceil rounding', () => {
      registry.get('number', 'fb1').write(15, true);
      const numbers: number[] = [];
      registry.get('number', 'fb1').subscribe((v) => numbers.push(v));

      rcb.receiveRcb('fb1', { rcb: { value: 0, time: 1000 } });
      vi.advanceTimersByTime(300);
      // 15 - 0.015·t: 13.5→14, 12, 10.5→11
      expect(numbers).toEqual([15, 14, 12, 11]);
      vi.advanceTimersByTime(700);
      expect(numbers.at(-1)).toBe(0);
    });

    it('writes nothing on a zero-slope ramp until the final value', () => {
      registry.get('number', 'fb1').write(40, true);
      const numbers: number[] = [];
      registry.get('number', 'fb1').subscribe((v) => numbers.push(v));

      rcb.receiveRcb('fb1', { rcb: { value: 40, time: 500 } });
      vi.advanceTimersByTime(499);
      expect(numbers).toEqual([40]);
      vi.advanceTimersByTime(1);
      // Final write is deduped by the signal (same scalar), so still just the replay.
      expect(numbers).toEqual([40]);
      expect(registry.get('object', 'fb1').value).toEqual({ rcb: { value: 40, time: 0 } });
    });

    it('skips the interval for ramps no longer than one interval', () => {
      const numbers: number[] = [];
      registry.get('number', 'fb1').subscribe((v) => numbers.push(v));
      rcb.receiveRcb('fb1', { rcb: { value: 100, time: 100 } });
      vi.advanceTimersByTime(99);
      expect(numbers).toEqual([0]);
      vi.advanceTimersByTime(1);
      expect(numbers).toEqual([0, 100]);
    });

    it('restarts from the interpolated value when a new rcb arrives mid-ramp', () => {
      rcb.receiveRcb('fb1', { rcb: { value: 1000, time: 1000 } });
      vi.advanceTimersByTime(300);
      expect(registry.get('number', 'fb1').value).toBe(300);

      rcb.receiveRcb('fb1', { rcb: { value: 0, time: 300 } });
      expect(rcb.activeRamps).toBe(1);
      expect((registry.get('object', 'fb1').value as { rcb: { startv: number } }).rcb.startv).toBe(300);
      vi.advanceTimersByTime(300);
      expect(registry.get('number', 'fb1').value).toBe(0);
      expect(rcb.activeRamps).toBe(0);
    });
  });

  describe('clear / clearAll', () => {
    it('clear is a no-op for unknown names and stops a running ramp', () => {
      expect(() => rcb.clear('nope')).not.toThrow();
      rcb.receiveRcb('fb1', { rcb: { value: 100, time: 1000 } });
      rcb.clear('fb1');
      vi.advanceTimersByTime(2000);
      expect(registry.get('number', 'fb1').value).toBe(0);
    });

    it('clearAll stops every ramp', () => {
      rcb.receiveRcb('a', { rcb: { value: 100, time: 1000 } });
      rcb.receiveRcb('b', { rcb: { value: 100, time: 50 } });
      expect(rcb.activeRamps).toBe(2);
      rcb.clearAll();
      expect(rcb.activeRamps).toBe(0);
      vi.advanceTimersByTime(2000);
      expect(registry.get('number', 'a').value).toBe(0);
      expect(registry.get('number', 'b').value).toBe(0);
    });
  });
});
