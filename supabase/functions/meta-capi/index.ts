import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sha256 = async (value: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(hash)).map((n) => n.toString(16).padStart(2, '0')).join('');
};
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('META_CAPI_RUNNER_SECRET');
  if (!secret || req.headers.get('x-meta-capi-secret') !== secret) return json({ error: 'Unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = Deno.env.get('META_ADS_TOKEN'), pixelId = Deno.env.get('META_PIXEL_ID');
  if (!token || !pixelId) return json({ error: 'Missing META_ADS_TOKEN or META_PIXEL_ID' }, 500);
  const { data: candidates, error } = await admin.from('meta_ads_conversion_events').select('id, meta_event_id, event_name, payload, attempts').in('status', ['pending', 'failed']).lt('attempts', 5).order('created_at').limit(25);
  if (error) return json({ error: error.message }, 500);
  let sent = 0, failed = 0, skipped = 0;
  for (const event of candidates || []) {
    const { data: locked } = await admin.from('meta_ads_conversion_events').update({ status: 'sending', attempts: Number(event.attempts || 0) + 1, last_attempt_at: new Date().toISOString(), error: null }).eq('id', event.id).in('status', ['pending', 'failed']).select('id').maybeSingle();
    if (!locked) { skipped++; continue; }
    const data = event.payload || {}, attribution = data.attribution || {}, user = data.user_data || attribution.metadata?.user_data || {};
    const user_data: Record<string, unknown> = {};
    if (user.email) user_data.em = [await sha256(String(user.email))];
    if (user.phone) user_data.ph = [await sha256(String(user.phone).replace(/\D/g, ''))];
    if (attribution.fbclid) user_data.fbc = 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + attribution.fbclid;
    if (user.fbp) user_data.fbp = user.fbp;
    const payload = { data: [{ event_name: event.event_name, event_time: Math.floor(Date.now() / 1000), event_id: event.meta_event_id, action_source: 'system_generated', user_data, custom_data: { value: Number(data.value || 0), currency: data.currency || 'BRL' } }] };
    try {
      const res = await fetch('https://graph.facebook.com/v20.0/' + pixelId + '/events?access_token=' + encodeURIComponent(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const response = await res.json().catch(() => ({}));
      if (!res.ok || response.error) throw new Error(response.error?.message || 'Meta CAPI ' + res.status);
      await admin.from('meta_ads_conversion_events').update({ status: 'sent', response, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', event.id);
      sent++;
    } catch (cause) {
      await admin.from('meta_ads_conversion_events').update({ status: 'failed', error: cause instanceof Error ? cause.message : String(cause), updated_at: new Date().toISOString() }).eq('id', event.id);
      failed++;
    }
  }
  return json({ ok: true, sent, failed, skipped });
});
