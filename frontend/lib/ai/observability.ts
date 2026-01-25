/**
 * Observability module for OpenAI API calls
 * 
 * Centralized logging for all OpenAI API interactions to enable:
 * - Debugging "Pro doesn't work sometimes" issues
 * - Cost tracking and optimization
 * - Performance monitoring
 * - Error pattern analysis
 */

import { hashString } from '@/lib/guest-tracking';

export interface AICallLog {
  route: string;           // e.g., '/api/chat'
  feature: string;        // e.g., 'chat', 'deck_analyze'
  model: string;          // e.g., 'gpt-5', 'gpt-4o-mini'
  success: boolean;
  errorCode?: string;     // e.g., '429', 'timeout', '4xx'
  latency: number;        // milliseconds
  inputTokens?: number;
  outputTokens?: number;
  userType: 'guest' | 'free' | 'pro';
  userIdHash: string;     // hashed for privacy
  fallback?: boolean;
  fallbackModel?: string;
  timestamp: string;      // ISO timestamp
}

/**
 * Log an OpenAI API call for observability
 * 
 * @param log - The log entry to record
 */
export async function logAICall(log: AICallLog): Promise<void> {
  try {
    // Always log to console in development
    if (process.env.NODE_ENV === 'development' || process.env.DISABLE_CONSOLE_LOGS !== 'true') {
      const emoji = log.success ? '✅' : '❌';
      console.log(`${emoji} [AI] ${log.feature} | ${log.model} | ${log.latency}ms | ${log.userType} | ${log.success ? 'OK' : log.errorCode || 'ERROR'}`);
      
      if (!log.success) {
        console.error(`[AI] Error details:`, {
          route: log.route,
          feature: log.feature,
          errorCode: log.errorCode,
          fallback: log.fallback,
          fallbackModel: log.fallbackModel
        });
      }
      
      if (log.inputTokens || log.outputTokens) {
        console.log(`[AI] Tokens: ${log.inputTokens || 0} in, ${log.outputTokens || 0} out`);
      }
    }

    // Optionally store in database for production analytics
    // TODO: Create ai_api_logs table and uncomment this when ready
    /*
    try {
      const { createClient } = await import('@/lib/server-supabase');
      const supabase = await createClient();
      
      await supabase.from('ai_api_logs').insert({
        route: log.route,
        feature: log.feature,
        model: log.model,
        success: log.success,
        error_code: log.errorCode,
        latency_ms: log.latency,
        input_tokens: log.inputTokens,
        output_tokens: log.outputTokens,
        user_type: log.userType,
        user_id_hash: log.userIdHash,
        fallback: log.fallback,
        fallback_model: log.fallbackModel,
        timestamp: log.timestamp
      });
    } catch (dbError) {
      // Fail silently - logging shouldn't break the app
      if (process.env.NODE_ENV === 'development') {
        console.warn('[logAICall] Failed to store in database:', dbError);
      }
    }
    */
  } catch (error) {
    // Fail silently - observability shouldn't break the app
    if (process.env.NODE_ENV === 'development') {
      console.warn('[logAICall] Failed to log:', error);
    }
  }
}

/**
 * Get user type for logging
 * 
 * @param userId - User ID (null for guests)
 * @param isPro - Whether user is Pro
 * @returns User type string
 */
export function getUserType(userId: string | null, isPro: boolean): 'guest' | 'free' | 'pro' {
  if (!userId) return 'guest';
  return isPro ? 'pro' : 'free';
}

/**
 * Hash user ID for privacy in logs
 * 
 * @param userId - User ID to hash
 * @returns Hashed user ID
 */
export async function hashUserId(userId: string | null): Promise<string> {
  if (!userId) return 'guest';
  return await hashString(userId);
}
