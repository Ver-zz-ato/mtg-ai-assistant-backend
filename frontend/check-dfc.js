require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBloodlineKeeper() {
  console.log('Checking scryfall_cache for bloodline keeper entries...\n');
  
  // Check all variants
  const { data, error } = await supabase
    .from('scryfall_cache')
    .select('name')
    .ilike('name', '%bloodline keeper%')
    .limit(20);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Found entries:', data?.length || 0);
  console.log(JSON.stringify(data, null, 2));
}

checkBloodlineKeeper();

