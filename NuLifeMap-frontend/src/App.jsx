// 🌟 調用四個專業員工元件
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import MapArea from './components/MapArea';
import AddModal from './components/AddModal';
import React, { useState, useEffect } from 'react';

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

  // 🌟 新增：由 App 統一管理側邊欄的寬度與收合狀態
  const [sidebarWidth, setSidebarWidth] = useState(420); 
  const [isCollapsed, setIsCollapsed] = useState(false);

  // ==========================================
  // 1. 登入與權限管理
  // ==========================================
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
    if (!user) return; 
    
    setLoadingData(true);
    
    // 🌟 安全讀取環境變數
    let API_BASE = 'http://127.0.0.1:3000';
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
        API_BASE = import.meta.env.VITE_API_BASE_URL;
      }
    } catch (e) {
      console.warn("無法讀取環境變數，使用預設 API_BASE");
    }
    
    // 🌟 串接後端 API
    fetch(`${API_BASE}/api/markers?userId=${user.account}`)
      .then(res => {
        if (!res.ok) throw new Error("伺服器回應錯誤");
        return res.json();
      })
      .then(data => {
        console.log("🌟 後端回傳的原始資料:", data); 
        
        // 確保資料是陣列格式，避免 filter 報錯
        const actualData = Array.isArray(data) ? data : (data.data || data.markers || []);
        const validData = actualData.filter(item => item.lat && item.lng);
        
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
  
  if (!user) {
    return <Login onLogin={(u) => { 
      setUser(u); 
      localStorage.setItem('nulifemap_user', JSON.stringify(u)); 
    }} />;
  }

  // 🌟 前端刪除邏輯
  const handleDeleteItem = async (itemId) => {
    // 加上防呆確認，避免誤刪
    if (!window.confirm('確定要刪除這個地點嗎？')) return;
    
    try {
      const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';
      const response = await fetch(`${backendUrl}/api/markers/${itemId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // 成功後，直接從前端陣列中過濾掉該筆資料，畫面就會瞬間更新！
        setJobs(prev => prev.filter(job => job._id !== itemId));
        // 如果剛好聚焦在該地點，就重置模式
        setAppMode('normal');
      } else {
        alert('刪除失敗，請稍後再試');
      }
    } catch (error) {
      console.error('刪除時發生錯誤:', error);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'row', backgroundColor: '#ffffff', zIndex: 50, overflow: 'hidden', textAlign: 'left', fontFamily: 'sans-serif', '--sidebar-width': isCollapsed ? '80px' : `${sidebarWidth}px` }}>
      
      <Sidebar 
        user={user} 
        onLogout={handleLogout} 
        jobs={jobs}
        loadingData={loadingData}
        appMode={appMode}
        setAppMode={setAppMode}
        onOpenModal={() => setIsModalOpen(true)}
        onFocusItem={(item) => {
          setFocusedItem(item);
          setAppMode('normal'); 
        }}
        onDeleteItem={handleDeleteItem}
        // 🌟 將狀態與修改函式傳遞給 Sidebar
        sidebarWidth={sidebarWidth}
        setSidebarWidth={setSidebarWidth}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
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