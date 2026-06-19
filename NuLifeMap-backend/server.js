const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // 🌟 新增：用來呼叫 Google API 發送網路請求

const app = express();

// 允許跨來源請求與解析 JSON
app.use(cors());
app.use(express.json());

// ⚠️ 填入您的 Google Maps API Key
const GOOGLE_API_KEY = "AIzaSyA5lJqVxXnziPLn2ddXjd4WQRMsKBiWl0A";

// 1. 連線到本地端 MongoDB (資料庫名稱設為 NuLifeMapDB)
mongoose.connect('mongodb://127.0.0.1:27017/NuLifeMapDB')
  .then(() => console.log('✅ 成功連線至本地端 MongoDB (NuLifeMapDB)'))
  .catch(err => console.error('❌ MongoDB 連線失敗:', err));

// 2. 建立資料庫模型 (Schema) - 🌟 新增了 lat 與 lng 欄位來存放經緯度
const markerSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'job' 或 'housing'
  address: { type: String, required: true },
  memo: { type: String },
  lat: { type: Number },
  lng: { type: Number },
  jobInfo: {
    type: Object,
    required: false
  },
  houseInfo: {
    type: Object,
    required: false
  },
  createdAt: { type: Date, default: Date.now }
});

const Marker = mongoose.model('Marker', markerSchema);

// ... (getCoordinates 函式保持不變) ...

// 🌟 新增：輔助函式，使用 Google Geocoding API 將地址轉為座標
async function getCoordinates(address) {
    try {
        const response = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json`, {
            params: {
                address: address,
                key: GOOGLE_API_KEY
            }
        });
        if (response.data.results && response.data.results.length > 0) {
            return response.data.results[0].geometry.location; // 回傳 {lat, lng}
        }
    } catch (error) {
        console.error(`Geocoding API 請求失敗 (${address}):`, error.message);
    }
    return null;
}

// 3. API 路由：接收 Python 爬蟲傳來的資料並寫入 DB (POST)
app.post('/api/markers', async (req, res) => {
  try {
    const data = req.body;
    
    // 🌟 關鍵優化：根據 type 過濾掉不必要的屬性，保持資料庫乾淨
    const cleanData = {
        type: data.type,
        address: data.address,
        memo: data.memo,
        lat: data.lat,
        lng: data.lng
    };

    if (data.type === 'job') {
        cleanData.jobInfo = data.jobInfo;
    } else if (data.type === 'housing') {
        cleanData.houseInfo = data.houseInfo;
    }

    const newMarker = new Marker(cleanData);
    const savedMarker = await newMarker.save();
    
    console.log(`✅ 成功儲存類型為 ${data.type} 的資料`);
    res.status(201).json({ message: '資料庫寫入成功', data: savedMarker });
  } catch (error) {
    console.error('❌ 寫入資料庫時發生錯誤:', error);
    res.status(500).json({ message: '寫入失敗', error: error.message });
  }
});

// 4. API 路由：提供給前端地圖讀取所有標記用的 (GET) - 🌟 升級加入座標轉換邏輯
app.get('/api/markers', async (req, res) => {
  try {
    // 依據建立時間反向排序 (最新的在最前面)
    const markers = await Marker.find().sort({ createdAt: -1 });

    // 🌟 智慧處理層：檢查是否有經緯度，沒有就去 Google 查
    const processedMarkers = await Promise.all(markers.map(async (marker) => {
        // 如果資料庫裡已經有經緯度，直接回傳
        if (marker.lat && marker.lng) {
            return marker;
        }

        // 如果沒有經緯度，拿職缺的 address 去查
        let lat = 24.1552; // 預設值 (台中)
        let lng = 120.6768;
        // 有些職缺地址可能存在 marker.address 或 marker.jobInfo.address
        const addressToSearch = marker.address || (marker.jobInfo && marker.jobInfo.address);

        if (addressToSearch) {
            const coords = await getCoordinates(addressToSearch);
            if (coords) {
                lat = coords.lat;
                lng = coords.lng;
                
                // 🌟 查到座標後，更新回 MongoDB，下次讀取時瞬間完成！
                await Marker.updateOne(
                    { _id: marker._id },
                    { $set: { lat: lat, lng: lng } }
                );
                console.log(`📍 成功為「${marker.jobInfo.jobTitle}」補上座標並寫入資料庫`);
            } else {
                console.log(`⚠️ 找不到地址「${addressToSearch}」的座標，套用預設值。`);
            }
        }

        // 回傳補上座標的資料給前端
        return {
            ...marker.toObject(),
            lat: lat,
            lng: lng
        };
    }));

    res.status(200).json(processedMarkers);
  } catch (error) {
    console.error('❌ 讀取/轉換資料失敗:', error);
    res.status(500).json({ message: '讀取資料失敗', error: error.message });
  }
});

// 啟動伺服器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Node.js 主伺服器已啟動，正在監聽 http://127.0.0.1:${PORT}`);
});