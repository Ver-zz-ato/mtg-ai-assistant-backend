import assert from 'node:assert/strict';
import { sanitizeAnalyticsProps } from '../../lib/analytics/sanitize';
import { resolveAnalyticsSessionId } from '../../lib/server/analytics-session';

const stripped = sanitizeAnalyticsProps({
  email: 'test@example.com',
  thread_id: 'thread-123',
  user_message: 'hello',
  assistant_message: 'hi',
  collection_payload: { cards: ['Sol Ring'] },
  prompt: 'raw prompt',
  completion: 'raw completion',
  request_body: { unsafe: true },
  response_body: { unsafe: true },
  model: 'gpt-5',
  provider: 'openai',
  feature: 'chat',
  latency_ms: 123,
  input_tokens: 10,
  output_tokens: 20,
  total_tokens: 30,
  estimated_cost_usd: 0.01,
  cache_hit: false,
  user_message_present: true,
  thread_id_present: true,
  deck_card_count: 99,
  prompt_version: 'chat-v2',
  prompt_path: 'chat.default',
  message_length: 42,
});

assert.equal('email' in stripped, false);
assert.equal('thread_id' in stripped, false);
assert.equal('user_message' in stripped, false);
assert.equal('assistant_message' in stripped, false);
assert.equal('collection_payload' in stripped, false);
assert.equal('prompt' in stripped, false);
assert.equal('completion' in stripped, false);
assert.equal('request_body' in stripped, false);
assert.equal('response_body' in stripped, false);
assert.equal(stripped.user_message_present, true);
assert.equal(stripped.assistant_message_present, true);
assert.equal(stripped.thread_id_present, true);
assert.equal(stripped.collection_present, true);
assert.equal(stripped.prompt_present, true);
assert.equal(stripped.completion_present, true);
assert.equal(stripped.model, 'gpt-5');
assert.equal(stripped.provider, 'openai');
assert.equal(stripped.feature, 'chat');
assert.equal(stripped.latency_ms, 123);
assert.equal(stripped.input_tokens, 10);
assert.equal(stripped.output_tokens, 20);
assert.equal(stripped.total_tokens, 30);
assert.equal(stripped.estimated_cost_usd, 0.01);
assert.equal(stripped.cache_hit, false);
assert.equal(stripped.deck_card_count, 99);
assert.equal(stripped.prompt_version, 'chat-v2');
assert.equal(stripped.prompt_path, 'chat.default');
assert.equal(stripped.message_length, 42);

const nested = sanitizeAnalyticsProps({
  $set: {
    email: 'nested@example.com',
    user_tier: 'pro',
  },
  $set_once: {
    user_email: 'nested@example.com',
    first_feature_used: 'chat',
  },
});

assert.deepEqual(nested, {
  $set: { user_tier: 'pro' },
  $set_once: { first_feature_used: 'chat' },
});

(async () => {
  assert.equal(
    await resolveAnalyticsSessionId({
      headers: {
        get(name: string) {
          if (name === 'x-analytics-session-id') return 'header-session';
          return null;
        },
      },
      cookies: {
        get() {
          return { value: 'cookie-session' };
        },
      },
    }),
    'header-session'
  );

  assert.equal(
    await resolveAnalyticsSessionId({
      headers: { get: () => null },
      cookies: {
        get(name: string) {
          return name === 'mt_session_id' ? { value: 'cookie-session' } : undefined;
        },
      },
    }),
    'cookie-session'
  );

  console.log('analytics-sanitize.test.ts passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
