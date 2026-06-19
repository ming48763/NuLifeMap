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

  // ⚠️ 請在這裡填入您的真實 Google Maps API Key
  const apiKey = "AIzaSyCm315SaOYJ6s66hS0gp08oMCW9HWcT9KQ"; 

  // ==========================================
  // 1. 獨立載入 Google Maps 腳本
  // ==========================================
  useEffect(() => {
    if (apiKey === "YOUR_API_KEY" || !apiKey) {
      setMapError("請在程式碼第15行填入真實的 API Key");
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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&callback=__initGoogleMaps`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        console.error("腳本下載失敗");
        setMapError("Google Maps 腳本下載失敗，請檢查網路或金鑰權限");
      };
      document.head.appendChild(script);
    }
  }, [apiKey]);

  // ==========================================
  // 2. 初始化地圖畫布
  // ==========================================
  useEffect(() => {
    if (isMapReady && mapContainerRef.current && !mapInstanceRef.current) {
      try {
        console.log("正在繪製地圖...");
        mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: 24.1552, lng: 120.6768 }, // 預設台中市
          zoom: 13,
          mapId: 'DEMO_MAP_ID', 
        });
        console.log("地圖繪製完成！");
      } catch (err) {
        console.error("地圖繪製發生錯誤:", err);
        setMapError("地圖繪製發生錯誤：" + err.message);
      }
    }
  }, [isMapReady]);

  // ==========================================
  // 3. 獨立獲取後端職缺資料
  // ==========================================
  useEffect(() => {
    fetch('http://127.0.0.1:3000/api/markers')
      .then(res => {
        if (!res.ok) throw new Error("伺服器回應錯誤");
        return res.json();
      })
      .then(data => {
        const processedData = data.map(job => ({
          ...job,
          lat: job.lat || 24.1552 + (Math.random() - 0.5) * 0.03,
          lng: job.lng || 120.6768 + (Math.random() - 0.5) * 0.03
        }));
        setJobs(processedData);
        setLoadingData(false);
      })
      .catch(err => {
        console.error("無法取得職缺資料:", err);
        setLoadingData(false);
      });
  }, []);

  // ==========================================
  // 4. 當地圖與資料都準備好時，加上圖釘
  // ==========================================
  useEffect(() => {
    if (isMapReady && mapInstanceRef.current && jobs.length > 0) {
      markersRef.current.forEach(marker => {
        if (marker) marker.map = null;
      });
      markersRef.current = [];

      jobs.forEach(job => {
        try {
          let marker;
          if (window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement) {
            marker = new window.google.maps.marker.AdvancedMarkerElement({
              position: { lat: job.lat, lng: job.lng },
              map: mapInstanceRef.current,
              title: job.jobInfo?.jobTitle || "職缺"
            });
          } else {
            marker = new window.google.maps.Marker({
              position: { lat: job.lat, lng: job.lng },
              map: mapInstanceRef.current,
              title: job.jobInfo?.jobTitle || "職缺"
            });
          }
          markersRef.current.push(marker);
        } catch (e) {
          console.warn("無法建立圖釘:", e);
        }
      });
    }
  }, [isMapReady, jobs]);

  return (
    // 🌟 修正點 1：使用 position: fixed 強制滿版，阻擋 index.css 的置中與黑色背景干擾
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', flexDirection: 'row',
      backgroundColor: '#ffffff', color: '#0f172a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'left', zIndex: 9999
    }}>
      
      {/* 🌟 修正點 2：強制側邊欄寬度與背景色 */}
      <div style={{
        width: '400px', height: '100%', overflowY: 'auto',
        backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box'
      }}>
        <div style={{ padding: '24px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#2563eb', margin: '0 0 8px 0' }}>NuLifeMap 職缺地圖</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
            {loadingData ? "正在從資料庫載入職缺..." : `共找到 ${jobs.length} 筆資料`}
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loadingData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#3b82f6' }}>
              <Loader2 className="animate-spin" style={{ width: '32px', height: '32px' }} />
            </div>
          ) : jobs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>目前沒有職缺資料</div>
          ) : (
            jobs.map((job, idx) => (
              <div key={idx} style={{
                padding: '16px', backgroundColor: '#ffffff', borderRadius: '12px',
                border: '1px solid #e2e8f0', marginBottom: '12px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)', cursor: 'pointer'
              }}>
                <h3 style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '16px', margin: '0 0 4px 0' }}>{job.jobInfo?.jobTitle || "未命名職缺"}</h3>
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>{job.jobInfo?.companyName || "未提供公司名稱"}</p>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* 🌟 修正點 3：強制地圖區塊佔滿剩餘空間，並確保內部的 map container 高度為 100% */}
      <div style={{ flex: 1, height: '100%', position: 'relative', backgroundColor: '#e2e8f0' }}>
        
        {/* 這就是被壓縮到 0 的罪魁禍首，現在強制它 top 0 到 bottom 0 */}
        <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        
        {/* 錯誤蓋板 */}
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
        
        {/* 載入中蓋板 */}
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