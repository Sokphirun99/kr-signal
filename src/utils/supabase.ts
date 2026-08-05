import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://swldhqwcwijgngheaynf.supabase.co";

const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_G-pUwInIdA2KblyqhqmvUA_sWBUt3zH";

export const supabase = createClient(supabaseUrl, supabaseKey);
