import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REPEAT_DIGITAL_DEFAULT_INTERVAL_MS,
  REPEAT_DIGITAL_KEY,
  RepeatDigitalController,
  isRepeatDigitalValue,
  repeatDigital,
  unwrapRepeatDigital,
} from './repeat-digital';

describe('repeat digital values', () => {
  it('builds, detects and unwraps the object form', () => {
    expect(REPEAT_DIGITAL_KEY).toBe('repeatdigital');
    expect(repeatDigital(true)).toEqual({ repeatdigital: true });
    expect(isRepeatDigitalValue({ repeatdigital: false })).toBe(true);
    expect(isRepeatDigitalValue({ repeatdigital: 1 })).toBe(false);
    expect(isRepeatDigitalValue({})).toBe(false);
    expect(isRepeatDigitalValue(null)).toBe(false);
    expect(isRepeatDigitalValue(true)).toBe(false);
    expect(unwrapRepeatDigital({ repeatdigital: true })).toBe(true);
    expect(unwrapRepeatDigital(false)).toBe(false);
    expect(unwrapRepeatDigital({ other: 1 })).toEqual({ other: 1 });
  });
});

describe('RepeatDigitalController', () => {
  const api = { publishEvent: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    api.publishEvent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes the press immediately and repeats on the default interval until released', () => {
    const c = new RepeatDigitalController(api);
    expect(REPEAT_DIGITAL_DEFAULT_INTERVAL_MS).toBe(250);

    c.set('1', true);
    expect(c.isHeld('1')).toBe(true);
    expect(c.heldCount).toBe(1);
    expect(api.publishEvent).toHaveBeenCalledTimes(1);
    expect(api.publishEvent).toHaveBeenCalledWith('object', '1', { repeatdigital: true });

    vi.advanceTimersByTime(750);
    expect(api.publishEvent).toHaveBeenCalledTimes(4);

    c.set('1', false);
    expect(c.isHeld('1')).toBe(false);
    expect(api.publishEvent).toHaveBeenCalledTimes(5);
    expect(api.publishEvent).toHaveBeenLastCalledWith('object', '1', { repeatdigital: false });

    vi.advanceTimersByTime(5000);
    expect(api.publishEvent).toHaveBeenCalledTimes(5);
  });

  it('honours a custom interval', () => {
    const c = new RepeatDigitalController(api, 100);
    c.set('x', true);
    vi.advanceTimersByTime(1000);
    expect(api.publishEvent).toHaveBeenCalledTimes(11);
    c.releaseAll();
  });

  it('is idempotent for repeated holds and releases', () => {
    const c = new RepeatDigitalController(api);
    c.set('1', false);
    expect(api.publishEvent).not.toHaveBeenCalled();
    c.set('1', true);
    c.set('1', true);
    expect(api.publishEvent).toHaveBeenCalledTimes(1);
    c.set('1', false);
    c.set('1', false);
    expect(api.publishEvent).toHaveBeenCalledTimes(2);
  });

  it('releaseAll publishes a falling edge for every held join', () => {
    const c = new RepeatDigitalController(api);
    c.set('1', true);
    c.set('2', true);
    api.publishEvent.mockClear();
    c.releaseAll();
    expect(c.heldCount).toBe(0);
    expect(api.publishEvent).toHaveBeenCalledWith('object', '1', { repeatdigital: false });
    expect(api.publishEvent).toHaveBeenCalledWith('object', '2', { repeatdigital: false });
    vi.advanceTimersByTime(1000);
    expect(api.publishEvent).toHaveBeenCalledTimes(2);
  });
});
