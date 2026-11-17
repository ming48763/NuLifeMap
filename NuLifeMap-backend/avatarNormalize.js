const sharp = require('sharp');

const AVATAR_MAX_EDGE = 512;
const AVATAR_JPEG_QUALITY = 82;
/** 超過此長度的 data URL 視為需壓縮 */
const AVATAR_COMPRESS_THRESHOLD = 100_000;

/**
 * 壓縮大頭貼但保留長寬比（不強制裁成正方形），以利前端拖曳取景。
 */
async function normalizeAvatarData(avatarData) {
  if (typeof avatarData !== 'string' || !avatarData) return avatarData;
  if (!avatarData.startsWith('data:image/')) return avatarData;
  if (avatarData.length < AVATAR_COMPRESS_THRESHOLD) return avatarData;

  const match = avatarData.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
  if (!match) return avatarData;

  try {
    const input = Buffer.from(match[1], 'base64');
    const output = await sharp(input)
      .rotate()
      .resize({
        width: AVATAR_MAX_EDGE,
        height: AVATAR_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: AVATAR_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${output.toString('base64')}`;
  } catch (err) {
    console.warn('[avatarNormalize] 壓縮失敗，使用原圖:', err.message);
    return avatarData;
  }
}

module.exports = {
  normalizeAvatarData,
  AVATAR_COMPRESS_THRESHOLD,
};
