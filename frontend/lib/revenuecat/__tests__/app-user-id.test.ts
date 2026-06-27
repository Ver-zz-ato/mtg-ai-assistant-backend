import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isSupabaseUserId } from '@/lib/revenuecat/app-user-id';

describe('isSupabaseUserId', () => {
  test('accepts Supabase auth UUIDs', () => {
    assert.equal(isSupabaseUserId('83cd3d21-6dae-4edc-be28-5d4bf26408c7'), true);
  });

  test('rejects RevenueCat anonymous IDs', () => {
    assert.equal(isSupabaseUserId('$RCAnonymousID:d4e55f2f2dd24995a17bcd7993f681c8'), false);
  });

  test('rejects empty and malformed values', () => {
    assert.equal(isSupabaseUserId(''), false);
    assert.equal(isSupabaseUserId('not-a-uuid'), false);
  });
});
