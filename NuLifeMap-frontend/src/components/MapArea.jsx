import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Route, Target, X, AlertCircle, MapPin } from 'lucide-react';

export default function MapArea({ 
  jobs, 
  appMode, 
  setAppMode, 
  focusedItem,
  onOpenJobDetail,
  radiusCenter,
  setRadiusCenter,
  radiusMeters,
  setRadiusMeters,
}) {
  const [mapError, setMapError] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);
  
  const [distPoints, setDistPoints] = useState([]); 
  const [distResult, setDistResult] = useState(null);
  const [infoBoxes, setInfoBoxes] = useState([]); 

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]); 
  const directionsRendererRef = useRef(null);
  const circleRef = useRef(null);
  const boundsRectRef = useRef(null); 

  const mapAreaWrapperRef = useRef(null);
  const floatingPanelRef = useRef(null);
  const projectionOverlayRef = useRef(null);
  const distLayoutRef = useRef(null);
  const distBoundsListenerRef = useRef(null);
  const distRepositionRafRef = useRef(null);

  const [panelPos, setPanelPos] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; 

  const appStateRef = useRef({ mode: 'normal', distPoints: [], radiusCenter: null });
  const onOpenJobDetailRef = useRef(onOpenJobDetail);
  const autoCenteredForRef = useRef(null);
  useEffect(() => {
    appStateRef.current = { mode: appMode, distPoints, radiusCenter };
  }, [appMode, distPoints, radiusCenter]);
  useEffect(() => {
    onOpenJobDetailRef.current = onOpenJobDetail;
  }, [onOpenJobDetail]);

  /** 找出點位最密集網格，回傳該區中心與點集合 */
  const getDensestCluster = (items, cellSize = 0.06) => {
    const points = (items || [])
      .map((j) => ({ lat: parseFloat(j.lat), lng: parseFloat(j.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!points.length) return null;

    const cells = new Map();
    for (const p of points) {
      const key = `${Math.floor(p.lat / cellSize)},${Math.floor(p.lng / cellSize)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(p);
    }

    let densest = points;
    for (const arr of cells.values()) {
      if (arr.length > densest.length) densest = arr;
    }

    const center = {
      lat: densest.reduce((sum, p) => sum + p.lat, 0) / densest.length,
      lng: densest.reduce((sum, p) => sum + p.lng, 0) / densest.length,
    };
    return { center, points: densest };
  };

  const escapePopupText = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const closePopupBtnHtml = `<button type="button" class="close-popup-btn" style="flex-shrink: 0; width: 28px; height: 28px; background: #f1f5f9; border: none; font-size: 14px; cursor: pointer; color: #475569; border-radius: 50%; line-height: 1; font-weight: bold; display: inline-flex; align-items: center; justify-content: center;">✕</button>`;

  const ensurePopupMarqueeStyles = () => {
    if (document.getElementById('nulife-popup-marquee-style')) return;
    const style = document.createElement('style');
    style.id = 'nulife-popup-marquee-style';
    style.textContent = `
      @keyframes nulife-popup-marquee {
        0%, 12% { transform: translateX(0); }
        88%, 100% { transform: translateX(var(--marquee-dx, 0px)); }
      }
      .popup-title-track.is-marquee {
        animation: nulife-popup-marquee 7s ease-in-out infinite alternate;
      }
    `;
    document.head.appendChild(style);
  };

  const setupPopupTitleMarquee = (popupRoot) => {
    ensurePopupMarqueeStyles();
    popupRoot.querySelectorAll('.popup-title-marquee').forEach((wrap) => {
      const track = wrap.querySelector('.popup-title-track');
      if (!track) return;
      track.classList.remove('is-marquee');
      track.style.removeProperty('--marquee-dx');
      const overflow = track.scrollWidth - wrap.clientWidth;
      if (overflow > 2) {
        track.style.setProperty('--marquee-dx', `${-overflow}px`);
        track.classList.add('is-marquee');
      }
    });
  };

  const ensureProjectionOverlay = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return null;
    if (projectionOverlayRef.current) {
      if (projectionOverlayRef.current.getMap() !== map) {
        projectionOverlayRef.current.setMap(map);
      }
      return projectionOverlayRef.current;
    }
    const overlay = new window.google.maps.OverlayView();
    overlay.onAdd = function onAdd() {};
    overlay.draw = function draw() {};
    overlay.onRemove = function onRemove() {};
    overlay.setMap(map);
    projectionOverlayRef.current = overlay;
    return overlay;
  };

  const latLngToContainerPixelSync = (latLng) => {
    const overlay = ensureProjectionOverlay();
    const proj = overlay?.getProjection?.();
    if (!proj) return null;
    return proj.fromLatLngToContainerPixel(latLng);
  };

  const clearDistanceOverlayTracking = () => {
    if (distBoundsListenerRef.current) {
      window.google?.maps?.event?.removeListener(distBoundsListenerRef.current);
      distBoundsListenerRef.current = null;
    }
    if (distRepositionRafRef.current) {
      cancelAnimationFrame(distRepositionRafRef.current);
      distRepositionRafRef.current = null;
    }
    distLayoutRef.current = null;
  };

  const getMarkerTitle = (item) => {
    if (!item) return '未命名地點';
    if (item.type === 'job') {
      return `${item.jobInfo?.companyName || '未知公司'} - ${item.jobInfo?.jobTitle || '未命名職缺'}`;
    }
    if (item.type === 'housing') return item.houseInfo?.title || '未命名租屋';
    return item.customInfo?.title || '未命名地點';
  };

  const getMarkerSubline = (item) => {
    if (!item) return '';
    if (item.type === 'job') {
      const salaryRaw = item.jobInfo?.salary || item.memo || '';
      return String(salaryRaw).replace(/^薪資[：:]\s*/, '') || item.address || '';
    }
    if (item.type === 'housing') return item.houseInfo?.price || item.address || '';
    return item.address || item.memo || '';
  };

  const repositionDistanceOverlays = () => {
    const layout = distLayoutRef.current;
    const bounds = boundsRectRef.current?.getBounds?.();
    const wrapper = mapAreaWrapperRef.current;
    if (!layout || !bounds || !wrapper) return;

    const swPx = latLngToContainerPixelSync(bounds.getSouthWest());
    const nePx = latLngToContainerPixelSync(bounds.getNorthEast());
    if (!swPx || !nePx) return;

    const viewW = wrapper.offsetWidth;
    const panelW = floatingPanelRef.current?.offsetWidth || 320;
    const edge = 24;
    const rectOnLeft = layout.rectOnLeft;

    // 兩點測距結果卡：固定靠上，並依矩形左右自動選左上／右上，避免壓到範圍框
    setPanelPos({
      x: rectOnLeft ? Math.max(edge, viewW - panelW - edge) : edge,
      y: edge,
    });
  };

  const scheduleDistanceOverlayReposition = () => {
    if (distRepositionRafRef.current) cancelAnimationFrame(distRepositionRafRef.current);
    distRepositionRafRef.current = requestAnimationFrame(() => {
      distRepositionRafRef.current = null;
      repositionDistanceOverlays();
    });
  };

  const generateItemHtmlList = (group) => {
    return group.map((item, index) => {
      const sourceUrl = item.houseInfo?.sourceUrl || item.jobInfo?.sourceUrl || item.customInfo?.website;
      const linkHtml = sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:6px 12px; background-color:#eff6ff; color:#2563eb; border-radius:6px; font-size:13px; text-decoration:none; font-weight:600; border:1px solid #bfdbfe;">🔗 前往網頁</a>` : '';
      const closeBtn = index === 0 ? closePopupBtnHtml : '';

      if (item.type === 'housing') {
        const detailBtn = `<button type="button" class="open-job-detail-btn" data-job-id="${item._id}" style="display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:6px 12px; background-color:#eff6ff; color:#2563eb; border-radius:6px; font-size:13px; font-weight:600; border:1px solid #bfdbfe; cursor:pointer; font-family:inherit;">詳細資訊</button>`;
        return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;"><div class="popup-title-marquee" style="flex:1; min-width:0; overflow:hidden; white-space:nowrap;"><span class="popup-title-track" style="display:inline-block; white-space:nowrap; color:#047857; font-size:18px; font-weight:800; line-height:1.35;">🏠 ${escapePopupText(item.houseInfo?.title || '租屋')}</span></div>${closeBtn}</div><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">租金：</span><span style="flex: 1; color: #ea580c; font-weight: 600;">${escapePopupText(item.houseInfo?.price)}</span></div><div style="display: flex; margin-bottom: 4px;"><span style="width: 80px; font-weight: 600;">地址：</span><span style="flex: 1;">${escapePopupText(item.address)}</span></div>${detailBtn}</div></div>`;
      } else if (item.type === 'custom') {
        const hoursHtml = item.customInfo?.opening_hours?.length > 0 ? `<div style="margin-top: 8px; padding: 8px; background-color: #f8fafc; border-radius: 6px;"><div style="font-weight: 600; margin-bottom: 4px; font-size: 13px;">🕒 營業時間</div>${item.customInfo.opening_hours.map(h => `<div style="font-size: 12px; color: #64748b;">${escapePopupText(h)}</div>`).join('')}</div>` : '';
        const photoHtml = item.customInfo?.photo_url ? `<img src="${escapePopupText(item.customInfo.photo_url)}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; margin-top: 12px;" />` : '';
        return `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; text-align: left;"><div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;"><h3 style="color: #7e22ce; font-size: 18px; font-weight: 800; margin: 0; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${escapePopupText(item.customInfo?.title)}</h3>${closeBtn}</div><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; margin-bottom: 4px;"><span style="width: 50px; font-weight: 600;">地址：</span><span style="flex: 1;">${escapePopupText(item.address)}</span></div>${item.memo ? `<div style="display: flex; margin-top: 4px;"><span style="width: 50px; font-weight: 600;">備註：</span><span style="flex: 1;">${escapePopupText(item.memo)}</span></div>` : ''}${hoursHtml}${photoHtml}${linkHtml}</div></div>`;
      } else {
        const jobTitle = `${item.jobInfo?.companyName || '未知公司'} - ${item.jobInfo?.jobTitle || '未命名職缺'}`;
        const salaryRaw = item.jobInfo?.salary || item.memo || '未提供';
        const salary = String(salaryRaw).replace(/^薪資[：:]\s*/, '');
        const detailBtn = `<button type="button" class="open-job-detail-btn" data-job-id="${item._id}" style="display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:6px 12px; background-color:#eff6ff; color:#2563eb; border-radius:6px; font-size:13px; font-weight:600; border:1px solid #bfdbfe; cursor:pointer; font-family:inherit;">詳細資訊</button>`;
        const jobDivider = index < group.length - 1 ? 'margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1;' : 'margin-bottom: 0; padding-bottom: 12px;';
        return `<div style="${jobDivider} text-align: left;"><div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;"><div class="popup-title-marquee" style="flex:1; min-width:0; overflow:hidden; white-space:nowrap;"><span class="popup-title-track" style="display:inline-block; white-space:nowrap; color:#0f172a; font-size:18px; font-weight:800; line-height:1.35;">${escapePopupText(jobTitle)}</span></div>${closeBtn}</div><div style="color: #475569; font-size: 14px; line-height: 1.8;"><div style="display: flex; gap: 6px; margin-bottom: 4px;"><span style="font-weight: 600; flex-shrink: 0;">地址：</span><span style="min-width: 0;">${escapePopupText(item.address || item.jobInfo?.workLocation || '未提供')}</span></div><div style="display: flex; gap: 6px; margin-bottom: 4px;"><span style="font-weight: 600; flex-shrink: 0;">薪資：</span><span style="min-width: 0; color: #ea580c; font-weight: 500;">${escapePopupText(salary)}</span></div>${detailBtn}</div></div>`;
      }
    }).join('');
  };

  // 測距／範圍：開啟時都移到畫面上方水平置中
  useEffect(() => {
    const moveToTopCenter = () => {
      if (mapAreaWrapperRef.current && floatingPanelRef.current) {
        const mapW = mapAreaWrapperRef.current.offsetWidth;
        const panelW = floatingPanelRef.current.offsetWidth;
        setPanelPos({ x: Math.max(24, (mapW - panelW) / 2), y: 24 });
      }
    };

    if (appMode === 'distance' && distPoints.length === 0) {
      setTimeout(moveToTopCenter, 50);
    } else if (appMode === 'radius') {
      setTimeout(moveToTopCenter, 50);
    }
  }, [appMode, distPoints.length, radiusCenter]);

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
          center: { lat: 24.1552, lng: 120.6768 }, 
          zoom: 13, 
          mapId: '3c73b549351a9c392d89c3bb',
          disableDefaultUI: true, 
          zoomControl: true, 
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

  // 登入後（每位使用者一次）：地圖對準點位最密集區域中心
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !window.google?.maps) return;
    if (!jobs?.length) {
      autoCenteredForRef.current = null;
      return;
    }
    if (focusedItem) return;

    const userKey = String(jobs[0]?.userId || 'default');
    if (autoCenteredForRef.current === userKey) return;

    const cluster = getDensestCluster(jobs);
    if (!cluster) return;

    autoCenteredForRef.current = userKey;
    const map = mapInstanceRef.current;
    const bounds = new window.google.maps.LatLngBounds();
    cluster.points.forEach((p) => bounds.extend(p));

    if (cluster.points.length === 1) {
      map.setCenter(cluster.center);
      map.setZoom(14);
      return;
    }

    map.fitBounds(bounds, { top: 80, bottom: 80, left: 80, right: 80 });
    window.google.maps.event.addListenerOnce(map, 'idle', () => {
      const zoom = map.getZoom();
      if (typeof zoom === 'number' && zoom > 15) map.setZoom(15);
      if (typeof zoom === 'number' && zoom < 11) map.setZoom(11);
    });
  }, [jobs, isMapReady, focusedItem]); 

  useEffect(() => {
    if (appMode !== 'distance') {
      setDistPoints([]); setDistResult(null); setInfoBoxes([]);
      clearDistanceOverlayTracking();
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
  }, [appMode, setRadiusCenter, setRadiusMeters]);

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
          setDistResult({
            distance: leg.distance.text,
            duration: leg.duration.text,
          });

          const bounds = response.routes[0].bounds; 
          if (boundsRectRef.current) boundsRectRef.current.setMap(null);
          boundsRectRef.current = new window.google.maps.Rectangle({
            bounds: bounds, map: mapInstanceRef.current, fillColor: '#f59e0b', fillOpacity: 0.15, strokeColor: '#ea580c', strokeWeight: 2, clickable: false
          });

          const startP = distPoints[0];
          const endP = distPoints[1];
          // 終點偏西 → 矩形偏左，結果卡靠右上；反之靠左上
          const rectOnLeft = parseFloat(endP.lng) < parseFloat(startP.lng);

          let mapW = mapAreaWrapperRef.current ? mapAreaWrapperRef.current.offsetWidth : 800;

          // 上方預留卡片高度，左右預留卡片寬度（對側）
          const padTop = 280;
          const padBottom = 56;
          const padLeft = rectOnLeft ? 56 : Math.min(360, mapW * 0.42);
          const padRight = rectOnLeft ? Math.min(360, mapW * 0.42) : 56;

          mapInstanceRef.current.fitBounds(bounds, { top: padTop, bottom: padBottom, left: padLeft, right: padRight });

          setInfoBoxes([]);
          clearDistanceOverlayTracking();
          distLayoutRef.current = { rectOnLeft };
          ensureProjectionOverlay();
          // 先立刻靠上角，等 fitBounds 後再依矩形微調
          const panelW = floatingPanelRef.current?.offsetWidth || 320;
          const edge = 24;
          setPanelPos({
            x: rectOnLeft ? Math.max(edge, mapW - panelW - edge) : edge,
            y: edge,
          });
          scheduleDistanceOverlayReposition();
          distBoundsListenerRef.current = mapInstanceRef.current.addListener('bounds_changed', scheduleDistanceOverlayReposition);

        } else {
          setDistResult({ error: '無法計算兩點間的導航距離' });
        }
      });
    }
  }, [distPoints, appMode]);

  useEffect(() => {
    if (!infoBoxes.length) return;
    const roots = mapAreaWrapperRef.current?.querySelectorAll('[data-info-box="1"]');
    if (!roots) return;
    roots.forEach((root) => {
      setupPopupTitleMarquee(root);
      root.querySelectorAll('.open-job-detail-btn').forEach((btn) => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const jobId = btn.getAttribute('data-job-id');
          const jobItem = jobs.find((g) => String(g._id) === String(jobId));
          if (jobItem && onOpenJobDetailRef.current) onOpenJobDetailRef.current(jobItem);
        });
      });
    });
  }, [infoBoxes, jobs]);

  useEffect(() => {
    if (!isMapReady || !window.google?.maps?.geometry || appMode !== 'radius' || !radiusCenter) return;
    const centerLatLng = new window.google.maps.LatLng(parseFloat(radiusCenter.lat), parseFloat(radiusCenter.lng));
    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({ map: mapInstanceRef.current, fillColor: '#9333ea', fillOpacity: 0.15, strokeColor: '#7e22ce', strokeWeight: 2, clickable: false });
    }
    circleRef.current.setCenter(centerLatLng);
    circleRef.current.setRadius(radiusMeters);
  }, [radiusCenter, radiusMeters, appMode, isMapReady]);

  // 🌟 修改一：圖釘顏色與灰階判定
  useEffect(() => {
    if (!isMapReady || markersRef.current.length === 0) return;
    markersRef.current.forEach(m => {
      const item = m._item;
      if (!item || !m._dotDiv) return;

      const dot = m._dotDiv; 
      let defaultColor = item.type === 'housing' ? '#10b981' : (item.type === 'custom' ? '#a855f7' : '#3b82f6'); 
      let isSelected = false;
      let isGrayedOut = false; // 🌟 統一管理灰階狀態

      if (appMode === 'distance') {
        isSelected = distPoints.some(p => parseFloat(p.lat) === parseFloat(item.lat) && parseFloat(p.lng) === parseFloat(item.lng));
        // 🎯 需求 2: 測距模式選滿兩個點後，未選取的變成灰色
        if (distPoints.length === 2 && !isSelected) {
          isGrayedOut = true;
        }
      } else if (appMode === 'radius') {
        if (radiusCenter) {
          isSelected = (parseFloat(radiusCenter.lat) === parseFloat(item.lat) && parseFloat(radiusCenter.lng) === parseFloat(item.lng));
          const centerLatLng = new window.google.maps.LatLng(parseFloat(radiusCenter.lat), parseFloat(radiusCenter.lng));
          const mLatLng = new window.google.maps.LatLng(parseFloat(item.lat), parseFloat(item.lng));
          const dist = window.google.maps.geometry.spherical.computeDistanceBetween(centerLatLng, mLatLng);
          if (dist > radiusMeters) isGrayedOut = true;
        }
      }

      m._isGrayedOut = isGrayedOut; // 🌟 存入 marker 物件中，讓懸浮事件判斷用

      if (isSelected) {
        dot.style.backgroundColor = '#ef4444'; dot.style.transform = 'scale(1.25)'; m.zIndex = 1000;
      } else {
        dot.style.backgroundColor = defaultColor; dot.style.transform = 'scale(1)'; m.zIndex = m._isPinned ? 9999 : null; 
      }

      if (isGrayedOut) {
        m.content.style.filter = 'grayscale(100%)'; m.content.style.opacity = '0.35';
      } else {
        m.content.style.filter = 'none'; m.content.style.opacity = '1';
      }
    });
  }, [appMode, distPoints, radiusCenter, radiusMeters, isMapReady, jobs]);

  // ==========================================
  // 🌟 1. 拖曳監聽 (乾淨版)
  // ==========================================
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      let newX = e.clientX - dragOffset.x;
      let newY = e.clientY - dragOffset.y;
      
      if (mapAreaWrapperRef.current && floatingPanelRef.current) {
        const wrapperRect = mapAreaWrapperRef.current.getBoundingClientRect();
        const panelRect = floatingPanelRef.current.getBoundingClientRect();
        const edge = 24;
        const maxX = wrapperRect.width - panelRect.width - edge; 
        const maxY = wrapperRect.height - panelRect.height - edge;
        if (newX < edge) newX = edge;
        if (newX > maxX) newX = maxX;
        if (newY < edge) newY = edge;
        if (newY > maxY) newY = maxY;
      } else {
        if (newY < 0) newY = 0; 
      }
      setPanelPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);
    
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove); 
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => { 
      window.removeEventListener('mousemove', handleMouseMove); 
      window.removeEventListener('mouseup', handleMouseUp); 
    };
  }, [isDragging, dragOffset]);

  // ==========================================
  // 🌟 2. ResizeObserver 自動推擠防護罩
  // ==========================================
  useEffect(() => {
    if (!mapAreaWrapperRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (mapAreaWrapperRef.current && floatingPanelRef.current) {
        const wrapperRect = mapAreaWrapperRef.current.getBoundingClientRect();
        const panelRect = floatingPanelRef.current.getBoundingClientRect();
        const edge = 24;
        const maxX = wrapperRect.width - panelRect.width - edge;

        setPanelPos(prev => {
          if (prev.x > maxX) {
            return { ...prev, x: maxX < edge ? edge : maxX };
          }
          return prev;
        });
      }
    });

    resizeObserver.observe(mapAreaWrapperRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // ==========================================
  // 🌟 3. 滑鼠按下事件 
  // ==========================================
  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return; 
    setIsDragging(true);
    setDragOffset({ x: e.clientX - panelPos.x, y: e.clientY - panelPos.y });
  };

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
          popupDiv.style.cssText = `position: absolute; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(226, 232, 240, 0.8); border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); display: none; z-index: 9999; opacity: 0; transition: opacity 0.2s, transform 0.2s; pointer-events: none;`;
          popupDiv.innerHTML = `<div style="position: relative; padding: 16px 16px 4px 16px; min-width: 280px; max-width: 320px; max-height: 400px; overflow-y: auto; font-family: system-ui, -apple-system, sans-serif;">${generateItemHtmlList(group)}</div>`;

          markerContainer.appendChild(dotDiv);
          markerContainer.appendChild(popupDiv);

          const marker = new AdvancedMarkerElement({ position: { lat: parseFloat(firstItem.lat), lng: parseFloat(firstItem.lng) }, map: mapInstanceRef.current, content: markerContainer, gmpClickable: true});
          marker._item = firstItem; marker._group = group; marker._dotDiv = dotDiv; marker._popupDiv = popupDiv; marker._isPinned = false; 

          const openPopup = (keepOthers = false) => {
            if (!keepOthers) markersRef.current.forEach(m => { if (m !== marker && m._closePopup) { m._isPinned = false; m._closePopup(); } });
            popupDiv.style.display = 'block';
            requestAnimationFrame(() => {
              setupPopupTitleMarquee(popupDiv);
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
            popupDiv.style.opacity = '0'; popupDiv.style.pointerEvents = 'none';
            setTimeout(() => { if (popupDiv.style.opacity === '0') popupDiv.style.display = 'none'; }, 200);
            if (marker.zIndex === 9999) marker.zIndex = null;
          };

          marker._openPopup = openPopup; marker._closePopup = closePopup;

          popupDiv.querySelector('.close-popup-btn').addEventListener('click', (e) => { e.stopPropagation(); marker._isPinned = false; closePopup(); });
          popupDiv.querySelectorAll('.open-job-detail-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const jobId = btn.getAttribute('data-job-id');
              const jobItem = group.find((g) => String(g._id) === String(jobId));
              if (jobItem && onOpenJobDetailRef.current) onOpenJobDetailRef.current(jobItem);
            });
          });
          popupDiv.addEventListener('click', (e) => e.stopPropagation());

          // 🌟 優化：智慧懸停邏輯 (滿足需求 4)
          markerContainer.addEventListener('mouseenter', () => { 
            if (marker._isPinned) return;
            if (marker._isGrayedOut) return; 
            
            // 🎯 如果是測距模式且已經選滿 2 個點，暫時關閉懸停顯示
            const state = appStateRef.current;
            if (state.mode === 'distance' && state.distPoints.length === 2) return;

            openPopup(true); 
          });
          
          markerContainer.addEventListener('mouseleave', () => { 
            if (!marker._isPinned) closePopup(); 
          });
          
          markerContainer.addEventListener('mouseleave', () => { 
            if (!marker._isPinned) closePopup(); 
          });
          marker.addListener('gmp-click', () => {
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
      
      {/* 🌟 終極暴力撐開地圖容器 */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '500px', position: 'absolute', inset: 0, zIndex: 1 }} />
      
      {appMode === 'distance' && <div style={{ position: 'absolute', inset: 0, border: '6px solid #3b82f6', pointerEvents: 'none', zIndex: 15, transition: 'all 0.3s' }} />}
      {appMode === 'radius' && <div style={{ position: 'absolute', inset: 0, border: '6px solid #9333ea', pointerEvents: 'none', zIndex: 15, transition: 'all 0.3s' }} />}

      {infoBoxes.map(box => {
        const boxStyle = {
          position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          zIndex: 18, width: '320px', maxHeight: '400px', overflowY: 'auto', animation: 'fadeIn 0.3s ease-out forwards',
          ...(box.coords?.left != null ? { left: `${box.coords.left}px` } : {}),
          ...(box.coords?.right != null ? { right: `${box.coords.right}px` } : {}),
          ...(box.coords?.top != null ? { top: `${box.coords.top}px` } : {}),
          ...(box.coords?.bottom != null ? { bottom: `${box.coords.bottom}px` } : {}),
        };
        return <div key={box.id} data-info-box="1" style={boxStyle} dangerouslySetInnerHTML={{ __html: box.html }} />;
      })}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* 測距：起點／終點／結果整合為同一張卡 */}
      {appMode === 'distance' && (
        <div
          ref={floatingPanelRef}
          style={{
            position: 'absolute',
            top: `${panelPos.y}px`,
            left: `${panelPos.x}px`,
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '320px',
            maxHeight: 'min(520px, calc(100% - 48px))',
            overflowY: 'auto',
            userSelect: isDragging ? 'none' : 'auto',
            transition: isDragging ? 'none' : 'left 0.35s cubic-bezier(0.16, 1, 0.3, 1), top 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div
            onMouseDown={handleMouseDown}
            style={{ position: 'relative', display: 'flex', justifyContent: 'center', width: '100%', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <h3 style={{ fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', color: '#1e3a8a', fontSize: '16px' }}>
              <Route size={20} color="#2563eb" /> 兩點測距
            </h3>
            <button
              onClick={() => setAppMode('normal')}
              style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
            >
              <X size={20} />
            </button>
          </div>

          {distPoints.length < 2 && (
            <p style={{ margin: 0, color: '#475569', fontSize: '14px', fontWeight: 500, textAlign: 'center' }}>
              選擇兩個圖標
            </p>
          )}

          {distPoints[0] && (
            <div style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb', marginBottom: '6px' }}>起點</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: 1.4, wordBreak: 'break-word' }}>
                {getMarkerTitle(distPoints[0])}
              </div>
              <div style={{ marginTop: '4px', fontSize: '13px', color: '#475569', lineHeight: 1.4 }}>
                {getMarkerSubline(distPoints[0])}
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{distPoints[0].address}</div>
              {(distPoints[0].type === 'job' || distPoints[0].type === 'housing') && (
                <button
                  type="button"
                  onClick={() => onOpenJobDetailRef.current?.(distPoints[0])}
                  style={{ marginTop: '8px', border: '1px solid #bfdbfe', backgroundColor: '#fff', color: '#2563eb', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  詳細資訊
                </button>
              )}
            </div>
          )}

          {distPoints[1] && (
            <div style={{ border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', marginBottom: '6px' }}>終點</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: 1.4, wordBreak: 'break-word' }}>
                {getMarkerTitle(distPoints[1])}
              </div>
              <div style={{ marginTop: '4px', fontSize: '13px', color: '#475569', lineHeight: 1.4 }}>
                {getMarkerSubline(distPoints[1])}
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{distPoints[1].address}</div>
              {(distPoints[1].type === 'job' || distPoints[1].type === 'housing') && (
                <button
                  type="button"
                  onClick={() => onOpenJobDetailRef.current?.(distPoints[1])}
                  style={{ marginTop: '8px', border: '1px solid #bbf7d0', backgroundColor: '#fff', color: '#15803d', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  詳細資訊
                </button>
              )}
            </div>
          )}

          {distPoints.length === 2 && !distResult && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <Loader2 className="animate-spin" color="#2563eb" size={24} />
            </div>
          )}

          {distResult && (
            <div style={{ backgroundColor: '#eff6ff', padding: '12px', borderRadius: '12px', color: '#1e3a8a', fontWeight: 'bold', fontSize: '14px', border: '1px solid #bfdbfe', width: '100%', textAlign: 'center', lineHeight: '1.6', boxSizing: 'border-box' }}>
              {distResult.error ? (
                distResult.error
              ) : (
                <>
                  <div>導航距離：{distResult.distance}</div>
                  <div>預計時間：{distResult.duration}</div>
                </>
              )}
            </div>
          )}

          {distPoints.length === 2 && (
            <button
              onClick={() => {
                markersRef.current.forEach((m) => {
                  m._isPinned = false;
                  if (m._closePopup) m._closePopup();
                });
                setDistPoints([]);
                setDistResult(null);
                setInfoBoxes([]);
                clearDistanceOverlayTracking();
                if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
                directionsRendererRef.current = null;
                if (boundsRectRef.current) boundsRectRef.current.setMap(null);
                boundsRectRef.current = null;
              }}
              style={{ padding: '8px', width: '100%', border: 'none', borderRadius: '8px', background: '#e2e8f0', color: '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
            >
              重新測量
            </button>
          )}
        </div>
      )}

      {appMode === 'radius' && (
        <div ref={floatingPanelRef} style={{ position: 'absolute', top: `${panelPos.y}px`, left: `${panelPos.x}px`, backgroundColor: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '14px', width: '288px', userSelect: isDragging ? 'none' : 'auto', transition: 'left 0.4s cubic-bezier(0.16, 1, 0.3, 1), top 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div onMouseDown={handleMouseDown} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'grab' }}>
            <h3 style={{ fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', color: '#581c87', fontSize: '16px' }}><Target size={20} color="#9333ea"/> 範圍探索</h3>
            <button onClick={() => setAppMode('normal')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding: 0 }}><X size={20}/></button>
          </div>
          {radiusCenter && (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', backgroundColor: '#faf5ff', padding: '10px', borderRadius: '8px', fontSize: '13px', color: '#6b21a8', border: '1px solid #e9d5ff', wordBreak: 'break-all' }}>
                <MapPin size={16} style={{ flexShrink: 0, marginTop: '2px' }}/> <div><b>中心：</b><br/>{radiusCenter.customInfo?.title || radiusCenter.houseInfo?.title || radiusCenter.jobInfo?.jobTitle || `${radiusCenter.jobInfo?.companyName || ''}`.trim() || '已選擇'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>半徑 <span style={{ backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '16px', fontSize: '12px', color: '#475569' }}>{radiusMeters >= 1000 ? (radiusMeters/1000).toFixed(1) + ' km' : radiusMeters + ' m'}</span></label>
                <input type="range" min="100" max="10000" step="100" value={radiusMeters} onChange={(e) => setRadiusMeters(Number(e.target.value))} style={{ cursor: 'pointer', accentColor: '#9333ea', height: '6px', width: '100%' }} />
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