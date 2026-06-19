import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Plus, Link as LinkIcon, MapPin } from 'lucide-react';

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [mapError, setMapError] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);
  
  // 🌟 表單與新增功能 State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addMode, setAddMode] = useState('url'); // 'url' 網址爬蟲 或 'custom' 自訂地點
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' }); 
  
  // 表單輸入內容 State
  const [inputUrl, setInputUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customMemo, setCustomMemo] = useState('');

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null); 


  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // ==========================================
  // 1. 獨立載入 Google Maps 腳本 (確保 AdvancedMarker 支援)
  // ==========================================
  useEffect(() => {
    if (!apiKey || apiKey === "請填寫您的_API_KEY") {
      setMapError("請在您本地端的 .env 檔案中設定 VITE_GOOGLE_MAPS_API_KEY");
      return;
    }

    if (window.google && window.google.maps) {
      setIsMapReady(true);
      return;
    }

    window.__initGoogleMaps = () => setIsMapReady(true);

    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&libraries=marker&callback=__initGoogleMaps`;
      script.async = true;
      script.defer = true;
      script.onerror = () => setMapError("Google Maps 腳本下載失敗");
      document.head.appendChild(script);
    }
  }, [apiKey]);

  // ==========================================
  // 2. 初始化地圖
  // ==========================================
  useEffect(() => {
    if (isMapReady && mapContainerRef.current && !mapInstanceRef.current) {
      try {
        mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: 24.1552, lng: 120.6768 }, 
          zoom: 13,
          mapId: '3c73b549351a9c392d89c3bb', // 您專屬的地圖 ID
          disableDefaultUI: true, 
          zoomControl: true, 
        });

        infoWindowRef.current = new window.google.maps.InfoWindow({
          pixelOffset: new window.google.maps.Size(0, -12)
        });

        infoWindowRef.current.addListener('closeclick', () => {
          infoWindowRef.current.setAnchor(null);
        });
      } catch (err) {
        setMapError("地圖繪製發生錯誤：" + err.message);
      }
    }
  }, [isMapReady]);

  // ==========================================
  // 3. 獲取後端資料 (拉成獨立函式，方便表單送出後重整)
  // ==========================================
  const fetchData = () => {
    setLoadingData(true);
    fetch('http://127.0.0.1:3000/api/markers')
      .then(res => {
        if (!res.ok) throw new Error("伺服器回應錯誤");
        return res.json();
      })
      .then(data => {
        const processedData = data.map(item => ({
          ...item,
          lat: item.lat || 24.1552,
          lng: item.lng || 120.6768
        }));
        setJobs(processedData);
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

  // ==========================================
  // 🌟 處理表單送出 (網址爬蟲 & 自訂地點)
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      if (addMode === 'url') {
        if (!inputUrl) throw new Error('請輸入網址');
        
        let endpoint = '';
        if (inputUrl.includes('591.com.tw')) {
          endpoint = 'http://127.0.0.1:8000/scrape/591'; 
        } else if (inputUrl.includes('104.com.tw') || inputUrl.includes('1111.com.tw')) {
          endpoint = 'http://127.0.0.1:8000/scrape/url'; 
        } else {
          throw new Error('目前僅支援 591 租屋網與 104/1111 人力銀行網址');
        }

        // 💡 修正傳遞格式：由於 Python 是定義 `async def scrape_591(url: str):`
        // 這代表必須使用 Query String (網址參數) 來傳遞資料
        const targetUrl = `${endpoint}?url=${encodeURIComponent(inputUrl)}`;

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) {
           const errorData = await res.json().catch(() => ({})); 
           throw new Error(errorData.detail || '爬蟲請求失敗，請檢查 Python 是否已開啟 CORS');
        }

        const data = await res.json();
        setSubmitMessage({ type: 'success', text: '資料抓取成功！即將更新地圖...' });

      } else {
        if (!customTitle || !customAddress) throw new Error('標題與地址為必填欄位');
        const res = await fetch('http://127.0.0.1:3000/api/markers/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: customTitle, address: customAddress, memo: customMemo })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '新增失敗');
        setSubmitMessage({ type: 'success', text: '自訂地點新增成功！' });
      }

      setTimeout(() => {
        setIsModalOpen(false);
        setInputUrl('');
        setCustomTitle('');
        setCustomAddress('');
        setCustomMemo('');
        setSubmitMessage({ type: '', text: '' });
        fetchData(); 
      }, 1500);

    } catch (error) {
      console.error(error);
      setSubmitMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // 4. 繪製圖釘與分組
  // ==========================================
  useEffect(() => {
    if (isMapReady && mapInstanceRef.current && jobs.length > 0) {
      if (!window.google?.maps?.marker?.AdvancedMarkerElement) {
        console.warn("AdvancedMarkerElement 尚未準備好，稍後重試...");
        return; 
      }

      const AdvancedMarkerElement = window.google.maps.marker.AdvancedMarkerElement;

      markersRef.current.forEach(marker => { if (marker) marker.map = null; });
      markersRef.current = [];

      const groups = [];
      const MERGE_DISTANCE = 0.0015;

      jobs.forEach(job => {
        let foundGroup = groups.find(group => {
          const centerJob = group[0];
          const dx = centerJob.lat - job.lat;
          const dy = centerJob.lng - job.lng;
          return Math.sqrt(dx * dx + dy * dy) < MERGE_DISTANCE;
        });

        if (foundGroup) foundGroup.push(job); 
        else groups.push([job]);   
      });

      Object.values(groups).forEach(group => {
        const firstItem = group[0];
        try {
          // 🌟 加入自訂地點的顏色 (紫色)
          let dotColor = '#3b82f6'; // 預設藍色(職缺)
          if (firstItem.type === 'housing') dotColor = '#10b981'; // 綠色(租屋)
          if (firstItem.type === 'custom') dotColor = '#a855f7';  // 紫色(自訂)

          const customMarkerDiv = document.createElement('div');
          customMarkerDiv.style.width = '28px';
          customMarkerDiv.style.height = '28px';
          customMarkerDiv.style.backgroundColor = dotColor; 
          customMarkerDiv.style.border = '3px solid #ffffff'; 
          customMarkerDiv.style.borderRadius = '50%'; 
          customMarkerDiv.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'; 
          customMarkerDiv.style.cursor = 'pointer';
          customMarkerDiv.style.display = 'flex';
          customMarkerDiv.style.alignItems = 'center';
          customMarkerDiv.style.justifyContent = 'center';
          customMarkerDiv.style.color = '#ffffff';
          customMarkerDiv.style.fontWeight = 'bold';
          customMarkerDiv.style.fontSize = '13px';
          customMarkerDiv.style.transition = 'transform 0.2s ease'; 

          if (group.length > 1) {
            customMarkerDiv.textContent = group.length;
          } else {
            const innerDot = document.createElement('div');
            innerDot.style.width = '6px';
            innerDot.style.height = '6px';
            innerDot.style.backgroundColor = '#ffffff';
            innerDot.style.borderRadius = '50%';
            customMarkerDiv.appendChild(innerDot);
          }

          const marker = new AdvancedMarkerElement({
            position: { lat: firstItem.lat, lng: firstItem.lng },
            map: mapInstanceRef.current,
            content: customMarkerDiv 
          });

          marker.addListener('click', () => {
            if (infoWindowRef.current) {
              if (infoWindowRef.current.getAnchor() === marker) {
                infoWindowRef.current.close(); 
                infoWindowRef.current.setAnchor(null); 
                return; 
              }

              const itemsHtmlList = group.map((item) => {
                // === 租屋 ===
                if (item.type === 'housing') {
                  return `
                  <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;">
                    <h3 style="color: #047857; font-size: 18px; font-weight: 800; margin: 0 0 10px 0;">🏠 ${item.houseInfo?.title || '未知租屋'}</h3>
                    <div style="color: #475569; font-size: 14px; line-height: 1.8;">
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">租金：</span><span style="flex: 1; color: #ea580c; font-weight: 600;">${item.houseInfo?.price || '未提供'}</span></div>
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">格局/坪數：</span><span style="flex: 1;">${item.houseInfo?.area || '-'} / ${item.houseInfo?.floor || '-'}</span></div>
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">開伙仲介：</span><span style="flex: 1;">${item.houseInfo?.cooking || '-'} | ${item.houseInfo?.is_agent || '-'}</span></div>
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">聯絡方式：</span><span style="flex: 1; color: #2563eb; font-weight: 500;">${item.houseInfo?.contact || '未提供'}</span></div>
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">地址：</span><span style="flex: 1;">${item.address || '未知地址'}</span></div>
                    </div>
                  </div>`;
                } 
                // === 🌟 自訂地點 ===
                else if (item.type === 'custom') {
                  return `
                  <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;">
                    <h3 style="color: #7e22ce; font-size: 18px; font-weight: 800; margin: 0 0 10px 0;">📍 ${item.customInfo?.title || '自訂地點'}</h3>
                    <div style="color: #475569; font-size: 14px; line-height: 1.8;">
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 50px; font-weight: 600; color: #334155;">地址：</span><span style="flex: 1;">${item.address || '未知地址'}</span></div>
                      ${item.memo ? `<div style="display: flex; margin-top: 4px;"><span style="width: 50px; font-weight: 600; color: #334155;">備註：</span><span style="flex: 1; color: #64748b;">${item.memo}</span></div>` : ''}
                    </div>
                  </div>`;
                }
                // === 職缺 ===
                else {
                  const skills = item.jobInfo?.skills || [];
                  const skillsHtml = skills.length > 0 
                    ? skills.map(s => `<span style="display: inline-block; background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 4px; margin-bottom: 4px;">${s}</span>`).join('')
                    : '<span style="color: #94a3b8; font-size: 12px;">未特別標註</span>';

                  return `
                  <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;">
                    <h3 style="color: #0f172a; font-size: 18px; font-weight: 800; margin: 0 0 10px 0;">💼 ${item.jobInfo?.jobTitle || '未知職缺'}</h3>
                    <div style="color: #475569; font-size: 14px; line-height: 1.8;">
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">公司名稱：</span><span style="flex: 1;">${item.jobInfo?.companyName || '未知公司'}</span></div>
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">地址：</span><span style="flex: 1;">${item.address || '未知地址'}</span></div>
                      <div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600; color: #334155;">薪資：</span><span style="flex: 1; color: #ea580c; font-weight: 500;">${item.memo || '未提供薪資'}</span></div>
                      <div style="display: flex; margin-top: 8px; flex-direction: column;">
                        <span style="font-weight: 600; color: #334155; margin-bottom: 6px;">需要技能：</span>
                        <div>${skillsHtml}</div>
                      </div>
                    </div>
                  </div>`;
                }
              }).join('');

              const contentString = `<div style="padding: 8px 4px 0 4px; min-width: 280px; max-width: 320px; max-height: 350px; overflow-y: auto; font-family: system-ui, -apple-system, sans-serif;">${itemsHtmlList}</div>`;

              infoWindowRef.current.setContent(contentString);
              infoWindowRef.current.open({ anchor: marker, map: mapInstanceRef.current });
            }
          });
          markersRef.current.push(marker);
        } catch (e) {
          console.warn("無法建立圖釘:", e);
        }
      });
    }
  }, [isMapReady, jobs]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'row', backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', textAlign: 'left', zIndex: 999 }}>
      
      {/* ========================================== */}
      {/* 左側清單 */}
      {/* ========================================== */}
      <div style={{ width: '400px', height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#2563eb', margin: '0 0 8px 0' }}>NuLifeMap 生存地圖</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
            {loadingData ? "正在載入資料..." : `共找到 ${jobs.length} 筆資料`}
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loadingData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#3b82f6' }}><Loader2 className="animate-spin" /></div>
          ) : jobs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>目前沒有任何資料</div>
          ) : (
            jobs.map((item, idx) => {
              // 🌟 側邊欄顏色與圖示對應
              let borderColor = '#3b82f6';
              let iconStr = '💼';
              let titleStr = item.jobInfo?.jobTitle || "未命名職缺";
              
              if (item.type === 'housing') {
                borderColor = '#10b981'; iconStr = '🏠'; titleStr = item.houseInfo?.title || "未命名租屋";
              } else if (item.type === 'custom') {
                borderColor = '#a855f7'; iconStr = '📍'; titleStr = item.customInfo?.title || "自訂地點";
              }
              
              return (
                <div key={idx} style={{
                  padding: '16px', backgroundColor: '#ffffff', borderRadius: '12px', borderLeft: `5px solid ${borderColor}`,
                  borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', 
                  marginBottom: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  <h3 style={{ fontWeight: 'bold', color: borderColor !== '#a855f7' ? (borderColor === '#10b981' ? '#047857' : '#0f172a') : '#7e22ce', fontSize: '16px', margin: '0 0 6px 0' }}>
                    {iconStr} {titleStr}
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.address}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* ========================================== */}
      {/* 地圖區域 */}
      {/* ========================================== */}
      <div style={{ flex: 1, height: '100%', position: 'relative', backgroundColor: '#e2e8f0' }}>
        <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        
        {mapError && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(4px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '24px', textAlign: 'center', zIndex: 20
          }}>
            <AlertCircle style={{ color: '#ef4444', width: '48px', height: '48px', marginBottom: '16px' }} />
            <h2 style={{ fontWeight: 'bold', fontSize: '20px', color: '#1e293b', marginBottom: '8px' }}>地圖無法顯示</h2>
            <p style={{ color: '#475569', fontWeight: 500 }}>{mapError}</p>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* 🌟 懸浮新增按鈕 (FAB) */}
      {/* ========================================== */}
      <button 
        onClick={() => setIsModalOpen(true)}
        style={{
          position: 'absolute', bottom: '30px', right: '30px', width: '56px', height: '56px',
          backgroundColor: '#2563eb', color: 'white', borderRadius: '50%', border: 'none',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          transition: 'transform 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Plus size={28} />
      </button>

      {/* ========================================== */}
      {/* 🌟 新增資料彈出視窗 (Modal) */}
      {/* ========================================== */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '16px', width: '90%', maxWidth: '450px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', overflow: 'hidden'
          }}>
            {/* 彈出視窗標題列 */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>新增地點至地圖</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            {/* 頁籤切換 (Tabs) */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <button 
                onClick={() => setAddMode('url')}
                style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: addMode === 'url' ? '3px solid #2563eb' : '3px solid transparent', color: addMode === 'url' ? '#2563eb' : '#64748b', fontWeight: addMode === 'url' ? 'bold' : 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <LinkIcon size={16} /> 網址抓取
              </button>
              <button 
                onClick={() => setAddMode('custom')}
                style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: addMode === 'custom' ? '3px solid #a855f7' : '3px solid transparent', color: addMode === 'custom' ? '#a855f7' : '#64748b', fontWeight: addMode === 'custom' ? 'bold' : 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <MapPin size={16} /> 自訂地點
              </button>
            </div>

            {/* 表單內容區 */}
            <div style={{ padding: '24px' }}>
              {submitMessage.text && (
                <div style={{ padding: '12px', marginBottom: '16px', borderRadius: '8px', backgroundColor: submitMessage.type === 'error' ? '#fef2f2' : '#f0fdf4', color: submitMessage.type === 'error' ? '#b91c1c' : '#15803d', fontSize: '14px', border: `1px solid ${submitMessage.type === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
                  {submitMessage.text}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {addMode === 'url' ? (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>貼上 104 或 591 網址</label>
                    <input 
                      type="url" required value={inputUrl} onChange={e => setInputUrl(e.target.value)}
                      placeholder="https://..."
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>送出後將呼叫 Python 爬蟲，可能需要等待幾秒鐘。</p>
                  </div>
                ) : (
                  <React.Fragment>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>地標名稱 *</label>
                      <input type="text" required value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="例如：我的超級愛店" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>完整地址 *</label>
                      <input type="text" required value={customAddress} onChange={e => setCustomAddress(e.target.value)} placeholder="例如：台中市西屯區台灣大道三段" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>備註 (選填)</label>
                      <textarea value={customMemo} onChange={e => setCustomMemo(e.target.value)} placeholder="寫點什麼..." rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }} />
                    </div>
                  </React.Fragment>
                )}

                <button 
                  type="submit" disabled={isSubmitting}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: isSubmitting ? '#94a3b8' : (addMode === 'url' ? '#2563eb' : '#a855f7'), color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s' }}
                >
                  {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                  {isSubmitting ? '處理中...' : '送出新增'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}