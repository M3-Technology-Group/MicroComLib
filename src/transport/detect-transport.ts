import type { HostTransport, Logger, WebKitMessageHandlers } from '../types';
import { DirectCallTransport } from './adapters/direct-call-transport';
import { NullTransport } from './adapters/null-transport';
import {
  ANDROID_REQUIRED_SEND_METHOD_NAMES,
  SEND_METHOD_NAMES,
  hasDefined,
  hasFunctions,
  isHostObject,
} from './transport';
import { WebKitTransport } from './adapters/webkit-transport';

interface Probe {
  kind: 'xpanel' | 'android' | 'ios';
  target: object;
}

/**
 * Finds the host present in `scope`, in the order XPanel → Android → iOS. Upstream checks
 * WebView first but clears that flag whenever XPanel is detected, so XPanel-first is the same
 * outcome without the side effect.
 */
export function probeHost(scope: object): Probe | null {
  const g = scope as Record<string, unknown>;

  const communicationInterface = g['CommunicationInterface'];
  if (hasFunctions(communicationInterface, SEND_METHOD_NAMES)) {
    return { kind: 'xpanel', target: communicationInterface };
  }

  const jsInterface = g['JSInterface'];
  if (hasFunctions(jsInterface, ANDROID_REQUIRED_SEND_METHOD_NAMES)) {
    return { kind: 'android', target: jsInterface };
  }

  const webkit = g['webkit'];
  if (isHostObject(webkit)) {
    const handlers = webkit['messageHandlers'];
    if (hasDefined(handlers, SEND_METHOD_NAMES)) {
      return { kind: 'ios', target: handlers };
    }
  }

  return null;
}

/**
 * Resolves the outbound transport lazily on every call. Web XPanel installs
 * `CommunicationInterface` asynchronously inside `WebXPanel.initialize()`, so anything decided at
 * construction time would miss it. Transports are cached per host object so repeated sends do not
 * allocate, and the null transport is shared so its warning fires once.
 */
export class TransportResolver {
  private readonly none: NullTransport;
  private cached: { target: object; transport: HostTransport } | null = null;

  constructor(
    private readonly scope: object,
    private readonly logger: Logger,
    private readonly override: HostTransport | undefined,
  ) {
    this.none = new NullTransport(logger);
  }

  resolve(): HostTransport {
    if (this.override !== undefined) {
      return this.override;
    }
    const probe = probeHost(this.scope);
    if (probe === null) {
      this.cached = null;
      return this.none;
    }
    if (this.cached !== null && this.cached.target === probe.target) {
      return this.cached.transport;
    }
    const transport =
      probe.kind === 'ios'
        ? new WebKitTransport(probe.target as WebKitMessageHandlers, this.logger)
        : new DirectCallTransport(probe.kind, probe.target as Record<string, unknown>, this.logger);
    this.logger.info(`Using ${transport.kind} transport`);
    this.cached = { target: probe.target, transport };
    return transport;
  }
}
