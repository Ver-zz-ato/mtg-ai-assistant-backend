#!/bin/bash

# MTG AI Assistant - Cron Job Testing Script
# Usage: ./test-cron.sh [test|price|cleanup|all]

# Configuration
BASE_URL="${BASE_URL:-https://www.manatap.ai}"
CRON_KEY="${CRON_KEY:-Boobies}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to test endpoint connectivity
test_connection() {
    echo -e "${BLUE}🧪 Testing endpoint connectivity...${NC}"
    
    response=$(curl -w "%{http_code}" -s -o test_response.json -X POST \
        -H "x-cron-key: $CRON_KEY" \
        -H "x-test-mode: true" \
        -H "Content-Type: application/json" \
        "$BASE_URL/api/cron/daily-price-update")
    
    if [ "$response" -eq 200 ]; then
        echo -e "${GREEN}✅ Connectivity test successful${NC}"
        echo "Response:"
        cat test_response.json | jq '.' 2>/dev/null || cat test_response.json
        rm -f test_response.json
        return 0
    else
        echo -e "${RED}❌ Connectivity test failed with HTTP $response${NC}"
        cat test_response.json 2>/dev/null || echo "No response body"
        rm -f test_response.json
        return 1
    fi
}

# Function to run price update
run_price_update() {
    echo -e "${BLUE}💰 Running daily price update...${NC}"
    
    response=$(curl -w "%{http_code}" -s -o price_response.json -X POST \
        -H "x-cron-key: $CRON_KEY" \
        -H "x-max-cards: 100" \
        -H "Content-Type: application/json" \
        "$BASE_URL/api/cron/daily-price-update")
    
    if [ "$response" -eq 200 ]; then
        echo -e "${GREEN}✅ Price update completed successfully${NC}"
        echo "Results:"
        
        updated=$(cat price_response.json | jq -r '.updated // "unknown"' 2>/dev/null || echo "unknown")
        processed=$(cat price_response.json | jq -r '.processed // "unknown"' 2>/dev/null || echo "unknown")
        api_calls=$(cat price_response.json | jq -r '.api_calls_made // "unknown"' 2>/dev/null || echo "unknown")
        
        echo "  • Prices updated: $updated"
        echo "  • Cards processed: $processed"  
        echo "  • API calls made: $api_calls"
    else
        echo -e "${RED}❌ Price update failed with HTTP $response${NC}"
        cat price_response.json 2>/dev/null || echo "No response body"
    fi
    
    rm -f price_response.json
}

# Function to run cache cleanup
run_cache_cleanup() {
    echo -e "${BLUE}🧹 Running cache cleanup...${NC}"
    
    response=$(curl -w "%{http_code}" -s -o cleanup_response.json -X POST \
        -H "x-cron-key: $CRON_KEY" \
        -H "Content-Type: application/json" \
        "$BASE_URL/api/cron/cleanup-price-cache")
    
    if [ "$response" -eq 200 ]; then
        echo -e "${GREEN}✅ Cache cleanup completed successfully${NC}"
        echo "Results:"
        
        cleaned=$(cat cleanup_response.json | jq -r '.cleaned // "unknown"' 2>/dev/null || echo "unknown")
        cutoff_time=$(cat cleanup_response.json | jq -r '.cutoff_time // "unknown"' 2>/dev/null || echo "unknown")
        
        echo "  • Entries cleaned: $cleaned"
        echo "  • Cutoff time: $cutoff_time"
    else
        echo -e "${RED}❌ Cache cleanup failed with HTTP $response${NC}"
        cat cleanup_response.json 2>/dev/null || echo "No response body"
    fi
    
    rm -f cleanup_response.json
}

# Main execution
case "${1:-all}" in
    "test")
        test_connection
        ;;
    "price")
        run_price_update
        ;;
    "cleanup")
        run_cache_cleanup
        ;;
    "all")
        echo -e "${YELLOW}Running all cron job tests...${NC}"
        echo ""
        test_connection
        echo ""
        run_price_update
        echo ""
        run_cache_cleanup
        ;;
    *)
        echo "Usage: $0 [test|price|cleanup|all]"
        echo ""
        echo "Commands:"
        echo "  test    - Test endpoint connectivity only"
        echo "  price   - Run price update job"
        echo "  cleanup - Run cache cleanup job"  
        echo "  all     - Run all tests (default)"
        echo ""
        echo "Environment variables:"
        echo "  BASE_URL  - Your app base URL (default: https://your-app.com)"
        echo "  CRON_KEY  - Your cron authentication key"
        exit 1
        ;;
esac