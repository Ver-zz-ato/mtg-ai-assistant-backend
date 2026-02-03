/**
 * Unified LLM Client
 * 
 * Single entry point for all OpenAI API calls with:
 * - Consistent error handling
 * - Automatic fallback (gpt-5 → gpt-4o-mini)
 * - Configurable timeouts
 * - Retry logic with exponential backoff
 * - Structured observability logging
 * - Never silently succeed with different-quality output
 */

import { prepareOpenAIBody } from './openai-params';
import { logAICall, getUserType, hashUserId, type AICallLog } from './observability';
import { recordAiUsage } from './log-usage';
import { costUSD } from './pricing';

export type LLMConfig = {
  route: string;              // e.g., '/api/chat'
  feature: string;            // e.g., 'chat', 'deck_analyze'
  model: string;             // Primary model (e.g., 'gpt-5')
  fallbackModel?: string;    // Fallback model (default: 'gpt-4o-mini')
  timeout?: number;          // Timeout in ms (default varies by route)
  maxTokens?: number;        // Max completion/output tokens
  apiType: 'chat' | 'responses'; // Which OpenAI API to use
  userId?: string | null;    // User ID for logging
  isPro?: boolean;           // Pro status for logging
  retryOn429?: boolean;      // Whether to retry on 429 (default: false for most routes)
  retryOn5xx?: boolean;      // Whether to retry on 5xx (default: false)
  threadId?: string | null;  // For ai_usage.thread_id (e.g. chat thread)
  promptPreview?: string | null;  // Truncated input for ai_usage.prompt_preview
  responsePreview?: string | null; // Truncated output for ai_usage.response_preview
  modelTier?: string | null; // e.g. 'pro', 'free'
  promptPath?: string | null;
  formatKey?: string | null;
};

export type LLMResponse = {
  text: string;
  fallback: boolean;
  originalModel: string;
  actualModel: string;
  inputTokens?: number;
  outputTokens?: number;
  latency: number;
};

// Default timeout values by route type (UX-based: interactive UI actions timeout faster)
const DEFAULT_TIMEOUTS: Record<string, number> = {
  chat: 30000,           // 30 seconds - interactive chat
  'deck_analyze': 300000, // 5 minutes - comprehensive deck analysis (complex, can take time)
  'deck_scan': 300000,   // 5 minutes - AI Deck Scan (complex deck analysis needs more time)
  'deck_compare': 300000, // 5 minutes - deck comparison analysis (complex analysis)
  'swap_suggestions': 300000, // 5 minutes - interactive suggestions
  'swap_why': 300000,     // 5 minutes - interactive explanation
  'reprint_risk': 300000, // 5 minutes - interactive check
  'debug_ping': 10000,   // 10 seconds - quick health check
  default: 20000,        // 20 seconds default
};

/**
 * Unified LLM call function
 * 
 * Handles all OpenAI API calls with consistent error handling, fallback, and logging.
 */
export async function callLLM(
  messages: Array<{ role: string; content: string }> | Array<{ role: string; content: Array<{ type: string; text: string }> }>,
  config: LLMConfig
): Promise<LLMResponse> {
  const startTime = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const fallbackModel = config.fallbackModel || 'gpt-4o-mini';
  const timeout = config.timeout || DEFAULT_TIMEOUTS[config.feature] || DEFAULT_TIMEOUTS.default;
  const userType = getUserType(config.userId || null, config.isPro || false);
  const userIdHash = await hashUserId(config.userId || null);

  // Determine API URL and payload structure
  const isResponsesAPI = config.apiType === 'responses';
  const apiUrl = isResponsesAPI 
    ? 'https://api.openai.com/v1/responses'
    : 'https://api.openai.com/v1/chat/completions';

  // Build request body based on API type
  let requestBody: any;
  
  if (isResponsesAPI) {
    // Responses API format
    requestBody = prepareOpenAIBody({
      model: config.model,
      input: messages,
      ...(config.maxTokens ? { max_output_tokens: config.maxTokens } : {}),
    });
  } else {
    // Chat Completions API format
    requestBody = prepareOpenAIBody({
      model: config.model,
      messages: messages,
      ...(config.maxTokens ? { max_completion_tokens: config.maxTokens } : {}),
    });
  }

  // Helper to make API call with timeout
  async function makeRequest(model: string, isRetry: boolean = false): Promise<{
    ok: boolean;
    status: number;
    json: any;
    text: string;
  }> {
    // Build request body with the specified model
    let finalBody: any;
    if (isResponsesAPI) {
      finalBody = prepareOpenAIBody({
        model,
        input: messages,
        ...(config.maxTokens ? { max_output_tokens: config.maxTokens } : {}),
      });
    } else {
      finalBody = prepareOpenAIBody({
        model,
        messages: messages,
        ...(config.maxTokens ? { max_completion_tokens: config.maxTokens } : {}),
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(finalBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let json: any = {};
      try {
        json = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        // If JSON parse fails, return error
        return {
          ok: false,
          status: response.status,
          json: { error: { message: 'Invalid JSON response' } },
          text: responseText,
        };
      }

      return {
        ok: response.ok,
        status: response.status,
        json,
        text: responseText,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          json: { error: { message: 'Request timeout' } },
          text: 'Request timeout',
        };
      }

      throw error;
    }
  }

  // Extract text from response based on API type
  function extractText(json: any): string {
    if (isResponsesAPI) {
      return String(json?.output_text || '').trim();
    } else {
      return String(json?.choices?.[0]?.message?.content || '').trim();
    }
  }

  // Extract token usage
  function extractTokens(json: any): { input?: number; output?: number } {
    const usage = json?.usage || {};
    return {
      input: usage.prompt_tokens || usage.input_tokens,
      output: usage.completion_tokens || usage.output_tokens,
    };
  }

  // Main request attempt
  let attempt = await makeRequest(config.model);
  let usedFallback = false;
  let actualModel = config.model;

  // Handle errors with fallback logic
  if (!attempt.ok) {
    const errorMessage = String(attempt.json?.error?.message || '').toLowerCase();
    const errorType = String(attempt.json?.error?.type || '').toLowerCase();
    const status = attempt.status;

    // Only fallback on model-specific or capability errors, NOT on auth/validation errors
    // Fallback should happen for:
    // - "model not found / unavailable"
    // - "unsupported parameter" (model-specific)
    // - "invalid_request_error" where switching model might help
    // But NOT for:
    // - 401/403 (auth/security - will repeat on fallback)
    // - 400 with bad payload (bug - will repeat)
    // - 422 validation errors (will repeat)
    // - "context_length_exceeded" (fallback often has smaller context)
    const shouldFallback =
      status >= 400 &&
      status < 500 &&
      status !== 401 &&
      status !== 403 &&
      (
        /model.*not found|model.*unavailable|model.*does not exist|model.*invalid/.test(errorMessage) ||
        /not a chat model|not supported.*chat\.completions/.test(errorMessage) ||
        /unsupported.*parameter|parameter.*not supported|invalid.*parameter/.test(errorMessage) ||
        (errorType === "invalid_request_error" && /model|parameter/.test(errorMessage))
      ) &&
      !/context.*length|context.*exceeded|token.*limit.*exceeded/.test(errorMessage);

    // Check if it's a rate limit (429) or server error (5xx)
    const isRateLimit = status === 429;
    const isServerError = status >= 500 && status < 600;

    if (shouldFallback && fallbackModel !== config.model) {
      // Retry with fallback model
      console.log(`[callLLM] Model/capability error, retrying with fallback: ${fallbackModel}`);
      attempt = await makeRequest(fallbackModel, true);
      usedFallback = true;
      actualModel = fallbackModel;
    } else if (isRateLimit && config.retryOn429) {
      // Exponential backoff for 429 (if enabled)
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempt = await makeRequest(config.model, true);
    } else if (isServerError && config.retryOn5xx) {
      // Exponential backoff for 5xx (if enabled)
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempt = await makeRequest(config.model, true);
    }
  }

  const latency = Date.now() - startTime;
  const tokens = extractTokens(attempt.json);
  const text = extractText(attempt.json);

  if (attempt.ok && !text) {
    console.error("[callLLM] 200 but no text — check response shape", {
      route: config.route,
      feature: config.feature,
      model: actualModel,
      apiType: config.apiType,
      hasChoices: !!attempt.json?.choices,
      hasOutputText: "output_text" in (attempt.json || {}),
    });
  }

  // Log the call
  await logAICall({
    route: config.route,
    feature: config.feature,
    model: actualModel,
    success: attempt.ok && !!text,
    errorCode: attempt.ok ? undefined : String(attempt.status),
    latency,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    userType,
    userIdHash,
    fallback: usedFallback,
    fallbackModel: usedFallback ? fallbackModel : undefined,
    timestamp: new Date().toISOString(),
  });

  // Handle final failure
  if (!attempt.ok || !text) {
    const errorMsg = attempt.json?.error?.message || attempt.json?.error?.code || `HTTP ${attempt.status}`;
    
    // Log detailed error for debugging
    console.error(`[callLLM] Request failed:`, {
      route: config.route,
      feature: config.feature,
      model: actualModel,
      status: attempt.status,
      error: attempt.json?.error,
      hasText: !!text,
      textLength: text?.length || 0
    });
    
    if (attempt.status === 408) {
      throw new Error('AI is busy, please try again');
    }
    
    // Provide more descriptive error messages
    if (attempt.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    
    if (attempt.status === 401 || attempt.status === 403) {
      throw new Error('Authentication error. Please check your API configuration.');
    }
    
    if (attempt.status >= 500) {
      throw new Error('AI service temporarily unavailable. Please try again in a moment.');
    }
    
    throw new Error(errorMsg || 'AI request failed');
  }

  const it = tokens.input ?? 0;
  const ot = tokens.output ?? 0;
  const cost = costUSD(actualModel, it, ot);

  recordAiUsage({
    user_id: config.userId ?? null,
    thread_id: config.threadId ?? null,
    model: actualModel,
    input_tokens: it,
    output_tokens: ot,
    cost_usd: cost,
    route: config.feature,
    prompt_preview: config.promptPreview ?? null,
    response_preview: config.responsePreview ?? (text ? text.slice(0, 1000) : null),
    model_tier: config.modelTier ?? null,
    prompt_path: config.promptPath ?? null,
    format_key: config.formatKey ?? null,
  }).catch(() => {});

  return {
    text,
    fallback: usedFallback,
    originalModel: config.model,
    actualModel,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    latency,
  };
}
