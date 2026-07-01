// lib/supabase/edge.ts
// Thin wrapper para llamar Edge Functions con el JWT del usuario actual
import { createClient } from "./client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  payload: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return { data: null, error: "No session" };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!json.success) return { data: null, error: json.error ?? "Error desconocido" };
    return { data: json.data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Error de red" };
  }
}
