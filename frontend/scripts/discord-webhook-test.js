#!/usr/bin/env node

/**
 * Discord Webhook Test Script
 * 
 * This tests Discord webhooks for ManaTap.ai monitoring
 * Works exactly like Slack webhooks but simpler setup
 */

const https = require('https');

// Discord webhook URL format: https://discord.com/api/webhooks/ID/TOKEN
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;

function sendDiscordMessage(message, title = "ManaTap.ai Alert") {
  return new Promise((resolve, reject) => {
    if (!DISCORD_WEBHOOK_URL) {
      reject(new Error('No Discord webhook URL provided'));
      return;
    }

    // Discord webhook format (simple and reliable)
    const payload = {
      content: `🚀 **${title}**\n${message}\n\n*ManaTap.ai Monitoring System - ${new Date().toLocaleString()}*`
    };

    const data = JSON.stringify(payload);
    const url = new URL(DISCORD_WEBHOOK_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✅ Discord message sent successfully');
          resolve(responseData);
        } else {
          console.error('❌ Discord webhook failed:', res.statusCode, responseData);
          reject(new Error(`Discord webhook failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Discord webhook error:', err.message);
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// Test the Discord webhook
async function testDiscordWebhook() {
  console.log('🧪 Testing Discord webhook...');
  
  try {
    await sendDiscordMessage(
      "Test message from ManaTap.ai backup monitoring system! 🚀\n\nIf you see this, Discord alerts are working perfectly.",
      "✅ Test Alert - System Working"
    );
    
    console.log('✅ Discord webhook test successful!');
    console.log('You should see a message in your Discord channel now.');
    
  } catch (error) {
    console.error('❌ Discord webhook test failed:', error.message);
    console.error('Check your DISCORD_WEBHOOK_URL environment variable');
  }
}

// Run test if called directly
if (require.main === module) {
  testDiscordWebhook();
}

module.exports = { sendDiscordMessage };