import { describe, expect, it } from 'vitest';

import {
  ANDROID_REQUIRED_SEND_METHOD_NAMES,
  SEND_METHOD,
  SEND_METHOD_NAMES,
  SUBSCRIBE_METHOD,
  SUBSCRIBE_METHOD_NAMES,
  UNSUBSCRIBE_METHOD,
  UNSUBSCRIBE_METHOD_NAMES,
  encodeForDirectCall,
  hasDefined,
  hasFunctions,
  isHostObject,
} from './transport';

describe('method tables', () => {
  it('match the upstream host contract', () => {
    expect(SEND_METHOD).toEqual({
      boolean: 'bridgeSendBooleanToNative',
      number: 'bridgeSendIntegerToNative',
      string: 'bridgeSendStringToNative',
      object: 'bridgeSendObjectToNative',
    });
    expect(SUBSCRIBE_METHOD).toEqual({
      boolean: 'bridgeSubscribeBooleanSignalFromNative',
      number: 'bridgeSubscribeIntegerSignalFromNative',
      string: 'bridgeSubscribeStringSignalFromNative',
      object: 'bridgeSubscribeObjectSignalFromNative',
    });
    expect(UNSUBSCRIBE_METHOD).toEqual({
      boolean: 'bridgeUnsubscribeBooleanSignalFromNative',
      number: 'bridgeUnsubscribeIntegerSignalFromNative',
      string: 'bridgeUnsubscribeStringSignalFromNative',
      object: 'bridgeUnsubscribeObjectSignalFromNative',
    });
    expect(SEND_METHOD_NAMES).toHaveLength(4);
    expect(SUBSCRIBE_METHOD_NAMES).toHaveLength(4);
    expect(UNSUBSCRIBE_METHOD_NAMES).toHaveLength(4);
    expect(ANDROID_REQUIRED_SEND_METHOD_NAMES).toEqual([
      'bridgeSendBooleanToNative',
      'bridgeSendIntegerToNative',
      'bridgeSendStringToNative',
    ]);
  });
});

describe('isHostObject', () => {
  it('accepts objects and functions, rejects primitives and null', () => {
    expect(isHostObject({})).toBe(true);
    expect(isHostObject(() => undefined)).toBe(true);
    expect(isHostObject(null)).toBe(false);
    expect(isHostObject(undefined)).toBe(false);
    expect(isHostObject('x')).toBe(false);
    expect(isHostObject(1)).toBe(false);
  });
});

describe('hasFunctions', () => {
  it('requires every name to be a function', () => {
    const fn = () => undefined;
    expect(hasFunctions({ a: fn, b: fn }, ['a', 'b'])).toBe(true);
    expect(hasFunctions({ a: fn, b: 1 }, ['a', 'b'])).toBe(false);
    expect(hasFunctions({ a: fn }, ['a', 'b'])).toBe(false);
    expect(hasFunctions(undefined, ['a'])).toBe(false);
    expect(hasFunctions(null, ['a'])).toBe(false);
    expect(hasFunctions({}, [])).toBe(true);
  });
});

describe('hasDefined', () => {
  it('requires every name to be defined, of any type', () => {
    expect(hasDefined({ a: {}, b: 0 }, ['a', 'b'])).toBe(true);
    expect(hasDefined({ a: {}, b: undefined }, ['a', 'b'])).toBe(false);
    expect(hasDefined({ a: {} }, ['a', 'b'])).toBe(false);
    expect(hasDefined(undefined, ['a'])).toBe(false);
  });
});

describe('encodeForDirectCall', () => {
  it('stringifies objects only', () => {
    expect(encodeForDirectCall('boolean', true)).toBe(true);
    expect(encodeForDirectCall('number', 7)).toBe(7);
    expect(encodeForDirectCall('string', 'x')).toBe('x');
    expect(encodeForDirectCall('object', { repeatdigital: true })).toBe('{"repeatdigital":true}');
  });
});
