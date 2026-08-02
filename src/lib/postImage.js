// Generates a branded, shareable image of a post entirely in the browser
// (no server, no libraries) and triggers a download -- the same approach as
// verseImage.js, but laid out to look like the actual feed card (avatar,
// name, text, attached photo) rather than a verse quote card, since that's
// what a "screenshot version" of a post should resemble.

const W = 1080;
const MARGIN = 56;
const PAD = 48;
const CONTENT_W = W - MARGIN * 2 - PAD * 2;

const NAVY = '#1E3A8A';
const INK = '#1B2330';
const INK_SECONDARY = '#6B7280';
const CREAM = '#FAFAF8';
const CARD_BG = '#FFFFFF';

// Posts are stored with the same lightweight markdown the composer writes
// (**bold**, *italic*, "> quote", "- item") -- rendered richly on-screen by
// textFormatting.jsx, but stripped down to plain text with those markers
// removed here, since laying out mixed bold/italic runs on a canvas isn't
// worth the complexity for a share image.
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^> /gm, '')
    .replace(/^- /gm, '• ');
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    if (para === '') { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const attempt = line ? `${line} ${word}` : word;
      if (ctx.measureText(attempt).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = attempt;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Resolves with null on failure instead of rejecting -- a broken avatar or
// post image shouldn't stop the whole share-image from being generated.
function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawAvatarCircle(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = NAVY;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

export async function downloadPostImage(post) {
  const [avatarImg, postImg] = await Promise.all([
    loadImage(post.user.avatar),
    loadImage(post.image)
  ]);

  const bodyText = stripMarkdown(post.text || '');

  // Measure on a throwaway context before sizing the real canvas, since a
  // canvas's height has to be known up front.
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '400 30px Inter, system-ui, sans-serif';
  const textLines = wrapText(measure, bodyText, CONTENT_W);
  const lineHeight = 42;

  const avatarR = 40;
  const headerH = 108;
  let imgDrawW = 0, imgDrawH = 0;
  if (postImg) {
    imgDrawW = CONTENT_W;
    imgDrawH = Math.min(imgDrawW * (postImg.height / postImg.width), 640);
  }

  const cardH = PAD * 2
    + headerH
    + textLines.length * lineHeight
    + (postImg ? imgDrawH + 28 : 0);
  const footerH = 150;
  const totalH = MARGIN * 2 + cardH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, totalH);

  ctx.save();
  ctx.shadowColor = 'rgba(27,35,48,0.12)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = CARD_BG;
  roundRectPath(ctx, MARGIN, MARGIN, W - MARGIN * 2, cardH, 28);
  ctx.fill();
  ctx.restore();

  const padX = MARGIN + PAD;
  let cy = MARGIN + PAD;

  drawAvatarCircle(ctx, avatarImg, padX + avatarR, cy + avatarR, avatarR);

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '700 32px Outfit, Poppins, system-ui, sans-serif';
  ctx.fillText(post.user.name, padX + avatarR * 2 + 22, cy + 36);
  ctx.fillStyle = INK_SECONDARY;
  ctx.font = '400 23px Inter, system-ui, sans-serif';
  const subLine = `@${post.user.username}${post.user.parish ? '  ·  ' + post.user.parish : ''}`;
  ctx.fillText(subLine, padX + avatarR * 2 + 22, cy + 70);

  cy += headerH;

  ctx.fillStyle = INK;
  ctx.font = '400 30px Inter, system-ui, sans-serif';
  for (const line of textLines) {
    cy += lineHeight;
    ctx.fillText(line, padX, cy - 12);
  }

  if (postImg) {
    cy += 28;
    roundRectPath(ctx, padX, cy, imgDrawW, imgDrawH, 16);
    ctx.save();
    ctx.clip();
    const scale = Math.max(imgDrawW / postImg.width, imgDrawH / postImg.height);
    const w = postImg.width * scale, h = postImg.height * scale;
    ctx.drawImage(postImg, padX + (imgDrawW - w) / 2, cy + (imgDrawH - h) / 2, w, h);
    ctx.restore();
  }

  // Branding footer, below the card
  const footerY = MARGIN + cardH + 78;
  ctx.textAlign = 'center';
  ctx.fillStyle = NAVY;
  ctx.font = '700 40px Outfit, Poppins, system-ui, sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText('CRESCAMUS', W / 2, footerY);
  ctx.letterSpacing = '1px';
  ctx.fillStyle = INK_SECONDARY;
  ctx.font = '400 24px Inter, system-ui, sans-serif';
  ctx.fillText('Growing Together in Christ', W / 2, footerY + 40);

  const safeName = (post.user.username || 'post').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crescamus-post-${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve();
    }, 'image/png');
  });
}
