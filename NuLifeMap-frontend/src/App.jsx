import React, { useState, useEffect } from 'react';

// 🌟 調用四個專業員工元件
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import MapArea from './components/MapArea';
import AddModal from './components/AddModal';

export default function App() {
  // ==========================================
  // 全域狀態 (State) - 由大老闆統一管理
  // ==========================================
  const [user, setUser] = useState(null); 
  const [jobs, setJobs] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [appMode, setAppMode] = useState('normal'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [focusedItem, setFocusedItem] = useState(null); 

  // ==========================================
  // 1. 登入與權限管理
  // ==========================================
  // 網頁重整時，檢查是否曾經登入過
  useEffect(() => {
    const storedUser = localStorage.getItem('nulifemap_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogout = () => {
    setUser(null);
    setJobs([]);
    localStorage.removeItem('nulifemap_user');
  };

  // ==========================================
  // 2. 資料抓取邏輯
  // ==========================================
  const fetchData = () => {
    if (!user) return; // 沒登入不抓資料
    
    setLoadingData(true);
    // 在 API 請求帶上 userId，讓後端只回傳屬於這個人的資料
    fetch(`http://127.0.0.1:3000/api/markers?userId=${user.account}`)
      .then(res => {
        if (!res.ok) throw new Error("伺服器回應錯誤");
        return res.json();
      })
      .then(data => {
        const validData = data.filter(item => item.lat && item.lng);
        setJobs(validData);
        setLoadingData(false);
      })
      .catch(err => {
        console.warn("無法取得後端資料，改用預設空陣列展示:", err);
        setJobs([]); 
        setLoadingData(false);
      });
  };

  // 當使用者狀態改變(登入成功)時，觸發抓取專屬資料
  useEffect(() => {
    fetchData();
  }, [user]);

  // ==========================================
  // 3. 組合與分配畫面
  // ==========================================
  
  // 攔截機制：如果沒登入，就只發派 Login 員工出場
  if (!user) {
    return <Login onLogin={(u) => { 
      setUser(u); 
      localStorage.setItem('nulifemap_user', JSON.stringify(u)); 
    }} />;
  }

  // 登入成功：大老闆發配工作給剩下的三位員工
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'row', backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', textAlign: 'left', zIndex: 999 }}>
      
      <Sidebar 
        user={user} 
        onLogout={handleLogout} 
        jobs={jobs}
        loadingData={loadingData}
        appMode={appMode}
        setAppMode={setAppMode}
        onOpenModal={() => setIsModalOpen(true)}
        onFocusItem={(item) => setFocusedItem(item)} 
      />
      
      <MapArea 
        jobs={jobs}
        appMode={appMode}
        setAppMode={setAppMode}
        focusedItem={focusedItem}
      />
      
      <AddModal 
        user={user} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        fetchData={fetchData} 
      />
      
    </div>
  );
}