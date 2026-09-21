import { describe, expect, it, vi } from 'vitest';

import { DirectCallTransport } from './direct-call-transport';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeSendHost() {
  return {
    bridgeSendBooleanToNative: vi.fn(),
    bridgeSendIntegerToNative: vi.fn(),
    bridgeSendStringToNative: vi.fn(),
    bridgeSendObjectToNative: vi.fn(),
  };
}

function makeHintHost() {
  return {
    ...makeSendHost(),
    bridgeSubscribeBooleanSignalFromNative: vi.fn(),
    bridgeSubscribeIntegerSignalFromNative: vi.fn(),
    bridgeSubscribeStringSignalFromNative: vi.fn(),
    bridgeSubscribeObjectSignalFromNative: vi.fn(),
    bridgeUnsubscribeBooleanSignalFromNative: vi.fn(),
    bridgeUnsubscribeIntegerSignalFromNative: vi.fn(),
    bridgeUnsubscribeStringSignalFromNative: vi.fn(),
    bridgeUnsubscribeObjectSignalFromNative: vi.fn(),
  };
}

describe('DirectCallTransport.send', () => {
  it('routes each type to its method, JSON-encoding objects', () => {
    const host = makeSendHost();
    const t = new DirectCallTransport('android', host, makeLogger());

    t.send('boolean', '1', true);
    t.send('number', '2', 42);
    t.send('string', '3', 'hi');
    t.send('object', '4', { repeatdigital: false });

    expect(host.bridgeSendBooleanToNative).toHaveBeenCalledWith('1', true);
    expect(host.bridgeSendIntegerToNative).toHaveBeenCalledWith('2', 42);
    expect(host.bridgeSendStringToNative).toHaveBeenCalledWith('3', 'hi');
    expect(host.bridgeSendObjectToNative).toHaveBeenCalledWith('4', '{"repeatdigital":false}');
  });

  it('calls host methods with the host as `this`', () => {
    class Host {
      public seen: unknown = null;
      bridgeSendStringToNative(this: Host, _name: string, _value: string) {
        this.seen = this;
      }
    }
    const host = new Host();
    new DirectCallTransport('xpanel', host as never, makeLogger()).send('string', 'a', 'b');
    expect(host.seen).toBe(host);
  });

  it('warns and drops when the method is missing (Android may lack the object sender)', () => {
    const logger = makeLogger();
    const host = makeSendHost() as Partial<ReturnType<typeof makeSendHost>>;
    delete host.bridgeSendObjectToNative;
    const t = new DirectCallTransport('android', host as never, logger);

    expect(() => t.send('object', 'x', {})).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('android host has no bridgeSendObjectToNative; dropping "x"');
  });
});

describe('DirectCallTransport hints', () => {
  it('sends subscribe and unsubscribe hints when the host declares all four of each', () => {
    const host = makeHintHost();
    const t = new DirectCallTransport('android', host, makeLogger());

    t.subscribe('boolean', 'b');
    t.subscribe('number', 'n');
    t.subscribe('string', 's');
    t.subscribe('object', 'o');
    t.unsubscribe('boolean', 'b');
    t.unsubscribe('number', 'n');
    t.unsubscribe('string', 's');
    t.unsubscribe('object', 'o');

    expect(host.bridgeSubscribeBooleanSignalFromNative).toHaveBeenCalledWith('b');
    expect(host.bridgeSubscribeIntegerSignalFromNative).toHaveBeenCalledWith('n');
    expect(host.bridgeSubscribeStringSignalFromNative).toHaveBeenCalledWith('s');
    expect(host.bridgeSubscribeObjectSignalFromNative).toHaveBeenCalledWith('o');
    expect(host.bridgeUnsubscribeBooleanSignalFromNative).toHaveBeenCalledWith('b');
    expect(host.bridgeUnsubscribeIntegerSignalFromNative).toHaveBeenCalledWith('n');
    expect(host.bridgeUnsubscribeStringSignalFromNative).toHaveBeenCalledWith('s');
    expect(host.bridgeUnsubscribeObjectSignalFromNative).toHaveBeenCalledWith('o');
  });

  it('sends nothing when any of the four hint methods is missing', () => {
    const host = makeHintHost() as Partial<ReturnType<typeof makeHintHost>>;
    delete host.bridgeSubscribeObjectSignalFromNative;
    delete host.bridgeUnsubscribeStringSignalFromNative;
    const t = new DirectCallTransport('android', host as never, makeLogger());

    t.subscribe('boolean', 'b');
    t.unsubscribe('boolean', 'b');

    expect(host.bridgeSubscribeBooleanSignalFromNative).not.toHaveBeenCalled();
    expect(host.bridgeUnsubscribeBooleanSignalFromNative).not.toHaveBeenCalled();
  });

  it('is a no-op on XPanel, which declares no hint methods', () => {
    const host = makeSendHost();
    const t = new DirectCallTransport('xpanel', host, makeLogger());
    expect(() => {
      t.subscribe('boolean', 'b');
      t.unsubscribe('boolean', 'b');
    }).not.toThrow();
  });
});
