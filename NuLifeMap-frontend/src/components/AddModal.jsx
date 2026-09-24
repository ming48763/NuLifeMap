import React, { useState } from 'react';
import { Loader2, Link as LinkIcon, MapPin } from 'lucide-react';

export default function AddModal({
  user,
  isOpen,
  onClose,
  fetchData
}) {
  const [addMode, setAddMode] = useState('url'); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' }); 
  
  const [inputUrl, setInputUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customMemo, setCustomMemo] = useState('');
  const [aggregateInfo, setAggregateInfo] = useState(false); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      // 🌟 讀取雲端後端網址，如果沒有就預設連本地端
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';

      if (addMode === 'url') {
        if (!inputUrl) throw new Error('請輸入網址');
        
        // 🌟 修正點：將請求打給動態的 API_BASE
        const res = await fetch(`${API_BASE}/api/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: inputUrl, userId: user?.account }) 
        });

        if (!res.ok) {
           const errorData = await res.json().catch(() => ({})); 
           throw new Error(errorData.error || '爬蟲請求失敗');
        }
        setSubmitMessage({ type: 'success', text: '資料抓取成功！即將更新地圖...' });

      } else {
        if (!customTitle || !customAddress) throw new Error('標題與地址為必填欄位');
        // 🌟 修正點：將請求打給動態的 API_BASE
        const res = await fetch(`${API_BASE}/api/markers/custom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title: customTitle, 
            address: customAddress, 
            memo: customMemo, 
            aggregate_info: aggregateInfo, 
            userId: user?.account 
          })
        });
        
        if (!res.ok) {
           const errorData = await res.json().catch(() => ({})); 
           throw new Error(errorData.error || '新增失敗');
        }
        setSubmitMessage({ type: 'success', text: '自訂地點新增成功！' });
      }

      setTimeout(() => {
        onClose();
        fetchData(); 
      }, 1500);

    } catch (error) {
      setSubmitMessage({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '90%', maxWidth: '450px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>新增地點至地圖</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <button onClick={() => setAddMode('url')} style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: addMode === 'url' ? '3px solid #2563eb' : '3px solid transparent', color: addMode === 'url' ? '#2563eb' : '#64748b', fontWeight: addMode === 'url' ? 'bold' : 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><LinkIcon size={16} /> 網址抓取</button>
          <button onClick={() => setAddMode('custom')} style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: addMode === 'custom' ? '3px solid #a855f7' : '3px solid transparent', color: addMode === 'custom' ? '#a855f7' : '#64748b', fontWeight: addMode === 'custom' ? 'bold' : 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><MapPin size={16} /> 自訂地點</button>
        </div>

        <div style={{ padding: '24px' }}>
          {submitMessage.text && (
            <div style={{ padding: '12px', marginBottom: '16px', borderRadius: '8px', backgroundColor: submitMessage.type === 'error' ? '#fef2f2' : '#f0fdf4', color: submitMessage.type === 'error' ? '#b91c1c' : '#15803d', fontSize: '14px' }}>{submitMessage.text}</div>
          )}
          <form onSubmit={handleSubmit}>
            {addMode === 'url' ? (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>貼上 104 或 591 網址</label>
                <input type="url" required value={inputUrl} onChange={e => setInputUrl(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>地標名稱 *</label>
                  <input type="text" required value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="例如：我的超級愛店" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>完整地址 *</label>
                  <input type="text" required value={customAddress} onChange={e => setCustomAddress(e.target.value)} placeholder="例如：台中市西屯區..." style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" id="aggregate" checked={aggregateInfo} onChange={(e) => setAggregateInfo(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  <label htmlFor="aggregate" style={{ fontSize: '14px', color: '#334155', cursor: 'pointer', userSelect: 'none', fontWeight: '500' }}>
                    🌐 啟用資訊匯整 <span style={{color: '#94a3b8', fontSize: '12px'}}>(自動抓取營業時間、圖片與官網)</span>
                  </label>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>備註 (選填)</label>
                  <textarea value={customMemo} onChange={e => setCustomMemo(e.target.value)} placeholder="寫點什麼..." rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', resize: 'vertical' }} />
                </div>
              </>
            )}
            <button type="submit" disabled={isSubmitting} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: isSubmitting ? '#94a3b8' : (addMode === 'url' ? '#2563eb' : '#a855f7'), color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              {isSubmitting && <Loader2 size={18} className="animate-spin" />} {isSubmitting ? '處理中...' : '送出新增'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}