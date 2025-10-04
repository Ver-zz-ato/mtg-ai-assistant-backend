#!/usr/bin/env node

/**
 * Local Scryfall Cache Update Script
 * Run: node scripts/update-cache.js
 */

const https = require('https');

// Configuration
const CONFIG = {
  baseUrl: process.env.MTG_BASE_URL || '',
  cronKey: process.env.MTG_CRON_KEY || '',
  batchSize: 100,
  maxRetries: 3,
  timeout: 300000 // 5 minutes
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, headers, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(timeout);
    req.end();
  });
}

async function testEndpoint() {
  log('🧪 Testing endpoint...', 'yellow');
  
  const url = `${CONFIG.baseUrl}/api/cron/bulk-scryfall`;
  const headers = {
    'x-cron-key': CONFIG.cronKey,
    'x-test-mode': 'true'
  };

  try {
    const { status, data } = await makeRequest(url, headers, 30000);
    
    if (status === 200 && data.ok) {
      log(`✅ Test successful! Database has ${data.sample_cache_entries} sample entries`, 'green');
      return true;
    } else {
      log(`❌ Test failed: ${data.error || 'Unknown error'}`, 'red');
      return false;
    }
  } catch (err) {
    log(`❌ Test failed: ${err.message}`, 'red');
    return false;
  }
}

async function streamingImport() {
  log('🌊 Starting streaming import...', 'green');
  
  const url = `${CONFIG.baseUrl}/api/cron/bulk-scryfall`;
  const headers = {
    'x-cron-key': CONFIG.cronKey,
    'x-use-streaming': 'true'
  };

  try {
    log('📦 Processing cards in streaming mode (this may take 2-5 minutes)...', 'yellow');
    const { status, data } = await makeRequest(url, headers, CONFIG.timeout);
    
    if (status === 200 && data.ok) {
      log('✅ Streaming import completed!', 'green');
      log('📊 Results:', 'cyan');
      log(`  Cards imported: ${data.imported}`, 'gray');
      log(`  Cards processed: ${data.processed}`, 'gray');
      log(`  Total cards: ${data.total_cards}`, 'gray');
      log(`  Cache count: ${data.final_cache_count}`, 'gray');
      return true;
    } else {
      log(`❌ Streaming failed: ${data.error || 'Unknown error'}`, 'red');
      return false;
    }
  } catch (err) {
    log(`❌ Streaming import failed: ${err.message}`, 'red');
    return false;
  }
}

async function chunkedImport() {
  log('🔄 Trying chunked fallback mode...', 'yellow');
  
  const url = `${CONFIG.baseUrl}/api/cron/bulk-scryfall`;
  let totalImported = 0;
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    log(`Processing page ${page}...`, 'cyan');
    
    const headers = {
      'x-cron-key': CONFIG.cronKey,
      'x-use-streaming': 'false',
      'x-chunk-start': ((page - 1) * CONFIG.batchSize).toString(),
      'x-chunk-size': CONFIG.batchSize.toString()
    };

    try {
      const { status, data } = await makeRequest(url, headers, 120000);
      
      if (status === 200 && data.ok) {
        totalImported += data.imported;
        log(`✅ Page ${page} completed: ${data.imported} imported. Total: ${totalImported}`, 'green');
        
        if (data.is_last_chunk) {
          log('🎉 All pages completed!', 'green');
          break;
        }
        
        page++;
        // Small delay to be nice to the server
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        log(`❌ Page ${page} failed: ${data.error || 'Unknown error'}`, 'red');
        break;
      }
    } catch (err) {
      log(`❌ Page ${page} error: ${err.message}`, 'red');
      break;
    }
  }

  return totalImported > 0;
}

async function promptForConfig() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  if (!CONFIG.baseUrl) {
    CONFIG.baseUrl = await question('Enter your BASE_URL (e.g., https://your-app.vercel.app): ');
  }

  if (!CONFIG.cronKey) {
    CONFIG.cronKey = await question('Enter your CRON_KEY: ');
  }

  rl.close();
}

async function main() {
  log('🔥 Starting local Scryfall cache update...', 'green');

  // Get configuration
  if (!CONFIG.baseUrl || !CONFIG.cronKey) {
    await promptForConfig();
  }

  log('📋 Configuration:', 'cyan');
  log(`  Base URL: ${CONFIG.baseUrl}`, 'gray');
  log(`  Batch Size: ${CONFIG.batchSize} cards per request`, 'gray');

  // Test endpoint
  const testPassed = await testEndpoint();
  if (!testPassed) {
    process.exit(1);
  }

  // Try streaming first, fallback to chunked
  const streamingSuccess = await streamingImport();
  if (!streamingSuccess) {
    const chunkedSuccess = await chunkedImport();
    if (!chunkedSuccess) {
      log('❌ All import methods failed', 'red');
      process.exit(1);
    }
  }

  log('🎉 Scryfall cache update completed!', 'green');
  log('💡 You can run this script anytime to update your card database.', 'cyan');
}

// Run the script
main().catch(err => {
  log(`❌ Script failed: ${err.message}`, 'red');
  process.exit(1);
});