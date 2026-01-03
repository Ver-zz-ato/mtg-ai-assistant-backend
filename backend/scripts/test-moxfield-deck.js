// backend/scripts/test-moxfield-deck.js
// Test if a Moxfield deck ID is accessible and valid

import fetch from 'node-fetch';

const deckId = process.argv[2];

if (!deckId) {
  console.log('Usage: node test-moxfield-deck.js <deck-id>');
  console.log('Example: node test-moxfield-deck.js szfgyYf7QEKVBYxIG-C_oQ');
  process.exit(1);
}

async function testDeck(deckId) {
  console.log(`Testing deck ID: ${deckId}\n`);

  // Test API endpoint
  console.log('1. Testing API endpoint...');
  try {
    const apiUrl = `https://api.moxfield.com/v2/decks/all/${deckId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'ManaTap-AI-Deck-Importer/1.0',
        'Accept': 'application/json',
        'Referer': 'https://www.moxfield.com/'
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✓ API works!`);
      console.log(`   Deck name: ${data.name || 'N/A'}`);
      console.log(`   Format: ${data.format || 'N/A'}`);
      console.log(`   Commander: ${data.commanders ? Object.keys(data.commanders)[0] : 'N/A'}`);
      console.log(`   Mainboard cards: ${data.mainboard ? Object.keys(data.mainboard).length : 0}`);
      
      // Count total cards
      let totalCards = 0;
      if (data.mainboard) {
        for (const card of Object.values(data.mainboard)) {
          totalCards += card.quantity || 1;
        }
      }
      if (data.commanders) {
        totalCards += Object.keys(data.commanders).length;
      }
      console.log(`   Total cards: ${totalCards}`);
      
      if (totalCards === 100) {
        console.log(`   ✓ Valid 100-card Commander deck!`);
        return true;
      } else {
        console.log(`   ⚠ Not exactly 100 cards (expected for Commander)`);
      }
    } else {
      console.log(`   ✗ API failed`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
  }

  // Test web page
  console.log('\n2. Testing web page...');
  try {
    const webUrl = `https://www.moxfield.com/decks/${deckId}`;
    const response = await fetch(webUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const html = await response.text();
      
      // Check for various patterns
      const patterns = [
        { name: '__MOXFIELD_DEALERSHIP__', regex: /window\.__MOXFIELD_DEALERSHIP__/ },
        { name: '__INITIAL_STATE__', regex: /window\.__INITIAL_STATE__/ },
        { name: 'mainboard', regex: /"mainboard"/ },
        { name: 'commanders', regex: /"commanders"/ },
      ];

      let found = false;
      for (const pattern of patterns) {
        if (pattern.regex.test(html)) {
          console.log(`   ✓ Found ${pattern.name} in page`);
          found = true;
        }
      }

      if (!found) {
        console.log(`   ✗ Could not find deck data patterns in page`);
      }

      // Check if page says deck is private
      if (html.includes('private') || html.includes('Private')) {
        console.log(`   ⚠ Deck appears to be private`);
      }
    } else {
      console.log(`   ✗ Web page failed`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
  }

  return false;
}

testDeck(deckId).then(success => {
  if (success) {
    console.log(`\n✅ Deck ID ${deckId} is valid and accessible!`);
    process.exit(0);
  } else {
    console.log(`\n❌ Deck ID ${deckId} is not accessible or invalid.`);
    console.log(`\nTry:`);
    console.log(`1. Visit https://www.moxfield.com/decks/${deckId} in a browser`);
    console.log(`2. Check if the deck is public`);
    console.log(`3. Verify the deck ID is correct`);
    process.exit(1);
  }
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
