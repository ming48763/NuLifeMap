// 🌟 調用四個專業員工元件
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import MapArea from './components/MapArea';
import AddModal from './components/AddModal';
import JobDetailModal from './components/JobDetailModal';
import SettingsModal from './components/SettingsModal';
import React, { useState, useEffect } from 'react';
import { applyDocumentTheme, darkTheme, lightTheme } from './theme';

export default function App() {
  // ==========================================
  // 全域狀態 (State) - 由大老闆統一管理
  // ==========================================
  const [user, setUser] = useState(null); 
  const [jobs, setJobs] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [appMode, setAppMode] = useState('normal'); 
  const [radiusCenter, setRadiusCenter] = useState(null);
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [focusedItem, setFocusedItem] = useState(null); 
  const [detailJob, setDetailJob] = useState(null);
  const [addFailOpen, setAddFailOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // 🌟 新增：由 App 統一管理側邊欄的寬度與收合狀態
  const [sidebarWidth, setSidebarWidth] = useState(420); 
  const [isCollapsed, setIsCollapsed] = useState(false);
  const theme = darkMode ? darkTheme : lightTheme;
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';

  const persistUser = (nextUser) => {
    setUser(nextUser);
    if (typeof nextUser?.darkMode === 'boolean') {
      setDarkMode(nextUser.darkMode);
    }
    localStorage.setItem('nulifemap_user', JSON.stringify(nextUser));
  };

  // ==========================================
  // 1. 登入與權限管理
  // ==========================================
  useEffect(() => {
    applyDocumentTheme(darkMode);
  }, [darkMode]);

  useEffect(() => {
    const storedUser = localStorage.getItem('nulifemap_user');
    if (!storedUser) return;
    const parsed = JSON.parse(storedUser);
    setUser(parsed);
    if (typeof parsed.darkMode === 'boolean') setDarkMode(parsed.darkMode);
    // 重新向後端同步名稱／大頭貼／深色模式
    fetch(`${API_BASE}/api/profile/${encodeURIComponent(parsed.account)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) persistUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleToggleDarkMode = async () => {
    if (!user?.account) {
      setDarkMode((v) => !v);
      return;
    }
    const next = !darkMode;
    setDarkMode(next);
    try {
      const res = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(user.account)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ darkMode: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        persistUser(data.user);
      }
    } catch {
      // 保持本地切換結果
    }
  };

  const handleLogout = () => {
    setUser(null);
    setJobs([]);
    setSettingsOpen(false);
    setDarkMode(false);
    localStorage.removeItem('nulifemap_user');
  };

  // ==========================================
  // 2. 資料抓取邏輯
  // ==========================================
  const fetchData = () => {
    if (!user) return Promise.resolve([]); 
    
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
    return fetch(`${API_BASE}/api/markers?userId=${user.account}`)
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
        return validData;
      })
      .catch(err => {
        console.warn("無法取得後端資料，改用預設空陣列展示:", err);
        setJobs([]); 
        setLoadingData(false);
        return [];
      });
  };

  const focusAddedMarker = (marker, list) => {
    if (!marker) return;
    const byId = marker._id
      ? list.find((item) => String(item._id) === String(marker._id))
      : null;
    const byCoord = list.find((item) => (
      Math.abs(parseFloat(item.lat) - parseFloat(marker.lat)) < 1e-6
      && Math.abs(parseFloat(item.lng) - parseFloat(marker.lng)) < 1e-6
    ));
    const target = byId || byCoord || marker;
    if (target?.lat && target?.lng) {
      setFocusedItem({ ...target, _focusAt: Date.now() });
      setAppMode('normal');
    }
  };

  const handleAddSuccess = async (marker) => {
    setIsModalOpen(false);
    const list = await fetchData();
    focusAddedMarker(marker, list);
    // scrape 寫入可能略慢於回應，補一次再對焦
    if (marker?.lat && marker?.lng && !marker._id) {
      setTimeout(async () => {
        const again = await fetchData();
        focusAddedMarker(marker, again);
      }, 600);
    }
  };

  const handleAddFailure = () => {
    setIsModalOpen(false);
    setAddFailOpen(true);
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
      persistUser(u); 
    }} />;
  }

  // 🌟 前端刪除邏輯
  const handleDeleteItem = async (itemId, options = {}) => {
    // 加上防呆確認，避免誤刪（詳細資訊彈窗會自行確認）
    if (!options.skipConfirm && !window.confirm('確定要刪除這個地點嗎？')) return false;
    
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
        return true;
      }
      alert('刪除失敗，請稍後再試');
      return false;
    } catch (error) {
      console.error('刪除時發生錯誤:', error);
      return false;
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'row', backgroundColor: theme.bg, zIndex: 50, overflow: 'hidden', textAlign: 'left', fontFamily: 'sans-serif', '--sidebar-width': isCollapsed ? '80px' : `${sidebarWidth}px` }}>
      
      <Sidebar 
        user={user} 
        onLogout={handleLogout}
        onOpenSettings={() => setSettingsOpen(true)}
        jobs={jobs}
        loadingData={loadingData}
        appMode={appMode}
        setAppMode={setAppMode}
        radiusCenter={radiusCenter}
        radiusMeters={radiusMeters}
        onOpenModal={() => setIsModalOpen(true)}
        onFocusItem={(item) => {
          setFocusedItem(item);
          setAppMode('normal'); 
        }}
        onDeleteItem={handleDeleteItem}
        onOpenJobDetail={setDetailJob}
        // 🌟 將狀態與修改函式傳遞給 Sidebar
        sidebarWidth={sidebarWidth}
        setSidebarWidth={setSidebarWidth}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        theme={theme}
      />
      
      <MapArea 
        jobs={jobs}
        appMode={appMode}
        setAppMode={setAppMode}
        focusedItem={focusedItem}
        onOpenJobDetail={setDetailJob}
        radiusCenter={radiusCenter}
        setRadiusCenter={setRadiusCenter}
        radiusMeters={radiusMeters}
        setRadiusMeters={setRadiusMeters}
      />
      
      <AddModal 
        user={user} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={handleAddSuccess}
        onFailure={handleAddFailure}
      />

      <SettingsModal
        user={user}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUserUpdated={persistUser}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        theme={theme}
      />

      {detailJob && (
        <JobDetailModal
          item={detailJob}
          onClose={() => setDetailJob(null)}
          onDeleteItem={handleDeleteItem}
          onSaved={(updated) => {
            setDetailJob(updated);
            setJobs(prev => prev.map(job => job._id === updated._id ? { ...job, ...updated } : job));
          }}
        />
      )}

      {addFailOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5000, padding: '24px' }}
        >
          <div style={{ width: '100%', maxWidth: '360px', backgroundColor: theme.bg, borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', padding: '28px 24px', boxSizing: 'border-box', textAlign: 'center' }}>
            <p style={{ margin: '0 0 24px 0', fontSize: '16px', color: theme.text, fontWeight: 700, lineHeight: 1.6 }}>對不起，這有點失敗。</p>
            <button
              type="button"
              onClick={() => setAddFailOpen(false)}
              style={{ width: '100%', padding: '12px', border: 'none', borderRadius: '12px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              確定
            </button>
          </div>
        </div>
      )}
      
    </div>
  );
}