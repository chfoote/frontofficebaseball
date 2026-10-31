import { createClient } from "npm:@supabase/supabase-js@2";

type Delivery = {
  id: number;
  trade_offer_id: number;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  message: string;
  attempt_count: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("TRADE_EMAIL_FROM");
  const siteUrl = (Deno.env.get("SITE_URL") || "https://greatlakesdynasty.ca").replace(/\/$/, "");
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: "Supabase server secrets are missing." }, { status: 500 });
  if (!resendApiKey || !emailFrom) return Response.json({ error: "RESEND_API_KEY and TRADE_EMAIL_FROM must be configured." }, { status: 503 });

  let batchSize = 10;
  try { batchSize = Math.max(1, Math.min((await request.json() as { batch_size?: number }).batch_size || 10, 50)); } catch { /* default batch */ }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("claim_trade_email_deliveries", { p_limit: batchSize });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const delivery of (data || []) as Delivery[]) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: emailFrom,
          to: [delivery.recipient_email],
          subject: delivery.subject,
          text: `${delivery.message}\n\nReview trades: ${siteUrl}/trade-manager`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2 style="color:#16213e">Great Lakes Dynasty Hockey League</h2><p>Hello${delivery.recipient_name ? ` ${escapeHtml(delivery.recipient_name)}` : ""},</p><p>${escapeHtml(delivery.message)}</p><p><a href="${siteUrl}/trade-manager" style="display:inline-block;background:#465fff;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Review trade</a></p><p style="color:#667085;font-size:12px">Trade offer #${delivery.trade_offer_id}</p></div>`,
        }),
      });
      const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (!response.ok) throw new Error(responseBody.message || `Resend returned ${response.status}`);
      await supabase.from("trade_email_deliveries").update({ status: "sent", provider_message_id: responseBody.id || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", delivery.id);
      results.push({ id: delivery.id, status: "sent" });
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "Unknown email delivery error";
      const exhausted = delivery.attempt_count >= 8;
      const retryMinutes = Math.min(2 ** Math.max(delivery.attempt_count - 1, 0), 60);
      await supabase.from("trade_email_deliveries").update({ status: exhausted ? "failed" : "queued", last_error: lastError.slice(0, 1000), next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", delivery.id);
      results.push({ id: delivery.id, status: exhausted ? "failed" : "queued", error: lastError });
    }
  }
  return Response.json({ processed: results.length, results });
});
