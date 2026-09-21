# MicroComLib

microcomlib is a minimal implemention of Crestron's CrComLib that is bundled with @crestron/ch5-crcomlib but with changes to better fit modern workflows.

**MicroComLib is NOT compatible with any Crestron UI Library components. True Blue CANNOT provide suport for this package**
If you need to use Crestron components, use the official Crestron `@crestron/ch5-crcomlib` package.

A minimal, dependency-free implementation of the Crestron CH5 **CrComLib signal layer**
(`getState`, `subscribeState`, `unsubscribeState`, `publishEvent`) for modern bundlers.

- ESM-only, TypeScript, zero runtime dependencies. Never imports `@crestron/ch5-crcomlib`.
- Consumed as an **instance**, not through `window.CrComLib`.
- Runs on Crestron touchscreens and the Crestron App (Crestron ONE) and in the browser with Web XPanel (`@crestron/ch5-webxpanel`).
- Keeps the parts of CrComLib a real UI needs: **RCB** ramp interpolation, **RepeatDigital**,
  **Resync** after a control-system reconnect, and the **Heartbeat** echo.
- Leaves out the CH5 web components, i18n, `subscribeStateScript`, and the media player.

MicroComLib was designed primarily for `ch5-svelte` which provides access to Crestron signals via Svelte 5 Runes. See the docs at https://www.npmjs.com/package/ch5-svelte for more information.

## Install

```sh
pnpm add microcomlib
```

## Quick start

```ts
import { MicroComLib } from 'microcomlib';

const lib = MicroComLib.getInstance();

// Feedback from the control system (digital join 1). Fires immediately with the current value.
const sub = lib.subscribeState('b', '1', (pressed) => render(pressed));

// Press-and-hold as a RepeatDigital, then release.
lib.setDigital('1', true);
lib.setDigital('1', false);

// Plain publishes.
lib.publishEvent('n', '5', 32768);
lib.publishEvent('s', 'Zone.Name', 'Lobby');
lib.pulseDigital('7');

// Synchronous read: null (or your default) until the join has been written at least once.
const volume = lib.getState('n', '5', 0);

lib.unsubscribeState('b', '1', sub);
```

Web XPanel is started exactly as before; MicroComLib picks up `CommunicationInterface` the moment
`WebXPanel.initialize()` installs it:

```ts
import { MicroComLib } from 'microcomlib';
import { getWebXPanel, runsInContainerApp } from '@crestron/ch5-webxpanel';

MicroComLib.getInstance(); // must exist before WebXPanel.initialize()

const { WebXPanel, isActive } = getWebXPanel(!runsInContainerApp());
if (isActive) {
  WebXPanel.initialize({ host: '192.168.1.10', ipId: '0x03' });
}
```

## How the host reaches the page

Consumers never touch `window`, but the hosts do. Android and iOS evaluate the bare globals
`window.bridgeReceive{Boolean,Integer,String,Object}FromNative(name, value)`; the Web XPanel
package calls `CrComLib.bridgeReceive*FromNative(name, value)` on a global named `CrComLib`, with no
other path. So `MicroComLib.getInstance()` installs exactly that and nothing more:

| Installed on `globalThis` | Who uses it |
| --- | --- |
| The four `bridgeReceive*FromNative` functions | Android WebView, iOS Crestron App |
| `CrComLib` = an object holding the same four functions | `@crestron/ch5-webxpanel` |

`lib.detach()` removes them and restores whatever was there. `new MicroComLib(options)` never
installs anything; call `attach()` yourself, or drive the hooks directly
(`lib.bridgeReceiveBooleanFromNative('1', true)`) in tests and emulators. Attaching while a real
CrComLib is loaded throws: two signal layers cannot share one host.

## Join numbers and the `fb` prefix

A signal name is just a string. Integer-like names (`"200"`, not `"007"` or `" 200"`) are Crestron
join numbers, and joins are direction-scoped. Like upstream, MicroComLib keeps the two directions
apart by storing inbound joins under `fb200`:

| Call | Registry key | On the wire |
| --- | --- | --- |
| `publishEvent('b', '200', true)` | `200` | sends `200` |
| `subscribeState('b', '200', cb)` / `getState('b', '200')` | `fb200` | — |
| host delivers digital 200 | `fb200` | receives `200` |

Publishing to a join therefore never echoes into that join's feedback subscribers; publishing to a
named signal (`'Zone.Mute'`) does echo locally. Do not "fix" this: it is what keeps a button's
press from lighting its own feedback.

## API

### The four CrComLib functions

Type strings are case-insensitive: `b|boolean`, `n|number|numeric`, `s|string`, `o|object`.
Lowercase literals get typed overloads (`subscribeState('n', …, (v) => …)` types `v` as `number`).

| Function | Behaviour |
| --- | --- |
| `getState(type, name, default?)` | Current value, or `default` (else `null`) if the signal does not exist or was never written. Never creates a signal. |
| `subscribeState(type, name, cb, errCb?)` | Calls `cb` synchronously with the current value, then on each write. Returns an id. Unsupported type → `''` and `errCb(message)`. A throwing `cb` is caught, logged, and passed to its own `errCb`. |
| `unsubscribeState(type, name, id)` | Removes one subscription. |
| `publishEvent(type, name, value)` | Writes locally (no dedupe) and sends to the host. The wire method follows the runtime type of `value`, as upstream does. |

Inbound writes deduplicate scalars (`===`) and never echo back to the host; objects always notify.

### Helpers (not part of CrComLib)

`pulseDigital(name, holdMs?)`, `setDigital(name, held)` (RepeatDigital hold, re-published every
250 ms, released on `detach()`), `isDigitalHeld(name)`, `setAnalog`, `setSerial`, `setObject`,
`setState(name, value)` (type from the value; booleans use `setDigital`).

### Lifecycle and diagnostics

`MicroComLib.getInstance(options?)`, `MicroComLib.resetInstance()`, `new MicroComLib(options?)`,
`attach()`, `detach()`, `dispose()`, `attached`, `transport` (`'xpanel' | 'android' | 'ios' | 'none'`,
re-detected on each read), `getSignals()`, `version`.

### Options

```ts
new MicroComLib({
  scope,                    // object to probe/install on; default globalThis
  transport,                // custom HostTransport; skips detection (tests, emulators)
  heartbeat: true,          // echo Csig.HeartbeatRequest → Csig.HeartbeatResponse
  resync: true,             // handle Csig.State_Synchronization
  rcb: true,                // interpolate RCB ramps into the analog signal
  hostSubscriptionHints: false, // send matched bridgeSubscribe*/bridgeUnsubscribe* hints (Android/iOS)
  logger,                   // Partial<Logger> | false; default warns/errors to console
  repeatDigitalIntervalMs: 250,
  resyncTimeoutMs: 60000,
});
```

## What is kept from CrComLib

- **Transports.** XPanel → Android → iOS → none, detected lazily on every send. Android and XPanel
  share one code path (objects JSON-stringified). iOS packs `{signal, value}` into one JSON string.
  With no host, sends are dropped after a single warning.
- **RCB.** An inbound `{rcb:{value,time}}` is annotated with `startv`/`startt` on the object signal
  and interpolated into the number signal every 100 ms with direction-aware rounding. Every plain
  analog cancels the ramp and mirrors `{rcb:{value,time:0}}` to the object signal.
- **Resync.** `StartOfUpdate` snapshots every host-written signal (minus excluded prefixes);
  `StartOfUpdateRange`/`…SO` add explicit `fb<join>` ranges and names; each write clears its name;
  `EndOfUpdate` or a 60 s timeout resets leftovers to `false`/`0`/`''` (numbers also reset their
  RCB object). Objects are never reset.
- **Heartbeat.** Each `Csig.HeartbeatRequest` payload is echoed on `Csig.HeartbeatResponse`.
- **RepeatDigital.** `{repeatdigital: bool}` publishes pass straight through; `setDigital` manages the hold.

## Deliberate differences from CrComLib

| CrComLib | MicroComLib |
| --- | --- |
| Whole API on `window.CrComLib` | Receive-only 4-function `CrComLib` shim, only after attach |
| Sends `bridgeUnsubscribe*` on last unsubscribe but its `bridgeSubscribe*` path is unreachable | Neither by default; symmetric hints when `hostSubscriptionHints: true` |
| A throwing subscriber kills its subscription | Caught, logged, routed to that subscription's `errCb` |
| Invalid resync request throws inside the host callback | Logged and ignored |
| Silent when no host is present | One warning |
| `unsubscribeState` on an unknown name creates a signal | No creation |
| Heartbeat echoes the initial empty replay at load | Only real requests are answered |
| Subscription ids collide after 99 999 | Ids keep growing |
| Non-string join names are not normalized | Names are coerced with `String()` first |

## Not included

CH5 web components, i18n interception of string signals, `subscribeStateScript`, `Ch5Debug`
config keys, the emulator, `Csig.Platform_Info`, `Csig.library.ver/date`, touch-activity signals,
the media player (`Csig.socket.*`) and `<ch5-video>` (`Csig.video.*`) logic, contract file parsing,
`<ch5-template>` join-offset rewriting. Those `Csig.*` signals still round-trip as ordinary signals.

## Verify on hardware

These cannot be settled from source:

- [ ] iOS: object payloads are double-encoded inside the `postMessage` envelope, as upstream does.

## Development

```sh
pnpm install
pnpm test          # run the unit tests once
pnpm test:watch    # watch mode
pnpm coverage      # v8 coverage; fails below 95% lines/functions/branches/statements
pnpm typecheck     # tsc --noEmit
pnpm build         # tsup -> dist/ (ESM + .d.ts + sourcemaps)
```

Tests run under plain `node`: host globals are injected through the `scope` option, and RCB,
resync and RepeatDigital timers use fake timers. `docs/PLAN.md` records the design, the upstream
findings it rests on, and the decisions taken.


## Requirements

- Targets ES2022: current Crestron Hardware (TS series with 3.x or later firmware) and current browsers.
- Zero runtime dependencies, by design. Nothing may be added to `dependencies`.

## License

Copyright 2026 M3 Tech Group. Licensed under the Apache License, Version 2.0 — see
[LICENSE](LICENSE).

## Attribution

MicroComLib is an independent reimplementation of the signal layer of Crestron's CH5 Component
Library (`@crestron/ch5-crcomlib`). It was written by studying the behaviour of the published
source at <https://github.com/Crestron/CH5ComponentLibrary> (v2.19.1), which Crestron Electronics,
Inc. distributes under the Apache License 2.0.

Crestron, CH5, XPanel and CrComLib are trademarks of Crestron Electronics, Inc. MicroComLib is
not affiliated with, endorsed by, or supported by Crestron Electronics, Inc.
