import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Quick test endpoint to verify Stripe integration without products
export async function POST(req: NextRequest) {
  try {
    // Just test that we can create a basic response
    const body = await req.json().catch(() => ({}));
    const { plan } = body;

    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid plan' },
        { status: 400 }
      );
    }

    // Mock successful response for testing
    return NextResponse.json({
      ok: true,
      test_mode: true,
      message: `Would create checkout session for ${plan} plan`,
      next_step: 'Create products in Stripe Dashboard test mode',
    });

  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}