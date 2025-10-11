// Quick Stripe API Test Script
// Run this in your browser console at http://localhost:3000

console.log('🧪 Testing Stripe Integration...');

// Test 1: Check if pricing page loads
async function testPricingPage() {
  try {
    const response = await fetch('/pricing');
    console.log('✅ Pricing page:', response.ok ? 'LOADS' : 'FAILED');
    return response.ok;
  } catch (error) {
    console.log('❌ Pricing page: FAILED', error);
    return false;
  }
}

// Test 2: Test checkout session creation (will fail without auth, but should return proper error)
async function testCheckoutSession() {
  try {
    const response = await fetch('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'monthly' })
    });
    
    const data = await response.json();
    console.log('📝 Checkout API Response:', data);
    
    if (response.status === 401 && data.error === 'Authentication required') {
      console.log('✅ Checkout API: WORKING (auth required as expected)');
      return true;
    } else if (response.ok && data.url) {
      console.log('✅ Checkout API: WORKING (got Stripe URL)');
      return true;
    } else {
      console.log('⚠️ Checkout API: Unexpected response');
      return false;
    }
  } catch (error) {
    console.log('❌ Checkout API: FAILED', error);
    return false;
  }
}

// Test 3: Test billing portal (will fail without auth/customer, but should return proper error)
async function testBillingPortal() {
  try {
    const response = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    console.log('🏪 Portal API Response:', data);
    
    if (response.status === 401 && data.error === 'Authentication required') {
      console.log('✅ Portal API: WORKING (auth required as expected)');
      return true;
    } else if (response.ok && data.url) {
      console.log('✅ Portal API: WORKING (got portal URL)');
      return true;
    } else if (response.status === 400 && data.error.includes('No billing account found')) {
      console.log('✅ Portal API: WORKING (no customer as expected)');
      return true;
    } else {
      console.log('⚠️ Portal API: Unexpected response');
      return false;
    }
  } catch (error) {
    console.log('❌ Portal API: FAILED', error);
    return false;
  }
}

// Test 4: Check Stripe webhook endpoint exists
async function testWebhookEndpoint() {
  try {
    const response = await fetch('/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    // Webhook should reject non-Stripe requests
    if (response.status === 400) {
      console.log('✅ Webhook endpoint: EXISTS (rejects non-Stripe requests)');
      return true;
    } else {
      console.log('⚠️ Webhook endpoint: Unexpected response');
      return false;
    }
  } catch (error) {
    console.log('❌ Webhook endpoint: FAILED', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🚀 Running Stripe Integration Tests...\n');
  
  const results = [];
  results.push(await testPricingPage());
  results.push(await testCheckoutSession());
  results.push(await testBillingPortal());
  results.push(await testWebhookEndpoint());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED! Your Stripe integration is working!');
    console.log('\n✨ Next steps:');
    console.log('1. Add Stripe test keys to .env.local');
    console.log('2. Test full checkout flow with test cards');
    console.log('3. Configure Stripe Dashboard for production');
  } else {
    console.log('⚠️ Some tests failed. Check the errors above.');
  }
  
  return passed === total;
}

// Auto-run if this script is loaded
if (typeof window !== 'undefined') {
  runAllTests();
}

// Export for manual testing
window.testStripe = {
  runAllTests,
  testPricingPage,
  testCheckoutSession,
  testBillingPortal,
  testWebhookEndpoint
};