/**
 * MicroComLib - a minimalistic implementation of the Crestron CH5 CrComLib signal layer.
 *
 * Zero runtime dependencies. Never imports `@crestron/ch5-crcomlib`. Consumed as an instance
 * (`MicroComLib.getInstance()`), which installs only the four host-facing receive hooks that
 * Android, iOS and Web XPanel hosts require, and nothing else, on `globalThis`.
 */

export { MicroComLib } from './api/micro-com-lib';

export type * from './types';

export { normalizeSignalType, seedValueFor, signalTypeOfValue, SIGNAL_TYPES } from './signal/signal-type';
export {
  JOIN_NUMBER_SIGNAL_NAME_PREFIX,
  isIntegerSignalName,
  toJoinNumberSignalName,
  toSubscriptionSignalName,
} from './signal/signal-name';
export type { RegistrySnapshot, SignalSnapshot } from './signal/signal-registry';

export { RCB_INTERVAL_DURATION_MS, completedRcb, isRcbObject } from './features/rcb';
export { RESYNC_DEFAULT_TIMEOUT_MS, RESYNC_SIGNAL_NAME, ResyncState } from './features/resync';
export { HEARTBEAT_REQUEST_SIGNAL, HEARTBEAT_RESPONSE_SIGNAL } from './features/heartbeat';
export {
  REPEAT_DIGITAL_DEFAULT_INTERVAL_MS,
  REPEAT_DIGITAL_KEY,
  isRepeatDigitalValue,
  repeatDigital,
  unwrapRepeatDigital,
} from './features/repeat-digital';
export { CRCOMLIB_GLOBAL_NAME, RECEIVE_HOOK_NAMES } from './bridge/bridge-globals';

export { probeHost } from './transport/detect-transport';
export { DirectCallTransport } from './transport/adapters/direct-call-transport';
export { WebKitTransport, encodeWebKitMessage } from './transport/adapters/webkit-transport';
export { NullTransport, NO_HOST_WARNING } from './transport/adapters/null-transport';
export { SEND_METHOD, SUBSCRIBE_METHOD, UNSUBSCRIBE_METHOD } from './transport/transport';

/** The MicroComLib version, substituted from package.json at build time. */
export const VERSION: string = __MICROCOMLIB_VERSION__;
