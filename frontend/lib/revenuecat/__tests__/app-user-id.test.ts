import { isSupabaseUserId } from '@/lib/revenuecat/app-user-id';

describe('isSupabaseUserId', () => {
  test('accepts Supabase auth UUIDs', () => {
    expect(isSupabaseUserId('83cd3d21-6dae-4edc-be28-5d4bf26408c7')).toBe(true);
  });

  test('rejects RevenueCat anonymous IDs', () => {
    expect(isSupabaseUserId('$RCAnonymousID:d4e55f2f2dd24995a17bcd7993f681c8')).toBe(false);
  });

  test('rejects empty and malformed values', () => {
    expect(isSupabaseUserId('')).toBe(false);
    expect(isSupabaseUserId('not-a-uuid')).toBe(false);
  });
});
