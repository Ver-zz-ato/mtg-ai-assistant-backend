# ManaTap.ai Disaster Recovery Runbook

## 🚨 Emergency Contact Information

**Primary Admin**: Davy Seits  
**Email**: davy@manatap.ai  
**Backup Contact**: [Add secondary contact]  

**Critical Services**:
- **Frontend**: Vercel (https://manatap.ai)
- **Backend**: Render (https://app.manatap.ai) 
- **Database**: Supabase
- **Domain**: [Your domain registrar]
- **Monitoring**: Built-in health checks

---

## 📋 Quick Recovery Checklist

### Immediate Response (0-5 minutes)
- [ ] Confirm the outage scope (partial vs full)
- [ ] Check service status pages (Vercel, Render, Supabase)
- [ ] Review recent deployments/changes
- [ ] Activate maintenance mode if needed
- [ ] Notify users if outage > 15 minutes

### Assessment Phase (5-15 minutes)
- [ ] Identify root cause category (see scenarios below)
- [ ] Check backup availability and freshness
- [ ] Estimate recovery time objective (RTO)
- [ ] Determine if rollback or restore is needed

### Recovery Phase (15+ minutes)
- [ ] Execute appropriate recovery procedure
- [ ] Verify system functionality
- [ ] Monitor for cascading issues
- [ ] Document incident and lessons learned

---

## 🔄 Backup System Overview

### Automated Backups
- **Frequency**: Daily at 02:00 UTC
- **Retention**: 7 days (Point-in-time recovery)
- **Location**: Supabase managed storage
- **Encryption**: AES-256 at rest

### Manual Backups
- **Access**: `/admin/backups` interface
- **Frequency**: On-demand before major changes
- **Storage**: Same as automated backups

### Backup Contents
- All database tables and relationships
- User data (accounts, decks, collections)
- Application configuration
- Chat history and threads
- Custom cards and profiles

---

## 🛠️ Recovery Procedures by Scenario

### Scenario 1: Database Corruption/Data Loss

**Symptoms**: 
- Database queries failing
- Missing or corrupted data
- Foreign key constraint errors

**Recovery Steps**:
1. **Immediate**: Enable maintenance mode
   ```bash
   # Via admin interface or direct API
   POST /api/admin/config
   {
     "key": "maintenance",
     "value": {
       "enabled": true,
       "message": "Emergency maintenance - restoring from backup"
     }
   }
   ```

2. **Access Supabase Dashboard**:
   - Go to: https://supabase.com/dashboard
   - Navigate to your project → Database → Backups

3. **Select Recovery Point**:
   - Choose backup from before the corruption
   - Note: This creates a NEW project (old data will be lost)

4. **Create New Database from Backup**:
   - Click "Restore" on chosen backup
   - This creates a new Supabase project
   - **CRITICAL**: Note the new project URL and keys

5. **Update Environment Variables**:
   ```bash
   # Update in Vercel (frontend)
   NEXT_PUBLIC_SUPABASE_URL=https://NEW_PROJECT_ID.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=NEW_ANON_KEY
   
   # Update in Render (backend if applicable)
   SUPABASE_URL=https://NEW_PROJECT_ID.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=NEW_SERVICE_KEY
   ```

6. **Deploy Updates**:
   - Trigger deployment in Vercel
   - Trigger deployment in Render
   - Wait for deployments to complete

7. **Verify Recovery**:
   - Test user authentication
   - Check deck loading and saving
   - Verify chat functionality
   - Run health check: `/api/health`

8. **Disable Maintenance Mode**:
   ```bash
   POST /api/admin/config
   {
     "key": "maintenance", 
     "value": {"enabled": false}
   }
   ```

**Estimated Recovery Time**: 30-60 minutes

---

### Scenario 2: Frontend Deployment Issues

**Symptoms**:
- Site not loading (500 errors)
- Build failures
- Broken functionality after deployment

**Recovery Steps**:
1. **Check Vercel Dashboard**:
   - Go to: https://vercel.com/dashboard
   - Check deployment status and logs

2. **Rollback to Previous Version**:
   - In Vercel: Deployments → Find last working deploy
   - Click "Visit" to verify it works
   - Click "Promote to Production"

3. **If Rollback Fails**:
   - Check environment variables in Vercel
   - Verify all required secrets are set
   - Re-deploy from main branch

**Estimated Recovery Time**: 5-15 minutes

---

### Scenario 3: Backend API Failures

**Symptoms**:
- API endpoints returning 500 errors
- Chat not working
- Database operations failing

**Recovery Steps**:
1. **Check Render Dashboard**:
   - Go to: https://render.com/dashboard  
   - Check service status and logs

2. **Restart Service**:
   - Click "Manual Deploy" to restart
   - Monitor logs for startup errors

3. **Check Environment Variables**:
   - Verify all required env vars are set
   - Especially database connection strings

4. **Database Connection Issues**:
   - Check Supabase status: https://status.supabase.com
   - Verify connection strings are correct
   - Test direct database connectivity

**Estimated Recovery Time**: 10-30 minutes

---

### Scenario 4: Complete System Failure

**Symptoms**:
- Multiple services down
- Cannot access admin interfaces
- Total site unavailability

**Recovery Steps**:
1. **Assess Scope**:
   - Check individual service status pages
   - Identify if it's provider-wide outage

2. **If Provider Outage**:
   - Monitor service status pages
   - Communicate to users via social media
   - Wait for provider resolution

3. **If Configuration Issue**:
   - Revert recent changes via Git
   - Re-deploy all services
   - Follow individual service recovery procedures

**Estimated Recovery Time**: 1-4 hours

---

## 📊 Backup Monitoring & Health Checks

### Daily Backup Verification
```bash
# Check backup status via admin interface
GET /api/admin/backups

# Expected response:
{
  "ok": true,
  "status": "Supabase automatic backups healthy",
  "backups": [...]
}
```

### Weekly Recovery Test
1. Create test database from backup
2. Verify data integrity
3. Test key application functions
4. Document any issues found

### Monthly Full Recovery Drill
1. Simulate complete system failure
2. Execute full recovery procedure
3. Time the recovery process
4. Update procedures based on lessons learned

---

## 🔧 Backup Configuration Guide

### Enabling Supabase Backups

1. **Access Supabase Dashboard**:
   - Go to your project settings
   - Navigate to Database → Backups

2. **Configure Backup Settings**:
   ```
   Daily Backups: ✅ Enabled
   Retention Period: 7 days (Free tier)
   Backup Time: 02:00 UTC
   ```

3. **Point-in-Time Recovery**:
   - Available for last 7 days
   - Can restore to any specific timestamp
   - Creates new project (not in-place)

### Setting Up Backup Monitoring

1. **Health Check Endpoint**:
   - Monitor `/api/health` every 5 minutes
   - Alert if response time > 5 seconds or status not 200

2. **Database Connectivity**:
   - Automated ping every hour
   - Alert if Supabase connection fails

3. **Backup Status Check**:
   - Daily verification of backup completion
   - Alert if no backup in last 25 hours

---

## 📈 Recovery Time Objectives (RTO)

| Scenario | Target RTO | Maximum RTO |
|----------|------------|-------------|
| Frontend issues | 15 minutes | 30 minutes |
| Backend issues | 30 minutes | 1 hour |
| Database corruption | 1 hour | 2 hours |
| Complete failure | 2 hours | 4 hours |

## 💾 Recovery Point Objectives (RPO)

| Data Type | Maximum Data Loss |
|-----------|------------------|
| User decks/collections | 24 hours |
| Chat history | 24 hours |
| User accounts | 24 hours |
| System configuration | 1 hour |

---

## 🧪 Testing Procedures

### Monthly Backup Test
1. Select random backup from last 7 days
2. Create test project from backup
3. Verify data integrity:
   ```sql
   -- Test critical tables
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM decks;
   SELECT COUNT(*) FROM chat_threads;
   
   -- Test relationships
   SELECT COUNT(*) FROM decks d 
   JOIN users u ON d.user_id = u.id;
   ```
4. Test application functions with test data
5. Document results in `/admin/backups`

### Quarterly Full Recovery Drill
1. Schedule maintenance window
2. Create complete system backup
3. Simulate total failure scenario
4. Execute full recovery procedure
5. Time each step and document
6. Restore original system
7. Update runbook with improvements

---

## 📞 Escalation Procedures

### Level 1: Self-Service (0-15 minutes)
- Check service status pages
- Review recent changes
- Attempt standard recovery procedures

### Level 2: Provider Support (15-60 minutes)  
- Contact Vercel support (if frontend issue)
- Contact Render support (if backend issue)
- Contact Supabase support (if database issue)

### Level 3: Emergency Response (60+ minutes)
- Consider alternative hosting
- Prepare public communication
- Contact backup technical resources

---

## 📚 Additional Resources

- [Supabase Backup Documentation](https://supabase.com/docs/guides/platform/backups)
- [Vercel Deployment Documentation](https://vercel.com/docs/deployments/overview)
- [Render Service Documentation](https://render.com/docs)

---

## 🔄 Document Maintenance

**Last Updated**: $(date)  
**Next Review**: $(date + 3 months)  
**Version**: 1.0  

**Review Schedule**: 
- Monthly backup test results
- Quarterly full recovery drill
- Annual complete procedure review

This document should be updated after:
- Any infrastructure changes
- Recovery procedure execution  
- Technology stack updates
- Contact information changes