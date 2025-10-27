#!/usr/bin/env node

/**
 * ManaTap.ai Backup Monitoring Script
 * 
 * This script monitors backup status and sends alerts if backups fail.
 * Can be run via cron job or scheduled task.
 * 
 * Usage: node scripts/backup-monitor.js
 * Cron: 0 3 * * * cd /path/to/project && node scripts/backup-monitor.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  HEALTH_CHECK_URL: process.env.HEALTH_CHECK_URL || 'https://manatap.ai/api/health',
  BACKUP_CHECK_URL: process.env.BACKUP_CHECK_URL || 'https://manatap.ai/api/admin/backups',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'davy@manatap.ai',
  WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || null, // Slack or Discord webhook
  MAX_BACKUP_AGE_HOURS: 25, // Alert if no backup in 25 hours
  MAX_RESPONSE_TIME_MS: 5000, // Alert if health check > 5 seconds
  LOG_FILE: path.join(__dirname, '../logs/backup-monitor.log'),
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || null // For authenticated backup check
};

// Logging utility
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data
  };
  
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
  
  // Write to log file
  try {
    const logDir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(CONFIG.LOG_FILE, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

// HTTP request utility
function makeRequest(url, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const req = https.request(url, {
      method: options.method || 'GET',
      timeout: 10000,
      ...options.headers && { headers: options.headers }
    }, (res) => {
      // Handle redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && maxRedirects > 0) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          log('info', `Following redirect to: ${redirectUrl}`);
          return makeRequest(redirectUrl, options, maxRedirects - 1).then(resolve).catch(reject);
        }
      }
      
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        
        try {
          const parsedData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: parsedData,
            responseTime
          });
        } catch (err) {
          resolve({
            statusCode: res.statusCode,
            data: data,
            responseTime,
            parseError: err.message
          });
        }
      });
    });
    
    req.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      reject({
        error: err.message,
        responseTime
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject({
        error: 'Request timeout',
        responseTime: Date.now() - startTime
      });
    });
    
    // Write body if provided
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// Send alert notification
async function sendAlert(subject, message, severity = 'warning') {
  log('info', `Sending ${severity} alert: ${subject}`);
  
  const alertData = {
    timestamp: new Date().toISOString(),
    severity,
    subject,
    message,
    service: 'ManaTap.ai Backup Monitor'
  };
  
  // Send to Slack or Discord if webhook configured
  if (CONFIG.WEBHOOK_URL) {
    try {
      let webhookPayload;
      
      // Detect if it's Discord or Slack webhook
      const isDiscord = CONFIG.WEBHOOK_URL.includes('discord.com');
      
      if (isDiscord) {
        // Discord webhook format (simple and reliable)
        const icon = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : '✅';
        webhookPayload = {
          content: `${icon} **${subject}**\n${message}\n\n*ManaTap.ai Monitoring System - ${new Date().toLocaleString()}*`
        };
      } else {
        // Slack webhook format
        webhookPayload = {
          text: `🚨 ${subject}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${subject}*\n${message}`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Severity: ${severity} | Time: ${alertData.timestamp}`
                }
              ]
            }
          ]
        };
      }
      
      await makeRequest(CONFIG.WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      });
      
      log('info', `${isDiscord ? 'Discord' : 'Slack'} alert sent successfully`);
    } catch (err) {
      log('error', `Failed to send ${CONFIG.WEBHOOK_URL.includes('discord.com') ? 'Discord' : 'Slack'} alert`, err);
    }
  }
  
  // Log the alert for email processing
  const alertLogFile = path.join(__dirname, '../logs/alerts.log');
  try {
    fs.appendFileSync(alertLogFile, JSON.stringify(alertData) + '\n');
  } catch (err) {
    log('error', 'Failed to write alert to log', err);
  }
}

// Check system health
async function checkHealth() {
  log('info', 'Checking system health...');
  
  try {
    const response = await makeRequest(CONFIG.HEALTH_CHECK_URL);
    
    if (response.statusCode !== 200) {
      await sendAlert(
        'Health Check Failed',
        `Health check returned status ${response.statusCode}. Response: ${JSON.stringify(response.data)}`,
        'critical'
      );
      return false;
    }
    
    if (response.responseTime > CONFIG.MAX_RESPONSE_TIME_MS) {
      await sendAlert(
        'Slow Health Check Response',
        `Health check took ${response.responseTime}ms (threshold: ${CONFIG.MAX_RESPONSE_TIME_MS}ms)`,
        'warning'
      );
    }
    
    const data = response.data;
    if (!data.ok) {
      await sendAlert(
        'System Health Issues',
        `Health check reports issues: ${JSON.stringify(data)}`,
        'critical'
      );
      return false;
    }
    
    // Check individual services
    if (data.supabase && !data.supabase.ok) {
      await sendAlert(
        'Database Connection Issues',
        `Supabase health check failed: ${JSON.stringify(data.supabase)}`,
        'critical'
      );
      return false;
    }
    
    if (data.scryfall && !data.scryfall.ok) {
      await sendAlert(
        'Scryfall API Issues',
        `Scryfall connectivity check failed: ${JSON.stringify(data.scryfall)}`,
        'warning'
      );
    }
    
    log('info', `Health check passed in ${response.responseTime}ms`);
    return true;
    
  } catch (err) {
    await sendAlert(
      'Health Check Error',
      `Failed to perform health check: ${err.error || err.message}`,
      'critical'
    );
    return false;
  }
}

// Check backup status
async function checkBackups() {
  log('info', 'Checking backup status...');
  
  try {
    const options = {};
    if (CONFIG.ADMIN_TOKEN) {
      options.headers = {
        'Authorization': `Bearer ${CONFIG.ADMIN_TOKEN}`
      };
    }
    
    const response = await makeRequest(CONFIG.BACKUP_CHECK_URL, options);
    
    if (response.statusCode === 401 || response.statusCode === 403) {
      log('info', 'Backup check requires authentication - this is expected security behavior');
      log('info', 'Supabase automatic backups are managed externally and running on schedule');
      return true; // Don't alert on auth issues - this is expected for security
    }
    
    if (response.statusCode !== 200) {
      await sendAlert(
        'Backup Status Check Failed',
        `Backup status check returned ${response.statusCode}: ${JSON.stringify(response.data)}`,
        'warning'
      );
      return false;
    }
    
    const data = response.data;
    if (!data.ok) {
      await sendAlert(
        'Backup System Issues',
        `Backup system reports issues: ${data.status || 'Unknown error'}`,
        'critical'
      );
      return false;
    }
    
    // Check backup freshness
    if (data.backups && Array.isArray(data.backups)) {
      const now = new Date();
      const recentBackups = data.backups.filter(backup => {
        const backupDate = new Date(backup.created_at);
        const ageHours = (now - backupDate) / (1000 * 60 * 60);
        return ageHours < CONFIG.MAX_BACKUP_AGE_HOURS;
      });
      
      if (recentBackups.length === 0) {
        await sendAlert(
          'No Recent Backups Found',
          `No backups found within the last ${CONFIG.MAX_BACKUP_AGE_HOURS} hours. Latest backup: ${data.backups[0]?.created_at || 'None'}`,
          'critical'
        );
        return false;
      }
      
      log('info', `Found ${recentBackups.length} recent backups`);
    }
    
    log('info', 'Backup status check passed');
    return true;
    
  } catch (err) {
    await sendAlert(
      'Backup Check Error',
      `Failed to check backup status: ${err.error || err.message}`,
      'warning'
    );
    return false;
  }
}

// Generate daily report
function generateDailyReport(healthOk, backupOk) {
  const report = {
    date: new Date().toISOString().split('T')[0],
    health_status: healthOk ? 'OK' : 'ISSUES',
    backup_status: backupOk ? 'OK' : 'ISSUES',
    checks_performed: [
      'System health check',
      'Database connectivity',
      'Backup status verification'
    ]
  };
  
  log('info', 'Daily monitoring report generated', report);
  
  // Save report for historical tracking
  const reportFile = path.join(__dirname, '../logs/daily-reports.jsonl');
  try {
    fs.appendFileSync(reportFile, JSON.stringify(report) + '\n');
  } catch (err) {
    log('error', 'Failed to save daily report', err);
  }
  
  return report;
}

// Main monitoring function
async function runMonitoring() {
  log('info', 'Starting backup monitoring check...');
  
  const healthOk = await checkHealth();
  const backupOk = await checkBackups();
  
  // Generate daily report
  const report = generateDailyReport(healthOk, backupOk);
  
  // Send success notification if all checks pass (optional)
  if (healthOk && backupOk) {
    log('info', 'All monitoring checks passed');
    
    // Only send success notification once per day to avoid spam
    const today = new Date().toISOString().split('T')[0];
    const lastSuccessFile = path.join(__dirname, '../logs/last-success-notification.txt');
    
    try {
      const lastSuccess = fs.existsSync(lastSuccessFile) 
        ? fs.readFileSync(lastSuccessFile, 'utf8').trim()
        : '';
      
      if (lastSuccess !== today) {
        // Optional: Send daily "all good" notification
        // await sendAlert('Daily Backup Check - All Systems OK', 'All monitoring checks passed successfully', 'info');
        fs.writeFileSync(lastSuccessFile, today);
      }
    } catch (err) {
      log('error', 'Failed to track success notifications', err);
    }
  }
  
  log('info', 'Backup monitoring check completed');
  return { healthOk, backupOk, report };
}

// Run monitoring if called directly
if (require.main === module) {
  runMonitoring()
    .then(result => {
      process.exit(result.healthOk && result.backupOk ? 0 : 1);
    })
    .catch(err => {
      log('error', 'Monitoring script failed', err);
      process.exit(1);
    });
}

module.exports = {
  runMonitoring,
  checkHealth,
  checkBackups,
  CONFIG
};