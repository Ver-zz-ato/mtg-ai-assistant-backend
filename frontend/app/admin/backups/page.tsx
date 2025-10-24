'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

export default function BackupsPage() {
  const [backups, setBackups] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<string>('');

  React.useEffect(() => {
    loadBackupInfo();
  }, []);

  async function loadBackupInfo() {
    try {
      const r = await fetch('/api/admin/backups');
      const j = await r.json();
      if (j?.ok) {
        setBackups(j.backups || []);
        setStatus(j.status || '');
      }
    } catch (e: any) {
      console.error('Failed to load backup info:', e);
    }
  }

  async function triggerBackup() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/backups/create', { method: 'POST' });
      const j = await r.json();
      if (j?.ok) {
        alert('Backup initiated successfully!');
        await loadBackupInfo();
      } else {
        alert(`Backup failed: ${j?.error || 'unknown error'}`);
      }
    } catch (e: any) {
      alert(`Backup failed: ${e?.message || 'network error'}`);
    } finally {
      setLoading(false);
    }
  }

  async function testRestore(backupId: string) {
    if (!confirm(`Test restore process for backup ${backupId}? This will validate restore procedures without affecting production data.`)) return;
    
    setLoading(true);
    try {
      const r = await fetch('/api/admin/backups/test-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId })
      });
      const j = await r.json();
      if (j?.ok) {
        alert('Restore test completed successfully!');
      } else {
        alert(`Restore test failed: ${j?.error || 'unknown error'}`);
      }
    } catch (e: any) {
      alert(`Restore test failed: ${e?.message || 'network error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Database Backups & Recovery</div>
      
      <ELI5 heading="Database Backup System" items={[
        '🛡️ Safety Net: Manually create database snapshots before risky changes',
        '📅 Daily automated backups run automatically (no action needed)',
        '⏪ Point-in-time recovery: Supabase keeps 7 days of backup history',
        '🧪 Test Restore: Verify backups work without affecting production',
        '⏱️ When to use: Before migrations, major schema changes, or risky updates',
        '🔄 How often: Weekly manual backups for peace of mind, or before big changes',
        '🚨 Emergency: If production breaks, you can roll back using these snapshots',
        'Test restore procedures regularly to verify backup integrity.',
        'Keep documentation updated for emergency recovery scenarios.'
      ]} />

      {/* Backup Status */}
      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <div className="font-medium flex items-center gap-2">
          Backup Status 
          <HelpTip text="Current backup system status and last successful backup." />
        </div>
        
        <div className="bg-neutral-950 rounded p-3 border border-neutral-700">
          <div className="text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="opacity-70">Status:</span> 
                <span className={`ml-2 font-medium ${status.includes('healthy') ? 'text-green-400' : 'text-yellow-400'}`}>
                  {status || 'Loading...'}
                </span>
              </div>
              <div>
                <span className="opacity-70">Available backups:</span> 
                <span className="ml-2 font-medium">{backups.length}</span>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={triggerBackup} 
          disabled={loading}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Manual Backup'}
        </button>
      </section>

      {/* Backup History */}
      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <div className="font-medium flex items-center gap-2">
          Backup History
          <HelpTip text="Recent backups with restore testing capabilities." />
        </div>

        <div className="overflow-auto max-h-80">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700">
                <th className="text-left py-2 px-3">Backup ID</th>
                <th className="text-left py-2 px-3">Created</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-left py-2 px-3">Size</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup: any) => (
                <tr key={backup.id} className="border-t border-neutral-900">
                  <td className="py-2 px-3 font-mono text-xs">{backup.id}</td>
                  <td className="py-2 px-3">{new Date(backup.created_at).toLocaleString()}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-1 rounded text-xs ${backup.type === 'automated' ? 'bg-blue-900 text-blue-200' : 'bg-purple-900 text-purple-200'}`}>
                      {backup.type}
                    </span>
                  </td>
                  <td className="py-2 px-3">{backup.size || 'N/A'}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-1 rounded text-xs ${backup.status === 'completed' ? 'bg-green-900 text-green-200' : 'bg-yellow-900 text-yellow-200'}`}>
                      {backup.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => testRestore(backup.id)}
                      disabled={loading || backup.status !== 'completed'}
                      className="px-2 py-1 text-xs rounded bg-yellow-800 hover:bg-yellow-700 text-yellow-100 disabled:opacity-50"
                    >
                      Test Restore
                    </button>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center opacity-70">
                    No backup records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recovery Documentation */}
      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <div className="font-medium">Emergency Recovery Procedures</div>
        <div className="bg-neutral-950 rounded p-4 border border-neutral-700 text-sm space-y-3">
          <div>
            <div className="font-medium text-orange-400 mb-2">⚠️ Production Recovery Steps</div>
            <ol className="list-decimal list-inside space-y-1 opacity-80 ml-4">
              <li>Access Supabase Dashboard → Database → Backups</li>
              <li>Select backup from available point-in-time snapshots (last 7 days)</li>
              <li>Create new project from backup if full restore needed</li>
              <li>Update environment variables to point to restored database</li>
              <li>Verify data integrity and application functionality</li>
              <li>Update DNS/routing if necessary</li>
            </ol>
          </div>
          
          <div className="border-t border-neutral-800 pt-3">
            <div className="font-medium text-blue-400 mb-2">📋 Recovery Checklist</div>
            <ul className="list-disc list-inside space-y-1 opacity-80 ml-4">
              <li>Verify backup date/time matches recovery point needed</li>
              <li>Check all critical tables: decks, users, chat_threads, etc.</li>
              <li>Test authentication and core app functionality</li>
              <li>Verify API endpoints are responding correctly</li>
              <li>Check data consistency and referential integrity</li>
              <li>Monitor application logs for any errors</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Backup Configuration */}
      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <div className="font-medium">Backup Configuration</div>
        <div className="text-sm space-y-2 opacity-80">
          <div><strong>Frequency:</strong> Daily at 02:00 UTC</div>
          <div><strong>Retention:</strong> 7 days (Supabase default)</div>
          <div><strong>Type:</strong> Full database snapshot with point-in-time recovery</div>
          <div><strong>Storage:</strong> Supabase managed backup storage</div>
          <div><strong>Encryption:</strong> AES-256 (Supabase standard)</div>
        </div>
      </section>
    </div>
  );
}