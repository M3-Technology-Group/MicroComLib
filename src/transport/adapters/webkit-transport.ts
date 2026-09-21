import type { HostTransport, Logger, SignalType, SignalValue, WebKitMessageHandlers } from '../../types';
import {
  SEND_METHOD,
  SUBSCRIBE_METHOD,
  SUBSCRIBE_METHOD_NAMES,
  UNSUBSCRIBE_METHOD,
  UNSUBSCRIBE_METHOD_NAMES,
  hasDefined,
} from '../transport';

/**
 * iOS message handlers take exactly one argument, so name and value are packed into a JSON string.
 * The object value is the live object here (double-encoded by the outer stringify), unlike the
 * pre-stringified form Android and XPanel take. That is a real wire-format difference upstream
 * preserves and so do we.
 */
export function encodeWebKitMessage(signal: string, value?: SignalValue): string {
  return JSON.stringify(value === undefined ? { signal } : { signal, value });
}

/** Talks to the iOS Crestron App through `webkit.messageHandlers.<method>.postMessage(json)`. */
export class WebKitTransport implements HostTransport {
  public readonly kind = 'ios';

  constructor(
    public readonly handlers: WebKitMessageHandlers,
    private readonly logger: Logger,
  ) {}

  send(type: SignalType, name: string, value: SignalValue): void {
    const method = SEND_METHOD[type];
    const handler = this.handlers[method];
    if (handler === undefined || typeof handler.postMessage !== 'function') {
      this.logger.warn(`ios host has no ${method} handler; dropping "${name}"`);
      return;
    }
    handler.postMessage(encodeWebKitMessage(name, value));
  }

  /** First-subscriber hint. Sent only when all four subscribe handlers exist. */
  subscribe(type: SignalType, name: string): void {
    if (!hasDefined(this.handlers, SUBSCRIBE_METHOD_NAMES)) {
      return;
    }
    this.handlers[SUBSCRIBE_METHOD[type]]!.postMessage(encodeWebKitMessage(name));
  }

  /** Last-subscriber hint. Sent only when all four unsubscribe handlers exist. */
  unsubscribe(type: SignalType, name: string): void {
    if (!hasDefined(this.handlers, UNSUBSCRIBE_METHOD_NAMES)) {
      return;
    }
    this.handlers[UNSUBSCRIBE_METHOD[type]]!.postMessage(encodeWebKitMessage(name));
  }
}
