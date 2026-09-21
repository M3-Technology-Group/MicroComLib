import { describe, expect, it, vi } from 'vitest';

import { WebKitTransport, encodeWebKitMessage } from './webkit-transport';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function handler() {
  return { postMessage: vi.fn() };
}

function makeSendHandlers() {
  return {
    bridgeSendBooleanToNative: handler(),
    bridgeSendIntegerToNative: handler(),
    bridgeSendStringToNative: handler(),
    bridgeSendObjectToNative: handler(),
  };
}

function makeHintHandlers() {
  return {
    ...makeSendHandlers(),
    bridgeSubscribeBooleanSignalFromNative: handler(),
    bridgeSubscribeIntegerSignalFromNative: handler(),
    bridgeSubscribeStringSignalFromNative: handler(),
    bridgeSubscribeObjectSignalFromNative: handler(),
    bridgeUnsubscribeBooleanSignalFromNative: handler(),
    bridgeUnsubscribeIntegerSignalFromNative: handler(),
    bridgeUnsubscribeStringSignalFromNative: handler(),
    bridgeUnsubscribeObjectSignalFromNative: handler(),
  };
}

describe('encodeWebKitMessage', () => {
  it('packs signal and value into one JSON string, omitting value when absent', () => {
    expect(encodeWebKitMessage('200', true)).toBe('{"signal":"200","value":true}');
    expect(encodeWebKitMessage('200', 0)).toBe('{"signal":"200","value":0}');
    expect(encodeWebKitMessage('200', { rcb: 1 })).toBe('{"signal":"200","value":{"rcb":1}}');
    expect(encodeWebKitMessage('200')).toBe('{"signal":"200"}');
  });
});

describe('WebKitTransport.send', () => {
  it('posts the envelope to the handler for each type, keeping the object live inside it', () => {
    const handlers = makeSendHandlers();
    const t = new WebKitTransport(handlers, makeLogger());
    expect(t.kind).toBe('ios');

    t.send('boolean', '1', true);
    t.send('number', '2', 5);
    t.send('string', '3', 'x');
    t.send('object', '4', { repeatdigital: true });

    expect(handlers.bridgeSendBooleanToNative.postMessage).toHaveBeenCalledWith('{"signal":"1","value":true}');
    expect(handlers.bridgeSendIntegerToNative.postMessage).toHaveBeenCalledWith('{"signal":"2","value":5}');
    expect(handlers.bridgeSendStringToNative.postMessage).toHaveBeenCalledWith('{"signal":"3","value":"x"}');
    expect(handlers.bridgeSendObjectToNative.postMessage).toHaveBeenCalledWith(
      '{"signal":"4","value":{"repeatdigital":true}}',
    );
  });

  it('warns and drops when the handler is missing or unusable', () => {
    const logger = makeLogger();
    const handlers = makeSendHandlers() as Partial<ReturnType<typeof makeSendHandlers>>;
    delete handlers.bridgeSendObjectToNative;
    (handlers as Record<string, unknown>)['bridgeSendStringToNative'] = {};
    const t = new WebKitTransport(handlers as never, logger);

    expect(() => t.send('object', 'x', {})).not.toThrow();
    expect(() => t.send('string', 'y', 's')).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('ios host has no bridgeSendObjectToNative handler; dropping "x"');
    expect(logger.warn).toHaveBeenCalledWith('ios host has no bridgeSendStringToNative handler; dropping "y"');
  });
});

describe('WebKitTransport hints', () => {
  it('posts signal-only envelopes when all four handlers of a kind exist', () => {
    const handlers = makeHintHandlers();
    const t = new WebKitTransport(handlers, makeLogger());

    t.subscribe('number', 'n');
    t.unsubscribe('object', 'o');

    expect(handlers.bridgeSubscribeIntegerSignalFromNative.postMessage).toHaveBeenCalledWith('{"signal":"n"}');
    expect(handlers.bridgeUnsubscribeObjectSignalFromNative.postMessage).toHaveBeenCalledWith('{"signal":"o"}');
  });

  it('posts nothing when any handler of that kind is missing', () => {
    const handlers = makeHintHandlers() as Partial<ReturnType<typeof makeHintHandlers>>;
    delete handlers.bridgeSubscribeStringSignalFromNative;
    delete handlers.bridgeUnsubscribeObjectSignalFromNative;
    const t = new WebKitTransport(handlers as never, makeLogger());

    t.subscribe('boolean', 'b');
    t.unsubscribe('boolean', 'b');

    expect(handlers.bridgeSubscribeBooleanSignalFromNative!.postMessage).not.toHaveBeenCalled();
    expect(handlers.bridgeUnsubscribeBooleanSignalFromNative!.postMessage).not.toHaveBeenCalled();
  });
});
