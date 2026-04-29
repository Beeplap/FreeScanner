import { createClient } from "@supabase/supabase-js";

const SUPABASE_SCANS_BUCKET = "scans";
const SUPABASE_SCAN_PAGES_TABLE = "scan_pages";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Supabase env" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Delete only expired objects/rows to keep your storage budget under control.
  const nowIso = new Date().toISOString();

  // 1) Fetch expired storage paths
  const { data: expiredRows, error: selectError } = await supabaseAdmin
    .from(SUPABASE_SCAN_PAGES_TABLE)
    .select("storage_path")
    .lt("expires_at", nowIso)
    .limit(2000);

  if (selectError) {
    return new Response(JSON.stringify({ ok: false, error: selectError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const paths =
    expiredRows?.map((r: any) => r.storage_path).filter((p: any) => typeof p === "string" && p.length > 0) ?? [];

  // 2) Remove storage objects (best-effort; if some are already missing, that's fine)
  if (paths.length > 0) {
    await supabaseAdmin.storage.from(SUPABASE_SCANS_BUCKET).remove(paths).catch(() => {});
  }

  // 3) Delete expired rows
  try {
    await supabaseAdmin.from(SUPABASE_SCAN_PAGES_TABLE).delete().lt("expires_at", nowIso);
  } catch {
    // best-effort cleanup
  }

  return new Response(JSON.stringify({ ok: true, deleted_paths: paths.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

