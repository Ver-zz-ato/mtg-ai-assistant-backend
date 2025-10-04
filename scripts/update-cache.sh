#!/bin/bash

# Simple Scryfall Cache Update Script
# Usage: ./update-cache.sh [BASE_URL] [CRON_KEY]

set -e

echo "🔥 Starting local Scryfall cache update..."

# Get configuration
BASE_URL=${1:-$MTG_BASE_URL}
CRON_KEY=${2:-$MTG_CRON_KEY}

if [ -z "$BASE_URL" ]; then
    echo "Enter your BASE_URL (e.g., https://your-app.vercel.app):"
    read -r BASE_URL
fi

if [ -z "$CRON_KEY" ]; then
    echo "Enter your CRON_KEY:"
    read -r CRON_KEY
fi

echo "📋 Configuration:"
echo "  Base URL: $BASE_URL"

# Test endpoint first
echo ""
echo "🧪 Testing endpoint..."
TEST_RESPONSE=$(curl -sS -w "\nHTTP_CODE:%{http_code}" \
  -X POST \
  -H "x-cron-key: $CRON_KEY" \
  -H "x-test-mode: true" \
  -H "Content-Type: application/json" \
  --max-time 30 \
  "$BASE_URL/api/cron/bulk-scryfall" 2>&1 || echo "CURL_ERROR")

TEST_HTTP_CODE=$(echo "$TEST_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2 || echo "000")
TEST_RESPONSE_BODY=$(echo "$TEST_RESPONSE" | sed '/HTTP_CODE:/d')

echo "Test response code: $TEST_HTTP_CODE"

if [ "$TEST_HTTP_CODE" -eq "200" ] || [ "$TEST_HTTP_CODE" -eq "201" ]; then
    echo "✅ Test successful!"
    echo "Response: $TEST_RESPONSE_BODY"
else
    echo "❌ Test failed with code: $TEST_HTTP_CODE"
    echo "Response: $TEST_RESPONSE_BODY"
    exit 1
fi

# Try streaming import
echo ""
echo "🌊 Starting streaming import..."
echo "📦 Processing cards in streaming mode (this may take 2-5 minutes)..."

STREAM_RESPONSE=$(curl -sS -w "\nHTTP_CODE:%{http_code}" \
  -X POST \
  -H "x-cron-key: $CRON_KEY" \
  -H "x-use-streaming: true" \
  -H "Content-Type: application/json" \
  --max-time 300 \
  "$BASE_URL/api/cron/bulk-scryfall" 2>&1 || echo "CURL_ERROR")

STREAM_HTTP_CODE=$(echo "$STREAM_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2 || echo "000")
STREAM_RESPONSE_BODY=$(echo "$STREAM_RESPONSE" | sed '/HTTP_CODE:/d')

echo "Streaming response code: $STREAM_HTTP_CODE"

if [ "$STREAM_HTTP_CODE" -eq "200" ] || [ "$STREAM_HTTP_CODE" -eq "201" ]; then
    echo "✅ Streaming import completed successfully!"
    echo "📊 Response: $STREAM_RESPONSE_BODY"
else
    echo "❌ Streaming import failed with code: $STREAM_HTTP_CODE"
    echo "Response: $STREAM_RESPONSE_BODY"
    
    # Try chunked fallback
    echo ""
    echo "🔄 Trying chunked fallback mode..."
    
    PAGE=1
    TOTAL_IMPORTED=0
    MAX_PAGES=50
    
    while [ $PAGE -le $MAX_PAGES ]; do
        echo "Processing page $PAGE..."
        
        CHUNK_START=$(( (PAGE - 1) * 100 ))
        
        CHUNK_RESPONSE=$(curl -sS -w "\nHTTP_CODE:%{http_code}" \
          -X POST \
          -H "x-cron-key: $CRON_KEY" \
          -H "x-use-streaming: false" \
          -H "x-chunk-start: $CHUNK_START" \
          -H "x-chunk-size: 100" \
          -H "Content-Type: application/json" \
          --max-time 120 \
          "$BASE_URL/api/cron/bulk-scryfall" 2>&1 || echo "CURL_ERROR")
        
        CHUNK_HTTP_CODE=$(echo "$CHUNK_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2 || echo "000")
        CHUNK_RESPONSE_BODY=$(echo "$CHUNK_RESPONSE" | sed '/HTTP_CODE:/d')
        
        if [ "$CHUNK_HTTP_CODE" -eq "200" ] || [ "$CHUNK_HTTP_CODE" -eq "201" ]; then
            PAGE_IMPORTED=$(echo "$CHUNK_RESPONSE_BODY" | grep -o '"imported":[0-9]*' | cut -d: -f2 || echo "0")
            IS_LAST_CHUNK=$(echo "$CHUNK_RESPONSE_BODY" | grep -o '"is_last_chunk":true' || echo "")
            
            TOTAL_IMPORTED=$((TOTAL_IMPORTED + PAGE_IMPORTED))
            echo "✅ Page $PAGE completed: $PAGE_IMPORTED imported. Total: $TOTAL_IMPORTED"
            
            if [ -n "$IS_LAST_CHUNK" ]; then
                echo "🎉 All pages completed!"
                break
            fi
            
            PAGE=$((PAGE + 1))
            sleep 2  # Be nice to the server
        else
            echo "❌ Page $PAGE failed with code: $CHUNK_HTTP_CODE"
            echo "Response: $CHUNK_RESPONSE_BODY"
            break
        fi
    done
fi

echo ""
echo "🎉 Scryfall cache update completed!"
echo "💡 You can run this script anytime to update your card database."