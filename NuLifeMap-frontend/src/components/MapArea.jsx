import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Route, Target, X, AlertCircle, MapPin } from 'lucide-react';

export default function MapArea({ 
  jobs, 
  appMode, 
  setAppMode, 
  focusedItem 
}) {
  const [mapError, setMapError] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);
  
  // 地圖專屬 Local State
  const [distPoints, setDistPoints] = useState([]); 
  const [distResult, setDistResult] = useState(null);
  const [radiusCenter, setRadiusCenter] = useState(null);
  const [radiusMeters, setRadiusMeters] = useState(1000);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]); 
  const infoWindowRef = useRef(null); 
  const directionsRendererRef = useRef(null);
  const circleRef = useRef(null);

  // 🌟 修正點：移除 import.meta 以解決預覽環境的編譯警告。
  // 在本地端開發時，可將此行替換回 import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // 確保在 Marker 點擊時能拿到最新的狀態
  const appStateRef = useRef({ mode: 'normal', distPoints: [], radiusCenter: null });
  useEffect(() => {
    appStateRef.current = { mode: appMode, distPoints, radiusCenter };
  }, [appMode, distPoints, radiusCenter]);

  // 1. 初始化腳本
  useEffect(() => {
    if (!apiKey || apiKey === "請填寫您的_API_KEY") {
      setMapError("請在 .env 檔案中設定 VITE_GOOGLE_MAPS_API_KEY");
      return;
    }
    if (window.google && window.google.maps) {
      setIsMapReady(true); return;
    }
    window.__initGoogleMaps = () => setIsMapReady(true);
    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&libraries=marker,geometry&callback=__initGoogleMaps`;
      script.async = true;
      script.defer = true;
      script.onerror = () => setMapError("Google Maps 腳本下載失敗");
      document.head.appendChild(script);
    }
  }, [apiKey]);

  // 2. 初始化地圖
  useEffect(() => {
    if (isMapReady && mapContainerRef.current && !mapInstanceRef.current) {
      try {
        mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: 24.1552, lng: 120.6768 }, 
          zoom: 13,
          mapId: '3c73b549351a9c392d89c3bb',
          disableDefaultUI: true, zoomControl: true, 
        });
        infoWindowRef.current = new window.google.maps.InfoWindow({ pixelOffset: new window.google.maps.Size(0, -12) });
        infoWindowRef.current.addListener('closeclick', () => infoWindowRef.current.setAnchor(null));
      } catch (err) {
        setMapError("地圖繪製發生錯誤：" + err.message);
      }
    }
  }, [isMapReady]);

  // 3. 監聽大老闆傳來的 focusedItem (飛躍動畫)
  useEffect(() => {
    if (focusedItem && isMapReady && mapInstanceRef.current) {
      const lat = parseFloat(focusedItem.lat);
      const lng = parseFloat(focusedItem.lng);
      mapInstanceRef.current.panTo({ lat, lng });
      mapInstanceRef.current.setZoom(16);
      
      const targetMarker = markersRef.current.find(m => {
        // 因為圖釘被合併了，所以要找「包含這個 item 的群組」
        if (!m._group) return false;
        return m._group.some(i => parseFloat(i.lat) === lat && parseFloat(i.lng) === lng);
      });
      
      if (targetMarker && appMode === 'normal') {
        window.google.maps.event.trigger(targetMarker, 'click');
      }
    }
  }, [focusedItem, isMapReady, appMode]);

  // 4. 清理模式殘留 (當 appMode 改變時)
  useEffect(() => {
    if (appMode !== 'distance') {
      setDistPoints([]); setDistResult(null);
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }
    if (appMode !== 'radius') {
      setRadiusCenter(null); setRadiusMeters(1000);
      if (circleRef.current) circleRef.current.setMap(null);
      circleRef.current = null;
    }
    if (appMode !== 'normal') {
      if (infoWindowRef.current) infoWindowRef.current.close();
    }
  }, [appMode]);

  // 5. 導航距離計算
  useEffect(() => {
    if (appMode === 'distance' && distPoints.length === 2 && mapInstanceRef.current) {
      const ds = new window.google.maps.DirectionsService();
      if (!directionsRendererRef.current) {
        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
          map: mapInstanceRef.current, suppressMarkers: true, 
          polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 6, strokeOpacity: 0.8 }
        });
      }
      ds.route({
        origin: { lat: parseFloat(distPoints[0].lat), lng: parseFloat(distPoints[0].lng) },
        destination: { lat: parseFloat(distPoints[1].lat), lng: parseFloat(distPoints[1].lng) },
        travelMode: window.google.maps.TravelMode.DRIVING
      }, (response, status) => {
        if (status === 'OK') {
          directionsRendererRef.current.setDirections(response);
          const leg = response.routes[0].legs[0];
          setDistResult(`🚗 導航距離：${leg.distance.text} (約需 ${leg.duration.text})`);
        } else {
          setDistResult('❌ 無法計算兩點間的導航距離');
        }
      });
    }
  }, [distPoints, appMode]);

  // 6. 更新範圍圓圈
  useEffect(() => {
    if (!isMapReady || !window.google?.maps?.geometry || appMode !== 'radius' || !radiusCenter) return;
    const centerLatLng = new window.google.maps.LatLng(parseFloat(radiusCenter.lat), parseFloat(radiusCenter.lng));
    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({
        map: mapInstanceRef.current, fillColor: '#9333ea', fillOpacity: 0.15,
        strokeColor: '#7e22ce', strokeWeight: 2, clickable: false
      });
    }
    circleRef.current.setCenter(centerLatLng);
    circleRef.current.setRadius(radiusMeters);
  }, [radiusCenter, radiusMeters, appMode, isMapReady]);

  // 7. 動態更新圖釘樣式 (紅點、灰階)
  useEffect(() => {
    if (!isMapReady || markersRef.current.length === 0) return;
    markersRef.current.forEach(m => {
      const item = m._item;
      if (!item || !m.content) return;

      const div = m.content;
      let defaultColor = item.type === 'housing' ? '#10b981' : (item.type === 'custom' ? '#a855f7' : '#3b82f6'); 
      let isSelected = false;
      let isOutsideRadius = false;

      if (appMode === 'distance') {
        isSelected = distPoints.some(p => parseFloat(p.lat) === parseFloat(item.lat) && parseFloat(p.lng) === parseFloat(item.lng));
      } else if (appMode === 'radius') {
        if (radiusCenter) {
          isSelected = (parseFloat(radiusCenter.lat) === parseFloat(item.lat) && parseFloat(radiusCenter.lng) === parseFloat(item.lng));
          const centerLatLng = new window.google.maps.LatLng(parseFloat(radiusCenter.lat), parseFloat(radiusCenter.lng));
          const mLatLng = new window.google.maps.LatLng(parseFloat(item.lat), parseFloat(item.lng));
          const dist = window.google.maps.geometry.spherical.computeDistanceBetween(centerLatLng, mLatLng);
          if (dist > radiusMeters) isOutsideRadius = true;
        }
      }

      if (isSelected) {
        div.style.backgroundColor = '#ef4444'; div.style.transform = 'scale(1.25)'; m.zIndex = 1000;
      } else {
        div.style.backgroundColor = defaultColor; div.style.transform = 'scale(1)'; m.zIndex = null;
      }

      if (isOutsideRadius) {
        div.style.filter = 'grayscale(100%)'; div.style.opacity = '0.35';
      } else {
        div.style.filter = 'none'; div.style.opacity = '1';
      }
    });
  }, [appMode, distPoints, radiusCenter, radiusMeters, isMapReady, jobs]);

  // 8. 繪製圖釘與綁定點擊事件
  useEffect(() => {
    if (isMapReady && mapInstanceRef.current && jobs.length > 0) {
      if (!window.google?.maps?.marker?.AdvancedMarkerElement) return; 
      const AdvancedMarkerElement = window.google.maps.marker.AdvancedMarkerElement;
      markersRef.current.forEach(marker => { if (marker) marker.map = null; });
      markersRef.current = [];

      const groups = [];
      const MERGE_DISTANCE = 0.0015;

      jobs.forEach(job => {
        let foundGroup = groups.find(group => {
          const centerJob = group[0];
          return Math.sqrt(Math.pow(centerJob.lat - job.lat, 2) + Math.pow(centerJob.lng - job.lng, 2)) < MERGE_DISTANCE;
        });
        if (foundGroup) foundGroup.push(job); else groups.push([job]);   
      });

      groups.forEach(group => {
        const firstItem = group[0];
        try {
          let dotColor = firstItem.type === 'housing' ? '#10b981' : (firstItem.type === 'custom' ? '#a855f7' : '#3b82f6');
          const customMarkerDiv = document.createElement('div');
          customMarkerDiv.style.cssText = `width: 28px; height: 28px; background-color: ${dotColor}; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 13px; transition: transform 0.2s ease, filter 0.3s ease, opacity 0.3s ease, background-color 0.2s ease;`;
          
          if (group.length > 1) { customMarkerDiv.textContent = group.length; } 
          else {
            const innerDot = document.createElement('div');
            innerDot.style.cssText = 'width: 6px; height: 6px; background-color: #ffffff; border-radius: 50%;';
            customMarkerDiv.appendChild(innerDot);
          }

          const marker = new AdvancedMarkerElement({
            position: { lat: parseFloat(firstItem.lat), lng: parseFloat(firstItem.lng) },
            map: mapInstanceRef.current, content: customMarkerDiv 
          });
          
          marker._item = firstItem;
          marker._group = group; // 🌟 紀錄整個群組，方便後續比對

          marker.addListener('click', () => {
            const state = appStateRef.current;
            if (state.mode === 'distance') {
              if (state.distPoints.length < 2) setDistPoints([...state.distPoints, firstItem]);
              return; 
            }
            if (state.mode === 'radius') {
              setRadiusCenter(firstItem);
              return; 
            }
            if (infoWindowRef.current) {
              if (infoWindowRef.current.getAnchor() === marker) {
                infoWindowRef.current.close(); infoWindowRef.current.setAnchor(null); return; 
              }

              const itemsHtmlList = group.map((item) => {
                const sourceUrl = item.houseInfo?.sourceUrl || item.jobInfo?.sourceUrl || item.customInfo?.website;
                const linkHtml = sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:6px 12px; background-color:#eff6ff; color:#2563eb; border-radius:6px; font-size:13px; text-decoration:none; font-weight:600; border:1px solid #bfdbfe;">🔗 前往網頁</a>` : '';

                if (item.type === 'housing') {
                  return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><h3 style="color: #047857; font-size: 18px; font-weight: 800; margin: 0 0 10px 0;">🏠 ${item.houseInfo?.title || '租屋'}</h3><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">租金：</span><span style="flex: 1; color: #ea580c; font-weight: 600;">${item.houseInfo?.price}</span></div><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">地址：</span><span style="flex: 1;">${item.address}</span></div>${linkHtml}</div></div>`;
                } else if (item.type === 'custom') {
                  const hoursHtml = item.customInfo?.opening_hours?.length > 0 ? `<div style="margin-top: 8px; padding: 8px; background-color: #f8fafc; border-radius: 6px;"><div style="font-weight: 600; margin-bottom: 4px; font-size: 13px;">🕒 營業時間</div>${item.customInfo.opening_hours.map(h => `<div style="font-size: 12px; color: #64748b;">${h}</div>`).join('')}</div>` : '';
                  const photoHtml = item.customInfo?.photo_url ? `<img src="${item.customInfo.photo_url}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; margin-top: 12px;" />` : '';
                  return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><h3 style="color: #7e22ce; font-size: 18px; font-weight: 800; margin: 0 0 10px 0;">📍 ${item.customInfo?.title}</h3><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 50px; font-weight: 600;">地址：</span><span style="flex: 1;">${item.address}</span></div>${item.memo ? `<div style="display: flex; margin-top: 4px;"><span style="width: 50px; font-weight: 600;">備註：</span><span style="flex: 1;">${item.memo}</span></div>` : ''}${hoursHtml}${photoHtml}${linkHtml}</div></div>`;
                } else {
                  return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><h3 style="color: #0f172a; font-size: 18px; font-weight: 800; margin: 0 0 10px 0;">💼 ${item.jobInfo?.jobTitle}</h3><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">公司：</span><span style="flex: 1;">${item.jobInfo?.companyName}</span></div><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">地址：</span><span style="flex: 1;">${item.address}</span></div><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">薪資：</span><span style="flex: 1; color: #ea580c; font-weight: 500;">${item.memo}</span></div>${linkHtml}</div></div>`;
                }
              }).join('');

              infoWindowRef.current.setContent(`<div style="padding: 8px 4px 0 4px; min-width: 280px; max-width: 320px; max-height: 500px; overflow-y: auto; font-family: system-ui;">${itemsHtmlList}</div>`);
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
    <div style={{ flex: 1, height: '100%', position: 'relative', backgroundColor: '#e2e8f0' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      
      {appMode === 'distance' && <div style={{ position: 'absolute', inset: 0, border: '6px solid #3b82f6', pointerEvents: 'none', zIndex: 15, transition: 'all 0.3s' }} />}
      {appMode === 'radius' && <div style={{ position: 'absolute', inset: 0, border: '6px solid #9333ea', pointerEvents: 'none', zIndex: 15, transition: 'all 0.3s' }} />}

      {appMode === 'distance' && (
        <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'white', padding: '20px 28px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', minWidth: '340px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e3a8a', fontSize: '18px' }}><Route size={22} color="#2563eb"/> 兩點導航測距</h3>
            <button onClick={() => setAppMode('normal')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={22}/></button>
          </div>
          {distPoints.length === 0 && <p style={{ margin: 0, color: '#475569', fontSize: '15px', fontWeight: '500' }}>👆 請點選地圖上的「第一個」圖標</p>}
          {distPoints.length === 1 && <p style={{ margin: 0, color: '#475569', fontSize: '15px', fontWeight: '500' }}>✌️ 請點選地圖上的「第二個」圖標</p>}
          {distPoints.length === 2 && !distResult && <Loader2 className="animate-spin" color="#2563eb"/>}
          {distResult && <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', color: '#1e3a8a', fontWeight: 'bold', fontSize: '16px', border: '1px solid #bfdbfe', width: '100%', textAlign: 'center' }}>{distResult}</div>}
          {distPoints.length === 2 && (
            <button onClick={() => { setDistPoints([]); setDistResult(null); if(directionsRendererRef.current) directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }} style={{ marginTop: '8px', padding: '8px 24px', border: 'none', borderRadius: '8px', background: '#e2e8f0', color: '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>重新測量</button>
          )}
        </div>
      )}

      {appMode === 'radius' && (
        <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'white', padding: '20px 28px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '380px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <h3 style={{ fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#581c87', fontSize: '18px' }}><Target size={22} color="#9333ea"/> 範圍探索模式</h3>
            <button onClick={() => setAppMode('normal')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={22}/></button>
          </div>
          {!radiusCenter ? (
            <p style={{ margin: 0, color: '#475569', fontSize: '15px', textAlign: 'center', padding: '12px 0', fontWeight: '500' }}>🎯 請點擊地圖上的一個圖標作為探索中心</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#faf5ff', padding: '12px', borderRadius: '8px', fontSize: '15px', color: '#6b21a8', border: '1px solid #e9d5ff' }}>
                <MapPin size={18}/> <b>中心點：</b> {radiusCenter.customInfo?.title || radiusCenter.houseInfo?.title || radiusCenter.jobInfo?.jobTitle || '已選擇'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontSize: '15px', fontWeight: 'bold', color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>探索半徑 <span style={{ backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '16px', fontSize: '14px', color: '#475569' }}>{radiusMeters >= 1000 ? (radiusMeters/1000).toFixed(1) + ' 公里' : radiusMeters + ' 公尺'}</span></label>
                <input type="range" min="100" max="10000" step="100" value={radiusMeters} onChange={(e) => setRadiusMeters(Number(e.target.value))} style={{ cursor: 'pointer', accentColor: '#9333ea', height: '6px' }} />
              </div>
            </>
          )}
        </div>
      )}

      {mapError && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <AlertCircle style={{ color: '#ef4444', width: '48px', height: '48px', marginBottom: '16px' }} />
          <h2 style={{ fontWeight: 'bold', fontSize: '20px' }}>地圖無法顯示</h2>
          <p>{mapError}</p>
        </div>
      )}
    </div>
  );
}