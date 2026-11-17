/**
 * 依 sourceUrl 重抓 Mai Job 職缺說明，保留換行並寫回既有標記。
 * 用法：node scripts/refreshJobDescriptions.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const mongoose = require('mongoose');

const ACCOUNTS = ['hiremeplz', 'needmoneyplz', 'joborhungryqq'];

function htmlToMultilineText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchDescription(url) {
  const res = await axios.get(url, {
    timeout: 30000,
    transformResponse: [(d) => d],
    headers: { 'User-Agent': 'NuLifeMapSeed/1.0', Accept: 'text/html' },
  });
  const html = String(res.data);
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!ldMatch) return null;
  const data = JSON.parse(ldMatch[1]);
  return htmlToMultilineText(data.description || '');
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NuLifeMapDB';
  await mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB_NAME || 'NuLifeMapDB' });
  const Marker = mongoose.connection.collection('markers');

  const cursor = Marker.find({
    userId: { $in: ACCOUNTS },
    type: 'job',
    'jobInfo.sourceUrl': { $regex: 'mai-job\\.hihimiles\\.com' },
  });

  let updated = 0;
  let failed = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const url = doc.jobInfo?.sourceUrl;
    if (!url) continue;
    try {
      const description = await fetchDescription(url);
      if (!description) {
        failed += 1;
        continue;
      }
      await Marker.updateOne(
        { _id: doc._id },
        { $set: { 'jobInfo.description': description } }
      );
      updated += 1;
      process.stdout.write(`\r已更新 ${updated} 筆…`);
    } catch (err) {
      failed += 1;
      console.warn(`\n失敗 ${url}: ${err.message}`);
    }
  }

  console.log(`\n完成：更新 ${updated}，失敗 ${failed}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
