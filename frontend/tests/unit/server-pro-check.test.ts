import assert from 'node:assert/strict';

import {
  isActiveProfilePro,
  isNonRevenueCatProfilePro,
  resolveServerEffectiveIsPro,
} from '../../lib/server-pro-check';

assert.equal(isActiveProfilePro(null), false, 'missing profile should not be Pro');
assert.equal(isActiveProfilePro({ is_pro: false, pro_until: null }), false, 'is_pro=false should not be Pro');
assert.equal(isActiveProfilePro({ is_pro: true, pro_until: null }), true, 'indefinite Pro should stay active');

const future = new Date(Date.now() + 60_000).toISOString();
assert.equal(
  isActiveProfilePro({ is_pro: true, pro_until: future }),
  true,
  'future pro_until should stay active'
);

const past = new Date(Date.now() - 60_000).toISOString();
assert.equal(
  isActiveProfilePro({ is_pro: true, pro_until: past }),
  false,
  'expired pro_until should not count as Pro'
);

assert.equal(
  isActiveProfilePro({ is_pro: true, pro_until: 'not-a-date' }),
  true,
  'invalid pro_until currently behaves like indefinite Pro'
);

assert.equal(
  resolveServerEffectiveIsPro({ is_pro: true, pro_plan: 'manual' }, false, true),
  true,
  'manual grant stays Pro when RevenueCat inactive'
);
assert.equal(
  resolveServerEffectiveIsPro({ is_pro: true, pro_plan: 'monthly' }, false, true),
  false,
  'stale store profile loses when RevenueCat resolved inactive'
);
assert.equal(
  resolveServerEffectiveIsPro({ is_pro: true, pro_plan: 'yearly' }, false, false),
  true,
  'offline RevenueCat falls back to profile'
);
assert.equal(
  resolveServerEffectiveIsPro({ is_pro: false }, true, true),
  true,
  'active RevenueCat grants Pro'
);
assert.equal(
  isNonRevenueCatProfilePro({ is_pro: true, stripe_subscription_id: 'sub_123' }),
  true,
  'stripe profile is non-RevenueCat Pro'
);

console.log('server-pro-check.test.ts passed');
