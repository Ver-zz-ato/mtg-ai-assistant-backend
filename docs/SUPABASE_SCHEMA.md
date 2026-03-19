# Supabase / Postgres schema (public)

**Purpose:** Single source of truth for the current database schema. Used by Cursor for migrations, API code, and RLS.

**When you apply migrations:** Update this file with the new schema (e.g. export from Supabase SQL editor or Dashboard), or send the new schema to the AI and ask it to update this doc.

---

<!-- WARNING: This schema is for context only and is not meant to be run. -->
<!-- Table order and constraints may not be valid for execution. -->

```sql
CREATE TABLE public.admin_audit (
  id bigint NOT NULL DEFAULT nextval('admin_audit_id_seq'::regclass),
  created_at timestamp with time zone DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  target text,
  payload jsonb,
  CONSTRAINT admin_audit_pkey PRIMARY KEY (id)
);
CREATE TABLE public.admin_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  payload_json jsonb,
  CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_eval_set_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  eval_run_id bigint,
  eval_set_id uuid,
  pass boolean NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_eval_set_runs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_eval_set_runs_eval_run_id_fkey FOREIGN KEY (eval_run_id) REFERENCES public.eval_runs(id),
  CONSTRAINT ai_eval_set_runs_eval_set_id_fkey FOREIGN KEY (eval_set_id) REFERENCES public.ai_eval_sets(id)
);
CREATE TABLE public.ai_eval_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  type text NOT NULL DEFAULT 'mixed'::text CHECK (type = ANY (ARRAY['golden_deck'::text, 'golden_chat'::text, 'mixed'::text])),
  test_case_ids ARRAY DEFAULT '{}'::uuid[],
  strict boolean DEFAULT true,
  min_overall_score numeric DEFAULT 80,
  require_critical_violations_zero boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  max_critical_violations integer DEFAULT 0,
  max_total_violations integer DEFAULT 2,
  min_specificity_score integer DEFAULT 70,
  min_actionability_score integer DEFAULT 70,
  min_format_legality_score integer DEFAULT 90,
  require_clarifying_question_when_missing_info boolean DEFAULT false,
  require_refusal_on_illegal_request boolean DEFAULT true,
  difficulty_preset text DEFAULT 'standard'::text CHECK (difficulty_preset = ANY (ARRAY['standard'::text, 'strict'::text, 'safety_first'::text])),
  CONSTRAINT ai_eval_sets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_human_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  source text NOT NULL CHECK (source = ANY (ARRAY['production_sample'::text, 'test_case_sample'::text, 'user_report'::text, 'auto_escalation'::text])),
  route text,
  input jsonb DEFAULT '{}'::jsonb,
  output text,
  labels jsonb DEFAULT '{}'::jsonb,
  reviewer text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'reviewed'::text])),
  meta jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT ai_human_reviews_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_improvement_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  kind text NOT NULL CHECK (kind = ANY (ARRAY['chat'::text, 'deck_analysis'::text])),
  what_changed text,
  why text,
  what_improved text,
  risk text,
  meta jsonb DEFAULT '{}'::jsonb,
  prompt_version_before text,
  prompt_version_after text,
  eval_run_id bigint,
  CONSTRAINT ai_improvement_reports_pkey PRIMARY KEY (id),
  CONSTRAINT ai_improvement_reports_eval_run_id_fkey FOREIGN KEY (eval_run_id) REFERENCES public.eval_runs(id)
);
CREATE TABLE public.ai_pairwise_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  eval_run_id bigint,
  test_case_id uuid,
  prompt_a_id uuid,
  prompt_b_id uuid,
  response_a_text text,
  response_b_text text,
  judge jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  winner_by_validator text,
  winner_by_judge text,
  judge_confidence numeric,
  rubric_version text DEFAULT 'rubric_v1'::text,
  CONSTRAINT ai_pairwise_results_pkey PRIMARY KEY (id),
  CONSTRAINT ai_pairwise_results_eval_run_id_fkey FOREIGN KEY (eval_run_id) REFERENCES public.eval_runs(id),
  CONSTRAINT ai_pairwise_results_test_case_id_fkey FOREIGN KEY (test_case_id) REFERENCES public.ai_test_cases(id)
);
CREATE TABLE public.ai_private_cache (
  cache_key text NOT NULL,
  response_text text NOT NULL,
  response_meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT ai_private_cache_pkey PRIMARY KEY (cache_key)
);
CREATE TABLE public.ai_prompt_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  kind text NOT NULL CHECK (kind = ANY (ARRAY['chat'::text, 'deck_analysis'::text])),
  label text NOT NULL,
  system_prompt text NOT NULL,
  prompt_version_id uuid,
  meta jsonb DEFAULT '{}'::jsonb,
  auto_challenge_run_id bigint,
  CONSTRAINT ai_prompt_candidates_pkey PRIMARY KEY (id),
  CONSTRAINT ai_prompt_candidates_prompt_version_id_fkey FOREIGN KEY (prompt_version_id) REFERENCES public.prompt_versions(id),
  CONSTRAINT ai_prompt_candidates_auto_challenge_run_id_fkey FOREIGN KEY (auto_challenge_run_id) REFERENCES public.eval_runs(id)
);
CREATE TABLE public.ai_prompt_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  kind text NOT NULL CHECK (kind = ANY (ARRAY['chat'::text, 'deck_analysis'::text])),
  action text NOT NULL CHECK (action = ANY (ARRAY['adopt'::text, 'rollback'::text])),
  prompt_version_id uuid,
  previous_prompt_version_id uuid,
  reason text,
  test_evidence jsonb DEFAULT '{}'::jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT ai_prompt_history_pkey PRIMARY KEY (id),
  CONSTRAINT ai_prompt_history_prompt_version_id_fkey FOREIGN KEY (prompt_version_id) REFERENCES public.prompt_versions(id),
  CONSTRAINT ai_prompt_history_previous_prompt_version_id_fkey FOREIGN KEY (previous_prompt_version_id) REFERENCES public.prompt_versions(id)
);
CREATE TABLE public.ai_public_cache (
  cache_key text NOT NULL,
  response_text text NOT NULL,
  response_meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT ai_public_cache_pkey PRIMARY KEY (cache_key)
);
CREATE TABLE public.ai_response_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  thread_id text,
  message_id text,
  ai_usage_id uuid,
  issue_types ARRAY NOT NULL,
  description text,
  ai_response_text text,
  user_message_text text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'resolved'::text, 'dismissed'::text])),
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  CONSTRAINT ai_response_reports_pkey PRIMARY KEY (id),
  CONSTRAINT ai_response_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT ai_response_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.ai_suggestion_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  suggestion_id text NOT NULL,
  deck_id uuid,
  user_id uuid,
  visitor_id text,
  suggested_card text,
  replaced_card text,
  category text,
  prompt_version_id text,
  format text,
  commander text,
  accepted boolean,
  rejected boolean,
  ignored boolean,
  outcome_source text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_suggestion_outcomes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_test_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['chat'::text, 'deck_analysis'::text])),
  input jsonb NOT NULL,
  expected_checks jsonb NOT NULL,
  tags ARRAY DEFAULT '{}'::text[],
  source text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_test_cases_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_test_improvement_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid,
  source_result_ids_json jsonb DEFAULT '[]'::jsonb,
  scope text NOT NULL CHECK (scope = ANY (ARRAY['prompt'::text, 'rules'::text, 'deck-intelligence'::text, 'state'::text, 'validator'::text, 'ui'::text])),
  suggestion_text text NOT NULL,
  rationale_text text,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'implemented'::text])),
  reviewer_note text,
  created_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  CONSTRAINT ai_test_improvement_suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_test_improvement_suggestions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ai_test_runs(id)
);
CREATE TABLE public.ai_test_mutations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  base_test_case_id uuid,
  mutated_test_case_id uuid,
  mutation_type text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_test_mutations_pkey PRIMARY KEY (id),
  CONSTRAINT ai_test_mutations_base_test_case_id_fkey FOREIGN KEY (base_test_case_id) REFERENCES public.ai_test_cases(id),
  CONSTRAINT ai_test_mutations_mutated_test_case_id_fkey FOREIGN KEY (mutated_test_case_id) REFERENCES public.ai_test_cases(id)
);
CREATE TABLE public.ai_test_regressions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_run_id uuid,
  source_result_id uuid,
  title text NOT NULL,
  bug_type text,
  scenario_definition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_fix_notes text,
  severity text CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_test_regressions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_test_regressions_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES public.ai_test_runs(id),
  CONSTRAINT ai_test_regressions_source_result_id_fkey FOREIGN KEY (source_result_id) REFERENCES public.ai_test_run_results(id)
);
CREATE TABLE public.ai_test_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  test_case_id uuid,
  response_text text NOT NULL,
  prompt_used jsonb,
  validation_results jsonb,
  manual_review_status text,
  manual_review_notes text,
  created_at timestamp with time zone DEFAULT now(),
  prompt_version_id uuid,
  eval_run_id bigint,
  CONSTRAINT ai_test_results_pkey PRIMARY KEY (id),
  CONSTRAINT ai_test_results_test_case_id_fkey FOREIGN KEY (test_case_id) REFERENCES public.ai_test_cases(id),
  CONSTRAINT ai_test_results_prompt_version_id_fkey FOREIGN KEY (prompt_version_id) REFERENCES public.prompt_versions(id),
  CONSTRAINT ai_test_results_eval_run_id_fkey FOREIGN KEY (eval_run_id) REFERENCES public.eval_runs(id)
);
CREATE TABLE public.ai_test_run_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  scenario_id uuid,
  suite_key text NOT NULL,
  scenario_key text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['PASS'::text, 'WARN'::text, 'FAIL'::text, 'HARD_FAIL'::text])),
  score_json jsonb DEFAULT '{}'::jsonb,
  hard_failures_json jsonb DEFAULT '[]'::jsonb,
  soft_failures_json jsonb DEFAULT '[]'::jsonb,
  prompt_excerpt text,
  output_text text,
  validator_findings_json jsonb DEFAULT '[]'::jsonb,
  debug_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_test_run_results_pkey PRIMARY KEY (id),
  CONSTRAINT ai_test_run_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ai_test_runs(id),
  CONSTRAINT ai_test_run_results_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.ai_test_scenarios(id)
);
CREATE TABLE public.ai_test_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  suite_key text NOT NULL,
  run_mode text NOT NULL CHECK (run_mode = ANY (ARRAY['single'::text, 'filtered'::text, 'full'::text, 'regression'::text, 'scheduled'::text])),
  model_name text,
  status text NOT NULL DEFAULT 'running'::text CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])),
  total integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  warned integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  hard_failures integer NOT NULL DEFAULT 0,
  soft_failures integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  summary_json jsonb DEFAULT '{}'::jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT ai_test_runs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_test_scenarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  suite_key text NOT NULL,
  scenario_key text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  tags ARRAY DEFAULT '{}'::text[],
  scenario_definition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_test_scenarios_pkey PRIMARY KEY (id),
  CONSTRAINT ai_test_scenarios_suite_key_fkey FOREIGN KEY (suite_key) REFERENCES public.ai_test_suites(key)
);
CREATE TABLE public.ai_test_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  frequency text NOT NULL CHECK (frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'custom'::text])),
  cron_expression text,
  test_case_ids ARRAY,
  validation_options jsonb DEFAULT '{}'::jsonb,
  alert_threshold numeric DEFAULT 70,
  alert_email text,
  enabled boolean DEFAULT true,
  last_run_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  alert_webhook_url text,
  alert_on_golden_fail boolean DEFAULT true,
  alert_on_regression boolean DEFAULT true,
  CONSTRAINT ai_test_schedules_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_test_suites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key = ANY (ARRAY['v1'::text, 'v2'::text, 'v3'::text, 'v4'::text, 'v5'::text])),
  title text NOT NULL,
  description text,
  is_model_backed boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_test_suites_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_usage (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  thread_id uuid,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  persona_id text,
  teaching boolean,
  prompt_path text,
  prompt_version_id uuid,
  modules_attached_count integer,
  format_key text,
  model_tier text,
  route text,
  prompt_preview text,
  response_preview text,
  deck_size integer,
  context_source text,
  summary_tokens_estimate integer,
  deck_hash text,
  layer0_mode text,
  layer0_reason text,
  request_kind text,
  has_deck_context boolean,
  deck_card_count integer,
  used_v2_summary boolean,
  used_two_stage boolean,
  planner_model text,
  planner_tokens_in integer,
  planner_tokens_out integer,
  planner_cost_usd numeric,
  stop_sequences_enabled boolean,
  max_tokens_config integer,
  response_truncated boolean,
  user_tier text,
  is_guest boolean,
  deck_id uuid,
  latency_ms integer,
  cache_hit boolean,
  cache_kind text,
  error_code text,
  prompt_tier text,
  system_prompt_token_estimate integer,
  pricing_version text,
  cost_usd_corrected numeric,
  source_page text,
  anon_id text,
  eval_run_id bigint,
  source text,
  CONSTRAINT ai_usage_pkey PRIMARY KEY (id),
  CONSTRAINT ai_usage_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id)
);
CREATE TABLE public.api_usage_rate_limits (
  id bigint NOT NULL DEFAULT nextval('api_usage_rate_limits_id_seq'::regclass),
  key_hash text NOT NULL,
  route_path text NOT NULL,
  date date NOT NULL,
  request_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT api_usage_rate_limits_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_config (
  key text NOT NULL,
  value jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_config_pkey PRIMARY KEY (key)
);
CREATE TABLE public.banned_shoutbox_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_name text NOT NULL UNIQUE,
  banned_at timestamp with time zone DEFAULT now(),
  banned_by text,
  reason text,
  CONSTRAINT banned_shoutbox_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.budget_swap_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deck_id uuid,
  deck_name text,
  original_card text NOT NULL,
  swapped_card text NOT NULL,
  original_price numeric DEFAULT 0,
  swapped_price numeric DEFAULT 0,
  savings numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT budget_swap_analytics_pkey PRIMARY KEY (id),
  CONSTRAINT budget_swap_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT budget_swap_analytics_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id)
);
CREATE TABLE public.card_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  card_name text NOT NULL UNIQUE,
  embedding USER-DEFINED,
  oracle_text text,
  type_line text,
  color_identity ARRAY,
  format_legal ARRAY,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT card_embeddings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chat_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  embedding USER-DEFINED,
  summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT chat_embeddings_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id)
);
CREATE TABLE public.chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  thread_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id)
);
CREATE TABLE public.chat_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deck_id uuid,
  title text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  summary text,
  commander text,
  decklist_text text,
  commander_status text,
  deck_source text,
  decklist_hash text,
  deck_context_updated_at timestamp with time zone,
  deck_parse_meta jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT chat_threads_pkey PRIMARY KEY (id)
);
CREATE TABLE public.collection_card_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  card_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collection_card_tags_pkey PRIMARY KEY (id),
  CONSTRAINT collection_card_tags_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.collection_cards(id),
  CONSTRAINT collection_card_tags_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id),
  CONSTRAINT collection_card_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id)
);
CREATE TABLE public.collection_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  name text NOT NULL,
  qty integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collection_cards_pkey PRIMARY KEY (id),
  CONSTRAINT collection_cards_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id)
);
CREATE TABLE public.collection_items (
  collection_id uuid NOT NULL,
  card_name text NOT NULL,
  qty integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  id bigint NOT NULL DEFAULT nextval('collection_items_id_seq'::regclass),
  CONSTRAINT collection_items_pkey PRIMARY KEY (id),
  CONSTRAINT collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id)
);
CREATE TABLE public.collection_meta (
  collection_id uuid NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  public_slug text UNIQUE,
  currency text NOT NULL DEFAULT 'USD'::text,
  tags_enabled boolean NOT NULL DEFAULT true,
  visibility text NOT NULL DEFAULT 'private'::text,
  data jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collection_meta_pkey PRIMARY KEY (collection_id),
  CONSTRAINT collection_meta_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id)
);
CREATE TABLE public.collections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT collections_pkey PRIMARY KEY (id)
);
CREATE TABLE public.commander_aggregates (
  commander_slug text NOT NULL,
  top_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  deck_count integer NOT NULL DEFAULT 0,
  recent_decks jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  median_deck_cost numeric,
  CONSTRAINT commander_aggregates_pkey PRIMARY KEY (commander_slug)
);
CREATE TABLE public.commander_aggregates_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  commander_slug text NOT NULL,
  deck_count integer,
  top_cards jsonb,
  recent_decks jsonb,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commander_aggregates_history_pkey PRIMARY KEY (id)
);
CREATE TABLE public.custom_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  data jsonb NOT NULL,
  public_slug text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT custom_cards_pkey PRIMARY KEY (id),
  CONSTRAINT custom_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.deck_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL,
  name text NOT NULL,
  qty integer NOT NULL DEFAULT 1 CHECK (qty >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deck_cards_pkey PRIMARY KEY (id),
  CONSTRAINT deck_cards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id)
);
CREATE TABLE public.deck_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  flagged boolean DEFAULT false,
  flag_count integer DEFAULT 0,
  CONSTRAINT deck_comments_pkey PRIMARY KEY (id),
  CONSTRAINT deck_comments_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id),
  CONSTRAINT deck_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.deck_context_summary (
  deck_id uuid NOT NULL,
  deck_hash text NOT NULL,
  summary_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deck_context_summary_pkey PRIMARY KEY (deck_id, deck_hash),
  CONSTRAINT deck_context_summary_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id)
);
CREATE TABLE public.deck_costs (
  deck_id uuid NOT NULL,
  total_usd numeric NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deck_costs_pkey PRIMARY KEY (deck_id),
  CONSTRAINT deck_costs_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id)
);
CREATE TABLE public.deck_likes (
  deck_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  ip_hash text,
  CONSTRAINT deck_likes_pkey PRIMARY KEY (deck_id, user_id),
  CONSTRAINT deck_likes_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id),
  CONSTRAINT deck_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.deck_metrics_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL,
  deck_hash text,
  snapshot_date date NOT NULL,
  format text,
  commander text,
  land_count integer,
  ramp_count integer,
  removal_count integer,
  draw_count integer,
  curve_histogram jsonb,
  archetype_tags jsonb,
  synergy_diagnostics jsonb,
  deck_facts jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deck_metrics_snapshot_pkey PRIMARY KEY (id)
);
CREATE TABLE public.deck_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL,
  tag text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT deck_tags_pkey PRIMARY KEY (id),
  CONSTRAINT deck_tags_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id)
);
CREATE TABLE public.deck_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL,
  version_number integer NOT NULL,
  deck_text text NOT NULL,
  changes_summary text,
  card_count integer,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  changelog_note text,
  CONSTRAINT deck_versions_pkey PRIMARY KEY (id),
  CONSTRAINT deck_versions_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id),
  CONSTRAINT deck_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.precon_decks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  commander text NOT NULL,
  colors text[] NOT NULL DEFAULT '{}',
  format text NOT NULL DEFAULT 'Commander',
  deck_text text NOT NULL DEFAULT '',
  set_name text NOT NULL,
  release_year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb DEFAULT '{}',
  CONSTRAINT precon_decks_pkey PRIMARY KEY (id)
);
-- RLS: public read (SELECT); no INSERT/UPDATE/DELETE policies (admin uses service role)
-- Indexes: set_name, release_year, commander, colors (GIN)
-- Used by: /decks/browse Precons tab, GET /api/decks/precons, POST /api/decks/precons/import

CREATE TABLE public.decks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'Untitled Deck'::text,
  format text NOT NULL DEFAULT 'Commander'::text,
  plan text NOT NULL DEFAULT 'Optimized'::text,
  colors ARRAY NOT NULL DEFAULT '{}'::text[],
  currency text NOT NULL DEFAULT 'USD'::text,
  deck_text text NOT NULL DEFAULT ''::text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  commander text,
  data jsonb,
  meta jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  public boolean NOT NULL DEFAULT false,
  deck_aim text,
  CONSTRAINT decks_pkey PRIMARY KEY (id),
  CONSTRAINT decks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.error_logs (
  id bigint NOT NULL DEFAULT nextval('error_logs_id_seq'::regclass),
  created_at timestamp with time zone DEFAULT now(),
  kind text NOT NULL,
  message text NOT NULL,
  stack text,
  path text,
  CONSTRAINT error_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.eval_runs (
  id bigint NOT NULL DEFAULT nextval('eval_runs_id_seq'::regclass),
  created_at timestamp with time zone DEFAULT now(),
  suite text NOT NULL,
  prompts jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  meta jsonb,
  CONSTRAINT eval_runs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  rating integer,
  text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id)
);
CREATE TABLE public.guest_sessions (
  token_hash text NOT NULL,
  message_count integer DEFAULT 0,
  ip_hash text,
  user_agent_hash text,
  created_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval),
  CONSTRAINT guest_sessions_pkey PRIMARY KEY (token_hash)
);
CREATE TABLE public.knowledge_gaps (
  id bigint NOT NULL DEFAULT nextval('knowledge_gaps_id_seq'::regclass),
  created_at timestamp with time zone DEFAULT now(),
  route text NOT NULL,
  reason text NOT NULL,
  prompt text,
  details jsonb,
  CONSTRAINT knowledge_gaps_pkey PRIMARY KEY (id)
);
CREATE TABLE public.likes_audit (
  id bigint NOT NULL DEFAULT nextval('likes_audit_id_seq'::regclass),
  deck_id uuid,
  user_id uuid,
  ip_hash text,
  action text CHECK (action = ANY (ARRAY['like'::text, 'unlike'::text, 'toggle'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT likes_audit_pkey PRIMARY KEY (id),
  CONSTRAINT likes_audit_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id),
  CONSTRAINT likes_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.message_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  message_id bigint,
  embedding USER-DEFINED,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT message_embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT message_embeddings_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id),
  CONSTRAINT message_embeddings_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id)
);
CREATE TABLE public.meta_signals (
  signal_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT meta_signals_pkey PRIMARY KEY (signal_type)
);
CREATE TABLE public.meta_signals_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  signal_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT meta_signals_history_pkey PRIMARY KEY (id)
);
CREATE TABLE public.mulligan_advice_cache_admin (
  cache_key text NOT NULL,
  response_json jsonb NOT NULL,
  model_used text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  CONSTRAINT mulligan_advice_cache_admin_pkey PRIMARY KEY (cache_key)
);
CREATE TABLE public.mulligan_advice_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  source text NOT NULL,
  user_id uuid,
  deck_summary text,
  hand_summary text,
  input_json jsonb,
  output_json jsonb,
  llm_used boolean NOT NULL DEFAULT false,
  model_used text,
  cost_usd numeric,
  cached boolean NOT NULL DEFAULT false,
  effective_tier text,
  gate_action text,
  CONSTRAINT mulligan_advice_runs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ops_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  report_type text NOT NULL CHECK (report_type = ANY (ARRAY['daily_ops'::text, 'weekly_ops'::text])),
  status text NOT NULL CHECK (status = ANY (ARRAY['ok'::text, 'warn'::text, 'fail'::text])),
  summary text,
  details jsonb,
  duration_ms integer,
  error text,
  report_version text,
  git_sha text,
  run_key text UNIQUE,
  CONSTRAINT ops_reports_pkey PRIMARY KEY (id)
);
CREATE TABLE public.price_cache (
  id bigint NOT NULL DEFAULT nextval('price_cache_id_seq'::regclass),
  card_name text NOT NULL UNIQUE,
  usd_price numeric,
  usd_foil_price numeric,
  eur_price numeric,
  tix_price numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT price_cache_pkey PRIMARY KEY (id)
);
CREATE TABLE public.price_snapshots (
  snapshot_date date NOT NULL,
  name_norm text NOT NULL,
  currency text NOT NULL,
  unit numeric NOT NULL,
  source text NOT NULL DEFAULT 'Scryfall'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT price_snapshots_pkey PRIMARY KEY (snapshot_date, name_norm, currency)
);
CREATE TABLE public.pro_gate_events (
  id bigint NOT NULL DEFAULT nextval('pro_gate_events_id_seq'::regclass),
  event_type text NOT NULL,
  pro_feature text,
  gate_location text,
  source_path text,
  user_id uuid,
  visitor_id text,
  is_logged_in boolean,
  is_pro boolean,
  plan_suggested text,
  reason text,
  workflow_run_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pro_gate_events_pkey PRIMARY KEY (id),
  CONSTRAINT pro_gate_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  pro_plan text CHECK (pro_plan = ANY (ARRAY['monthly'::text, 'yearly'::text, 'manual'::text])),
  is_pro boolean DEFAULT false,
  pro_since timestamp with time zone,
  pro_until timestamp with time zone,
  is_admin boolean DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles_public (
  id uuid NOT NULL,
  username text UNIQUE,
  display_name text,
  avatar text,
  colors ARRAY,
  favorite_formats ARRAY,
  favorite_commander text,
  signature_deck_id uuid,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  badges ARRAY,
  deck_count integer,
  collection_count integer,
  messages_30d integer,
  pinned_deck_ids ARRAY,
  banner_art_url text,
  custom_card jsonb,
  pinned_badges ARRAY,
  CONSTRAINT profiles_public_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_public_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.prompt_ab_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  variant_a_id uuid NOT NULL,
  variant_b_id uuid NOT NULL,
  traffic_split numeric NOT NULL DEFAULT 0.5 CHECK (traffic_split >= 0::numeric AND traffic_split <= 1::numeric),
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  end_date timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text])),
  metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prompt_ab_tests_pkey PRIMARY KEY (id),
  CONSTRAINT prompt_ab_tests_variant_a_id_fkey FOREIGN KEY (variant_a_id) REFERENCES public.prompt_versions(id),
  CONSTRAINT prompt_ab_tests_variant_b_id_fkey FOREIGN KEY (variant_b_id) REFERENCES public.prompt_versions(id)
);
CREATE TABLE public.prompt_layer_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  layer_key text NOT NULL,
  body text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prompt_layer_versions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.prompt_layers (
  key text NOT NULL,
  body text NOT NULL DEFAULT ''::text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prompt_layers_pkey PRIMARY KEY (key)
);
CREATE TABLE public.prompt_patches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  category text,
  priority text CHECK (priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])),
  suggested_text text NOT NULL,
  rationale text,
  affected_tests ARRAY,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])),
  created_at timestamp with time zone DEFAULT now(),
  decided_at timestamp with time zone,
  CONSTRAINT prompt_patches_pkey PRIMARY KEY (id)
);
CREATE TABLE public.prompt_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version text NOT NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['chat'::text, 'deck_analysis'::text])),
  system_prompt text NOT NULL,
  meta jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prompt_versions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.request_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ts timestamp with time zone NOT NULL DEFAULT now(),
  route text NOT NULL,
  method text NOT NULL DEFAULT 'GET'::text,
  status integer NOT NULL DEFAULT 200,
  duration_ms integer NOT NULL DEFAULT 0,
  bytes_in integer,
  bytes_out integer,
  bot_flag boolean NOT NULL DEFAULT false,
  caller_type text,
  user_agent text,
  runtime text,
  region text,
  cache_status text,
  request_id text,
  ip_prefix text,
  CONSTRAINT request_metrics_pkey PRIMARY KEY (id)
);
CREATE TABLE public.roast_permalinks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  roast_text text NOT NULL,
  roast_score integer,
  commander text,
  format text,
  roast_level text,
  commander_art_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT roast_permalinks_pkey PRIMARY KEY (id),
  CONSTRAINT roast_permalinks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.scryfall_cache (
  name text NOT NULL,
  small text,
  normal text,
  art_crop text,
  updated_at timestamp with time zone DEFAULT now(),
  type_line text,
  oracle_text text,
  color_identity ARRAY,
  rarity text,
  set text,
  collector_number text,
  mana_cost text,
  cmc integer DEFAULT 0,
  legalities jsonb,
  CONSTRAINT scryfall_cache_pkey PRIMARY KEY (name)
);
CREATE TABLE public.seo_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  template text NOT NULL,
  query text NOT NULL,
  commander_slug text,
  card_name text,
  archetype_slug text,
  strategy_slug text,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'disabled'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_url text,
  quality_score integer NOT NULL DEFAULT 0,
  indexing text NOT NULL DEFAULT 'noindex'::text CHECK (indexing = ANY (ARRAY['index'::text, 'noindex'::text])),
  CONSTRAINT seo_pages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.seo_queries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  query text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric,
  position numeric,
  source text NOT NULL DEFAULT 'gsc'::text,
  date_start date,
  date_end date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT seo_queries_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shoutbox_messages (
  id bigint NOT NULL DEFAULT nextval('shoutbox_messages_id_seq'::regclass),
  user_name text NOT NULL,
  message_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_ai_generated boolean DEFAULT false,
  CONSTRAINT shoutbox_messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tags_pkey PRIMARY KEY (id),
  CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.top_cards (
  card_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  deck_count integer NOT NULL DEFAULT 0,
  commander_slugs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT top_cards_pkey PRIMARY KEY (card_name)
);
CREATE TABLE public.user_ai_examples (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query text NOT NULL,
  response text NOT NULL,
  feedback text CHECK (feedback = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text])),
  category text,
  tags ARRAY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_ai_examples_pkey PRIMARY KEY (id),
  CONSTRAINT user_ai_examples_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_chat_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  format text,
  budget text,
  colors ARRAY DEFAULT '{}'::text[],
  playstyle text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_chat_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_chat_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_prompt_variant (
  user_id uuid NOT NULL,
  test_id uuid NOT NULL,
  variant text NOT NULL CHECK (variant = ANY (ARRAY['A'::text, 'B'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_prompt_variant_pkey PRIMARY KEY (user_id, test_id),
  CONSTRAINT user_prompt_variant_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_prompt_variant_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.prompt_ab_tests(id)
);
CREATE TABLE public.watchlist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL,
  name text NOT NULL,
  target_price numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watchlist_items_pkey PRIMARY KEY (id),
  CONSTRAINT watchlist_items_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES public.watchlists(id)
);
CREATE TABLE public.watchlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Watchlist'::text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watchlists_pkey PRIMARY KEY (id),
  CONSTRAINT watchlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.wishlist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wishlist_id uuid NOT NULL,
  name text NOT NULL,
  qty integer NOT NULL DEFAULT 1 CHECK (qty >= 0),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wishlist_items_pkey PRIMARY KEY (id),
  CONSTRAINT wishlist_items_wishlist_id_fkey FOREIGN KEY (wishlist_id) REFERENCES public.wishlists(id)
);
CREATE TABLE public.wishlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT wishlists_pkey PRIMARY KEY (id),
  CONSTRAINT wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
```
