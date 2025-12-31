import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

// Load environment variables from .env.local if available
// Playwright tests run in Node.js, so we need to manually load .env.local
try {
  const fs = require('fs');
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line: string) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
} catch (e) {
  // Ignore if fs is not available or .env.local doesn't exist
}

// This file sets up authentication once and saves the session for reuse
const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page, request }) => {
  // Get credentials from environment variables
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

  // Skip authentication if credentials are not provided
  if (!email || !password) {
    console.log('⚠️  PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD not set. Skipping authentication setup.');
    console.log('   Authenticated tests will be skipped.');
    // Create empty auth file so tests don't fail
    await page.context().storageState({ path: authFile });
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }

  // Use Supabase REST API to authenticate
  const authResponse = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    data: {
      email,
      password,
    },
  });

  if (!authResponse.ok()) {
    const errorText = await authResponse.text();
    throw new Error(`Authentication failed: ${authResponse.status()} ${errorText}`);
  }

  const authData = await authResponse.json();
  const accessToken = authData.access_token;
  const refreshToken = authData.refresh_token;

  if (!accessToken) {
    throw new Error('No access token received from authentication');
  }

  // Extract the Supabase project reference for cookie naming
  const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  const projectRef = urlMatch ? urlMatch[1] : 'default';
  const cookieName = `sb-${projectRef}-auth-token`;

  // Navigate to the app first to establish the domain context
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Build the cookie value - Supabase expects a JSON string
  const cookieValue = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: authData.expires_at,
    expires_in: authData.expires_in,
    token_type: authData.token_type,
    user: authData.user,
  });
  
  // Set the auth cookie using evaluate (runs in browser context)
  await page.evaluate(({ name, value }) => {
    // Encode the value for cookie storage
    const encoded = encodeURIComponent(value);
    // Set cookie with proper attributes
    document.cookie = `${name}=${encoded}; path=/; SameSite=Lax; max-age=31536000`;
  }, { name: cookieName, value: cookieValue });

  // Wait a moment for cookie to be set, then verify
  await page.waitForTimeout(500);

  // Save authenticated state to file
  await page.context().storageState({ path: authFile });
  console.log('✅ Authentication setup complete. Session saved to', authFile);
});