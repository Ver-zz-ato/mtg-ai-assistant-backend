const FORBIDDEN_EXACT_KEYS = new Set([
  'email',
  'user_email',
  'thread_id',
  'user_message',
  'assistant_message',
  'prompt',
  'completion',
  'decklist',
  'collection',
  'collection_payload',
  'raw_collection',
  'raw_collection_payload',
  'cards',
  'card_list',
  'deck_text',
  'decktext',
  'messages',
  'request_body',
  'response_body',
]);

const FORBIDDEN_PATTERNS = [
  /email/i,
  /message/i,
  /prompt/i,
  /completion/i,
  /decklist/i,
  /collection/i,
  /thread_id/i,
];

const SAFE_ANALYTICS_KEYS = new Set([
  '$set',
  '$set_once',
  'assistant_message_present',
  'chat_message_count',
  'collection_count',
  'collection_present',
  'completion_present',
  'deck_card_count',
  'decklist_present',
  'has_collection',
  'has_deck_context',
  'message_count',
  'message_id_present',
  'message_length',
  'messages_present',
  'prompt_path',
  'prompt_present',
  'prompt_version',
  'prompt_version_id',
  'response_length',
  'response_present',
  'thread_id_present',
  'user_message_present',
]);

type SanitizedAnalyticsInput = Record<string, any> | undefined | null;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function addPresenceFlag(target: Record<string, any>, normalizedKey: string) {
  if (normalizedKey.includes('thread_id')) target.thread_id_present = true;
  if (normalizedKey.includes('user_message')) target.user_message_present = true;
  if (normalizedKey.includes('assistant_message')) target.assistant_message_present = true;
  if (normalizedKey === 'message_id') target.message_id_present = true;
  if (normalizedKey === 'message' || normalizedKey === 'messages' || normalizedKey.includes('message')) {
    target.messages_present = true;
  }
  if (normalizedKey.includes('prompt')) target.prompt_present = true;
  if (normalizedKey.includes('completion')) target.completion_present = true;
  if (normalizedKey.includes('decklist') || normalizedKey === 'deck_text' || normalizedKey === 'decktext') {
    target.decklist_present = true;
  }
  if (normalizedKey.includes('collection')) target.collection_present = true;
}

function shouldStripKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SAFE_ANALYTICS_KEYS.has(normalized)) return false;
  if (FORBIDDEN_EXACT_KEYS.has(normalized)) return true;
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(normalized));
}

function sanitizeNestedIdentityProps(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  return sanitizeAnalyticsProps(input as Record<string, any>);
}

export function sanitizeAnalyticsProps(input: SanitizedAnalyticsInput): Record<string, any> {
  if (!input || typeof input !== 'object') return {};

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === '$set' || key === '$set_once') {
      const nested = sanitizeNestedIdentityProps(value);
      if (nested && typeof nested === 'object' && Object.keys(nested as Record<string, any>).length > 0) {
        sanitized[key] = nested;
      }
      continue;
    }

    if (shouldStripKey(key)) {
      addPresenceFlag(sanitized, normalizeKey(key));
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}
