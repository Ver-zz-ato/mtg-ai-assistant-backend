import assert from 'node:assert/strict';

import { isActiveProfilePro } from '../../lib/server-pro-check';

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

console.log('server-pro-check.test.ts passed');
