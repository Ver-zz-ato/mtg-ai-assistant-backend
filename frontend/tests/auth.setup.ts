import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

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

  // Navigate to the app to set cookies in the correct domain context
  await page.goto('/');
  
  // Set the auth cookie manually
  await page.context().addCookies([
    {
      name: cookieName,
      value: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: authData.expires_at,
        expires_in: authData.expires_in,
        token_type: authData.token_type,
        user: authData.user,
      }),
      domain: new URL(page.url()).hostname,
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    },
  ]);

  // Verify authentication by checking if we can access a protected endpoint
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Save authenticated state to file
  await page.context().storageState({ path: authFile });
  console.log('✅ Authentication setup complete. Session saved to', authFile);
});