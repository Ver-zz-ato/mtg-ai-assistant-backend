// lib/server/budgetEnforcement.ts
// Budget enforcement utilities for AI spending limits and auto-disable functionality

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BudgetLimits {
  daily_usd: number;
  weekly_usd: number;
}

export interface SpendingStatus {
  today_usd: number;
  week_usd: number;
  over_daily_limit: boolean;
  over_weekly_limit: boolean;
  daily_usage_pct: number;
  weekly_usage_pct: number;
}

/**
 * Check current AI spending against configured budget limits
 */
export async function checkBudgetStatus(supabase: SupabaseClient): Promise<SpendingStatus> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get current spending
  let todayCost = 0;
  let weekCost = 0;
  
  try {
    const { data: todayData } = await supabase
      .from('ai_usage')
      .select('cost_usd')
      .gte('created_at', todayStart.toISOString());
    
    const { data: weekData } = await supabase
      .from('ai_usage')
      .select('cost_usd')
      .gte('created_at', weekStart.toISOString());
    
    todayCost = (todayData || []).reduce((sum: number, row: any) => sum + (Number(row.cost_usd) || 0), 0);
    weekCost = (weekData || []).reduce((sum: number, row: any) => sum + (Number(row.cost_usd) || 0), 0);
  } catch (error) {
    console.error('Failed to fetch AI spending:', error);
  }

  // Get budget limits
  let limits: BudgetLimits = { daily_usd: 0, weekly_usd: 0 };
  try {
    const { data: budgetConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'llm_budget')
      .single();
    limits = budgetConfig?.value || limits;
  } catch {}

  return {
    today_usd: todayCost,
    week_usd: weekCost,
    over_daily_limit: limits.daily_usd > 0 && todayCost >= limits.daily_usd,
    over_weekly_limit: limits.weekly_usd > 0 && weekCost >= limits.weekly_usd,
    daily_usage_pct: limits.daily_usd > 0 ? Math.round((todayCost / limits.daily_usd) * 100) : 0,
    weekly_usage_pct: limits.weekly_usd > 0 ? Math.round((weekCost / limits.weekly_usd) * 100) : 0
  };
}

/**
 * Check if AI request should be blocked due to budget limits
 * Returns true if request should be allowed, false if blocked
 */
export async function allowAIRequest(supabase: SupabaseClient): Promise<{ allow: boolean; reason?: string }> {
  try {
    const status = await checkBudgetStatus(supabase);
    
    if (status.over_daily_limit) {
      return { allow: false, reason: 'Daily AI budget limit exceeded' };
    }
    
    if (status.over_weekly_limit) {
      return { allow: false, reason: 'Weekly AI budget limit exceeded' };
    }
    
    return { allow: true };
  } catch (error) {
    // Fail open - don't block requests if budget check fails
    console.error('Budget check failed:', error);
    return { allow: true };
  }
}

/**
 * Auto-disable risky features when budget limits are exceeded
 */
export async function autoDisableOnBudgetExceeded(supabase: SupabaseClient): Promise<{ disabled: boolean; reason?: string }> {
  try {
    const status = await checkBudgetStatus(supabase);
    
    if (!status.over_daily_limit && !status.over_weekly_limit) {
      return { disabled: false };
    }

    // Get current flags
    const { data: flagsConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'flags')
      .single();
    
    const currentFlags = flagsConfig?.value || {};
    
    // Only disable if risky_betas is currently enabled
    if (!currentFlags.risky_betas) {
      return { disabled: false, reason: 'Risky betas already disabled' };
    }

    // Disable risky betas
    const newFlags = { ...currentFlags, risky_betas: false };
    
    const { error } = await supabase
      .from('app_config')
      .upsert({ key: 'flags', value: newFlags }, { onConflict: 'key' });
    
    if (error) {
      console.error('Failed to auto-disable risky betas:', error);
      return { disabled: false, reason: 'Failed to update flags' };
    }

    // Log the action
    try {
      await supabase
        .from('admin_audit')
        .insert({
          actor_id: null, // system action
          action: 'budget_auto_disable',
          target: 'risky_betas',
          payload: { 
            daily_exceeded: status.over_daily_limit,
            weekly_exceeded: status.over_weekly_limit,
            daily_spend: status.today_usd,
            weekly_spend: status.week_usd
          }
        });
    } catch {} // Don't fail if audit logging fails

    return { 
      disabled: true, 
      reason: `Auto-disabled due to budget limits (daily: $${status.today_usd}, weekly: $${status.week_usd})` 
    };
  } catch (error) {
    console.error('Auto-disable failed:', error);
    return { disabled: false, reason: 'Auto-disable check failed' };
  }
}