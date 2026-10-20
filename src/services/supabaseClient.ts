import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di file environment.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export function supabaseErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return 'Permintaan belum dapat diproses.';
  if (error.code === 'invalid_credentials') return 'Email atau password salah.';
  if (error.code === 'email_not_confirmed') return 'Email belum dikonfirmasi. Periksa inbox Anda.';
  if (error.code === '23505') return 'Data tersebut sudah terdaftar.';
  return error.message || 'Permintaan belum dapat diproses.';
}
