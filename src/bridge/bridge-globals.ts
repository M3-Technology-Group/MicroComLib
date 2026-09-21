import type { HostReceiveMethods, Logger } from '../types';

/** The bare globals Android and iOS hosts call. */
export const RECEIVE_HOOK_NAMES = [
  'bridgeReceiveBooleanFromNative',
  'bridgeReceiveIntegerFromNative',
  'bridgeReceiveStringFromNative',
  'bridgeReceiveObjectFromNative',
] as const satisfies readonly (keyof HostReceiveMethods)[];

/** The global Web XPanel calls `bridgeReceive*FromNative` on. */
export const CRCOMLIB_GLOBAL_NAME = 'CrComLib';

const OWNER_KEY = Symbol.for('microcomlib.attachedOwner');
const SHIM_KEY = Symbol.for('microcomlib.receiveShim');

export interface AttachedGlobals {
  /** Removes everything `attachBridgeGlobals` installed and restores what was there before. */
  detach(): void;
}

interface Saved {
  existed: boolean;
  value: unknown;
}

type Scope = Record<PropertyKey, unknown>;

function isOurShim(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as Scope)[SHIM_KEY] === true;
}

/**
 * Installs the minimum host-facing surface on `scope`:
 *
 * - the four bare `bridgeReceive*FromNative` functions, which Android and iOS evaluate directly;
 * - a receive-only `CrComLib` object carrying the same four functions, because
 *   `@crestron/ch5-webxpanel` delivers feedback through `CrComLib.bridgeReceive*FromNative(...)`
 *   as a bare global lookup and has no other path.
 *
 * Nothing else lands on the scope. Attaching while another owner is attached, or while a real
 * `CrComLib` is present, throws: two signal layers cannot share one host.
 */
export function attachBridgeGlobals(
  scope: object,
  hooks: HostReceiveMethods,
  owner: object,
  logger: Logger,
): AttachedGlobals {
  const g = scope as Scope;

  const currentOwner = g[OWNER_KEY];
  if (currentOwner !== undefined && currentOwner !== owner) {
    throw new Error('MicroComLib: another instance is already attached to this scope; detach() it first.');
  }
  const existingCrComLib = g[CRCOMLIB_GLOBAL_NAME];
  if (existingCrComLib !== undefined && !isOurShim(existingCrComLib)) {
    throw new Error(
      'MicroComLib: a CrComLib global is already present. MicroComLib cannot run alongside @crestron/ch5-crcomlib on the same page.',
    );
  }

  const saved = new Map<PropertyKey, Saved>();
  const remember = (key: PropertyKey): void => {
    saved.set(key, { existed: Object.prototype.hasOwnProperty.call(g, key), value: g[key] });
  };

  for (const name of RECEIVE_HOOK_NAMES) {
    remember(name);
    g[name] = hooks[name];
  }

  remember(CRCOMLIB_GLOBAL_NAME);
  const shim: Scope = {};
  for (const name of RECEIVE_HOOK_NAMES) {
    shim[name] = hooks[name];
  }
  Object.defineProperty(shim, SHIM_KEY, { value: true, enumerable: false });
  g[CRCOMLIB_GLOBAL_NAME] = shim;

  Object.defineProperty(g, OWNER_KEY, { value: owner, enumerable: false, configurable: true, writable: true });
  logger.debug('Attached bridge globals');

  return {
    detach(): void {
      for (const [key, previous] of saved) {
        if (previous.existed) {
          g[key] = previous.value;
        } else {
          delete g[key];
        }
      }
      delete g[OWNER_KEY];
      logger.debug('Detached bridge globals');
    },
  };
}
