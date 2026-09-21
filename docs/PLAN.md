# MicroComLib — Implementation Plan

Status: **implemented** (2026-09-15) as `microcomlib@0.1.0`. Usage lives in `README.md`; this document keeps the
design rationale, the upstream findings it rests on, the decisions taken, and the hardware checklist.

Source of truth for upstream behaviour: `@crestron/ch5-crcomlib` v2.19.1 source in
`../CH5ComponentLibrary/src/` and the investigation notes in
`../CH5ComponentLibrary/docs/crcomlib/` (note: that `docs/` folder is git-ignored upstream).

## 1. Goals

- A dependency-free, ESM-only TypeScript reimplementation of the CrComLib **signal layer**:
  `getState`, `subscribeState`, `unsubscribeState`, `publishEvent`, with identical semantics.
- Consumed as an **instance** (`MicroComLib.getInstance()`), never via `window.CrComLib`.
- Works on Android WebView panels (`JSInterface`), iOS Crestron App (`webkit.messageHandlers`),
  Crestron touchscreen hardware, and browser Web XPanel (`CommunicationInterface`).
- Keeps **RCB** ramp interpolation, **RepeatDigital**, **Resync** (`Csig.State_Synchronization`)
  and the **Heartbeat** echo.
- One concern per file; unit tests colocated; **≥95% coverage enforced** in `vitest.config.ts`.
- Future consumer: `ch5-svelte` (`../svelte-ch5`) will default to this library unless the app
  passes its own CrComLib instance.

## 2. Non-goals (explicitly out of scope)

- CH5 web components, i18n/translation interception, `Ch5Debug` config keys, emulator.
- `subscribeStateScript` / `unsubscribeStateScript` (arbitrary `new Function` eval).
- CH5 Media Player (`Csig.socket.*`) and `<ch5-video>` (`Csig.video.*`) logic. These remain
  ordinary object signals and still round-trip; we just add no special handling.
- `Csig.Platform_Info`, `Csig.library.ver/date`, touch-activity signals (can be added later;
  see open questions).
- Contract (`.cse2j`) parsing and `<ch5-template>` join-offset rewriting — a component concern.
- UMD/CJS builds and a `window.CrComLib` full API global.

## 3. Findings that shape the design

| # | Finding | Consequence |
| --- | --- | --- |
| F1 | Android/iOS hosts evaluate `window.bridgeReceive{Boolean,Integer,String,Object}FromNative(name, value)` — bare globals. | We must install those four functions on `globalThis`. |
| F2 | **Web XPanel 2.8.0 calls `CrComLib.bridgeReceive*FromNative(name, value)` as a bare global lookup** (verified in the shipped bundle: no webpack externals, `define([], factory)`, and `has*` checks via `void 0 !== CrComLib[...]`). It `JSON.parse`s object payloads before calling. | We must also install a **receive-only** `globalThis.CrComLib = { bridgeReceive*FromNative ×4 }` shim for XPanel to work. Nothing else needs to be on it. |
| F3 | XPanel installs `window.CommunicationInterface` asynchronously inside `WebXPanel.initialize()`. Its four `bridgeSend*ToNative` have the same signature as Android's `JSInterface`. `bridgeSendObjectToNative` forwards `value` verbatim to the worker; upstream passes a JSON string. | Transport detection is lazy (per send). Android and XPanel share one code path. Objects are `JSON.stringify`'d for both. |
| F4 | iOS packs `{signal, value}` into one JSON string per `postMessage`; the object value is the live object (double-encoded by the outer stringify), unlike Android/XPanel. | Separate WebKit transport. Flag for hardware verification. |
| F5 | `publishEvent` uses the raw name; `subscribeState`/`getState`/`unsubscribeState`/receive add the `fb` prefix to integer-like names (`"200"` → `"fb200"`; `"007"`, `" 200"` are *not* integer-like). | Two registry keys per numeric join. Never normalize on the publish path. |
| F6 | `getState` returns `defaultValue ?? null` until a signal has been written at least once (`hasChangedSinceInit`), and does not create signals. | Mirror exactly. |
| F7 | Inbound writes dedupe on `!==` (so objects always re-notify); local publishes never dedupe. Inbound writes never echo back to the host. | Mirror exactly. |
| F8 | New subscribers are invoked synchronously with the current value (BehaviorSubject replay). | Mirror exactly; ch5-svelte depends on this for first render. |
| F9 | Upstream's first-subscriber `bridgeSubscribe*` call is unreachable, but last-subscriber `bridgeUnsubscribe*` fires. Shipping firmware therefore works with **zero** subscribe hints. | Do not copy the asymmetry. Default: send neither. Optional symmetric mode (open question). |
| F10 | `bridgeReceiveIntegerFromNative` writes the number signal **and** an object signal `{rcb:{value,time:0}}`, and cancels any in-flight ramp. RCB objects on the object path start a 100 ms interpolation into the number signal. | Keep, in `rcb.ts`. |
| F11 | Resync: `StartOfUpdate` snapshots every signal that has ever been written by the host (all four buckets, minus excluded prefixes and the sync signal itself); `StartOfUpdateRange`/`StartOfUpdateRangeSO` add `fb<join>` ranges and named states; every write during the window removes that name; `EndOfUpdate` (counter → 0) or a 60 s timeout resets leftovers: boolean→`false`, number→`0` (+ object `{rcb:{value:0,time:0}}` if present), string→`''`; objects are **not** reset. | Keep, in `resync.ts`, driven from the receive path rather than a self-subscription. |
| F12 | Heartbeat: echo `Csig.HeartbeatRequest` payload to `Csig.HeartbeatResponse`. | Keep, on by default, in `heartbeat.ts`. |
| F13 | ch5-svelte today calls `getState/subscribeState/unsubscribeState/publishEvent` with `'b'|'n'|'s'|'o'`, and implements press-and-hold by publishing `{repeatdigital:true}` every 250 ms and `{repeatdigital:false}` on release. Its `app.d.ts` also declares extension helpers (`pulseDigital`, `setDigital`, `setSerial`, `setAnalog`, `setObject`, `setState`) that are not part of CrComLib. | Core API must be a drop-in. Whether the helpers live here is an open question. |

## 4. Proposed public API

```ts
import { MicroComLib } from 'microcomlib';

const lib = MicroComLib.getInstance();            // singleton; see Q1 for attach behaviour
// or, for isolation (tests, multiple registries): new MicroComLib(options)

lib.getState('b', '200', false);                   // boolean | null
lib.subscribeState('n', '42', (v) => {...}, errCb) // returns subscription id string
lib.unsubscribeState('n', '42', id);
lib.publishEvent('o', '200', { repeatdigital: true });

lib.attach();   // installs host hooks on globalThis (F1 + F2); idempotent; throws if another instance is attached
lib.detach();   // removes them and cancels RCB/resync timers
lib.dispose();  // detach + clear registry (tests)

// Inbound hooks are also plain methods, so an app can wire them without globals:
lib.bridgeReceiveBooleanFromNative(name, value); // ...Integer, ...String, ...Object

// Diagnostics
lib.getSignals();        // read-only snapshot of the registry (upstream: getSubscriptionsCount())
lib.transport;           // 'xpanel' | 'android' | 'ios' | 'none' (evaluated lazily)
```

Type aliases exported under upstream names for migration: `TSignalNonStandardTypeName`,
`TSignalStandardTypeName`, `TSignalValue`, `TRepeatDigitalSignalValue`, `Ch5RcbSimpleObject`,
`Ch5RcbExtendedObject`, `IResynchronizationRequestModel`, plus our own `SignalType`, `SignalValue`,
`MicroComLibOptions`, `HostTransport`. `getState`/`subscribeState` get literal-type overloads so
`subscribeState('b', …, cb)` types `cb` as `(v: boolean) => void`.

Constructor options (all optional):

```ts
interface MicroComLibOptions {
  scope?: object;                   // host scope to probe/install on; default globalThis (tests inject a stub)
  transport?: HostTransport;        // bypass detection entirely (tests, emulators)
  heartbeat?: boolean;              // default true
  resync?: boolean;                 // default true
  rcb?: boolean;                    // default true
  hostSubscriptionHints?: boolean;  // default false (see Q3)
  logger?: Logger | false;          // default: console.warn for warnings only
}
```

## 5. Module layout (one concern per directory, no directory above eight files, tests colocated)

```
src/
  index.ts                    public re-exports only
  types.ts                    public types + upstream-compatible aliases
  logger.ts                   tiny leveled logger; no-op by default except warnings
  globals.d.ts                (exists) build-time define
  api/                        the consumer-facing surface
    micro-com-lib.ts          MicroComLib class: singleton, options, the 4 public functions, attach/detach, wiring
    helpers.ts                pulseDigital/setDigital/setAnalog/setSerial/setObject/setState over the core API
  signal/                     the value model
    signal.ts                 Signal<T>: value/prevValue/hasChanged/receivedFromHost, subscriber Map,
                              write(value, fromHost) with dedupe rule, replay on subscribe, subKey minting
    signal-registry.ts        four typed buckets; get(type, name, create); type-mismatch → null; snapshot()
    signal-type.ts            normalizeType('b'|'boolean'|…) → SignalType | null; SEED values
    signal-name.ts            isIntegerSignalName(), toSubscriptionName() ("fb" prefix), FB_PREFIX
  bridge/                     the host-facing inbound side
    bridge-receive.ts         the 4 inbound handlers: normalize, RCB mirror/detect, resync intercept, write
    bridge-globals.ts         attach()/detach(): globalThis.bridgeReceive*FromNative ×4 + receive-only
                              globalThis.CrComLib shim ×4; ownership guard; restores prior values on detach
  transport/                  the host-facing outbound side
    transport.ts              HostTransport interface; wire-method name table per SignalType
    detect-transport.ts       lazy probe order: CommunicationInterface → JSInterface → webkit → none
    adapters/
      direct-call-transport.ts  Android (JSInterface) and XPanel (CommunicationInterface): same signature,
                                objects JSON.stringify'd; optional subscribe/unsubscribe hints (Android only)
      webkit-transport.ts       iOS: postMessage(JSON.stringify({signal, value}))
      null-transport.ts         no host: warn once, drop
  features/                   the kept CrComLib behaviours
    rcb.ts                    RcbController: per-signal timeout + 100 ms interval, direction-aware rounding,
                              clearTimersForSignal, mirror-to-object
    resync.ts                 ResyncController: pending-reset map, counter, 60 s timer, range expansion,
                              exclude prefixes, onWrite(), reset leftovers
    heartbeat.ts              subscribe Csig.HeartbeatRequest → publish Csig.HeartbeatResponse
    repeat-digital.ts         REPEAT_DIGITAL_KEY, isRepeatDigitalValue(), RepeatDigitalController (managed hold)
```

Every `*.ts` above gets a sibling `*.test.ts`. `micro-com-lib.test.ts` holds end-to-end traces
(press → transport call; feedback → subscriber; ramp with fake timers; full resync cycle; heartbeat).

## 6. Behaviour we mirror exactly

- Type dispatch: `b|boolean`, `n|number|numeric`, `s|string`, `o|object`, case-insensitive.
  Unknown type: `subscribeState` returns `''` and calls `errCb`; others no-op.
- `subscribeState` / `unsubscribeState` / `getState` / all receive handlers normalize the name (F5).
  `publishEvent` never does.
- `getState`: `defaultValue ?? null` unless the signal exists **and** has been written; never creates.
- `publishEvent`: get-or-create; local notify (no dedupe); then send to host. Objects are sent as
  `JSON.stringify(value)` on Android/XPanel, as live object inside the iOS envelope.
- Inbound: get-or-create; mark `receivedFromHost`; set `hasChanged` before the dedupe check; dedupe
  scalars on `!==`; never echo to host; always notify resync of the write.
- Subscription ids: `${name}-${counter padded to 5}` (grows past 5 digits instead of colliding).
- Replay current value synchronously on subscribe.
- Integer receive: cancel ramp timers → write number → write object `{rcb:{value,time:0}}`.
- Object receive with `{rcb:{value,time}}`: read current number value as `startv`, `startt = Date.now()`,
  write extended RCB to the object signal, `setTimeout(time)` for the final write, and if `time > 100`
  a 100 ms `setInterval` writing floor/ceil-rounded interpolated numbers (only when changed).
- Resync exactly as F11, including: only `StartOfUpdateRange` (not `…SO`) starts the timer/counter;
  a new `StartOfUpdate` restarts the 60 s timer; `EndOfUpdate` with counter 0 is ignored.
- Heartbeat echo of the request object.
- Transport priority: XPanel first (equivalent to upstream, which clears its WebView flag when
  XPanel is present), then Android, then iOS, then none.

## 7. Deliberate deviations from upstream

| Upstream | MicroComLib | Why |
| --- | --- | --- |
| `window.CrComLib` exposes the whole API | Only a receive-only 4-function `CrComLib` shim, only after `attach()` | XPanel hard-requires it (F2); nothing else does |
| Subscribe hint unreachable, unsubscribe hint fires | Neither by default; symmetric when opted in | An unmatched unsubscribe can kill feedback on hosts that honour it |
| A throwing subscriber kills its rxjs subscription | Exception is caught, logged, passed to that subscription's `errCb`; other subscribers still run | Safer inside host-evaluated callbacks |
| Invalid resync request throws inside the host callback | Logged and ignored | Never throw into native-evaluated JS |
| No-host sends silently dropped | One warning per instance, then dropped | Discoverability in plain-browser dev |
| Per-signal `Ch5SignalBridge` instances with dead bookkeeping | Stateless transport functions | Simplicity |
| `unsubscribeState` on an unknown name creates a signal | No creation | Avoid registry pollution |
| Timers via `window.setTimeout` | `globalThis` timers | Runs under node tests without a DOM |

## 8. Testing strategy

- Vitest, node environment, fake timers for RCB and resync (`vi.useFakeTimers`, `vi.setSystemTime`).
- Host globals are injected via `options.scope` (a plain object) so transport detection, `attach()`,
  and the XPanel `CrComLib` shim are tested without touching the real `globalThis`; one test suite
  also exercises the real `globalThis` path and cleans up.
- A `FakeHost` test helper records outbound calls and can drive the four inbound hooks, giving an
  emulator-style harness for end-to-end scenarios.
- Coverage thresholds `lines/functions/branches/statements: 95` in `vitest.config.ts` so `pnpm coverage`
  fails below target. `index.ts` re-exports and `types.ts` are included in coverage on purpose.
- Contract tests assert the exact wire calls per platform, including the iOS JSON envelope and the
  `fb` prefix asymmetry, so a future refactor cannot silently change addressing.

## 9. Build and packaging

- Keep existing scaffolding: tsup ESM + d.ts + sourcemaps, `sideEffects: false`, zero `dependencies`
  (standing invariant), `VERSION` define. Add coverage thresholds. No other tooling changes.
- Update `README.md` after implementation: quick start, platform notes, hardware verification list.

## 10. Milestones (each ends green on `pnpm typecheck && pnpm test`)

1. `types.ts`, `signal-type.ts`, `signal-name.ts`, `logger.ts` + tests.
2. `signal.ts`, `signal-registry.ts` + tests (replay, dedupe, hasChanged, type mismatch, sub ids).
3. `transport/*` + tests (detection order, wire formats, iOS envelope, null warning, hints).
4. `bridge-receive.ts`, `rcb.ts` + tests with fake timers (ramp up/down/zero-slope/interrupt).
5. `resync.ts` + tests (ClearAll, ClearRange, SO variant, timeout, exclude prefixes, object rcb reset).
6. `heartbeat.ts`, `repeat-digital.ts` + tests.
7. `micro-com-lib.ts`, `bridge-globals.ts`, `index.ts` + end-to-end tests; coverage thresholds on.
8. README, hardware verification checklist, version bump to `0.1.0`.

## 11. Decisions (resolved 2026-09-15)

- **Q1 — Host hooks install:** `getInstance()` auto-attaches once (four bare receive globals + receive-only
  `CrComLib` shim). `detach()` removes them. `new MicroComLib()` never installs anything. `attach()` throws if a
  foreign `CrComLib` global is already present, because two signal layers cannot share one host.
- **Q2 — Convenience layer:** ship the full ch5-svelte helper set as methods on the instance: `pulseDigital`,
  `setDigital` (managed RepeatDigital hold, 250 ms repeat, released on `detach()`), `setAnalog`, `setSerial`,
  `setObject`, `setState`.
- **Q3 — Host subscribe/unsubscribe hints:** off by default; `hostSubscriptionHints: true` sends matched
  first-subscriber / last-subscriber hints on Android and iOS (never XPanel, which declares none).
- **Q4 — Diagnostic signals:** do not publish `Csig.library.ver` / `Csig.library.date`.
- Additional calls made while building: `publishEvent` dispatches the wire method on `typeof value`, exactly as
  upstream does (so an object published on a boolean-typed call still goes out as an object); the heartbeat
  responds only to requests actually received from the host, not to the initial `{}` replay.

## 12. Hardware verification checklist (cannot be settled from source)

- [ ] iOS: object payload double-encoding accepted by the current container app (F4).
- [ ] XPanel: `bridgeSendObjectToNative` with a JSON string (F3) reaches the control system correctly.
- [ ] Panels: feedback arrives with zero subscribe hints (F9); RCB ramps animate; resync clears stale joins
      after a program reload.
- [ ] RepeatDigital press-and-hold releases on the control system when the page is closed mid-press.

## 13. Implementation notes (post-build, 2026-09-15)

- Result: 19 test files, 181 tests, 100% statements/lines/functions, 100% branches; `dist/index.js` ≈ 34 KB
  unminified ESM with no Node references and no import-time side effects.
- Typed overloads: the untyped `getState`/`subscribeState`/`publishEvent` forms only match a dynamic
  `string` (via `NotSignalTypeAlias<T>`), so `publishEvent('b', name, 'text')` is a compile error while
  `publishEvent(someString, name, value)` still type-checks as it always has.
- Names are coerced with `String()` at the API boundary and in the receive hooks, so a numeric join passed
  as a JS number (seen in the old Angular demo) is normalized correctly. Upstream does not do this.
- `publishEvent` with an unsupported type warns; upstream is silent.
- Host hints (opt-in) use the registry name (`fb200`), matching the name upstream's reachable unsubscribe
  path sends. Whether firmware wants `fb200` or `200` here is on the hardware checklist.
- The heartbeat subscribes through the public API, so with hints enabled it produces a first-subscriber hint
  for `Csig.HeartbeatRequest`, as upstream's heartbeat would if its hint path were reachable.
- Not committed to git; the working tree holds the implementation for review.
