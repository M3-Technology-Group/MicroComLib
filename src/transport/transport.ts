import type {
  HostSendMethods,
  HostSubscribeMethods,
  HostUnsubscribeMethods,
  SignalType,
  SignalValue,
} from '../types';

/** Outbound method per signal type. Identical on Android `JSInterface` and XPanel `CommunicationInterface`. */
export const SEND_METHOD: Readonly<Record<SignalType, keyof HostSendMethods>> = {
  boolean: 'bridgeSendBooleanToNative',
  number: 'bridgeSendIntegerToNative',
  string: 'bridgeSendStringToNative',
  object: 'bridgeSendObjectToNative',
};

export const SUBSCRIBE_METHOD: Readonly<Record<SignalType, keyof HostSubscribeMethods>> = {
  boolean: 'bridgeSubscribeBooleanSignalFromNative',
  number: 'bridgeSubscribeIntegerSignalFromNative',
  string: 'bridgeSubscribeStringSignalFromNative',
  object: 'bridgeSubscribeObjectSignalFromNative',
};

export const UNSUBSCRIBE_METHOD: Readonly<Record<SignalType, keyof HostUnsubscribeMethods>> = {
  boolean: 'bridgeUnsubscribeBooleanSignalFromNative',
  number: 'bridgeUnsubscribeIntegerSignalFromNative',
  string: 'bridgeUnsubscribeStringSignalFromNative',
  object: 'bridgeUnsubscribeObjectSignalFromNative',
};

export const SEND_METHOD_NAMES: readonly string[] = Object.values(SEND_METHOD);
export const SUBSCRIBE_METHOD_NAMES: readonly string[] = Object.values(SUBSCRIBE_METHOD);
export const UNSUBSCRIBE_METHOD_NAMES: readonly string[] = Object.values(UNSUBSCRIBE_METHOD);

/**
 * The three send methods Android is required to have. Upstream deliberately does not require
 * `bridgeSendObjectToNative` on `JSInterface` (there is a TODO to put it back), so neither do we.
 */
export const ANDROID_REQUIRED_SEND_METHOD_NAMES: readonly string[] = [
  SEND_METHOD.boolean,
  SEND_METHOD.number,
  SEND_METHOD.string,
];

export type AnyHostObject = Record<string, unknown>;

export function isHostObject(value: unknown): value is AnyHostObject {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/** True when `target` is an object exposing every named property as a function. */
export function hasFunctions(target: unknown, names: readonly string[]): target is AnyHostObject {
  return isHostObject(target) && names.every((name) => typeof target[name] === 'function');
}

/** True when `target` is an object on which every named property is defined (any type). */
export function hasDefined(target: unknown, names: readonly string[]): target is AnyHostObject {
  return isHostObject(target) && names.every((name) => target[name] !== undefined);
}

/** Android and XPanel receive objects pre-encoded as JSON strings; scalars pass through. */
export function encodeForDirectCall(type: SignalType, value: SignalValue): SignalValue {
  return type === 'object' ? JSON.stringify(value) : value;
}
