// ============================================================
// SUPABASE CLIENT — Edge Functions (Deno)
// ============================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function corsResponse(status = 204): Response {
  return new Response(null, { status, headers: corsHeaders });
}

export function corsJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export function getUserClient(jwt: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
}

export function extractJwt(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function verifySession(
  jwt: string
): Promise<{ userId: string; email: string } | null> {
  const client = getUserClient(jwt);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email! };
}

export async function verifyRoles(
  serviceClient: SupabaseClient,
  userId: string,
  roles: string[]
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("profile_roles")
    .select("role")
    .eq("profile_id", userId)
    .in("role", roles);
  if (error || !data?.length) return false;
  return true;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return corsJsonResponse(body, status);
}

export function errorResponse(message: string, code: string, status = 400): Response {
  return corsJsonResponse({ success: false, error: message, code }, status);
}
