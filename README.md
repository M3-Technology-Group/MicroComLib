# MicroComLib

A minimalistic, dependency-free implementation of the Crestron CH5 `CrComLib`
bridge, built for modern bundlers.

The goal is to let a Svelte (or any ESM) app talk to a Crestron control system
**without bundling `@crestron/ch5-crcomlib`**. The CH5 bridge is injected onto
`globalThis` by the panel at runtime; MicroComLib is a thin, typed, tree-shakeable
wrapper over that surface.

## Status

Scaffold only. No public API yet.

## Install

```sh
pnpm add microcomlib
```

## Requirements

- ESM-only (`"type": "module"`). No CommonJS build.
- Targets ES2022 — modern CH5 panels (TSW-70/1070 series) and current browsers.
- Zero runtime dependencies, by design. This is a standing invariant: nothing
  may be added to `dependencies`.

## Development

```sh
pnpm install
pnpm test          # run the unit tests once
pnpm test:watch    # watch mode
pnpm coverage      # v8 coverage report
pnpm typecheck     # tsc --noEmit
pnpm build         # tsup -> dist/ (ESM + .d.ts + sourcemaps)
```

## Layout

| Path                | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `src/index.ts`      | Public entry point — the only tsup entry.   |
| `src/globals.d.ts`  | Build-time `define` globals (e.g. version). |
| `src/*.test.ts`     | Unit tests, colocated with the source.      |
| `tsup.config.ts`    | Build config (ESM, declarations, browser).  |
| `vitest.config.ts`  | Test config (node environment by default).  |

Tests run in the `node` environment because the CH5 bridge is just function
properties on `globalThis`, which can be stubbed directly. A test that genuinely
needs `document` or `window` can opt in per-file:

```ts
// @vitest-environment happy-dom
```

(That requires adding `happy-dom` as a dev dependency — it is not installed yet.)

## License

MIT

## Versioning

`VERSION` is substituted from `package.json` at build time via the `define` in
`tsup.config.ts` (mirrored in `vitest.config.ts` so tests see the same value).
A unit test asserts the two stay in step, so the constant cannot silently drift.
