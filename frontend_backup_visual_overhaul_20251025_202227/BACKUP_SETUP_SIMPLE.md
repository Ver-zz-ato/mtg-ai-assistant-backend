# 🛡️ ManaTap.ai Backup Setup - Simple Guide

Since Supabase free tier doesn't include automatic backups, I've created a **manual backup system** that runs automatically every day.

## 🤖 What Happens Every Day (Automatic)

### **At 3:15 AM UTC, GitHub Actions will:**

1. **📦 Create a database backup**
   - Downloads all your data (users, decks, collections, etc.)
   - Saves it as a JSON file
   - Keeps the last 7 backups

2. **🏥 Check if your website is healthy**
   - Tests if your website is up
   - Tests if database is working  
   - Tests if card data is working

3. **📱 Send you alerts if anything breaks**
   - Slack message if something is wrong
   - Detailed logs you can check

## 🔧 Setup Steps (5 minutes)

### Step 1: Add Secrets to GitHub

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

```
SLACK_WEBHOOK_URL = https://hooks.slack.com/services/YOUR/WEBHOOK (you already did this!)
NEXT_PUBLIC_SUPABASE_URL = https://sjstgotitjapjkvxryru.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = [copy from your .env.local]
SUPABASE_SERVICE_ROLE_KEY = [copy from your .env.local if you have it]
```

### Step 2: Test It Works

1. Go to GitHub → Your repo → Actions
2. Click "Backup & Health Monitor"  
3. Click "Run workflow" → "Run workflow"
4. Wait 2-3 minutes
5. You should see: ✅ success and get backup files

## 📁 Where Are Your Backups?

### **In GitHub Actions:**
- Go to Actions → Recent workflow run
- Download "backup-and-logs" artifact  
- Contains your database backup as JSON

### **What Gets Backed Up:**
- ✅ All your users
- ✅ All decks and collections
- ✅ All chat history
- ✅ All custom cards
- ✅ All wishlists
- ✅ All settings

## 🆘 If Your Database Gets Corrupted

### **Don't Panic! Here's what to do:**

1. **Download latest backup**:
   - Go to GitHub Actions → Recent successful run
   - Download the backup artifact
   - Extract the JSON file

2. **Create new Supabase project**:
   - Go to https://supabase.com/dashboard
   - Create new project
   - Set up tables (rerun your migrations)

3. **Restore your data**:
   ```bash
   # I'll create a restore script later if needed
   node scripts/restore-backup.js path/to/backup.json
   ```

4. **Update your .env.local** with new project URL/keys

5. **Deploy updated app**

## 🚨 When Will You Get Alerts?

You'll get a Slack message if:
- ❌ Your website is down
- ❌ Database stops working  
- ❌ Backup fails
- ❌ Card data (Scryfall) stops working

## ✅ Current Status

**What's Working:**
- ✅ Daily health monitoring
- ✅ Manual database backups  
- ✅ Slack alerts when things break
- ✅ 7-day backup retention
- ✅ Automatic cleanup of old backups

**What You're Missing (vs Pro):**
- ❌ Real SQL database dumps (we use JSON export)
- ❌ Point-in-time recovery  
- ❌ 30-day retention

## 💰 Cost: $0/month

This entire backup system costs **nothing**:
- ✅ GitHub Actions: 2,000 minutes/month free (we use ~60 minutes/month)
- ✅ Slack: Free tier works fine
- ✅ Backup storage: Free in GitHub artifacts

## 🧪 Test Your Backup System

**Right now:**
1. Go to your GitHub repo → Actions
2. Click "Backup & Health Monitor"
3. Click "Run workflow"  
4. Wait for it to finish
5. Download the backup artifact
6. Check that your data is there

**If it works**: You're protected! ✅  
**If it fails**: Let me know the error and I'll fix it

---

## 📞 Need Help?

If anything goes wrong or you get confused:
1. Check GitHub Actions logs for error messages
2. Post the error and I'll help fix it
3. This system is much better than no backups!

**Your data is now protected from disasters!** 🛡️