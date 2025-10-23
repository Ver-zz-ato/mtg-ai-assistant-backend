// lib/server/query-logger.ts
import { createClient } from '@/lib/supabase/server';

interface QueryLog {
  query: string;
  duration_ms: number;
  table_name?: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
  timestamp: string;
  user_id?: string;
}

const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * Log slow queries for performance monitoring
 */
export async function logSlowQuery(log: QueryLog) {
  // Only log queries over threshold
  if (log.duration_ms < SLOW_QUERY_THRESHOLD_MS) return;

  try {
    const supabase = await createClient();
    
    // Store in admin_audit table with type 'slow_query'
    await supabase.from('admin_audit').insert({
      action: 'slow_query',
      details: {
        query: log.query,
        duration_ms: log.duration_ms,
        table_name: log.table_name,
        operation: log.operation,
        threshold_ms: SLOW_QUERY_THRESHOLD_MS,
      },
      performed_by: log.user_id || null,
    });

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[SLOW QUERY] ${log.duration_ms}ms - ${log.operation} on ${log.table_name || 'unknown'}`);
    }
  } catch (error) {
    // Don't throw - logging failures shouldn't break the app
    console.error('Failed to log slow query:', error);
  }
}

/**
 * Wrapper for Supabase queries with performance tracking
 */
export async function withQueryLogging<T>(
  queryFn: () => Promise<T>,
  metadata: {
    table?: string;
    operation: QueryLog['operation'];
    userId?: string;
  }
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;
    
    // Log if slow
    if (duration >= SLOW_QUERY_THRESHOLD_MS) {
      await logSlowQuery({
        query: `${metadata.operation} on ${metadata.table || 'unknown'}`,
        duration_ms: duration,
        table_name: metadata.table,
        operation: metadata.operation,
        timestamp: new Date().toISOString(),
        user_id: metadata.userId,
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log failed queries too
    await logSlowQuery({
      query: `${metadata.operation} on ${metadata.table || 'unknown'} (FAILED)`,
      duration_ms: duration,
      table_name: metadata.table,
      operation: metadata.operation,
      timestamp: new Date().toISOString(),
      user_id: metadata.userId,
    });
    
    throw error;
  }
}

/**
 * Get slow query statistics
 */
export async function getSlowQueryStats(since: Date) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('admin_audit')
    .select('details, created_at')
    .eq('action', 'slow_query')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  // Aggregate stats
  const stats = (data || []).reduce((acc: any, row: any) => {
    const table = row.details?.table_name || 'unknown';
    if (!acc[table]) {
      acc[table] = {
        count: 0,
        total_duration: 0,
        max_duration: 0,
        avg_duration: 0,
      };
    }
    
    acc[table].count++;
    acc[table].total_duration += row.details?.duration_ms || 0;
    acc[table].max_duration = Math.max(acc[table].max_duration, row.details?.duration_ms || 0);
    acc[table].avg_duration = acc[table].total_duration / acc[table].count;
    
    return acc;
  }, {});

  return stats;
}






















