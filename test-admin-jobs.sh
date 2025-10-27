#!/bin/bash

# Test script for the 3 consolidated admin jobs
# Run this to verify all endpoints are working before relying on GitHub Actions

echo "🧪 Testing Admin Jobs Endpoints"
echo "================================"
echo ""

# Configuration
BASE_URL="https://www.manatap.ai"
CRON_KEY="Boobies"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name=$1
    local url=$2
    local expected_duration=$3
    
    echo "📋 Testing: $name"
    echo "🌐 URL: $url"
    echo "⏱️  Expected duration: $expected_duration"
    echo ""
    
    START_TIME=$(date +%s)
    
    # Make request
    HTTP_CODE=$(curl -X POST \
        -H "x-cron-key: $CRON_KEY" \
        -H "Content-Type: application/json" \
        -H "User-Agent: Test-Script/1.0" \
        -w "\n%{http_code}" \
        -s \
        --max-time 600 \
        "$url" \
        -o /tmp/test_response.json)
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    echo "📡 HTTP Status: $HTTP_CODE"
    echo "⏱️  Actual duration: ${DURATION}s"
    echo ""
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ SUCCESS${NC}"
        echo "📄 Response:"
        cat /tmp/test_response.json | jq '.' 2>/dev/null || cat /tmp/test_response.json
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "📄 Error response:"
        cat /tmp/test_response.json | jq '.' 2>/dev/null || cat /tmp/test_response.json
    fi
    
    echo ""
    echo "----------------------------------------"
    echo ""
    
    return $([ "$HTTP_CODE" = "200" ] && echo 0 || echo 1)
}

# Test 1: Bulk Scryfall Import (Metadata)
echo "🎨 JOB 1: Bulk Scryfall Import"
echo "Purpose: Downloads 110k+ cards with metadata"
echo "Target: scryfall_cache table (metadata fields)"
echo ""
test_endpoint \
    "Bulk Scryfall Import" \
    "$BASE_URL/api/cron/bulk-scryfall" \
    "3-5 minutes"
JOB1_RESULT=$?

# Wait between jobs
echo "⏸️  Waiting 10 seconds before next test..."
sleep 10

# Test 2: Bulk Price Import
echo "💰 JOB 2: Bulk Price Import"
echo "Purpose: Updates prices for all cached cards"
echo "Target: scryfall_cache table (price fields)"
echo ""
test_endpoint \
    "Bulk Price Import" \
    "$BASE_URL/api/cron/bulk-price-import" \
    "3-5 minutes"
JOB2_RESULT=$?

# Wait between jobs
echo "⏸️  Waiting 10 seconds before next test..."
sleep 10

# Test 3: Historical Snapshots
echo "📈 JOB 3: Historical Price Snapshots"
echo "Purpose: Creates historical price snapshots"
echo "Target: price_snapshots table"
echo ""
test_endpoint \
    "Historical Price Snapshots" \
    "$BASE_URL/api/admin/price/snapshot/bulk" \
    "2-3 minutes"
JOB3_RESULT=$?

# Summary
echo ""
echo "🎉 ========================================"
echo "🎉 TEST SUMMARY"
echo "🎉 ========================================"
echo ""

if [ $JOB1_RESULT -eq 0 ]; then
    echo -e "🎨 Job 1 (Metadata):  ${GREEN}PASSED${NC}"
else
    echo -e "🎨 Job 1 (Metadata):  ${RED}FAILED${NC}"
fi

if [ $JOB2_RESULT -eq 0 ]; then
    echo -e "💰 Job 2 (Prices):    ${GREEN}PASSED${NC}"
else
    echo -e "💰 Job 2 (Prices):    ${RED}FAILED${NC}"
fi

if [ $JOB3_RESULT -eq 0 ]; then
    echo -e "📈 Job 3 (Snapshots): ${GREEN}PASSED${NC}"
else
    echo -e "📈 Job 3 (Snapshots): ${RED}FAILED${NC}"
fi

echo ""

# Overall result
if [ $JOB1_RESULT -eq 0 ] && [ $JOB2_RESULT -eq 0 ] && [ $JOB3_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Ready for GitHub Actions automation.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Fix issues before enabling automation.${NC}"
    exit 1
fi

