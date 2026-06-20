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
  const [infoBoxes, setInfoBoxes] = useState([]); // 🌟 新增：存放距離模式的動態資訊框

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]); 
  const directionsRendererRef = useRef(null);
  const circleRef = useRef(null);
  const boundsRectRef = useRef(null); 

  const mapAreaWrapperRef = useRef(null);
  const floatingPanelRef = useRef(null);

  const [panelPos, setPanelPos] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // ⚠️ 本地開發請換回：const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; 

  const appStateRef = useRef({ mode: 'normal', distPoints: [], radiusCenter: null });
  useEffect(() => {
    appStateRef.current = { mode: appMode, distPoints, radiusCenter };
  }, [appMode, distPoints, radiusCenter]);

  // 🌟 共用 Helper：將單一物件轉為精緻的 HTML 字串 (供圖釘與資訊框共用)
  const generateItemHtmlList = (group) => {
    return group.map((item, index) => {
      const sourceUrl = item.houseInfo?.sourceUrl || item.jobInfo?.sourceUrl || item.customInfo?.website;
      const linkHtml = sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:6px 12px; background-color:#eff6ff; color:#2563eb; border-radius:6px; font-size:13px; text-decoration:none; font-weight:600; border:1px solid #bfdbfe;">🔗 前往網頁</a>` : '';
      const titlePadding = index === 0 ? 'padding-right: 24px;' : '';

      if (item.type === 'housing') {
        return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><h3 style="color: #047857; font-size: 18px; font-weight: 800; margin: 0 0 10px 0; ${titlePadding}">🏠 ${item.houseInfo?.title || '租屋'}</h3><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">租金：</span><span style="flex: 1; color: #ea580c; font-weight: 600;">${item.houseInfo?.price}</span></div><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">地址：</span><span style="flex: 1;">${item.address}</span></div>${linkHtml}</div></div>`;
      } else if (item.type === 'custom') {
        const hoursHtml = item.customInfo?.opening_hours?.length > 0 ? `<div style="margin-top: 8px; padding: 8px; background-color: #f8fafc; border-radius: 6px;"><div style="font-weight: 600; margin-bottom: 4px; font-size: 13px;">🕒 營業時間</div>${item.customInfo.opening_hours.map(h => `<div style="font-size: 12px; color: #64748b;">${h}</div>`).join('')}</div>` : '';
        const photoHtml = item.customInfo?.photo_url ? `<img src="${item.customInfo.photo_url}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; margin-top: 12px;" />` : '';
        return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><h3 style="color: #7e22ce; font-size: 18px; font-weight: 800; margin: 0 0 10px 0; ${titlePadding}">📍 ${item.customInfo?.title}</h3><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 50px; font-weight: 600;">地址：</span><span style="flex: 1;">${item.address}</span></div>${item.memo ? `<div style="display: flex; margin-top: 4px;"><span style="width: 50px; font-weight: 600;">備註：</span><span style="flex: 1;">${item.memo}</span></div>` : ''}${hoursHtml}${photoHtml}${linkHtml}</div></div>`;
      } else {
        return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><h3 style="color: #0f172a; font-size: 18px; font-weight: 800; margin: 0 0 10px 0; ${titlePadding}">💼 ${item.jobInfo?.jobTitle}</h3><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">公司：</span><span style="flex: 1;">${item.jobInfo?.companyName}</span></div><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">地址：</span><span style="flex: 1;">${item.address}</span></div><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">薪資：</span><span style="flex: 1; color: #ea580c; font-weight: 500;">${item.memo}</span></div>${linkHtml}</div></div>`;
      }
    }).join('');
  };

  useEffect(() => {
    if (window.google && window.google.maps) { setIsMapReady(true); return; }
    window.__initGoogleMaps = () => setIsMapReady(true);
    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&libraries=marker,geometry&callback=__initGoogleMaps`;
      script.async = true; script.defer = true;
      script.onerror = () => setMapError("Google Maps 腳本下載失敗");
      document.head.appendChild(script);
    }
  }, [apiKey]);

  useEffect(() => {
    if (isMapReady && mapContainerRef.current && !mapInstanceRef.current) {
      try {
        mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: 24.1552, lng: 120.6768 }, zoom: 13, mapId: '3c73b549351a9c392d89c3bb', disableDefaultUI: true, zoomControl: true, 
        });
      } catch (err) {
        setMapError("地圖繪製發生錯誤：" + err.message);
      }
    }
  }, [isMapReady]);

  useEffect(() => {
    if (focusedItem && isMapReady && mapInstanceRef.current) {
      const lat = parseFloat(focusedItem.lat);
      const lng = parseFloat(focusedItem.lng);
      mapInstanceRef.current.panTo({ lat, lng });
      mapInstanceRef.current.setZoom(16);
      
      const targetMarker = markersRef.current.find(m => m._group && m._group.some(i => parseFloat(i.lat) === lat && parseFloat(i.lng) === lng));
      if (targetMarker && appStateRef.current.mode === 'normal') {
        targetMarker._isPinned = true;
        if (targetMarker._openPopup) targetMarker._openPopup(false);
      }
    }
  }, [focusedItem, isMapReady]); 

  useEffect(() => {
    if (appMode !== 'distance') {
      setDistPoints([]); setDistResult(null); setInfoBoxes([]);
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
      if (boundsRectRef.current) boundsRectRef.current.setMap(null);
      boundsRectRef.current = null;
    }
    if (appMode !== 'radius') {
      setRadiusCenter(null); setRadiusMeters(1000);
      if (circleRef.current) circleRef.current.setMap(null);
      circleRef.current = null;
    }
    markersRef.current.forEach(m => {
      m._isPinned = false;
      if (m._closePopup) m._closePopup();
    });
  }, [appMode]);

  // 🌟 導航距離計算與動態 BBOX 排版及資訊框
  useEffect(() => {
    if (appMode === 'distance' && distPoints.length === 2 && mapInstanceRef.current) {
      const ds = new window.google.maps.DirectionsService();
      if (!directionsRendererRef.current) {
        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
          map: mapInstanceRef.current, suppressMarkers: true, preserveViewport: true,
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

          const bounds = response.routes[0].bounds; 
          if (boundsRectRef.current) boundsRectRef.current.setMap(null);
          boundsRectRef.current = new window.google.maps.Rectangle({
            bounds: bounds, map: mapInstanceRef.current, fillColor: '#f59e0b', fillOpacity: 0.15, strokeColor: '#ea580c', strokeWeight: 2, clickable: false
          });

          // 判斷點的相對位置
          const p1 = distPoints[0];
          const p2 = distPoints[1];
          const baseP = parseFloat(p1.lat) < parseFloat(p2.lat) ? p1 : p2; // y靠下為基準點
          const secondP = baseP === p1 ? p2 : p1;
          const leftP = parseFloat(p1.lng) < parseFloat(p2.lng) ? p1 : p2;
          const rightP = leftP === p1 ? p2 : p1;

          let mapW = mapAreaWrapperRef.current ? mapAreaWrapperRef.current.offsetWidth : 800;
          let mapH = mapAreaWrapperRef.current ? mapAreaWrapperRef.current.offsetHeight : 600;

          let padTop = (mapH * 0.6);
          let padBottom = 50; 
          let padLeft = 50;
          let padRight = 50;
          
          const isBboxLeft = parseFloat(leftP.lat) > parseFloat(rightP.lat);

          if (isBboxLeft) { // BBOX 在左下
            padLeft = 50; padRight = (mapW * 0.6);
          } else { // BBOX 在右下
            padLeft = (mapW * 0.6); padRight = 50;
          }  

          mapInstanceRef.current.fitBounds(bounds, { top: padTop, bottom: padBottom, left: padLeft, right: padRight }); 

          // 🌟 產生雙視窗內容並決定數學座標
          const baseHtml = `
            <div style="position: relative; padding: 20px 20px 4px 20px; font-family: system-ui, -apple-system, sans-serif;">
              <div style="display: inline-block; padding: 4px 10px; background-color: #f1f5f9; color: #475569; border-radius: 12px; font-size: 12px; font-weight: bold; margin-bottom: 12px; border: 1px solid #e2e8f0;">📍 基準點 (起點)</div>
              ${generateItemHtmlList([baseP])}
            </div>
          `;
          const secondHtml = `
            <div style="position: relative; padding: 20px 20px 4px 20px; font-family: system-ui, -apple-system, sans-serif;">
              <div style="display: inline-block; padding: 4px 10px; background-color: #fef2f2; color: #b91c1c; border-radius: 12px; font-size: 12px; font-weight: bold; margin-bottom: 12px; border: 1px solid #fecaca;">🎯 目的地</div>
              ${generateItemHtmlList([secondP])}
            </div>
          `;

          const boxes = [];
          if (isBboxLeft) {
            boxes.push({ id: 'base', html: baseHtml, pos: 'bottom-right' });
            boxes.push({ id: 'second', html: secondHtml, pos: 'top-left' });
          } else {
            boxes.push({ id: 'base', html: baseHtml, pos: 'bottom-left' });
            boxes.push({ id: 'second', html: secondHtml, pos: 'top-right' });
          }

          // 確保地圖縮放穩定後，再顯示 UI
          setTimeout(() => {
            setInfoBoxes(boxes);

            if (!floatingPanelRef.current) return;
            const panelW = floatingPanelRef.current.offsetWidth;
            // 控制測量工具窗飛到對角
            setPanelPos({
              x: isBboxLeft ? mapW - panelW - 24 : 24, // BBOX 在左下，工具窗飛右上；反之飛左上
              y: 24 
            });
          }, 300);

        } else {
          setDistResult('❌ 無法計算兩點間的導航距離');
        }
      });
    }
  }, [distPoints, appMode]);

  useEffect(() => {
    if (!isMapReady || !window.google?.maps?.geometry || appMode !== 'radius' || !radiusCenter) return;
    const centerLatLng = new window.google.maps.LatLng(parseFloat(radiusCenter.lat), parseFloat(radiusCenter.lng));
    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({ map: mapInstanceRef.current, fillColor: '#9333ea', fillOpacity: 0.15, strokeColor: '#7e22ce', strokeWeight: 2, clickable: false });
    }
    circleRef.current.setCenter(centerLatLng);
    circleRef.current.setRadius(radiusMeters);
  }, [radiusCenter, radiusMeters, appMode, isMapReady]);

  useEffect(() => {
    if (!isMapReady || markersRef.current.length === 0) return;
    markersRef.current.forEach(m => {
      const item = m._item;
      if (!item || !m._dotDiv) return;

      const dot = m._dotDiv; 
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
        dot.style.backgroundColor = '#ef4444'; dot.style.transform = 'scale(1.25)'; m.zIndex = 1000;
      } else {
        dot.style.backgroundColor = defaultColor; dot.style.transform = 'scale(1)'; m.zIndex = m._isPinned ? 9999 : null; 
      }

      if (isOutsideRadius) {
        m.content.style.filter = 'grayscale(100%)'; m.content.style.opacity = '0.35';
      } else {
        m.content.style.filter = 'none'; m.content.style.opacity = '1';
      }
    });
  }, [appMode, distPoints, radiusCenter, radiusMeters, isMapReady, jobs]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;
      
      if (mapAreaWrapperRef.current && floatingPanelRef.current) {
        const wrapperRect = mapAreaWrapperRef.current.getBoundingClientRect();
        const panelRect = floatingPanelRef.current.getBoundingClientRect();
        
        const maxX = wrapperRect.width - panelRect.width - 5; 
        const maxY = wrapperRect.height - panelRect.height - 5;
        
        if (newX < 5) newX = 5;
        if (newX > maxX) newX = maxX;
        if (newY < 5) newY = 5;
        if (newY > maxY) newY = maxY;
      } else {
        if (newY < 0) newY = 0; 
      }
      setPanelPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp);
    }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return; 
    setIsDragging(true);
    setDragOffset({ x: e.clientX - panelPos.x, y: e.clientY - panelPos.y });
  };

  // 8. 🌟 繪製圖釘與正常模式事件
  useEffect(() => {
    if (isMapReady && mapInstanceRef.current && jobs.length > 0) {
      if (!window.google?.maps?.marker?.AdvancedMarkerElement) return; 
      const AdvancedMarkerElement = window.google.maps.marker.AdvancedMarkerElement;
      
      if (window._mapClickListener) window.google.maps.event.removeListener(window._mapClickListener);
      window._mapClickListener = mapInstanceRef.current.addListener('click', () => {
        if (appStateRef.current.mode === 'normal') {
          markersRef.current.forEach(m => { if (m._closePopup) { m._isPinned = false; m._closePopup(); } });
        }
      });

      markersRef.current.forEach(marker => { if (marker) marker.map = null; });
      markersRef.current = [];

      const groups = [];
      const MERGE_DISTANCE = 0.0015;

      jobs.forEach(job => {
        let foundGroup = groups.find(g => Math.sqrt(Math.pow(g[0].lat - job.lat, 2) + Math.pow(g[0].lng - job.lng, 2)) < MERGE_DISTANCE);
        if (foundGroup) foundGroup.push(job); else groups.push([job]);   
      });

      groups.forEach(group => {
        const firstItem = group[0];
        try {
          const markerContainer = document.createElement('div');
          markerContainer.style.position = 'relative';

          let dotColor = firstItem.type === 'housing' ? '#10b981' : (firstItem.type === 'custom' ? '#a855f7' : '#3b82f6');
          const dotDiv = document.createElement('div');
          dotDiv.style.cssText = `width: 28px; height: 28px; background-color: ${dotColor}; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 13px; transition: transform 0.2s ease, filter 0.3s ease, background-color 0.2s ease;`;
          
          if (group.length > 1) { dotDiv.textContent = group.length; } 
          else {
            const innerDot = document.createElement('div');
            innerDot.style.cssText = 'width: 6px; height: 6px; background-color: #ffffff; border-radius: 50%;';
            dotDiv.appendChild(innerDot);
          }

          const popupDiv = document.createElement('div');
          popupDiv.style.cssText = `
            position: absolute; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(226, 232, 240, 0.8); border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); display: none; z-index: 9999; opacity: 0; transition: opacity 0.2s, transform 0.2s; pointer-events: none; 
          `;

          popupDiv.innerHTML = `
            <div style="position: relative; padding: 20px 20px 4px 20px; min-width: 280px; max-width: 320px; max-height: 400px; overflow-y: auto; font-family: system-ui, -apple-system, sans-serif;">
              <button class="close-popup-btn" style="position: absolute; top: 16px; right: 16px; background: #f1f5f9; border: none; font-size: 14px; cursor: pointer; color: #475569; padding: 4px 8px; border-radius: 50%; line-height: 1; font-weight: bold;">✕</button>
              ${generateItemHtmlList(group)}
            </div>
          `;

          markerContainer.appendChild(dotDiv);
          markerContainer.appendChild(popupDiv);

          const marker = new AdvancedMarkerElement({
            position: { lat: parseFloat(firstItem.lat), lng: parseFloat(firstItem.lng) }, map: mapInstanceRef.current, content: markerContainer 
          });
          
          marker._item = firstItem; marker._group = group; marker._dotDiv = dotDiv; marker._popupDiv = popupDiv; marker._isPinned = false; 

          const openPopup = (keepOthers = false) => {
            if (!keepOthers) markersRef.current.forEach(m => { if (m !== marker && m._closePopup) { m._isPinned = false; m._closePopup(); } });
            popupDiv.style.display = 'block';
            requestAnimationFrame(() => {
              const mapRect = mapAreaWrapperRef.current.getBoundingClientRect();
              const pRect = popupDiv.getBoundingClientRect();

              let top = 'auto'; let bottom = 'calc(100% + 5px)'; let left = '50%'; let right = 'auto'; let transform = 'translateX(-50%) translateY(0)';

              if (pRect.bottom > mapRect.bottom - 5) { top = 'auto'; bottom = 'calc(100% + 5px)'; }
              if (pRect.right > mapRect.right - 5) { left = 'auto'; right = '0'; transform = 'translateY(0)'; } 
              else if (pRect.left < mapRect.left + 5) { left = '0'; right = 'auto'; transform = 'translateY(0)'; }
              if (pRect.top < mapRect.top + 80) { top = 'calc(100% + 5px)'; bottom = 'auto'; }

              popupDiv.style.top = top; popupDiv.style.bottom = bottom; popupDiv.style.left = left; popupDiv.style.right = right; popupDiv.style.transform = transform;
              popupDiv.style.opacity = '1'; popupDiv.style.pointerEvents = 'auto'; marker.zIndex = 9999; 
            });
          };

          const closePopup = () => {
            popupDiv.style.opacity = '0';
            popupDiv.style.pointerEvents = 'none';
            setTimeout(() => { if (popupDiv.style.opacity === '0') popupDiv.style.display = 'none'; }, 200);
            if (marker.zIndex === 9999) marker.zIndex = null;
          };

          marker._openPopup = openPopup; marker._closePopup = closePopup;

          popupDiv.querySelector('.close-popup-btn').addEventListener('click', (e) => { e.stopPropagation(); marker._isPinned = false; closePopup(); });
          popupDiv.addEventListener('click', (e) => e.stopPropagation());

          markerContainer.addEventListener('mouseenter', () => { if (!marker._isPinned && appStateRef.current.mode === 'normal') openPopup(true); });
          markerContainer.addEventListener('mouseleave', () => { if (!marker._isPinned && appStateRef.current.mode === 'normal') closePopup(); });

          marker.addListener('click', () => {
            const state = appStateRef.current;
            if (state.mode === 'distance') {
              if (state.distPoints.length < 2) setDistPoints([...state.distPoints, firstItem]);
              return; 
            }
            if (state.mode === 'radius') {
              setRadiusCenter(firstItem); return; 
            }
            
            if (state.mode === 'normal') {
              if (marker._isPinned) { marker._isPinned = false; closePopup(); } 
              else { marker._isPinned = true; openPopup(false); mapInstanceRef.current.panTo({ lat: parseFloat(firstItem.lat), lng: parseFloat(firstItem.lng) }); }
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
    <div ref={mapAreaWrapperRef} style={{ flex: 1, height: '100%', position: 'relative', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      
      {appMode === 'distance' && <div style={{ position: 'absolute', inset: 0, border: '6px solid #3b82f6', pointerEvents: 'none', zIndex: 15, transition: 'all 0.3s' }} />}
      {appMode === 'radius' && <div style={{ position: 'absolute', inset: 0, border: '6px solid #9333ea', pointerEvents: 'none', zIndex: 15, transition: 'all 0.3s' }} />}

      {/* 🌟 距離模式專屬：雙點動態資訊框，四角絕對對齊演算法 */}
      {infoBoxes.map(box => {
        let boxStyle = {
          position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          zIndex: 18, width: '320px', maxHeight: '400px', overflowY: 'auto',
          animation: 'fadeIn 0.3s ease-out forwards'
        };

        // 🌟 直接將四角鎖死在距離邊緣 24px 的絕對位置上，完美與工具框對齊！
        if (box.pos === 'bottom-right') {
          boxStyle.right = '24px'; boxStyle.bottom = '24px';
        } else if (box.pos === 'top-left') {
          boxStyle.left = '24px'; boxStyle.top = '24px';
        } else if (box.pos === 'bottom-left') {
          boxStyle.left = '24px'; boxStyle.bottom = '24px';
        } else if (box.pos === 'top-right') {
          boxStyle.right = '24px'; boxStyle.top = '24px';
        }

        return <div key={box.id} style={boxStyle} dangerouslySetInnerHTML={{ __html: box.html }} />;
      })}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* 測距操作面板 */}
      {appMode === 'distance' && (
        <div ref={floatingPanelRef} style={{ position: 'absolute', top: `${panelPos.y}px`, left: `${panelPos.x}px`, backgroundColor: 'white', padding: '20px 28px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', minWidth: '340px', userSelect: isDragging ? 'none' : 'auto', transition: 'left 0.4s cubic-bezier(0.16, 1, 0.3, 1), top 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div onMouseDown={handleMouseDown} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '8px', cursor: isDragging ? 'grabbing' : 'grab' }}>
            <h3 style={{ fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e3a8a', fontSize: '18px' }}><Route size={22} color="#2563eb"/> 兩點導航測距</h3>
            <button onClick={() => setAppMode('normal')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={22}/></button>
          </div>
          {distPoints.length === 0 && <p style={{ margin: 0, color: '#475569', fontSize: '15px', fontWeight: '500' }}>👆 請點選地圖上的「第一個」圖標</p>}
          {distPoints.length === 1 && <p style={{ margin: 0, color: '#475569', fontSize: '15px', fontWeight: '500' }}>✌️ 請點選地圖上的「第二個」圖標</p>}
          {distPoints.length === 2 && !distResult && <Loader2 className="animate-spin" color="#2563eb"/>}
          {distResult && <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', color: '#1e3a8a', fontWeight: 'bold', fontSize: '16px', border: '1px solid #bfdbfe', width: '100%', textAlign: 'center' }}>{distResult}</div>}
          {distPoints.length === 2 && (
            <button 
              onClick={() => { 
                markersRef.current.forEach(m => {
                  m._isPinned = false;
                  if (m._closePopup) m._closePopup();
                });
                setDistPoints([]); 
                setDistResult(null); 
                if(directionsRendererRef.current) directionsRendererRef.current.setMap(null); 
                directionsRendererRef.current = null; 
                if(boundsRectRef.current) boundsRectRef.current.setMap(null);
                boundsRectRef.current = null;
                setPanelPos({ x: 24, y: 24 });
              }} 
              style={{ marginTop: '8px', padding: '8px 24px', border: 'none', borderRadius: '8px', background: '#e2e8f0', color: '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
            >
              重新測量
            </button>
          )}
        </div>
      )}

      {/* 範圍探索面板 */}
      {appMode === 'radius' && (
        <div ref={floatingPanelRef} style={{ position: 'absolute', top: `${panelPos.y}px`, left: `${panelPos.x}px`, backgroundColor: 'white', padding: '20px 28px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '380px', userSelect: isDragging ? 'none' : 'auto' }}>
          <div onMouseDown={handleMouseDown} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'grab' }}>
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