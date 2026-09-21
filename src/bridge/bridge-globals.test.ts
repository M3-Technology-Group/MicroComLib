import { describe, expect, it, vi } from 'vitest';

import { CRCOMLIB_GLOBAL_NAME, RECEIVE_HOOK_NAMES, attachBridgeGlobals } from './bridge-globals';
import type { HostReceiveMethods } from '../types';

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeHooks(): HostReceiveMethods {
  return {
    bridgeReceiveBooleanFromNative: vi.fn(),
    bridgeReceiveIntegerFromNative: vi.fn(),
    bridgeReceiveStringFromNative: vi.fn(),
    bridgeReceiveObjectFromNative: vi.fn(),
  };
}

describe('attachBridgeGlobals', () => {
  it('installs the four bare hooks and a receive-only CrComLib shim, and nothing else', () => {
    const scope: Record<string, unknown> = {};
    const hooks = makeHooks();
    attachBridgeGlobals(scope, hooks, {}, makeLogger());

    for (const name of RECEIVE_HOOK_NAMES) {
      expect(scope[name]).toBe(hooks[name]);
    }
    const shim = scope[CRCOMLIB_GLOBAL_NAME] as Record<string, unknown>;
    expect(Object.keys(shim).sort()).toEqual([...RECEIVE_HOOK_NAMES].sort());
    for (const name of RECEIVE_HOOK_NAMES) {
      expect(shim[name]).toBe(hooks[name]);
    }
    // Exactly the five enumerable keys, as XPanel and native hosts see them.
    expect(Object.keys(scope).sort()).toEqual([...RECEIVE_HOOK_NAMES, CRCOMLIB_GLOBAL_NAME].sort());

    (shim['bridgeReceiveBooleanFromNative'] as (n: string, v: boolean) => void)('1', true);
    expect(hooks.bridgeReceiveBooleanFromNative).toHaveBeenCalledWith('1', true);
  });

  it('detach restores prior values and deletes what did not exist', () => {
    const previousHook = () => undefined;
    const scope: Record<string, unknown> = { bridgeReceiveStringFromNative: previousHook, unrelated: 1 };
    const attached = attachBridgeGlobals(scope, makeHooks(), {}, makeLogger());
    expect(scope['bridgeReceiveStringFromNative']).not.toBe(previousHook);

    attached.detach();

    expect(scope['bridgeReceiveStringFromNative']).toBe(previousHook);
    expect('bridgeReceiveBooleanFromNative' in scope).toBe(false);
    expect(CRCOMLIB_GLOBAL_NAME in scope).toBe(false);
    expect(Object.getOwnPropertySymbols(scope)).toHaveLength(0);
    expect(scope['unrelated']).toBe(1);
  });

  it('allows re-attaching after detach and re-attaching by the same owner', () => {
    const scope: Record<string, unknown> = {};
    const owner = {};
    const first = attachBridgeGlobals(scope, makeHooks(), owner, makeLogger());
    expect(() => attachBridgeGlobals(scope, makeHooks(), owner, makeLogger())).not.toThrow();
    first.detach();
    expect(() => attachBridgeGlobals(scope, makeHooks(), {}, makeLogger())).not.toThrow();
  });

  it('throws when another owner is attached', () => {
    const scope: Record<string, unknown> = {};
    attachBridgeGlobals(scope, makeHooks(), {}, makeLogger());
    expect(() => attachBridgeGlobals(scope, makeHooks(), {}, makeLogger())).toThrow(/another instance is already attached/);
  });

  it('throws when a foreign CrComLib global is present', () => {
    const scope: Record<string, unknown> = { CrComLib: { subscribeState: () => '' } };
    expect(() => attachBridgeGlobals(scope, makeHooks(), {}, makeLogger())).toThrow(/CrComLib global is already present/);
    expect(Object.keys(scope)).toEqual(['CrComLib']);
  });

  it('replaces a stale shim left by an earlier attach whose owner mark was lost', () => {
    const scope: Record<PropertyKey, unknown> = {};
    attachBridgeGlobals(scope, makeHooks(), {}, makeLogger());
    delete scope[Symbol.for('microcomlib.attachedOwner')];
    const hooks = makeHooks();
    expect(() => attachBridgeGlobals(scope, hooks, {}, makeLogger())).not.toThrow();
    expect((scope['CrComLib'] as Record<string, unknown>)['bridgeReceiveObjectFromNative']).toBe(
      hooks.bridgeReceiveObjectFromNative,
    );
  });
});
