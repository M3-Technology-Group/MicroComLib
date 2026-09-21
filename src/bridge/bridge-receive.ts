import type { RcbController } from '../features/rcb';
import { isRcbObject } from '../features/rcb';
import { RESYNC_SIGNAL_NAME, type ResyncController } from '../features/resync';
import { toSubscriptionSignalName } from '../signal/signal-name';
import type { SignalRegistry } from '../signal/signal-registry';
import type { HostReceiveMethods, Logger } from '../types';

/**
 * The four inbound hooks the host calls. Each normalizes the name (integer-like → `fb` prefix),
 * gets-or-creates the signal so values that arrive before any subscriber are retained, and writes
 * with host semantics (dedupe, no echo). Integers and RCB objects are routed through the RCB
 * controller when it is enabled; `Csig.State_Synchronization` is handed to resync after the write.
 *
 * The hooks are arrow properties so they can be installed on `globalThis` without binding.
 */
export class BridgeReceiver implements HostReceiveMethods {
  constructor(
    private readonly registry: SignalRegistry,
    private readonly logger: Logger,
    private readonly rcb: RcbController | null,
    private readonly resync: ResyncController | null,
  ) {}

  readonly bridgeReceiveBooleanFromNative = (signalName: string, value: boolean): void => {
    const name = toSubscriptionSignalName(String(signalName));
    this.logger.debug(`← boolean "${name}"`, value);
    this.registry.get('boolean', name).write(value, true);
  };

  readonly bridgeReceiveIntegerFromNative = (signalName: string, value: number): void => {
    const name = toSubscriptionSignalName(String(signalName));
    this.logger.debug(`← number "${name}"`, value);
    if (this.rcb !== null) {
      this.rcb.receiveInteger(name, value);
    } else {
      this.registry.get('number', name).write(value, true);
    }
  };

  readonly bridgeReceiveStringFromNative = (signalName: string, value: string): void => {
    const name = toSubscriptionSignalName(String(signalName));
    this.logger.debug(`← string "${name}"`, value);
    this.registry.get('string', name).write(value, true);
  };

  readonly bridgeReceiveObjectFromNative = (signalName: string, value: object): void => {
    const name = toSubscriptionSignalName(String(signalName));
    this.logger.debug(`← object "${name}"`, value);
    if (this.rcb !== null && isRcbObject(value)) {
      this.rcb.receiveRcb(name, value);
      return;
    }
    this.registry.get('object', name).write(value, true);
    if (this.resync !== null && name === RESYNC_SIGNAL_NAME) {
      this.resync.handle(value);
    }
  };
}
