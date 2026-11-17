const mongoose = require('mongoose');

// 與 server.js 實際使用的彈性 Object schema 對齊，作為職缺欄位文件參考
const MarkerSchema = new mongoose.Schema({
  userId: { type: String, required: false },
  type: {
    type: String,
    required: true,
    enum: ['job', 'housing', 'custom']
  },
  address: String,
  lat: Number,
  lng: Number,
  memo: { type: String, default: '' },

  // 104 職缺詳情（job）
  jobInfo: {
    jobTitle: String,
    companyName: String,
    sourceUrl: String,
    description: String,      // 工作內容
    jobCategory: String,      // 職務類別
    salary: String,           // 工作待遇
    jobNature: String,        // 工作性質
    workLocation: String,     // 上班地點
    manageResp: String,       // 管理責任
    businessTrip: String,     // 出差外派
    workPeriod: String,       // 上班時段
    vacationPolicy: String,   // 休假制度
    startWorkingDay: String,  // 可上班日
    needEmp: String,          // 需求人數
    notes: String,            // 求職筆記
    skills: [String]
  },

  houseInfo: { type: Object, required: false },
  customInfo: { type: Object, required: false },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MarkerDoc', MarkerSchema);
