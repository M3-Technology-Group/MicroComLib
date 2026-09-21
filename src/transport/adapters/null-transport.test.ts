import { describe, expect, it, vi } from 'vitest';

import type { HostTransport } from '../../types';
import { NO_HOST_WARNING, NullTransport } from './null-transport';

describe('NullTransport', () => {
  it('warns once, then only debug-logs', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const t: HostTransport = new NullTransport(logger);
    expect(t.kind).toBe('none');

    t.send('boolean', 'a', true);
    t.send('number', 'b', 1);
    t.send('object', 'c', { x: 1 });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(NO_HOST_WARNING);
    expect(logger.debug).toHaveBeenCalledTimes(3);
    expect(logger.debug).toHaveBeenCalledWith('dropped object "c"', { x: 1 });
    expect(t.subscribe).toBeUndefined();
    expect(t.unsubscribe).toBeUndefined();
  });
});
