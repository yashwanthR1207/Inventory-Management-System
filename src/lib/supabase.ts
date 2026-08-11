import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create a supabase client that gracefully handles missing env vars.
// On Vercel, these MUST be set in the project's Environment Variables settings.
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Create a dummy client that will fail gracefully rather than crash the page
  console.warn(
    '⚠️ NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. ' +
    'Set these in your Vercel project Environment Variables.'
  );
  supabase = createClient(
    'https://placeholder.supabase.co',
    'placeholder-key'
  );
}

export { supabase };
