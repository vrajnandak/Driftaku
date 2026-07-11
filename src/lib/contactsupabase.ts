// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Replace these with your actual Supabase project URL and Anon Key
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL_CONTACT;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY_CONTACT;

export const contact_supabase = createClient(supabaseUrl, supabaseAnonKey);