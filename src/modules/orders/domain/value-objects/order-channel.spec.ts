import { describe, expect, it } from '@jest/globals';
import { channelCustomerSource, channelRequiresAttendant, OrderChannel } from './order-channel';

describe('OrderChannel policies', () => {
  describe('channelRequiresAttendant', () => {
    it.each<[OrderChannel, boolean]>([
      [OrderChannel.APP, false],
      [OrderChannel.WEB, false],
      [OrderChannel.TOTEM, false],
      [OrderChannel.COUNTER, true],
      [OrderChannel.PICKUP, true],
    ])('%s -> %s', (channel, expected) => {
      expect(channelRequiresAttendant(channel)).toBe(expected);
    });
  });

  describe('channelCustomerSource', () => {
    it.each<[OrderChannel, string]>([
      [OrderChannel.APP, 'authenticated'],
      [OrderChannel.WEB, 'authenticated'],
      [OrderChannel.TOTEM, 'anonymous'],
      [OrderChannel.COUNTER, 'from-request'],
      [OrderChannel.PICKUP, 'from-request'],
    ])('%s -> %s', (channel, expected) => {
      expect(channelCustomerSource(channel)).toBe(expected);
    });
  });
});
