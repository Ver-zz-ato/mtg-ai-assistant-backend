#!/usr/bin/env node

// Simple script to test if we can manually trigger the cache prewarm job
// This can help debug cache issues

const https = require('https');
const http = require('http');

async function testPrewarmJob() {
  console.log('🔄 Testing manual cache prewarm...');
  
  // Try to call the prewarm endpoint (this would normally require auth)
  // In a real scenario, you'd need to set proper headers or run from admin context
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/cron/prewarm-scryfall',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-key': process.env.CRON_KEY || 'test-key'
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('✅ Prewarm job response:', result);
          resolve(result);
        } catch (e) {
          console.log('📄 Raw response:', data);
          resolve({ raw: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error calling prewarm job:', error.message);
      reject(error);
    });

    req.end();
  });
}

async function checkDatabase() {
  console.log('📊 Note: To check database cache status, visit:');
  console.log('   http://localhost:3000/debug/profile-data');
  console.log('');
  console.log('🔧 To manually run prewarm from authenticated admin session:');
  console.log('   - Login as admin user');
  console.log('   - Navigate to /debug/profile-data');
  console.log('   - Click "Refresh Cache Now" button');
}

async function main() {
  console.log('🚀 MTG Cache Diagnostic Tool\n');
  
  try {
    await testPrewarmJob();
  } catch (error) {
    console.log('ℹ️  Manual API call failed (expected if auth required)');
  }
  
  await checkDatabase();
  
  console.log('\n📋 Summary:');
  console.log('1. Check /debug/profile-data for current cache status');
  console.log('2. Use "Refresh Cache Now" button to manually populate cache');
  console.log('3. Verify GitHub Actions are running scheduled jobs');
  console.log('4. Check if environment has proper CRON_KEY configured');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testPrewarmJob, checkDatabase };