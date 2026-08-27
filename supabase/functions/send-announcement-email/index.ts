// Reusable broadcast: sends a real email, via Resend, to every registered
// user's account address. Unlike send-announcement-push (a one-time,
// hardcoded-message function), this is meant to be called again for future
// announcements -- the subject and body are passed in on each request
// rather than baked into the code, so a new announcement never needs a
// redeploy.
//
// Recipient emails live in auth.users, which needs the service_role key --
// never shipped to a browser -- so this has to run server-side. Sends one
// Resend call per recipient rather than one email with everyone in "to":
// putting every address in a single "to" field would expose the entire
// user base's email addresses to each other, which is exactly the kind of
// bulk-email mistake this loop exists to avoid.
//
// Deploy with: `supabase functions deploy send-announcement-email --no-verify-jwt`
// Secrets needed (see SUPABASE_SETUP.md):
//   ANNOUNCEMENT_EMAIL_SECRET  -- shared secret this endpoint checks (distinct
//                                 from send-announcement-push's own secret,
//                                 so rotating one never affects the other)
//   RESEND_API_KEY             -- from resend.com, after the crescamus.app
//                                 sending domain is verified there
//   EMAIL_FROM_ADDRESS         -- e.g. "Crescamus <hello@crescamus.app>"
//                                 (must be on the verified domain)
//
// Invoke with:
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/send-announcement-email \
//     -H "X-Announcement-Email-Secret: <the secret value>" \
//     -H "Content-Type: application/json" \
//     -d '{"subject": "...", "html": "<p>...</p>"}'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANNOUNCEMENT_EMAIL_SECRET = Deno.env.get("ANNOUNCEMENT_EMAIL_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const EMAIL_FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") || "Crescamus <hello@crescamus.app>";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// auth.users' own listUsers() call is paginated (50 per page by default) --
// this walks every page rather than assuming the whole user base fits in
// one response, since that assumption breaks silently as the app grows.
async function fetchAllUserEmails(): Promise<string[]> {
  const emails: string[] = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email) emails.push(u.email);
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return emails;
}

async function sendOne(to: string, subject: string, html: string, text?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM_ADDRESS, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("X-Announcement-Email-Secret") !== ANNOUNCEMENT_EMAIL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { subject?: string; html?: string; text?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  const { subject, html, text } = payload;
  if (!subject || !html) {
    return new Response(JSON.stringify({ error: "Both 'subject' and 'html' are required" }), { status: 400 });
  }

  const emails = await fetchAllUserEmails();

  let sent = 0;
  let failed = 0;
  const failures: { email: string; error: string }[] = [];

  for (const email of emails) {
    try {
      await sendOne(email, subject, html, text);
      sent++;
    } catch (err) {
      failed++;
      failures.push({ email, error: (err as Error).message });
    }
    // Resend's default rate limit is 2 requests/second on most plans --
    // this keeps a large recipient list from tripping it mid-run.
    await new Promise((r) => setTimeout(r, 550));
  }

  return new Response(JSON.stringify({ sent, failed, total: emails.length, failures }), { status: 200 });
});
