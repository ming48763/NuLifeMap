import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown, ChevronRight, ChevronLeft, ExternalLink, Clock, Plus, Route, Target, LogOut, Trash2, NotebookPen, Settings } from 'lucide-react';
import { lightTheme } from '../theme';

function distanceMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const lat1 = parseFloat(a.lat);
  const lng1 = parseFloat(a.lng);
  const lat2 = parseFloat(b.lat);
  const lng2 = parseFloat(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export default function Sidebar({ 
  user,        // 🌟 接收使用者資料
  onLogout,    // 🌟 接收登出函式
  onOpenSettings,
  jobs, 
  loadingData, 
  appMode, 
  setAppMode,
  radiusCenter = null,
  radiusMeters = 1000,
  onOpenModal, 
  onFocusItem,
  onDeleteItem, // 🌟 2. 接收從 App.jsx 傳來的刪除函式
  sidebarWidth, 
  setSidebarWidth, 
  isCollapsed, 
  setIsCollapsed,
  theme = lightTheme,
}) {
  const [openCategory, setOpenCategory] = useState('housing');
  const [openItemIdx, setOpenItemIdx] = useState(null);
  const [showNotesNotice, setShowNotesNotice] = useState(false); 

  const isResizing = useRef(false);
  const [willCollapse, setWillCollapse] = useState(false); // 控制畫面提示
  const willCollapseRef = useRef(false); // 讓事件即時讀取狀態

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; 
  }, []);

  const resize = useCallback((e) => {
    if (isResizing.current) {
      let newWidth = e.clientX;
      if (newWidth > 450) newWidth = 450; 
      
      // 🎯 當小於 260 時，不立刻收合，而是進入「準備收合」狀態
      if (newWidth < 260) {
        if (!willCollapseRef.current) {
          willCollapseRef.current = true;
          setWillCollapse(true);
        }
        setSidebarWidth(260); // 視覺上鎖定在 260px，避免真的縮到 0
      } else {
        if (willCollapseRef.current) {
          willCollapseRef.current = false;
          setWillCollapse(false);
        }
        setSidebarWidth(newWidth);
      }
    }
  }, [setSidebarWidth]);

  // 🎯 使用者「放開滑鼠」的那一刻，才決定要不要收合
  const stopResizing = useCallback(() => {
    if (isResizing.current) {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';

      if (willCollapseRef.current) {
        setIsCollapsed(true);
        setSidebarWidth(420); // 記憶原本寬度
        willCollapseRef.current = false;
        setWillCollapse(false);
      }
    }
  }, [setIsCollapsed, setSidebarWidth]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const visibleJobs = (() => {
    if (appMode !== 'radius') return jobs;
    if (!radiusCenter) return [];
    return jobs.filter((item) => distanceMeters(radiusCenter, item) <= radiusMeters);
  })();

  const groupedData = {
    housing: { title: '租屋資訊', color: '#10b981', items: visibleJobs.filter(j => j.type === 'housing') },
    job: { title: '職缺資訊', color: '#3b82f6', items: visibleJobs.filter(j => j.type === 'job') },
    custom: { title: '自訂地點', color: '#a855f7', items: visibleJobs.filter(j => j.type === 'custom') }
  };

  const handleItemClick = (item, uniqueKey) => {
    setOpenItemIdx(openItemIdx === uniqueKey ? null : uniqueKey);
    onFocusItem(item); 
  };

  const handleModeClick = (mode) => {
    setAppMode(appMode === mode ? 'normal' : mode);
  };

  const notesNotice = showNotesNotice ? (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setShowNotesNotice(false)}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '24px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '420px', backgroundColor: 'white', borderRadius: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', padding: '36px 32px', boxSizing: 'border-box', textAlign: 'center' }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>提示</h2>
        <p style={{ margin: '0 0 28px 0', fontSize: '18px', color: '#475569', lineHeight: 1.6 }}>此功能開發中，敬請期待~</p>
        <button
          type="button"
          onClick={() => setShowNotesNotice(false)}
          style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '14px', backgroundColor: '#2563eb', color: 'white', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}
        >
          知道了
        </button>
      </div>
    </div>
  ) : null;

  // 🎯 需求 2：如果是收合模式，只顯示一顆浮動的展開按鈕，讓出最大地圖空間
  // 🎯 如果是收合模式，顯示 80px 的「迷你側邊欄」
  if (isCollapsed) {
    return (
      <>
      <div style={{ width: '80px', flexShrink: 0, height: '100%', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', boxSizing: 'border-box', zIndex: 20 }}>
        
        {/* 上方：展開按鈕 */}
        <button
          onClick={() => setIsCollapsed(false)}
          title="展開側邊欄"
          style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '16px', width: '48px', height: '48px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dbeafe'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
        >
          <ChevronRight size={28} />
        </button>

        <div style={{ flex: 1 }} />

        {/* 下方：三大功能快捷鍵 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', alignItems: 'center' }}>
          <button
            onClick={() => { setAppMode('normal'); onOpenModal(); }}
            title="新增"
            style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#2563eb', color: 'white', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'transform 0.2s', boxShadow: '0 4px 6px -1px rgba(37,99,235,0.3)' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Plus size={24} />
          </button>
          
          <button
            onClick={() => handleModeClick('distance')}
            title="測距"
            style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: appMode === 'distance' ? '#eff6ff' : '#f8fafc', color: appMode === 'distance' ? '#2563eb' : '#64748b', border: appMode === 'distance' ? '2px solid #bfdbfe' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.borderColor = appMode === 'distance' ? '#bfdbfe' : '#e2e8f0'}
          >
            <Route size={22} />
          </button>

          <button
            onClick={() => handleModeClick('radius')}
            title="範圍"
            style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: appMode === 'radius' ? '#faf5ff' : '#f8fafc', color: appMode === 'radius' ? '#9333ea' : '#64748b', border: appMode === 'radius' ? '2px solid #e9d5ff' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.borderColor = appMode === 'radius' ? '#e9d5ff' : '#e2e8f0'}
          >
            <Target size={22} />
          </button>

          <button
            onClick={() => setShowNotesNotice(true)}
            title="藍圖筆記"
            style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
          >
            <NotebookPen size={22} />
          </button>

          <button
            onClick={onOpenSettings}
            title="設定"
            style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <Settings size={22} />
          </button>
        </div>
      </div>
      {notesNotice}
      </>
    );
  }

  return (
    <>
    <div style={{ width: `${sidebarWidth}px`, flexShrink: 0, overflowX: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: theme.bgMuted, borderRight: `1px solid ${theme.border}`, zIndex: 20, position: 'relative' }}>
      {/* 🌟 1. 最外層套用 sidebarWidth、flexShrink: 0 防變形，並設定 position: relative 讓拉桿定位 */}
      {/* 標題區 */}
      <div style={{ padding: '24px', backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}`, zIndex: 10 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#2563eb', margin: 0, whiteSpace: 'nowrap' }}>NuLifeMap 新生活藍圖</h1>
        {loadingData && (
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '8px 0 0 0' }}>正在載入資料...</p>
        )}
      </div>

      {/* 列表區 (可捲動) */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {loadingData ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#3b82f6' }}><Loader2 className="animate-spin" /></div>
        ) : (
          Object.entries(groupedData).map(([catKey, category]) => (
            <div key={catKey} style={{ marginBottom: '12px' }}>
              <button onClick={() => setOpenCategory(openCategory === catKey ? null : catKey)} style={{ width: '100%', padding: '16px', backgroundColor: openCategory === catKey ? '#eff6ff' : '#ffffff', border: `1px solid ${openCategory === catKey ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <span style={{ fontWeight: 'bold', fontSize: '16px', color: category.color, whiteSpace: 'nowrap' }}>
                  {category.title}
                </span>
                {openCategory === catKey ? <ChevronDown size={20} color={category.color} style={{ flexShrink: 0 }} /> : <ChevronRight size={20} color="#94a3b8" style={{ flexShrink: 0 }} />}
              </button>

              {openCategory === catKey && (
                <div style={{ padding: '8px 0 8px 4px' }}>
                  {category.items.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>尚無資料</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {category.items.map((item, idx) => {
                        const uniqueKey = `${catKey}-${idx}`;
                        const isExpanded = openItemIdx === uniqueKey;
                        const titleStr = item.customInfo?.title || item.houseInfo?.title || item.jobInfo?.jobTitle;
                        const sourceUrl = item.houseInfo?.sourceUrl || item.jobInfo?.sourceUrl || item.customInfo?.website;
                        const isJob = item.type === 'job';
                        const isHousing = item.type === 'housing';
                        const jobCardTitle = `${item.jobInfo?.companyName || '未知公司'} - ${item.jobInfo?.jobTitle || '未命名職缺'}`;
                        const cardTitle = isJob ? jobCardTitle : titleStr;

                        if (isJob || isHousing) {
                          return (
                            <div
                              key={uniqueKey}
                              onClick={() => onFocusItem(item)}
                              style={{
                                position: 'relative',
                                aspectRatio: '3 / 1',
                                padding: '8px 10px',
                                backgroundColor: '#ffffff',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                borderTop: `4px solid ${category.color}`,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                minWidth: 0,
                                boxSizing: 'border-box',
                              }}
                            >
                              <h4
                                style={{
                                  fontWeight: 'bold',
                                  color: '#0f172a',
                                  fontSize: '13px',
                                  margin: 0,
                                  lineHeight: 1.35,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {cardTitle}
                              </h4>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={uniqueKey}
                            onClick={() => handleItemClick(item, uniqueKey)}
                            style={{
                              position: 'relative',
                              gridColumn: isExpanded ? '1 / -1' : 'auto',
                              aspectRatio: isExpanded ? 'auto' : '2 / 1',
                              padding: '10px',
                              backgroundColor: '#ffffff',
                              borderRadius: '12px',
                              border: '1px solid #e2e8f0',
                              borderTop: `4px solid ${category.color}`,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              boxShadow: isExpanded ? '0 4px 6px -1px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              minWidth: 0,
                              boxSizing: 'border-box',
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteItem(item._id);
                              }}
                              style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', borderRadius: '6px' }}
                              title="刪除此地點"
                            >
                              <Trash2 size={16} />
                            </button>
                            <h4 style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '13px', margin: 0, paddingRight: '24px', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{titleStr}</h4>
                            <p style={{ color: '#64748b', fontSize: '12px', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.address}</p>
                            {isExpanded && (
                              <div style={{ marginTop: '4px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {item.type === 'custom' && (
                                  <>
                                    {item.memo && <div style={{ color: '#334155' }}>備註：{item.memo}</div>}
                                    {item.customInfo?.opening_hours && item.customInfo.opening_hours.length > 0 && (
                                      <div style={{ marginTop: '4px', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}><Clock size={14}/> 營業時間</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>點擊圖釘查看完整時間與照片</div>
                                      </div>
                                    )}
                                  </>
                                )}
                                {sourceUrl && (
                                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', padding: '8px 12px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', width: 'fit-content', whiteSpace: 'nowrap' }}>
                                    <ExternalLink size={14} /> 前往相關網頁
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部操作區塊 */}
      <div style={{ padding: '16px', backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}`, zIndex: 10 }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button onClick={() => { setAppMode('normal'); onOpenModal(); }} style={{ flex: 1, minWidth: 0, padding: '10px 0', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', cursor: 'pointer', transition: 'background-color 0.2s', fontSize: '12px' }}>
            <Plus size={15} /> 新增
          </button>
          <button onClick={() => handleModeClick('distance')} style={{ flex: 1, minWidth: 0, padding: '10px 0', backgroundColor: appMode === 'distance' ? '#eff6ff' : theme.bgSoft, color: appMode === 'distance' ? '#2563eb' : theme.textMuted, borderRadius: '8px', border: appMode === 'distance' ? '1px solid #bfdbfe' : '1px solid transparent', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '12px' }}>
            <Route size={15} /> 測距
          </button>
          <button onClick={() => handleModeClick('radius')} style={{ flex: 1, minWidth: 0, padding: '10px 0', backgroundColor: appMode === 'radius' ? '#faf5ff' : theme.bgSoft, color: appMode === 'radius' ? '#9333ea' : theme.textMuted, borderRadius: '8px', border: appMode === 'radius' ? '1px solid #e9d5ff' : '1px solid transparent', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '12px' }}>
            <Target size={15} /> 範圍
          </button>
          <button onClick={() => setShowNotesNotice(true)} style={{ flex: 1, minWidth: 0, padding: '10px 0', backgroundColor: theme.bgSoft, color: theme.textMuted, borderRadius: '8px', border: '1px solid transparent', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '12px' }}>
            <NotebookPen size={15} /> 藍圖筆記
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: theme.bgMuted, borderRadius: '12px', border: `1px solid ${theme.border}`, gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden', minWidth: 0 }}>
            <img
              src={user?.avatarData || user?.avatar}
              alt="avatar"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: theme.bgSoft,
                objectFit: 'cover',
                objectPosition: `${50 + (user?.avatarOffset?.x || 0)}% ${50 + (user?.avatarOffset?.y || 0)}%`,
                flexShrink: 0,
              }}
            />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold', color: theme.text, fontSize: '14px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.name}</div>
              <div style={{ color: theme.textMuted, fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>@{user?.account}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={onOpenSettings}
              style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.bgSoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="設定"
            >
              <Settings size={18} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.dangerSoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="登出"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {willCollapse && (
        <div style={{
          position: 'absolute', inset: 0, backgroundColor: 'rgba(239, 246, 255, 0.85)',
          zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#2563eb', backdropFilter: 'blur(4px)', transition: 'opacity 0.2s'
        }}>
          <ChevronLeft size={64} style={{ opacity: 0.8 }} />
          <h2 style={{ fontWeight: '900', marginTop: '16px', letterSpacing: '2px' }}>放開以收合側邊欄</h2>
        </div>
      )}

      {/* 🌟 拖曳瘦身的隱形把手 */}
      <div 
        onMouseDown={startResizing}
        style={{
          position: 'absolute',
          top: 0, 
          right: 0, 
          width: '6px', 
          height: '100%',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          zIndex: 100,
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#cbd5e1'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
      />
    </div>
    {notesNotice}
    </>
  );
}