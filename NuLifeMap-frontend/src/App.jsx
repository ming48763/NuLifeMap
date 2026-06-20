import React, { useState, useEffect } from 'react';

// 🌟 1. 正確引入您拆分好的三個員工
import Sidebar from './components/Sidebar';
import MapArea from './components/MapArea';
import AddModal from './components/AddModal';

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [appMode, setAppMode] = useState('normal'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [focusedItem, setFocusedItem] = useState(null); 

  const fetchData = () => {
    setLoadingData(true);
    // 🌟 已修正：恢復為正確的純文字網址
    fetch('http://127.0.0.1:3000/api/markers')
      .then(res => res.json())
      .then(data => {
        const validData = data.filter(item => item.lat && item.lng);
        setJobs(validData);
        setLoadingData(false);
      })
      .catch(err => {
        console.error("無法取得資料:", err);
        setLoadingData(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'row', backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', textAlign: 'left', zIndex: 999 }}>
      
      {/* 🌟 2. 將狀態往下傳遞給元件執行 */}
      <Sidebar 
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
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        fetchData={fetchData} 
      />

    </div>
  );
}