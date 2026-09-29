import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/types";

/**
 * Client Supabase pour le navigateur.
 *
 * N'utilise que la clé publiable, conçue pour être exposée : la protection
 * des données repose sur la RLS, jamais sur le secret de cette clé.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
