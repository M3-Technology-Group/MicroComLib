import { describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import { VERSION } from './index';

describe('microcomlib', () => {
  it('exports the version from package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
