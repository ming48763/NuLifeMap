import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Trash2, X } from 'lucide-react';

const CAPSULE_BG = '#E8EEF7';
const CAPSULE_TEXT = '#4A6FA5';

function Field({ label, value, style, maxLines }) {
  const text = (value && String(value).trim()) ? String(value) : '未提供';
  const lineHeight = 1.7;
  const fontSize = 15;
  const valueStyle = {
    fontSize: `${fontSize}px`,
    color: '#0f172a',
    lineHeight,
    whiteSpace: 'pre-wrap',
    ...(maxLines
      ? {
          maxHeight: `${fontSize * lineHeight * maxLines}px`,
          overflowY: 'auto',
        }
      : {}),
  };
  return (
    <div style={{ paddingBottom: '16px', borderBottom: '1px solid #e2e8f0', ...style }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>{label}</div>
      <div style={valueStyle}>{text}</div>
    </div>
  );
}

function FieldRow({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {children}
    </div>
  );
}

function formatCapsuleText(label, value) {
  const text = (value && String(value).trim()) ? String(value).trim() : '未提供';
  if (text === '依公司規定') return `${label}依公司規定`;
  return text;
}

function Capsule({ text }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '8px 14px',
        borderRadius: '999px',
        backgroundColor: CAPSULE_BG,
        color: CAPSULE_TEXT,
        fontSize: '13px',
        fontWeight: 700,
        lineHeight: 1.3,
        maxWidth: '100%',
      }}
    >
      {text}
    </span>
  );
}

function buildHousingDescription(item, info) {
  if (info.description && String(info.description).trim()) return info.description;
  const lines = [];
  if (info.price) lines.push(`租金：${info.price}`);
  if (info.area) lines.push(`坪數：${info.area}`);
  if (info.floor) lines.push(`樓層：${info.floor}`);
  if (info.cooking) lines.push(`開伙：${info.cooking}`);
  if (info.is_agent) lines.push(`仲介/屋主：${info.is_agent}`);
  if (info.contact) lines.push(`聯絡：${info.contact}`);
  if (item?.address) lines.push(`地址：${item.address}`);
  return lines.join('\n') || item?.memo || '';
}

export default function JobDetailModal({ item, onClose, onSaved, onDeleteItem }) {
  const isHousing = item?.type === 'housing';
  const jobInfo = item?.jobInfo || {};
  const houseInfo = item?.houseInfo || {};
  const info = isHousing ? houseInfo : jobInfo;
  const initialNotes = info.notes || '';
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // 'save' | 'delete' | null

  useEffect(() => {
    setNotes(info.notes || '');
    setMessage('');
    setConfirmAction(null);
  }, [item?._id, info.notes]);

  if (!item) return null;

  const title = isHousing
    ? (houseInfo.title || '未命名租屋')
    : `${jobInfo.companyName || '未知公司'} - ${jobInfo.jobTitle || '未命名職缺'}`;

  const notesTitle = isHousing ? '看房筆記' : '求職筆記';
  const sourceUrl = isHousing ? houseInfo.sourceUrl : jobInfo.sourceUrl;
  const mainLabel = isHousing ? '房屋說明' : '工作內容';
  const mainValue = isHousing ? buildHousingDescription(item, houseInfo) : jobInfo.description;

  const capsules = isHousing
    ? [
        houseInfo.cooking || '開伙未提供',
        houseInfo.is_agent || '身分未提供',
        houseInfo.floor || '樓層未提供',
        houseInfo.area || '坪數未提供',
      ]
    : [
        { label: '職務類別', value: jobInfo.jobCategory },
        { label: '出差', value: jobInfo.businessTrip },
        { label: '管理', value: jobInfo.manageResp },
        { label: '工作性質', value: jobInfo.jobNature },
        { label: '上班', value: jobInfo.workPeriod },
        { label: '休假', value: jobInfo.vacationPolicy },
      ].map(({ label, value }) => formatCapsuleText(label, value));

  const runSaveNotes = async () => {
    setSaving(true);
    setMessage('');
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';
      const res = await fetch(`${API_BASE}/api/markers/${item._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      setMessage(`${notesTitle}已儲存`);
      if (onSaved) {
        if (isHousing) {
          onSaved({ ...item, houseInfo: { ...houseInfo, notes } });
        } else {
          onSaved({ ...item, jobInfo: { ...jobInfo, notes } });
        }
      }
    } catch (err) {
      setMessage(err.message || '儲存失敗');
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  };

  const runDelete = async () => {
    setConfirmAction(null);
    if (!onDeleteItem) {
      onClose();
      return;
    }
    const ok = await onDeleteItem(item._id, { skipConfirm: true });
    if (ok) onClose();
  };

  const handleConfirm = () => {
    if (confirmAction === 'save') runSaveNotes();
    if (confirmAction === 'delete') runDelete();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '24px' }}
    >
      <div
        style={{ width: 'min(960px, 96vw)', height: 'min(720px, 90vh)', backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: '40px', padding: '6px 12px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            style={{ width: '28px', height: '28px', border: 'none', borderRadius: '8px', backgroundColor: '#f1f5f9', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', minHeight: 0 }}>
          <div style={{ padding: '24px', overflowY: 'auto', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ margin: 0, paddingBottom: '16px', borderBottom: '1px solid #e2e8f0', fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>{title}</h2>
            <Field label={mainLabel} value={mainValue} maxLines={7} />
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
              <FieldRow>
                {isHousing ? (
                  <>
                    <Field label="租金" value={houseInfo.price || item.memo} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                    <Field label="地址" value={item.address} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                  </>
                ) : (
                  <>
                    <Field label="工作待遇" value={jobInfo.salary || item.memo} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                    <Field label="上班地點" value={jobInfo.workLocation || item.address} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                  </>
                )}
              </FieldRow>
            </div>
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
              <FieldRow>
                {isHousing ? (
                  <>
                    <Field label="坪數" value={houseInfo.area} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                    <Field label="樓層" value={houseInfo.floor} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                  </>
                ) : (
                  <>
                    <Field label="可上班日" value={jobInfo.startWorkingDay} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                    <Field label="需求人數" value={jobInfo.needEmp} style={{ borderBottom: 'none', paddingBottom: 0 }} />
                  </>
                )}
              </FieldRow>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {capsules.map((text, i) => (
                <Capsule key={i} text={text} />
              ))}
            </div>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: '#f8fafc' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>{notesTitle}</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ flex: 1, width: '100%', minHeight: '240px', resize: 'none', padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '15px', lineHeight: 1.6, fontFamily: 'inherit', backgroundColor: '#fff' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: message.includes('失敗') ? '#b91c1c' : '#15803d', minHeight: '18px' }}>{message}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setConfirmAction('delete')}
                  aria-label="刪除"
                  title="刪除"
                  style={{ width: '40px', height: '40px', padding: 0, border: '1px solid #fecaca', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
                >
                  <Trash2 size={18} />
                </button>
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="前往網址"
                    title="前往網址"
                    style={{ width: '40px', height: '40px', padding: 0, border: '1px solid #bfdbfe', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
                  >
                    <ExternalLink size={18} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmAction('save')}
                  disabled={saving}
                  style={{ height: '40px', padding: '0 18px', border: 'none', borderRadius: '10px', backgroundColor: saving ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxSizing: 'border-box' }}
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  儲存筆記
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-change-title"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4100, padding: '24px' }}
        >
          <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', padding: '28px 24px', boxSizing: 'border-box', textAlign: 'center' }}>
            <h3 id="confirm-change-title" style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>確認變更</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '15px', color: '#475569', lineHeight: 1.6 }}>
              {confirmAction === 'delete'
                ? `確定要刪除此${isHousing ? '租屋' : '職缺'}嗎？刪除後無法復原。`
                : `確定要儲存${notesTitle}嗎？`}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '12px', backgroundColor: confirmAction === 'delete' ? '#dc2626' : '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
