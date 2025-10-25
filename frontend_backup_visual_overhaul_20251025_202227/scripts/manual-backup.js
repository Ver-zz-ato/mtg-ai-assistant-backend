#!/usr/bin/env node

/**
 * Manual Database Backup Script for Supabase Free Tier
 * 
 * Since Supabase free tier doesn't include automatic backups,
 * this script creates manual SQL dumps of your database.
 * 
 * Usage: node scripts/manual-backup.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  BACKUP_DIR: path.join(__dirname, '../backups'),
  MAX_BACKUPS: 7, // Keep last 7 backups (1 week)
  COMPRESS: true
};

// Extract project details from Supabase URL
function getProjectDetails() {
  if (!CONFIG.SUPABASE_URL) {
    throw new Error('SUPABASE_URL not found in environment');
  }
  
  const url = new URL(CONFIG.SUPABASE_URL);
  const projectId = url.hostname.split('.')[0];
  
  return {
    projectId,
    host: url.hostname,
    // For free tier, we'll export data via API instead of pg_dump
    apiUrl: CONFIG.SUPABASE_URL
  };
}

// Log with timestamp
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

// Create backup directory
function ensureBackupDirectory() {
  if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
    fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true });
    log('Created backup directory:', CONFIG.BACKUP_DIR);
  }
}

// Get list of tables to backup
async function getTableList() {
  const tables = [
    'users',
    'decks', 
    'deck_cards',
    'collections',
    'collection_cards',
    'chat_threads',
    'chat_messages',
    'custom_cards',
    'wishlists',
    'wishlist_items',
    'profiles',
    'app_config',
    'admin_audit'
  ];
  
  log(`Will backup ${tables.length} tables:`, tables);
  return tables;
}

// Export table data as JSON
async function exportTableData(tableName) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    if (!CONFIG.SUPABASE_SERVICE_KEY) {
      log(`Warning: No service key found, using anon key for ${tableName}`);
      // Use anon key as fallback (limited access)
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!anonKey) {
        throw new Error('No Supabase keys available');
      }
    }
    
    const supabase = createClient(
      CONFIG.SUPABASE_URL, 
      CONFIG.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    // Get all data from table
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' });
    
    if (error) {
      log(`Warning: Could not backup table ${tableName}:`, error.message);
      return { tableName, rows: 0, error: error.message };
    }
    
    log(`✅ Exported ${count || 0} rows from ${tableName}`);
    return { tableName, data: data || [], rows: count || 0 };
    
  } catch (err) {
    log(`Error backing up table ${tableName}:`, err.message);
    return { tableName, rows: 0, error: err.message };
  }
}

// Create backup file
async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `manatap-backup-${timestamp}.json`;
  const backupPath = path.join(CONFIG.BACKUP_DIR, backupFileName);
  
  log('Starting database backup...');
  
  const tables = await getTableList();
  const backup = {
    metadata: {
      created_at: new Date().toISOString(),
      supabase_url: CONFIG.SUPABASE_URL,
      tables_count: tables.length,
      backup_type: 'manual_json_export',
      version: '1.0'
    },
    tables: {}
  };
  
  // Export each table
  for (const tableName of tables) {
    log(`Exporting table: ${tableName}...`);
    const tableData = await exportTableData(tableName);
    backup.tables[tableName] = tableData;
  }
  
  // Calculate backup size and summary
  const totalRows = Object.values(backup.tables).reduce((sum, table) => sum + (table.rows || 0), 0);
  backup.metadata.total_rows = totalRows;
  backup.metadata.tables_with_data = Object.values(backup.tables).filter(t => t.rows > 0).length;
  backup.metadata.failed_tables = Object.values(backup.tables).filter(t => t.error).length;
  
  // Write backup file
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  const fileSize = fs.statSync(backupPath).size;
  backup.metadata.file_size_bytes = fileSize;
  backup.metadata.file_size_mb = Math.round(fileSize / 1024 / 1024 * 100) / 100;
  
  // Update file with size info
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  log(`✅ Backup completed: ${backupFileName}`);
  log(`   - File size: ${backup.metadata.file_size_mb} MB`);
  log(`   - Total rows: ${totalRows}`);
  log(`   - Tables with data: ${backup.metadata.tables_with_data}/${tables.length}`);
  
  if (backup.metadata.failed_tables > 0) {
    log(`   - ⚠️  Failed tables: ${backup.metadata.failed_tables}`);
  }
  
  return backupPath;
}

// Clean up old backups
function cleanupOldBackups() {
  const backupFiles = fs.readdirSync(CONFIG.BACKUP_DIR)
    .filter(file => file.startsWith('manatap-backup-') && file.endsWith('.json'))
    .map(file => ({
      name: file,
      path: path.join(CONFIG.BACKUP_DIR, file),
      created: fs.statSync(path.join(CONFIG.BACKUP_DIR, file)).birthtime
    }))
    .sort((a, b) => b.created - a.created); // Newest first
  
  if (backupFiles.length > CONFIG.MAX_BACKUPS) {
    const filesToDelete = backupFiles.slice(CONFIG.MAX_BACKUPS);
    
    log(`Cleaning up ${filesToDelete.length} old backup files...`);
    filesToDelete.forEach(file => {
      fs.unlinkSync(file.path);
      log(`Deleted old backup: ${file.name}`);
    });
  }
  
  log(`Keeping ${Math.min(backupFiles.length, CONFIG.MAX_BACKUPS)} backup files`);
}

// Main backup function
async function runBackup() {
  try {
    log('='.repeat(50));
    log('ManaTap.ai Manual Database Backup');
    log('='.repeat(50));
    
    const projectDetails = getProjectDetails();
    log('Project details:', projectDetails);
    
    ensureBackupDirectory();
    
    const backupPath = await createBackup();
    
    cleanupOldBackups();
    
    log('='.repeat(50));
    log('✅ Backup completed successfully!');
    log(`Backup saved to: ${backupPath}`);
    log('='.repeat(50));
    
    return { success: true, backupPath };
    
  } catch (error) {
    log('❌ Backup failed:', error.message);
    log('Error details:', error);
    
    return { success: false, error: error.message };
  }
}

// Instructions for restoring backup
function printRestoreInstructions() {
  console.log(`
📖 HOW TO RESTORE FROM BACKUP:

1. Create a new Supabase project (if needed)
2. Set up your table structure (run your SQL migrations)
3. Use this script to restore data:

   node scripts/restore-backup.js path/to/backup-file.json

4. Update your .env.local with new project credentials
5. Test your application

⚠️  IMPORTANT: 
- This backup is JSON format (not SQL dump)
- You need to recreate table structure separately
- Test restore process on a test project first
`);
}

// Run backup if called directly
if (require.main === module) {
  // Check if we have required dependencies
  try {
    require('@supabase/supabase-js');
  } catch (err) {
    console.error('❌ Missing @supabase/supabase-js dependency');
    console.error('Run: npm install @supabase/supabase-js');
    process.exit(1);
  }
  
  runBackup()
    .then(result => {
      if (result.success) {
        printRestoreInstructions();
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(err => {
      log('Unexpected error:', err);
      process.exit(1);
    });
}

module.exports = { runBackup, CONFIG };