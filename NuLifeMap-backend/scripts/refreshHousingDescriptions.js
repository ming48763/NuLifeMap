/**
 * 為既有租屋標記補上 Mai Home 物件說明（保留換行）。
 * 用法：node scripts/refreshHousingDescriptions.js
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

function parseRentFacts(html) {
  const facts = {};
  const re = /<dt>([\s\S]*?)<\/dt>\s*<dd([^>]*)>([\s\S]*?)<\/dd>/gi;
  let m;
  while ((m = re.exec(html))) {
    const key = String(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const val = String(m[3]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key) facts[key] = val;
  }
  return facts;
}

async function fetchHousing(url) {
  const res = await axios.get(url, {
    timeout: 30000,
    transformResponse: [(d) => d],
    headers: { 'User-Agent': 'NuLifeMapSeed/1.0', Accept: 'text/html' },
  });
  const html = String(res.data);
  const descMatch = html.match(/<p class="description">([\s\S]*?)<\/p>/i);
  const description = descMatch ? htmlToMultilineText(descMatch[1]) : '';
  const facts = parseRentFacts(html);
  return {
    description,
    cooking: facts['開伙'] || facts['可否開伙'] || undefined,
  };
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NuLifeMapDB';
  await mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB_NAME || 'NuLifeMapDB' });
  const Marker = mongoose.connection.collection('markers');

  const cursor = Marker.find({
    userId: { $in: ACCOUNTS },
    type: 'housing',
    'houseInfo.sourceUrl': { $regex: 'mai-job\\.hihimiles\\.com' },
  });

  let updated = 0;
  let failed = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const url = doc.houseInfo?.sourceUrl;
    if (!url) continue;
    try {
      const extra = await fetchHousing(url);
      if (!extra.description) {
        failed += 1;
        continue;
      }
      const nextHouse = {
        ...(doc.houseInfo || {}),
        description: extra.description,
        notes: doc.houseInfo?.notes || '',
      };
      if (extra.cooking) nextHouse.cooking = extra.cooking;
      await Marker.updateOne({ _id: doc._id }, { $set: { houseInfo: nextHouse } });
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
