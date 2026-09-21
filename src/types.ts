/**
 * Public types for MicroComLib.
 *
 * Upstream-compatible aliases (the `TSignal*`, `Ch5Rcb*`, `I*Model` names exported by
 * `@crestron/ch5-crcomlib`) live at the bottom so consumers can migrate by changing an import.
 */

// ─── Signal types and values ──────────────────────────────────────────────────

/** The four canonical signal types. Each is its own registry bucket. */
export type SignalType = 'boolean' | 'number' | 'string' | 'object';

export type BooleanTypeAlias = 'b' | 'boolean';
export type NumberTypeAlias = 'n' | 'number' | 'numeric';
export type StringTypeAlias = 's' | 'string';
export type ObjectTypeAlias = 'o' | 'object';

/**
 * Every spelling the public API accepts for a signal type. Matching is case-insensitive at
 * runtime; the literal union documents the lowercase forms that get typed overloads.
 */
export type SignalTypeAlias = BooleanTypeAlias | NumberTypeAlias | StringTypeAlias | ObjectTypeAlias;

/** Any value a signal can carry. */
export type SignalValue = boolean | number | string | object;

/** Maps a canonical signal type to the TypeScript type of its values. */
export type SignalValueOf<T extends SignalType> = T extends 'boolean'
  ? boolean
  : T extends 'number'
    ? number
    : T extends 'string'
      ? string
      : object;

/** Called with the current value on subscribe and with every subsequent value. */
export type SignalCallback<T> = (value: T) => void;

/**
 * Called when `subscribeState` is given an unsupported type (with a message string), or when the
 * paired {@link SignalCallback} throws (with the thrown error).
 */
export type SignalErrorCallback = (error: unknown) => void;

// ─── RCB (Ramped Control Block) ───────────────────────────────────────────────

/** An RCB as the control system sends it: ramp the analog to `value` over `time` ms. */
export interface RcbSimpleObject {
  rcb: {
    value: number;
    time: number;
  };
}

/** An RCB after MicroComLib has annotated it with the ramp start point. */
export interface RcbExtendedObject {
  rcb: {
    value: number;
    time: number;
    /** Analog value when the ramp started. */
    startv: number;
    /** `Date.now()` when the ramp started. */
    startt: number;
  };
}

export type RcbObject = RcbSimpleObject | RcbExtendedObject;

// ─── RepeatDigital ────────────────────────────────────────────────────────────

/** The object form a press-and-hold digital is published as. */
export interface RepeatDigitalValue {
  repeatdigital: boolean;
}

// ─── Resync (`Csig.State_Synchronization`) ───────────────────────────────────

export interface ResyncRangeEntry {
  stateNames: string[];
  joinLow: number;
  joinHigh: number;
}

/** The `range` payload of a `StartOfUpdateRange` request. Note `numeric`, not `number`. */
export interface ResyncRange {
  boolean: ResyncRangeEntry;
  numeric: ResyncRangeEntry;
  string: ResyncRangeEntry;
}

/** The object the control system publishes on `Csig.State_Synchronization`. */
export interface ResyncRequest {
  id?: string;
  state: string;
  value?: {
    excludePrefixes?: string[];
    range?: ResyncRange;
  };
}

// ─── Host contracts ───────────────────────────────────────────────────────────

/** Outbound methods offered by Android `JSInterface` and Web XPanel `CommunicationInterface`. */
export interface HostSendMethods {
  bridgeSendBooleanToNative(signalName: string, value: boolean): void;
  bridgeSendIntegerToNative(signalName: string, value: number): void;
  bridgeSendStringToNative(signalName: string, value: string): void;
  bridgeSendObjectToNative(signalName: string, jsonEncodedValue: string): void;
}

/** Optional per-signal subscription hints offered by Android `JSInterface`. */
export interface HostSubscribeMethods {
  bridgeSubscribeBooleanSignalFromNative(signalName: string): void;
  bridgeSubscribeIntegerSignalFromNative(signalName: string): void;
  bridgeSubscribeStringSignalFromNative(signalName: string): void;
  bridgeSubscribeObjectSignalFromNative(signalName: string): void;
}

/** Optional per-signal unsubscription hints offered by Android `JSInterface`. */
export interface HostUnsubscribeMethods {
  bridgeUnsubscribeBooleanSignalFromNative(signalName: string): void;
  bridgeUnsubscribeIntegerSignalFromNative(signalName: string): void;
  bridgeUnsubscribeStringSignalFromNative(signalName: string): void;
  bridgeUnsubscribeObjectSignalFromNative(signalName: string): void;
}

/** One iOS `webkit.messageHandlers.<name>` entry. */
export interface WebKitMessageHandler {
  postMessage(message: string | object): void;
}

/** The `webkit.messageHandlers` bag. Handlers are looked up by name and may be absent. */
export type WebKitMessageHandlers = Record<string, WebKitMessageHandler | undefined>;

/** The inbound hooks every host calls, on `globalThis` (Android/iOS) or on `globalThis.CrComLib` (XPanel). */
export interface HostReceiveMethods {
  bridgeReceiveBooleanFromNative(signalName: string, value: boolean): void;
  bridgeReceiveIntegerFromNative(signalName: string, value: number): void;
  bridgeReceiveStringFromNative(signalName: string, value: string): void;
  bridgeReceiveObjectFromNative(signalName: string, value: object): void;
}

export type TransportKind = 'xpanel' | 'android' | 'ios' | 'none';

/**
 * Outbound transport to the host. Built-in implementations cover the three Crestron hosts; a custom
 * one can be injected through {@link MicroComLibOptions.transport} for tests and emulators.
 */
export interface HostTransport {
  readonly kind: TransportKind | (string & {});
  send(type: SignalType, name: string, value: SignalValue): void;
  /** First-subscriber hint. Absent on hosts that declare none (Web XPanel). */
  subscribe?(type: SignalType, name: string): void;
  /** Last-subscriber hint. Absent on hosts that declare none (Web XPanel). */
  unsubscribe?(type: SignalType, name: string): void;
}

// ─── Logging and options ──────────────────────────────────────────────────────

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface MicroComLibOptions {
  /** Object to probe for host globals and to install the receive hooks on. Defaults to `globalThis`. */
  scope?: object;
  /** Skip host detection entirely and use this transport. */
  transport?: HostTransport;
  /** Echo `Csig.HeartbeatRequest` to `Csig.HeartbeatResponse`. Default `true`. */
  heartbeat?: boolean;
  /** Handle `Csig.State_Synchronization`. Default `true`. */
  resync?: boolean;
  /** Interpolate RCB ramps into the analog signal. Default `true`. */
  rcb?: boolean;
  /** Send matched first/last-subscriber hints to Android/iOS hosts. Default `false`. */
  hostSubscriptionHints?: boolean;
  /** Partial logger (missing levels are silent), or `false` to silence everything. Default warns/errors to console. */
  logger?: Partial<Logger> | false;
  /** Re-publish interval while a RepeatDigital is held. Default `250`. */
  repeatDigitalIntervalMs?: number;
  /** Stuck-resync guard. Default `60000`. */
  resyncTimeoutMs?: number;
}

// ─── Upstream-compatible aliases ─────────────────────────────────────────────

export type TSignalNonStandardTypeName = SignalTypeAlias;
export type TSignalStandardTypeName = SignalType;
export type TSignalValue = SignalValue;
export type TRepeatDigitalSignalValue = { [key: string]: boolean | string | number | object };
export type Ch5RcbSimpleObject = RcbSimpleObject;
export type Ch5RcbExtendedObject = RcbExtendedObject;
export type Ch5RcbObject = RcbObject;
export type Ch5SignalUpdateCallback<T> = SignalCallback<T>;
export type Ch5SignalErrorCallback = SignalErrorCallback;
export type IResynchronizationRequestModel = ResyncRequest;
export type ICh5ClearRangeDataModel = ResyncRange;
export type ISigComSendToNative = HostSendMethods;
export type ISigComSubscribe = HostSubscribeMethods;
export type ISigComUnsubscribe = HostUnsubscribeMethods;
export type ISigComReceiveFromNative = HostReceiveMethods;
export type ISWebXPanel = HostSendMethods;

// ─── The CrComLib-compatible API surface ─────────────────────────────────────

/**
 * Catch-all callback type for the untyped overloads, where the signal type is only known at
 * runtime. The typed overloads narrow the callback parameter to the concrete value type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySignalCallback = (value: any) => void;

/**
 * Resolves to `never` when `T` is one of the lowercase type aliases, so the untyped overloads below
 * only match a type argument that is a dynamic `string` (or an unknown literal). A literal alias with
 * a mismatched value or callback is therefore a compile error instead of silently widening.
 */
export type NotSignalTypeAlias<T> = T extends SignalTypeAlias ? never : unknown;

/**
 * The four CrComLib functions with MicroComLib's semantics. Typed overloads fire when the type
 * argument is a lowercase literal (`'b'`, `'number'`, …); a dynamic `string` falls through to the
 * untyped forms, matching how `window.CrComLib` has always been typed.
 */
export interface SignalApi {
  getState(type: BooleanTypeAlias, name: string, defaultValue?: boolean): boolean | null;
  getState(type: NumberTypeAlias, name: string, defaultValue?: number): number | null;
  getState(type: StringTypeAlias, name: string, defaultValue?: string): string | null;
  getState(type: ObjectTypeAlias, name: string, defaultValue?: object): object | null;
  getState<T extends string>(type: T & NotSignalTypeAlias<T>, name: string, defaultValue?: SignalValue): SignalValue | null;

  subscribeState(type: BooleanTypeAlias, name: string, callback: SignalCallback<boolean>, errorCallback?: SignalErrorCallback): string;
  subscribeState(type: NumberTypeAlias, name: string, callback: SignalCallback<number>, errorCallback?: SignalErrorCallback): string;
  subscribeState(type: StringTypeAlias, name: string, callback: SignalCallback<string>, errorCallback?: SignalErrorCallback): string;
  subscribeState(type: ObjectTypeAlias, name: string, callback: SignalCallback<object>, errorCallback?: SignalErrorCallback): string;
  subscribeState<T extends string>(type: T & NotSignalTypeAlias<T>, name: string, callback: AnySignalCallback, errorCallback?: SignalErrorCallback): string;

  unsubscribeState(type: string, name: string, subscriptionId: string): void;

  publishEvent(type: BooleanTypeAlias, name: string, value: boolean): void;
  publishEvent(type: NumberTypeAlias, name: string, value: number): void;
  publishEvent(type: StringTypeAlias, name: string, value: string): void;
  publishEvent(type: ObjectTypeAlias, name: string, value: object): void;
  publishEvent<T extends string>(type: T & NotSignalTypeAlias<T>, name: string, value: SignalValue): void;
}
