require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); 

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NuLifeMapDB')
  .then(() => console.log('✅ 成功連線至 MongoDB'))
  .catch(err => console.error('❌ MongoDB 連線失敗:', err));

// 🌟 擴充資料庫 Schema，加入 customInfo 以支援自訂地點
const markerSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'job', 'housing', 'custom'
  address: String,
  lat: Number,
  lng: Number,
  memo: String,
  jobInfo: { type: Object, required: false },
  houseInfo: { type: Object, required: false },
  customInfo: { type: Object, required: false }, // 新增這行！
  createdAt: { type: Date, default: Date.now }
});
const Marker = mongoose.model('Marker', markerSchema);

// === 原本的獲取所有標記 API ===
app.get('/api/markers', async (req, res) => {
  try {
    const markers = await Marker.find().sort({ createdAt: -1 });
    res.json(markers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/markers', async (req, res) => {
  try {
    console.log("📥 收到來自爬蟲的資料:", req.body.houseInfo?.title || req.body.jobInfo?.jobTitle);
    const newMarker = new Marker(req.body);
    await newMarker.save();
    res.status(201).json({ success: true, message: "資料已成功存入 MongoDB", data: newMarker });
  } catch (error) {
    console.error("❌ 儲存至資料庫失敗:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// 🌟 新增 API 1：接收前端網址，轉發給 Python 爬蟲
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "請提供網址" });

  try {
    console.log(`正在轉發爬蟲請求給 Python: ${url}`);
    // 呼叫您的 Python FastAPI 爬蟲端點 (預設 8000 port)
    // 💡 確保您的 Python 爬蟲有這個 POST /scrape 路由
    const response = await axios.post('http://127.0.0.1:8000/scrape', { url });
    res.json({ success: true, message: "爬蟲任務已完成並寫入資料庫", data: response.data });
  } catch (error) {
    console.error("爬蟲請求失敗:", error.message);
    res.status(500).json({ error: "爬蟲微服務發生錯誤或無法連線" });
  }
});

// 🌟 新增 API 2：新增自訂地點 (自動透過 Google API 將地址轉為經緯度)
app.post('/api/markers/custom', async (req, res) => {
  const { title, address, memo } = req.body;
  if (!title || !address) return res.status(400).json({ error: "標題與地址為必填欄位" });

  try {
    // 呼叫 Google Geocoding API 將地址轉換為經緯度
    const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: address, key: GOOGLE_API_KEY }
    });

    if (geoResponse.data.status !== 'OK') {
      throw new Error(`無法解析該地址 (${geoResponse.data.status})`);
    }

    const location = geoResponse.data.results[0].geometry.location;

    // 將資料存入 MongoDB
    const newMarker = new Marker({
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Node.js 伺服器已啟動於 Port ${PORT}`));