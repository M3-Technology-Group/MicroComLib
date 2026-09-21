import { describe, expect, it } from 'vitest';

import {
  JOIN_NUMBER_SIGNAL_NAME_PREFIX,
  isIntegerSignalName,
  toJoinNumberSignalName,
  toSubscriptionSignalName,
} from './signal-name';

describe('isIntegerSignalName', () => {
  it.each(['0', '1', '200', '65535', '-5'])('accepts %j', (name) => {
    expect(isIntegerSignalName(name)).toBe(true);
  });

  it.each(['', '007', ' 200', '200 ', '200a', 'a200', '2e3', '1.5', 'fb200', 'button', 'NaN', '+5'])(
    'rejects %j',
    (name) => {
      expect(isIntegerSignalName(name)).toBe(false);
    },
  );
});

describe('toJoinNumberSignalName', () => {
  it('prefixes with fb', () => {
    expect(JOIN_NUMBER_SIGNAL_NAME_PREFIX).toBe('fb');
    expect(toJoinNumberSignalName('200')).toBe('fb200');
  });
});

describe('toSubscriptionSignalName', () => {
  it('prefixes integer-like names only', () => {
    expect(toSubscriptionSignalName('200')).toBe('fb200');
    expect(toSubscriptionSignalName('-5')).toBe('fb-5');
    expect(toSubscriptionSignalName('007')).toBe('007');
    expect(toSubscriptionSignalName('AudioZone1.Visible')).toBe('AudioZone1.Visible');
    expect(toSubscriptionSignalName('fb200')).toBe('fb200');
  });
});
