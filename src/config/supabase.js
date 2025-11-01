const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase configuration missing:');
  console.error('  SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
  console.error('  SUPABASE_ANON_KEY:', supabaseKey ? 'Present' : 'Missing');
  throw new Error('Supabase URL and Anon Key are required');
}

const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

module.exports = supabase;