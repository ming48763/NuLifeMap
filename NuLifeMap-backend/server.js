const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// 允許跨來源請求與解析 JSON
app.use(cors());
app.use(express.json());

// 1. 連線到本地端 MongoDB (資料庫名稱設為 NuLifeMapDB)
mongoose.connect('mongodb://127.0.0.1:27017/NuLifeMapDB')
  .then(() => console.log('✅ 成功連線至本地端 MongoDB (NuLifeMapDB)'))
  .catch(err => console.error('❌ MongoDB 連線失敗:', err));

// 2. 建立資料庫模型 (Schema) - 🌟 完美對齊 Python 傳過來的格式
const markerSchema = new mongoose.Schema({
  type: { type: String, required: true },
  address: { type: String, required: true },
  memo: { type: String },
  jobInfo: {
    jobTitle: String,
    companyName: String,
    sourceUrl: String,
    description: String, // 🌟 接住：清洗後的長篇工作內容
    skills: [String]     // 🌟 接住：字典萃取出的技術標籤陣列 (字串陣列)
  },
  createdAt: { type: Date, default: Date.now }
});

const Marker = mongoose.model('Marker', markerSchema);

// 3. API 路由：接收 Python 爬蟲傳來的資料並寫入 DB (POST)
app.post('/api/markers', async (req, res) => {
  try {
    // req.body 就是 Python 用 json=scraped_data 傳過來的那包資料
    const newMarker = new Marker(req.body);
    const savedMarker = await newMarker.save();
    
    console.log('🎉 成功寫入一筆新職缺:', savedMarker.jobInfo.jobTitle);
    res.status(201).json({ message: '資料庫寫入成功', data: savedMarker });
  } catch (error) {
    console.error('❌ 寫入資料庫時發生錯誤:', error);
    res.status(500).json({ message: '寫入失敗', error: error.message });
  }
});

// 4. API 路由：提供給前端地圖讀取所有標記用的 (GET)
app.get('/api/markers', async (req, res) => {
  try {
    // 依據建立時間反向排序 (最新的在最前面)
    const markers = await Marker.find().sort({ createdAt: -1 });
    res.status(200).json(markers);
  } catch (error) {
    res.status(500).json({ message: '讀取資料失敗', error: error.message });
  }
});

// 啟動伺服器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Node.js 主伺服器已啟動，正在監聽 http://127.0.0.1:${PORT}`);
});