import { describe, expect, it, vi } from 'vitest';

import { TransportResolver, probeHost } from './detect-transport';
import { DirectCallTransport } from './adapters/direct-call-transport';
import { NullTransport } from './adapters/null-transport';
import { WebKitTransport } from './adapters/webkit-transport';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const fn = () => undefined;

function fullSender() {
  return {
    bridgeSendBooleanToNative: fn,
    bridgeSendIntegerToNative: fn,
    bridgeSendStringToNative: fn,
    bridgeSendObjectToNative: fn,
  };
}

function fullHandlers() {
  const h = { postMessage: fn };
  return {
    bridgeSendBooleanToNative: h,
    bridgeSendIntegerToNative: h,
    bridgeSendStringToNative: h,
    bridgeSendObjectToNative: h,
  };
}

describe('probeHost', () => {
  it('returns null for an empty scope', () => {
    expect(probeHost({})).toBeNull();
  });

  it('detects XPanel only when all four senders are functions', () => {
    const ci = fullSender();
    expect(probeHost({ CommunicationInterface: ci })).toEqual({ kind: 'xpanel', target: ci });
    const partial = { ...fullSender(), bridgeSendObjectToNative: undefined };
    expect(probeHost({ CommunicationInterface: partial })).toBeNull();
  });

  it('detects Android with only the three required senders', () => {
    const ji = { ...fullSender(), bridgeSendObjectToNative: undefined };
    expect(probeHost({ JSInterface: ji })).toEqual({ kind: 'android', target: ji });
    expect(probeHost({ JSInterface: { bridgeSendBooleanToNative: fn } })).toBeNull();
  });

  it('detects iOS only when webkit.messageHandlers defines all four senders', () => {
    const handlers = fullHandlers();
    expect(probeHost({ webkit: { messageHandlers: handlers } })).toEqual({ kind: 'ios', target: handlers });
    expect(probeHost({ webkit: {} })).toBeNull();
    expect(probeHost({ webkit: 'nope' })).toBeNull();
    expect(
      probeHost({ webkit: { messageHandlers: { ...fullHandlers(), bridgeSendObjectToNative: undefined } } }),
    ).toBeNull();
  });

  it('prefers XPanel over Android over iOS', () => {
    const ci = fullSender();
    const ji = fullSender();
    const handlers = fullHandlers();
    expect(probeHost({ CommunicationInterface: ci, JSInterface: ji, webkit: { messageHandlers: handlers } })?.kind).toBe(
      'xpanel',
    );
    expect(probeHost({ JSInterface: ji, webkit: { messageHandlers: handlers } })?.kind).toBe('android');
  });
});

describe('TransportResolver', () => {
  it('returns the override when one is given, ignoring the scope', () => {
    const override = { kind: 'custom', send: vi.fn() };
    const r = new TransportResolver({ CommunicationInterface: fullSender() }, makeLogger(), override);
    expect(r.resolve()).toBe(override);
  });

  it('returns one shared null transport while no host is present', () => {
    const r = new TransportResolver({}, makeLogger(), undefined);
    const a = r.resolve();
    const b = r.resolve();
    expect(a).toBeInstanceOf(NullTransport);
    expect(b).toBe(a);
  });

  it('picks up a host that appears after construction and caches per host object', () => {
    const scope: Record<string, unknown> = {};
    const logger = makeLogger();
    const r = new TransportResolver(scope, logger, undefined);
    expect(r.resolve().kind).toBe('none');

    const ci = fullSender();
    scope['CommunicationInterface'] = ci;
    const first = r.resolve();
    expect(first).toBeInstanceOf(DirectCallTransport);
    expect(first.kind).toBe('xpanel');
    expect(r.resolve()).toBe(first);
    expect(logger.info).toHaveBeenCalledTimes(1);

    // A different host object of the same kind is a new transport.
    scope['CommunicationInterface'] = fullSender();
    const second = r.resolve();
    expect(second).not.toBe(first);
    expect(second.kind).toBe('xpanel');

    // Host disappears again: back to the shared null transport, cache dropped.
    delete scope['CommunicationInterface'];
    expect(r.resolve()).toBeInstanceOf(NullTransport);
    scope['CommunicationInterface'] = ci;
    expect(r.resolve()).not.toBe(first);
  });

  it('builds a WebKit transport for iOS and a direct-call transport for Android', () => {
    const handlers = fullHandlers();
    const ios = new TransportResolver({ webkit: { messageHandlers: handlers } }, makeLogger(), undefined).resolve();
    expect(ios).toBeInstanceOf(WebKitTransport);
    expect((ios as WebKitTransport).handlers).toBe(handlers);

    const ji = fullSender();
    const android = new TransportResolver({ JSInterface: ji }, makeLogger(), undefined).resolve();
    expect(android).toBeInstanceOf(DirectCallTransport);
    expect(android.kind).toBe('android');
    expect((android as DirectCallTransport).target).toBe(ji);
  });
});
