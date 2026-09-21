import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CRCOMLIB_GLOBAL_NAME, RECEIVE_HOOK_NAMES } from '../bridge/bridge-globals';
import { HEARTBEAT_REQUEST_SIGNAL, HEARTBEAT_RESPONSE_SIGNAL } from '../features/heartbeat';
import { MicroComLib } from './micro-com-lib';
import { RESYNC_SIGNAL_NAME } from '../features/resync';
import type { HostTransport } from '../types';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeTransport() {
  return {
    kind: 'fake',
    send: vi.fn<HostTransport['send']>(),
    subscribe: vi.fn<NonNullable<HostTransport['subscribe']>>(),
    unsubscribe: vi.fn<NonNullable<HostTransport['unsubscribe']>>(),
  };
}

function fullSender() {
  return {
    bridgeSendBooleanToNative: vi.fn(),
    bridgeSendIntegerToNative: vi.fn(),
    bridgeSendStringToNative: vi.fn(),
    bridgeSendObjectToNative: vi.fn(),
  };
}

describe('MicroComLib singleton', () => {
  afterEach(() => {
    MicroComLib.resetInstance();
  });

  it('getInstance creates once, attaches to globalThis, and warns when later options are ignored', () => {
    const logger = makeLogger();
    expect(MicroComLib.hasInstance()).toBe(false);
    const a = MicroComLib.getInstance({ logger });
    expect(MicroComLib.hasInstance()).toBe(true);
    expect(a.attached).toBe(true);
    for (const name of RECEIVE_HOOK_NAMES) {
      expect((globalThis as Record<string, unknown>)[name]).toBe(a[name]);
    }
    expect((globalThis as Record<string, unknown>)[CRCOMLIB_GLOBAL_NAME]).toBeDefined();

    const b = MicroComLib.getInstance({ logger });
    expect(b).toBe(a);
    expect(logger.warn).toHaveBeenCalledWith('getInstance(options) ignored: the singleton already exists');
    expect(MicroComLib.getInstance()).toBe(a);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('resetInstance disposes and removes the globals; a fresh instance follows', () => {
    const a = MicroComLib.getInstance({ logger: false });
    MicroComLib.resetInstance();
    expect(MicroComLib.hasInstance()).toBe(false);
    expect(a.attached).toBe(false);
    expect((globalThis as Record<string, unknown>)[CRCOMLIB_GLOBAL_NAME]).toBeUndefined();
    expect('bridgeReceiveBooleanFromNative' in globalThis).toBe(false);
    expect(() => MicroComLib.resetInstance()).not.toThrow();

    const b = MicroComLib.getInstance({ logger: false });
    expect(b).not.toBe(a);
    expect(b.attached).toBe(true);
  });

  it('dispose on the singleton clears the slot', () => {
    const a = MicroComLib.getInstance({ logger: false });
    a.dispose();
    expect(MicroComLib.hasInstance()).toBe(false);
  });

  it('a directly constructed instance touches nothing global', () => {
    const lib = new MicroComLib({ logger: false });
    expect(lib.attached).toBe(false);
    expect('bridgeReceiveBooleanFromNative' in globalThis).toBe(false);
    expect(MicroComLib.hasInstance()).toBe(false);
    lib.dispose();
  });
});

describe('MicroComLib core API', () => {
  let transport: ReturnType<typeof makeTransport>;
  let logger: ReturnType<typeof makeLogger>;
  let lib: MicroComLib;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = makeTransport();
    logger = makeLogger();
    lib = new MicroComLib({ transport, logger, scope: {} });
  });

  afterEach(() => {
    lib.dispose();
    vi.useRealTimers();
  });

  describe('getState', () => {
    it('returns null or the default until a signal has been written, and never creates', () => {
      expect(lib.getState('b', '1')).toBeNull();
      expect(lib.getState('b', '1', false)).toBe(false);
      expect(lib.getState('n', '1', 7)).toBe(7);
      expect(lib.getState('s', 'x', '')).toBe('');
      expect(lib.getSignals().boolean).toEqual({});

      lib.bridgeReceiveBooleanFromNative('1', false);
      expect(lib.getState('b', '1', true)).toBe(false);
    });

    it('treats a null default as no default and returns the fallback for unknown types', () => {
      expect(lib.getState('b', '1', null as unknown as boolean)).toBeNull();
      expect(lib.getState('bogus', '1', 'd')).toBe('d');
      expect(lib.getState('bogus', '1')).toBeNull();
    });

    it('reads the feedback side of integer-like names and accepts every alias', () => {
      lib.bridgeReceiveIntegerFromNative('42', 9);
      lib.bridgeReceiveStringFromNative('Zone.Name', 'Lobby');
      expect(lib.getState('n', '42')).toBe(9);
      expect(lib.getState('NUMERIC', '42')).toBe(9);
      expect(lib.getState('number', 'fb42')).toBe(9);
      expect(lib.getState('s', 'Zone.Name')).toBe('Lobby');
      expect(lib.getState('o', '42')).toEqual({ rcb: { value: 9, time: 0 } });
    });

    it('reports a locally published value as real data', () => {
      lib.publishEvent('s', 'Zone.Name', 'x');
      expect(lib.getState('s', 'Zone.Name')).toBe('x');
      lib.publishEvent('b', '1', true);
      expect(lib.getState('b', '1')).toBeNull(); // subscribers read fb1, not 1
    });
  });

  describe('subscribeState / unsubscribeState', () => {
    it('replays the current value and returns an id that unsubscribes', () => {
      lib.bridgeReceiveBooleanFromNative('1', true);
      const cb = vi.fn();
      const id = lib.subscribeState('b', '1', cb);
      expect(id).toBe('fb1-00001');
      expect(cb).toHaveBeenCalledWith(true);

      lib.bridgeReceiveBooleanFromNative('1', false);
      expect(cb).toHaveBeenCalledWith(false);

      lib.unsubscribeState('b', '1', id);
      lib.bridgeReceiveBooleanFromNative('1', true);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('returns an empty id and calls errCb for an unsupported type', () => {
      const errCb = vi.fn();
      expect(lib.subscribeState('bogus', '200', vi.fn(), errCb)).toBe('');
      expect(errCb).toHaveBeenCalledWith('Signal: fb200, has unsupported type: bogus');
      expect(lib.subscribeState('bogus', '200', vi.fn())).toBe('');
    });

    it('ignores unsubscribes for unknown types, names and ids without creating signals', () => {
      expect(() => {
        lib.unsubscribeState('bogus', '1', 'x');
        lib.unsubscribeState('b', '1', 'x');
      }).not.toThrow();
      expect(lib.getSignals().boolean).toEqual({});
      const id = lib.subscribeState('b', '1', vi.fn());
      lib.unsubscribeState('b', '1', 'wrong');
      expect(lib.getSignals().boolean['fb1']?.subscriberCount).toBe(1);
      lib.unsubscribeState('b', '1', id);
      expect(lib.getSignals().boolean['fb1']?.subscriberCount).toBe(0);
    });

    it('routes a throwing callback to its own errCb', () => {
      const errCb = vi.fn();
      lib.subscribeState(
        'n',
        '1',
        () => {
          throw new Error('bad');
        },
        errCb,
      );
      expect(errCb).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('sends no host hints by default', () => {
      const id = lib.subscribeState('b', '1', vi.fn());
      lib.unsubscribeState('b', '1', id);
      expect(transport.subscribe).not.toHaveBeenCalled();
      expect(transport.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('host subscription hints', () => {
    it('sends matched first-subscriber and last-subscriber hints with the registry name', () => {
      const hinted = new MicroComLib({ transport, logger: false, hostSubscriptionHints: true, heartbeat: false });
      const a = hinted.subscribeState('n', '5', vi.fn());
      const b = hinted.subscribeState('n', '5', vi.fn());
      expect(transport.subscribe).toHaveBeenCalledTimes(1);
      expect(transport.subscribe).toHaveBeenCalledWith('number', 'fb5');

      hinted.unsubscribeState('n', '5', a);
      expect(transport.unsubscribe).not.toHaveBeenCalled();
      hinted.unsubscribeState('n', '5', b);
      expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
      expect(transport.unsubscribe).toHaveBeenCalledWith('number', 'fb5');

      hinted.subscribeState('n', '5', vi.fn());
      expect(transport.subscribe).toHaveBeenCalledTimes(2);
      hinted.dispose();
    });

    it('tolerates a transport without hint methods', () => {
      const bare: HostTransport = { kind: 'bare', send: vi.fn() };
      const hinted = new MicroComLib({ transport: bare, logger: false, hostSubscriptionHints: true });
      const id = hinted.subscribeState('b', 'x', vi.fn());
      expect(() => hinted.unsubscribeState('b', 'x', id)).not.toThrow();
      hinted.dispose();
    });
  });

  describe('publishEvent', () => {
    it('sends to the host with the wire type chosen by the runtime value', () => {
      lib.publishEvent('b', '1', true);
      lib.publishEvent('n', '2', 50);
      lib.publishEvent('s', '3', 'txt');
      lib.publishEvent('o', '4', { repeatdigital: true });
      lib.publishEvent('b', '5', { repeatdigital: true } as unknown as boolean);
      expect(transport.send.mock.calls).toEqual([
        ['boolean', '1', true],
        ['number', '2', 50],
        ['string', '3', 'txt'],
        ['object', '4', { repeatdigital: true }],
        ['object', '5', { repeatdigital: true }],
      ]);
    });

    it('uses the raw name, so a join publish never echoes to feedback subscribers', () => {
      const fb = vi.fn();
      lib.subscribeState('b', '200', fb);
      fb.mockClear();
      lib.publishEvent('b', '200', true);
      expect(fb).not.toHaveBeenCalled();
      expect(lib.getSignals().boolean['200']?.value).toBe(true);
      expect(lib.getSignals().boolean['fb200']?.value).toBe(false);
    });

    it('echoes to local subscribers of a named signal, without dedupe', () => {
      const cb = vi.fn();
      lib.subscribeState('s', 'Zone.Name', cb);
      cb.mockClear();
      lib.publishEvent('s', 'Zone.Name', 'a');
      lib.publishEvent('s', 'Zone.Name', 'a');
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('warns and drops on an unsupported type', () => {
      lib.publishEvent('bogus', 'x', 1);
      expect(transport.send).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('publishEvent ignored: unsupported type "bogus" for "x"');
    });

    it('coerces a numeric join passed as a number', () => {
      (lib.publishEvent as (t: string, n: unknown, v: boolean) => void)('b', 7, true);
      expect(transport.send).toHaveBeenCalledWith('boolean', '7', true);
    });
  });

  describe('inbound hooks', () => {
    it('never echo back to the host and dedupe scalars', () => {
      const cb = vi.fn();
      lib.subscribeState('b', '1', cb);
      lib.bridgeReceiveBooleanFromNative('1', true);
      lib.bridgeReceiveBooleanFromNative('1', true);
      expect(cb).toHaveBeenCalledTimes(2); // replay + one change
      expect(transport.send).not.toHaveBeenCalled();
    });

    it('retain values that arrive before anyone subscribes', () => {
      lib.bridgeReceiveStringFromNative('9', 'early');
      const cb = vi.fn();
      lib.subscribeState('s', '9', cb);
      expect(cb).toHaveBeenCalledWith('early');
    });
  });
});

describe('MicroComLib end-to-end', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('traces a button press and its feedback through an XPanel-shaped host', () => {
    const scope: Record<string, unknown> = {};
    const lib = new MicroComLib({ scope, logger: false }).attach();
    expect(lib.transport).toBe('none');

    // XPanel installs its interface later, asynchronously.
    const ci = fullSender();
    scope['CommunicationInterface'] = ci;
    expect(lib.transport).toBe('xpanel');

    const feedback = vi.fn();
    lib.subscribeState('b', '200', feedback);
    lib.publishEvent('o', '200', { repeatdigital: true });
    expect(ci.bridgeSendObjectToNative).toHaveBeenCalledWith('200', '{"repeatdigital":true}');
    expect(feedback).toHaveBeenCalledTimes(1); // replay only

    // XPanel delivers feedback through the CrComLib global.
    const crComLib = scope['CrComLib'] as Record<string, (n: string, v: unknown) => void>;
    crComLib['bridgeReceiveBooleanFromNative']!('200', true);
    expect(feedback).toHaveBeenLastCalledWith(true);
    expect(lib.getState('b', '200')).toBe(true);

    // Native hosts call the bare global instead.
    (scope['bridgeReceiveBooleanFromNative'] as (n: string, v: boolean) => void)('200', false);
    expect(feedback).toHaveBeenLastCalledWith(false);

    lib.dispose();
    expect(scope['CrComLib']).toBeUndefined();
  });

  it('runs an rcb ramp, a resync cycle and a heartbeat through the hooks', () => {
    vi.useFakeTimers();
    const transport = makeTransport();
    const lib = new MicroComLib({ transport, logger: false, resyncTimeoutMs: 5000 });

    const volume = vi.fn();
    lib.subscribeState('n', '10', volume);
    lib.bridgeReceiveObjectFromNative('10', { rcb: { value: 100, time: 500 } });
    vi.advanceTimersByTime(500);
    expect(volume).toHaveBeenLastCalledWith(100);
    expect(volume.mock.calls.length).toBeGreaterThan(3);

    lib.bridgeReceiveBooleanFromNative('1', true);
    lib.bridgeReceiveObjectFromNative(RESYNC_SIGNAL_NAME, { state: 'StartOfUpdate', value: { excludePrefixes: ['Csig.'] } });
    lib.bridgeReceiveIntegerFromNative('10', 100);
    lib.bridgeReceiveObjectFromNative(RESYNC_SIGNAL_NAME, { state: 'EndOfUpdate' });
    expect(lib.getState('b', '1')).toBe(false);
    expect(lib.getState('n', '10')).toBe(100);

    lib.bridgeReceiveObjectFromNative(HEARTBEAT_REQUEST_SIGNAL, { t: 1 });
    expect(transport.send).toHaveBeenCalledWith('object', HEARTBEAT_RESPONSE_SIGNAL, { t: 1 });

    lib.dispose();
  });

  it('honours the feature toggles', () => {
    vi.useFakeTimers();
    const transport = makeTransport();
    const lib = new MicroComLib({ transport, logger: false, heartbeat: false, resync: false, rcb: false });

    lib.bridgeReceiveObjectFromNative(HEARTBEAT_REQUEST_SIGNAL, { t: 1 });
    expect(transport.send).not.toHaveBeenCalled();

    lib.bridgeReceiveBooleanFromNative('1', true);
    lib.bridgeReceiveObjectFromNative(RESYNC_SIGNAL_NAME, { state: 'StartOfUpdate', value: { excludePrefixes: [] } });
    lib.bridgeReceiveObjectFromNative(RESYNC_SIGNAL_NAME, { state: 'EndOfUpdate' });
    expect(lib.getState('b', '1')).toBe(true);

    lib.bridgeReceiveObjectFromNative('10', { rcb: { value: 100, time: 500 } });
    vi.advanceTimersByTime(1000);
    expect(lib.getState('n', '10')).toBeNull();
    expect(lib.getState('o', '10')).toEqual({ rcb: { value: 100, time: 500 } });

    lib.dispose();
  });

  it('exposes the helper set and releases held digitals on detach', () => {
    vi.useFakeTimers();
    const transport = makeTransport();
    const scope = {};
    const lib = new MicroComLib({ transport, logger: false, scope, repeatDigitalIntervalMs: 100 }).attach();

    lib.pulseDigital('1');
    lib.pulseDigital('1', 50);
    lib.setAnalog('2', 5);
    lib.setSerial('3', 's');
    lib.setObject('4', { k: 1 });
    lib.setState('5', 7);
    lib.setState('6', true);
    expect(lib.isDigitalHeld('6')).toBe(true);
    lib.setDigital('7', true);
    vi.advanceTimersByTime(100);

    expect(transport.send.mock.calls).toEqual([
      ['boolean', '1', true],
      ['boolean', '1', false],
      ['boolean', '1', true],
      ['number', '2', 5],
      ['string', '3', 's'],
      ['object', '4', { k: 1 }],
      ['number', '5', 7],
      ['object', '6', { repeatdigital: true }],
      ['object', '7', { repeatdigital: true }],
      ['boolean', '1', false],
      ['object', '6', { repeatdigital: true }],
      ['object', '7', { repeatdigital: true }],
    ]);

    transport.send.mockClear();
    lib.detach();
    expect(lib.attached).toBe(false);
    expect(lib.isDigitalHeld('6')).toBe(false);
    expect(transport.send.mock.calls).toEqual([
      ['object', '6', { repeatdigital: false }],
      ['object', '7', { repeatdigital: false }],
    ]);
    expect(() => lib.detach()).not.toThrow();

    lib.dispose();
  });

  it('attach is idempotent and refuses to sit beside a real CrComLib', () => {
    const lib = new MicroComLib({ scope: {}, logger: false });
    lib.attach();
    expect(() => lib.attach()).not.toThrow();
    lib.dispose();

    const occupied = new MicroComLib({ scope: { CrComLib: { publishEvent: () => undefined } }, logger: false });
    expect(() => occupied.attach()).toThrow(/CrComLib global is already present/);
    occupied.dispose();
  });

  it('dispose forgets every signal and stops timers', () => {
    vi.useFakeTimers();
    const transport = makeTransport();
    const lib = new MicroComLib({ transport, logger: false });
    lib.bridgeReceiveObjectFromNative('10', { rcb: { value: 100, time: 500 } });
    lib.setDigital('1', true);
    lib.dispose();
    expect(lib.getSignals()).toEqual({ boolean: {}, number: {}, string: {}, object: {} });
    transport.send.mockClear();
    vi.advanceTimersByTime(2000);
    expect(transport.send).not.toHaveBeenCalled();
  });
});
