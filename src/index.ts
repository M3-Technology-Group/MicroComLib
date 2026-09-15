/**
 * MicroComLib - a minimalistic implementation of the Crestron CH5 CrComLib.
 *
 * Public entry point. This package has zero runtime dependencies and never
 * imports `@crestron/ch5-crcomlib`: the CH5 bridge is injected onto
 * `globalThis` by the panel at runtime.
 */

/** The MicroComLib version, substituted from package.json at build time. */
export const VERSION: string = __MICROCOMLIB_VERSION__;
