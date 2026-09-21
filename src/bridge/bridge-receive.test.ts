import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BridgeReceiver } from './bridge-receive';
import { RcbController } from '../features/rcb';
import { RESYNC_SIGNAL_NAME, ResyncController } from '../features/resync';
import { SignalRegistry } from '../signal/signal-registry';
import type { HostReceiveMethods } from '../types';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('BridgeReceiver', () => {
  let registry: SignalRegistry;
  let rcb: RcbController;
  let resync: ResyncController;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = makeLogger();
    registry = new SignalRegistry(logger, (type, name) => resync.onWrite(type, name));
    rcb = new RcbController(registry, logger);
    resync = new ResyncController(registry, logger);
  });

  afterEach(() => {
    rcb.clearAll();
    resync.dispose();
    vi.useRealTimers();
  });

  const full = () => new BridgeReceiver(registry, logger, rcb, resync);
  const bare = () => new BridgeReceiver(registry, logger, null, null);

  it('normalizes integer-like names and writes with host semantics', () => {
    const r = full();
    r.bridgeReceiveBooleanFromNative('1', true);
    r.bridgeReceiveStringFromNative('2', 'hello');
    r.bridgeReceiveBooleanFromNative('Zone.Mute', true);

    expect(registry.get('boolean', 'fb1').value).toBe(true);
    expect(registry.get('boolean', 'fb1').receivedFromHost).toBe(true);
    expect(registry.has('boolean', '1')).toBe(false);
    expect(registry.get('string', 'fb2').value).toBe('hello');
    expect(registry.get('boolean', 'Zone.Mute').value).toBe(true);
  });

  it('coerces a numeric name to a string before normalizing', () => {
    const r = full();
    (r.bridgeReceiveBooleanFromNative as (n: unknown, v: boolean) => void)(7, true);
    expect(registry.get('boolean', 'fb7').value).toBe(true);
  });

  it('routes integers through the rcb controller when enabled', () => {
    full().bridgeReceiveIntegerFromNative('3', 42);
    expect(registry.get('number', 'fb3').value).toBe(42);
    expect(registry.get('object', 'fb3').value).toEqual({ rcb: { value: 42, time: 0 } });
  });

  it('writes only the number when rcb is disabled', () => {
    bare().bridgeReceiveIntegerFromNative('3', 42);
    expect(registry.get('number', 'fb3').value).toBe(42);
    expect(registry.has('object', 'fb3')).toBe(false);
  });

  it('hands rcb objects to the controller when enabled and stores them raw when disabled', () => {
    full().bridgeReceiveObjectFromNative('4', { rcb: { value: 100, time: 1000 } });
    expect(rcb.activeRamps).toBe(1);
    expect((registry.get('object', 'fb4').value as { rcb: { startv: number } }).rcb.startv).toBe(0);
    rcb.clearAll();

    bare().bridgeReceiveObjectFromNative('5', { rcb: { value: 100, time: 1000 } });
    expect(rcb.activeRamps).toBe(0);
    expect(registry.get('object', 'fb5').value).toEqual({ rcb: { value: 100, time: 1000 } });
  });

  it('writes ordinary objects and does not treat them as rcb', () => {
    full().bridgeReceiveObjectFromNative('Csig.Platform_Info', { name: 'TSW' });
    expect(registry.get('object', 'Csig.Platform_Info').value).toEqual({ name: 'TSW' });
    expect(rcb.activeRamps).toBe(0);
  });

  it('writes the sync signal and then hands it to resync when enabled', () => {
    const r = full();
    registry.get('boolean', 'fb1').write(true, true);
    const seen: object[] = [];
    registry.get('object', RESYNC_SIGNAL_NAME).subscribe((v) => seen.push(v));

    r.bridgeReceiveObjectFromNative(RESYNC_SIGNAL_NAME, { state: 'StartOfUpdate', value: { excludePrefixes: [] } });
    expect(resync.inUpdate).toBe(true);
    expect(seen.at(-1)).toEqual({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });

    r.bridgeReceiveObjectFromNative(RESYNC_SIGNAL_NAME, { state: 'EndOfUpdate' });
    expect(resync.inUpdate).toBe(false);
    expect(registry.get('boolean', 'fb1').value).toBe(false);
  });

  it('leaves the sync signal as a plain object when resync is disabled', () => {
    bare().bridgeReceiveObjectFromNative(RESYNC_SIGNAL_NAME, { state: 'StartOfUpdate', value: { excludePrefixes: [] } });
    expect(resync.inUpdate).toBe(false);
    expect(registry.get('object', RESYNC_SIGNAL_NAME).value).toEqual({
      state: 'StartOfUpdate',
      value: { excludePrefixes: [] },
    });
  });

  it('exposes hooks that work when detached from the instance', () => {
    const r: HostReceiveMethods = full();
    const { bridgeReceiveBooleanFromNative, bridgeReceiveIntegerFromNative, bridgeReceiveStringFromNative, bridgeReceiveObjectFromNative } = r;
    bridgeReceiveBooleanFromNative('1', true);
    bridgeReceiveIntegerFromNative('2', 2);
    bridgeReceiveStringFromNative('3', 's');
    bridgeReceiveObjectFromNative('4', { a: 1 });
    expect(registry.get('boolean', 'fb1').value).toBe(true);
    expect(registry.get('number', 'fb2').value).toBe(2);
    expect(registry.get('string', 'fb3').value).toBe('s');
    expect(registry.get('object', 'fb4').value).toEqual({ a: 1 });
    expect(logger.debug).toHaveBeenCalledTimes(4);
  });
});
