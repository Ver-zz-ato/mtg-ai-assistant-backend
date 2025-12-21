# Cost to Finish Prompt Fix

## Issue
The AI incorrectly interprets "Cost to Finish" as the mana cost required to cast win conditions, when it actually refers to the total monetary price (USD/EUR/GBP) needed to purchase missing cards to complete a deck.

## Fix Required
Update the chat system prompt via the admin interface at `/admin/ai-test` to add the following clarification:

```
IMPORTANT: "Cost to Finish" refers to the total monetary price (in USD/EUR/GBP) 
needed to purchase the cards you don't already own to complete a deck. It is NOT 
about mana costs or casting costs. When users ask about "Cost to Finish", explain 
that it shows the price of missing cards based on current market prices.
```

## Test Case Updated
The test case in `frontend/lib/data/ai_test_cases.json` has been updated with:
- `shouldContain`: Terms related to monetary price, missing cards, market prices
- `shouldNotContain`: Terms related to mana cost, casting cost

This ensures the AI correctly explains Cost to Finish as a monetary price feature.
