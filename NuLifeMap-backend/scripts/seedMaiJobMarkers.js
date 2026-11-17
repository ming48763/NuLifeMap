/**
 * 依測試身分洗掉舊標記，再從 Mai Job / Mai Home 依地區與職業重灌。
 * - hiremeplz（大學生）：台北 + 餐飲／計時
 * - needmoneyplz（美甲師）：台中 + 美甲
 * - joborhungryqq（文青）：高雄 + 美術設計
 *
 * 用法：node scripts/seedMaiJobMarkers.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const BACKEND = process.env.SEED_BACKEND_URL || 'http://127.0.0.1:3000';
const MAI = 'https://mai-job.hihimiles.com';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const ACCOUNTS = [
  {
    account: 'hiremeplz',
    label: '大學生阿志',
    city: '台北市',
    jobCategories: ['餐飲', '計時人員'],
    jobCount: 14,
    housingCount: 12,
  },
  {
    account: 'needmoneyplz',
    label: '美甲師小寧',
    city: '台中市',
    jobCategories: ['美甲'],
    jobCount: 16,
    housingCount: 13,
  },
  {
    account: 'joborhungryqq',
    label: '文藝青年雞哥',
    city: '高雄市',
    jobCategories: ['美術設計'],
    jobCount: 15,
    housingCount: 18,
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const res = await axios.get(url, {
    timeout: 30000,
    transformResponse: [(d) => d],
    headers: { 'User-Agent': 'NuLifeMapSeed/1.0', Accept: 'text/html' },
  });
  return String(res.data);
}

function stripTags(html) {
  // 單行欄位用：去掉標籤並壓成單行
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 職缺說明用：保留換行 */
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

function parseListCards(html, kind) {
  // kind: job | rent
  const hrefRe =
    kind === 'job'
      ? /href="\/job\/(demo\d+)"([^>]*)>/gi
      : /href="\/home\/(rent\d+)"([^>]*)>/gi;
  const items = [];
  let m;
  while ((m = hrefRe.exec(html))) {
    const id = m[1];
    const attrs = m[2] || '';
    const category = (attrs.match(/data-category="([^"]*)"/) || [])[1] || '';
    const city = (attrs.match(/data-city="([^"]*)"/) || [])[1] || '';
    items.push({ id, category, city });
  }
  // unique by id
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
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

function parseJobPage(html, url) {
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!ldMatch) return null;
  let data;
  try {
    data = JSON.parse(ldMatch[1]);
  } catch {
    return null;
  }

  const facts = parseFacts(html);
  const addr = data.jobLocation?.address || {};
  const addressFromLd = [addr.addressRegion, addr.addressLocality, addr.streetAddress].filter(Boolean).join('') || '';
  const address = pickFact(facts, ['上班地點'], addressFromLd || '台灣');
  const geo = data.jobLocation?.geo || {};
  const salary = data.baseSalary?.value || {};
  const unit = salary.unitText === 'HOUR' ? '時薪' : '月薪';
  const salaryFromLd =
    salary.minValue != null && salary.maxValue != null
      ? `${unit} ${salary.minValue} ~ ${salary.maxValue} TWD`
      : '';
  const salaryText = pickFact(facts, ['薪資待遇', '工作待遇'], salaryFromLd || '面議或未提供');
  const jobNatureFromLd =
    data.employmentType === 'PART_TIME' ? '兼職' : data.employmentType === 'FULL_TIME' ? '全職' : '';

  return {
    type: 'job',
    address,
    lat: Number(geo.latitude) || null,
    lng: Number(geo.longitude) || null,
    memo: `薪資：${salaryText}`,
    jobInfo: {
      jobTitle: data.title || '職缺',
      companyName: data.hiringOrganization?.name || '未提供',
      sourceUrl: url,
      description: htmlToMultilineText(data.description || ''),
      jobCategory: pickFact(facts, ['職務類別']),
      salary: salaryText,
      jobNature: pickFact(facts, ['工作性質'], jobNatureFromLd || '未提供'),
      workLocation: address,
      manageResp: pickFact(facts, ['管理責任']),
      businessTrip: pickFact(facts, ['出差外派', '出差']),
      workPeriod: pickFact(facts, ['上班時段', '上班']),
      vacationPolicy: pickFact(facts, ['休假制度', '休假']),
      startWorkingDay: pickFact(facts, ['可上班日']),
      needEmp: pickFact(facts, ['需求人數']),
      notes: '',
      skills: [],
    },
  };
}

function parseRentFacts(html) {
  return parseFacts(html);
}

function parseRentPage(html, url) {
  const h1 = stripTags((html.match(/<h1>([\s\S]*?)<\/h1>/i) || [])[1] || '租屋');
  const landlord = stripTags((html.match(/<p class="company">([\s\S]*?)<\/p>/i) || [])[1] || '屋主');
  const facts = parseRentFacts(html);
  const addressRaw = facts['地址'] || facts['位置'] || '台灣';
  const address = addressRaw.replace(/\s*距[\s\S]*$/, '').trim() || addressRaw;
  const priceRaw = facts['租金'] || '未知租金';
  const area = facts['坪數'] || '未提供';
  const floor = facts['樓層'] || '未提供';
  const management = facts['管理費'] || '';
  const price =
    management && !/無|免/.test(management)
      ? `月租 ${priceRaw}${/元/.test(priceRaw) ? '' : ' 元'}（管理費 ${management}）`
      : /元/.test(priceRaw)
        ? `月租 ${priceRaw}`
        : `月租 ${priceRaw} 元/月`;
  const isAgent = /仲介|代理人|經紀/.test(`${landlord} ${facts['聯絡人'] || ''}`)
    ? '是 (仲介/代理)'
    : '否 (屋主自租)';

  let lat = null;
  let lng = null;
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const data = JSON.parse(ldMatch[1]);
      const geo = data.geo || {};
      if (geo.latitude) lat = Number(geo.latitude);
      if (geo.longitude) lng = Number(geo.longitude);
    } catch {
      /* ignore */
    }
  }

  const descMatch = html.match(/<p class="description">([\s\S]*?)<\/p>/i);
  const description = descMatch ? htmlToMultilineText(descMatch[1]) : '';

  return {
    type: 'housing',
    address,
    lat,
    lng,
    memo: `租金：${price} | ${area} | ${floor}`,
    houseInfo: {
      title: h1,
      price,
      area,
      floor,
      cooking: facts['開伙'] || facts['可否開伙'] || '未提供',
      contact: facts['聯絡人'] || landlord,
      is_agent: isAgent,
      description,
      sourceUrl: url,
      notes: '',
    },
  };
}

async function geocode(address) {
  if (!GOOGLE_API_KEY || !address) return { lat: null, lng: null };
  try {
    const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: GOOGLE_API_KEY },
      timeout: 15000,
    });
    const loc = res.data?.results?.[0]?.geometry?.location;
    if (!loc) return { lat: null, lng: null };
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return { lat: null, lng: null };
  }
}

async function ensureCoords(item) {
  if (item.lat && item.lng) return item;
  const geo = await geocode(item.address);
  return { ...item, lat: geo.lat, lng: geo.lng };
}

async function postMarker(userId, payload) {
  await axios.post(`${BACKEND}/api/markers`, { ...payload, userId }, { timeout: 20000 });
}

async function clearUser(userId) {
  const res = await axios.delete(`${BACKEND}/api/markers/by-user/${encodeURIComponent(userId)}`);
  return res.data?.deletedCount || 0;
}

async function loadPool(cards, kind, needed) {
  const pool = [];
  for (let i = 0; i < cards.length && pool.length < needed; i++) {
    const card = cards[i];
    const url = kind === 'job' ? `${MAI}/job/${card.id}` : `${MAI}/home/${card.id}`;
    process.stdout.write(`\r  抓${kind === 'job' ? '職缺' : '租屋'} ${pool.length + 1}/${needed} (${card.id})   `);
    try {
      const html = await fetchText(url);
      let item = kind === 'job' ? parseJobPage(html, url) : parseRentPage(html, url);
      if (!item) continue;
      if (kind === 'job' && item.jobInfo) {
        // 頁面職務類別優先；缺值時才用列表卡 category 補
        if (!item.jobInfo.jobCategory || item.jobInfo.jobCategory === '未提供') {
          item.jobInfo.jobCategory = card.category || item.jobInfo.jobCategory;
        }
      }
      item = await ensureCoords(item);
      if (!item.lat || !item.lng) continue;
      pool.push(item);
    } catch (err) {
      console.warn(`\n  ${card.id} 失敗: ${err.message}`);
    }
    await sleep(60);
  }
  process.stdout.write('\n');
  return pool;
}

async function main() {
  console.log('讀取 Mai Job / Mai Home 列表…');
  const jobCards = parseListCards(await fetchText(`${MAI}/`), 'job');
  const rentCards = parseListCards(await fetchText(`${MAI}/home`), 'rent');
  console.log(`列表職缺 ${jobCards.length}、租屋 ${rentCards.length}`);

  for (const cfg of ACCOUNTS) {
    console.log(`\n=== ${cfg.label} (@${cfg.account})｜${cfg.city}｜${cfg.jobCategories.join('、')} ===`);
    const deleted = await clearUser(cfg.account);
    console.log(`  已清除舊標記 ${deleted} 筆`);

    const jobCandidates = jobCards.filter(
      (c) => c.city === cfg.city && cfg.jobCategories.includes(c.category)
    );
    const rentCandidates = rentCards.filter((c) => c.city === cfg.city);
    console.log(`  候選職缺 ${jobCandidates.length}、租屋 ${rentCandidates.length}`);

    const jobs = await loadPool(jobCandidates, 'job', cfg.jobCount);
    const housings = await loadPool(rentCandidates, 'rent', cfg.housingCount);

    let ok = 0;
    for (const item of [...jobs, ...housings]) {
      try {
        await postMarker(cfg.account, item);
        ok += 1;
      } catch (err) {
        console.warn(`  寫入失敗: ${err.message}`);
      }
      await sleep(20);
    }
    console.log(`  寫入完成 ${ok}（職缺 ${jobs.length}、租屋 ${housings.length}）`);
  }

  console.log('\n驗證：');
  for (const cfg of ACCOUNTS) {
    const res = await axios.get(`${BACKEND}/api/markers`, { params: { userId: cfg.account } });
    const markers = res.data || [];
    const jobs = markers.filter((m) => m.type === 'job').length;
    const housing = markers.filter((m) => m.type === 'housing').length;
    console.log(`${cfg.account}: total=${markers.length} job=${jobs} housing=${housing}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
