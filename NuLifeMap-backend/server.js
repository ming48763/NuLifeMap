require('dotenv').config(); 
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); 
const { createScrapeRateLimiter } = require('./scrapeRateLimit');
const { normalizeAvatarData } = require('./avatarNormalize');

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// 爬蟲雙重限流：IP 每小時 10 次、帳號每小時 100 次（本機白名單無上限）
const scrapeRateLimit = createScrapeRateLimiter({
  windowMs: Number(process.env.SCRAPE_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
  ipMax: Number(process.env.SCRAPE_RATE_LIMIT_MAX) || 10,
  accountMax: Number(process.env.SCRAPE_RATE_LIMIT_ACCOUNT_MAX) || 100,
  whitelist: process.env.SCRAPE_RATE_LIMIT_WHITELIST || '',
});

// 🌟 1. 定義使用者白名單陣列
const USERS = [
  { account: 'mapper', password: process.env.USER_MAPPER_PASSWORD, name: '地圖大師', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mapper' },
  { account: 'jobLess01', password: process.env.USER_JOBLESS01_PASSWORD, name: '求職小菜鳥', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jobLess01' },
  { account: 'bigG', password: process.env.USER_BIGG_PASSWORD, name: '大G哥', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bigG' },
  { account: 'hiremeplz', password: process.env.USER_AZHI_PASSWORD || '123456789', name: '大學生阿志', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=hiremeplz' },
  { account: 'needmoneyplz', password: process.env.USER_NING_PASSWORD || '123456789', name: '美甲師小寧', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=needmoneyplz' },
  { account: 'joborhungryqq', password: process.env.USER_JIGE_PASSWORD || '123456789', name: '文藝青年雞哥', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=joborhungryqq' }
];

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NuLifeMapDB';
mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB_NAME || 'NuLifeMapDB' })
  .then(() => console.log('✅ 成功連線至 MongoDB'))
  .catch(err => console.error('❌ MongoDB 連線失敗:', err));

// 🌟 2. Schema 新增 userId 欄位以追蹤擁有者
const markerSchema = new mongoose.Schema({
  userId: { type: String, required: false }, // 誰建立的？
  type: { type: String, required: true }, // 'job', 'housing', 'custom'
  address: String,
  lat: Number,
  lng: Number,
  memo: String,
  jobInfo: { type: Object, required: false },
  houseInfo: { type: Object, required: false },
  customInfo: { type: Object, required: false },
  createdAt: { type: Date, default: Date.now }
});
const Marker = mongoose.model('Marker', markerSchema);

const userProfileSchema = new mongoose.Schema({
  account: { type: String, required: true, unique: true },
  name: { type: String },
  avatarData: { type: String }, // data URL / base64
  avatarOffset: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },
  darkMode: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});
const UserProfile = mongoose.model('UserProfile', userProfileSchema);

async function mergeUserProfile(baseUser) {
  if (!baseUser?.account) return baseUser;
  const profile = await UserProfile.findOne({ account: baseUser.account }).lean();
  if (!profile) {
    return { ...baseUser, darkMode: false, avatarData: null, avatarOffset: { x: 0, y: 0 } };
  }

  let avatarData = profile.avatarData || null;
  if (avatarData) {
    const normalized = await normalizeAvatarData(avatarData);
    if (normalized && normalized !== avatarData) {
      await UserProfile.updateOne(
        { account: baseUser.account },
        { $set: { avatarData: normalized, updatedAt: new Date() } }
      );
      avatarData = normalized;
      console.log(`[avatar] 已壓縮並回寫 ${baseUser.account}（${profile.avatarData.length} → ${normalized.length}）`);
    }
  }

  return {
    ...baseUser,
    name: profile.name || baseUser.name,
    avatar: avatarData || baseUser.avatar,
    avatarData,
    avatarOffset: profile.avatarOffset || { x: 0, y: 0 },
    darkMode: Boolean(profile.darkMode),
  };
}

// ==========================================
// API 路由區域
// ==========================================

// 🌟 新增：登入驗證 API
app.post('/api/login', async (req, res) => {
  const { account, password } = req.body;
  const user = USERS.find(u => u.account === account && u.password === password);
  
  if (user) {
    // 為了安全，回傳給前端時剔除密碼
    const { password: _pw, ...safeUser } = user;
    const merged = await mergeUserProfile(safeUser);
    res.json({ success: true, user: merged });
  } else {
    res.status(401).json({ success: false, error: '帳號或密碼錯誤' });
  }
});

// 取得使用者設定檔
app.get('/api/profile/:account', async (req, res) => {
  try {
    const base = USERS.find(u => u.account === req.params.account);
    if (!base) return res.status(404).json({ error: '找不到使用者' });
    const { password: _pw, ...safeUser } = base;
    const merged = await mergeUserProfile(safeUser);
    res.json({ success: true, user: merged });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 測試身分列表（一次回傳，讀取時會順便壓縮過大的頭貼）
app.get('/api/test-accounts', async (req, res) => {
  try {
    const testAccounts = ['hiremeplz', 'needmoneyplz', 'joborhungryqq'];
    const users = await Promise.all(
      testAccounts.map(async (account) => {
        const base = USERS.find((u) => u.account === account);
        if (!base) return null;
        const { password: _pw, ...safeUser } = base;
        const merged = await mergeUserProfile(safeUser);
        return {
          account: merged.account,
          name: merged.name,
          avatar: merged.avatarData || merged.avatar,
          avatarOffset: merged.avatarOffset || { x: 0, y: 0 },
        };
      })
    );
    res.json({ success: true, users: users.filter(Boolean) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新使用者名稱／大頭貼（含拖曳偏移）
app.patch('/api/profile/:account', async (req, res) => {
  try {
    const { account } = req.params;
    const base = USERS.find(u => u.account === account);
    if (!base) return res.status(404).json({ error: '找不到使用者' });

    const { name, avatarData, avatarOffset, darkMode } = req.body;
    const update = { updatedAt: new Date() };
    if (typeof name === 'string' && name.trim()) update.name = name.trim();
    if (typeof avatarData === 'string') {
      update.avatarData = await normalizeAvatarData(avatarData);
    }
    if (avatarOffset && typeof avatarOffset === 'object') {
      update.avatarOffset = {
        x: Number(avatarOffset.x) || 0,
        y: Number(avatarOffset.y) || 0,
      };
    }
    if (typeof darkMode === 'boolean') update.darkMode = darkMode;

    const profile = await UserProfile.findOneAndUpdate(
      { account },
      { $set: update, $setOnInsert: { account } },
      { upsert: true, returnDocument: 'after' }
    ).lean();

    const { password: _pw, ...safeUser } = base;
    const merged = {
      ...safeUser,
      name: profile.name || safeUser.name,
      avatar: profile.avatarData || safeUser.avatar,
      avatarData: profile.avatarData || null,
      avatarOffset: profile.avatarOffset || { x: 0, y: 0 },
      darkMode: Boolean(profile.darkMode),
    };
    res.json({ success: true, user: merged });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🌟 新增：一次性使用的資料庫「欄位排序」API (解決強迫症的完美排序)
app.get('/api/reorder-fields', async (req, res) => {
  try {
    // 拿取純資料物件
    const markers = await Marker.find({}).lean();
    let count = 0;
    
    for (let doc of markers) {
      // 1. 建立一個全新、順序完美的物件 (把 userId 排在最前面)
      const orderedDoc = {
        userId: doc.userId,
        type: doc.type,
        address: doc.address,
        lat: doc.lat,
        lng: doc.lng,
        memo: doc.memo
      };
      
      // 根據不同類型加入專屬資訊
      if (doc.houseInfo) orderedDoc.houseInfo = doc.houseInfo;
      if (doc.jobInfo) orderedDoc.jobInfo = doc.jobInfo;
      if (doc.customInfo) orderedDoc.customInfo = doc.customInfo;
      
      orderedDoc.createdAt = doc.createdAt;

      // 2. 將舊資料完全覆蓋為排序好的新資料 (MongoDB 會嚴格按照物件定義的順序寫入)
      await Marker.replaceOne({ _id: doc._id }, orderedDoc);
      count++;
    }
    
    res.json({
      success: true,
      message: `🎉 成功重新排列了 ${count} 筆資料的欄位順序！請重整 MongoDB Compass 查看。`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🌟 修改：獲取標記，根據 userId 過濾資料
app.get('/api/markers', async (req, res) => {
  try {
    const { userId } = req.query;
    let query = {};
    
    // 邏輯：mapper 繼承所有以前沒有 userId 的舊資料
    if (userId === 'mapper') {
      query = { $or: [{ userId: 'mapper' }, { userId: { $exists: false } }] };
    } else if (userId) {
      query = { userId: userId };
    }

    const markers = await Marker.find(query).sort({ createdAt: -1 });
    res.json(markers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🌟 新增：Python 爬蟲寫入資料專用 API
// Python 爬完資料後會打這個 POST 請求把資料寫入資料庫
app.post('/api/markers', async (req, res) => {
  try {
    const newMarker = new Marker(req.body);
    await newMarker.save();
    res.status(201).json({ success: true, marker: newMarker });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 查詢目前爬蟲額度（IP + 帳號；可用 ?userId=）
app.get('/api/scrape/rate-limit-status', (req, res) => {
  res.json(scrapeRateLimit.getStatusForRequest(req));
});

// 客戶端模擬頁（仿一般使用者打爬蟲）
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

// 🌟 修改：接收前端網址，轉發給 Python 爬蟲 (並帶上 userId)
app.post('/api/scrape', scrapeRateLimit, async (req, res) => {
  const { url, userId, memo } = req.body;
  if (!url) return res.status(400).json({ error: "請提供網址" });

  try {
    const clientInfo = req.scrapeClient
      ? `IP=${req.scrapeClient.ip}${req.scrapeClient.simulated ? '(模擬)' : ''}`
      : '';
    console.log(`轉發爬蟲請求: ${url} (使用者: ${userId}) ${clientInfo}`);
    
    // 判斷要呼叫 Python 的哪個爬蟲端點
    let endpoint = url.includes('591.com.tw') ? '/scrape/591' : '/scrape/url';
    
    //  以環境變數讀取爬蟲環境
    const scraperBaseUrl = process.env.SCRAPER_BASE_URL || 'http://127.0.0.1:8000';

    // 注意：把 userId 一併丟給 Python 處理
    // ✅ 這裡改用 ${scraperBaseUrl} 來取代寫死的 127.0.0.1
    const response = await axios.post(`${scraperBaseUrl}${endpoint}`, {
      url: url,
      user_id: userId || 'mapper',
      memo: memo || ''
    });
    
    res.json({ success: true, message: "爬蟲任務完成", data: response.data });
  } catch (error) {
    console.error("爬蟲請求失敗:", error.message);
    const detail = error.response?.data?.detail || error.response?.data?.error;
    res.status(error.response?.status || 500).json({
      error: detail || "爬蟲微服務發生錯誤或無法連線"
    });
  }
});

// 🌟 修改：新增自訂地點，寫入專屬 userId
app.post('/api/markers/custom', async (req, res) => {
  const { title, address, memo, userId } = req.body;
  if (!title || !address) return res.status(400).json({ error: "標題與地址為必填欄位" });

  try {
    const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: address, key: GOOGLE_API_KEY }
    });

    if (geoResponse.data.status !== 'OK') {
      throw new Error(`無法解析該地址 (${geoResponse.data.status})`);
    }

    const location = geoResponse.data.results[0].geometry.location;

    const newMarker = new Marker({
      userId: userId || 'mapper', // 沒傳就當 mapper
      type: 'custom',
      address: address,
      lat: location.lat,
      lng: location.lng,
      memo: memo || '',
      customInfo: { title: title }
    });

    await newMarker.save();
    res.json({ success: true, message: "自訂地點已成功新增", data: newMarker });
  } catch (error) {
    console.error("新增自訂地點失敗:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// 🌟 更新職缺求職筆記 / 標記備註
app.patch('/api/markers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, memo } = req.body;
    const marker = await Marker.findById(id);
    if (!marker) {
      return res.status(404).json({ error: '找不到該地點' });
    }

    if (typeof notes === 'string') {
      if (marker.type === 'housing') {
        if (!marker.houseInfo || typeof marker.houseInfo !== 'object') {
          marker.houseInfo = {};
        }
        marker.houseInfo.notes = notes;
        marker.markModified('houseInfo');
      } else {
        if (!marker.jobInfo || typeof marker.jobInfo !== 'object') {
          marker.jobInfo = {};
        }
        // Mixed/Object 欄位需標記修改，否則可能不寫入
        marker.jobInfo.notes = notes;
        marker.markModified('jobInfo');
      }
    }
    if (typeof memo === 'string') {
      marker.memo = memo;
    }

    await marker.save();
    res.json({ success: true, message: '已更新', marker });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 依使用者清空標記（種子／測試用）
app.delete('/api/markers/by-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await Marker.deleteMany({ userId });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🌟 新增：刪除特定地點 API
app.delete('/api/markers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Marker.findByIdAndDelete(id);
    res.json({ success: true, message: "地點已成功刪除" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Node.js 伺服器已啟動於 Port ${PORT}`));