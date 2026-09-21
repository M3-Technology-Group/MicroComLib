import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from './logger';

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to console for warn/error and silence for debug/info', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const logger = createLogger(undefined);
    logger.debug('d');
    logger.info('i');
    logger.warn('w', 1);
    logger.error('e', 2);

    expect(warn).toHaveBeenCalledWith('[MicroComLib]', 'w', 1);
    expect(error).toHaveBeenCalledWith('[MicroComLib]', 'e', 2);
    expect(log).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('is fully silent when given false', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const logger = createLogger(false);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('routes each provided level to the custom function and silences the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const custom = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const logger = createLogger(custom);
    logger.debug('a', 1);
    logger.info('b', 2);
    logger.warn('c', 3);
    logger.error('d', 4);

    expect(custom.debug).toHaveBeenCalledWith('a', 1);
    expect(custom.info).toHaveBeenCalledWith('b', 2);
    expect(custom.warn).toHaveBeenCalledWith('c', 3);
    expect(custom.error).toHaveBeenCalledWith('d', 4);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('falls back per level when the custom logger is partial', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const custom = { error: vi.fn() };

    const logger = createLogger(custom);
    logger.debug('silent');
    logger.warn('w');
    logger.error('e');

    expect(warn).toHaveBeenCalledWith('[MicroComLib]', 'w');
    expect(custom.error).toHaveBeenCalledWith('e');
  });
});
