import type { HostTransport, Logger, SignalType, SignalValue } from '../../types';
import {
  type AnyHostObject,
  SEND_METHOD,
  SUBSCRIBE_METHOD,
  SUBSCRIBE_METHOD_NAMES,
  UNSUBSCRIBE_METHOD,
  UNSUBSCRIBE_METHOD_NAMES,
  encodeForDirectCall,
  hasFunctions,
} from '../transport';

type HostMethod = (this: unknown, ...args: unknown[]) => void;

/**
 * Talks to a host object that exposes `bridgeSend*ToNative(name, value)` directly: Android's
 * `JSInterface` and Web XPanel's `CommunicationInterface`. The two differ only in which global
 * they hang off and in whether they declare subscription hints (XPanel declares none, so the hint
 * methods below are no-ops there by construction).
 */
export class DirectCallTransport implements HostTransport {
  constructor(
    public readonly kind: 'android' | 'xpanel',
    public readonly target: AnyHostObject,
    private readonly logger: Logger,
  ) {}

  send(type: SignalType, name: string, value: SignalValue): void {
    const method = SEND_METHOD[type];
    const fn = this.target[method];
    if (typeof fn !== 'function') {
      this.logger.warn(`${this.kind} host has no ${method}; dropping "${name}"`);
      return;
    }
    (fn as HostMethod).call(this.target, name, encodeForDirectCall(type, value));
  }

  /** First-subscriber hint. Sent only when the host declares all four subscribe methods. */
  subscribe(type: SignalType, name: string): void {
    if (!hasFunctions(this.target, SUBSCRIBE_METHOD_NAMES)) {
      return;
    }
    (this.target[SUBSCRIBE_METHOD[type]] as HostMethod).call(this.target, name);
  }

  /** Last-subscriber hint. Sent only when the host declares all four unsubscribe methods. */
  unsubscribe(type: SignalType, name: string): void {
    if (!hasFunctions(this.target, UNSUBSCRIBE_METHOD_NAMES)) {
      return;
    }
    (this.target[UNSUBSCRIBE_METHOD[type]] as HostMethod).call(this.target, name);
  }
}
