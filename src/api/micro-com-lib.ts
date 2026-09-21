import { BridgeReceiver } from '../bridge/bridge-receive';
import { type AttachedGlobals, attachBridgeGlobals } from '../bridge/bridge-globals';
import { Heartbeat } from '../features/heartbeat';
import * as helpers from './helpers';
import { createLogger } from '../logger';
import { RcbController } from '../features/rcb';
import { RepeatDigitalController } from '../features/repeat-digital';
import { ResyncController } from '../features/resync';
import { toSubscriptionSignalName } from '../signal/signal-name';
import { type RegistrySnapshot, SignalRegistry } from '../signal/signal-registry';
import { normalizeSignalType, signalTypeOfValue } from '../signal/signal-type';
import { TransportResolver } from '../transport/detect-transport';
import type {
  AnySignalCallback,
  BooleanTypeAlias,
  HostReceiveMethods,
  Logger,
  MicroComLibOptions,
  NotSignalTypeAlias,
  NumberTypeAlias,
  ObjectTypeAlias,
  SignalApi,
  SignalCallback,
  SignalErrorCallback,
  SignalValue,
  StringTypeAlias,
} from '../types';

/**
 * A minimal, dependency-free implementation of the Crestron CrComLib signal layer.
 *
 * Use {@link MicroComLib.getInstance} for the app-wide singleton: it also installs the host-facing
 * receive hooks on `globalThis` so Android, iOS and Web XPanel hosts can deliver feedback. Construct
 * directly (`new MicroComLib(options)`) for an isolated instance that touches nothing global, for
 * tests or emulators.
 */
export class MicroComLib implements SignalApi, HostReceiveMethods {
  static #instance: MicroComLib | null = null;

  /** The app-wide singleton, created and attached on first call. Later `options` are ignored with a warning. */
  static getInstance(options?: MicroComLibOptions): MicroComLib {
    if (MicroComLib.#instance === null) {
      MicroComLib.#instance = new MicroComLib(options).attach();
    } else if (options !== undefined) {
      MicroComLib.#instance.logger.warn('getInstance(options) ignored: the singleton already exists');
    }
    return MicroComLib.#instance;
  }

  static hasInstance(): boolean {
    return MicroComLib.#instance !== null;
  }

  /** Disposes the singleton, if any, so the next `getInstance()` starts fresh. Mainly for tests. */
  static resetInstance(): void {
    MicroComLib.#instance?.dispose();
  }

  readonly version: string = __MICROCOMLIB_VERSION__;

  private readonly logger: Logger;
  private readonly scope: object;
  private readonly registry: SignalRegistry;
  private readonly rcb: RcbController | null;
  private readonly resync: ResyncController | null;
  private readonly receiver: BridgeReceiver;
  private readonly resolver: TransportResolver;
  private readonly repeatDigital: RepeatDigitalController;
  private readonly heartbeat: Heartbeat | null;
  private readonly hostSubscriptionHints: boolean;
  private attachedGlobals: AttachedGlobals | null = null;

  readonly bridgeReceiveBooleanFromNative: HostReceiveMethods['bridgeReceiveBooleanFromNative'];
  readonly bridgeReceiveIntegerFromNative: HostReceiveMethods['bridgeReceiveIntegerFromNative'];
  readonly bridgeReceiveStringFromNative: HostReceiveMethods['bridgeReceiveStringFromNative'];
  readonly bridgeReceiveObjectFromNative: HostReceiveMethods['bridgeReceiveObjectFromNative'];

  constructor(options: MicroComLibOptions = {}) {
    this.logger = createLogger(options.logger);
    this.scope = options.scope ?? globalThis;
    this.hostSubscriptionHints = options.hostSubscriptionHints === true;

    this.registry = new SignalRegistry(this.logger, (type, name) => this.resync?.onWrite(type, name));
    this.resync = options.resync === false ? null : new ResyncController(this.registry, this.logger, options.resyncTimeoutMs);
    this.rcb = options.rcb === false ? null : new RcbController(this.registry, this.logger);
    this.receiver = new BridgeReceiver(this.registry, this.logger, this.rcb, this.resync);
    this.resolver = new TransportResolver(this.scope, this.logger, options.transport);
    this.repeatDigital = new RepeatDigitalController(this, options.repeatDigitalIntervalMs);
    this.heartbeat = options.heartbeat === false ? null : new Heartbeat(this);

    this.bridgeReceiveBooleanFromNative = this.receiver.bridgeReceiveBooleanFromNative;
    this.bridgeReceiveIntegerFromNative = this.receiver.bridgeReceiveIntegerFromNative;
    this.bridgeReceiveStringFromNative = this.receiver.bridgeReceiveStringFromNative;
    this.bridgeReceiveObjectFromNative = this.receiver.bridgeReceiveObjectFromNative;
  }

  // ─── The four CrComLib functions ────────────────────────────────────────────

  /**
   * Current value of a signal, or `defaultValue` (else `null`) if the signal does not exist or has
   * never been written. The seed `false`/`0`/`''`/`{}` is never reported as real data. Never
   * creates a signal.
   */
  getState(type: BooleanTypeAlias, name: string, defaultValue?: boolean): boolean | null;
  getState(type: NumberTypeAlias, name: string, defaultValue?: number): number | null;
  getState(type: StringTypeAlias, name: string, defaultValue?: string): string | null;
  getState(type: ObjectTypeAlias, name: string, defaultValue?: object): object | null;
  getState<T extends string>(type: T & NotSignalTypeAlias<T>, name: string, defaultValue?: SignalValue): SignalValue | null;
  getState(type: string, name: string, defaultValue?: SignalValue): SignalValue | null {
    const fallback = defaultValue !== undefined && defaultValue !== null ? defaultValue : null;
    const signalType = normalizeSignalType(type);
    if (signalType === null) {
      return fallback;
    }
    const signal = this.registry.get(signalType, toSubscriptionSignalName(String(name)), false);
    return signal !== null && signal.hasChanged ? signal.value : fallback;
  }

  /**
   * Subscribes to a signal. The callback runs synchronously with the current value, then on every
   * write. Returns the id for {@link unsubscribeState}, or `''` (after calling `errorCallback`) for
   * an unsupported type. Integer-like names address the feedback side of that join.
   */
  subscribeState(type: BooleanTypeAlias, name: string, callback: SignalCallback<boolean>, errorCallback?: SignalErrorCallback): string;
  subscribeState(type: NumberTypeAlias, name: string, callback: SignalCallback<number>, errorCallback?: SignalErrorCallback): string;
  subscribeState(type: StringTypeAlias, name: string, callback: SignalCallback<string>, errorCallback?: SignalErrorCallback): string;
  subscribeState(type: ObjectTypeAlias, name: string, callback: SignalCallback<object>, errorCallback?: SignalErrorCallback): string;
  subscribeState<T extends string>(type: T & NotSignalTypeAlias<T>, name: string, callback: AnySignalCallback, errorCallback?: SignalErrorCallback): string;
  subscribeState(type: string, name: string, callback: AnySignalCallback, errorCallback?: SignalErrorCallback): string {
    const signalName = toSubscriptionSignalName(String(name));
    const signalType = normalizeSignalType(type);
    if (signalType === null) {
      errorCallback?.(`Signal: ${signalName}, has unsupported type: ${type}`);
      return '';
    }
    const signal = this.registry.get(signalType, signalName);
    if (this.hostSubscriptionHints && signal.subscriberCount === 0) {
      this.resolver.resolve().subscribe?.(signalType, signalName);
    }
    return signal.subscribe(callback, errorCallback);
  }

  unsubscribeState(type: string, name: string, subscriptionId: string): void {
    const signalType = normalizeSignalType(type);
    if (signalType === null) {
      return;
    }
    const signalName = toSubscriptionSignalName(String(name));
    const signal = this.registry.get(signalType, signalName, false);
    if (signal === null || !signal.unsubscribe(subscriptionId)) {
      return;
    }
    if (this.hostSubscriptionHints && signal.subscriberCount === 0) {
      this.resolver.resolve().unsubscribe?.(signalType, signalName);
    }
  }

  /**
   * Writes a value locally and sends it to the host. The name is used verbatim, so publishing to
   * join `"200"` does not echo into subscribers of join `"200"` (they listen on the feedback side);
   * publishing to a named signal does echo to its local subscribers. The outbound wire method is
   * chosen by the runtime type of `value`, exactly as upstream does.
   */
  publishEvent(type: BooleanTypeAlias, name: string, value: boolean): void;
  publishEvent(type: NumberTypeAlias, name: string, value: number): void;
  publishEvent(type: StringTypeAlias, name: string, value: string): void;
  publishEvent(type: ObjectTypeAlias, name: string, value: object): void;
  publishEvent<T extends string>(type: T & NotSignalTypeAlias<T>, name: string, value: SignalValue): void;
  publishEvent(type: string, name: string, value: SignalValue): void {
    const signalType = normalizeSignalType(type);
    if (signalType === null) {
      this.logger.warn(`publishEvent ignored: unsupported type "${type}" for "${name}"`);
      return;
    }
    const signalName = String(name);
    this.logger.debug(`→ ${signalType} "${signalName}"`, value);
    this.registry.get(signalType, signalName).write(value, false);
    this.resolver.resolve().send(signalTypeOfValue(value), signalName, value);
  }

  // ─── Host hooks lifecycle ───────────────────────────────────────────────────

  /** Whether the receive hooks are installed on the scope. */
  get attached(): boolean {
    return this.attachedGlobals !== null;
  }

  /** Installs the receive hooks on the scope (idempotent). Throws if a foreign CrComLib or another instance is present. */
  attach(): this {
    if (this.attachedGlobals === null) {
      this.attachedGlobals = attachBridgeGlobals(this.scope, this.receiver, this, this.logger);
    }
    return this;
  }

  /** Releases held digitals and removes the receive hooks, restoring whatever was there before. */
  detach(): this {
    if (this.attachedGlobals !== null) {
      this.repeatDigital.releaseAll();
      this.attachedGlobals.detach();
      this.attachedGlobals = null;
    }
    return this;
  }

  /** Detaches, stops every timer, forgets every signal, and clears the singleton slot if this is it. */
  dispose(): void {
    this.detach();
    this.repeatDigital.releaseAll();
    this.heartbeat?.dispose();
    this.resync?.dispose();
    this.rcb?.clearAll();
    this.registry.clear();
    if (MicroComLib.#instance === this) {
      MicroComLib.#instance = null;
    }
  }

  // ─── Diagnostics ────────────────────────────────────────────────────────────

  /** The transport currently in use, re-detected on each read: `'xpanel' | 'android' | 'ios' | 'none'` or a custom kind. */
  get transport(): string {
    return this.resolver.resolve().kind;
  }

  /** A plain read-only copy of every signal, by type then name. Upstream calls this `getSubscriptionsCount()`. */
  getSignals(): RegistrySnapshot {
    return this.registry.snapshot();
  }

  // ─── Convenience helpers (not part of CrComLib) ─────────────────────────────

  /** Rising then falling edge on a digital. With `holdMs` the release is delayed. */
  pulseDigital(name: string, holdMs?: number): void {
    helpers.pulseDigital(this, String(name), holdMs);
  }

  /** Hold (`true`) or release (`false`) a digital as a RepeatDigital, re-publishing while held. */
  setDigital(name: string, held: boolean): void {
    this.repeatDigital.set(String(name), held);
  }

  isDigitalHeld(name: string): boolean {
    return this.repeatDigital.isHeld(String(name));
  }

  setAnalog(name: string, value: number): void {
    helpers.setAnalog(this, String(name), value);
  }

  setSerial(name: string, value: string): void {
    helpers.setSerial(this, String(name), value);
  }

  setObject(name: string, value: object): void {
    helpers.setObject(this, String(name), value);
  }

  /** Picks the join type from the value; booleans use {@link setDigital}. */
  setState(name: string, value: SignalValue): void {
    helpers.setState(this, this.repeatDigital, String(name), value);
  }
}
