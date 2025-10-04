# Local Scryfall Cache Update Scripts

**Forget GitHub Actions!** These scripts let you update your Scryfall card cache locally, avoiding all the 502 timeout issues.

## 🚀 Quick Start

### Option 1: PowerShell (Windows - Recommended for you)
```powershell
# Run directly
.\scripts\update-scryfall-cache.ps1

# Or with parameters
.\scripts\update-scryfall-cache.ps1 -BaseUrl "https://your-app.vercel.app" -CronKey "your-cron-key"
```

### Option 2: Node.js (Cross-platform)
```bash
# Run directly
node scripts/update-cache.js

# Or set environment variables first
export MTG_BASE_URL="https://your-app.vercel.app"
export MTG_CRON_KEY="your-cron-key"
node scripts/update-cache.js
```

### Option 3: Bash/cURL (Simple)
```bash
# Run directly
./scripts/update-cache.sh

# Or with parameters
./scripts/update-cache.sh "https://your-app.vercel.app" "your-cron-key"
```

## ⚙️ Configuration

You need two values:
- **BASE_URL**: Your deployed app URL (e.g., `https://your-app.vercel.app`)
- **CRON_KEY**: Your cron authentication key

### Set Environment Variables (Optional)
```powershell
# PowerShell
$env:MTG_BASE_URL = "https://your-app.vercel.app"
$env:MTG_CRON_KEY = "your-cron-key"
```

```bash
# Bash
export MTG_BASE_URL="https://your-app.vercel.app"
export MTG_CRON_KEY="your-cron-key"
```

## 🔧 How It Works

1. **Tests your API endpoint** (30-second quick test)
2. **Tries streaming mode** (processes ~1K cards in 2-5 minutes)
3. **Falls back to chunked mode** if streaming fails (100 cards per chunk)
4. **Shows progress and results** with colored output

## ✅ Benefits vs GitHub Actions

| **GitHub Actions** ❌ | **Local Scripts** ✅ |
|---|---|
| 502 Bad Gateway errors | No timeouts - runs locally |
| Complex workflow debugging | Simple, direct API calls |
| Fixed schedule only | Run anytime you want |
| Limited to 10-minute timeouts | No artificial time limits |
| Hard to troubleshoot | See errors immediately |

## 📊 Expected Output

```
🔥 Starting local Scryfall cache update...
📋 Configuration:
  Base URL: https://your-app.vercel.app
  Batch Size: 100 cards per request

🧪 Testing endpoint...
✅ Test successful! Database has 1 sample entries

🌊 Starting streaming import...
📦 Processing cards in streaming mode (this may take 2-5 minutes)...
✅ Streaming import completed!
📊 Results:
  Cards imported: 1000
  Cards processed: 1000
  Total cards: 29184
  Cache count: 1000

🎉 Scryfall cache update completed!
💡 You can run this script anytime to update your card database.
```

## 🔄 When to Run

- **After deploying new code** - Refresh card data
- **Weekly/Monthly** - Keep cards up to date
- **When testing** - Populate development database
- **After database changes** - Re-populate cache

## 🛠️ Troubleshooting

### Common Issues:
- **401 Unauthorized**: Check your CRON_KEY
- **404 Not Found**: Verify your BASE_URL and API deployment
- **Timeout**: Your server might be overloaded - try later
- **Connection refused**: Check if your app is running

### Test First:
All scripts include a test mode that quickly validates your configuration before doing the full import.

## 💡 Pro Tips

1. **Start with PowerShell** - Best for Windows with nice colors
2. **Use environment variables** - Avoid typing credentials repeatedly  
3. **Run during off-peak** - Better server performance
4. **Check logs** - Scripts show detailed progress
5. **Test after changes** - Run test mode to verify setup

---

**No more GitHub Actions headaches!** 🎉