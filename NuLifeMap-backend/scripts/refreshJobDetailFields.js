/**
 * 依 sourceUrl 重抓 Mai Job 職缺明細欄位（職務類別／管理／出差／時段等）寫回既有標記。
 * 用法：node scripts/refreshJobDetailFields.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const mongoose = require('mongoose');

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFacts(html) {
  const facts = {};
  const re = /<dt>([\s\S]*?)<\/dt>\s*<dd([^>]*)>([\s\S]*?)<\/dd>/gi;
  let m;
  while ((m = re.exec(html))) {
    facts[stripTags(m[1])] = stripTags(m[3]);
  }
  return facts;
}

function pickFact(facts, keys, fallback = '未提供') {
  for (const key of keys) {
    const value = facts[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function extractFields(html) {
  const facts = parseFacts(html);
  let jobNatureFromLd = '';
  let salaryFromLd = '';
  let addressFromLd = '';
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const data = JSON.parse(ldMatch[1]);
      if (data.employmentType === 'PART_TIME') jobNatureFromLd = '兼職';
      if (data.employmentType === 'FULL_TIME') jobNatureFromLd = '全職';
      const salary = data.baseSalary?.value || {};
      const unit = salary.unitText === 'HOUR' ? '時薪' : '月薪';
      if (salary.minValue != null && salary.maxValue != null) {
        salaryFromLd = `${unit} ${salary.minValue} ~ ${salary.maxValue} TWD`;
      }
      const addr = data.jobLocation?.address || {};
      addressFromLd = [addr.addressRegion, addr.addressLocality, addr.streetAddress].filter(Boolean).join('');
    } catch {
      /* ignore */
    }
  }

  const workLocation = pickFact(facts, ['上班地點'], addressFromLd || '未提供');
  const salary = pickFact(facts, ['薪資待遇', '工作待遇'], salaryFromLd || '未提供');
  return {
    jobCategory: pickFact(facts, ['職務類別']),
    salary,
    jobNature: pickFact(facts, ['工作性質'], jobNatureFromLd || '未提供'),
    workLocation,
    manageResp: pickFact(facts, ['管理責任']),
    businessTrip: pickFact(facts, ['出差外派', '出差']),
    workPeriod: pickFact(facts, ['上班時段', '上班']),
    vacationPolicy: pickFact(facts, ['休假制度', '休假']),
    startWorkingDay: pickFact(facts, ['可上班日']),
    needEmp: pickFact(facts, ['需求人數']),
    address: workLocation,
    memo: `薪資：${salary}`,
  };
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NuLifeMapDB';
  await mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB_NAME || 'NuLifeMapDB' });
  const Marker = mongoose.connection.collection('markers');

  const cursor = Marker.find({
    type: 'job',
    'jobInfo.sourceUrl': { $regex: 'mai-job\\.hihimiles\\.com' },
  });

  let updated = 0;
  let failed = 0;
  let sample = null;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const url = doc.jobInfo?.sourceUrl;
    if (!url) continue;
    try {
      const res = await axios.get(url, {
        timeout: 30000,
        transformResponse: [(d) => d],
        headers: { 'User-Agent': 'NuLifeMapSeed/1.0', Accept: 'text/html' },
      });
      const fields = extractFields(String(res.data));
      await Marker.updateOne(
        { _id: doc._id },
        {
          $set: {
            address: fields.address,
            memo: fields.memo,
            'jobInfo.jobCategory': fields.jobCategory,
            'jobInfo.salary': fields.salary,
            'jobInfo.jobNature': fields.jobNature,
            'jobInfo.workLocation': fields.workLocation,
            'jobInfo.manageResp': fields.manageResp,
            'jobInfo.businessTrip': fields.businessTrip,
            'jobInfo.workPeriod': fields.workPeriod,
            'jobInfo.vacationPolicy': fields.vacationPolicy,
            'jobInfo.startWorkingDay': fields.startWorkingDay,
            'jobInfo.needEmp': fields.needEmp,
          },
        }
      );
      updated += 1;
      if (!sample) {
        sample = {
          userId: doc.userId,
          title: doc.jobInfo?.jobTitle,
          ...fields,
        };
      }
      process.stdout.write(`\r已更新 ${updated} 筆…`);
    } catch (err) {
      failed += 1;
      console.warn(`\n失敗 ${url}: ${err.message}`);
    }
  }

  const stillMissing = await Marker.countDocuments({
    type: 'job',
    'jobInfo.sourceUrl': { $regex: 'mai-job\\.hihimiles\\.com' },
    $or: [
      { 'jobInfo.manageResp': '未提供' },
      { 'jobInfo.businessTrip': '未提供' },
      { 'jobInfo.workPeriod': '未提供' },
      { 'jobInfo.vacationPolicy': '未提供' },
      { 'jobInfo.startWorkingDay': '未提供' },
      { 'jobInfo.needEmp': '未提供' },
      { 'jobInfo.jobCategory': '未提供' },
    ],
  });

  console.log(`\n完成：更新 ${updated}，失敗 ${failed}，仍缺明細 ${stillMissing}`);
  if (sample) console.log('sample', JSON.stringify(sample, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
