const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const fetch = (...args) => import('node-fetch').then(({ default: fetchImpl }) => fetchImpl(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

function getCronSecret() {
  return String(process.env.CRON_SECRET || process.env.CRON_KEY || '').trim();
}

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || '').trim();
}

function getSupabaseServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
}

function createSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error('missing_supabase_admin_config');
  }
  return createClient(url, key);
}

// Initialize Supabase Admin Client
const supabase = createSupabaseAdminClient();

// Auth middleware
function checkAuth(req, res, next) {
  const cronSecret = getCronSecret();
  const authorization = String(req.headers.authorization || '').trim();
  const legacyHeaderKey = String(req.headers['x-cron-key'] || '').trim();
  const expectedAuthorization = cronSecret ? `Bearer ${cronSecret}` : '';
  const authorizedWithBearer = !!expectedAuthorization && authorization === expectedAuthorization;
  const authorizedWithLegacyHeader = !!cronSecret && legacyHeaderKey === cronSecret;

  if (!cronSecret) {
    console.error('[bulk-jobs auth] refusing protected route: missing CRON_SECRET/CRON_KEY');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  if (!(authorizedWithBearer || authorizedWithLegacyHeader)) {
    console.warn('[bulk-jobs auth] unauthorized request', {
      path: req.path,
      timestamp: new Date().toISOString(),
      hasAuthorizationHeader: !!authorization,
      hasLegacyCronHeader: !!legacyHeaderKey,
    });
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (authorizedWithLegacyHeader && !authorizedWithBearer) {
    // Temporary compatibility: older callers may still send x-cron-key directly.
    console.warn('[bulk-jobs auth] legacy x-cron-key auth used', {
      path: req.path,
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

// Helper: must stay byte-for-byte in sync with frontend `normalizeScryfallCacheName` (scryfallCacheRow.ts).
function norm(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

// Price cache keying only. Keep aligned with frontend price route / bulk price importer.
function priceNorm(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019\u2018`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function priceNumber(value) {
  return value ? Number.parseFloat(value) : null;
}

const ADMIN_JOB_RUN_LOG_RETENTION = 12;

function adminJobDetailKey(jobId) {
  return `job:${jobId}:detail`;
}

function adminJobAttemptKey(jobId) {
  return `job:${jobId}:attempt`;
}

function adminJobLastSuccessKey(jobId) {
  const keys = {
    bulk_price_import: 'job:last:bulk_price_import',
    price_snapshot_bulk: 'job:last:price_snapshot_bulk',
  };
  return keys[jobId] || `job:last:${jobId}`;
}

function runResultFromDetail(detail) {
  return detail.runResult || (detail.ok ? 'success' : 'failed');
}

async function markWorkerJobAttempt(jobId, attemptStartedAt = new Date().toISOString()) {
  try {
    await supabase
      .from('app_config')
      .upsert(
        { key: adminJobAttemptKey(jobId), value: attemptStartedAt, updated_at: attemptStartedAt },
        { onConflict: 'key' },
      );
  } catch (error) {
    console.warn(`[admin-job] attempt mark ${jobId}:`, error.message || error);
  }
}

async function persistWorkerJobRun(jobId, detail, options = {}) {
  try {
    const updateLastSuccess = options.updateLastSuccess !== false;
    const finishedAt = detail.finishedAt || new Date().toISOString();
    const fullDetail = { ...detail, jobId, finishedAt };
    const startedMs = fullDetail.attemptStartedAt ? new Date(fullDetail.attemptStartedAt).getTime() : NaN;
    const finishedMs = new Date(finishedAt).getTime();
    const durationMs = typeof fullDetail.durationMs === 'number'
      ? fullDetail.durationMs
      : Number.isFinite(startedMs) && Number.isFinite(finishedMs)
        ? Math.max(0, Math.round(finishedMs - startedMs))
        : null;

    await supabase
      .from('app_config')
      .upsert(
        { key: adminJobDetailKey(jobId), value: JSON.stringify(fullDetail), updated_at: finishedAt },
        { onConflict: 'key' },
      );

    if (updateLastSuccess && fullDetail.ok && fullDetail.runResult !== 'failed') {
      await supabase
        .from('app_config')
        .upsert(
          { key: adminJobLastSuccessKey(jobId), value: finishedAt, updated_at: finishedAt },
          { onConflict: 'key' },
        );
    }

    const { error: insertError } = await supabase.from('admin_job_run_log').insert({
      job_name: jobId,
      started_at: fullDetail.attemptStartedAt || finishedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      run_result: runResultFromDetail(fullDetail),
      ok: fullDetail.ok,
      compact_summary: fullDetail.compactLine,
      summary_json: fullDetail,
    });
    if (insertError) {
      console.warn(`[admin-job] run log insert ${jobId}:`, insertError.message);
      return;
    }

    const { data: rows, error: selectError } = await supabase
      .from('admin_job_run_log')
      .select('id')
      .eq('job_name', jobId)
      .order('finished_at', { ascending: false });
    if (selectError || !rows || rows.length <= ADMIN_JOB_RUN_LOG_RETENTION) return;

    const idsToDelete = rows.slice(ADMIN_JOB_RUN_LOG_RETENTION).map((row) => row.id);
    if (idsToDelete.length) {
      await supabase.from('admin_job_run_log').delete().in('id', idsToDelete);
    }
  } catch (error) {
    console.warn(`[admin-job] persistWorkerJobRun ${jobId}:`, error.message || error);
  }
}

function deriveTypeFlagsFromTypeLine(typeLine) {
  const nil = {
    is_land: null,
    is_creature: null,
    is_instant: null,
    is_sorcery: null,
    is_enchantment: null,
    is_artifact: null,
    is_planeswalker: null,
  };
  if (typeLine == null || !String(typeLine).trim()) return nil;
  const tl = String(typeLine);
  const has = (w) => new RegExp(`\\b${w}\\b`, 'i').test(tl);
  return {
    is_land: has('Land'),
    is_creature: has('Creature'),
    is_instant: has('Instant'),
    is_sorcery: has('Sorcery'),
    is_enchantment: has('Enchantment'),
    is_artifact: has('Artifact'),
    is_planeswalker: has('Planeswalker'),
  };
}

/** Mirror of buildScryfallCacheRowFromApiCard — PK from top-level card.name only; keep in sync when cache schema changes. */
function buildScryfallCacheRowFromApiCard(card) {
  const raw = String(card.name ?? '').trim();
  if (!raw) {
    console.warn('[scryfall_cache] bulk-jobs skip: empty top-level card.name', {
      set: card.set,
      collector_number: card.collector_number,
    });
    return null;
  }
  const nameKey = norm(raw);
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  const front = faces[0] || {};
  const imageUris = card.image_uris || {};
  const faceUris = front.image_uris || {};
  const img = {
    small: imageUris.small || faceUris.small || null,
    normal: imageUris.normal || faceUris.normal || null,
    art_crop: imageUris.art_crop || faceUris.art_crop || null,
  };
  const oracleRaw = card.oracle_text != null ? card.oracle_text : front.oracle_text;
  const oracle_text = oracleRaw != null && String(oracleRaw).trim() !== '' ? String(oracleRaw).trim() : null;
  const manaCostRaw = card.mana_cost != null ? card.mana_cost : front.mana_cost;
  const mana_cost = manaCostRaw != null && String(manaCostRaw).trim() !== '' ? String(manaCostRaw).trim() : null;
  const cmcRaw = card.cmc != null ? card.cmc : card.mana_value;
  const cmc = typeof cmcRaw === 'number' ? Math.round(cmcRaw) : 0;
  const typeLineRaw = card.type_line != null ? String(card.type_line).trim() : '';
  const type_line = typeLineRaw !== '' ? typeLineRaw : null;
  const color_identity = Array.isArray(card.color_identity) ? card.color_identity : [];
  const colors = Array.isArray(card.colors) ? card.colors : null;
  const keywords = Array.isArray(card.keywords) ? card.keywords : null;
  const power = card.power != null && String(card.power).trim() !== ''
    ? String(card.power)
    : (front.power != null && String(front.power).trim() !== '' ? String(front.power) : null);
  const toughness = card.toughness != null && String(card.toughness).trim() !== ''
    ? String(card.toughness)
    : (front.toughness != null && String(front.toughness).trim() !== '' ? String(front.toughness) : null);
  const loyalty = card.loyalty != null && String(card.loyalty).trim() !== ''
    ? String(card.loyalty)
    : (front.loyalty != null && String(front.loyalty).trim() !== '' ? String(front.loyalty) : null);
  const flags = deriveTypeFlagsFromTypeLine(type_line);
  const rarity = card.rarity ? String(card.rarity).toLowerCase().trim() : null;
  const set = card.set ? String(card.set).toUpperCase().trim() : null;
  const collector_number = card.collector_number != null && String(card.collector_number).trim() !== ''
    ? String(card.collector_number).trim()
    : null;
  let legalities = null;
  if (card.legalities && typeof card.legalities === 'object' && !Array.isArray(card.legalities)) {
    const keys = Object.keys(card.legalities);
    if (keys.length) legalities = card.legalities;
  }
  return {
    name: nameKey,
    name_norm: nameKey,
    small: img.small,
    normal: img.normal,
    art_crop: img.art_crop,
    type_line,
    oracle_text,
    color_identity,
    colors,
    keywords,
    power,
    toughness,
    loyalty,
    ...flags,
    cmc,
    mana_cost,
    rarity,
    set,
    collector_number,
    legalities,
    updated_at: new Date().toISOString(),
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'bulk-jobs-server', timestamp: new Date().toISOString() });
});

// 1. BULK SCRYFALL IMPORT
app.post('/bulk-scryfall', checkAuth, async (req, res) => {
  console.log('Bulk Scryfall import started');

  try {
    // Return 202 Accepted immediately
    res.status(202).json({
      ok: true,
      message: 'Bulk Scryfall import started',
      note: 'Job running in background, will take 3-10 minutes',
    });

    // Run job in background
    void runBulkScryfallImport();
  } catch (error) {
    console.error('Bulk Scryfall import failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
});

async function runBulkScryfallImport() {
  try {
    console.log('Starting bulk Scryfall import...');

    // Get Scryfall bulk data URL
    const bulkDataResp = await fetch('https://api.scryfall.com/bulk-data');
    const bulkData = await bulkDataResp.json();
    const defaultCardsEntry = bulkData.data.find((d) => d.type === 'default_cards');

    if (!defaultCardsEntry) {
      throw new Error('Could not find default_cards bulk data');
    }

    console.log('Downloading bulk data from:', defaultCardsEntry.download_uri);
    console.log('Memory optimization: Processing in small batches to fit 512MB limit');

    // Fetch data but process in chunks to avoid memory overflow
    const cardsResp = await fetch(defaultCardsEntry.download_uri);
    const cards = await cardsResp.json();

    console.log(`Processing ${cards.length} cards in memory-efficient batches...`);

    // Process in SMALLER batches of 500 and clear memory aggressively
    const batchSize = 500;
    let processed = 0;

    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize);
      const rows = batch.map((card) => buildScryfallCacheRowFromApiCard(card)).filter(Boolean);
      if (!rows.length) continue;

      const { error } = await supabase.from('scryfall_cache').upsert(rows, {
        onConflict: 'name',
        ignoreDuplicates: false,
      });

      if (error) {
        console.error(`Error in batch ${i}-${i + batchSize}:`, error);
      } else {
        processed += rows.length;
        if (processed % 5000 === 0 || processed === cards.length) {
          console.log(`Processed ${processed}/${cards.length} cards (${Math.round((processed / cards.length) * 100)}%)`);
        }
      }

      // Force garbage collection hint every 10 batches
      if (i % (batchSize * 10) === 0) {
        if (global.gc) global.gc();
      }
    }

    console.log(`Bulk Scryfall import completed! Processed ${processed} cards`);
  } catch (error) {
    console.error('Bulk Scryfall import failed:', error);
  }
}

// 2. BULK PRICE IMPORT
app.post('/bulk-price-import', checkAuth, async (req, res) => {
  console.log('Bulk price import started');

  try {
    res.status(202).json({
      ok: true,
      message: 'Bulk price import started',
      note: 'Job running in background, will take 3-5 minutes',
    });

    void runBulkPriceImport();
  } catch (error) {
    console.error('Bulk price import failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
});

async function runBulkPriceImport() {
  const JOB_ID = 'bulk_price_import';
  const attemptStartedAt = new Date().toISOString();
  const startedAt = new Date(attemptStartedAt);
  await markWorkerJobAttempt(JOB_ID, attemptStartedAt);

  try {
    console.log('Starting full streaming bulk price import...');
    console.log('This streams Scryfall default_cards and upserts price_cache rows for all cached cards');

    const cachedCardNames = new Set();
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from('scryfall_cache')
        .select('name')
        .order('name')
        .range(offset, offset + PAGE_SIZE - 1);
      if (pageError) {
        throw new Error(`Failed to fetch cached cards: ${pageError.message}`);
      }
      if (!page || page.length === 0) break;
      for (const row of page) {
        cachedCardNames.add(priceNorm(row.name));
      }
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      if (offset % 10000 === 0) {
        console.log(`Loaded ${offset} cached card names so far...`);
      }
    }

    if (cachedCardNames.size === 0) {
      console.log('No cached cards found to update prices for');
      const finishedAt = new Date().toISOString();
      await persistWorkerJobRun(JOB_ID, {
        jobId: JOB_ID,
        attemptStartedAt,
        finishedAt,
        ok: true,
        runResult: 'success',
        compactLine: 'No cached cards found to update prices for',
        destination: 'price_cache',
        source: 'Scryfall default_cards bulk',
        durationMs: Math.max(0, new Date(finishedAt) - startedAt),
        counts: {
          cached_cards_total: 0,
          price_rows_upserted: 0,
          unique_cards_with_prices: 0,
        },
        labels: {
          schedule: 'Daily 02:00 UTC via GitHub Actions',
        },
      });
      return;
    }
    console.log(`Found ${cachedCardNames.size} cached cards to update prices for`);

    const bulkResponse = await fetch('https://api.scryfall.com/bulk-data', {
      headers: { 'User-Agent': 'ManaTap-BulkJobs/1.0' },
    });
    if (!bulkResponse.ok) {
      throw new Error(`Failed to fetch bulk data info: ${bulkResponse.status} ${bulkResponse.statusText}`);
    }
    const bulkData = await bulkResponse.json();
    const defaultCardsInfo = bulkData.data.find((item) => item.type === 'default_cards');
    if (!defaultCardsInfo) {
      throw new Error('Could not find default_cards bulk data');
    }

    const fileSize = Math.round(defaultCardsInfo.size / 1024 / 1024);
    console.log(`Downloading and streaming default_cards bulk data (${fileSize}MB, updated ${defaultCardsInfo.updated_at})`);
    const cardsResponse = await fetch(defaultCardsInfo.download_uri, {
      headers: { 'User-Agent': 'ManaTap-BulkJobs/1.0' },
    });
    if (!cardsResponse.ok) {
      throw new Error(`Failed to download bulk data: ${cardsResponse.status} ${cardsResponse.statusText}`);
    }

    const priceMap = new Map();
    let processed = 0;
    let found = 0;
    const stream = chain([cardsResponse.body, parser(), streamArray()]);

    for await (const { value: card } of stream) {
      processed++;
      if (!card?.name || !card.prices) continue;

      const cardName = priceNorm(card.name);
      if (!cachedCardNames.has(cardName)) continue;

      found++;
      priceMap.set(cardName, {
        card_name: cardName,
        usd_price: priceNumber(card.prices.usd),
        usd_foil_price: priceNumber(card.prices.usd_foil),
        eur_price: priceNumber(card.prices.eur),
        tix_price: priceNumber(card.prices.tix),
        updated_at: new Date().toISOString(),
      });

      if (processed % 25000 === 0) {
        console.log(`Processed ${processed} cards, ${found} matches, ${priceMap.size} unique price rows`);
      }
    }

    console.log(`Bulk stream complete: ${processed} cards processed, ${found} price matches, ${priceMap.size} unique cards`);

    const BATCH_SIZE = 1000;
    let updated = 0;
    const rows = Array.from(priceMap.values());
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from('price_cache')
        .upsert(batch, { onConflict: 'card_name' });
      if (upsertError) {
        throw new Error(`Failed to upsert price batch ${i}-${i + batch.length}: ${upsertError.message}`);
      }
      updated += batch.length;
      if (updated % 10000 < batch.length || updated === batch.length) {
        console.log(`Upserted ${updated}/${rows.length} price rows`);
      }
    }

    const finishedAt = new Date();
    const coveragePct = cachedCardNames.size ? Math.round((rows.length / cachedCardNames.size) * 1000) / 10 : 0;
    await persistWorkerJobRun(JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt: finishedAt.toISOString(),
      ok: true,
      runResult: 'success',
      compactLine: `Updated ${updated} price_cache rows, ${rows.length} unique cards, ${coveragePct}% coverage`,
      destination: 'price_cache',
      source: `Scryfall default_cards bulk (${fileSize}MB, updated ${defaultCardsInfo.updated_at})`,
      durationMs: Math.max(0, finishedAt - startedAt),
      counts: {
        price_rows_upserted: updated,
        unique_cards_with_prices: rows.length,
        cached_cards_total: cachedCardNames.size,
        bulk_cards_processed: processed,
        price_matches_in_bulk: found,
        coverage_pct_x10: Math.round(coveragePct * 10),
      },
      labels: {
        schedule: 'Daily 02:00 UTC via GitHub Actions',
        currencies: 'USD, USD foil, EUR, TIX',
      },
      extra: {
        source_bulk_updated_at: defaultCardsInfo.updated_at,
        source_bulk_size_mb: fileSize,
        coverage_pct: coveragePct,
      },
    });
    console.log('Updated admin job telemetry in app_config and admin_job_run_log');

    try {
      const { error: auditError } = await supabase
        .from('admin_audit')
        .insert({
          actor_id: 'cron',
          action: 'bulk_price_import',
          target: updated,
        });
      if (auditError) {
        console.warn('Failed to write admin_audit row:', auditError.message);
      } else {
        console.log('Wrote admin_audit row');
      }
    } catch (auditErr) {
      console.warn('Error writing admin_audit row:', auditErr.message);
    }

    console.log(
      `Full price import completed in ${Math.round((finishedAt - startedAt) / 1000)}s: ` +
        `${updated} rows, ${Math.round((rows.length / cachedCardNames.size) * 100)}% coverage`,
    );
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const finishedAt = new Date().toISOString();
    await persistWorkerJobRun(JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: false,
      runResult: 'failed',
      compactLine: `Failed: ${message.slice(0, 180)}`,
      destination: 'price_cache',
      source: 'Scryfall default_cards bulk',
      durationMs: Math.max(0, new Date(finishedAt) - startedAt),
      lastError: message,
    }, { updateLastSuccess: false });
    console.error('Price import failed:', error);
    throw error;
  }
}

// 3. PRICE SNAPSHOT BULK
app.post('/price-snapshot', checkAuth, async (req, res) => {
  console.log('Price snapshot started');

  try {
    res.status(202).json({
      ok: true,
      message: 'Price snapshot started',
      note: 'Job running in background, will take 5-10 minutes',
    });

    void runPriceSnapshot();
  } catch (error) {
    console.error('Price snapshot failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
});

async function runPriceSnapshot() {
  const JOB_ID = 'price_snapshot_bulk';
  const attemptStartedAt = new Date().toISOString();
  const startedAt = new Date(attemptStartedAt);
  await markWorkerJobAttempt(JOB_ID, attemptStartedAt);

  try {
    console.log('Starting lightweight price snapshot...');
    console.log('This uses existing price_cache data (no bulk download)');

    const today = new Date().toISOString().split('T')[0];

    // Get all cards with prices from price_cache (using bulk import schema).
    // IMPORTANT: paginate explicitly so we do not silently cap at ~1000 rows.
    const cards = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (true) {
      const { data: page, error: fetchError } = await supabase
        .from('price_cache')
        .select('card_name, usd_price, eur_price')
        .or('usd_price.not.is.null,eur_price.not.is.null')
        .order('card_name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (fetchError) {
        throw new Error(`Failed to fetch prices: ${fetchError.message}`);
      }
      if (!page || page.length === 0) break;
      cards.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      if (offset % 10000 === 0) {
        console.log(`Loaded ${offset} price_cache rows for snapshot so far...`);
      }
    }

    console.log(`Creating snapshots for ${cards.length} cards with at least one price (USD or EUR)...`);
    console.log(`This will create price history for every priced card in price_cache`);

    // Fetch FX for GBP conversion
    let usdGbp = 0.78;
    try {
      const fxRes = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=GBP', { cache: 'no-store' });
      const fxData = await fxRes.json();
      usdGbp = Number(fxData?.rates?.GBP || 0.78);
      console.log(`USD to GBP rate: ${usdGbp}`);
    } catch {
      console.warn('Could not fetch GBP exchange rate, using default 0.78');
    }

    // Create snapshot rows in price_snapshots format:
    // Each card gets 3 rows (USD, EUR, GBP) for complete price history
    const snapshots = [];
    for (const card of cards) {
      if (card.usd_price) {
        snapshots.push({
          snapshot_date: today,
          name_norm: card.card_name,
          currency: 'USD',
          unit: parseFloat(card.usd_price),
          source: 'PriceCache',
        });
        // Also create GBP snapshot from USD (converted)
        snapshots.push({
          snapshot_date: today,
          name_norm: card.card_name,
          currency: 'GBP',
          unit: parseFloat((parseFloat(card.usd_price) * usdGbp).toFixed(2)),
          source: 'PriceCache',
        });
      }
      if (card.eur_price) {
        snapshots.push({
          snapshot_date: today,
          name_norm: card.card_name,
          currency: 'EUR',
          unit: parseFloat(card.eur_price),
          source: 'PriceCache',
        });
      }
    }

    console.log(`Generated ${snapshots.length} snapshot rows (USD+EUR+GBP for all ${cards.length} cards)`);

    // Insert in batches
    const batchSize = 1000;
    let processed = 0;

    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);

      const { error } = await supabase.from('price_snapshots').upsert(batch, {
        onConflict: 'snapshot_date,name_norm,currency',
        ignoreDuplicates: true,
      });

      if (error) {
        console.error(`Error in batch ${i}-${i + batchSize}:`, error.message);
      } else {
        processed += batch.length;
        console.log(`Inserted ${processed}/${snapshots.length} snapshots (${Math.round((processed / snapshots.length) * 100)}%)`);
      }
    }

    console.log(`Price snapshot completed! Inserted ${processed} snapshots for ${today}`);

    const finishedAt = new Date().toISOString();
    await persistWorkerJobRun(JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: 'success',
      compactLine: `Inserted ${processed} price snapshot rows for ${cards.length} cards on ${today}`,
      destination: 'price_snapshots',
      source: 'price_cache',
      durationMs: Math.max(0, new Date(finishedAt) - startedAt),
      counts: {
        cards_with_price: cards.length,
        snapshot_rows_generated: snapshots.length,
        snapshot_rows_upserted: processed,
      },
      labels: {
        schedule: 'Daily 02:00 UTC via Vercel cron delegated to Render',
        currencies: 'USD, EUR, GBP',
      },
      extra: {
        snapshot_date: today,
        usd_gbp_rate: usdGbp,
      },
    });
    console.log('Updated admin job telemetry in app_config and admin_job_run_log');
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const finishedAt = new Date().toISOString();
    await persistWorkerJobRun(JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: false,
      runResult: 'failed',
      compactLine: `Failed: ${message.slice(0, 180)}`,
      destination: 'price_snapshots',
      source: 'price_cache',
      durationMs: Math.max(0, new Date(finishedAt) - startedAt),
      lastError: message,
    }, { updateLastSuccess: false });
    console.error('Price snapshot failed:', error);
    throw error;
  }
}

console.log('Bulk Jobs Server configuration', {
  supabaseUrlConfigured: !!getSupabaseUrl(),
  supabaseServiceRoleConfigured: !!getSupabaseServiceRoleKey(),
  cronSecretConfigured: !!getCronSecret(),
});

// Start server
app.listen(PORT, () => {
  console.log(`Bulk Jobs Server running on port ${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /bulk-scryfall');
  console.log('  POST /bulk-price-import');
  console.log('  POST /price-snapshot');
});
