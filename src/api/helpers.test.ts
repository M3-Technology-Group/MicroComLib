import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pulseDigital, setAnalog, setObject, setSerial, setState } from './helpers';
import { RepeatDigitalController } from '../features/repeat-digital';

describe('helpers', () => {
  const api = { publishEvent: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    api.publishEvent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pulseDigital sends a rising and falling edge immediately by default', () => {
    pulseDigital(api, '1');
    expect(api.publishEvent.mock.calls).toEqual([
      ['boolean', '1', true],
      ['boolean', '1', false],
    ]);
  });

  it('pulseDigital treats zero or negative hold as immediate', () => {
    pulseDigital(api, '1', 0);
    pulseDigital(api, '1', -5);
    expect(api.publishEvent).toHaveBeenCalledTimes(4);
  });

  it('pulseDigital delays the falling edge when a hold is given', () => {
    pulseDigital(api, '1', 300);
    expect(api.publishEvent.mock.calls).toEqual([['boolean', '1', true]]);
    vi.advanceTimersByTime(299);
    expect(api.publishEvent).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(api.publishEvent).toHaveBeenLastCalledWith('boolean', '1', false);
  });

  it('setAnalog / setSerial / setObject publish with the matching type', () => {
    setAnalog(api, 'a', 5);
    setSerial(api, 's', 'x');
    setObject(api, 'o', { k: 1 });
    expect(api.publishEvent.mock.calls).toEqual([
      ['number', 'a', 5],
      ['string', 's', 'x'],
      ['object', 'o', { k: 1 }],
    ]);
  });

  it('setState dispatches on the value type, holding booleans as RepeatDigital', () => {
    const repeat = new RepeatDigitalController(api);
    setState(api, repeat, 'b', true);
    setState(api, repeat, 'n', 3);
    setState(api, repeat, 's', 'str');
    setState(api, repeat, 'o', { z: 0 });
    expect(api.publishEvent.mock.calls).toEqual([
      ['object', 'b', { repeatdigital: true }],
      ['number', 'n', 3],
      ['string', 's', 'str'],
      ['object', 'o', { z: 0 }],
    ]);
    expect(repeat.isHeld('b')).toBe(true);
    setState(api, repeat, 'b', false);
    expect(repeat.isHeld('b')).toBe(false);
    expect(api.publishEvent).toHaveBeenLastCalledWith('object', 'b', { repeatdigital: false });
  });
});
