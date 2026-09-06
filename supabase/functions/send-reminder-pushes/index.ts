// Runs every minute via pg_cron (see migration 016). Checks every profile's
// *local* time (using their stored IANA timezone) against their enabled
// reminders, and sends a real Web Push message for anything due right now --
// this is what fires reminders even with the app fully closed, unlike the
// tab-only setInterval scheduler in src/lib/reminders.js.
//
// Deploy with: `supabase functions deploy send-reminder-pushes --no-verify-jwt`
// (--no-verify-jwt because the caller is pg_cron, not a logged-in user --
// see the X-Cron-Secret check below for the actual auth on this endpoint).

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

// Mirrors LITURGICAL_PRAYERS in src/lib/reminders.js -- keep these two in
// sync if the wording or set of reminders ever changes.
const LITURGICAL: Record<string, { title: string; body: string }> = {
  morning: { title: "Morning Prayer", body: "Offer your day to God. Time for Morning Prayer." },
  angelus: { title: "The Angelus", body: "Time to pray the Angelus." },
  rosary: { title: "The Holy Rosary", body: "Time to pray the Rosary." },
  evening: { title: "Evening Examen", body: "Time for your evening examination of conscience." },
};

// Continue Reading -- unlike everything above, this isn't opt-in or
// user-configurable: it fires for every profile at these two fixed local
// times, every day. Personalized from reading_progress (migration 024),
// whichever book or Bible book they most recently opened; a generic nudge
// for anyone who's never read anything yet. Deno can't import frontend
// source, so the id -> display name lookups are duplicated here from
// src/data/mockData.js (BIBLE_BOOKS) and src/lib/books.js (BOOKS_LIBRARY)
// -- both small, stable lists; keep in sync if either changes.
const CONTINUE_READING_TIMES = ["09:00", "18:00"];

const BIBLE_BOOK_NAMES: Record<string, string> = {
  "gen": "Genesis", "exo": "Exodus", "lev": "Leviticus", "num": "Numbers", "deu": "Deuteronomy",
  "jos": "Joshua", "jud": "Judges", "rut": "Ruth", "1sam": "1 Samuel", "2sam": "2 Samuel",
  "1kin": "1 Kings", "2kin": "2 Kings", "1chr": "1 Chronicles", "2chr": "2 Chronicles", "ezr": "Ezra",
  "neh": "Nehemiah", "tob": "Tobit", "jdt": "Judith", "est": "Esther", "1mac": "1 Maccabees",
  "2mac": "2 Maccabees", "job": "Job", "psa": "Psalms", "pro": "Proverbs", "ecc": "Ecclesiastes",
  "sg": "Song of Songs", "wis": "Wisdom", "sir": "Sirach", "isa": "Isaiah", "jer": "Jeremiah",
  "lam": "Lamentations", "bar": "Baruch", "eze": "Ezekiel", "dan": "Daniel", "hos": "Hosea",
  "joe": "Joel", "amo": "Amos", "oba": "Obadiah", "jon": "Jonah", "mic": "Micah",
  "nah": "Nahum", "hab": "Habakkuk", "zep": "Zephaniah", "hag": "Haggai", "zec": "Zechariah",
  "mal": "Malachi", "mat": "Matthew", "mar": "Mark", "luk": "Luke", "joh": "John",
  "act": "Acts", "rom": "Romans", "1cor": "1 Corinthians", "2cor": "2 Corinthians", "gal": "Galatians",
  "eph": "Ephesians", "phi": "Philippians", "col": "Colossians", "1the": "1 Thessalonians", "2the": "2 Thessalonians",
  "1tim": "1 Timothy", "2tim": "2 Timothy", "tit": "Titus", "phm": "Philemon", "heb": "Hebrews",
  "jam": "James", "1pet": "1 Peter", "2pet": "2 Peter", "1joh": "1 John", "2joh": "2 John",
  "3joh": "3 John", "jud_nt": "Jude", "rev": "Revelation",
};

const CLASSICS_BOOK_NAMES: Record<string, string> = {
  "imitation-of-christ": "The Imitation of Christ",
  "confessions": "Confessions",
  "story-of-a-soul": "Story of a Soul",
};

function resolveContentName(contentType: string, contentId: string): string | null {
  if (contentType === "bible") return BIBLE_BOOK_NAMES[contentId] ?? null;
  if (contentType === "book") return CLASSICS_BOOK_NAMES[contentId] ?? null;
  return null;
}

function hhmmInTimezone(timeZone: string | null): string {
  const tz = timeZone || "UTC";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  } catch {
    // Unknown/garbled timezone string -- fall back to UTC rather than fail
    // the whole run over one bad profile.
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("X-Cron-Secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, timezone, reminders_enabled, reminder_times");

  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 });
  }

  // userId -> messages due this exact minute
  const due = new Map<string, { title: string; body: string }[]>();
  const addDue = (userId: string, title: string, body: string) => {
    if (!due.has(userId)) due.set(userId, []);
    due.get(userId)!.push({ title, body });
  };

  for (const profile of profiles || []) {
    const nowHHMM = hhmmInTimezone(profile.timezone);
    const enabled = profile.reminders_enabled || {};
    const times = profile.reminder_times || {};

    if (enabled.mercy && (nowHHMM === "03:00" || nowHHMM === "15:00")) {
      addDue(profile.id, "Divine Mercy Chaplet", "The Hour of Great Mercy. Time to pray the Chaplet of Divine Mercy.");
    }

    for (const [key, meta] of Object.entries(LITURGICAL)) {
      if (enabled[key] && times[key] && times[key] === nowHHMM) {
        addDue(profile.id, meta.title, meta.body);
      }
    }
  }

  // Personal prayer intentions live in their own table, each with its own
  // reminder time, independent of the liturgical ones above.
  const { data: intentions } = await supabase
    .from("prayer_intentions")
    .select("id, user_id, text, reminder_time, reminder_enabled, completed")
    .eq("reminder_enabled", true)
    .eq("completed", false);

  const timezoneById = new Map((profiles || []).map((p) => [p.id, p.timezone]));
  for (const intention of intentions || []) {
    const nowHHMM = hhmmInTimezone(timezoneById.get(intention.user_id) ?? null);
    if (intention.reminder_time === nowHHMM) {
      addDue(intention.user_id, "Prayer Intention", intention.text);
    }
  }

  // Continue Reading -- every profile, no enabled flag to check, at
  // either of the two fixed local times above.
  const continueReadingDue = (profiles || [])
    .filter((p) => CONTINUE_READING_TIMES.includes(hhmmInTimezone(p.timezone)))
    .map((p) => p.id);

  if (continueReadingDue.length > 0) {
    const { data: progressRows } = await supabase
      .from("reading_progress")
      .select("user_id, content_type, content_id, chapter, updated_at")
      .in("user_id", continueReadingDue)
      .order("updated_at", { ascending: false });

    // First row per user, in one query rather than one query per user --
    // rows are already ordered newest-first, so the first one seen per
    // user_id is that user's most recent reading_progress.
    const latestByUser = new Map<string, { content_type: string; content_id: string; chapter: number }>();
    for (const row of progressRows || []) {
      if (!latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row);
    }

    for (const userId of continueReadingDue) {
      const progress = latestByUser.get(userId);
      const name = progress ? resolveContentName(progress.content_type, progress.content_id) : null;
      if (progress && name) {
        addDue(userId, "Continue Reading", `${name}, Chapter ${progress.chapter} is waiting for you.`);
      } else {
        addDue(userId, "Time to Grow in Faith", "Take a few minutes today for Scripture or a spiritual classic.");
      }
    }
  }

  if (due.size === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), { status: 200 });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
    .in("user_id", [...due.keys()]);

  let sent = 0;
  let failed = 0;

  for (const sub of subs || []) {
    const messages = due.get(sub.user_id) || [];
    for (const msg of messages) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(msg)
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
  }

  return new Response(JSON.stringify({ sent, failed }), { status: 200 });
});
