import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [mapError, setMapError] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null); 

  // 🌟 環境變數讀取設定：
  // 由於預覽環境無法解析特定環境變數語法，目前先暫時使用安全字串。
  // 當您將程式碼複製到本地端 Vite 專案時，請將下方 apiKey 替換為：
  // const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // ==========================================
  // 1. 獨立載入 Google Maps 腳本 (確保載入 Advanced Marker 所需函式庫)
  // ==========================================
  useEffect(() => {
    // 檢查是否沒有設定真實的金鑰
    if (!apiKey || apiKey === "請填寫您的_API_KEY") {
      setMapError("請在您本地端的 .env 檔案中設定 VITE_GOOGLE_MAPS_API_KEY 並重新啟動 npm run dev");
      return;
    }

    if (window.google && window.google.maps) {
      setIsMapReady(true);
      return;
    }

    window.__initGoogleMaps = () => {
      console.log("Google Maps API 腳本載入成功！");
      setIsMapReady(true);
    };

    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      // 確保加入了 v=beta 以及 marker library
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&libraries=marker&callback=__initGoogleMaps`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        setMapError("Google Maps 腳本下載失敗，請檢查網路或金鑰權限");
      };
      document.head.appendChild(script);
    }
  }, [apiKey]);

  // ==========================================
  // 2. 初始化地圖畫布與全域浮窗
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
  // 3. 獨立獲取後端資料
  // ==========================================
  useEffect(() => {
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
  }, []);

  // ==========================================
  // 4. 當地圖與資料都準備好時，進行分組並加上圖釘
  // ==========================================
  useEffect(() => {
    if (isMapReady && mapInstanceRef.current && jobs.length > 0) {
      
      // 🌟 修正：先檢查 AdvancedMarkerElement 是否真的可用
      if (!window.google?.maps?.marker?.AdvancedMarkerElement) {
         console.warn("AdvancedMarkerElement 尚未準備好，稍後重試...");
         return; 
      }

      // 將原本的方法提取出來，這是比較穩定的呼叫方式
      const AdvancedMarkerElement = window.google.maps.marker.AdvancedMarkerElement;

      markersRef.current.forEach(marker => {
        if (marker) marker.map = null;
      });
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

        if (foundGroup) {
          foundGroup.push(job); 
        } else {
          groups.push([job]);   
        }
      });

      Object.values(groups).forEach(group => {
        const firstItem = group[0];
        try {
          const isHousing = firstItem.type === 'housing';
          const dotColor = isHousing ? '#10b981' : '#3b82f6'; 

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

          // 🌟 修正：直接使用剛剛提取出來的 AdvancedMarkerElement 類別
          const marker = new AdvancedMarkerElement({
            position: { lat: firstItem.lat, lng: firstItem.lng },
            map: mapInstanceRef.current,
            title: `${group.length} 筆資料`,
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
                  </div>
                  `;
                } else {
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
                  </div>
                `};
              }).join('');

              const contentString = `
                <div style="padding: 8px 4px 0 4px; min-width: 280px; max-width: 320px; max-height: 350px; overflow-y: auto; font-family: system-ui, -apple-system, sans-serif;">
                  ${itemsHtmlList}
                </div>
              `;

              infoWindowRef.current.setContent(contentString);
              infoWindowRef.current.open({
                anchor: marker, 
                map: mapInstanceRef.current
              });
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
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', flexDirection: 'row',
      backgroundColor: '#ffffff', color: '#0f172a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'left', zIndex: 9999
    }}>
      
      <div style={{
        width: '400px', height: '100%', overflowY: 'auto',
        backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box'
      }}>
        <div style={{ padding: '24px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#2563eb', margin: '0 0 8px 0' }}>NuLifeMap 生存地圖</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
            {loadingData ? "正在從資料庫載入資料..." : `共找到 ${jobs.length} 筆資料`}
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loadingData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#3b82f6' }}>
              <Loader2 className="animate-spin" style={{ width: '32px', height: '32px' }} />
            </div>
          ) : jobs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>目前沒有任何資料</div>
          ) : (
            jobs.map((item, idx) => {
              const isHousing = item.type === 'housing';
              const borderColor = isHousing ? '#10b981' : '#3b82f6';
              
              return (
                <div key={idx} style={{
                  padding: '16px', backgroundColor: '#ffffff', borderRadius: '12px',
                  borderLeft: `5px solid ${borderColor}`,
                  borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', 
                  marginBottom: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer'
                }}>
                  {isHousing ? (
                    <React.Fragment>
                      <h3 style={{ fontWeight: 'bold', color: '#047857', fontSize: '16px', margin: '0 0 6px 0' }}>🏠 {item.houseInfo?.title || "未命名租屋"}</h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                         <span style={{ color: '#ea580c', fontWeight: '600', fontSize: '14px' }}>{item.houseInfo?.price || "未知租金"}</span>
                         <span style={{ color: '#64748b', fontSize: '13px' }}>{item.houseInfo?.area || ""}</span>
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.address}</p>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <h3 style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '16px', margin: '0 0 6px 0' }}>💼 {item.jobInfo?.jobTitle || "未命名職缺"}</h3>
                      <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 4px 0' }}>{item.jobInfo?.companyName || "未提供公司名稱"}</p>
                      <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.address}</p>
                    </React.Fragment>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      
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
        
        {!isMapReady && !mapError && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#f1f5f9',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 10
          }}>
            <Loader2 className="animate-spin" style={{ color: '#94a3b8', width: '40px', height: '40px', marginBottom: '16px' }} />
            <p style={{ color: '#64748b', fontWeight: 500 }}>連線至 Google Maps...</p>
          </div>
        )}
      </div>
    </div>
  );
}