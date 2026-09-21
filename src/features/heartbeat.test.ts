import { describe, expect, it, vi } from 'vitest';

import { HEARTBEAT_REQUEST_SIGNAL, HEARTBEAT_RESPONSE_SIGNAL, Heartbeat } from './heartbeat';
import { MicroComLib } from '../api/micro-com-lib';

describe('Heartbeat', () => {
  it('does not answer the initial replay, answers each real request, and stops after dispose', () => {
    const transport = { kind: 'fake', send: vi.fn() };
    const lib = new MicroComLib({ transport, heartbeat: false, logger: false });
    const heartbeat = new Heartbeat(lib);
    expect(transport.send).not.toHaveBeenCalled();

    lib.bridgeReceiveObjectFromNative(HEARTBEAT_REQUEST_SIGNAL, { id: 1 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send).toHaveBeenCalledWith('object', HEARTBEAT_RESPONSE_SIGNAL, { id: 1 });
    expect(lib.getState('o', HEARTBEAT_RESPONSE_SIGNAL)).toEqual({ id: 1 });

    lib.bridgeReceiveObjectFromNative(HEARTBEAT_REQUEST_SIGNAL, { id: 2 });
    expect(transport.send).toHaveBeenCalledTimes(2);

    heartbeat.dispose();
    lib.bridgeReceiveObjectFromNative(HEARTBEAT_REQUEST_SIGNAL, { id: 3 });
    expect(transport.send).toHaveBeenCalledTimes(2);
    lib.dispose();
  });
});
