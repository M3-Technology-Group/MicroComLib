/**
 * Join-number addressing.
 *
 * Crestron join numbers are direction-scoped: digital join 200 *to* the control system and digital
 * join 200 *from* it are different wires. The registry is a flat name map, so inbound integer-like
 * names are prefixed with `fb` ("feedback"). `subscribeState`, `unsubscribeState`, `getState` and
 * every receive hook apply this; `publishEvent` never does. Do not "clean this up": normalizing on
 * the publish path would send `fb200` to the control system, which means nothing to it.
 */

export const JOIN_NUMBER_SIGNAL_NAME_PREFIX = 'fb';

/**
 * `"200"` is integer-like. `"007"`, `" 200"`, `"200a"` and `"2e3"` are not, because they do not
 * round-trip through `parseInt`. Negative integers do round-trip and are treated as joins, as upstream does.
 */
export function isIntegerSignalName(name: string): boolean {
  const n = parseInt(name, 10);
  return !Number.isNaN(n) && n.toString() === name;
}

export function toJoinNumberSignalName(name: string): string {
  return JOIN_NUMBER_SIGNAL_NAME_PREFIX + name;
}

/** The registry key used for reads, subscriptions and inbound writes. Never use on a publish path. */
export function toSubscriptionSignalName(name: string): string {
  return isIntegerSignalName(name) ? toJoinNumberSignalName(name) : name;
}
