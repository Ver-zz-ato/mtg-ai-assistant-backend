import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Proxy for Scryfall collection endpoint to avoid CORS issues
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Forward to Scryfall
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    console.error('[Scryfall Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Scryfall', details: error.message },
      { status: 500 }
    );
  }
}

