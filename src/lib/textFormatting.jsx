// Lightweight, safe post formatting: a small markdown-like syntax stored as
// plain text (**bold**, *italic*, "> quote", "- list item"), parsed into
// React elements at render time. Deliberately not HTML/contentEditable —
// storing and rendering real HTML from user input is an XSS risk; this
// approach never touches dangerouslySetInnerHTML, so there's nothing to
// sanitize in the first place.

// Splits a plain string on @username tokens, turning each into a clickable
// span (or leaving it as plain "@text" if no click handler was given, e.g.
// in a preview that isn't wired to navigation).
// The boundary group requires @ to not be glued to a preceding letter/digit
// -- without it, "a@b.com" or "hello@jo" would wrongly read as a mention of
// "b.com"/"jo" instead of being left alone as an email/word.
function splitMentions(text, keyPrefix, onMentionClick) {
  const regex = /(^|[^a-zA-Z0-9])@([a-z0-9._]{3,20})/gi;
  const out = [];
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    if (match[1]) out.push(match[1]);
    const username = match[2].toLowerCase();
    out.push(
      <span
        key={`${keyPrefix}-m-${i++}`}
        className="mention-link"
        onClick={onMentionClick ? (e) => { e.stopPropagation(); onMentionClick(username); } : undefined}
      >
        @{match[2]}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

// Three alternatives, ordered longest-marker-first so ***both*** is taken as
// bold+italic rather than as **bold** plus a stray asterisk -- which is what
// the composer's two toolbar buttons produce when both are applied to the
// same selection, and why they appeared not to work together at all.
//
// The italic branch can't just be \*(.+?)\*: lazily, that closes on the
// first asterisk of a following **bold**, splitting one italic run into
// three. So its body accepts either a non-asterisk or a doubled asterisk,
// and its closing marker must not itself be the start of a doubled one.
// (The two body alternatives are mutually exclusive on the next character,
// so there's no ambiguity for the engine to backtrack over.)
const INLINE_RE = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*((?:[^*]|\*\*)+?)\*(?!\*)/g;

// Recurses into whatever each marker wrapped, so nesting works in both
// directions and so @mentions inside bold/italic still become links -- the
// leaf strings are the only place splitMentions runs. Each recursive call
// gets a strictly shorter string (at least two markers are stripped), so
// this always terminates.
function parseInline(text, keyPrefix, onMentionClick, depth = 0) {
  const parts = [];
  const regex = new RegExp(INLINE_RE.source, 'g');
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-d${depth}-${i++}`;
    const inner = (body) => parseInline(body, key, onMentionClick, depth + 1);
    if (match[1] !== undefined) {
      parts.push(<strong key={key}><em>{inner(match[1])}</em></strong>);
    } else if (match[2] !== undefined) {
      parts.push(<strong key={key}>{inner(match[2])}</strong>);
    } else {
      parts.push(<em key={key}>{inner(match[3])}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts.flatMap((part, idx) =>
    typeof part === 'string' ? splitMentions(part, `${keyPrefix}-d${depth}-${idx}`, onMentionClick) : part
  );
}

// onMentionClick(username), if given, is called when a rendered @mention is
// tapped -- lets the caller navigate to that person's profile without this
// module needing to know anything about app navigation.
export function renderFormattedText(text, onMentionClick) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let listBuffer = [];

  const flushList = (key) => {
    if (listBuffer.length) {
      blocks.push(<ul key={`ul-${key}`} className="post-bullet-list">{listBuffer}</ul>);
      listBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    if (line.startsWith('> ')) {
      flushList(idx);
      blocks.push(<blockquote key={`q-${idx}`} className="post-blockquote">{parseInline(line.slice(2), `q${idx}`, onMentionClick)}</blockquote>);
    } else if (line.startsWith('- ')) {
      listBuffer.push(<li key={`li-${idx}`}>{parseInline(line.slice(2), `li${idx}`, onMentionClick)}</li>);
    } else {
      flushList(idx);
      blocks.push(<span key={`ln-${idx}`}>{line ? parseInline(line, `ln${idx}`, onMentionClick) : ' '}{idx < lines.length - 1 && <br />}</span>);
    }
  });
  flushList('end');
  return blocks;
}

// Wraps the current textarea selection with marker strings (or inserts an
// empty pair and places the cursor between them if nothing is selected) —
// the same interaction pattern as GitHub's markdown editor toolbar.
export function wrapSelection(textarea, value, setValue, before, after = before) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
  setValue(newValue);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursorStart = start + before.length;
    textarea.setSelectionRange(cursorStart, cursorStart + selected.length);
  });
}

// Prefixes every line touched by the current selection with the given
// marker (e.g. "> " or "- "), toggling it off if already present.
export function prefixLines(textarea, value, setValue, prefix) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd);
  const alreadyPrefixed = block.split('\n').every(l => l === '' || l.startsWith(prefix));
  const newBlock = block
    .split('\n')
    .map(l => (alreadyPrefixed ? l.slice(prefix.length) : l === '' ? l : prefix + l))
    .join('\n');

  const newValue = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
  setValue(newValue);
  requestAnimationFrame(() => textarea.focus());
}

// Inserts text at the current cursor position (or replaces the selection),
// then places the cursor right after it — used for emoji insertion.
export function insertAtCursor(textarea, value, setValue, text) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const newValue = value.slice(0, start) + text + value.slice(end);
  setValue(newValue);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + text.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}
