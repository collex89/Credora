// Data layer for Crescamus. Every function maps database rows into the
// exact shapes the UI already renders, so App.jsx stays presentation-only.
import { supabase } from './supabase';

// Cache-Control max-age (seconds) stamped onto uploads that live at a URL
// whose bytes can never change: post media gets a unique timestamped path
// per upload, and avatars sit at a fixed path but are only ever handed out
// with a ?t= cache-buster that changes whenever one is replaced. Supabase
// defaults to 3600, which made every viewer re-download the same unchanged
// image once an hour -- pure repeat egress for no benefit, and the largest
// avoidable chunk of the Storage bill.
//
// Deliberately not used for message images: those are private, served via
// signed URLs that are re-minted (with a fresh token, so a fresh URL) on
// every fetchMessages call, so a longer max-age can't be hit anyway -- and
// a year-long cache header on private DM content is the wrong default to
// hand to any intermediary.
const IMMUTABLE_MEDIA_CACHE_SECONDS = '31536000'; // one year

const timeAgo = (iso) => {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hrs ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString();
};

// Deep-blue initial-letter avatar for users without a photo (no external hosts).
export const fallbackAvatar = (name) => {
  const letter = ((name || '?').trim()[0] || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#1E3A8A"/><text x="40" y="53" font-family="sans-serif" font-size="34" fill="#FFFFFF" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const displayName = (profile) => profile?.full_name || profile?.username || 'Member';

const avatarOf = (profile) => profile?.avatar_url || fallbackAvatar(displayName(profile));

// ---------------------------------------------------------------- auth

export async function signUpWithEmail({ email, password, username, fullName, parish }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, full_name: fullName, parish } }
  });
  return { session: data?.session ?? null, error };
}

export async function signInWithEmail({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signInWithProvider(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  });
  return { error };
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ------------------------------------------------------------ profiles

export async function checkUsernameAvailable(username, excludeUserId = null) {
  let query = supabase.from('profiles').select('id').eq('username', username);
  if (excludeUserId) query = query.neq('id', excludeUserId);
  const { data, error } = await query.maybeSingle();
  if (error) return { available: false, error };
  return { available: !data, error: null };
}

export async function updateProfile(userId, updates) {
  return supabase.from('profiles').update(updates).eq('id', userId);
}

// Stored at <userId>/avatar.<ext> so each user can only ever have one file,
// and the storage policies (folder name === auth.uid()) let them replace it.
export async function uploadAvatar(userId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    cacheControl: IMMUTABLE_MEDIA_CACHE_SECONDS
  });
  if (error) return { url: null, error };
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
}

export async function fetchMyFollowerCount(userId) {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('followee_id', userId);
  return count || 0;
}

export async function fetchMyProfile(userId) {
  // The profile is created by a DB trigger on signup; retry once in case
  // this runs before the trigger has committed.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (data) return data;
    await new Promise(r => setTimeout(r, 800));
  }
  return null;
}

// Everyone else on the platform, shaped for the people/follow UI.
export async function fetchCommunity(myId) {
  const [{ data: profiles, error: pErr }, { data: follows, error: fErr }] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('follows').select('follower_id, followee_id')
  ]);
  if (pErr || fErr) return null;

  return profiles
    .filter(p => p.id !== myId)
    .map(p => ({
      id: p.id,
      name: displayName(p),
      username: p.username,
      avatar: avatarOf(p),
      parish: p.parish || '',
      bio: p.bio || '',
      isVerified: !!p.is_verified,
      followers: follows.filter(f => f.followee_id === p.id).length,
      following: follows.filter(f => f.follower_id === p.id).length,
      isFollowing: follows.some(f => f.follower_id === myId && f.followee_id === p.id),
      isFollowedBy: follows.some(f => f.follower_id === p.id && f.followee_id === myId)
    }));
}

// Resolved lists for the followers/following screens — who exactly follows
// (or is followed by) a given user, each row shaped for the person list UI.
export async function fetchFollowers(userId, myId) {
  const [{ data, error }, { data: myFollows }] = await Promise.all([
    supabase
      .from('follows')
      .select('follower:profiles!follows_follower_id_fkey (id, username, full_name, parish, avatar_url, is_verified)')
      .eq('followee_id', userId),
    supabase.from('follows').select('followee_id').eq('follower_id', myId)
  ]);
  if (error) return [];
  const myFollowingIds = new Set((myFollows || []).map(f => f.followee_id));
  return data.map(row => ({
    id: row.follower.id,
    name: displayName(row.follower),
    username: row.follower.username,
    avatar: avatarOf(row.follower),
    parish: row.follower.parish || '',
    isVerified: !!row.follower.is_verified,
    isFollowing: myFollowingIds.has(row.follower.id)
  }));
}

export async function fetchFollowing(userId, myId) {
  const [{ data, error }, { data: myFollows }] = await Promise.all([
    supabase
      .from('follows')
      .select('followee:profiles!follows_followee_id_fkey (id, username, full_name, parish, avatar_url, is_verified)')
      .eq('follower_id', userId),
    supabase.from('follows').select('followee_id').eq('follower_id', myId)
  ]);
  if (error) return [];
  const myFollowingIds = new Set((myFollows || []).map(f => f.followee_id));
  return data.map(row => ({
    id: row.followee.id,
    name: displayName(row.followee),
    username: row.followee.username,
    avatar: avatarOf(row.followee),
    parish: row.followee.parish || '',
    isVerified: !!row.followee.is_verified,
    isFollowing: myFollowingIds.has(row.followee.id)
  }));
}

// ---------------------------------------------------------------- feed

// Comments come back as a flat list (top-level + replies mixed together) —
// building the one-level tree client-side avoids a nested self-referencing
// PostgREST embed, which is exactly the kind of query that produced an
// ambiguous-relationship error once already on this table (see comment_likes).
const buildCommentTree = (flatComments) => {
  const repliesByParent = {};
  flatComments.forEach(c => {
    if (c.parentId) (repliesByParent[c.parentId] ||= []).push(c);
  });
  return flatComments
    .filter(c => !c.parentId)
    .map(c => ({ ...c, replies: repliesByParent[c.id] || [] }));
};

const mapPost = (row, myId, bookmarkedIds) => ({
  id: row.id,
  originalPostId: row.id,
  createdAt: row.created_at,
  resharedBy: null,
  isPinned: !!row.pinned_at,
  pinnedAt: row.pinned_at || null,
  user: {
    name: displayName(row.author),
    username: row.author?.username || '',
    avatar: avatarOf(row.author),
    parish: row.author?.parish || '',
    isVerified: !!row.author?.is_verified
  },
  time: timeAgo(row.created_at),
  text: row.text,
  image: row.image_url || null,
  video: row.video_url || null,
  likes: (row.likes || []).length,
  isLiked: (row.likes || []).some(l => l.user_id === myId),
  resharesCount: (row.reshares || []).length,
  commentsCount: (row.comments || []).length,
  comments: buildCommentTree(
    (row.comments || [])
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(c => ({
        id: c.id,
        user: displayName(c.user),
        userIsVerified: !!c.user?.is_verified,
        text: c.text,
        likes: (c.comment_likes || []).length,
        isLiked: (c.comment_likes || []).some(l => l.user_id === myId),
        parentId: c.parent_comment_id || null
      }))
  ),
  isBookmarked: bookmarkedIds.has(row.id)
});

// Shared by the main feed query and the reshares query below — a reshare
// embeds the full original post in exactly this shape so mapPost() can be
// reused for both.
const POST_SELECT = `
  id, text, image_url, video_url, created_at, pinned_at,
  author:profiles!posts_author_id_fkey (id, username, full_name, parish, avatar_url, is_verified),
  likes (user_id),
  reshares (user_id),
  comments (id, text, created_at, parent_comment_id, user:profiles!comments_user_id_fkey (username, full_name, is_verified), comment_likes (user_id))
`;

export async function fetchFeed(myId) {
  // A second sort key matters here: two posts (or reshares) can land on the
  // exact same created_at, especially seed/demo data inserted in a batch,
  // and Postgres doesn't promise a stable order for ties across repeated
  // queries without one -- without it, reloading with no actual new
  // activity could still shuffle which post looks "first".
  const [{ data: rows, error }, { data: bookmarks }, { data: reshareRows, error: rErr }] = await Promise.all([
    supabase.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50),
    supabase.from('bookmarks').select('post_id'),
    supabase
      .from('reshares')
      .select(`id, created_at, quote_text, resharer:profiles!reshares_user_id_fkey (username, full_name), post:posts (${POST_SELECT})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50)
  ]);
  if (error) return null;

  const bookmarkedIds = new Set((bookmarks || []).map(b => b.post_id));
  const posts = rows.map(row => mapPost(row, myId, bookmarkedIds));
  const reshares = (rErr ? [] : reshareRows || [])
    .filter(r => r.post) // the original post may have since been deleted
    .map(r => ({
      ...mapPost(r.post, myId, bookmarkedIds),
      id: `reshare-${r.id}`,
      reshareId: r.id,
      resharedBy: { name: displayName(r.resharer), username: r.resharer?.username || '' },
      resharedAt: timeAgo(r.created_at),
      quoteText: r.quote_text || null,
      createdAt: r.created_at
    }));

  // Reshares sort by when they were reshared, not when the original post
  // was written — the same convention as every other social feed. Falls
  // back to comparing id when createdAt ties exactly, for the same
  // stable-tiebreak reason as the queries above.
  return [...posts, ...reshares].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt) || String(b.id).localeCompare(String(a.id))
  );
}

// A shared-post link may point to something older than the first 50 feed
// entries. Fetch it directly so the link remains useful regardless of when
// the post was written or how active the feed has been since.
export async function fetchPost(postId, myId) {
  const [{ data: row, error }, { data: bookmarks }] = await Promise.all([
    supabase.from('posts').select(POST_SELECT).eq('id', postId).maybeSingle(),
    supabase.from('bookmarks').select('post_id').eq('post_id', postId)
  ]);
  if (error || !row) return null;

  return mapPost(row, myId, new Set((bookmarks || []).map(bookmark => bookmark.post_id)));
}

export async function reshare(postId, userId, quoteText = null) {
  return supabase.from('reshares').insert({ post_id: postId, user_id: userId, quote_text: quoteText });
}

export async function undoReshare(postId, userId) {
  return supabase.from('reshares').delete().match({ post_id: postId, user_id: userId });
}

export async function createPost(text, imageUrl = null, videoUrl = null) {
  const { data, error } = await supabase
    .from('posts')
    .insert({ text: text || '', image_url: imageUrl, video_url: videoUrl, author_id: (await supabase.auth.getUser()).data.user.id })
    .select(`
      id, text, image_url, video_url, created_at,
      author:profiles!posts_author_id_fkey (id, username, full_name, parish, avatar_url, is_verified)
    `)
    .single();
  if (error) return { post: null, error };
  return { post: mapPost(data, null, new Set()), error: null };
}

export async function updatePost(postId, text) {
  return supabase.from('posts').update({ text }).eq('id', postId);
}

// The 2-pin cap is enforced server-side by a DB trigger (see migration
// 020) -- this can still fail if a race lets a client get past the local
// count check, so callers should expect it might reject.
export async function pinPost(postId, pinned) {
  return supabase.from('posts').update({ pinned_at: pinned ? new Date().toISOString() : null }).eq('id', postId);
}

// ------------------------------------------------------ bible highlights

// Returned as "bookId:chapter:verse" strings -- the same key format the
// reader already uses locally to check whether a given verse is highlighted.
export async function fetchBibleHighlights(userId) {
  const { data, error } = await supabase.from('bible_highlights').select('book_id, chapter, verse').eq('user_id', userId);
  if (error) return [];
  return data.map(h => `${h.book_id}:${h.chapter}:${h.verse}`);
}

export async function addBibleHighlight(userId, bookId, chapter, verse) {
  return supabase.from('bible_highlights').insert({ user_id: userId, book_id: bookId, chapter, verse });
}

export async function removeBibleHighlight(userId, bookId, chapter, verse) {
  return supabase.from('bible_highlights').delete().match({ user_id: userId, book_id: bookId, chapter, verse });
}

// ------------------------------------------------------- bible bookmarks

export async function fetchBibleBookmarks(userId) {
  const { data, error } = await supabase.from('bible_bookmarks').select('book_id, chapter, verse').eq('user_id', userId);
  if (error) return [];
  return data.map(b => `${b.book_id}:${b.chapter}:${b.verse}`);
}

export async function addBibleBookmark(userId, bookId, chapter, verse) {
  return supabase.from('bible_bookmarks').insert({ user_id: userId, book_id: bookId, chapter, verse });
}

export async function removeBibleBookmark(userId, bookId, chapter, verse) {
  return supabase.from('bible_bookmarks').delete().match({ user_id: userId, book_id: bookId, chapter, verse });
}

// -------------------------------------------------------------- mutes

export async function fetchMutes(myId) {
  const { data, error } = await supabase.from('mutes').select('muted_id').eq('muter_id', myId);
  if (error) return [];
  return data.map(m => m.muted_id);
}

export async function setMute(mutedId, userId, muted) {
  if (muted) {
    return supabase.from('mutes').insert({ muter_id: userId, muted_id: mutedId });
  }
  return supabase.from('mutes').delete().match({ muter_id: userId, muted_id: mutedId });
}

// Stored at <userId>/<timestamp>.<ext> — unlike avatars, a user can have many
// post images/videos, so each upload gets its own unique filename. Same
// bucket for both: its RLS policies (migration 004) are scoped by path, not
// file type.
export async function uploadPostMedia(userId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('post-images').upload(path, file, { cacheControl: IMMUTABLE_MEDIA_CACHE_SECONDS });
  if (error) return { url: null, error };
  const { data } = supabase.storage.from('post-images').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// --------------------------------------------------------- interactions

export async function deletePost(postId) {
  return supabase.from('posts').delete().eq('id', postId);
}

export async function setLike(postId, userId, liked) {
  if (liked) {
    return supabase.from('likes').insert({ post_id: postId, user_id: userId });
  }
  return supabase.from('likes').delete().match({ post_id: postId, user_id: userId });
}

// The likes table is publicly readable, so a post can show exactly who has
// liked it without exposing account email addresses or other private auth
// data. Shape the result the same way as the existing people-list screens.
export async function fetchPostLikers(postId, myId) {
  const [{ data, error }, { data: myFollows }] = await Promise.all([
    supabase
      .from('likes')
      .select('created_at, user:profiles!likes_user_id_fkey (id, username, full_name, parish, avatar_url, is_verified)')
      .eq('post_id', postId)
      .order('created_at', { ascending: false }),
    supabase.from('follows').select('followee_id').eq('follower_id', myId)
  ]);
  if (error) return [];

  const myFollowingIds = new Set((myFollows || []).map(f => f.followee_id));
  return (data || []).filter(row => row.user).map(row => ({
    id: row.user.id,
    name: displayName(row.user),
    username: row.user.username,
    avatar: avatarOf(row.user),
    parish: row.user.parish || '',
    isVerified: !!row.user.is_verified,
    isFollowing: myFollowingIds.has(row.user.id)
  }));
}

export async function setBookmark(postId, userId, bookmarked) {
  if (bookmarked) {
    return supabase.from('bookmarks').insert({ post_id: postId, user_id: userId });
  }
  return supabase.from('bookmarks').delete().match({ post_id: postId, user_id: userId });
}

export async function addComment(postId, userId, text, parentCommentId = null) {
  return supabase.from('comments').insert({ post_id: postId, user_id: userId, text, parent_comment_id: parentCommentId }).select('id').single();
}

export async function setCommentLike(commentId, userId, liked) {
  if (liked) {
    return supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
  }
  return supabase.from('comment_likes').delete().match({ comment_id: commentId, user_id: userId });
}

export async function setFollow(followeeId, followerId, following) {
  if (following) {
    return supabase.from('follows').insert({ follower_id: followerId, followee_id: followeeId });
  }
  return supabase.from('follows').delete().match({ follower_id: followerId, followee_id: followeeId });
}

// ------------------------------------------------------------ notifications
// Rows are created server-side by DB triggers (see supabase/migrations/002_*)
// whenever someone likes, comments on, or follows — never inserted by a
// client — so notifications can't be spoofed into another user's feed.

const truncate = (text, n = 60) => (text && text.length > n ? `${text.slice(0, n)}…` : text);

const NOTIF_TEXT = {
  like: (post) => `liked your post${post ? `: "${truncate(post)}"` : ''}`,
  comment: (post) => `commented on your post${post ? `: "${truncate(post)}"` : ''}`,
  follow: () => 'started following you',
  mention: (post) => `mentioned you${post ? `: "${truncate(post)}"` : ''}`,
  // Announcements have no fixed template -- the actual copy is stored per
  // row in `message` (see migration 023), not derived from an actor/post.
  announcement: (_post, message) => message || ''
};

export async function fetchNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      id, type, read, created_at, post_id, comment_id, message,
      actor:profiles!notifications_actor_id_fkey (username, full_name, avatar_url),
      post:posts (text)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];

  return data.map(n => ({
    id: n.id,
    type: n.type,
    user: n.type === 'announcement' ? 'Crescamus' : displayName(n.actor),
    actorUsername: n.actor?.username || null,
    postId: n.post_id || null,
    commentId: n.comment_id || null,
    text: NOTIF_TEXT[n.type](n.post?.text, n.message),
    time: timeAgo(n.created_at),
    unread: !n.read
  }));
}

export async function markAllNotificationsRead(userId) {
  return supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

// Fires `onChange` whenever a new notification arrives for this user, live.
export function subscribeToNotifications(userId, onChange) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`
    }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ------------------------------------------------------- direct messages
// There's no separate "conversations" table — a conversation is just every
// message between two people, grouped client-side by the other participant.

export async function fetchConversations(myId) {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      id, sender_id, recipient_id, text, image_path, read, created_at,
      sender:profiles!messages_sender_id_fkey (id, username, full_name, avatar_url),
      recipient:profiles!messages_recipient_id_fkey (id, username, full_name, avatar_url)
    `)
    .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
    .order('created_at', { ascending: false });
  if (error) return [];

  const byPartner = new Map();
  for (const m of data) {
    const iSent = m.sender_id === myId;
    const partner = iSent ? m.recipient : m.sender;
    if (!byPartner.has(partner.id)) {
      byPartner.set(partner.id, {
        userId: partner.id,
        name: displayName(partner),
        username: partner.username,
        avatar: avatarOf(partner),
        lastText: m.text || (m.image_path ? '📷 Photo' : ''),
        lastTime: timeAgo(m.created_at),
        lastAt: m.created_at,
        unreadCount: 0
      });
    }
    if (!iSent && !m.read) byPartner.get(partner.id).unreadCount++;
  }
  return [...byPartner.values()].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

export async function fetchMessages(myId, otherId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, text, image_path, created_at')
    .or(`and(sender_id.eq.${myId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${myId})`)
    .order('created_at', { ascending: true });
  if (error) return [];

  // Signed URLs expire, so they're minted fresh on every fetch rather than
  // stored — the bucket is private (migration 015), unlike post-images.
  const withImages = data.filter(m => m.image_path);
  const signedByPath = new Map();
  if (withImages.length > 0) {
    const { data: signed } = await supabase.storage
      .from('message-images')
      .createSignedUrls(withImages.map(m => m.image_path), 3600);
    (signed || []).forEach(s => { if (!s.error) signedByPath.set(s.path, s.signedUrl); });
  }

  return data.map(m => ({
    id: m.id,
    fromMe: m.sender_id === myId,
    text: m.text,
    image: m.image_path ? (signedByPath.get(m.image_path) || null) : null,
    time: timeAgo(m.created_at),
    createdAt: m.created_at
  }));
}

export async function sendMessage(senderId, recipientId, text, imagePath = null) {
  return supabase.from('messages').insert({ sender_id: senderId, recipient_id: recipientId, text: text || '', image_path: imagePath });
}

// Stored at <userId>/<timestamp>.<ext> in the private "message-images"
// bucket (migration 015) -- returns the storage path, not a public URL;
// resolve it to a signed URL for display (see fetchMessages).
export async function uploadMessageImage(userId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  // Left at the default hour on purpose -- see IMMUTABLE_MEDIA_CACHE_SECONDS
  // at the top of this file for why a longer cache doesn't apply here.
  const { error } = await supabase.storage.from('message-images').upload(path, file, { cacheControl: '3600' });
  if (error) return { path: null, error };
  return { path, error: null };
}

export async function markConversationRead(myId, otherId) {
  return supabase.from('messages').update({ read: true }).eq('recipient_id', myId).eq('sender_id', otherId).eq('read', false);
}

export async function fetchUnreadMessageCount(myId) {
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', myId)
    .eq('read', false);
  return count || 0;
}

// Fires `onChange` whenever a new message arrives for this user, live.
export function subscribeToMessages(userId, onChange) {
  const channel = supabase
    .channel(`messages:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${userId}`
    }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ------------------------------------------------------------- prayers
// A "streak day" is any calendar day with at least one prayer logged.
// Real history lives in prayer_logs; the streak/calendar are computed
// client-side from it rather than stored as a separate (driftable) number.

const toDateStr = (d) => d.toISOString().slice(0, 10);

export const PRAYER_KEYS = ['morning', 'angelus', 'rosary', 'mercy', 'evening'];

export async function fetchPrayerLogs(userId, days = 60) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('prayer_logs')
    .select('prayer_key, completed_on')
    .eq('user_id', userId)
    .gte('completed_on', toDateStr(since));
  if (error) return [];
  return data;
}

export async function setPrayerLog(userId, prayerKey, dateStr, completed) {
  if (completed) {
    return supabase.from('prayer_logs').upsert(
      { user_id: userId, prayer_key: prayerKey, completed_on: dateStr },
      { onConflict: 'user_id,prayer_key,completed_on' }
    );
  }
  return supabase.from('prayer_logs').delete().match({ user_id: userId, prayer_key: prayerKey, completed_on: dateStr });
}

// Consecutive days (walking back from today) with at least one completion.
// Today doesn't break the streak just because it isn't done yet — only a
// fully-empty PAST day does.
export function computeStreak(logs) {
  const datesWithActivity = new Set(logs.map(l => l.completed_on));
  const today = new Date();
  const cursor = new Date(today);
  if (!datesWithActivity.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (datesWithActivity.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Real last-7-days calendar (today included), each day's actual completion
// status — not a decorative "first N days of the week" placeholder.
export function computeWeekCalendar(logs) {
  const datesWithActivity = new Set(logs.map(l => l.completed_on));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      dateStr: toDateStr(d),
      completed: datesWithActivity.has(toDateStr(d)),
      isToday: i === 0
    });
  }
  return days;
}

export async function fetchPrayerIntentions(userId) {
  const { data, error } = await supabase
    .from('prayer_intentions')
    .select('id, text, completed')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

export async function addPrayerIntention(userId, text, reminderTime = null) {
  return supabase.from('prayer_intentions').insert({
    user_id: userId,
    text,
    reminder_time: reminderTime || null,
    reminder_enabled: !!reminderTime
  });
}

export async function setPrayerIntentionCompleted(id, completed) {
  return supabase.from('prayer_intentions').update({ completed }).eq('id', id);
}

export async function deletePrayerIntention(id) {
  return supabase.from('prayer_intentions').delete().eq('id', id);
}

export async function updateReminderTimes(userId, times) {
  return supabase.from('profiles').update({ reminder_times: times }).eq('id', userId);
}

export async function updateRemindersEnabled(userId, flags) {
  return supabase.from('profiles').update({ reminders_enabled: flags }).eq('id', userId);
}

// Sent once per device, whenever it changes -- the reminder-sending Edge
// Function has no device of its own to ask "what time is it for you", so it
// needs this to know when e.g. 6:00 AM actually is for a given user.
export async function updateMyTimezone(userId, timezone) {
  if (!timezone) return { error: null };
  return supabase.from('profiles').update({ timezone }).eq('id', userId);
}

// One row per device/browser that's granted push permission. onConflict on
// endpoint (not user+device) because the endpoint itself is what's unique --
// re-subscribing the same browser reliably returns the same endpoint.
export async function upsertPushSubscription(userId, subscription) {
  if (!subscription) return { error: null };
  return supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
    { onConflict: 'endpoint' }
  );
}

// ------------------------------------------------------------- settings

export async function requestPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}

export async function updateMyPassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

// Used for the in-app change-password form (as opposed to the emailed
// reset-link flow, which doesn't need this): re-checks the current
// password before allowing a new one, so a session left open on a shared
// device can't be used to silently lock the real owner out.
export async function changeMyPassword(email, currentPassword, newPassword) {
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) return { error: { message: 'Current password is incorrect.' } };
  return supabase.auth.updateUser({ password: newPassword });
}

// ---------------------------------------------------------- moderation

export async function fileReport({ reporterId, reportedUserId = null, reportedPostId = null, reason, details = '' }) {
  return supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reported_post_id: reportedPostId,
    reason,
    details: details || null
  });
}

// Every block relationship touching me, either direction — used to hide
// blocked users' content from my feed/search/inbox client-side, mirroring
// the DB-level enforcement on new messages.
export async function fetchBlocks(myId) {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${myId},blocked_id.eq.${myId}`);
  if (error) return [];
  return data;
}

export async function blockUser(blockerId, blockedId) {
  return supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
}

export async function unblockUser(blockerId, blockedId) {
  return supabase.from('blocks').delete().match({ blocker_id: blockerId, blocked_id: blockedId });
}

// Calls the delete-account Edge Function (see supabase/functions/delete-account)
// — deleting the auth.users row needs the service_role key, which can only
// ever live server-side, never in this client bundle.
export async function deleteMyAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: { message: 'Not signed in' } };
  const { data, error } = await supabase.functions.invoke('delete-account', {
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  if (error) return { error };
  if (data?.error) return { error: { message: data.error } };
  return { error: null };
}
