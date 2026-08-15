// One-time broadcast: sends a real Web Push notification (the kind that
// shows up in the phone's own notification tray, same as any other app --
// not just the in-app bell) to every currently-saved push subscription.
// Unlike send-reminder-pushes, this isn't on a schedule and doesn't check
// per-user reminder settings -- it fires once, to everyone who has push
// notifications enabled at all, whenever this function is invoked.
//
// Reuses the same VAPID keys already configured for send-reminder-pushes
// (Edge Function secrets are shared project-wide), but checks its own
// secret (ANNOUNCEMENT_SECRET) rather than CRON_SECRET, since this isn't
// called by pg_cron and that value was never meant to be reused here.
//
// Deploy with: `supabase functions deploy send-announcement-push --no-verify-jwt`
// Invoke with: curl -X POST https://<project-ref>.supabase.co/functions/v1/send-announcement-push \
//   -H "X-Announcement-Secret: <the ANNOUNCEMENT_SECRET value>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const ANNOUNCEMENT_SECRET = Deno.env.get("ANNOUNCEMENT_SECRET")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Edit this before deploying/invoking if the wording should change.
const MESSAGE = {
  title: "Crescamus",
  body: "Happy Solemnity of the Assumption! Wishing you a blessed feast day.",
};

Deno.serve(async (req) => {
  if (req.headers.get("X-Announcement-Secret") !== ANNOUNCEMENT_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(MESSAGE)
      );
      sent++;
    } catch (err) {
      failed++;
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed, total: (subs || []).length }), { status: 200 });
});
