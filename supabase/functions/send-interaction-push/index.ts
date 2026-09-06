// Called directly from Postgres (via net.http_post -- see migration 028,
// notify_on_like/notify_on_comment) the instant someone likes or comments on
// your post, even if you're nowhere near the app. Unlike send-reminder-pushes
// this isn't on a schedule and doesn't scan every profile: the trigger
// already knows exactly who to notify and what to say, so this function's
// only job is "send this one push to this one user's devices."
//
// Deploy with: `supabase functions deploy send-interaction-push --no-verify-jwt`
// (--no-verify-jwt because the caller is a Postgres trigger, not a logged-in
// user -- see the X-Internal-Secret check below for the actual auth on this
// endpoint. Reuses the same CRON_SECRET value already stored in Vault as
// 'cron_secret' for send-reminder-pushes -- no new secret to set up.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.headers.get("X-Internal-Secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { recipient_id?: string; title?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { recipient_id, title, body } = payload;
  if (!recipient_id || !title || !body) {
    return new Response("Missing recipient_id, title, or body", { status: 400 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", recipient_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body })
      );
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = the browser/OS says this subscription is gone for good
      // (uninstalled, data cleared, etc.) -- stop trying it forever.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { status: 200 });
});
