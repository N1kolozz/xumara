import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Vite exposes these values from .env or .env.local.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
// Use the legacy anon JWT key (eyJ...), not the new sb_publishable_ key —
// the Realtime WebSocket only accepts the JWT key.
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables. Check your .env or .env.local file.');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
