import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateMTGUsername } from '@/lib/mtg-username-generator';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

/**
 * Server-side signup tracking endpoint
 * This bypasses cookie consent requirements since it runs on the server
 * Also sets a random MTG-themed username if user doesn't have one
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { method = 'email', userId, userEmail } = body;

    // Get the user if we have a session but no userId provided
    let finalUserId = userId;
    let user = null;
    if (!finalUserId) {
      try {
        const supabase = await createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          finalUserId = authUser.id;
          user = authUser;
        }
      } catch {}
    } else {
      // If userId provided, fetch user to check username
      try {
        const admin = getAdmin();
        if (admin) {
          const { data: userData } = await admin.auth.admin.getUserById(finalUserId);
          user = userData?.user || null;
        }
      } catch {}
    }

    // Set random MTG-themed username if user doesn't have one
    if (user && (!user.user_metadata?.username || user.user_metadata?.username === 'Testingz')) {
      try {
        const admin = getAdmin();
        if (admin) {
          // Generate unique username (check if it exists)
          let newUsername = generateMTGUsername();
          let attempts = 0;
          const maxAttempts = 10;
          
          // Check if username exists by querying profiles
          const supabase = await createClient();
          while (attempts < maxAttempts) {
            const { data: existing } = await supabase
              .from('profiles')
              .select('id')
              .eq('username', newUsername)
              .maybeSingle();
            
            if (!existing) {
              // Username is unique, use it
              break;
            }
            
            // Regenerate if taken
            newUsername = generateMTGUsername();
            attempts++;
          }
          
          // If all attempts failed, add timestamp
          if (attempts >= maxAttempts) {
            newUsername = `${generateMTGUsername()}${Date.now().toString().slice(-4)}`;
          }
          
          // Update user metadata with new username
          const currentMetadata = user.user_metadata || {};
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...currentMetadata,
              username: newUsername,
            }
          });
          
          console.info('Set random MTG username for new user', {
            userId: user.id,
            username: newUsername,
          });
        }
      } catch (usernameError) {
        // Non-fatal - log but don't fail the request
        console.error('Failed to set random username (non-fatal):', usernameError);
      }
    }

    // Signup funnel events (signup_completed / login_completed) are sent via
    // POST /api/analytics/auth-event from client on SIGNED_IN. This route
    // only handles username setup.

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Failed to track signup server-side:', error);
    // Don't fail the request if tracking fails
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}

