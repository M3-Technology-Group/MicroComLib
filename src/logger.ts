import type { Logger } from './types';

const PREFIX = '[MicroComLib]';

function noop(): void {
  /* silent */
}

/**
 * Builds the internal logger from the `logger` option. Missing levels on a partial logger are
 * silent; `false` silences everything; `undefined` warns and errors to the console and stays quiet
 * at debug/info.
 */
export function createLogger(option: Partial<Logger> | false | undefined): Logger {
  if (option === false) {
    return { debug: noop, info: noop, warn: noop, error: noop };
  }
  const custom = option ?? {};
  return {
    debug: custom.debug ? (...args) => custom.debug!(...args) : noop,
    info: custom.info ? (...args) => custom.info!(...args) : noop,
    warn: custom.warn ? (...args) => custom.warn!(...args) : (...args) => console.warn(PREFIX, ...args),
    error: custom.error ? (...args) => custom.error!(...args) : (...args) => console.error(PREFIX, ...args),
  };
}
