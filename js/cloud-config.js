window.FHT_CLOUD_CONFIG = {
  // Turn this on after creating the Supabase table in supabase/schema.sql.
  enabled: true,
  provider: "supabase",

  // Supabase Project Settings -> API.
  supabaseUrl: "https://xxgbzbysinubshcybqiu.supabase.co",
  supabaseAnonKey: "sb_publishable_m986AzT6MOkbPgS7JB2s0g_1EFXZoI1",

  // Data is stored under the signed-in user's auth.uid().
  syncId: null
};
