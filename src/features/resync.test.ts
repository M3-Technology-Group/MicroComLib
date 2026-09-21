import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RESYNC_DEFAULT_TIMEOUT_MS, RESYNC_SIGNAL_NAME, ResyncController, ResyncState } from './resync';
import { SignalRegistry } from '../signal/signal-registry';
import type { ResyncRange } from '../types';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const emptyRange = (): ResyncRange => ({
  boolean: { stateNames: [], joinLow: 0, joinHigh: 0 },
  numeric: { stateNames: [], joinLow: 0, joinHigh: 0 },
  string: { stateNames: [], joinLow: 0, joinHigh: 0 },
});

describe('ResyncController', () => {
  let registry: SignalRegistry;
  let resync: ResyncController;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = makeLogger();
    // Wire the registry's write listener to resync exactly as MicroComLib does.
    registry = new SignalRegistry(logger, (type, name) => resync.onWrite(type, name));
    resync = new ResyncController(registry, logger, 1000);
  });

  afterEach(() => {
    resync.dispose();
    vi.useRealTimers();
  });

  it('exposes upstream constants', () => {
    expect(RESYNC_SIGNAL_NAME).toBe('Csig.State_Synchronization');
    expect(RESYNC_DEFAULT_TIMEOUT_MS).toBe(60_000);
    expect(ResyncState.startOfUpdate).toBe('StartOfUpdate');
    expect(new ResyncController(registry, logger).inUpdate).toBe(false);
  });

  describe('request validation', () => {
    it('ignores non-objects and requests without a string state', () => {
      resync.handle(null);
      resync.handle('StartOfUpdate');
      resync.handle({});
      resync.handle({ state: 5 });
      expect(logger.warn).toHaveBeenCalledTimes(4);
      expect(resync.inUpdate).toBe(false);
    });

    it('ignores StartOfUpdate without an excludePrefixes array', () => {
      resync.handle({ state: 'StartOfUpdate' });
      resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: 'x' } });
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(resync.inUpdate).toBe(false);
    });

    it('ignores range starts without a range object', () => {
      resync.handle({ state: 'StartOfUpdateRange', value: {} });
      resync.handle({ state: 'StartOfUpdateRangeSO' });
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(resync.inUpdate).toBe(false);
    });

    it('debug-logs and ignores unknown states, including the unused ClearAll/ClearRange', () => {
      resync.handle({ state: 'ClearAll' });
      resync.handle({ state: 'Whatever' });
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Ignoring resync state "ClearAll"');
      expect(logger.debug).toHaveBeenCalledWith('Ignoring resync state "Whatever"');
    });
  });

  describe('shouldInclude', () => {
    it('excludes the sync signal itself and any excluded prefix', () => {
      expect(ResyncController.shouldInclude([], RESYNC_SIGNAL_NAME)).toBe(false);
      expect(ResyncController.shouldInclude(['Csig.'], 'Csig.HeartbeatRequest')).toBe(false);
      expect(ResyncController.shouldInclude(['Csig.'], 'fb1')).toBe(true);
      expect(ResyncController.shouldInclude(['a', 'fb'], 'fb1')).toBe(false);
    });
  });

  describe('StartOfUpdate → EndOfUpdate', () => {
    it('resets host-written signals that were not re-sent, per type, and leaves objects alone', () => {
      registry.get('boolean', 'fb1').write(true, true);
      registry.get('boolean', 'fb2').write(true, true);
      registry.get('number', 'fb3').write(50, true);
      registry.get('object', 'fb3').write({ rcb: { value: 50, time: 0 } }, true);
      registry.get('number', 'fb4').write(9, true);
      registry.get('string', 'fb5').write('old', true);
      registry.get('string', 'fb6').write('keep', true);
      registry.get('object', 'Csig.Platform_Info').write({ name: 'x' }, true);
      registry.get('boolean', 'local').write(true, false); // never from host
      registry.get('boolean', 'Csig.Backlight_Off_fb').write(true, true); // excluded prefix

      resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: ['Csig.'] } });
      expect(resync.inUpdate).toBe(true);
      // fb1, fb2, fb3(number), fb3(object), fb4, fb5, fb6 = 7; the Csig.* and local ones are not pending.
      expect(resync.pendingCount).toBe(7);

      // The control system re-sends the joins it still drives.
      registry.get('boolean', 'fb2').write(true, true);
      registry.get('number', 'fb4').write(9, true); // deduped write still counts
      registry.get('string', 'fb6').write('keep', true);
      expect(resync.pendingCount).toBe(4);

      resync.handle({ state: 'EndOfUpdate' });

      expect(resync.inUpdate).toBe(false);
      expect(resync.pendingCount).toBe(0);
      expect(registry.get('boolean', 'fb1').value).toBe(false);
      expect(registry.get('boolean', 'fb2').value).toBe(true);
      expect(registry.get('number', 'fb3').value).toBe(0);
      expect(registry.get('object', 'fb3').value).toEqual({ rcb: { value: 0, time: 0 } });
      expect(registry.get('number', 'fb4').value).toBe(9);
      expect(registry.get('string', 'fb5').value).toBe('');
      expect(registry.get('string', 'fb6').value).toBe('keep');
      expect(registry.get('object', 'Csig.Platform_Info').value).toEqual({ name: 'x' });
      expect(registry.get('boolean', 'local').value).toBe(true);
      expect(registry.get('boolean', 'Csig.Backlight_Off_fb').value).toBe(true);
    });

    it('does not mirror an rcb reset when the join has no object signal', () => {
      registry.get('number', 'fb3').write(50, true);
      resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });
      resync.handle({ state: 'EndOfUpdate' });
      expect(registry.get('number', 'fb3').value).toBe(0);
      expect(registry.has('object', 'fb3')).toBe(false);
    });

    it('requires one EndOfUpdate per StartOfUpdate and replaces the snapshot on each start', () => {
      registry.get('boolean', 'fb1').write(true, true);
      resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });
      registry.get('boolean', 'fb2').write(true, true);
      resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });
      expect(resync.pendingCount).toBe(2);

      resync.handle({ state: 'EndOfUpdate' });
      expect(resync.inUpdate).toBe(true);
      expect(registry.get('boolean', 'fb1').value).toBe(true);

      resync.handle({ state: 'EndOfUpdate' });
      expect(resync.inUpdate).toBe(false);
      expect(registry.get('boolean', 'fb1').value).toBe(false);
      expect(registry.get('boolean', 'fb2').value).toBe(false);
    });

    it('ignores EndOfUpdate outside a window and writes outside a window', () => {
      registry.get('boolean', 'fb1').write(true, true);
      resync.handle({ state: 'EndOfUpdate' });
      expect(registry.get('boolean', 'fb1').value).toBe(true);
      resync.onWrite('boolean', 'fb1');
      expect(resync.pendingCount).toBe(0);
    });

    it('resets on timeout when EndOfUpdate never arrives, and restarts the timer on each start', () => {
      registry.get('boolean', 'fb1').write(true, true);
      resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });
      vi.advanceTimersByTime(600);
      resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });
      vi.advanceTimersByTime(600);
      expect(resync.inUpdate).toBe(true);
      expect(registry.get('boolean', 'fb1').value).toBe(true);

      vi.advanceTimersByTime(400);
      expect(resync.inUpdate).toBe(false);
      expect(registry.get('boolean', 'fb1').value).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Resync timed out waiting for EndOfUpdate (2 outstanding)');

      // Fully reset: a lone EndOfUpdate afterwards is ignored.
      registry.get('boolean', 'fb1').write(true, true);
      resync.handle({ state: 'EndOfUpdate' });
      expect(registry.get('boolean', 'fb1').value).toBe(true);
    });

    it('uses the upstream 60 s limit by default', () => {
      const r = new ResyncController(registry, logger);
      registry.get('boolean', 'fb1').write(true, true);
      r.handle({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });
      vi.advanceTimersByTime(RESYNC_DEFAULT_TIMEOUT_MS - 1);
      expect(r.inUpdate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(r.inUpdate).toBe(false);
      r.dispose();
    });
  });

  describe('StartOfUpdateRange', () => {
    it('marks fb-prefixed join ranges and named states, then resets those still pending', () => {
      registry.get('boolean', 'fb10').write(true, true);
      registry.get('boolean', 'fb11').write(true, true);
      registry.get('boolean', 'fb12').write(true, true);
      registry.get('number', 'Zone.Volume').write(70, true);
      registry.get('string', 'fb5').write('x', true);
      registry.get('boolean', 'fb99').write(true, true); // outside range

      const range = emptyRange();
      range.boolean = { stateNames: [], joinLow: 10, joinHigh: 12 };
      range.numeric = { stateNames: ['Zone.Volume', 'Zone.Missing'], joinLow: 0, joinHigh: 0 };
      range.string = { stateNames: [], joinLow: 5, joinHigh: 5 };
      resync.handle({ state: 'StartOfUpdateRange', value: { range, excludePrefixes: [] } });

      expect(resync.inUpdate).toBe(true);
      expect(resync.pendingCount).toBe(6);

      registry.get('boolean', 'fb11').write(true, true);
      resync.handle({ state: 'EndOfUpdate' });

      expect(registry.get('boolean', 'fb10').value).toBe(false);
      expect(registry.get('boolean', 'fb11').value).toBe(true);
      expect(registry.get('boolean', 'fb12').value).toBe(false);
      expect(registry.get('number', 'Zone.Volume').value).toBe(0);
      expect(registry.has('number', 'Zone.Missing')).toBe(false);
      expect(registry.get('string', 'fb5').value).toBe('');
      expect(registry.get('boolean', 'fb99').value).toBe(true);
    });

    it('accumulates across multiple range messages in one window', () => {
      registry.get('boolean', 'fb1').write(true, true);
      registry.get('boolean', 'fb2').write(true, true);
      const a = emptyRange();
      a.boolean = { stateNames: [], joinLow: 1, joinHigh: 1 };
      const b = emptyRange();
      b.boolean = { stateNames: [], joinLow: 2, joinHigh: 2 };
      resync.handle({ state: 'StartOfUpdateRange', value: { range: a } });
      resync.handle({ state: 'StartOfUpdateRangeSO', value: { range: b } });
      expect(resync.pendingCount).toBe(2);
      // Only the non-SO variant opened a window, so one EndOfUpdate closes it.
      resync.handle({ state: 'EndOfUpdate' });
      expect(registry.get('boolean', 'fb1').value).toBe(false);
      expect(registry.get('boolean', 'fb2').value).toBe(false);
    });

    it('the SO variant alone marks names without opening a window', () => {
      const range = emptyRange();
      range.boolean = { stateNames: ['x'], joinLow: 0, joinHigh: 0 };
      resync.handle({ state: 'StartOfUpdateRangeSO', value: { range } });
      expect(resync.inUpdate).toBe(false);
      expect(resync.pendingCount).toBe(1);
    });

    it('tolerates missing or malformed range entries', () => {
      const range = {
        boolean: undefined,
        numeric: { stateNames: undefined, joinLow: 'a', joinHigh: 3 },
        string: { stateNames: ['s'], joinLow: 2, joinHigh: 'b' },
      } as unknown as ResyncRange;
      resync.handle({ state: 'StartOfUpdateRange', value: { range } });
      // numeric: joinLow coerced to 0, joinHigh 3 → fb0..fb3; string: joinHigh coerced to 0 → fb2..fb0 is empty, plus 's'
      expect(resync.pendingCount).toBe(5);
    });
  });

  it('dispose clears the window and pending names', () => {
    registry.get('boolean', 'fb1').write(true, true);
    resync.handle({ state: 'StartOfUpdate', value: { excludePrefixes: [] } });
    resync.dispose();
    expect(resync.inUpdate).toBe(false);
    expect(resync.pendingCount).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(registry.get('boolean', 'fb1').value).toBe(true);
  });
});
