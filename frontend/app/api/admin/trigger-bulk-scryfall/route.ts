import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Call the Render.com bulk-jobs server
    const response = await fetch('https://mtg-bulk-jobs.onrender.com/bulk-scryfall', {
      method: 'POST',
      headers: {
        'x-cron-key': process.env.CRON_KEY || 'Boobies',
        'Content-Type': 'application/json',
      },
      // Give it 10 minutes to respond (it's a long job)
      signal: AbortSignal.timeout(600000),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: data.error || 'Bulk Scryfall import failed' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      message: data.message || 'Bulk Scryfall import started',
      processed: data.processed,
      inserted: data.inserted,
    });
  } catch (e: any) {
    console.error('[Admin] Bulk Scryfall trigger error:', e);
    
    if (e.name === 'TimeoutError') {
      return NextResponse.json(
        { ok: false, error: 'Request timed out after 10 minutes. Job may still be processing on Render.' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { ok: false, error: e.message || 'Failed to trigger bulk Scryfall import' },
      { status: 500 }
    );
  }
}

