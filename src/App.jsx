import React, { useState, useEffect, useRef } from 'react';
import { BIBLE_BOOKS, SAINTS, SAINT_CATEGORIES, AUDIO_TRACKS, STORIES } from './data/mockData';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import * as api from './lib/api';
import { loadBibleChapter, BIBLE_VERSIONS } from './lib/bible';
import { getDailyVerse } from './data/dailyVerses';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from './data/legalContent';
import { MISSION, ABOUT_FEATURES, CONTENT_SOURCING_NOTE } from './data/aboutContent';
import { startReminderScheduler, requestNotificationPermission, getNotificationPermission, isNotificationSupported, unlockAlarmAudio, subscribeToPushNotifications, getDeviceTimezone } from './lib/reminders';
import { renderFormattedText, wrapSelection, prefixLines, insertAtCursor } from './lib/textFormatting';
import { downloadVerseImage } from './lib/verseImage';
import { downloadPostImage } from './lib/postImage';

// A curated set for the composer's emoji picker — everyday expression plus
// faith-relevant symbols, not the full unicode emoji set.
const MAX_COMPOSER_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB — generous for a short clip, cheap to fail fast on client rather than mid-upload
const POST_MAX_LENGTH = 2000; // matches the posts.text check constraint (schema.sql) — shown live so a long post is never silently rejected at submit time

const COMPOSER_EMOJIS = [
  '🙏', '❤️', '✝️', '🕊️', '😊', '😇', '🙌', '✨', '🌟', '⭐',
  '😢', '🥹', '😭', '🤗', '💪', '🙇', '😅', '😂', '🥳', '😍',
  '👍', '👏', '🎉', '🌹', '📿', '⛪', '☀️', '🌙', '🌈', '🔥',
  '💒', '📖', '🕯️', '👶', '👨‍👩‍👧‍👦', '🌍', '🍞', '🍷', '💧', '🐑'
];

// Premium Custom Outlined SVG Icons
const Icons = {
  Home: ({ active }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Bible: ({ active }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
      <path d="M6 6h10M6 10h10M6 14h10"/>
    </svg>
  ),
  Prayers: ({ active }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
    </svg>
  ),
  Audio: ({ active }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3" fill={active ? "currentColor" : "none"}/>
      <circle cx="18" cy="16" r="3" fill={active ? "currentColor" : "none"}/>
    </svg>
  ),
  Profile: ({ active }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4" fill={active ? "currentColor" : "none"}/>
    </svg>
  ),
  Search: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  Notification: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Emoji: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
      <line x1="9" y1="9" x2="9.01" y2="9"/>
      <line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
  ),
  Verified: ({ size = 14 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-label="Verified">
      <path d="M12 2 14.4 4.1 17.6 3.4 18.6 6.5 21.6 8 20.6 11.1 21.6 14.2 18.6 15.7 17.6 18.8 14.4 18.1 12 20.2 9.6 18.1 6.4 18.8 5.4 15.7 2.4 14.2 3.4 11.1 2.4 8 5.4 6.5 6.4 3.4 9.6 4.1Z" fill="#3B82F6"/>
      <path d="M8.5 12.2 11 14.7 15.5 9.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  Bookmark: ({ fill }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
    </svg>
  ),
  Heart: ({ fill }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    </svg>
  ),
  Comment: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Share: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
  Repost: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  ),
  VolumeOff: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  ),
  Halo: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8"/>
      <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
  Adjust: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  Play: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  Pause: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  ),
  Close: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Signal: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>
    </svg>
  ),
  Battery: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="10" rx="2" ry="2"/><line x1="22" y1="11" x2="22" y2="13"/>
      <line x1="6" y1="11" x2="6" y2="13"/><line x1="10" y1="11" x2="10" y2="13"/><line x1="14" y1="11" x2="14" y2="13"/>
    </svg>
  ),
  Globe: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
    </svg>
  ),
  Apple: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/>
      <path d="M10 2c1 .5 2 2 2 5"/>
    </svg>
  ),
  // The real Google "G" mark (Google's own brand guidelines require the
  // full-color mark, not a generic globe icon, on a "Sign in with Google"
  // button) -- standard four-color path data.
  Google: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"/>
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.37l4-3.09Z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"/>
    </svg>
  ),
  Sparkles: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
    </svg>
  ),
  Users: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Cross: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/>
    </svg>
  ),
  Calendar: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  Tag: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>
    </svg>
  ),
  Church: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 7 4 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9l4-2"/>
      <path d="M14 22v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/>
      <path d="M18 22V5l-6-3-6 3v17"/><path d="M12 7v5"/><path d="M10 9h4"/>
    </svg>
  ),
  Flame: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  ),
  Sunrise: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/>
      <path d="m17.66 12.34 1.41-1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>
    </svg>
  ),
  Moon: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  ),
  Rosary: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6"/><path d="M12 15v4"/><path d="M10 21h4"/>
    </svg>
  ),
  BookOpen: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  Dove: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/>
      <path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  Plus: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Circle: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
    </svg>
  ),
  UserPlus: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  ),
  UserCheck: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <polyline points="16 11 18 13 22 9"/>
    </svg>
  ),
  Volume: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  ),
  RotateCcw: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
    </svg>
  ),
  RotateCw: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
    </svg>
  ),
  Pin: ({ fill }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5"/><path d="M9 3h6l1 6 3 3v2H5v-2l3-3z"/>
    </svg>
  ),
  AtSign: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-5.5 8.28"/>
    </svg>
  ),
  SkipBack: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  SkipForward: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Download: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  Camera: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  ),
  Edit: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  ),
  Image: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  MoreVertical: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
    </svg>
  ),
  Trash: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
    </svg>
  ),
  MessageCircle: ({ active }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  ),
  Send: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  Flag: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  ),
  Ban: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>
    </svg>
  ),
  Shield: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  FileText: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  Gear: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Key: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
    </svg>
  ),
  LogOut: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  Bold: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>
    </svg>
  ),
  Italic: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
    </svg>
  ),
  Quote: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
    </svg>
  ),
  ListBullet: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  Eye: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  XLogo: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/>
    </svg>
  ),
  WhatsApp: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l1.4-4.6A9 9 0 1 1 8 19.5Z"/>
      <path d="M8.5 9.5c0 3 2 5.5 5.5 5.5.6 0 1-.5.8-1l-.6-1.6c-.15-.4-.6-.6-1-.45l-1 .35a5 5 0 0 1-2.5-2.5l.35-1c.15-.4-.05-.85-.45-1L8 7.3c-.5-.2-1 .2-1 .8Z"/>
    </svg>
  ),
  Facebook: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h-2a5 5 0 0 0-5 5v3H6v4h2v6h4v-6h3l1-4h-4V8a1 1 0 0 1 1-1h3Z"/>
    </svg>
  ),
  LinkIcon: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
};

export default function App() {
  // Splash & Auth States
  const [splashActive, setSplashActive] = useState(true);
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);
  // Whether we've actually resolved a persisted session one way or the
  // other -- true right away in demo mode (nothing to check), but in live
  // mode only once getSession() found no session, or once a found session's
  // profile has fully loaded. Keeps the splash up instead of letting a
  // returning user flash past the Welcome/sign-in screens on a slow
  // connection while their real session is still loading in the background.
  const [authKnown, setAuthKnown] = useState(!isSupabaseConfigured);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [welcomeStage, setWelcomeStage] = useState('hero'); // 'hero' | 'chooser' | 'form'
  
  // Auth Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [regUsername, setRegUsername] = useState(''); // unique @handle claimed at registration
  const [parish, setParish] = useState('');

  // Community & Following States
  const [users, setUsers] = useState([]);
  const [followListOpen, setFollowListOpen] = useState(null); // { userId, username, type: 'followers' | 'following' } | null
  const [followListData, setFollowListData] = useState([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [myUsername, setMyUsername] = useState('');
  const [myAvatar, setMyAvatar] = useState(api.fallbackAvatar(''));
  const [myIsVerified, setMyIsVerified] = useState(false);
  const [bio, setBio] = useState('');
  const [myFollowerCount, setMyFollowerCount] = useState(0);

  // Profile Editing States
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [editUsernameStatus, setEditUsernameStatus] = useState({ state: 'idle', message: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Live Backend States (only used when Supabase is configured)
  const [session, setSession] = useState(null);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState(''); // '' | 'saving' | 'saved' | error message
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState({ state: 'idle', message: '' });
  const [newPostText, setNewPostText] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMedia, setComposerMedia] = useState(null); // { file, preview, type: 'image' | 'video' } | null
  const [composerPosting, setComposerPosting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [composerPreview, setComposerPreview] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const composerTextareaRef = useRef(null);
  const [postMenuOpen, setPostMenuOpen] = useState(null); // post id whose "..." menu is open
  const [editingPost, setEditingPost] = useState(null); // post being edited, or null
  const [editPostText, setEditPostText] = useState('');
  const [editPostSaving, setEditPostSaving] = useState(false);
  const [reshareMenuOpen, setReshareMenuOpen] = useState(null); // post id whose Repost/Quote choice is open
  const [shareMenuOpen, setShareMenuOpen] = useState(null); // post id whose Share destination menu is open
  const [copiedShareId, setCopiedShareId] = useState(null); // post id that just had its link copied (brief "Copied!" feedback)
  const [savingImagePostId, setSavingImagePostId] = useState(null); // post id currently being rendered to a downloadable image
  const [quoteReshareTarget, setQuoteReshareTarget] = useState(null); // post being quote-reshared, or null
  const [quoteReshareText, setQuoteReshareText] = useState('');

  // Moderation & Legal States
  const [blocks, setBlocks] = useState([]); // raw block rows touching me, either direction
  const [mutedUserIds, setMutedUserIds] = useState(new Set());
  const [reportTarget, setReportTarget] = useState(null); // { postId?, userId, label }
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [legalView, setLegalView] = useState(null); // null | 'privacy' | 'terms'
  const [aboutOpen, setAboutOpen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [profileTab, setProfileTab] = useState('posts'); // 'posts' | 'reshares' | 'bookmarks'
  const [personProfileTab, setPersonProfileTab] = useState('posts'); // 'posts' | 'reshares' -- someone else's profile (no Bookmarks tab, that's private)

  // Direct Messages States (live mode populates this once the real session loads)
  const [conversations, setConversations] = useState([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [activeChatUser, setActiveChatUser] = useState(null); // { id/userId, name, username, avatar }
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatImage, setChatImage] = useState(null); // { file, preview } | null
  const [chatSending, setChatSending] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const chatScrollRef = useRef(null);

  // Main UI Navigation States
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'bible' | 'prayers' | 'audio' | 'profile'
  const [subView, setSubView] = useState(null); // null | 'search' | 'saints' | 'saintsBrowse' | 'person'
  const [saintCategoryFilter, setSaintCategoryFilter] = useState('All');
  const [activeSaint, setActiveSaint] = useState(null);
  const [copiedSaintShare, setCopiedSaintShare] = useState(false);
  const [activePerson, setActivePerson] = useState(null); // user id
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Global Settings States
  // Was plain useState('light') with nothing writing it back anywhere, so
  // switching to dark mode never survived a reload or a new day's session
  // -- it silently reset to light every time. Read the saved choice back
  // on load, falling back to 'light' the same as before if nothing's been
  // saved yet.
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('crescamus-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [bibleFontSize, setBibleFontSize] = useState(16);
  const [bibleSettingsOpen, setBibleSettingsOpen] = useState(false);

  // Bible Reader States
  const [selectedBook, setSelectedBook] = useState(BIBLE_BOOKS.find(b => b.id === 'mat')); // Matthew default
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [bibleTab, setBibleTab] = useState('NT'); // 'OT' | 'NT'
  const [bibleBookmarks, setBibleBookmarks] = useState([]);
  const [bibleHighlights, setBibleHighlights] = useState([]);
  const [verseModeActive, setVerseModeActive] = useState(false);
  const [chapterGridBook, setChapterGridBook] = useState(null); // book awaiting a chapter pick
  const [chapterVerses, setChapterVerses] = useState([]);
  const [versesLoading, setVersesLoading] = useState(true);
  const [bibleVersion, setBibleVersion] = useState('dr'); // see BIBLE_VERSIONS
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);

  // Prayers Dashboard States — streak/calendar are computed from real
  // prayer_logs history in live mode (see api.computeStreak/computeWeekCalendar),
  // not stored as a standalone number that can drift from reality.
  const [prayerLogs, setPrayerLogs] = useState([]); // [{prayer_key, completed_on}]
  const [prayersCompleted, setPrayersCompleted] = useState({
    morning: false,
    angelus: false,
    rosary: false,
    mercy: false,
    evening: false
  });
  const [personalPrayers, setPersonalPrayers] = useState([]);
  const [newPersonalPrayer, setNewPersonalPrayer] = useState('');
  const [newPersonalPrayerTime, setNewPersonalPrayerTime] = useState('');
  const [intentionError, setIntentionError] = useState('');
  const [reminders, setReminders] = useState({
    morning: '07:00',
    angelus: '12:00',
    rosary: '18:00',
    evening: '21:00'
  });
  // Whether each reminder is actively scheduled to fire — separate from
  // prayersCompleted (today's done/not-done), which drives the streak.
  const [remindersEnabled, setRemindersEnabled] = useState({
    morning: false,
    angelus: false,
    rosary: false,
    mercy: false,
    evening: false
  });
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentPasswordValue, setCurrentPasswordValue] = useState('');
  const [changePasswordValue, setChangePasswordValue] = useState('');
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changePasswordStatus, setChangePasswordStatus] = useState(''); // '', 'saving', 'saved', or an error message

  const todayStr = new Date().toISOString().slice(0, 10);
  const streakCount = api.computeStreak(prayerLogs);
  const weekCalendar = api.computeWeekCalendar(prayerLogs);

  // Audio Player States
  const [currentTrack, setCurrentTrack] = useState(AUDIO_TRACKS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackProgress, setTrackProgress] = useState(0);
  const [trackDuration, setTrackDuration] = useState(185);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [sleepTimeLeft, setSleepTimeLeft] = useState(null);
  // currentTrack defaults to a real track before anyone's pressed play, so
  // gating the mini-player on currentTrack alone made it appear unprompted
  // on first load. audioSessionStarted only flips once playback has
  // actually happened; miniPlayerDismissed is the user's own "hide it" --
  // someone asked for exactly this: closeable, and back the next time they
  // press play (see the isPlaying effect below).
  const [audioSessionStarted, setAudioSessionStarted] = useState(false);
  const [miniPlayerDismissed, setMiniPlayerDismissed] = useState(false);
  const [playerExpanded, setPlayerExpanded] = useState(false);

  // Social Feed & Interaction States
  const [posts, setPosts] = useState([]);
  const [storyOpen, setStoryOpen] = useState(null); // null | story object
  const [activeCommentPost, setActiveCommentPost] = useState(null); // postId or null
  const [commentInputs, setCommentInputs] = useState({});
  const [replyingTo, setReplyingTo] = useState(null); // commentId whose reply box is open, or null
  const [replyInputs, setReplyInputs] = useState({}); // commentId -> draft reply text
  const [activePostId, setActivePostId] = useState(null); // postId whose detail view is open
  const [fullscreenImage, setFullscreenImage] = useState(null); // image URL shown in the tap-to-zoom overlay, or null
  const [scrollToCommentId, setScrollToCommentId] = useState(null); // set alongside activePostId when a notification points at a specific comment
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  // Persisted the same way theme is: reading it back on load means a
  // reload doesn't silently snap back to "For You" for someone who'd
  // switched to "Following" -- which would itself look like "the top post
  // changed on reload" even though the ranking logic was never at fault.
  const [feedMode, setFeedMode] = useState(() => {
    try {
      return localStorage.getItem('crescamus-feed-mode') === 'following' ? 'following' : 'forYou';
    } catch {
      return 'forYou';
    }
  }); // 'forYou' (ranked) | 'following' (chronological, followed authors only)
  const [pullDistance, setPullDistance] = useState(0); // live drag offset while pulling down to refresh, 0 when idle
  const pullStartYRef = useRef(null);
  const mainScrollRef = useRef(null);

  // @mention autocomplete -- one shared dropdown, driven by whichever
  // post/comment input the user is currently typing an @mention into.
  // { query, rect, tokenStart, cursorPos, el, value, setValue } | null
  const [mentionState, setMentionState] = useState(null);

  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('All'); // 'All' | 'People' | 'Bible' | 'Saints' | 'Audio' | 'Posts'

  // Notifications State
  const [notifications, setNotifications] = useState([]);

  // Audio element references
  const audioRef = useRef(null);
  const sleepTimerRef = useRef(null);

  // Mobile on-screen keyboards shrink the visible (visual) viewport without
  // resizing the layout viewport -- so full-height overlays like the chat
  // thread, sized by inset:0, don't actually shrink when the keyboard
  // opens, and their bottom-pinned input bar ends up hidden behind the
  // keyboard instead of sitting right above it. Tracking the real visual
  // viewport height here and applying it as this custom property lets
  // those overlays shrink to fit above the keyboard instead.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => document.documentElement.style.setProperty('--visual-vh', `${vv.height}px`);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  // 1. Splash fadeout effect -- a 2s minimum so the branding always shows,
  // plus an 8s failsafe so a hung network request can never leave someone
  // stuck on the splash screen forever (see the splashMinElapsed/authKnown
  // effect below for the normal, sooner path off the splash).
  useEffect(() => {
    const minTimer = setTimeout(() => setSplashMinElapsed(true), 2000);
    const maxTimer = setTimeout(() => setSplashActive(false), 8000);
    return () => { clearTimeout(minTimer); clearTimeout(maxTimer); };
  }, []);

  // Only actually drop the splash once both the minimum branding time has
  // passed AND we know the real auth state -- otherwise a returning user
  // on a slow connection would see the splash end into the Welcome/sign-in
  // screens for a moment before their restored session finishes loading
  // and swaps them into the real app underneath.
  useEffect(() => {
    if (splashMinElapsed && authKnown) setSplashActive(false);
  }, [splashMinElapsed, authKnown]);

  // 1z. Open straight to a shared saint's page if the URL was shared via
  // the saint detail view's share button (see shareSaintLink) -- a
  // lightweight hash-based deep link rather than a full router, since
  // this is the only place in the app that currently needs one.
  useEffect(() => {
    const match = window.location.hash.match(/^#saint=([a-z0-9_-]+)$/i);
    if (!match) return;
    const saint = SAINTS.find(s => s.id === match[1]);
    if (!saint) return;
    setActiveSaint(saint);
    setSubView('saints');
  }, []);

  // 2. Synchronize theme styling variables, and remember the choice so it's
  // still there next time instead of quietly reverting to light.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('crescamus-theme', theme);
    } catch {
      // Private browsing / storage disabled -- theme just won't persist,
      // not worth surfacing an error for.
    }
  }, [theme]);

  // 2a-2. Remember the Home feed tab (For You / Following) the same way.
  useEffect(() => {
    try {
      localStorage.setItem('crescamus-feed-mode', feedMode);
    } catch {
      // Same as theme above -- not worth surfacing an error for.
    }
  }, [feedMode]);

  // 2z. Close the post "..." menu when clicking anywhere else
  useEffect(() => {
    if (postMenuOpen === null) return;
    const closeMenu = (e) => {
      if (!e.target.closest('.post-menu-wrap')) setPostMenuOpen(null);
    };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [postMenuOpen]);

  // 2a. Load real scripture text for the selected book/chapter (lazy per book)
  useEffect(() => {
    let cancelled = false;
    setVersesLoading(true);
    loadBibleChapter(selectedBook.id, selectedChapter, bibleVersion).then(verses => {
      if (!cancelled) {
        setChapterVerses(verses);
        setVersesLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [selectedBook, selectedChapter, bibleVersion]);

  // 2b. Track the Supabase auth session (live mode only)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // No persisted session to restore -- nothing left to wait on, so the
      // splash can hand off to the Welcome screen as soon as its minimum
      // time is up. If there IS a session, authKnown instead waits for 2c
      // below to finish loading the profile.
      if (!data.session) setAuthKnown(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Clicking the emailed reset link lands here with a special recovery
      // session — without this, it silently logs the user into the normal
      // app with no indication a reset is even in progress.
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryMode(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 2c. When a live session appears, load my profile, the community and the feed
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!session) {
      setIsLoggedIn(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const profile = await api.fetchMyProfile(session.user.id);
      if (cancelled) return;
      if (!profile) {
        // A session that still passes auth but whose profile row is gone --
        // the account was deleted (deleteMyAccount signs out immediately
        // now, but a session cached from before that fix, or deleted by
        // some other path, can still land here). Rather than silently
        // logging in as a blank/default "Catholic Pilgrim" profile, treat
        // it the same as not being signed in at all.
        if (isSupabaseConfigured) await api.signOut();
        setSession(null);
        setIsLoggedIn(false);
        setAuthKnown(true);
        return;
      }
      const [community, feed, followerCount, notifs, convos, unreadMsgs, logs, intentions, myBlocks, myMutes, highlights, bookmarks] = await Promise.all([
        api.fetchCommunity(session.user.id),
        api.fetchFeed(session.user.id),
        api.fetchMyFollowerCount(session.user.id),
        api.fetchNotifications(session.user.id),
        api.fetchConversations(session.user.id),
        api.fetchUnreadMessageCount(session.user.id),
        api.fetchPrayerLogs(session.user.id),
        api.fetchPrayerIntentions(session.user.id),
        api.fetchBlocks(session.user.id),
        api.fetchMutes(session.user.id),
        api.fetchBibleHighlights(session.user.id),
        api.fetchBibleBookmarks(session.user.id)
      ]);
      if (cancelled) return;
      setUsername(profile.full_name || profile.username);
      setMyUsername(profile.username);
      setParish(profile.parish || '');
      setBio(profile.bio || '');
      setMyAvatar(profile.avatar_url || api.fallbackAvatar(profile.full_name || profile.username));
      setMyIsVerified(!!profile.is_verified);
      if (profile.reminder_times) setReminders(prev => ({ ...prev, ...profile.reminder_times }));
      if (profile.reminders_enabled) setRemindersEnabled(profile.reminders_enabled);
      if (community) setUsers(community);
      setPosts(feed || []);
      setMyFollowerCount(followerCount);
      setNotifications(notifs);
      setConversations(convos);
      setUnreadMessageCount(unreadMsgs);
      setPrayerLogs(logs);
      const today = new Date().toISOString().slice(0, 10);
      const todaysKeys = new Set(logs.filter(l => l.completed_on === today).map(l => l.prayer_key));
      setPrayersCompleted({
        morning: todaysKeys.has('morning'),
        angelus: todaysKeys.has('angelus'),
        rosary: todaysKeys.has('rosary'),
        mercy: todaysKeys.has('mercy'),
        evening: todaysKeys.has('evening')
      });
      setPersonalPrayers(intentions);
      setBlocks(myBlocks);
      setMutedUserIds(new Set(myMutes));
      setBibleHighlights(highlights);
      setBibleBookmarks(bookmarks);
      setIsLoggedIn(true);
      setAuthKnown(true);
    })();
    return () => { cancelled = true; };
  }, [session]);

  // 2c-2. Live notifications: refresh the list whenever a new one arrives
  // (likes, comments, follows are inserted server-side by DB triggers).
  useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    const unsubscribe = api.subscribeToNotifications(session.user.id, () => {
      api.fetchNotifications(session.user.id).then(setNotifications);
    });
    return unsubscribe;
  }, [session]);

  // 2c-3. Live direct messages: refresh the inbox, and if the sender's
  // thread is open right now, append the new message straight into it.
  useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    const unsubscribe = api.subscribeToMessages(session.user.id, (payload) => {
      api.fetchConversations(session.user.id).then(setConversations);
      api.fetchUnreadMessageCount(session.user.id).then(setUnreadMessageCount);
      const senderId = payload.new?.sender_id;
      setActiveChatUser(current => {
        if (current && (current.userId || current.id) === senderId) {
          api.fetchMessages(session.user.id, senderId).then(setChatMessages);
          api.markConversationRead(session.user.id, senderId).catch(() => {});
        }
        return current;
      });
    });
    return unsubscribe;
  }, [session]);

  // 2c-4. Auto-scroll the open chat thread to the newest message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // 2c-5. Real reminder notifications. The scheduler runs on one interval
  // started once; it reads current toggles/times/intentions through a ref
  // (rather than being restarted on every change) so it never fires from
  // stale closure state.
  const reminderStateRef = useRef({ remindersEnabled, reminderTimes: reminders, personalPrayers });
  useEffect(() => {
    reminderStateRef.current = { remindersEnabled, reminderTimes: reminders, personalPrayers };
  });
  useEffect(() => {
    return startReminderScheduler(() => reminderStateRef.current);
  }, []);

  // The alarm tone a reminder plays needs the AudioContext unlocked by a
  // real user gesture at some point first — browsers block audio that
  // starts without one. Any first tap/click anywhere in the app satisfies
  // that, well before a reminder ever actually needs to ring.
  useEffect(() => {
    const unlock = () => unlockAlarmAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // 2d. Live username availability check while registering (live mode only)
  useEffect(() => {
    if (!isSupabaseConfigured || authMode !== 'register') return;
    if (!regUsername) {
      setUsernameStatus({ state: 'idle', message: '' });
      return;
    }
    const fmt = getUsernameFormatError(regUsername);
    if (fmt) {
      setUsernameStatus({ state: 'invalid', message: fmt });
      return;
    }
    setUsernameStatus({ state: 'checking', message: 'Checking availability...' });
    const uname = normalizeUsername(regUsername);
    const timer = setTimeout(async () => {
      const { available } = await api.checkUsernameAvailable(uname);
      setUsernameStatus(available
        ? { state: 'available', message: `@${uname} is available` }
        : { state: 'taken', message: 'This username is already taken.' });
    }, 400);
    return () => clearTimeout(timer);
  }, [regUsername, authMode]);

  // 2e. Live username availability check while editing an existing profile
  useEffect(() => {
    if (!isSupabaseConfigured || !profileEditOpen || !editDraft) return;
    const newUsername = normalizeUsername(editDraft.username || '');
    if (!newUsername || newUsername === myUsername) {
      setEditUsernameStatus({ state: 'idle', message: '' });
      return;
    }
    const fmt = getUsernameFormatError(newUsername);
    if (fmt) {
      setEditUsernameStatus({ state: 'invalid', message: fmt });
      return;
    }
    setEditUsernameStatus({ state: 'checking', message: 'Checking availability...' });
    const timer = setTimeout(async () => {
      const { available } = await api.checkUsernameAvailable(newUsername, session?.user?.id);
      setEditUsernameStatus(available
        ? { state: 'available', message: `@${newUsername} is available` }
        : { state: 'taken', message: 'This username is already taken.' });
    }, 400);
    return () => clearTimeout(timer);
  }, [editDraft?.username, profileEditOpen]);

  // 3. Audio Player Audio Element Controls
  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  // Handle track rate changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Jumps to the exact comment a notification pointed at, once the post
  // detail view (which renders detailPost.comments synchronously from
  // already-loaded state -- no async fetch to wait on) has painted it.
  useEffect(() => {
    if (!activePostId || !scrollToCommentId) return;
    const el = document.querySelector(`[data-comment-id="${scrollToCommentId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('comment-highlight');
      setTimeout(() => el.classList.remove('comment-highlight'), 2000);
    }
    setScrollToCommentId(null);
  }, [activePostId, scrollToCommentId]);

  // Sleep Timer Counter
  useEffect(() => {
    if (sleepTimeLeft === null) {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
      return;
    }
    
    if (sleepTimeLeft <= 0) {
      setIsPlaying(false);
      setSleepTimeLeft(null);
      return;
    }

    sleepTimerRef.current = setInterval(() => {
      setSleepTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(sleepTimerRef.current);
  }, [sleepTimeLeft]);

  // Every time playback actually starts (first play, resume, skip to
  // another track), that's the mini-player's cue to be visible again --
  // whether this is the very first play of the session (audioSessionStarted
  // was still false) or the user dismissed it earlier and pressed play
  // again since (miniPlayerDismissed was still true).
  useEffect(() => {
    if (!isPlaying) return;
    setAudioSessionStarted(true);
    setMiniPlayerDismissed(false);
  }, [isPlaying]);

  // Audio Events
  const onTimeUpdate = () => {
    if (audioRef.current) {
      setTrackProgress(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setTrackDuration(audioRef.current.duration || currentTrack.duration);
    }
  };

  // Shared by the "next"/"previous" buttons, the end-of-track auto-advance,
  // and the swipe gesture on the now-playing screen -- one place that
  // decides what "skip" means (wraps around at either end of the list).
  const playTrackAtOffset = (offset) => {
    const currentIndex = AUDIO_TRACKS.findIndex(t => t.id === currentTrack.id);
    const nextIndex = (currentIndex + offset + AUDIO_TRACKS.length) % AUDIO_TRACKS.length;
    setTrackProgress(0);
    setCurrentTrack(AUDIO_TRACKS[nextIndex]);
    setIsPlaying(true);
  };
  const playNextTrack = () => playTrackAtOffset(1);
  const playPreviousTrack = () => playTrackAtOffset(-1);

  const onTrackEnded = () => {
    setIsPlaying(false);
    setTrackProgress(0);
    playNextTrack();
  };

  // Swipe left (finger moves right-to-left) advances to the next track;
  // swipe right (left-to-right) goes to the previous one -- only on the
  // now-playing cover/title, so it doesn't fight with dragging the seek
  // slider or tapping the transport buttons underneath.
  const swipeStartRef = useRef(null);
  const SWIPE_THRESHOLD_PX = 50;

  const handlePlayerSwipeStart = (e) => {
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handlePlayerSwipeEnd = (e) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Require a clearly horizontal gesture, not an incidental wobble while
    // scrolling or tapping.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) playPreviousTrack();
    else playNextTrack();
  };

  const handleSeek = (value) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setTrackProgress(value);
    }
  };

  const formatTime = (secs) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // 4. Social Feed Actions (optimistic UI; persisted to Supabase in live mode)
  //
  // `postId` here is always the underlying ORIGINAL post's id. A reshared
  // post can appear as two separate feed entries (the original, and the
  // reshare) with different `id`s but the same `originalPostId` — matching
  // on that instead of `id` keeps likes/bookmarks/comments in sync across
  // every entry that displays the same post, the same way a real feed would.
  const handleLikePost = (postId) => {
    const target = posts.find(p => p.originalPostId === postId);
    setPosts(prev => prev.map(post => {
      if (post.originalPostId === postId) {
        return {
          ...post,
          isLiked: !post.isLiked,
          likes: post.isLiked ? post.likes - 1 : post.likes + 1
        };
      }
      return post;
    }));
    if (isSupabaseConfigured && session && target) {
      api.setLike(postId, session.user.id, !target.isLiked).catch(() => {});
    }
  };

  const handleBookmarkPost = (postId) => {
    const target = posts.find(p => p.originalPostId === postId);
    setPosts(prev => prev.map(post => {
      if (post.originalPostId === postId) {
        return {
          ...post,
          isBookmarked: !post.isBookmarked
        };
      }
      return post;
    }));
    if (isSupabaseConfigured && session && target) {
      api.setBookmark(postId, session.user.id, !target.isBookmarked).catch(() => {});
    }
  };

  const handleReshare = (post, quoteText = null) => {
    const originalId = post.originalPostId;
    if (posts.some(p => p.originalPostId === originalId && p.resharedBy?.username === myUsername)) return;

    const tempId = `reshare-local-${Date.now()}`;
    setPosts(prev => [
      {
        ...post,
        id: tempId,
        reshareId: tempId,
        resharedBy: { name: username || 'You', username: myUsername || '' },
        resharedAt: 'Just now',
        quoteText: quoteText || null,
        createdAt: new Date().toISOString()
      },
      ...prev.map(p => p.originalPostId === originalId ? { ...p, resharesCount: (p.resharesCount || 0) + 1 } : p)
    ]);
    if (isSupabaseConfigured && session) {
      api.reshare(originalId, session.user.id, quoteText || null).catch(() => {});
    }
  };

  const handleQuoteReshare = () => {
    const text = quoteReshareText.trim();
    if (!quoteReshareTarget || !text) return;
    handleReshare(quoteReshareTarget, text);
    setQuoteReshareTarget(null);
    setQuoteReshareText('');
  };

  // There's no per-post route in this app yet, so the shared link is just
  // the app itself -- the excerpt in the share text carries the content.
  const getShareUrl = () => window.location.origin;
  const getShareText = (post) => {
    const excerpt = post.text.length > 100 ? `${post.text.slice(0, 100)}…` : post.text;
    return `"${excerpt}" — via Crescamus`;
  };

  const shareToX = (post) => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText(post))}&url=${encodeURIComponent(getShareUrl())}`, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(null);
  };
  const shareToWhatsApp = (post) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${getShareText(post)} ${getShareUrl()}`)}`, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(null);
  };
  const shareToFacebook = (_post) => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}`, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(null);
  };
  const shareViaNative = async (post) => {
    try { await navigator.share({ title: 'Crescamus', text: getShareText(post), url: getShareUrl() }); } catch {}
    setShareMenuOpen(null);
  };
  const copyShareLink = async (post) => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopiedShareId(post.id);
      setTimeout(() => setCopiedShareId(null), 1500);
    } catch {}
  };
  const shareAsImage = async (post) => {
    setSavingImagePostId(post.id);
    try {
      await downloadPostImage(post);
    } finally {
      setSavingImagePostId(null);
      setShareMenuOpen(null);
    }
  };

  // Unlike posts, a saint has a real (if lightweight) deep link -- see the
  // #saint= hash effect near the top of the component -- so sharing one
  // actually opens straight to that saint for whoever receives it, not
  // just the app's home screen.
  const getSaintShareUrl = (saint) => `${window.location.origin}/#saint=${saint.id}`;

  const shareSaintLink = async (saint) => {
    const url = getSaintShareUrl(saint);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: `${saint.name} — Crescamus`, text: `Read about ${saint.name} on Crescamus`, url }); } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSaintShare(true);
      setTimeout(() => setCopiedSaintShare(false), 1500);
    } catch {}
  };

  const handleUndoReshare = (post) => {
    setPostMenuOpen(null);
    setPosts(prev => prev.filter(p => p.id !== post.id));
    if (isSupabaseConfigured && session) {
      api.undoReshare(post.originalPostId, session.user.id).catch(() => {});
    }
  };

  const toggleMuteUser = (userId) => {
    setPostMenuOpen(null);
    const isMuted = mutedUserIds.has(userId);
    setMutedUserIds(prev => {
      const next = new Set(prev);
      if (isMuted) next.delete(userId); else next.add(userId);
      return next;
    });
    if (isSupabaseConfigured && session) {
      api.setMute(userId, session.user.id, !isMuted).catch(() => {});
    }
  };

  // Shared by top-level comments and one-level-deep replies: finds a comment
  // by id whether it's top-level or nested inside another comment's replies.
  const findCommentInPost = (post, commentId) => {
    for (const c of post?.comments || []) {
      if (c.id === commentId) return c;
      const reply = c.replies?.find(r => r.id === commentId);
      if (reply) return reply;
    }
    return null;
  };

  // Applies `updater` to the comment matching commentId, at whichever level
  // (top-level or reply) it lives at, leaving everything else untouched.
  const updateCommentInPost = (post, commentId, updater) => ({
    ...post,
    comments: post.comments.map(c => {
      if (c.id === commentId) return updater(c);
      if (c.replies?.some(r => r.id === commentId)) {
        return { ...c, replies: c.replies.map(r => r.id === commentId ? updater(r) : r) };
      }
      return c;
    })
  });

  // Called from the onChange of every mention-enabled post/comment input.
  // Looks at the text right before the cursor; if it ends in a partial
  // "@word" token, opens the shared suggestion dropdown anchored under
  // that specific input. One piece of state serves every input in the
  // app since only one can be focused (and typing an @mention) at a time.
  const updateMentionState = (el, value, setValue) => {
    const pos = el.selectionStart;
    const uptoCursor = value.slice(0, pos);
    const match = uptoCursor.match(/(?:^|\s)@([a-z0-9._]{0,20})$/i);
    if (!match) {
      setMentionState(null);
      return;
    }
    setMentionState({
      query: match[1].toLowerCase(),
      rect: el.getBoundingClientRect(),
      tokenStart: pos - match[1].length - 1,
      cursorPos: pos,
      el,
      value,
      setValue
    });
  };

  const mentionSuggestions = mentionState
    ? users.filter(u => u.username.startsWith(mentionState.query)).slice(0, 5)
    : [];

  // Replaces the partial @token being typed with the chosen username, then
  // restores focus and the cursor to right after it.
  const applyMention = (username) => {
    if (!mentionState) return;
    const { el, value, setValue, tokenStart, cursorPos } = mentionState;
    // Only add a trailing space when there isn't already one right after the
    // token -- otherwise completing a mention in the middle of existing text
    // (e.g. "Hi @jo| how are you") would leave a double space behind.
    const nextChar = value[cursorPos];
    const insertion = `@${username}${nextChar === ' ' || nextChar === '\n' ? '' : ' '}`;
    const newValue = `${value.slice(0, tokenStart)}${insertion}${value.slice(cursorPos)}`;
    setValue(newValue);
    setMentionState(null);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = tokenStart + insertion.length;
      el.setSelectionRange(newPos, newPos);
    });
  };

  // As with likes/bookmarks above, `postId` is always the underlying
  // original post's id so comments stay in sync across every feed entry
  // (original + any reshares) that displays that same post.
  const handleAddComment = (postId) => {
    const text = commentInputs[postId];
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const tempId = `local-${Date.now()}`;

    setPosts(prev => prev.map(post => post.originalPostId !== postId ? post : {
      ...post,
      commentsCount: post.commentsCount + 1,
      comments: [...post.comments, { id: tempId, user: username || 'User', userIsVerified: myIsVerified, text: trimmed, likes: 0, isLiked: false, replies: [] }]
    }));
    if (isSupabaseConfigured && session) {
      // Swap the temp id for the real one once the insert resolves, so a
      // like on this comment (which needs a real id) works right away.
      api.addComment(postId, session.user.id, trimmed).then(({ data }) => {
        if (!data) return;
        setPosts(prev => prev.map(post => post.originalPostId !== postId ? post : {
          ...post,
          comments: post.comments.map(c => c.id === tempId ? { ...c, id: data.id } : c)
        }));
      }).catch(() => {});
    }

    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
  };

  const handleAddReply = (postId, parentCommentId) => {
    const text = replyInputs[parentCommentId];
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const tempId = `local-${Date.now()}`;

    setPosts(prev => prev.map(post => post.originalPostId !== postId ? post : {
      ...post,
      commentsCount: post.commentsCount + 1,
      comments: post.comments.map(c => c.id !== parentCommentId ? c : {
        ...c,
        replies: [...(c.replies || []), { id: tempId, user: username || 'User', userIsVerified: myIsVerified, text: trimmed, likes: 0, isLiked: false }]
      })
    }));
    if (isSupabaseConfigured && session) {
      api.addComment(postId, session.user.id, trimmed, parentCommentId).then(({ data }) => {
        if (!data) return;
        setPosts(prev => prev.map(post => post.originalPostId !== postId ? post : {
          ...post,
          comments: post.comments.map(c => c.id !== parentCommentId ? c : {
            ...c,
            replies: c.replies.map(r => r.id === tempId ? { ...r, id: data.id } : r)
          })
        }));
      }).catch(() => {});
    }

    setReplyInputs(prev => ({ ...prev, [parentCommentId]: '' }));
    setReplyingTo(null);
  };

  const handleLikeComment = (postId, commentId) => {
    const targetPost = posts.find(p => p.originalPostId === postId);
    const targetComment = targetPost && findCommentInPost(targetPost, commentId);
    if (!targetComment) return;

    setPosts(prev => prev.map(post => {
      if (post.originalPostId !== postId) return post;
      return updateCommentInPost(post, commentId, c => ({
        ...c,
        isLiked: !c.isLiked,
        likes: (c.likes || 0) + (c.isLiked ? -1 : 1)
      }));
    }));
    if (isSupabaseConfigured && session) {
      api.setCommentLike(commentId, session.user.id, !targetComment.isLiked).catch(() => {});
    }
  };

  // Shared by the feed's inline comment drawer and the full post detail
  // view — a top-level comment plus its one level of replies, a reply
  // button, and (when open) that comment's reply input.
  const renderCommentThread = (postId, comment) => (
    <div key={comment.id} className="comment-thread" data-comment-id={comment.id}>
      <div className="comment-row-likeable">
        <span>
          <span className="comment-user">{comment.user}</span>
          {comment.userIsVerified && <Icons.Verified size={11} />}
          <span className="comment-text">{comment.text}</span>
        </span>
        <button
          className={`comment-like-btn ${comment.isLiked ? 'liked' : ''}`}
          onClick={() => handleLikeComment(postId, comment.id)}
        >
          <Icons.Heart fill={comment.isLiked} />
          {comment.likes > 0 && <span>{comment.likes}</span>}
        </button>
      </div>
      <button
        className="comment-reply-btn"
        onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
      >
        Reply
      </button>

      {replyingTo === comment.id && (
        <div className="comment-input-box comment-reply-input-box">
          <input
            type="text"
            className="comment-input"
            placeholder={`Reply to ${comment.user}...`}
            value={replyInputs[comment.id] || ''}
            onChange={(e) => {
              const v = e.target.value;
              setReplyInputs({ ...replyInputs, [comment.id]: v });
              updateMentionState(e.target, v, (nv) => setReplyInputs(prev => ({ ...prev, [comment.id]: nv })));
            }}
            onBlur={() => setMentionState(null)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !mentionState) handleAddReply(postId, comment.id); }}
            autoFocus
          />
          <button className="comment-submit-btn" onClick={() => handleAddReply(postId, comment.id)}>
            <Icons.ArrowRight />
          </button>
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map(reply => (
            <div key={reply.id} className="comment-row-likeable comment-reply-row" data-comment-id={reply.id}>
              <span>
                <span className="comment-user">{reply.user}</span>
                {reply.userIsVerified && <Icons.Verified size={11} />}
                <span className="comment-text">{reply.text}</span>
              </span>
              <button
                className={`comment-like-btn ${reply.isLiked ? 'liked' : ''}`}
                onClick={() => handleLikeComment(postId, reply.id)}
              >
                <Icons.Heart fill={reply.isLiked} />
                {reply.likes > 0 && <span>{reply.likes}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Shared by the main feed and the profile's "My Posts" tab, so a post gets
  // the exact same like/comment/reshare/share treatment no matter where it's
  // viewed from -- previously the profile tab had its own stripped-down copy
  // with static counts and no working actions.
  const renderPostCard = (post, { showPinnedBadge = false } = {}) => (
    <div key={post.id} className="card">
      {showPinnedBadge && post.isPinned && (
        <div className="post-pinned-badge"><Icons.Pin fill /> Pinned</div>
      )}
      {post.resharedBy && (
        <div className="reshare-banner">
          <Icons.Repost /> {post.resharedBy.username === myUsername ? 'You' : post.resharedBy.name} reshared
        </div>
      )}
      {post.quoteText && (
        <p className="quote-reshare-text">{post.quoteText}</p>
      )}
      <div className="feed-header">
        <div className="feed-user-info" onClick={() => openPersonProfile(post.user.username)} style={{ cursor: 'pointer' }}>
          <img src={post.user.avatar} className="feed-user-avatar" alt={post.user.name} />
          <div>
            <div className="feed-user-name">
              {post.user.name} {post.user.isVerified && <Icons.Verified />} <span className="feed-username">@{post.user.username}</span>
            </div>
            {post.user.parish && <div className="feed-user-parish"><Icons.Church /> {post.user.parish}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(() => {
            const author = users.find(u => u.username === post.user.username);
            return author && !author.isFollowing ? (
              <button className="follow-chip" onClick={() => toggleFollowUser(author.id)}>
                {author.isFollowedBy ? 'Follow Back' : 'Follow'}
              </button>
            ) : null;
          })()}
          <span className="feed-time">{post.time}</span>
          <div className="post-menu-wrap">
            <button
              className="icon-btn"
              onClick={() => setPostMenuOpen(postMenuOpen === post.id ? null : post.id)}
            >
              <Icons.MoreVertical />
            </button>
            {postMenuOpen === post.id && (
              <div className="post-menu-dropdown">
                {post.resharedBy?.username === myUsername ? (
                  <button className="post-menu-item danger" onClick={() => handleUndoReshare(post)}>
                    <Icons.Trash /> Remove Repost
                  </button>
                ) : post.user.username === myUsername ? (
                  <>
                    {!post.isPinned && myPinnedCount >= 2 ? (
                      <div className="post-menu-item disabled" title="Unpin another post first -- max 2 pinned posts">
                        <Icons.Pin /> Pin to Profile
                      </div>
                    ) : (
                      <button className="post-menu-item" onClick={() => handleTogglePin(post)}>
                        <Icons.Pin fill={post.isPinned} /> {post.isPinned ? 'Unpin from Profile' : 'Pin to Profile'}
                      </button>
                    )}
                    <button className="post-menu-item" onClick={() => openEditPost(post)}>
                      <Icons.Edit /> Edit Post
                    </button>
                    <button className="post-menu-item danger" onClick={() => handleDeletePost(post.originalPostId)}>
                      <Icons.Trash /> Delete Post
                    </button>
                  </>
                ) : (
                  <>
                    {(() => {
                      const author = users.find(u => u.username === post.user.username);
                      const muted = author && mutedUserIds.has(author.id);
                      return (
                        <button className="post-menu-item" onClick={() => author && toggleMuteUser(author.id)}>
                          <Icons.VolumeOff /> {muted ? 'Unmute' : 'Mute'} @{post.user.username}
                        </button>
                      );
                    })()}
                    <button
                      className="post-menu-item"
                      onClick={() => {
                        const author = users.find(u => u.username === post.user.username);
                        openReport({ postId: post.originalPostId, userId: author?.id, label: `${post.user.name}'s post` });
                      }}
                    >
                      <Icons.Flag /> Report Post
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="feed-text" onClick={() => setActivePostId(post.id)} style={{ cursor: 'pointer' }}>{renderFormattedText(post.text, openPersonProfile)}</div>
      {post.video && <video src={post.video} className="feed-image" controls playsInline />}
      {post.image && <img src={post.image} className="feed-image" alt="post content" onClick={() => setActivePostId(post.id)} style={{ cursor: 'pointer' }} />}

      <div className="feed-actions">
        <button className={`feed-action-btn ${post.isLiked ? 'liked' : ''}`} onClick={() => handleLikePost(post.originalPostId)}>
          <Icons.Heart fill={post.isLiked} />
          <span>{post.likes}</span>
        </button>

        <button className="feed-action-btn" onClick={() => setActiveCommentPost(activeCommentPost === post.id ? null : post.id)}>
          <Icons.Comment />
          <span>{post.commentsCount}</span>
        </button>

        {post.user.username !== myUsername ? (
          <div className="post-menu-wrap">
            <button className="feed-action-btn" onClick={() => setReshareMenuOpen(reshareMenuOpen === post.id ? null : post.id)} title="Reshare">
              <Icons.Repost />
              <span>{post.resharesCount || 0}</span>
            </button>
            {reshareMenuOpen === post.id && (
              <div className="post-menu-dropdown">
                <button className="post-menu-item" onClick={() => { handleReshare(post); setReshareMenuOpen(null); }}>
                  <Icons.Repost /> Repost
                </button>
                <button className="post-menu-item" onClick={() => { setQuoteReshareTarget(post); setReshareMenuOpen(null); }}>
                  <Icons.Edit /> Quote
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="feed-action-btn" title="Reposts" style={{ cursor: 'default' }}>
            <Icons.Repost />
            <span>{post.resharesCount || 0}</span>
          </span>
        )}

        <button className={`feed-action-btn ${post.isBookmarked ? 'bookmarked' : ''}`} onClick={() => handleBookmarkPost(post.originalPostId)}>
          <Icons.Bookmark fill={post.isBookmarked} />
          <span>Save</span>
        </button>

        <div className="post-menu-wrap">
          <button className="feed-action-btn" onClick={() => setShareMenuOpen(shareMenuOpen === post.id ? null : post.id)} title="Share">
            <Icons.Share />
          </button>
          {shareMenuOpen === post.id && (
            <div className="post-menu-dropdown">
              {typeof navigator !== 'undefined' && navigator.share && (
                <button className="post-menu-item" onClick={() => shareViaNative(post)}>
                  <Icons.Share /> More options...
                </button>
              )}
              <button className="post-menu-item" onClick={() => shareToX(post)}>
                <Icons.XLogo /> X
              </button>
              <button className="post-menu-item" onClick={() => shareToWhatsApp(post)}>
                <Icons.WhatsApp /> WhatsApp
              </button>
              <button className="post-menu-item" onClick={() => shareToFacebook(post)}>
                <Icons.Facebook /> Facebook
              </button>
              <button className="post-menu-item" onClick={() => copyShareLink(post)}>
                <Icons.LinkIcon /> {copiedShareId === post.id ? 'Copied!' : 'Copy Link'}
              </button>
              <button className="post-menu-item" onClick={() => shareAsImage(post)} disabled={savingImagePostId === post.id}>
                <Icons.Download /> {savingImagePostId === post.id ? 'Saving...' : 'Save as Image'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Comments Collapsed Panel */}
      {activeCommentPost === post.id && (
        <div className="comments-drawer">
          {post.comments.map((comment) => renderCommentThread(post.originalPostId, comment))}
          <div className="comment-input-box">
            <input
              type="text"
              className="comment-input"
              placeholder="Share your reflection..."
              value={commentInputs[post.originalPostId] || ''}
              onChange={(e) => {
                const v = e.target.value;
                setCommentInputs({ ...commentInputs, [post.originalPostId]: v });
                updateMentionState(e.target, v, (nv) => setCommentInputs(prev => ({ ...prev, [post.originalPostId]: nv })));
              }}
              onBlur={() => setMentionState(null)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !mentionState) handleAddComment(post.originalPostId); }}
            />
            <button className="comment-submit-btn" onClick={() => handleAddComment(post.originalPostId)}>
              <Icons.ArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Re-fetches the feed from the server so newly-posted content from other
  // users shows up without a full page reload. Demo mode has no server to
  // pull from, so it just scrolls back to the top.
  const refreshFeed = async () => {
    if (feedRefreshing) return;
    setFeedRefreshing(true);
    try {
      if (isSupabaseConfigured && session) {
        const feed = await api.fetchFeed(session.user.id);
        setPosts(feed || []);
      } else {
        // No server to actually pull from in demo mode, but a refresh that
        // resolves instantly reads as broken rather than "up to date" --
        // hold the spinner briefly so pull-to-refresh feels real.
        await new Promise(r => setTimeout(r, 500));
      }
    } finally {
      setFeedRefreshing(false);
    }
  };

  // Pull-to-refresh on the Home feed (Twitter/Instagram-style): drag down
  // from the very top of the scroll container past PULL_REFRESH_THRESHOLD
  // and release to trigger refreshFeed(). Only arms when the feed is
  // already scrolled to top, so it never fights a normal scroll gesture.
  const PULL_REFRESH_THRESHOLD = 64;
  const handleFeedPullStart = (e) => {
    if (activeTab !== 'home' || feedRefreshing) { pullStartYRef.current = null; return; }
    if ((mainScrollRef.current?.scrollTop || 0) > 0) { pullStartYRef.current = null; return; }
    pullStartYRef.current = e.touches[0].clientY;
  };
  const handleFeedPullMove = (e) => {
    if (pullStartYRef.current === null) return;
    const dy = e.touches[0].clientY - pullStartYRef.current;
    if (dy <= 0) { setPullDistance(0); return; }
    // Resistance curve so the indicator eases up the further it's pulled,
    // instead of tracking the finger 1:1 -- the same rubber-band feel every
    // native pull-to-refresh uses.
    setPullDistance(Math.min(dy * 0.5, 90));
  };
  const handleFeedPullEnd = () => {
    if (pullStartYRef.current === null) return;
    pullStartYRef.current = null;
    if (pullDistance >= PULL_REFRESH_THRESHOLD) {
      refreshFeed();
    }
    setPullDistance(0);
  };

  // Tapping Home (nav bar or the brand logo) always jumps to the top of the
  // feed and pulls in anything new — the standard "tap home to refresh"
  // pattern from Twitter/Instagram.
  const handleGoHome = () => {
    setActiveTab('home');
    setSubView(null);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    refreshFeed();
  };

  const openComposer = () => {
    setNewPostText('');
    setComposerMedia(null);
    setComposerError('');
    setComposerOpen(true);
  };

  const handleComposerMediaChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after removing it
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > MAX_COMPOSER_VIDEO_BYTES) {
      setComposerError(`Video is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size is ${MAX_COMPOSER_VIDEO_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setComposerError('');
    // Object URLs (not FileReader/base64) — a video can be tens of MB, and
    // base64-encoding it in memory just to preview it is wasteful.
    setComposerMedia({ file, preview: URL.createObjectURL(file), type: isVideo ? 'video' : 'image' });
  };

  const handleCreatePost = async () => {
    const text = newPostText.trim();
    if (!text && !composerMedia) return;
    if (newPostText.length > POST_MAX_LENGTH) return;

    setComposerError('');
    setComposerPosting(true);
    try {
      if (isSupabaseConfigured && session) {
        let imageUrl = null;
        let videoUrl = null;
        if (composerMedia) {
          const { url, error } = await api.uploadPostMedia(session.user.id, composerMedia.file);
          if (error) { setComposerError(`Could not upload ${composerMedia.type}: ${error.message}`); return; }
          if (composerMedia.type === 'video') videoUrl = url; else imageUrl = url;
        }
        const { post, error } = await api.createPost(text, imageUrl, videoUrl);
        if (error) { setComposerError(error.message); return; }
        if (post) setPosts(prev => [{ ...post, isLiked: false, isBookmarked: false }, ...prev]);
      } else {
        const localId = `local-${Date.now()}`;
        setPosts(prev => [{
          id: localId,
          originalPostId: localId,
          createdAt: new Date().toISOString(),
          resharedBy: null,
          user: {
            name: username || 'Catholic Pilgrim',
            username: myUsername || 'pilgrim',
            avatar: myAvatar,
            parish,
            isVerified: myIsVerified
          },
          time: 'Just now',
          text,
          image: composerMedia?.type === 'image' ? composerMedia.preview : null,
          video: composerMedia?.type === 'video' ? composerMedia.preview : null,
          likes: 0,
          resharesCount: 0,
          commentsCount: 0,
          comments: [],
          isLiked: false,
          isBookmarked: false
        }, ...prev]);
      }
      setNewPostText('');
      setComposerMedia(null);
      setComposerOpen(false);
    } finally {
      setComposerPosting(false);
    }
  };

  const openEditPost = (post) => {
    setPostMenuOpen(null);
    setEditingPost(post);
    setEditPostText(post.text);
  };

  const handleSaveEditPost = async () => {
    if (!editingPost) return;
    const text = editPostText.trim();
    if (!text || editPostText.length > POST_MAX_LENGTH) return;
    const originalId = editingPost.originalPostId;

    setEditPostSaving(true);
    try {
      if (isSupabaseConfigured && session) {
        const { error } = await api.updatePost(originalId, text);
        if (error) return;
      }
      setPosts(prev => prev.map(p => p.originalPostId === originalId ? { ...p, text } : p));
      setEditingPost(null);
      setEditPostText('');
    } finally {
      setEditPostSaving(false);
    }
  };

  const handleDeletePost = (postId) => {
    setPostMenuOpen(null);
    if (!window.confirm('Delete this post? This cannot be undone.')) return;

    // Removes the original entry and any reshares of it — matches the DB's
    // own cascade delete on the reshares table.
    setPosts(prev => prev.filter(p => p.originalPostId !== postId));
    if (isSupabaseConfigured && session) {
      api.deletePost(postId).catch(() => {});
    }
  };

  // Max 2 pinned posts -- enforced here for immediate UI feedback (the menu
  // item disables itself once you're at the cap) and again server-side by a
  // DB trigger, since a client-side check alone couldn't stop a second tab
  // or a replayed request from sneaking past it.
  const myPinnedCount = posts.filter(p => p.user.username === myUsername && !p.resharedBy && p.isPinned).length;

  const handleTogglePin = (post) => {
    setPostMenuOpen(null);
    const pinning = !post.isPinned;
    if (pinning && myPinnedCount >= 2) return;
    const pinnedAt = pinning ? new Date().toISOString() : null;
    // Every feed entry sharing this original post (the post itself, and any
    // reshares of it) embeds the same underlying post data, so all of them
    // need updating together -- same reasoning as the like/comment sync
    // elsewhere.
    setPosts(prev => prev.map(p => p.originalPostId === post.originalPostId ? { ...p, isPinned: pinning, pinnedAt } : p));
    if (isSupabaseConfigured && session) {
      api.pinPost(post.originalPostId, pinning).catch(() => {});
    }
  };

  // Moderation: report + block. Reports are write-only from the client
  // (reviewed later in the Supabase dashboard); blocks hide content
  // mutually and are enforced server-side for messaging too.
  const openReport = (target) => {
    setPostMenuOpen(null);
    setReportTarget(target);
    setReportReason('');
    setReportDetails('');
    setReportSubmitted(false);
  };

  const closeReport = () => {
    setReportTarget(null);
    setReportReason('');
    setReportDetails('');
    setReportSubmitted(false);
  };

  const submitReport = async (e) => {
    e.preventDefault();
    if (!reportReason || !reportTarget) return;
    setReportSubmitting(true);
    try {
      if (isSupabaseConfigured && session) {
        await api.fileReport({
          reporterId: session.user.id,
          reportedUserId: reportTarget.userId || null,
          reportedPostId: reportTarget.postId || null,
          reason: reportReason,
          details: reportDetails
        });
      }
      setReportSubmitted(true);
    } finally {
      setReportSubmitting(false);
    }
  };

  const toggleBlockUser = async (userId) => {
    const myId = session?.user?.id;
    const isBlocked = blockedUserIds.has(userId);
    if (!isBlocked && !window.confirm("Block this person? They won't be able to message you, and you won't see each other's posts.")) return;

    if (isBlocked) {
      setBlocks(prev => prev.filter(b => !(b.blocker_id === myId && b.blocked_id === userId)));
      if (isSupabaseConfigured && session) api.unblockUser(myId, userId).catch(() => {});
    } else {
      setBlocks(prev => [...prev, { blocker_id: myId, blocked_id: userId }]);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isFollowing: false } : u));
      if (isSupabaseConfigured && session) api.blockUser(myId, userId).catch(() => {});
    }
  };

  // Clears everything that identifies "who's signed in" -- both the
  // account/profile fields and the auth form's own inputs. Used after
  // sign-out and account deletion so the next person to open the auth
  // flow on this device starts from a genuinely blank slate, not the
  // previous account's email/password still sitting in the form or its
  // name/avatar flashing before a new session loads.
  const resetLocalIdentityState = () => {
    setSession(null);
    setUsername('');
    setMyUsername('');
    setMyAvatar(api.fallbackAvatar(''));
    setMyIsVerified(false);
    setParish('');
    setBio('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setRegUsername('');
    setAgreedToTerms(false);
    setAuthError('');
    setAuthNotice('');
    setAuthMode('login');
    setWelcomeStage('hero');
  };

  const handleDeleteAccount = async () => {
    if (deleteAccountConfirmText !== 'DELETE') return;
    setDeleteAccountError('');
    setDeletingAccount(true);
    try {
      // deleteMyAccount() talks to the real Supabase client, which doesn't
      // exist in demo mode (see src/lib/supabase.js) -- there's no server
      // account to delete there anyway, so just clear local state below.
      if (isSupabaseConfigured) {
        const { error } = await api.deleteMyAccount();
        if (error) { setDeleteAccountError(error.message); return; }
        // deleteMyAccount() removes the account server-side but doesn't
        // sign the client out -- Supabase caches the session in
        // localStorage, so without this the next reload finds that
        // still-valid stale session and logs back in as a profile that no
        // longer exists (see the 2c effect's profile-null handling for
        // the other half of this).
        await api.signOut();
      }
      setIsLoggedIn(false);
      setDeleteAccountOpen(false);
      resetLocalIdentityState();
    } finally {
      setDeletingAccount(false);
    }
  };

  // 5. Prayer Streaks & Completing Reminders — completions persist as real
  // dated log rows, so the streak and weekly calendar reflect actual history
  // instead of a number that resets or drifts on reload.
  const togglePrayerCompleted = (prayerKey) => {
    const wasCompleted = prayersCompleted[prayerKey];
    setPrayersCompleted(prev => ({ ...prev, [prayerKey]: !wasCompleted }));
    setPrayerLogs(prev => wasCompleted
      ? prev.filter(l => !(l.prayer_key === prayerKey && l.completed_on === todayStr))
      : [...prev, { prayer_key: prayerKey, completed_on: todayStr }]);

    if (isSupabaseConfigured && session) {
      api.setPrayerLog(session.user.id, prayerKey, todayStr, !wasCompleted).catch(() => {});
    }
  };

  const handleAddPersonalPrayer = async (e) => {
    e.preventDefault();
    const text = newPersonalPrayer.trim();
    if (!text) return;
    const reminderTime = newPersonalPrayerTime || null;
    setIntentionError('');

    if (isSupabaseConfigured && session) {
      const { error } = await api.addPrayerIntention(session.user.id, text, reminderTime);
      if (error) { setIntentionError(error.message); return; } // keep the typed text so nothing is lost
      api.fetchPrayerIntentions(session.user.id).then(setPersonalPrayers);
    } else {
      setPersonalPrayers(prev => [{
        id: Date.now(), text, completed: false,
        reminder_time: reminderTime, reminder_enabled: !!reminderTime
      }, ...prev]);
    }
    setNewPersonalPrayer('');
    setNewPersonalPrayerTime('');
    if (reminderTime) maybeRequestNotificationPermission();
  };

  const togglePersonalPrayer = (id) => {
    const target = personalPrayers.find(p => p.id === id);
    setPersonalPrayers(prev => prev.map(p => p.id === id ? { ...p, completed: !p.completed } : p));
    if (isSupabaseConfigured && session && target) {
      api.setPrayerIntentionCompleted(id, !target.completed).catch(() => {});
    }
  };

  const deletePersonalPrayer = (id) => {
    setPersonalPrayers(prev => prev.filter(p => p.id !== id));
    if (isSupabaseConfigured && session) {
      api.deletePrayerIntention(id).catch(() => {});
    }
  };

  // Reminder enable/disable — separate from marking a prayer done today.
  // Turning a reminder on for the first time is also the natural moment to
  // ask for notification permission, rather than an out-of-context prompt.
  const maybeRequestNotificationPermission = async () => {
    if (!isNotificationSupported()) return;
    let permission = notificationPermission;
    if (permission !== 'granted') {
      permission = await requestNotificationPermission();
      setNotificationPermission(permission);
    }
    // Also covers people who granted permission before background push
    // existed -- this call is cheap and idempotent (getSubscription() first),
    // so it's safe to run every time this fires, not just on a fresh grant.
    if (permission === 'granted' && isSupabaseConfigured && session) {
      subscribeToPushNotifications().then((subscription) => {
        if (subscription) api.upsertPushSubscription(session.user.id, subscription).catch(() => {});
      });
      const timezone = getDeviceTimezone();
      if (timezone) api.updateMyTimezone(session.user.id, timezone).catch(() => {});
    }
  };

  const toggleReminderEnabled = (key) => {
    const next = { ...remindersEnabled, [key]: !remindersEnabled[key] };
    setRemindersEnabled(next);
    if (!remindersEnabled[key]) maybeRequestNotificationPermission();
    if (isSupabaseConfigured && session) {
      api.updateRemindersEnabled(session.user.id, next).catch(() => {});
    }
  };

  const handleReminderTimeChange = (key, value) => {
    const next = { ...reminders, [key]: value };
    setReminders(next);
    if (isSupabaseConfigured && session) {
      api.updateReminderTimes(session.user.id, next).catch(() => {});
    }
  };

  // 6. Usernames & Following
  const normalizeUsername = (value) => value.trim().toLowerCase().replace(/^@+/, '');

  const getUsernameFormatError = (value) => {
    const v = normalizeUsername(value);
    if (v.length < 3) return 'Username must be at least 3 characters.';
    if (v.length > 20) return 'Username must be 20 characters or less.';
    if (!/^[a-z0-9._]+$/.test(v)) return 'Use only letters, numbers, dots and underscores.';
    return '';
  };

  // Usernames are one-to-one. In live mode the database enforces this with a
  // UNIQUE constraint; in demo mode we check against the local member list.
  const getUsernameError = (value) => {
    const fmt = getUsernameFormatError(value);
    if (fmt) return fmt;
    if (!isSupabaseConfigured && users.some(u => u.username === normalizeUsername(value))) {
      return 'This username is already taken.';
    }
    return '';
  };

  // A real minimum bar rather than Supabase's bare default of "6
  // characters, anything at all" -- applied consistently at signup, the
  // in-app change-password form, and the emailed-reset-link form, so none
  // of the three entry points is weaker than the others.
  const getPasswordError = (value) => {
    if (value.length < 8) return 'Password must be at least 8 characters.';
    if (!/[a-zA-Z]/.test(value)) return 'Password must include at least one letter.';
    if (!/[0-9]/.test(value)) return 'Password must include at least one number.';
    return '';
  };

  const generateUniqueUsername = (base) => {
    const cleaned = normalizeUsername(base).replace(/[^a-z0-9._]+/g, '.').replace(/^\.+|\.+$/g, '') || 'pilgrim';
    let candidate = cleaned;
    let suffix = 1;
    while (users.some(u => u.username === candidate)) {
      candidate = `${cleaned}${++suffix}`;
    }
    return candidate;
  };

  const toggleFollowUser = (userId) => {
    const target = users.find(u => u.id === userId);
    setUsers(prev => prev.map(u => u.id === userId
      ? { ...u, isFollowing: !u.isFollowing, followers: u.followers + (u.isFollowing ? -1 : 1) }
      : u));
    if (isSupabaseConfigured && session && target) {
      api.setFollow(userId, session.user.id, !target.isFollowing).catch(() => {});
    }
  };

  const openFollowList = async (userId, username, type) => {
    setFollowListOpen({ userId, username, type });
    setFollowListData([]);
    if (isSupabaseConfigured && session) {
      setFollowListLoading(true);
      try {
        const list = type === 'followers'
          ? await api.fetchFollowers(userId, session.user.id)
          : await api.fetchFollowing(userId, session.user.id);
        setFollowListData(list);
      } finally {
        setFollowListLoading(false);
      }
    } else {
      // Demo mode has no real per-person follow graph — the only list we
      // can honestly show is the current demo user's own "Following",
      // built from the isFollowing flags already tracked on `users`.
      setFollowListData(type === 'following' && userId === 'me' ? users.filter(u => u.isFollowing) : []);
    }
  };

  // Deliberately doesn't touch notificationsOpen/inboxOpen/activeChatUser --
  // the person view renders above all of them (see its z-index), so
  // whichever one was open stays open underneath and reappears exactly as
  // it was once the profile is closed, instead of being force-closed here
  // and lost.
  const openPersonProfile = (usernameOrId) => {
    const person = users.find(u => u.id === usernameOrId || u.username === usernameOrId);
    if (!person) return;
    setActivePerson(person.id);
    setSubView('person');
    setPersonProfileTab('posts'); // always start on Posts, not whatever tab the last profile visited was left on
  };

  // Accepts either a community-list user ({id, name, username, avatar}) or
  // a conversation summary ({userId, name, username, avatar}) — both shapes
  // carry the same fields under slightly different id keys.
  // Deliberately doesn't touch inboxOpen/subView -- the chat thread renders
  // above both (see its z-index), so whichever was open underneath (the
  // Inbox, or a profile's Message button) reappears exactly as it was once
  // the chat is closed, instead of being force-closed here and lost.
  const openChat = (person) => {
    const userId = person.userId || person.id;
    setActiveChatUser({ userId, name: person.name, username: person.username, avatar: person.avatar });

    if (isSupabaseConfigured && session) {
      api.fetchMessages(session.user.id, userId).then(setChatMessages);
      api.markConversationRead(session.user.id, userId).then(() => {
        setConversations(prev => prev.map(c => c.userId === userId ? { ...c, unreadCount: 0 } : c));
        api.fetchUnreadMessageCount(session.user.id).then(setUnreadMessageCount);
      }).catch(() => {});
    } else {
      setChatMessages([]);
    }
  };

  const closeChat = () => {
    setActiveChatUser(null);
    setChatMessages([]);
    setChatInput('');
  };

  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const formatMessageTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // "Today" / "Yesterday" / a full date -- shown once per calendar day the
  // conversation spans, the same convention WhatsApp/iMessage use, rather
  // than repeating a date on every single bubble.
  const formatMessageDateDivider = (iso) => {
    const date = new Date(iso);
    const now = new Date();
    if (isSameDay(date, now)) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(date, yesterday)) return 'Yesterday';
    return date.toLocaleDateString([], {
      month: 'long',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleChatImageChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setChatImage({ file, preview: URL.createObjectURL(file) });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text && !chatImage) return;
    if (!activeChatUser) return;

    setChatSending(true);
    try {
      if (isSupabaseConfigured && session) {
        let imagePath = null;
        if (chatImage) {
          const { path, error: uploadError } = await api.uploadMessageImage(session.user.id, chatImage.file);
          if (uploadError) return;
          imagePath = path;
        }
        const { error } = await api.sendMessage(session.user.id, activeChatUser.userId, text, imagePath);
        if (error) return;
        const fresh = await api.fetchMessages(session.user.id, activeChatUser.userId);
        setChatMessages(fresh);
        api.fetchConversations(session.user.id).then(setConversations);
      } else {
        const newMsg = { id: `local-${Date.now()}`, fromMe: true, text, image: chatImage?.preview || null, time: 'Just now', createdAt: new Date().toISOString() };
        setChatMessages(prev => [...prev, newMsg]);
        setConversations(prev => prev.map(c => c.userId === activeChatUser.userId
          ? { ...c, lastText: text || '📷 Photo', lastTime: 'Just now' }
          : c));
      }
      setChatInput('');
      setChatImage(null);
    } finally {
      setChatSending(false);
    }
  };

  const openProfileEdit = () => {
    setEditDraft({ fullName: username, username: myUsername, parish, bio, avatarFile: null, avatarPreview: myAvatar });
    setEditUsernameStatus({ state: 'idle', message: '' });
    setEditError('');
    setProfileEditOpen(true);
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditDraft(prev => ({ ...prev, avatarFile: file, avatarPreview: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!editDraft) return;
    setEditError('');
    const newUsername = normalizeUsername(editDraft.username);
    const usernameChanged = newUsername !== myUsername;

    if (usernameChanged) {
      const fmtErr = getUsernameFormatError(newUsername);
      if (fmtErr) { setEditError(fmtErr); return; }
    }

    setEditSaving(true);
    try {
      if (isSupabaseConfigured && session) {
        if (usernameChanged) {
          const { available } = await api.checkUsernameAvailable(newUsername, session.user.id);
          if (!available) { setEditError('This username is already taken.'); return; }
        }
        let avatarUrl = myAvatar;
        if (editDraft.avatarFile) {
          const { url, error } = await api.uploadAvatar(session.user.id, editDraft.avatarFile);
          if (error) { setEditError(`Could not upload photo: ${error.message}`); return; }
          avatarUrl = url;
        }
        const { error } = await api.updateProfile(session.user.id, {
          full_name: editDraft.fullName,
          username: newUsername,
          parish: editDraft.parish,
          bio: editDraft.bio,
          avatar_url: avatarUrl
        });
        if (error) {
          const msg = error.message.toLowerCase();
          setEditError(msg.includes('unique') || msg.includes('duplicate') ? 'This username is already taken.' : error.message);
          return;
        }
        setUsername(editDraft.fullName);
        setMyUsername(newUsername);
        setParish(editDraft.parish);
        setBio(editDraft.bio);
        setMyAvatar(avatarUrl);
      } else {
        if (usernameChanged && users.some(u => u.username === newUsername)) {
          setEditError('This username is already taken.');
          return;
        }
        setUsername(editDraft.fullName);
        setMyUsername(newUsername);
        setParish(editDraft.parish);
        setBio(editDraft.bio);
        setMyAvatar(editDraft.avatarPreview);
      }
      setProfileEditOpen(false);
    } finally {
      setEditSaving(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) { setAuthError('Enter your email above first, then tap "Forgot password?"'); return; }
    setAuthError('');
    if (!isSupabaseConfigured) {
      setAuthNotice('Demo mode — no email is actually sent. In a live account, a reset link would go to your inbox now.');
      return;
    }
    const { error } = await api.requestPasswordReset(email);
    setAuthNotice(error ? '' : `Password reset link sent to ${email}.`);
    if (error) setAuthError(error.message);
  };

  const handleSetRecoveryPassword = async (e) => {
    e.preventDefault();
    const pwError = getPasswordError(recoveryPassword);
    if (pwError) { setRecoveryStatus(pwError); return; }
    if (recoveryPassword !== recoveryPasswordConfirm) { setRecoveryStatus('Passwords do not match.'); return; }
    setRecoveryStatus('saving');
    const { error } = await api.updateMyPassword(recoveryPassword);
    if (error) {
      setRecoveryStatus(error.message);
    } else {
      setRecoveryStatus('saved');
      setRecoveryPassword('');
      setRecoveryPasswordConfirm('');
      setTimeout(() => setPasswordRecoveryMode(false), 1500);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!isSupabaseConfigured) { setChangePasswordStatus('Demo mode — no password is actually stored.'); return; }
    if (!currentPasswordValue) { setChangePasswordStatus('Enter your current password.'); return; }
    const pwError = getPasswordError(changePasswordValue);
    if (pwError) { setChangePasswordStatus(pwError); return; }
    if (changePasswordValue !== changePasswordConfirm) { setChangePasswordStatus('New passwords do not match.'); return; }
    setChangePasswordStatus('saving');
    // Re-checks currentPasswordValue is actually correct before allowing the
    // change -- see api.changeMyPassword.
    const { error } = await api.changeMyPassword(session.user.email, currentPasswordValue, changePasswordValue);
    if (error) {
      setChangePasswordStatus(error.message);
    } else {
      setChangePasswordStatus('saved');
      setCurrentPasswordValue('');
      setChangePasswordValue('');
      setChangePasswordConfirm('');
      setTimeout(() => setChangePasswordStatus(''), 3000);
    }
  };

  // 7. Navigation Triggers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');
    if (!email || !password) return;
    if (authMode === 'register' && !agreedToTerms) return;
    if (authMode === 'register' && getPasswordError(password)) return; // error is shown inline under the field

    // Demo mode: no backend configured — simulate the account locally
    if (!isSupabaseConfigured) {
      if (authMode === 'register') {
        if (!username) return;
        if (getUsernameError(regUsername)) return; // error is shown inline under the field
        setMyUsername(normalizeUsername(regUsername));
      } else {
        setMyUsername(prev => prev || generateUniqueUsername(email.split('@')[0]));
      }
      setIsLoggedIn(true);
      return;
    }

    // Live mode: real Supabase authentication
    setAuthLoading(true);
    try {
      if (authMode === 'register') {
        if (!username) return;
        if (getUsernameFormatError(regUsername)) return;
        const uname = normalizeUsername(regUsername);
        const { available } = await api.checkUsernameAvailable(uname);
        if (!available) {
          setUsernameStatus({ state: 'taken', message: 'This username is already taken.' });
          return;
        }
        const { session: newSession, error } = await api.signUpWithEmail({
          email, password, username: uname, fullName: username, parish
        });
        if (error) {
          setAuthError(error.message);
          return;
        }
        if (!newSession) {
          // Email confirmation is enabled on the project
          setAuthNotice('Almost there — check your email to confirm your account, then sign in.');
          setAuthMode('login');
        }
        // Otherwise the session effect (2c) loads the profile and logs us in.
      } else {
        const { error } = await api.signInWithEmail({ email, password });
        if (error) setAuthError(error.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Toggles a verse highlight -- persisted server-side (migration 021) so
  // it's still there next time, not just for the current session.
  const handleVerseClick = (verseKey) => {
    const [bookId, chapterStr, verseStr] = verseKey.split(':');
    const chapter = Number(chapterStr);
    const verseNum = Number(verseStr);
    const wasHighlighted = bibleHighlights.includes(verseKey);
    setBibleHighlights(prev => wasHighlighted ? prev.filter(k => k !== verseKey) : [...prev, verseKey]);
    if (isSupabaseConfigured && session) {
      if (wasHighlighted) {
        api.removeBibleHighlight(session.user.id, bookId, chapter, verseNum).catch(() => {});
      } else {
        api.addBibleHighlight(session.user.id, bookId, chapter, verseNum).catch(() => {});
      }
    }
  };

  // Toggles a verse bookmark -- a separate, independent concept from a
  // highlight (see migration 022): a highlight emphasizes a verse in place
  // while reading, a bookmark adds it to the "Saved Bible Verses" list on
  // the profile so it can be found again without remembering the reference.
  const handleVerseBookmark = (verseKey) => {
    const [bookId, chapterStr, verseStr] = verseKey.split(':');
    const chapter = Number(chapterStr);
    const verseNum = Number(verseStr);
    const wasBookmarked = bibleBookmarks.includes(verseKey);
    setBibleBookmarks(prev => wasBookmarked ? prev.filter(k => k !== verseKey) : [...prev, verseKey]);
    if (isSupabaseConfigured && session) {
      if (wasBookmarked) {
        api.removeBibleBookmark(session.user.id, bookId, chapter, verseNum).catch(() => {});
      } else {
        api.addBibleBookmark(session.user.id, bookId, chapter, verseNum).catch(() => {});
      }
    }
  };

  // Anyone touching a block relationship with me, either direction — a
  // block hides content mutually, not just from the blocker's side.
  const blockedUserIds = new Set(
    blocks.flatMap(b => {
      const myId = session?.user?.id;
      if (b.blocker_id === myId) return [b.blocked_id];
      if (b.blocked_id === myId) return [b.blocker_id];
      return [];
    })
  );
  const visiblePosts = posts.filter(p => {
    const authorId = users.find(u => u.username === p.user.username)?.id;
    const resharerId = p.resharedBy ? users.find(u => u.username === p.resharedBy.username)?.id : null;
    if (blockedUserIds.has(authorId)) return false;
    if (mutedUserIds.has(authorId) || (resharerId && mutedUserIds.has(resharerId))) return false;
    return true;
  });
  const visibleUsers = users.filter(u => !blockedUserIds.has(u.id));
  const unreadNotificationCount = notifications.filter(n => n.unread).length;

  // Home feed ordering. "Following" is the classic reverse-chronological
  // feed, narrowed to people you follow (plus your own posts) -- exactly
  // what it says on the tin. "For You" ranks by a recency-decayed
  // engagement score instead of pure recency, the way X/Instagram/Facebook
  // surface older-but-popular posts above a just-posted one nobody's seen
  // yet, with a boost for accounts you already follow so it doesn't turn
  // into pure popularity contest.
  // A stable tiebreaker matters on every sort below: two posts can share
  // the same createdAt (or, in "For You", score so close it's effectively
  // tied), and without a deterministic fallback the top post can appear to
  // swap on a reload where nothing actually changed, just because the sort
  // landed differently this time.
  const byIdDesc = (a, b) => String(b.id).localeCompare(String(a.id));
  const homeFeedPosts = (() => {
    if (feedMode === 'following') {
      return visiblePosts
        .filter(p => p.user.username === myUsername || users.find(u => u.username === p.user.username)?.isFollowing)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || byIdDesc(a, b));
    }
    const now = Date.now();
    const scoreOf = (p) => {
      const hoursOld = Math.max((now - new Date(p.createdAt).getTime()) / 3_600_000, 0.1);
      const engagement = (p.likes || 0) + (p.commentsCount || 0) * 2 + (p.resharesCount || 0) * 3;
      const isFollowed = p.user.username === myUsername || !!users.find(u => u.username === p.user.username)?.isFollowing;
      // Hacker News-style gravity decay: engagement matters, but fades with
      // age so a well-liked post from last week doesn't camp at the top
      // forever.
      return ((engagement + 1) * (isFollowed ? 1.5 : 1)) / Math.pow(hoursOld + 2, 1.6);
    };
    return [...visiblePosts].sort((a, b) => scoreOf(b) - scoreOf(a) || new Date(b.createdAt) - new Date(a.createdAt) || byIdDesc(a, b));
  })();

  // 7. Universal Search Logic
  const getSearchResults = () => {
    if (!searchQuery.trim()) return [];

    const results = [];
    const query = searchQuery.toLowerCase();

    // Search People — by name or unique @username (with or without the @)
    if (searchFilter === 'All' || searchFilter === 'People') {
      const handleQuery = query.replace(/^@+/, '');
      visibleUsers.forEach(u => {
        if (u.name.toLowerCase().includes(handleQuery) || u.username.includes(handleQuery)) {
          results.push({
            type: 'Person',
            title: u.name,
            subtitle: u.parish ? `@${u.username} • ${u.parish}` : `@${u.username}`,
            action: () => openPersonProfile(u.id)
          });
        }
      });
    }

    // Search Bible — by reference (e.g. "Genesis 1", "John 3:16", "gen").
    // Full-text search across all 73 books would mean loading several MB of
    // scripture eagerly; reference lookup keeps chapters lazy-loaded.
    if (searchFilter === 'All' || searchFilter === 'Bible') {
      const refMatch = searchQuery.trim().match(/^([1-3]?\s*[a-zA-Z .]+?)\s*(\d+)?(?::(\d+))?$/);
      const namePart = refMatch ? refMatch[1].trim().toLowerCase() : '';
      if (namePart.length >= 2) {
        const chapterPart = refMatch[2] ? parseInt(refMatch[2], 10) : null;
        const versePart = refMatch[3] ? parseInt(refMatch[3], 10) : null;
        BIBLE_BOOKS
          .filter(b => b.name.toLowerCase().startsWith(namePart) || b.id === namePart)
          .slice(0, 5)
          .forEach(book => {
            const chapter = chapterPart && chapterPart <= book.chapters ? chapterPart : 1;
            results.push({
              type: 'Bible',
              title: versePart ? `${book.name} ${chapter}:${versePart}` : `${book.name}${chapterPart ? ` ${chapter}` : ''}`,
              subtitle: `${book.category} • ${book.chapters} chapters — tap to read`,
              action: () => {
                setSelectedBook(book);
                setSelectedChapter(chapter);
                setVerseModeActive(true);
                setSubView(null);
                setActiveTab('bible');
              }
            });
          });
      }
    }

    // Search Saints
    if (searchFilter === 'All' || searchFilter === 'Saints') {
      SAINTS.forEach(s => {
        if (s.name.toLowerCase().includes(query) || s.bio.toLowerCase().includes(query) || s.patronage.toLowerCase().includes(query)) {
          results.push({
            type: 'Saint',
            title: s.name,
            subtitle: `Patronage: ${s.patronage}`,
            action: () => {
              setActiveSaint(s);
              setSubView('saints');
            }
          });
        }
      });
    }

    // Search Audio
    if (searchFilter === 'All' || searchFilter === 'Audio') {
      AUDIO_TRACKS.forEach(track => {
        if (track.title.toLowerCase().includes(query) || track.artist.toLowerCase().includes(query)) {
          results.push({
            type: 'Audio',
            title: track.title,
            subtitle: `${track.artist} • ${track.category}`,
            action: () => {
              setCurrentTrack(track);
              setIsPlaying(true);
              setSubView(null);
              setActiveTab('audio');
            }
          });
        }
      });
    }

    // Search Posts
    if (searchFilter === 'All' || searchFilter === 'Posts') {
      visiblePosts.forEach(post => {
        if (post.text.toLowerCase().includes(query) || post.user.name.toLowerCase().includes(query)) {
          results.push({
            type: 'Post',
            title: post.user.name,
            subtitle: post.text,
            action: () => {
              setSubView(null);
              setActiveTab('home');
            }
          });
        }
      });
    }

    return results;
  };

  const searchResults = getSearchResults();

  // One source of truth for the daily verse — same verse on the pinned card,
  // the story overlay, and the downloadable image. Rotates each calendar day.
  const dailyVerse = getDailyVerse();

  const filteredSaints = saintCategoryFilter === 'All' ? SAINTS : SAINTS.filter(s => s.category === saintCategoryFilter);

  return (
    <div className={`device-container ${isLoggedIn && !passwordRecoveryMode ? 'app-mode' : 'auth-mode'}`} style={{ '--bible-font-size': `${bibleFontSize}px` }}>
      {/* Notch element */}
      <div className="device-notch">
        <div className="device-speaker"></div>
        <div className="device-camera"></div>
      </div>

      {/* Simulated Phone Top Status Bar */}
      <div className="device-status-bar">
        <div>20:30</div>
        <div className="status-bar-icons">
          <Icons.Signal />
          <Icons.Battery />
        </div>
      </div>

      {/* Embedded HTML5 Audio Node */}
      <audio
        ref={audioRef}
        src={currentTrack.url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onTrackEnded}
      />

      {/* @MENTION AUTOCOMPLETE -- one shared dropdown for every post/comment
          input in the app (see mentionState/updateMentionState/applyMention).
          position: fixed so it escapes .device-container's overflow:hidden
          and anchors to the input's real on-screen position. */}
      {mentionState && mentionSuggestions.length > 0 && (
        <div
          className="mention-suggestions"
          style={{ top: mentionState.rect.bottom + 4, left: mentionState.rect.left }}
        >
          {mentionSuggestions.map(u => (
            <div
              key={u.id}
              className="mention-suggestion-row"
              onMouseDown={(e) => { e.preventDefault(); applyMention(u.username); }}
            >
              <img src={u.avatar} alt={u.name} className="mention-suggestion-avatar" />
              <div>
                <div className="mention-suggestion-name">{u.name}</div>
                <div className="mention-suggestion-username">@{u.username}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FULLSCREEN IMAGE VIEWER -- tap a post's image in the detail view to
          zoom; tap anywhere to close. position: fixed for the same reason
          as the mention dropdown above. */}
      {fullscreenImage && (
        <div className="image-lightbox" onClick={() => setFullscreenImage(null)}>
          <button className="icon-btn image-lightbox-close" onClick={() => setFullscreenImage(null)} aria-label="Close">
            <Icons.Close />
          </button>
          <img src={fullscreenImage} alt="post content, enlarged" />
        </div>
      )}

      <div className="app-container">
        {/* ------------------ VIEW 1: SPLASH SCREEN ------------------ */}
        {splashActive && (
          <div className="splash-screen">
            <div className="splash-logo-container">
              <div className="splash-icon">
                <img src="/logo.svg" alt="Crescamus logo" className="brand-logo-img" />
              </div>
              <h1 className="splash-title">Crescamus</h1>
              <p className="splash-tagline">Growing Together in Christ</p>
            </div>
          </div>
        )}

        {/* ------------------ VIEW: PASSWORD RECOVERY ------------------ */}
        {!splashActive && passwordRecoveryMode && (
          <div className="auth-container scrollable">
            <div className="auth-header">
              <div className="auth-logo-symbol">
                <img src="/logo.svg" alt="Crescamus logo" className="brand-logo-img" />
              </div>
              <h2 className="auth-title">Set New Password</h2>
              <p className="auth-subtitle">Choose a new password for your account.</p>
            </div>

            <form className="auth-form" onSubmit={handleSetRecoveryPassword}>
              <div className="form-group">
                <label>New Password</label>
                <div className="password-input-wrap">
                  <input
                    type={showRecoveryPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={recoveryPassword}
                    onChange={(e) => { setRecoveryPassword(e.target.value); setRecoveryStatus(''); }}
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
                    aria-label={showRecoveryPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRecoveryPassword ? <Icons.EyeOff /> : <Icons.Eye />}
                  </button>
                </div>
                <span className="input-hint">At least 8 characters, with a letter and a number.</span>
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type={showRecoveryPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={recoveryPasswordConfirm}
                  onChange={(e) => { setRecoveryPasswordConfirm(e.target.value); setRecoveryStatus(''); }}
                  required
                />
              </div>

              {recoveryStatus === 'saved' ? (
                <p className="input-ok"><Icons.Check /> Password updated. Taking you in...</p>
              ) : recoveryStatus && recoveryStatus !== 'saving' && (
                <p className="input-error">{recoveryStatus}</p>
              )}

              <button type="submit" className="auth-btn" disabled={recoveryStatus === 'saving' || recoveryStatus === 'saved'}>
                {recoveryStatus === 'saving' ? 'Saving...' : 'Save New Password'}
              </button>
            </form>
          </div>
        )}

        {/* ------------------ VIEW 2: WELCOME HERO + AUTH FLOW ------------------
            One shared shell for all three pre-auth stages (hero, chooser,
            form) instead of two separate top-level views: the branding
            (orbit/title/tagline) needs to stay mounted and visible across
            all three stages on desktop, where it becomes a persistent left
            column next to a right-hand action card -- Instagram/Facebook's
            desktop login layout, rather than the mobile pattern of the form
            fully replacing the hero screen. On mobile this renders
            identically to the old two-view layout (see .auth-shell in
            index.css): the branding still disappears once the form stage is
            reached, and the chooser still slides up as a bottom sheet. */}
        {!splashActive && !isLoggedIn && !passwordRecoveryMode && (
          <div className={`auth-shell ${welcomeStage === 'form' ? 'stage-form' : ''}`}>
            <div className="welcome-branding-group">
              <div className="hero-orbit-wrap">
                <div className="hero-orbit-ring hero-orbit-ring--outer" />
                <div className="hero-orbit-ring hero-orbit-ring--inner" />
                <div className="hero-orbit-spinner">
                  {ABOUT_FEATURES.map((feature, i) => {
                    const angle = (360 / ABOUT_FEATURES.length) * i;
                    const FeatureIcon = Icons[feature.icon];
                    return (
                      <div key={feature.title} className="hero-orbit-item" style={{ transform: `rotate(${angle}deg) translateY(-124px) rotate(${-angle}deg)` }}>
                        <div className={`hero-orbit-badge hero-orbit-badge--${i}`} title={feature.title}>
                          {FeatureIcon && <FeatureIcon />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hero-center-mark">
                  <img src="/logo.svg" alt="Crescamus logo" />
                </div>
              </div>

              <h1 className="welcome-title">Crescamus</h1>
              <p className="welcome-tagline">Growing Together in Christ</p>
              <p className="welcome-vibe">Come as you are. Sit with Scripture, walk with the Saints, let sacred music still your heart, and grow alongside people who are actually praying, not just posting.</p>
            </div>

            <div className="welcome-action-slot">
              {welcomeStage === 'hero' && (
                <button className="auth-btn welcome-get-started-btn" onClick={() => setWelcomeStage('chooser')}>
                  Get Started
                </button>
              )}

              {welcomeStage === 'chooser' && (
                <>
                  <div className="welcome-scrim animate-fade-in" onClick={() => setWelcomeStage('hero')} />
                  <div className="welcome-sheet">
                    <div className="welcome-sheet-header">
                      <span className="welcome-sheet-icon"><Icons.Sparkles /></span>
                      <button className="icon-btn" onClick={() => setWelcomeStage('hero')} aria-label="Close">
                        <Icons.Close />
                      </button>
                    </div>
                    <h3 className="welcome-sheet-title">Get Started</h3>
                    <p className="welcome-sheet-desc">
                      Sign in or create an account to begin praying, reading Scripture, and growing with the community.
                    </p>

                    <button className="auth-btn" onClick={() => setWelcomeStage('form')}>
                      Continue with Email
                    </button>

                    <div className="welcome-sheet-social-row">
                      <button className="social-auth-btn" aria-label="Continue with Google" onClick={async () => {
                        if (isSupabaseConfigured) {
                          const { error } = await api.signInWithProvider('google');
                          if (error) setAuthError(error.message);
                          return;
                        }
                        setUsername("Google Christian"); setMyUsername(generateUniqueUsername("google.christian")); setIsLoggedIn(true);
                      }}>
                        <Icons.Google />
                      </button>
                      <button className="social-auth-btn" onClick={async () => {
                        if (isSupabaseConfigured) {
                          const { error } = await api.signInWithProvider('apple');
                          if (error) setAuthError(error.message);
                          return;
                        }
                        setUsername("Apple Catholic"); setMyUsername(generateUniqueUsername("apple.catholic")); setIsLoggedIn(true);
                      }}>
                        <Icons.Apple />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {welcomeStage === 'form' && (
          <div className="auth-container has-topbar scrollable animate-fade-in">
            <div className="auth-topbar">
              <button className="icon-btn" onClick={() => setWelcomeStage('chooser')} aria-label="Back">
                <Icons.ChevronLeft />
              </button>
            </div>
            <div className="auth-center-content">
            <div className="auth-header">
              <div className="auth-logo-symbol">
                <img src="/logo.svg" alt="Crescamus logo" className="brand-logo-img" />
              </div>
              <h2 className="auth-title">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="auth-subtitle">Join the Catholic digital sanctuary</p>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="St. Augustine"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Username</label>
                    <div className="username-input-wrap">
                      <span className="username-at">@</span>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="augustine354"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck="false"
                        required
                      />
                    </div>
                    {(() => {
                      if (!regUsername) {
                        return <span className="input-hint">One per person — others can find and follow you with it.</span>;
                      }
                      if (isSupabaseConfigured) {
                        // Live availability check against the database (effect 2d)
                        if (usernameStatus.state === 'checking') return <span className="input-hint">{usernameStatus.message}</span>;
                        if (usernameStatus.state === 'available') return <span className="input-ok"><Icons.Check /> {usernameStatus.message}</span>;
                        if (usernameStatus.state === 'invalid' || usernameStatus.state === 'taken') return <span className="input-error">{usernameStatus.message}</span>;
                        return <span className="input-hint">One per person — others can find and follow you with it.</span>;
                      }
                      const err = getUsernameError(regUsername);
                      return err
                        ? <span className="input-error">{err}</span>
                        : <span className="input-ok"><Icons.Check /> @{normalizeUsername(regUsername)} is available</span>;
                    })()}
                  </div>
                  <div className="form-group">
                    <label>Parish (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="St. Jude, Atlanta"
                      value={parish}
                      onChange={(e) => setParish(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="faith@crescamus.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <Icons.EyeOff /> : <Icons.Eye />}
                  </button>
                </div>
                {authMode === 'register' && (
                  password
                    ? (getPasswordError(password)
                        ? <span className="input-error">{getPasswordError(password)}</span>
                        : <span className="input-ok"><Icons.Check /> Strong enough</span>)
                    : <span className="input-hint">At least 8 characters, with a letter and a number.</span>
                )}
              </div>

              {authMode === 'login' && (
                <a href="#" className="forgot-password" onClick={(e) => { e.preventDefault(); handleForgotPassword(); }}>
                  Forgot password?
                </a>
              )}

              {authMode === 'register' && (
                <label className="terms-agree-row">
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
                  <span>
                    I agree to the{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); setLegalView('terms'); }}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); setLegalView('privacy'); }}>Privacy Policy</a>
                  </span>
                </label>
              )}

              {authError && <div className="auth-error">{authError}</div>}
              {authNotice && <div className="auth-notice">{authNotice}</div>}

              <button type="submit" className="auth-btn" disabled={authLoading || (authMode === 'register' && !agreedToTerms)}>
                {authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            </form>

            <div className="auth-footer">
              {authMode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <span className="auth-footer-link" onClick={() => setAuthMode('register')}>
                    Sign Up
                  </span>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <span className="auth-footer-link" onClick={() => setAuthMode('login')}>
                    Sign In
                  </span>
                </>
              )}
            </div>

            {!isSupabaseConfigured && (
              <p className="demo-note">Demo mode — accounts are not saved yet. See SUPABASE_SETUP.md to connect your database.</p>
            )}
            </div>
          </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------ LOGGED IN APP AREA ------------------ */}
        {isLoggedIn && !passwordRecoveryMode && (
          <>
            {/* DESKTOP-ONLY LEFT SIDEBAR NAVIGATION -- hidden on mobile via
                CSS, where .app-navbar (bottom tab bar) is used instead. Same
                five destinations, same handlers, just a different chrome for
                a mouse-and-wide-window session (see the (hover: hover) and
                (pointer: fine) media query in index.css). */}
            <nav className="desktop-sidebar">
              <div className="desktop-sidebar-brand" onClick={handleGoHome}>
                <Icons.Halo active={true} />
                <span>Crescamus</span>
              </div>
              <button className={`sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={handleGoHome}>
                <Icons.Home active={activeTab === 'home'} /> Home
              </button>
              <button className={`sidebar-nav-item ${activeTab === 'bible' ? 'active' : ''}`} onClick={() => { setActiveTab('bible'); setSubView(null); }}>
                <Icons.Bible active={activeTab === 'bible'} /> Bible
              </button>
              <button className={`sidebar-nav-item ${activeTab === 'prayers' ? 'active' : ''}`} onClick={() => { setActiveTab('prayers'); setSubView(null); }}>
                <Icons.Prayers active={activeTab === 'prayers'} /> Prayers
              </button>
              <button className={`sidebar-nav-item ${activeTab === 'audio' ? 'active' : ''}`} onClick={() => { setActiveTab('audio'); setSubView(null); }}>
                <Icons.Audio active={activeTab === 'audio'} /> Audio
              </button>
              <button className={`sidebar-nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => { setActiveTab('profile'); setSubView(null); }}>
                <Icons.Profile active={activeTab === 'profile'} /> Profile
              </button>
            </nav>

            <div className="app-main-column">
            {/* GLOBAL TOP HEAD-BAR */}
            <div className="app-header">
              <div className="header-brand" onClick={handleGoHome}>
                <div className="brand-icon-logo">
                  <Icons.Halo active={true} />
                </div>
                <h1>Crescamus</h1>
              </div>

              <div className="header-actions">
                {/* Search Toggle */}
                <button className={`icon-btn ${subView === 'search' ? 'active' : ''}`} onClick={() => setSubView(subView === 'search' ? null : 'search')}>
                  <Icons.Search />
                </button>
                {/* Messages */}
                <button className="icon-btn" onClick={async () => {
                  setInboxOpen(true);
                  if (isSupabaseConfigured && session) {
                    const fresh = await api.fetchConversations(session.user.id);
                    setConversations(fresh);
                  }
                }}>
                  <Icons.MessageCircle />
                  {unreadMessageCount > 0 && (
                    <span className="badge-count">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
                  )}
                </button>
                {/* Notifications Bell */}
                <button className="icon-btn" onClick={async () => {
                  const opening = !notificationsOpen;
                  setNotificationsOpen(opening);
                  if (!opening) return;

                  // Refetch fresh from the server on open — realtime keeps the
                  // badge current, but this is the guarantee: correct even if
                  // a realtime event was ever dropped or arrived while closed.
                  if (isSupabaseConfigured && session) {
                    const fresh = await api.fetchNotifications(session.user.id);
                    setNotifications(fresh);
                    api.markAllNotificationsRead(session.user.id).catch(() => {});
                  }
                  setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
                }}>
                  <Icons.Notification />
                  {unreadNotificationCount > 0 && (
                    <span className="badge-count">{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</span>
                  )}
                </button>
              </div>
            </div>

            {/* NOTIFICATIONS SLIDE DRAWER */}
            {notificationsOpen && (
              <div className="notifications-panel animate-slide-up">
                <div className="panel-header">
                  <h3>Notifications</h3>
                  <button className="icon-btn" onClick={() => setNotificationsOpen(false)}>
                    <Icons.Close />
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div className="search-empty-state">
                      <span className="empty-state-icon"><Icons.Notification /></span>
                      <p>All caught up!</p>
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div key={notif.id} className={`notification-row ${notif.unread ? 'unread' : ''}`} onClick={() => {
                        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));
                        setNotificationsOpen(false);

                        if ((notif.type === 'like' || notif.type === 'comment' || notif.type === 'mention') && notif.postId) {
                          setActiveTab('home');
                          setSubView(null);
                          setActivePostId(notif.postId);
                          setScrollToCommentId(notif.commentId || null);
                        } else if (notif.type === 'follow' && notif.actorUsername) {
                          openPersonProfile(notif.actorUsername);
                        }
                      }}>
                        <div className={`notification-icon-indicator ${notif.type}`}>
                          {notif.type === 'like' && <Icons.Heart />}
                          {notif.type === 'comment' && <Icons.Comment />}
                          {notif.type === 'mention' && <Icons.AtSign />}
                          {notif.type === 'prayer' && <Icons.Rosary />}
                          {notif.type === 'saint' && <Icons.Sparkles />}
                          {notif.type === 'follow' && <Icons.Users />}
                        </div>
                        <div className="notification-content">
                          <p className="notification-message">
                            <strong>{notif.user}</strong> {notif.text}
                          </p>
                          <p className="notification-time">{notif.time}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ------------------ VIEW: UNIVERSAL SEARCH ------------------ */}
            {subView === 'search' && (
              <div className="scrollable animate-fade-in" style={{ zIndex: 1000, position: 'absolute', inset: '56px 0 64px 0', background: 'var(--background)' }}>
                <div className="search-bar-wrapper">
                  <span className="search-icon-inside"><Icons.Search /></span>
                  <input
                    type="text"
                    className="search-input-field"
                    placeholder="Search people, bible verses, Saints, audio..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="search-filter-pills">
                  {['All', 'People', 'Bible', 'Saints', 'Audio', 'Posts'].map(filter => (
                    <span
                      key={filter}
                      className={`filter-pill ${searchFilter === filter ? 'active' : ''}`}
                      onClick={() => setSearchFilter(filter)}
                    >
                      {filter}
                    </span>
                  ))}
                </div>

                {searchQuery.trim() === '' ? (
                  <div className="search-empty-state">
                    <span className="empty-state-icon"><Icons.Search /></span>
                    <h3 style={{ fontSize: '15px', marginBottom: '4px' }}>Search Crescamus</h3>
                    <p>Enter keywords to explore the Catholic Sanctuary.</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="search-empty-state">
                    <span className="empty-state-icon"><Icons.Dove /></span>
                    <h3 style={{ fontSize: '15px', marginBottom: '4px' }}>No results found</h3>
                    <p>Try searching for "@clara.peterson", "Genesis", "Thérèse", or "Chant".</p>
                  </div>
                ) : (
                  <div className="search-results-list">
                    {searchResults.map((res, i) => (
                      <div key={i} className="card" onClick={res.action} style={{ cursor: 'pointer', padding: '14px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--secondary)', fontWeight: 700 }}>
                          {res.type}
                        </span>
                        <h4 style={{ fontSize: '14px', margin: '4px 0 2px' }}>{res.title}</h4>
                        <p style={{ fontSize: '12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {res.subtitle}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ------------------ VIEW: SAINTS BROWSE (featured + categories) ------------------ */}
            {subView === 'saintsBrowse' && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => setSubView(null)}>
                    <Icons.ChevronLeft />
                  </button>
                  <h3>Saints</h3>
                  <div style={{ width: '24px' }}></div>
                </div>

                <div className="scrollable">
                  <div className="search-filter-pills">
                    {['All', ...SAINT_CATEGORIES].map(cat => (
                      <span
                        key={cat}
                        className={`filter-pill ${saintCategoryFilter === cat ? 'active' : ''}`}
                        onClick={() => setSaintCategoryFilter(cat)}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>

                  <div className="books-grid" style={{ marginTop: '16px' }}>
                    {filteredSaints.map(s => (
                      <div key={s.id} className="saint-grid-item" onClick={() => { setActiveSaint(s); setSubView('saints'); }}>
                        <img src={s.image} className="saint-item-image" alt={s.name} loading="lazy" />
                        <div className="saint-item-info">
                          <h4>{s.name}</h4>
                          <p>{s.category} • {s.feastDay}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------ VIEW: SAINTS DETAILED VIEW SHEET ------------------ */}
            {subView === 'saints' && activeSaint && (
              <div className="saint-details-view">
                <div className="saint-details-image-hero">
                  <img src={activeSaint.image} alt={activeSaint.name} />
                  <div className="saint-details-overlay"></div>
                  <button className="saint-details-close-btn" onClick={() => { setSubView('saintsBrowse'); setActiveSaint(null); }}>
                    <Icons.ChevronLeft />
                  </button>
                  <button
                    className="saint-details-share-btn"
                    onClick={() => shareSaintLink(activeSaint)}
                    aria-label="Copy link to this Saint"
                    title="Copy link to this Saint"
                  >
                    {copiedSaintShare ? <Icons.Check /> : <Icons.Share />}
                  </button>
                  <div className="saint-details-title-box">
                    <span>{activeSaint.category}</span>
                    <h2>{activeSaint.name}</h2>
                  </div>
                </div>

                <div className="saint-details-body">
                  <div className="saint-meta-pill-row">
                    <span className="saint-pill"><Icons.Calendar /> Feast: {activeSaint.feastDay}</span>
                    <span className="saint-pill"><Icons.Tag /> Patron: {activeSaint.patronage}</span>
                  </div>

                  <div className="saint-quote-card">
                    <p>"{activeSaint.quote}"</p>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '14px', marginBottom: '8px', textTransform: 'uppercase', color: 'var(--primary)' }}>Biography</h4>
                    {activeSaint.bio.split('\n').filter(Boolean).map((para, i) => (
                      <p key={i} style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text)', marginBottom: '10px' }}>
                        {para}
                      </p>
                    ))}
                    {activeSaint.sourceUrl && (
                      <p className="saint-attribution">
                        Biography adapted from{' '}
                        <a href={activeSaint.sourceUrl} target="_blank" rel="noopener noreferrer">Wikipedia</a>
                        , CC BY-SA 4.0.
                        {activeSaint.imageLicense && ` Portrait: ${activeSaint.imageLicense}, via Wikimedia Commons.`}
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <h4 style={{ fontSize: '14px', marginBottom: '10px', textTransform: 'uppercase', color: 'var(--primary)' }}>Related Saints</h4>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {(() => {
                        const sameCategory = SAINTS.filter(s => s.id !== activeSaint.id && s.category === activeSaint.category);
                        const others = SAINTS.filter(s => s.id !== activeSaint.id && s.category !== activeSaint.category);
                        return [...sameCategory, ...others].slice(0, 2);
                      })().map(s => (
                        <div key={s.id} className="card" onClick={() => setActiveSaint(s)} style={{ flex: 1, padding: '10px', margin: 0, textAlign: 'center', cursor: 'pointer' }}>
                          <img src={s.image} alt={s.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 6px' }} />
                          <h5 style={{ fontSize: '11px', fontWeight: 600 }}>{s.name}</h5>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------ VIEW: PERSON PROFILE ------------------ */}
            {subView === 'person' && activePerson && (() => {
              const person = users.find(u => u.id === activePerson);
              if (!person) return null;
              const personPosts = posts
                .filter(p => p.user.username === person.username && !p.resharedBy)
                .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
              const personReshares = posts.filter(p => p.resharedBy?.username === person.username);
              return (
                <div className="saint-details-view person-view">
                  <div className="person-view-header">
                    <button className="icon-btn" onClick={() => { setSubView(null); setActivePerson(null); }}>
                      <Icons.ChevronLeft />
                    </button>
                    <h3>@{person.username}</h3>
                    <div className="post-menu-wrap">
                      <button className="icon-btn" onClick={() => setPostMenuOpen(postMenuOpen === `person-${person.id}` ? null : `person-${person.id}`)}>
                        <Icons.MoreVertical />
                      </button>
                      {postMenuOpen === `person-${person.id}` && (
                        <div className="post-menu-dropdown">
                          <button className="post-menu-item" onClick={() => toggleMuteUser(person.id)}>
                            <Icons.VolumeOff /> {mutedUserIds.has(person.id) ? 'Unmute' : 'Mute'} User
                          </button>
                          <button
                            className="post-menu-item"
                            onClick={() => openReport({ userId: person.id, label: person.name })}
                          >
                            <Icons.Flag /> Report User
                          </button>
                          <button className="post-menu-item danger" onClick={() => { setPostMenuOpen(null); toggleBlockUser(person.id); }}>
                            <Icons.Ban /> {blockedUserIds.has(person.id) ? 'Unblock' : 'Block'} User
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="scrollable" style={{ paddingBottom: '32px' }}>
                    <div className="profile-hero">
                      <img src={person.avatar} className="profile-avatar-large" alt={person.name} />
                      <h3 className="profile-name">
                        {person.name}
                        {person.isVerified && <Icons.Verified size={16} />}
                      </h3>
                      <div className="username-text">@{person.username}</div>
                      {person.parish && <div className="profile-parish"><Icons.Church /> {person.parish}</div>}
                      <p className="profile-bio">{person.bio}</p>

                      <div className="profile-stats-row">
                        <div className="stat-item">
                          <div className="stat-val">{personPosts.length}</div>
                          <div className="stat-label">Posts</div>
                        </div>
                        <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => openFollowList(person.id, person.username, 'followers')}>
                          <div className="stat-val">{person.followers}</div>
                          <div className="stat-label">Followers</div>
                        </div>
                        <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => openFollowList(person.id, person.username, 'following')}>
                          <div className="stat-val">{person.following}</div>
                          <div className="stat-label">Following</div>
                        </div>
                      </div>

                      {blockedUserIds.has(person.id) ? (
                        <div className="person-action-row">
                          <button className="message-btn" onClick={() => toggleBlockUser(person.id)}>
                            <Icons.Ban /> Unblock User
                          </button>
                        </div>
                      ) : (
                        <div className="person-action-row">
                          <button
                            className={`follow-btn ${person.isFollowing ? 'following' : ''}`}
                            onClick={() => toggleFollowUser(person.id)}
                          >
                            {person.isFollowing ? (
                              <><Icons.UserCheck /> Following</>
                            ) : person.isFollowedBy ? (
                              <><Icons.UserPlus /> Follow Back</>
                            ) : (
                              <><Icons.UserPlus /> Follow</>
                            )}
                          </button>
                          <button className="message-btn" onClick={() => openChat(person)}>
                            <Icons.MessageCircle /> Message
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="profile-tabs-header">
                      <div className={`profile-tab-title ${personProfileTab === 'posts' ? 'active' : ''}`} onClick={() => setPersonProfileTab('posts')}>
                        Posts
                      </div>
                      <div className={`profile-tab-title ${personProfileTab === 'reshares' ? 'active' : ''}`} onClick={() => setPersonProfileTab('reshares')}>
                        Reshares
                      </div>
                    </div>

                    {personProfileTab === 'posts' && (
                      personPosts.length === 0 ? (
                        <div className="search-empty-state">
                          <span className="empty-state-icon"><Icons.Comment /></span>
                          <p>No posts shared yet.</p>
                        </div>
                      ) : (
                        personPosts.map(post => renderPostCard(post, { showPinnedBadge: true }))
                      )
                    )}

                    {personProfileTab === 'reshares' && (
                      personReshares.length === 0 ? (
                        <div className="search-empty-state">
                          <span className="empty-state-icon"><Icons.Repost /></span>
                          <p>Posts this person reshares will show up here.</p>
                        </div>
                      ) : (
                        personReshares.map(post => renderPostCard(post))
                      )
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ------------------ VIEW: MESSAGES INBOX ------------------ */}
            {inboxOpen && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => setInboxOpen(false)}>
                    <Icons.ChevronLeft />
                  </button>
                  <h3>Messages</h3>
                  <div style={{ width: '24px' }}></div>
                </div>

                <div className="scrollable" style={{ padding: 0 }}>
                  {conversations.length === 0 ? (
                    <div className="search-empty-state">
                      <span className="empty-state-icon"><Icons.MessageCircle /></span>
                      <p>No messages yet. Visit someone's profile and tap Message to start a conversation.</p>
                    </div>
                  ) : (
                    conversations.map(convo => (
                      <div key={convo.userId} className="conversation-row">
                        <img
                          src={convo.avatar}
                          className="conversation-avatar"
                          alt={convo.name}
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); openPersonProfile(convo.userId); }}
                        />
                        <div className="conversation-info" onClick={() => openChat(convo)} style={{ cursor: 'pointer' }}>
                          <div className="conversation-name-row">
                            <span className="conversation-name">{convo.name}</span>
                            <span className="conversation-time">{convo.lastTime}</span>
                          </div>
                          <p className={`conversation-preview ${convo.unreadCount > 0 ? 'unread' : ''}`}>{convo.lastText}</p>
                        </div>
                        {convo.unreadCount > 0 && <span className="conversation-unread-badge">{convo.unreadCount}</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ------------------ VIEW: CHAT THREAD ------------------ */}
            {activeChatUser && (
              <div className="saint-details-view chat-thread-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={closeChat}>
                    <Icons.ChevronLeft />
                  </button>
                  <div className="chat-header-user" onClick={() => { const username = activeChatUser.username; closeChat(); openPersonProfile(username); }}>
                    <img src={activeChatUser.avatar} className="chat-header-avatar" alt={activeChatUser.name} />
                    <span>{activeChatUser.name}</span>
                  </div>
                  <div style={{ width: '24px' }}></div>
                </div>

                <div className="chat-messages-list" ref={chatScrollRef}>
                  {chatMessages.length === 0 ? (
                    <div className="search-empty-state">
                      <span className="empty-state-icon"><Icons.MessageCircle /></span>
                      <p>Say hello to {activeChatUser.name.split(' ')[0]}!</p>
                    </div>
                  ) : (
                    chatMessages.map((m, i) => {
                      const prev = chatMessages[i - 1];
                      const showDateDivider = m.createdAt && (!prev?.createdAt || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt)));
                      return (
                        <React.Fragment key={m.id}>
                          {showDateDivider && (
                            <div className="chat-date-divider"><span>{formatMessageDateDivider(m.createdAt)}</span></div>
                          )}
                          <div className={`chat-bubble-row ${m.fromMe ? 'mine' : 'theirs'}`}>
                            <div className="chat-bubble">
                              {m.image && <img src={m.image} className="chat-bubble-image" alt="Attachment" />}
                              {m.text && <span>{m.text}</span>}
                            </div>
                            {m.createdAt && <span className="chat-bubble-time">{formatMessageTime(m.createdAt)}</span>}
                          </div>
                        </React.Fragment>
                      );
                    })
                  )}
                </div>

                {chatImage && (
                  <div className="composer-image-preview" style={{ margin: '0 12px 8px' }}>
                    <img src={chatImage.preview} alt="Attachment preview" />
                    <button className="composer-image-remove" onClick={() => setChatImage(null)}>
                      <Icons.Close />
                    </button>
                  </div>
                )}

                <form className="chat-input-bar" onSubmit={handleSendMessage}>
                  <label className="composer-attach-btn" style={{ flexShrink: 0 }}>
                    <Icons.Image />
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleChatImageChange} />
                  </label>
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button type="submit" className="comment-submit-btn" disabled={(!chatInput.trim() && !chatImage) || chatSending}>
                    <Icons.Send />
                  </button>
                </form>
              </div>
            )}

            {/* ------------------ VIEW: NEW POST COMPOSER ------------------ */}
            {composerOpen && (
              <div className="saint-details-view composer-sheet">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => setComposerOpen(false)}>
                    <Icons.Close />
                  </button>
                  <h3>New Post</h3>
                  <button
                    className="composer-post-btn"
                    disabled={(!newPostText.trim() && !composerMedia) || newPostText.length > POST_MAX_LENGTH || composerPosting}
                    onClick={handleCreatePost}
                  >
                    {composerPosting ? 'Posting...' : 'Post'}
                  </button>
                </div>

                <div className="scrollable" style={{ paddingBottom: '24px' }}>
                  <div className="composer-format-bar">
                    <button type="button" className="composer-format-btn" title="Bold" onClick={() => wrapSelection(composerTextareaRef.current, newPostText, setNewPostText, '**')}>
                      <Icons.Bold />
                    </button>
                    <button type="button" className="composer-format-btn" title="Italic" onClick={() => wrapSelection(composerTextareaRef.current, newPostText, setNewPostText, '*')}>
                      <Icons.Italic />
                    </button>
                    <button type="button" className="composer-format-btn" title="Quote" onClick={() => prefixLines(composerTextareaRef.current, newPostText, setNewPostText, '> ')}>
                      <Icons.Quote />
                    </button>
                    <button type="button" className="composer-format-btn" title="Bullet list" onClick={() => prefixLines(composerTextareaRef.current, newPostText, setNewPostText, '- ')}>
                      <Icons.ListBullet />
                    </button>
                    <div className="composer-emoji-wrap">
                      <button
                        type="button"
                        className={`composer-format-btn ${emojiPickerOpen ? 'active' : ''}`}
                        title="Emoji"
                        onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                      >
                        <Icons.Emoji />
                      </button>
                      {emojiPickerOpen && (
                        <div className="composer-emoji-picker">
                          {COMPOSER_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              className="composer-emoji-option"
                              onClick={() => insertAtCursor(composerTextareaRef.current, newPostText, setNewPostText, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }} />
                    <span className={`composer-char-count ${
                      newPostText.length > POST_MAX_LENGTH ? 'over-limit' : newPostText.length > POST_MAX_LENGTH - 100 ? 'near-limit' : ''
                    }`}>
                      {newPostText.length}/{POST_MAX_LENGTH}
                    </span>
                    <button
                      type="button"
                      className={`composer-format-btn ${composerPreview ? 'active' : ''}`}
                      title="Preview"
                      onClick={() => setComposerPreview(!composerPreview)}
                      disabled={!newPostText.trim()}
                    >
                      <Icons.Eye />
                    </button>
                  </div>

                  <div className="composer-writer">
                    <img src={myAvatar} className="composer-writer-avatar" alt="" />
                    {composerPreview ? (
                      <div className="composer-preview">{renderFormattedText(newPostText)}</div>
                    ) : (
                      <textarea
                        ref={composerTextareaRef}
                        className="composer-textarea"
                        placeholder="Share your faith with the community..."
                        value={newPostText}
                        onChange={(e) => { setNewPostText(e.target.value); updateMentionState(e.target, e.target.value, setNewPostText); }}
                        onBlur={() => setMentionState(null)}
                        autoFocus
                        rows={6}
                      />
                    )}
                  </div>
                  {composerMedia && (
                    <div className="composer-image-preview">
                      {composerMedia.type === 'video' ? (
                        <video src={composerMedia.preview} controls playsInline />
                      ) : (
                        <img src={composerMedia.preview} alt="Attachment preview" />
                      )}
                      <button className="composer-image-remove" onClick={() => setComposerMedia(null)}>
                        <Icons.Close />
                      </button>
                    </div>
                  )}

                  {composerError && <div className="auth-error" style={{ margin: '0 16px' }}>{composerError}</div>}
                </div>

                <div className="composer-toolbar">
                  <label className="composer-attach-btn">
                    <Icons.Image />
                    <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleComposerMediaChange} />
                  </label>
                </div>
              </div>
            )}

            {/* ------------------ VIEW: REPORT ------------------ */}
            {reportTarget && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={closeReport}>
                    <Icons.Close />
                  </button>
                  <h3>Report</h3>
                  <div style={{ width: '24px' }}></div>
                </div>

                <div className="scrollable">
                  {reportSubmitted ? (
                    <div className="search-empty-state">
                      <span className="empty-state-icon"><Icons.Check /></span>
                      <p>Thank you — your report on {reportTarget.label} has been submitted for review.</p>
                      <button className="auth-btn" style={{ marginTop: '16px', maxWidth: '200px' }} onClick={closeReport}>Done</button>
                    </div>
                  ) : (
                    <form className="auth-form" onSubmit={submitReport}>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Reporting {reportTarget.label}. Reports are reviewed and are not visible to the person you're reporting.
                      </p>

                      <div className="form-group">
                        <label>Reason</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {[
                            ['spam', 'Spam'],
                            ['harassment', 'Harassment or bullying'],
                            ['inappropriate', 'Inappropriate content'],
                            ['misinformation', 'False information'],
                            ['other', 'Other']
                          ].map(([value, label]) => (
                            <label key={value} className="report-reason-option">
                              <input
                                type="radio"
                                name="reportReason"
                                value={value}
                                checked={reportReason === value}
                                onChange={() => setReportReason(value)}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Additional details (optional)</label>
                        <textarea
                          className="form-input"
                          rows={3}
                          maxLength={500}
                          style={{ resize: 'none', fontFamily: 'var(--font-body)' }}
                          value={reportDetails}
                          onChange={(e) => setReportDetails(e.target.value)}
                        />
                      </div>

                      <button type="submit" className="auth-btn" disabled={!reportReason || reportSubmitting}>
                        {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* ------------------ VIEW: SETTINGS ------------------ */}
            {settingsOpen && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => setSettingsOpen(false)}>
                    <Icons.ChevronLeft />
                  </button>
                  <h3>Settings</h3>
                  <div style={{ width: '24px' }}></div>
                </div>

                <div className="scrollable">
                  <div className="settings-section">
                    <h4 className="settings-section-title">Appearance</h4>
                    <div className="settings-row" style={{ cursor: 'default' }}>
                      <span><Icons.Moon /> Dark Mode</span>
                      <label className="switch">
                        <input type="checkbox" checked={theme === 'dark'} onChange={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
                        <span className="slider"></span>
                      </label>
                    </div>

                    <h4 className="settings-section-title">Notifications</h4>
                    <div className="settings-row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                      <span><Icons.Notification /> Prayer Reminders</span>
                      {!isNotificationSupported() ? (
                        <span className="input-hint">Not supported in this browser.</span>
                      ) : notificationPermission === 'granted' ? (
                        <span className="input-ok"><Icons.Check /> Enabled — reminders will fire while Crescamus is open.</span>
                      ) : notificationPermission === 'denied' ? (
                        <span className="input-error">Blocked — enable notifications for this site in your browser settings.</span>
                      ) : (
                        <button type="button" className="filter-pill" onClick={maybeRequestNotificationPermission}>
                          Enable Notifications
                        </button>
                      )}
                      <span className="input-hint">
                        Reminders fire while Crescamus is open in your browser. Always-on reminders that work even when the app is closed need the native app version, planned for later.
                      </span>
                    </div>

                    <h4 className="settings-section-title">Account</h4>
                    <div className="settings-row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                      <span><Icons.Key /> Change Password</span>
                      <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="password-input-wrap">
                          <input
                            type={showChangePassword ? 'text' : 'password'}
                            className="form-input"
                            placeholder="Current password"
                            value={currentPasswordValue}
                            onChange={(e) => { setCurrentPasswordValue(e.target.value); setChangePasswordStatus(''); }}
                            autoComplete="current-password"
                          />
                          <button
                            type="button"
                            className="password-toggle-btn"
                            onClick={() => setShowChangePassword(!showChangePassword)}
                            aria-label={showChangePassword ? 'Hide password' : 'Show password'}
                          >
                            {showChangePassword ? <Icons.EyeOff /> : <Icons.Eye />}
                          </button>
                        </div>
                        <input
                          type={showChangePassword ? 'text' : 'password'}
                          className="form-input"
                          placeholder="New password"
                          value={changePasswordValue}
                          onChange={(e) => { setChangePasswordValue(e.target.value); setChangePasswordStatus(''); }}
                          autoComplete="new-password"
                        />
                        <input
                          type={showChangePassword ? 'text' : 'password'}
                          className="form-input"
                          placeholder="Confirm new password"
                          value={changePasswordConfirm}
                          onChange={(e) => { setChangePasswordConfirm(e.target.value); setChangePasswordStatus(''); }}
                          autoComplete="new-password"
                        />
                        {changePasswordValue && (
                          getPasswordError(changePasswordValue)
                            ? <span className="input-error">{getPasswordError(changePasswordValue)}</span>
                            : <span className="input-hint">At least 8 characters, with a letter and a number.</span>
                        )}
                        {changePasswordStatus === 'saved' && <span className="input-ok"><Icons.Check /> Password updated.</span>}
                        {changePasswordStatus && changePasswordStatus !== 'saving' && changePasswordStatus !== 'saved' && (
                          <span className="input-error">{changePasswordStatus}</span>
                        )}
                        <button type="submit" className="auth-btn" style={{ margin: 0 }} disabled={changePasswordStatus === 'saving'}>
                          {changePasswordStatus === 'saving' ? 'Updating...' : 'Update Password'}
                        </button>
                      </form>
                      {!isSupabaseConfigured && <span className="input-hint">Demo mode — no password is actually stored.</span>}
                    </div>

                    <h4 className="settings-section-title">About</h4>
                    <button className="settings-row" onClick={() => setAboutOpen(true)}>
                      <span><Icons.Sparkles /> About Crescamus</span>
                      <Icons.ChevronRight />
                    </button>

                    <h4 className="settings-section-title">Legal</h4>
                    <button className="settings-row" onClick={() => setLegalView('privacy')}>
                      <span><Icons.Shield /> Privacy Policy</span>
                      <Icons.ChevronRight />
                    </button>
                    <button className="settings-row" onClick={() => setLegalView('terms')}>
                      <span><Icons.FileText /> Terms of Service</span>
                      <Icons.ChevronRight />
                    </button>

                    <h4 className="settings-section-title">Danger Zone</h4>
                    <button className="settings-row danger" onClick={() => setDeleteAccountOpen(true)}>
                      <span><Icons.Trash /> Delete Account</span>
                      <Icons.ChevronRight />
                    </button>
                    <button className="settings-row danger" onClick={() => {
                      if (isSupabaseConfigured) api.signOut();
                      setSettingsOpen(false);
                      setIsLoggedIn(false);
                      resetLocalIdentityState();
                    }}>
                      <span><Icons.LogOut /> Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------ VIEW: ABOUT ------------------ */}
            {aboutOpen && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => setAboutOpen(false)}>
                    <Icons.ChevronLeft />
                  </button>
                  <h3>About</h3>
                  <div style={{ width: '24px' }}></div>
                </div>
                <div className="scrollable">
                  <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
                    <img src="/logo.svg" alt="Crescamus logo" style={{ width: '64px', height: '64px' }} />
                    <h2 style={{ margin: '12px 0 2px' }}>Crescamus</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Growing Together in Christ</p>
                  </div>

                  <p style={{ fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>{MISSION}</p>

                  <h4 className="settings-section-title">What You Can Do Here</h4>
                  {ABOUT_FEATURES.map(feature => {
                    const FeatureIcon = Icons[feature.icon];
                    return (
                      <div key={feature.title} style={{ display: 'flex', gap: '14px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }}>
                          {FeatureIcon && <FeatureIcon />}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{feature.title}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{feature.description}</div>
                        </div>
                      </div>
                    );
                  })}

                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '20px 0' }}>{CONTENT_SOURCING_NOTE}</p>

                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px' }}>
                    <button className="feed-action-btn" onClick={() => { setAboutOpen(false); setLegalView('privacy'); }}>
                      Privacy Policy
                    </button>
                    <button className="feed-action-btn" onClick={() => { setAboutOpen(false); setLegalView('terms'); }}>
                      Terms of Service
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------ VIEW: DELETE ACCOUNT CONFIRMATION ------------------ */}
            {deleteAccountOpen && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => { setDeleteAccountOpen(false); setDeleteAccountConfirmText(''); setDeleteAccountError(''); }}>
                    <Icons.Close />
                  </button>
                  <h3>Delete Account</h3>
                  <div style={{ width: '24px' }}></div>
                </div>
                <div className="scrollable">
                  <div className="auth-error" style={{ marginBottom: '16px' }}>
                    This permanently deletes your account, profile, posts, messages, prayer history, and everything else tied to it. This cannot be undone.
                  </div>
                  <div className="form-group">
                    <label>Type DELETE to confirm</label>
                    <input
                      type="text"
                      className="form-input"
                      value={deleteAccountConfirmText}
                      onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                      placeholder="DELETE"
                    />
                  </div>
                  {deleteAccountError && <div className="auth-error">{deleteAccountError}</div>}
                  <button
                    className="auth-btn"
                    style={{ background: 'var(--notification)' }}
                    disabled={deleteAccountConfirmText !== 'DELETE' || deletingAccount}
                    onClick={handleDeleteAccount}
                  >
                    {deletingAccount ? 'Deleting...' : 'Permanently Delete My Account'}
                  </button>
                </div>
              </div>
            )}

            {/* ------------------ VIEW: POST DETAIL (tap a post to open, like X) ------------------ */}
            {(() => {
              const detailPost = activePostId ? posts.find(p => p.id === activePostId) : null;
              if (!detailPost) return null;
              return (
                <div className="saint-details-view">
                  <div className="person-view-header">
                    <button className="icon-btn" onClick={() => setActivePostId(null)}>
                      <Icons.ChevronLeft />
                    </button>
                    <h3>Post</h3>
                    <div style={{ width: '24px' }}></div>
                  </div>
                  <div className="scrollable">
                    <div className="card post-detail-card">
                      {detailPost.resharedBy && (
                        <div className="reshare-banner">
                          <Icons.Repost /> {detailPost.resharedBy.username === myUsername ? 'You' : detailPost.resharedBy.name} reshared
                        </div>
                      )}
                      {detailPost.quoteText && (
                        <p className="quote-reshare-text">{detailPost.quoteText}</p>
                      )}
                      <div className="feed-header">
                        <div
                          className="feed-user-info"
                          style={{ cursor: 'pointer' }}
                          onClick={() => { setActivePostId(null); openPersonProfile(detailPost.user.username); }}
                        >
                          <img src={detailPost.user.avatar} className="feed-user-avatar" alt={detailPost.user.name} />
                          <div>
                            <div className="feed-user-name">
                              {detailPost.user.name} {detailPost.user.isVerified && <Icons.Verified />} <span className="feed-username">@{detailPost.user.username}</span>
                            </div>
                            {detailPost.user.parish && <div className="feed-user-parish"><Icons.Church /> {detailPost.user.parish}</div>}
                          </div>
                        </div>
                        <span className="feed-time">{detailPost.time}</span>
                      </div>

                      <div className="feed-text post-detail-text">{renderFormattedText(detailPost.text, openPersonProfile)}</div>
                      {detailPost.video && <video src={detailPost.video} className="feed-image" controls playsInline />}
                      {detailPost.image && (
                        <img
                          src={detailPost.image}
                          className="feed-image"
                          alt="post content"
                          onClick={() => setFullscreenImage(detailPost.image)}
                          style={{ cursor: 'zoom-in' }}
                        />
                      )}

                      <div className="feed-actions">
                        <button className={`feed-action-btn ${detailPost.isLiked ? 'liked' : ''}`} onClick={() => handleLikePost(detailPost.originalPostId)}>
                          <Icons.Heart fill={detailPost.isLiked} />
                          <span>{detailPost.likes}</span>
                        </button>
                        <button className="feed-action-btn">
                          <Icons.Comment />
                          <span>{detailPost.commentsCount}</span>
                        </button>
                        {detailPost.user.username !== myUsername ? (
                          <div className="post-menu-wrap">
                            <button className="feed-action-btn" onClick={() => setReshareMenuOpen(reshareMenuOpen === detailPost.id ? null : detailPost.id)} title="Reshare">
                              <Icons.Repost />
                              <span>{detailPost.resharesCount || 0}</span>
                            </button>
                            {reshareMenuOpen === detailPost.id && (
                              <div className="post-menu-dropdown">
                                <button className="post-menu-item" onClick={() => { handleReshare(detailPost); setReshareMenuOpen(null); }}>
                                  <Icons.Repost /> Repost
                                </button>
                                <button className="post-menu-item" onClick={() => { setQuoteReshareTarget(detailPost); setReshareMenuOpen(null); }}>
                                  <Icons.Edit /> Quote
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="feed-action-btn" title="Reposts" style={{ cursor: 'default' }}>
                            <Icons.Repost />
                            <span>{detailPost.resharesCount || 0}</span>
                          </span>
                        )}
                        <button className={`feed-action-btn ${detailPost.isBookmarked ? 'bookmarked' : ''}`} onClick={() => handleBookmarkPost(detailPost.originalPostId)}>
                          <Icons.Bookmark fill={detailPost.isBookmarked} />
                          <span>Save</span>
                        </button>
                        <div className="post-menu-wrap">
                          <button className="feed-action-btn" onClick={() => setShareMenuOpen(shareMenuOpen === detailPost.id ? null : detailPost.id)} title="Share">
                            <Icons.Share />
                          </button>
                          {shareMenuOpen === detailPost.id && (
                            <div className="post-menu-dropdown">
                              {typeof navigator !== 'undefined' && navigator.share && (
                                <button className="post-menu-item" onClick={() => shareViaNative(detailPost)}>
                                  <Icons.Share /> More options...
                                </button>
                              )}
                              <button className="post-menu-item" onClick={() => shareToX(detailPost)}>
                                <Icons.XLogo /> X
                              </button>
                              <button className="post-menu-item" onClick={() => shareToWhatsApp(detailPost)}>
                                <Icons.WhatsApp /> WhatsApp
                              </button>
                              <button className="post-menu-item" onClick={() => shareToFacebook(detailPost)}>
                                <Icons.Facebook /> Facebook
                              </button>
                              <button className="post-menu-item" onClick={() => copyShareLink(detailPost)}>
                                <Icons.LinkIcon /> {copiedShareId === detailPost.id ? 'Copied!' : 'Copy Link'}
                              </button>
                              <button className="post-menu-item" onClick={() => shareAsImage(detailPost)} disabled={savingImagePostId === detailPost.id}>
                                <Icons.Download /> {savingImagePostId === detailPost.id ? 'Saving...' : 'Save as Image'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="post-detail-comments">
                      <h4 className="settings-section-title">Comments</h4>
                      {detailPost.comments.length === 0 ? (
                        <p style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          No comments yet. Be the first to share a reflection.
                        </p>
                      ) : (
                        detailPost.comments.map((comment) => renderCommentThread(detailPost.originalPostId, comment))
                      )}
                    </div>
                  </div>
                  <div className="comment-input-box post-detail-input">
                    <input
                      type="text"
                      className="comment-input"
                      placeholder="Share your reflection..."
                      value={commentInputs[detailPost.originalPostId] || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCommentInputs({ ...commentInputs, [detailPost.originalPostId]: v });
                        updateMentionState(e.target, v, (nv) => setCommentInputs(prev => ({ ...prev, [detailPost.originalPostId]: nv })));
                      }}
                      onBlur={() => setMentionState(null)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !mentionState) handleAddComment(detailPost.originalPostId); }}
                    />
                    <button className="comment-submit-btn" onClick={() => handleAddComment(detailPost.originalPostId)}>
                      <Icons.ArrowRight />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ------------------ VIEW: FOLLOWERS / FOLLOWING LIST ------------------ */}
            {followListOpen && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => setFollowListOpen(null)}>
                    <Icons.ChevronLeft />
                  </button>
                  <h3>{followListOpen.type === 'followers' ? 'Followers' : 'Following'}</h3>
                  <div style={{ width: '24px' }}></div>
                </div>
                <div className="scrollable">
                  {followListLoading ? (
                    <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>Loading...</p>
                  ) : followListData.length === 0 ? (
                    <div className="search-empty-state">
                      <span className="empty-state-icon"><Icons.Users /></span>
                      <p>
                        {isSupabaseConfigured
                          ? `No ${followListOpen.type} yet.`
                          : `Full ${followListOpen.type} lists need a live account — this is demo mode.`}
                      </p>
                    </div>
                  ) : (
                    followListData.map(person => {
                      const live = users.find(u => u.id === person.id);
                      const isFollowingNow = live ? live.isFollowing : person.isFollowing;
                      return (
                        <div key={person.id} className="card follow-list-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}
                            onClick={() => { setFollowListOpen(null); openPersonProfile(person.username); }}
                          >
                            <img src={person.avatar} className="feed-user-avatar" alt={person.name} />
                            <div>
                              <div className="feed-user-name">
                                {person.name} {person.isVerified && <Icons.Verified />}
                              </div>
                              <div className="feed-username">@{person.username}</div>
                            </div>
                          </div>
                          {person.id !== (session?.user?.id || null) && (
                            <button
                              className={`follow-chip ${isFollowingNow ? 'following' : ''}`}
                              onClick={() => toggleFollowUser(person.id)}
                            >
                              {isFollowingNow ? 'Following' : 'Follow'}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ------------------ VIEW: EDIT POST ------------------ */}
            {editingPost && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => { setEditingPost(null); setEditPostText(''); }}>
                    <Icons.Close />
                  </button>
                  <h3>Edit Post</h3>
                  <button
                    className="auth-btn"
                    style={{ width: 'auto', padding: '8px 20px', fontSize: '13px' }}
                    disabled={!editPostText.trim() || editPostText.length > POST_MAX_LENGTH || editPostSaving}
                    onClick={handleSaveEditPost}
                  >
                    {editPostSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
                <div className="scrollable">
                  <textarea
                    className="composer-textarea"
                    style={{ width: '100%', minHeight: '160px' }}
                    value={editPostText}
                    onChange={(e) => setEditPostText(e.target.value)}
                    autoFocus
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px' }}>
                    <span className={`composer-char-count ${
                      editPostText.length > POST_MAX_LENGTH ? 'over-limit' : editPostText.length > POST_MAX_LENGTH - 100 ? 'near-limit' : ''
                    }`}>
                      {editPostText.length}/{POST_MAX_LENGTH}
                    </span>
                  </div>
                  {editingPost.video && <video src={editingPost.video} className="feed-image" controls playsInline />}
                  {editingPost.image && <img src={editingPost.image} className="feed-image" alt="post content" />}
                </div>
              </div>
            )}

            {/* ------------------ VIEW: QUOTE RESHARE ------------------ */}
            {quoteReshareTarget && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => { setQuoteReshareTarget(null); setQuoteReshareText(''); }}>
                    <Icons.Close />
                  </button>
                  <h3>Quote</h3>
                  <button
                    className="auth-btn"
                    style={{ width: 'auto', padding: '8px 20px', fontSize: '13px' }}
                    disabled={!quoteReshareText.trim()}
                    onClick={handleQuoteReshare}
                  >
                    Post
                  </button>
                </div>
                <div className="scrollable">
                  <textarea
                    className="composer-textarea"
                    style={{ width: '100%', minHeight: '100px' }}
                    placeholder="Add your thoughts..."
                    value={quoteReshareText}
                    onChange={(e) => setQuoteReshareText(e.target.value)}
                    autoFocus
                  />
                  <div className="card" style={{ marginTop: '12px' }}>
                    <div className="feed-header">
                      <div className="feed-user-info">
                        <img src={quoteReshareTarget.user.avatar} className="feed-user-avatar" alt={quoteReshareTarget.user.name} />
                        <div>
                          <div className="feed-user-name">
                            {quoteReshareTarget.user.name} {quoteReshareTarget.user.isVerified && <Icons.Verified />}
                          </div>
                          {quoteReshareTarget.user.parish && <div className="feed-user-parish"><Icons.Church /> {quoteReshareTarget.user.parish}</div>}
                        </div>
                      </div>
                    </div>
                    <div className="feed-text">{renderFormattedText(quoteReshareTarget.text)}</div>
                    {quoteReshareTarget.video && <video src={quoteReshareTarget.video} className="feed-image" controls playsInline />}
                    {quoteReshareTarget.image && <img src={quoteReshareTarget.image} className="feed-image" alt="post content" />}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------ VIEW: EDIT PROFILE ------------------ */}
            {profileEditOpen && editDraft && (
              <div className="saint-details-view">
                <div className="person-view-header">
                  <button className="icon-btn" onClick={() => setProfileEditOpen(false)}>
                    <Icons.ChevronLeft />
                  </button>
                  <h3>Edit Profile</h3>
                  <div style={{ width: '24px' }}></div>
                </div>

                <div className="scrollable" style={{ paddingBottom: '40px' }}>
                  <div className="avatar-upload-wrap">
                    <img src={editDraft.avatarPreview} className="profile-avatar-large" alt="Your avatar" />
                    <label className="avatar-upload-btn">
                      <Icons.Camera />
                      <input type="file" accept="image/*" onChange={handleAvatarFileChange} style={{ display: 'none' }} />
                    </label>
                  </div>

                  <form className="auth-form" style={{ marginTop: '20px' }} onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }}>
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editDraft.fullName}
                        onChange={(e) => setEditDraft(prev => ({ ...prev, fullName: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Username</label>
                      <div className="username-input-wrap">
                        <span className="username-at">@</span>
                        <input
                          type="text"
                          className="form-input"
                          value={editDraft.username}
                          onChange={(e) => setEditDraft(prev => ({ ...prev, username: e.target.value }))}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck="false"
                          required
                        />
                      </div>
                      {isSupabaseConfigured && editUsernameStatus.state === 'checking' && <span className="input-hint">{editUsernameStatus.message}</span>}
                      {isSupabaseConfigured && editUsernameStatus.state === 'available' && <span className="input-ok"><Icons.Check /> {editUsernameStatus.message}</span>}
                      {isSupabaseConfigured && (editUsernameStatus.state === 'invalid' || editUsernameStatus.state === 'taken') && <span className="input-error">{editUsernameStatus.message}</span>}
                    </div>

                    <div className="form-group">
                      <label>Parish</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="St. Jude, Atlanta"
                        value={editDraft.parish}
                        onChange={(e) => setEditDraft(prev => ({ ...prev, parish: e.target.value }))}
                      />
                    </div>

                    <div className="form-group">
                      <label>Bio</label>
                      <textarea
                        className="form-input"
                        rows={3}
                        maxLength={200}
                        style={{ resize: 'none', fontFamily: 'var(--font-body)' }}
                        value={editDraft.bio}
                        onChange={(e) => setEditDraft(prev => ({ ...prev, bio: e.target.value }))}
                      />
                    </div>

                    {editError && <div className="auth-error">{editError}</div>}

                    <button type="submit" className="auth-btn" disabled={editSaving || editUsernameStatus.state === 'checking' || editUsernameStatus.state === 'taken' || editUsernameStatus.state === 'invalid'}>
                      {editSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ------------------ STORY OVERLAY SHEET ------------------ */}
            {storyOpen && (
              <div className="saint-details-view" style={{ background: 'var(--primary)', color: '#fff', justifyContent: 'space-between', padding: '32px 24px', zIndex: 3000 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: 'var(--secondary)', letterSpacing: '1px' }}>{storyOpen.title}</h3>
                  <button className="icon-btn" onClick={() => setStoryOpen(null)} style={{ color: '#fff' }}>
                    <Icons.Close />
                  </button>
                </div>

                <div style={{ textAlign: 'center', margin: 'auto 0' }}>
                  {storyOpen.id === 'verse' && (
                    <div style={{ padding: '0 12px' }}>
                      <span className="story-hero-icon"><Icons.BookOpen /></span>
                      <p style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: dailyVerse.text.length > 140 ? '17px' : '20px', color: '#fff', lineHeight: '1.6', margin: '24px 0' }}>
                        "{dailyVerse.text}"
                      </p>
                      <h4 style={{ color: 'var(--secondary)' }}>{dailyVerse.ref}</h4>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '28px' }}>
                        <button
                          className="auth-btn"
                          style={{ background: 'var(--secondary)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: 0 }}
                          onClick={() => downloadVerseImage({ text: dailyVerse.text, reference: dailyVerse.ref })}
                        >
                          <Icons.Download /> Save as Image
                        </button>
                        <button
                          className="auth-btn"
                          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', margin: 0 }}
                          onClick={() => {
                            const book = BIBLE_BOOKS.find(b => b.id === dailyVerse.book);
                            if (book) {
                              setSelectedBook(book);
                              setSelectedChapter(dailyVerse.chapter);
                              setVerseModeActive(true);
                              setActiveTab('bible');
                              setStoryOpen(null);
                            }
                          }}
                        >
                          Read in Context
                        </button>
                      </div>
                    </div>
                  )}

                  {storyOpen.id === 'reminder' && (
                    <div>
                      <span className="story-hero-icon"><Icons.Rosary /></span>
                      <h2 style={{ color: '#fff', margin: '14px 0 8px' }}>Consistent Prayer Life</h2>
                      <p style={{ color: '#eee', marginBottom: '24px' }}>
                        {streakCount > 0
                          ? `You're on a ${streakCount}-day streak! Keep growing your communication with God.`
                          : 'Start today — even one prayer logged begins your streak.'}
                      </p>
                      <button className="auth-btn" style={{ background: '#fff', color: 'var(--primary)' }} onClick={() => { setActiveTab('prayers'); setStoryOpen(null); }}>
                        Go to Prayers
                      </button>
                    </div>
                  )}

                </div>

                <div style={{ height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '100%', background: 'var(--secondary)', transformOrigin: 'left', animation: 'fadeIn 5s linear forwards' }}></div>
                </div>
              </div>
            )}

            {/* ------------------ ACTIVE VIEW CONTENT ------------------ */}
            <div
              className="scrollable animate-fade-in"
              ref={mainScrollRef}
              onTouchStart={handleFeedPullStart}
              onTouchMove={handleFeedPullMove}
              onTouchEnd={handleFeedPullEnd}
            >

              {/* 1. HOME SCREEN */}
              {activeTab === 'home' && (
                <div>
                  {/* Pull-to-refresh indicator -- grows with the drag while
                      pulling, then spins in place once refreshFeed() is
                      actually running (see handleFeedPull* above). */}
                  {(pullDistance > 0 || feedRefreshing) && (
                    <div className="pull-refresh-indicator" style={{ height: feedRefreshing ? 48 : pullDistance }}>
                      <span className={`pull-refresh-spinner ${feedRefreshing || pullDistance >= PULL_REFRESH_THRESHOLD ? 'ready' : ''}`}>
                        <Icons.RotateCw />
                      </span>
                    </div>
                  )}

                  {/* For You / Following -- For You is engagement-ranked
                      (recent + well-liked/commented/reshared, with a boost
                      for people you follow), not strict recency; Following
                      is the classic reverse-chronological feed narrowed to
                      people you actually follow. Same split as X. */}
                  <div className="feed-mode-tabs">
                    <button className={`feed-mode-tab-btn ${feedMode === 'forYou' ? 'active' : ''}`} onClick={() => setFeedMode('forYou')}>
                      For You
                    </button>
                    <button className={`feed-mode-tab-btn ${feedMode === 'following' ? 'active' : ''}`} onClick={() => setFeedMode('following')}>
                      Following
                    </button>
                  </div>

                  {/* Stories row */}
                  <div className="stories-container">
                    {STORIES.map(story => (
                      <div key={story.id} className="story-item" onClick={() => setStoryOpen(story)}>
                        <div className="story-ring unread">
                          <div className="story-avatar-mock">
                            {(() => { const StoryIcon = Icons[story.icon]; return StoryIcon ? <StoryIcon /> : null; })()}
                          </div>
                        </div>
                        <span className="story-title">{story.title}</span>
                      </div>
                    ))}
                  </div>

                  {/* Pinned Daily Verse Card */}
                  <div className="card pinned-verse" onClick={() => setStoryOpen(STORIES.find(s => s.id === 'verse'))} style={{ cursor: 'pointer' }}>
                    <div className="pinned-badge">
                      <Icons.Cross /> DAILY VERSE
                    </div>
                    <p className="verse-scripture">
                      "{dailyVerse.text}"
                    </p>
                    <div className="verse-reference">{dailyVerse.ref}</div>
                  </div>

                  {/* Share a post — opens the full composer */}
                  <button className="card composer-trigger" onClick={openComposer}>
                    <img src={myAvatar} className="composer-trigger-avatar" alt="" />
                    <span className="composer-trigger-placeholder">Share your faith with the community...</span>
                    <span className="composer-trigger-plus"><Icons.Plus /></span>
                  </button>

                  {/* Saints Quick Discover Banner — the Saints library otherwise
                      has no obvious entry point from Home, where most people land. */}
                  <div className="card" style={{ marginBottom: '16px', background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(30,58,138,0.05))', border: '1px solid rgba(var(--secondary-rgb), 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => {
                    setSaintCategoryFilter('All');
                    setSubView('saintsBrowse');
                  }}>
                    <div>
                      <h4 style={{ color: 'var(--primary)', fontSize: '14px' }}>Discover the Saints</h4>
                      <p style={{ fontSize: '11px', marginTop: '2px' }}>Read their life stories, feast days & quotes.</p>
                    </div>
                    <span style={{ color: 'var(--secondary)', display: 'flex' }}><Icons.Sparkles /></span>
                  </div>

                  {homeFeedPosts.length === 0 && (
                    <div className="search-empty-state">
                      <span className="empty-state-icon"><Icons.Comment /></span>
                      <p>
                        {feedMode === 'following' && visiblePosts.length > 0
                          ? "No posts yet from people you follow. Switch to For You, or follow a few more people."
                          : 'Start sharing your faith. Community posts will appear here.'}
                      </p>
                    </div>
                  )}

                  {/* Social Feed List */}
                  {homeFeedPosts.map(post => renderPostCard(post))}
                </div>
              )}

              {/* 2. BIBLE SCREEN */}
              {activeTab === 'bible' && (
                <div>
                  <div className="bible-header-section">
                    <div className="bible-tabs">
                      <button className={`bible-tab-btn ${bibleTab === 'OT' ? 'active' : ''}`} onClick={() => setBibleTab('OT')}>
                        Old Testament
                      </button>
                      <button className={`bible-tab-btn ${bibleTab === 'NT' ? 'active' : ''}`} onClick={() => setBibleTab('NT')}>
                        New Testament
                      </button>
                    </div>

                    <div className="bible-adjust-row">
                      <button className="version-picker-btn" onClick={() => setVersionPickerOpen(true)}>
                        {BIBLE_VERSIONS.find(v => v.id === bibleVersion)?.shortName || 'DR'}
                        <Icons.ChevronDown />
                      </button>
                      <button className={`icon-btn ${bibleSettingsOpen ? 'active' : ''}`} onClick={() => setBibleSettingsOpen(!bibleSettingsOpen)}>
                        <Icons.Adjust />
                      </button>
                    </div>
                  </div>

                  {versionPickerOpen && (
                    <>
                      <div className="version-picker-scrim" onClick={() => setVersionPickerOpen(false)} />
                      <div className="version-picker-sheet">
                        <div className="welcome-sheet-header">
                          <h3 className="welcome-sheet-title" style={{ marginBottom: 0 }}>Bible Version</h3>
                          <button className="icon-btn" onClick={() => setVersionPickerOpen(false)} aria-label="Close">
                            <Icons.Close />
                          </button>
                        </div>
                        <p className="welcome-sheet-desc">
                          Douay-Rheims, KJV, and WEB are complete and work offline. NKJV, RSV, and Good News Translation are still under copyright, so we can only add them through a licensed Bible API. That's next.
                        </p>
                        <div className="version-picker-list">
                          {BIBLE_VERSIONS.map(v => (
                            <button
                              key={v.id}
                              className={`version-picker-item ${v.id === bibleVersion ? 'active' : ''} ${!v.available ? 'disabled' : ''}`}
                              disabled={!v.available}
                              onClick={() => { setBibleVersion(v.id); setVersionPickerOpen(false); }}
                            >
                              <span>
                                <span className="version-picker-item-name">{v.name}</span>
                                <span className="version-picker-item-short">{v.shortName}</span>
                              </span>
                              {v.id === bibleVersion ? <Icons.Check /> : !v.available && <span className="version-picker-soon">Coming soon</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Bible Text Settings Drawer */}
                  {bibleSettingsOpen && (
                    <div className="read-settings-drawer">
                      <div className="settings-option">
                        <span className="settings-label">Reading Mode (Theme)</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="filter-pill active" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
                            Toggle {theme === 'light' ? 'Dark' : 'Light'} Mode
                          </button>
                        </div>
                      </div>
                      <div className="settings-option">
                        <span className="settings-label">Font Size ({bibleFontSize}px)</span>
                        <div className="size-controls">
                          <button className="size-btn" onClick={() => setBibleFontSize(Math.max(12, bibleFontSize - 2))}>A-</button>
                          <button className="size-btn" onClick={() => setBibleFontSize(Math.min(24, bibleFontSize + 2))}>A+</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reading mode selection logic */}
                  {chapterGridBook ? (
                    <div className="reading-pane">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <button className="icon-btn" onClick={() => setChapterGridBook(null)}>
                          <Icons.ChevronLeft /> <span style={{ fontSize: '13px', fontWeight: 600 }}>Back</span>
                        </button>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--secondary)' }}>
                          {chapterGridBook.name} • {chapterGridBook.chapters} Chapters
                        </span>
                      </div>
                      <div className="chapter-grid">
                        {Array.from({ length: chapterGridBook.chapters }, (_, i) => i + 1).map(num => (
                          <button
                            key={num}
                            className={`chapter-cell ${chapterGridBook.id === selectedBook.id && num === selectedChapter ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedBook(chapterGridBook);
                              setSelectedChapter(num);
                              setVerseModeActive(true);
                              setChapterGridBook(null);
                            }}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : verseModeActive ? (
                    <div className="reading-pane">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <button className="icon-btn" onClick={() => setVerseModeActive(false)}>
                          <Icons.ChevronLeft /> <span style={{ fontSize: '13px', fontWeight: 600 }}>Back to Books</span>
                        </button>
                        <button className="icon-btn chapter-jump-btn" onClick={() => setChapterGridBook(selectedBook)}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--secondary)' }}>
                            {selectedBook.name} • Ch {selectedChapter}
                          </span>
                          <Icons.ChevronDown />
                        </button>
                      </div>

                      {bibleVersion !== 'dr' && selectedBook.category === 'Deuterocanonical' && (
                        <p className="version-fallback-note">
                          {BIBLE_VERSIONS.find(v => v.id === bibleVersion)?.shortName} doesn't include {selectedBook.name} — showing Douay-Rheims instead.
                        </p>
                      )}

                      <div className="bible-text-display">
                        {versesLoading ? (
                          <div className="verse-skeleton-group">
                            {[...Array(6)].map((_, i) => <div key={i} className="verse-skeleton" />)}
                          </div>
                        ) : chapterVerses.map(verse => {
                          const verseKey = `${selectedBook.id}:${selectedChapter}:${verse.v}`;
                          const isHighlighted = bibleHighlights.includes(verseKey);
                          const isBookmarked = bibleBookmarks.includes(verseKey);
                          return (
                            <div
                              key={verse.v}
                              className={`verse-item ${isHighlighted ? 'highlighted' : ''}`}
                              onClick={() => handleVerseClick(verseKey)}
                              style={{ cursor: 'pointer' }}
                            >
                              <span className="verse-text-group">
                                <span className="verse-number">{verse.v}</span>
                                <span className="verse-content">{verse.t}</span>
                              </span>
                              <button
                                className={`verse-bookmark-btn ${isBookmarked ? 'active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); handleVerseBookmark(verseKey); }}
                                aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark verse'}
                              >
                                <Icons.Bookmark fill={isBookmarked} />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Chapter Pagination */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                        <button
                          className="bible-tab-btn chapter-nav-btn"
                          disabled={selectedChapter <= 1}
                          onClick={() => setSelectedChapter(prev => Math.max(1, prev - 1))}
                        >
                          <Icons.ChevronLeft /> Previous
                        </button>
                        <button
                          className="bible-tab-btn chapter-nav-btn"
                          disabled={selectedChapter >= selectedBook.chapters}
                          onClick={() => setSelectedChapter(prev => Math.min(selectedBook.chapters, prev + 1))}
                        >
                          Next <Icons.ChevronRight />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Books Selection Grid -- grouped by category (in the
                          order they already appear in BIBLE_BOOKS, which
                          follows standard Catholic canon order) so sections
                          like Deuterocanonical have their own clearly
                          labeled heading instead of being mixed anonymously
                          into one long flat list. */}
                      {(() => {
                        const books = BIBLE_BOOKS.filter(b => b.testament === bibleTab);
                        const categories = [...new Set(books.map(b => b.category))];
                        return categories.map(category => (
                          <div key={category}>
                            <h4 className="settings-section-title">{category}</h4>
                            <div className="books-grid">
                              {books.filter(b => b.category === category).map(book => (
                                <div
                                  key={book.id}
                                  className="book-card"
                                  onClick={() => setChapterGridBook(book)}
                                >
                                  <span className="book-card-name">{book.name}</span>
                                  <span className="book-card-meta">{book.chapters} Chapters</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* 3. PRAYERS SCREEN */}
              {activeTab === 'prayers' && (
                <div>
                  {/* Streak Card */}
                  <div className="prayer-streak-card">
                    <div className="streak-info">
                      <h3>Consistent Prayer Life</h3>
                      <div className="streak-number">{streakCount} Days Streak</div>
                      <div className="streak-calendar">
                        {weekCalendar.map((day, idx) => (
                          <div
                            key={idx}
                            className={`streak-day ${day.completed ? 'completed' : ''} ${day.isToday ? 'is-today' : ''}`}
                            title={day.dateStr}
                          >
                            {day.label}
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="streak-flame"><Icons.Flame /></span>
                  </div>

                  <h3 style={{ fontSize: '15px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Liturgy & Daily Prayers</h3>

                  {!isNotificationSupported() ? null : notificationPermission === 'denied' && (
                    <div className="auth-error" style={{ marginBottom: '16px' }}>
                      Notifications are blocked in your browser settings, so reminders below won't be able to fire. You can re-enable them in your browser's site settings for Crescamus.
                    </div>
                  )}

                  {/* Liturgical Prayer list — the switch on each card turns its
                      reminder on/off; marking today's prayer done (for the
                      streak) is the separate checkmark button. */}
                  {[
                    { key: 'morning', icon: <Icons.Sunrise />, title: 'Morning Prayer', desc: 'Offering the day to God' },
                    { key: 'angelus', icon: <Icons.Notification />, title: 'The Angelus', desc: 'Incarnation commemoration' },
                    { key: 'rosary', icon: <Icons.Rosary />, title: 'The Holy Rosary', desc: 'Contemplating Christ’s mysteries' },
                    { key: 'evening', icon: <Icons.Moon />, title: 'Evening Examen', desc: 'Daily examination of conscience' }
                  ].map(({ key, icon, title, desc }) => (
                    <div className="prayer-card" key={key}>
                      <div className="prayer-card-detail">
                        <div className="prayer-icon-wrapper">{icon}</div>
                        <div className="prayer-card-text">
                          <h4>{title}</h4>
                          <p>{desc}</p>
                          {remindersEnabled[key] && (
                            <div className="reminder-time-row">
                              <Icons.Notification /> Remind me at
                              <input
                                type="time"
                                className="reminder-time-input"
                                value={reminders[key]}
                                onChange={(e) => handleReminderTimeChange(key, e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="prayer-card-actions">
                        <button
                          className={`prayer-done-btn ${prayersCompleted[key] ? 'done' : ''}`}
                          onClick={() => togglePrayerCompleted(key)}
                          title="Mark as prayed today"
                        >
                          <Icons.Check />
                        </button>
                        <label className="switch">
                          <input type="checkbox" checked={remindersEnabled[key]} onChange={() => toggleReminderEnabled(key)} />
                          <span className="slider"></span>
                        </label>
                      </div>
                    </div>
                  ))}

                  {/* Divine Mercy Chaplet — fixed 3am & 3pm (the Hour of Great
                      Mercy), in the device's own local time. Not user-editable
                      by design, unlike the cards above. */}
                  <div className="prayer-card">
                    <div className="prayer-card-detail">
                      <div className="prayer-icon-wrapper"><Icons.Sparkles /></div>
                      <div className="prayer-card-text">
                        <h4>Divine Mercy Chaplet</h4>
                        <p>Praying for mercy on the world</p>
                        {remindersEnabled.mercy && (
                          <div className="reminder-time-row">
                            <Icons.Notification /> Reminds at 3:00 AM &amp; 3:00 PM, your local time
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="prayer-card-actions">
                      <button
                        className={`prayer-done-btn ${prayersCompleted.mercy ? 'done' : ''}`}
                        onClick={() => togglePrayerCompleted('mercy')}
                        title="Mark as prayed today"
                      >
                        <Icons.Check />
                      </button>
                      <label className="switch">
                        <input type="checkbox" checked={remindersEnabled.mercy} onChange={() => toggleReminderEnabled('mercy')} />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>

                  {/* Personal Prayers Checklist */}
                  <div className="card" style={{ marginTop: '24px' }}>
                    <h4 style={{ fontSize: '14px', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                      Personal Prayer Intentions
                    </h4>

                    <form onSubmit={handleAddPersonalPrayer} className="intention-form">
                      <input
                        type="text"
                        className="comment-input"
                        placeholder="Add intention (e.g. For Grandma's recovery)"
                        value={newPersonalPrayer}
                        onChange={(e) => setNewPersonalPrayer(e.target.value)}
                      />
                      <input
                        type="time"
                        className="reminder-time-input intention-time-input"
                        value={newPersonalPrayerTime}
                        onChange={(e) => setNewPersonalPrayerTime(e.target.value)}
                        title="Optional: remind me at this time"
                      />
                      <button type="submit" className="comment-submit-btn" style={{ borderRadius: '8px', width: '38px', height: '34px' }}>
                        <Icons.Plus />
                      </button>
                    </form>
                    {intentionError ? (
                      <p className="input-error" style={{ marginTop: '-6px', marginBottom: '12px' }}>{intentionError}</p>
                    ) : (
                      <p className="input-hint" style={{ marginTop: '-6px', marginBottom: '12px' }}>
                        Set a time above to get reminded about this intention — optional.
                      </p>
                    )}

                    {personalPrayers.length === 0 ? (
                      <p style={{ fontStyle: 'italic', fontSize: '12px', textAlign: 'center', padding: '12px' }}>
                        No personal intentions added yet. Add one above!
                      </p>
                    ) : (
                      personalPrayers.map(p => (
                        <div key={p.id} className="intention-row">
                          <span style={{ textDecoration: p.completed ? 'line-through' : 'none', color: p.completed ? 'var(--text-secondary)' : 'var(--text)' }}>
                            {p.completed ? <Icons.Check /> : <Icons.Circle />} {p.text}
                            {p.reminder_enabled && p.reminder_time && (
                              <span className="intention-reminder-badge"><Icons.Notification /> {p.reminder_time}</span>
                            )}
                          </span>
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button className="filter-pill" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => togglePersonalPrayer(p.id)}>
                              {p.completed ? 'Undo' : 'Done'}
                            </button>
                            <button className="icon-btn" style={{ padding: '2px' }} onClick={() => deletePersonalPrayer(p.id)} title="Delete">
                              <Icons.Trash />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 4. AUDIO SCREEN */}
              {activeTab === 'audio' && (
                <div>
                  <h3 style={{ fontSize: '15px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Catholic Audio Library</h3>
                  
                  <div className="audio-grid">
                    {AUDIO_TRACKS.map(track => {
                      const isCurrent = track.id === currentTrack.id;
                      return (
                        <div
                          key={track.id}
                          className="audio-track-item"
                          onClick={() => {
                            setCurrentTrack(track);
                            setIsPlaying(true);
                          }}
                          style={isCurrent ? { borderColor: 'var(--primary)', background: 'rgba(var(--primary-rgb), 0.04)' } : {}}
                        >
                          <div className="audio-track-info">
                            <img src={track.cover} className="track-cover-art" alt={track.title} />
                            <div className="track-title-detail">
                              <h4 style={isCurrent ? { color: 'var(--primary)' } : {}}>{track.title}</h4>
                              <p>{track.artist} • {track.category}</p>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatTime(track.duration)}</span>
                            {isCurrent && isPlaying ? (
                              <span className="track-status-icon" style={{ color: 'var(--primary)' }}><Icons.Volume /></span>
                            ) : (
                              <span className="track-status-icon"><Icons.Play /></span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Saints Quick Discover Banner in Audio */}
                  <div className="card" style={{ marginTop: '24px', background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(30,58,138,0.05))', border: '1px solid rgba(var(--secondary-rgb), 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => {
                    setSaintCategoryFilter('All');
                    setSubView('saintsBrowse');
                  }}>
                    <div>
                      <h4 style={{ color: 'var(--primary)', fontSize: '14px' }}>Discover Saints</h4>
                      <p style={{ fontSize: '11px', marginTop: '2px' }}>Explore biographies, feast days & quotes.</p>
                    </div>
                    <span style={{ color: 'var(--secondary)', display: 'flex' }}><Icons.Sparkles /></span>
                  </div>
                </div>
              )}

              {/* 5. PROFILE SCREEN */}
              {activeTab === 'profile' && (
                <div>
                  <div className="profile-hero">
                    <button
                      className="icon-btn"
                      style={{ position: 'absolute', top: '16px', right: '0' }}
                      onClick={() => setSettingsOpen(true)}
                      aria-label="Settings"
                    >
                      <Icons.Gear />
                    </button>
                    <img src={myAvatar} className="profile-avatar-large" alt="Profile" />
                    <h3 className="profile-name">
                      {username || 'Catholic Pilgrim'}
                      {myIsVerified && <Icons.Verified size={16} />}
                    </h3>
                    <div className="username-text">@{myUsername || 'pilgrim'}</div>
                    {parish && <div className="profile-parish"><Icons.Church /> {parish}</div>}
                    <p className="profile-bio">{bio}</p>

                    <div className="profile-stats-row">
                      <div className="stat-item">
                        <div className="stat-val">{posts.filter(p => p.user.username === myUsername && !p.resharedBy).length}</div>
                        <div className="stat-label">Posts</div>
                      </div>
                      <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => openFollowList(session?.user?.id || 'me', myUsername, 'followers')}>
                        <div className="stat-val">{myFollowerCount}</div>
                        <div className="stat-label">Followers</div>
                      </div>
                      <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => openFollowList(session?.user?.id || 'me', myUsername, 'following')}>
                        <div className="stat-val">{users.filter(u => u.isFollowing).length}</div>
                        <div className="stat-label">Following</div>
                      </div>
                    </div>

                    <button className="filter-pill edit-profile-btn" onClick={openProfileEdit}>
                      <Icons.Edit /> Edit Profile
                    </button>
                  </div>

                  {/* Profile section Tabs */}
                  <div className="profile-tabs-header">
                    <div className={`profile-tab-title ${profileTab === 'posts' ? 'active' : ''}`} onClick={() => setProfileTab('posts')}>
                      My Posts
                    </div>
                    <div className={`profile-tab-title ${profileTab === 'reshares' ? 'active' : ''}`} onClick={() => setProfileTab('reshares')}>
                      Reshares
                    </div>
                    <div className={`profile-tab-title ${profileTab === 'bookmarks' ? 'active' : ''}`} onClick={() => setProfileTab('bookmarks')}>
                      Bookmarks
                    </div>
                  </div>

                  {profileTab === 'posts' && (() => {
                    const myPosts = posts
                      .filter(p => p.user.username === myUsername && !p.resharedBy)
                      .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
                    return (
                      <div>
                        {myPosts.length === 0 ? (
                          <div className="search-empty-state">
                            <span className="empty-state-icon"><Icons.Comment /></span>
                            <p>You haven't shared anything yet. Tap the + on Home to post.</p>
                          </div>
                        ) : (
                          myPosts.map(post => renderPostCard(post, { showPinnedBadge: true }))
                        )}
                      </div>
                    );
                  })()}

                  {profileTab === 'reshares' && (
                    <div>
                      {posts.filter(p => p.resharedBy?.username === myUsername).length === 0 ? (
                        <div className="search-empty-state">
                          <span className="empty-state-icon"><Icons.Repost /></span>
                          <p>Posts you reshare will show up here, separate from your own.</p>
                        </div>
                      ) : (
                        posts.filter(p => p.resharedBy?.username === myUsername).map(post => renderPostCard(post))
                      )}
                    </div>
                  )}

                  {profileTab === 'bookmarks' && (
                    <div>
                      {posts.filter(p => p.isBookmarked).length === 0 ? (
                        <div className="search-empty-state">
                          <span className="empty-state-icon"><Icons.Bookmark fill={false} /></span>
                          <p>No saved posts yet. Tap the bookmark icon on posts to save them here.</p>
                        </div>
                      ) : (
                        posts.filter(p => p.isBookmarked).map(post => (
                          <div key={post.id} className="card" style={{ padding: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '12px' }}>{post.user.name}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{post.time}</span>
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text)' }}>{renderFormattedText(post.text, openPersonProfile)}</div>
                          </div>
                        ))
                      )}

                      {/* Bookmarked Verses Section */}
                      <div className="card" style={{ marginTop: '16px' }}>
                        <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>Saved Bible Verses</h4>
                        {bibleBookmarks.length === 0 ? (
                          <p style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--text-secondary)' }}>No saved verses yet.</p>
                        ) : (
                          bibleBookmarks.map(bm => {
                            const [bookId, ch, v] = bm.split(':');
                            const book = BIBLE_BOOKS.find(b => b.id === bookId);
                            return (
                              <div key={bm} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0', fontSize: '12px' }}>
                                <strong>{book?.name} {ch}:{v}</strong>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  <div className="settings-section">
                    <button className="settings-row" onClick={() => setSettingsOpen(true)}>
                      <span><Icons.Gear /> Settings</span>
                      <Icons.ChevronRight />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* PERSISTENT AUDIO MINI-PLAYER -- only once playback has
                actually happened this session, and not while the user has
                explicitly closed it (see audioSessionStarted/
                miniPlayerDismissed and the isPlaying effect above). */}
            {currentTrack && !playerExpanded && audioSessionStarted && !miniPlayerDismissed && (
              <div className="mini-player" onClick={() => setPlayerExpanded(true)}>
                <div className="mini-player-left">
                  <img
                    src={currentTrack.cover}
                    className={`mini-player-cover ${isPlaying ? 'playing' : ''}`}
                    alt="cover"
                  />
                  <div className="mini-player-details">
                    <h5>{currentTrack.title}</h5>
                    <p>{currentTrack.artist}</p>
                  </div>
                </div>

                <div className="mini-player-controls" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                  </button>
                  <button className="icon-btn" onClick={() => setPlayerExpanded(true)}>
                    <Icons.ChevronDown />
                  </button>
                  <button className="icon-btn" aria-label="Hide mini player" title="Hide (reappears next time you press play)" onClick={() => setMiniPlayerDismissed(true)}>
                    <Icons.Close />
                  </button>
                </div>
              </div>
            )}

            {/* FULLSCREEN AUDIO PLAYER SHEET */}
            {playerExpanded && currentTrack && (
              <div className="fullscreen-player">
                <div className="player-header">
                  <button className="icon-btn" onClick={() => setPlayerExpanded(false)}>
                    <Icons.ChevronDown />
                  </button>
                  <h3>Now Playing</h3>
                  {/* Purely a spacer matching the back button's footprint so
                      the title stays centered -- no bookmarking feature exists
                      yet, so there's nothing real to put here. */}
                  <div className="icon-btn" style={{ visibility: 'hidden' }} aria-hidden="true">
                    <Icons.Bookmark fill={false} />
                  </div>
                </div>

                <div className="player-content">
                  {/* Swipe handlers live on just this cover/title block, not
                      the whole player-content, so dragging the seek slider
                      below (also a horizontal gesture) can't be mistaken for
                      a track-skip swipe. */}
                  <div
                    className="player-swipe-area"
                    onTouchStart={handlePlayerSwipeStart}
                    onTouchEnd={handlePlayerSwipeEnd}
                  >
                    <img
                      src={currentTrack.cover}
                      className={`player-cover-large ${isPlaying ? 'playing' : ''}`}
                      alt="cover large"
                    />

                    <div className="player-track-info">
                      <h2>{currentTrack.title}</h2>
                      <p>{currentTrack.artist}</p>
                    </div>
                  </div>

                  <div className="progress-bar-container">
                    <input
                      type="range"
                      className="progress-slider"
                      min="0"
                      max={trackDuration}
                      value={trackProgress}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    />
                    <div className="progress-time-row">
                      <span>{formatTime(trackProgress)}</span>
                      <span>{formatTime(trackDuration)}</span>
                    </div>
                  </div>

                  <div className="player-controls-row">
                    <button className="icon-btn skip-btn" onClick={playPreviousTrack} aria-label="Previous track">
                      <Icons.SkipBack />
                    </button>
                    <button className="icon-btn seek-btn" onClick={() => handleSeek(Math.max(0, trackProgress - 15))}>
                      <Icons.RotateCcw /> <span>15s</span>
                    </button>
                    <button className="play-pause-large" onClick={() => setIsPlaying(!isPlaying)}>
                      {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                    </button>
                    <button className="icon-btn seek-btn" onClick={() => handleSeek(Math.min(trackDuration, trackProgress + 15))}>
                      <span>15s</span> <Icons.RotateCw />
                    </button>
                    <button className="icon-btn skip-btn" onClick={playNextTrack} aria-label="Next track">
                      <Icons.SkipForward />
                    </button>
                  </div>

                  <div className="extra-controls-row">
                    <div className="control-item-widget" onClick={() => {
                      const speeds = [1.0, 1.25, 1.5, 2.0];
                      const nextSpeed = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                      setPlaybackRate(nextSpeed);
                    }}>
                      <span>Speed</span>
                      <div>{playbackRate}x</div>
                    </div>

                    <div className="control-item-widget" onClick={() => {
                      if (sleepTimeLeft === null) {
                        setSleepTimeLeft(300); // 5 mins for quick demo
                      } else {
                        setSleepTimeLeft(null);
                      }
                    }}>
                      <span>Sleep Timer</span>
                      <div>{sleepTimeLeft !== null ? `${formatTime(sleepTimeLeft)}` : 'Off'}</div>
                    </div>

                    <div className="control-item-widget" onClick={playNextTrack}>
                      <span>Up Next</span>
                      <div>{AUDIO_TRACKS[(AUDIO_TRACKS.findIndex(t => t.id === currentTrack.id) + 1) % AUDIO_TRACKS.length].title}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>

            {/* BOTTOM PERSISTENT NAVIGATION BAR (mobile only -- see .desktop-sidebar above) */}
            <div className="app-navbar">
              <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={handleGoHome}>
                <Icons.Home active={activeTab === 'home'} />
                <span>Home</span>
              </button>
              <button className={`nav-item ${activeTab === 'bible' ? 'active' : ''}`} onClick={() => { setActiveTab('bible'); setSubView(null); }}>
                <Icons.Bible active={activeTab === 'bible'} />
                <span>Bible</span>
              </button>
              <button className={`nav-item ${activeTab === 'prayers' ? 'active' : ''}`} onClick={() => { setActiveTab('prayers'); setSubView(null); }}>
                <Icons.Prayers active={activeTab === 'prayers'} />
                <span>Prayers</span>
              </button>
              <button className={`nav-item ${activeTab === 'audio' ? 'active' : ''}`} onClick={() => { setActiveTab('audio'); setSubView(null); }}>
                <Icons.Audio active={activeTab === 'audio'} />
                <span>Audio</span>
              </button>
              <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => { setActiveTab('profile'); setSubView(null); }}>
                <Icons.Profile active={activeTab === 'profile'} />
                <span>Profile</span>
              </button>
            </div>
          </>
        )}

        {/* ------------------ VIEW: PRIVACY POLICY / TERMS OF SERVICE ------------------
            Rendered here, outside the isLoggedIn fragment, because the
            register form's Terms/Privacy links (in the signed-out auth
            flow) call setLegalView too -- nested inside the logged-in-only
            fragment, clicking those links from the register form silently
            did nothing, since the whole modal simply wasn't mounted yet. */}
        {legalView && (
          <div className="saint-details-view">
            <div className="person-view-header">
              <button className="icon-btn" onClick={() => setLegalView(null)}>
                <Icons.ChevronLeft />
              </button>
              <h3>{legalView === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</h3>
              <div style={{ width: '24px' }}></div>
            </div>
            <div className="scrollable">
              <pre className="legal-text">{legalView === 'privacy' ? PRIVACY_POLICY : TERMS_OF_SERVICE}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
