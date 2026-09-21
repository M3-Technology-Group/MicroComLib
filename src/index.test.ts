import { describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import * as lib from './index';

describe('microcomlib entry point', () => {
  it('exports the version from package.json', () => {
    expect(lib.VERSION).toBe(pkg.version);
    expect(new lib.MicroComLib().version).toBe(pkg.version);
  });

  it('exports the public surface', () => {
    expect(typeof lib.MicroComLib).toBe('function');
    expect(lib.REPEAT_DIGITAL_KEY).toBe('repeatdigital');
    expect(lib.RESYNC_SIGNAL_NAME).toBe('Csig.State_Synchronization');
    expect(lib.HEARTBEAT_REQUEST_SIGNAL).toBe('Csig.HeartbeatRequest');
    expect(lib.CRCOMLIB_GLOBAL_NAME).toBe('CrComLib');
    expect(lib.RECEIVE_HOOK_NAMES).toHaveLength(4);
    expect(lib.toSubscriptionSignalName('1')).toBe('fb1');
    expect(lib.isRcbObject({ rcb: { value: 1, time: 1 } })).toBe(true);
    expect(lib.repeatDigital(true)).toEqual({ repeatdigital: true });
    expect(lib.probeHost({})).toBeNull();
    expect(lib.SEND_METHOD.boolean).toBe('bridgeSendBooleanToNative');
  });
});
