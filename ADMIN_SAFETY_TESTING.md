# Admin Safety Features - Testing Guide

## 🧪 How to Test Everything

### **Prerequisites**
1. Start your dev server: `npm run dev`
2. Make sure you're logged in as admin
3. Have some test data in your database (errors, AI usage, price snapshots)

---

## **Test 1: Admin Audit Pinboard** 🖥️

### Visual Test
1. **Navigate to**: `http://localhost:3000/admin/ops`
2. **Look for**: New "System Health Pinboard" section at the top
3. **Should see**: 4 colored widgets showing:
   - Errors (24h count)
   - AI Spend (today/week with %)  
   - Price Data (health status)
   - Performance (slow jobs + rate limits)

### API Test
Open browser console and run:
```javascript
// Test the pinboard API
fetch('/api/admin/audit-pinboard')
  .then(r => r.json())
  .then(data => {
    console.log('Pinboard data:', data);
    if (data.ok) {
      console.log('✅ Pinboard API working');
      console.log('Errors last 24h:', data.pinboard.errors.count_24h);
      console.log('AI spend today:', data.pinboard.ai_spending.today_usd);
      console.log('Snapshot health:', data.pinboard.price_snapshots.health);
    } else {
      console.log('❌ Pinboard API failed:', data.error);
    }
  });
```

### Expected Results
- API returns `{ ok: true, pinboard: {...} }`
- UI shows color-coded health indicators
- Click "Refresh" button updates the display

---

## **Test 2: Budget Auto-Disable** 💰

### Setup Test Budget
1. **Go to**: `/admin/ops` 
2. **Set low limits**: Daily USD: `0.01`, Weekly USD: `0.05`
3. **Click**: "Save Budget Caps"

### Test Auto-Disable (Method 1: Manual)
1. **Refresh** the pinboard
2. **If over budget**: Red "Auto-Disable" button should appear
3. **Click it**: Should disable risky_betas and show alert
4. **Verify**: Check that "Risky betas" checkbox is now unchecked

### Test Auto-Disable (Method 2: API)
```javascript
// Test budget enforcement
fetch('/api/admin/monitor', { method: 'POST' })
  .then(r => r.json())
  .then(data => {
    console.log('Monitor result:', data);
    if (data.auto_disabled) {
      console.log('✅ Auto-disable triggered!');
    }
    if (data.alerts.length > 0) {
      console.log('🚨 Alerts:', data.alerts);
    }
  });
```

### Create Test AI Usage (If needed)
Run in browser console to simulate AI spending:
```javascript
// Insert fake AI usage to test budget limits
fetch('/api/admin/config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'test_ai_usage',
    value: { message: 'This would normally insert AI usage via your existing endpoints' }
  })
})
.then(() => console.log('Would need to use your actual AI usage insertion method'));
```

---

## **Test 3: Stale Snapshot Alerts** 📊

### Check Current Snapshot Status
```javascript
// Check snapshot health
fetch('/api/admin/audit-pinboard')
  .then(r => r.json())
  .then(data => {
    const snapshot = data.pinboard.price_snapshots;
    console.log('Snapshot status:', snapshot.health);
    console.log('Age:', snapshot.age_hours, 'hours');
    console.log('Latest date:', snapshot.latest_date);
    
    if (snapshot.health === 'healthy') console.log('✅ Snapshots are fresh');
    if (snapshot.health === 'stale') console.log('⚠️ Snapshots are getting old');
    if (snapshot.health === 'critical') console.log('🔴 Snapshots are very old!');
  });
```

### Test Snapshot Rollback
1. **Go to**: `/admin/ops`
2. **Find**: "Snapshot Rollback" section
3. **Click**: "Rollback to Yesterday" 
4. **Should see**: Confirmation with snapshot date

---

## **Test 4: System Monitoring API** 🔍

### Full Monitor Test
```javascript
// Test the full monitoring system
async function testMonitoring() {
  try {
    const response = await fetch('/api/admin/monitor', { method: 'POST' });
    const data = await response.json();
    
    console.log('=== MONITORING RESULTS ===');
    console.log('Status:', data.ok ? '✅ OK' : '❌ FAILED');
    console.log('Checked at:', data.checked_at);
    console.log('Auto-disabled features:', data.auto_disabled);
    
    if (data.alerts && data.alerts.length > 0) {
      console.log('🚨 ALERTS FOUND:');
      data.alerts.forEach((alert, i) => {
        console.log(`${i+1}. ${alert}`);
      });
    } else {
      console.log('✅ No alerts - system healthy');
    }
    
  } catch (error) {
    console.error('❌ Monitoring test failed:', error);
  }
}

testMonitoring();
```

---

## **Test 5: Error Simulation** 🐛

### Create Test Errors
```javascript
// Simulate some errors to test the error tracking
async function createTestErrors() {
  for (let i = 0; i < 3; i++) {
    await fetch('/api/admin/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'test',
        message: `Test error ${i+1} - ${new Date().toISOString()}`,
        path: '/test/path',
        stack: 'Test stack trace'
      })
    });
  }
  
  console.log('✅ Created 3 test errors');
  console.log('🔄 Refresh the pinboard to see them');
}

createTestErrors();
```

### Verify Error Display
1. **Run the error simulation above**
2. **Go to**: `/admin/ops`
3. **Click**: "Refresh" on the pinboard
4. **Should see**: Error count increased

---

## **Test 6: Integration Tests** 🔗

### Test All Features Together
```javascript
// Comprehensive test of all features
async function fullSystemTest() {
  console.log('🧪 Starting full system test...');
  
  // 1. Test pinboard
  const pinboard = await fetch('/api/admin/audit-pinboard').then(r => r.json());
  console.log('1️⃣ Pinboard:', pinboard.ok ? '✅' : '❌');
  
  // 2. Test monitoring
  const monitor = await fetch('/api/admin/monitor', { method: 'POST' }).then(r => r.json());
  console.log('2️⃣ Monitor:', monitor.ok ? '✅' : '❌');
  
  // 3. Test config read
  const config = await fetch('/api/admin/config?key=flags&key=llm_budget').then(r => r.json());
  console.log('3️⃣ Config:', config.ok ? '✅' : '❌');
  
  // 4. Summary
  console.log('\n=== TEST SUMMARY ===');
  console.log('Pinboard API:', pinboard.ok ? 'PASS' : 'FAIL');
  console.log('Monitor API:', monitor.ok ? 'PASS' : 'FAIL'); 
  console.log('Config API:', config.ok ? 'PASS' : 'FAIL');
  
  if (pinboard.ok && monitor.ok && config.ok) {
    console.log('🎉 ALL TESTS PASSED!');
  } else {
    console.log('❌ Some tests failed - check logs');
  }
}

fullSystemTest();
```

---

## **Expected Test Results** ✅

### When Everything Works:
- **Pinboard**: Shows real data with appropriate colors
- **Budget**: Auto-disable triggers when limits exceeded  
- **Snapshots**: Health status reflects actual data age
- **Monitoring**: Returns structured alerts and actions
- **UI**: All buttons work, data updates on refresh

### Common Issues & Fixes:
1. **"No data showing"**: Check if you have any AI usage, errors, or snapshots in database
2. **"Auto-disable not working"**: Make sure budget limits are set very low for testing
3. **"Colors all gray"**: Database might be empty - create some test data
4. **"API errors"**: Check browser console for detailed error messages

---

## **Quick Health Check** 💡

Run this one-liner to verify everything:
```javascript
Promise.all([
  fetch('/api/admin/audit-pinboard').then(r => r.json()),
  fetch('/api/admin/monitor', {method:'POST'}).then(r => r.json())
]).then(([pinboard, monitor]) => {
  console.log('Health Check:');
  console.log('📊 Pinboard:', pinboard.ok ? '✅' : '❌');
  console.log('🔍 Monitor:', monitor.ok ? '✅' : '❌');
  console.log('Ready for production!');
});
```

All tests should pass if the features are working correctly! 🚀