const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export const realtimeConfig = {
  supabaseUrl,
  supabasePublishableKey,
  hosted: Boolean(supabaseUrl && supabasePublishableKey)
};
