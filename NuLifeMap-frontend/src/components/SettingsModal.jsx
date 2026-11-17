import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Mail, Moon, Sun, User, X } from 'lucide-react';
import { compressImageDataUrl } from '../utils/compressImage';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';
const DEVELOPER_EMAIL = import.meta.env.VITE_DEVELOPER_EMAIL || 'ming48763@gmail.com';

function AvatarEditor({ src, offset, onOffsetChange }) {
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const offsetRef = useRef(offset || { x: 0, y: 0 });

  useEffect(() => {
    offsetRef.current = offset || { x: 0, y: 0 };
  }, [offset]);

  const onPointerDown = (e) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    const next = {
      x: Math.max(-40, Math.min(40, (offsetRef.current?.x || 0) + dx * 0.35)),
      y: Math.max(-40, Math.min(40, (offsetRef.current?.y || 0) + dy * 0.35)),
    };
    offsetRef.current = next;
    onOffsetChange(next);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        width: '140px',
        height: '140px',
        borderRadius: '50%',
        overflow: 'hidden',
        border: '2px solid #cbd5e1',
        cursor: 'grab',
        touchAction: 'none',
        backgroundColor: '#e2e8f0',
        position: 'relative',
        flexShrink: 0,
      }}
      title="拖曳調整照片位置"
    >
      <img
        src={src}
        alt="avatar preview"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${50 + (offset?.x || 0)}% ${50 + (offset?.y || 0)}%`,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export default function SettingsModal({
  user,
  isOpen,
  onClose,
  onUserUpdated,
  darkMode,
  onToggleDarkMode,
  theme,
}) {
  const [name, setName] = useState(user?.name || '');
  const [avatarSrc, setAvatarSrc] = useState(user?.avatarData || user?.avatar || '');
  const [offset, setOffset] = useState(user?.avatarOffset || { x: 0, y: 0 });
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [avatarSaveState, setAvatarSaveState] = useState('idle'); // idle | saving | success | error
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);
  const wasOpenRef = useRef(false);
  const avatarDirtyRef = useRef(false);

  useEffect(() => {
    avatarDirtyRef.current = avatarDirty;
  }, [avatarDirty]);

  useEffect(() => {
    if (!isOpen || !user) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    // 只在剛打開設定時重置按鈕狀態，避免儲存成功後被 onUserUpdated 洗掉
    if (justOpened) {
      setName(user.name || '');
      setAvatarSrc(user.avatarData || user.avatar || '');
      setOffset(user.avatarOffset || { x: 0, y: 0 });
      setAvatarDirty(false);
      avatarDirtyRef.current = false;
      setAvatarSaveState('idle');
      setMessage('');
      return;
    }
    // 非 dirty 時同步後端回寫（例如上傳完成）；編輯中不覆寫預覽
    if (!avatarDirtyRef.current) {
      setName(user.name || '');
      setAvatarSrc(user.avatarData || user.avatar || '');
      setOffset(user.avatarOffset || { x: 0, y: 0 });
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const persistProfile = async (body) => {
    const res = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(user.account)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '儲存失敗');
    if (onUserUpdated) onUserUpdated(data.user);
    return data.user;
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      setMessage('名稱不可空白');
      return;
    }
    setSavingName(true);
    setMessage('');
    try {
      await persistProfile({ name: name.trim() });
      setMessage('名稱已更新');
    } catch (err) {
      setMessage(err.message || '名稱更新失敗');
    } finally {
      setSavingName(false);
    }
  };

  const handlePickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('請選擇圖片檔');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = String(reader.result || '');
      try {
        const compressed = await compressImageDataUrl(raw);
        setAvatarSrc(compressed);
      } catch {
        setAvatarSrc(raw);
      }
      setOffset({ x: 0, y: 0 });
      setAvatarDirty(true);
      setAvatarSaveState('idle');
      setMessage('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveAvatar = async () => {
    if (!avatarSrc || avatarSaveState === 'saving') return;
    setAvatarSaveState('saving');
    setMessage('');
    try {
      const compressed = await compressImageDataUrl(avatarSrc);
      setAvatarSrc(compressed);
      await persistProfile({
        avatarData: compressed,
        avatarOffset: offset,
      });
      setAvatarDirty(false);
      setAvatarSaveState('success');
    } catch (err) {
      setAvatarSaveState('error');
      setMessage(err.message || '大頭貼儲存失敗');
    }
  };

  const avatarButtonLabel =
    avatarSaveState === 'saving'
      ? '儲存中...'
      : avatarSaveState === 'success'
        ? '上傳完成'
        : avatarSaveState === 'error'
          ? '請重新上傳'
          : '儲存大頭貼';

  const avatarButtonBg =
    avatarSaveState === 'saving'
      ? '#94a3b8'
      : avatarSaveState === 'success'
        ? '#16a34a'
        : avatarSaveState === 'error'
          ? '#dc2626'
          : !avatarDirty
            ? '#94a3b8'
            : '#2563eb';

  const sectionStyle = {
    padding: '16px',
    borderRadius: '14px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bgMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4500, padding: '24px' }}
    >
      <div style={{ width: 'min(440px, 96vw)', maxHeight: '90vh', overflowY: 'auto', backgroundColor: theme.bg, borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', color: theme.text }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, backgroundColor: theme.bg, zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>設定</h2>
          <button type="button" onClick={onClose} aria-label="關閉" style={{ width: '32px', height: '32px', border: 'none', borderRadius: '10px', backgroundColor: theme.bgSoft, color: theme.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                深色模式
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={darkMode}
                onClick={onToggleDarkMode}
                style={{
                  width: '52px',
                  height: '30px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: darkMode ? '#2563eb' : '#cbd5e1',
                  position: 'relative',
                  transition: 'background-color 0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: darkMode ? '25px' : '3px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </button>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <Camera size={18} /> 更換大頭貼
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <AvatarEditor
                src={avatarSrc}
                offset={offset}
                onOffsetChange={(next) => {
                  setOffset(next);
                  setAvatarDirty(true);
                  if (avatarSaveState === 'success' || avatarSaveState === 'error') {
                    setAvatarSaveState('idle');
                  }
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '140px' }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePickFile} style={{ display: 'none' }} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  style={{ padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontWeight: 700, cursor: 'pointer' }}
                >
                  選擇照片
                </button>
                <button
                  type="button"
                  disabled={avatarSaveState === 'saving' || (!avatarDirty && avatarSaveState === 'idle')}
                  onClick={handleSaveAvatar}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: avatarButtonBg,
                    color: '#fff',
                    fontWeight: 700,
                    cursor: avatarSaveState === 'saving' || (!avatarDirty && avatarSaveState === 'idle') ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'background-color 0.2s',
                  }}
                >
                  {avatarSaveState === 'saving' && <Loader2 size={16} className="animate-spin" />}
                  {avatarButtonLabel}
                </button>
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <User size={18} /> 使用者名稱
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, boxSizing: 'border-box', backgroundColor: theme.bg, color: theme.text, fontSize: '15px' }}
            />
            <button
              type="button"
              disabled={savingName}
              onClick={handleSaveName}
              style={{ padding: '10px 12px', borderRadius: '10px', border: 'none', backgroundColor: savingName ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 700, cursor: savingName ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {savingName && <Loader2 size={16} className="animate-spin" />}
              儲存名稱
            </button>
          </div>

          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <Mail size={18} /> 聯絡開發者
            </div>
            <a
              href={`mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent('NuLifeMap 意見回饋')}`}
              style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 700, textDecoration: 'none', textAlign: 'center', border: '1px solid #bfdbfe' }}
            >
              寄信給開發者
            </a>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>{DEVELOPER_EMAIL}</div>
          </div>

          {message && (
            <div style={{ fontSize: '13px', color: message.includes('失敗') || message.includes('不可') ? '#b91c1c' : '#15803d', textAlign: 'center' }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
