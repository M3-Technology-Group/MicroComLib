import type { HostTransport, Logger, SignalType, SignalValue } from '../../types';

export const NO_HOST_WARNING =
  'No Crestron host detected (CommunicationInterface, JSInterface or webkit.messageHandlers). ' +
  'Outbound signals stay local until one appears.';

/**
 * Used when no host is present: a plain browser tab or a unit test. Upstream silently drops
 * outbound traffic here; we warn once per instance so the situation is discoverable, then stay
 * quiet apart from debug logging.
 */
export class NullTransport implements HostTransport {
  public readonly kind = 'none';
  private warned = false;

  constructor(private readonly logger: Logger) {}

  send(type: SignalType, name: string, value: SignalValue): void {
    if (!this.warned) {
      this.warned = true;
      this.logger.warn(NO_HOST_WARNING);
    }
    this.logger.debug(`dropped ${type} "${name}"`, value);
  }
}
