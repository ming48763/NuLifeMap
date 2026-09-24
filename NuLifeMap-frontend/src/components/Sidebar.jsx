import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown, ChevronRight, ChevronLeft, ExternalLink, Clock, Plus, Route, Target, LogOut, Trash2  } from 'lucide-react';

export default function Sidebar({ 
  user,        // 🌟 接收使用者資料
  onLogout,    // 🌟 接收登出函式
  jobs, 
  loadingData, 
  appMode, 
  setAppMode, 
  onOpenModal, 
  onFocusItem,
  onDeleteItem, // 🌟 2. 接收從 App.jsx 傳來的刪除函式
  sidebarWidth, 
  setSidebarWidth, 
  isCollapsed, 
  setIsCollapsed
}) {
  const [openCategory, setOpenCategory] = useState('housing');
  const [openItemIdx, setOpenItemIdx] = useState(null); 

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

  const groupedData = {
    housing: { title: '🏠 租屋資訊', color: '#10b981', items: jobs.filter(j => j.type === 'housing') },
    job: { title: '💼 職缺資訊', color: '#3b82f6', items: jobs.filter(j => j.type === 'job') },
    custom: { title: '📍 自訂地點', color: '#a855f7', items: jobs.filter(j => j.type === 'custom') }
  };

  const handleItemClick = (item, uniqueKey) => {
    setOpenItemIdx(openItemIdx === uniqueKey ? null : uniqueKey);
    onFocusItem(item); 
  };

  const handleModeClick = (mode) => {
    setAppMode(appMode === mode ? 'normal' : mode);
  };

  // 🎯 需求 2：如果是收合模式，只顯示一顆浮動的展開按鈕，讓出最大地圖空間
  // 🎯 如果是收合模式，顯示 80px 的「迷你側邊欄」
  if (isCollapsed) {
    return (
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
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: `${sidebarWidth}px`, flexShrink: 0, overflowX: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0', zIndex: 20, position: 'relative' }}>
      {/* 🌟 1. 最外層套用 sidebarWidth、flexShrink: 0 防變形，並設定 position: relative 讓拉桿定位 */}
      {/* 標題區 */}
      <div style={{ padding: '24px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', zIndex: 10 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#2563eb', margin: '0 0 8px 0', whiteSpace: 'nowrap' }}>NuLifeMap 新生活藍圖</h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
          {loadingData ? "正在載入資料..." : `共找到 ${jobs.length} 筆資料`}
        </p>
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
                  {category.title} <span style={{ color: '#64748b', fontSize: '14px', marginLeft: '6px' }}>({category.items.length})</span>
                </span>
                {openCategory === catKey ? <ChevronDown size={20} color={category.color} style={{ flexShrink: 0 }} /> : <ChevronRight size={20} color="#94a3b8" style={{ flexShrink: 0 }} />}
              </button>

              {openCategory === catKey && (
                <div style={{ padding: '8px 0 8px 12px' }}>
                  {category.items.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>尚無資料</div>
                  ) : (
                    category.items.map((item, idx) => {
                      const uniqueKey = `${catKey}-${idx}`;
                      const isExpanded = openItemIdx === uniqueKey;
                      const titleStr = item.customInfo?.title || item.houseInfo?.title || item.jobInfo?.jobTitle;
                      const sourceUrl = item.houseInfo?.sourceUrl || item.jobInfo?.sourceUrl || item.customInfo?.website;

                      return (
                        <div 
                          key={uniqueKey} 
                          onClick={() => handleItemClick(item, uniqueKey)}
                          // 🌟 加入 position: 'relative' 以便垃圾桶絕對定位
                          style={{ position: 'relative', padding: '16px', backgroundColor: '#ffffff', borderRadius: '12px', borderLeft: `4px solid ${category.color}`, borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', marginBottom: '10px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: isExpanded ? '0 4px 6px -1px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.05)' }}
                        >

                          {/* 🌟 垃圾桶按鈕：固定在卡片右上角，且點擊使用 onDeleteItem */}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteItem(item._id); 
                            }}
                            style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', borderRadius: '6px', transition: 'background-color 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'} 
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            title="刪除此地點"
                          >
                            <Trash2 size={18} />
                          </button>

                          {/* 標題增加 paddingRight 避免與垃圾桶重疊 */}
                          <h4 style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px', margin: '0 0 4px 0', paddingRight: '28px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titleStr}</h4>
                          <p style={{ color: '#64748b', fontSize: '13px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.address}</p>
                          
                          {/* ... 中間展開細節完全不動 ... */}
                          {isExpanded && (
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {item.type === 'housing' && (<><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#ea580c', fontWeight: 'bold' }}>{item.houseInfo?.price}</span><span>{item.houseInfo?.area}</span></div><div>仲介/屋主：{item.houseInfo?.is_agent}</div></>)}
                              {item.type === 'job' && (<><div style={{ fontWeight: 'bold', color: '#334155' }}>{item.jobInfo?.companyName}</div><div style={{ color: '#ea580c' }}>{item.memo}</div></>)}
                              {item.type === 'custom' && (
                                <>
                                  {item.memo && <div style={{ color: '#334155' }}>備註：{item.memo}</div>}
                                  {item.customInfo?.opening_hours && item.customInfo.opening_hours.length > 0 && (
                                    <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}><Clock size={14}/> 營業時間</div>
                                      <div style={{ fontSize: '12px', color: '#64748b' }}>點擊圖釘查看完整時間與照片</div>
                                    </div>
                                  )}
                                </>
                              )}
                              {sourceUrl && (
                                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '8px', padding: '8px 12px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', width: 'fit-content', whiteSpace: 'nowrap' }}>
                                  <ExternalLink size={14} /> 前往相關網頁
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部操作區塊 - 原有內容不變 */}
      <div style={{ padding: '16px', backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', zIndex: 10 }}>
        {/* ... 原有底部內容不變 ... */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button onClick={() => { setAppMode('normal'); onOpenModal(); }} style={{ flex: 1, padding: '10px 0', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'background-color 0.2s', fontSize: '13px' }}>
            <Plus size={16} /> 新增
          </button>
          <button onClick={() => handleModeClick('distance')} style={{ flex: 1, padding: '10px 0', backgroundColor: appMode === 'distance' ? '#eff6ff' : '#f1f5f9', color: appMode === 'distance' ? '#2563eb' : '#475569', borderRadius: '8px', border: appMode === 'distance' ? '1px solid #bfdbfe' : '1px solid transparent', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '13px' }}>
            <Route size={16} /> 測距
          </button>
          <button onClick={() => handleModeClick('radius')} style={{ flex: 1, padding: '10px 0', backgroundColor: appMode === 'radius' ? '#faf5ff' : '#f1f5f9', color: appMode === 'radius' ? '#9333ea' : '#475569', borderRadius: '8px', border: appMode === 'radius' ? '1px solid #e9d5ff' : '1px solid transparent', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '13px' }}>
            <Target size={16} /> 範圍
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
            <img src={user?.avatar} alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e2e8f0', objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '14px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.name}</div>
              <div style={{ color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>@{user?.account}</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ flexShrink: 0, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'} title="登出">
            <LogOut size={18} />
          </button>
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
  );
}