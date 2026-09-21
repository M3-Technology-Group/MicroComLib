import type { SignalApi } from '../types';

export const HEARTBEAT_REQUEST_SIGNAL = 'Csig.HeartbeatRequest';
export const HEARTBEAT_RESPONSE_SIGNAL = 'Csig.HeartbeatResponse';

/**
 * Echoes every `Csig.HeartbeatRequest` payload back on `Csig.HeartbeatResponse`. Some firmware
 * treats a project that stays silent here as unresponsive. Unlike upstream, the initial replay of
 * the untouched seed value is not echoed; only requests actually received are answered.
 */
export class Heartbeat {
  private readonly subscriptionId: string;
  private replaying = true;

  constructor(private readonly api: SignalApi) {
    this.subscriptionId = api.subscribeState('object', HEARTBEAT_REQUEST_SIGNAL, (request: object) => {
      if (this.replaying) {
        this.replaying = false;
        return;
      }
      this.api.publishEvent('object', HEARTBEAT_RESPONSE_SIGNAL, request);
    });
  }

  dispose(): void {
    this.api.unsubscribeState('object', HEARTBEAT_REQUEST_SIGNAL, this.subscriptionId);
  }
}
