import React, { useEffect, useState } from 'react';
import { Lock, User, Loader2, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';

const TEST_ACCOUNTS = [
  { name: '大學生阿志', account: 'hiremeplz', password: '123456789', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=hiremeplz' },
  { name: '美甲師小寧', account: 'needmoneyplz', password: '123456789', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=needmoneyplz' },
  { name: '文藝青年雞哥', account: 'joborhungryqq', password: '123456789', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=joborhungryqq' }
];

const MASK = '*******';

export default function Login({ onLogin }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [masked, setMasked] = useState(false);
  const [useTestAccount, setUseTestAccount] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testAccounts, setTestAccounts] = useState(TEST_ACCOUNTS);

  useEffect(() => {
    if (!showPicker) return;
    let cancelled = false;

    const loadProfiles = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/test-accounts`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.users)) return;
        const byAccount = Object.fromEntries(data.users.map((u) => [u.account, u]));
        const merged = TEST_ACCOUNTS.map((base) => {
          const remote = byAccount[base.account];
          if (!remote) return base;
          return {
            ...base,
            name: remote.name || base.name,
            avatar: remote.avatar || base.avatar,
            avatarOffset: remote.avatarOffset || { x: 0, y: 0 },
          };
        });
        if (!cancelled) setTestAccounts(merged);
      } catch {
        // 保持預設測試帳號
      }
    };

    loadProfiles();
    return () => { cancelled = true; };
  }, [showPicker]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password })
      });
      const data = await res.json();

      if (data.success) {
        onLogin(data.user);
      } else {
        setError(data.error || '登入失敗，請檢查帳號密碼');
      }
    } catch (err) {
      setError('無法連線至伺服器，請確認後端已啟動。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestToggle = (checked) => {
    setUseTestAccount(checked);
    setError('');
    if (checked) {
      setShowPicker(true);
      return;
    }
    setShowPicker(false);
    setMasked(false);
    setAccount('');
    setPassword('');
  };

  const selectTestAccount = (user) => {
    setAccount(user.account);
    setPassword(user.password);
    setMasked(true);
    setShowPicker(false);
    setError('');
  };

  const closePicker = () => {
    setShowPicker(false);
    if (!masked) {
      setUseTestAccount(false);
    }
  };

  const unlockField = (field) => (e) => {
    if (!masked) return;
    setMasked(false);
    setUseTestAccount(false);
    if (field === 'account') {
      setAccount(e.target.value === MASK ? '' : e.target.value);
    } else {
      setPassword(e.target.value === MASK ? '' : e.target.value);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', zIndex: 9999 }}>
      <div style={{ position: 'relative', backgroundColor: 'white', padding: '60px', borderRadius: '36px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)', width: '600px', maxWidth: '90vw', minHeight: '540px', boxSizing: 'border-box', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '84px', height: '84px', marginBottom: '24px' }}>
            <img
              src="/NuLifeMap_LOGO.jpg"
              alt="NuLifeMap"
              width={84}
              height={84}
              style={{ width: '84px', height: '84px', objectFit: 'contain', objectPosition: 'center', display: 'block' }}
            />
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: '900', color: '#0f172a', margin: 0 }}>NuLifeMap 新生活藍圖</h1>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '18px 24px', borderRadius: '18px', fontSize: '21px', fontWeight: 'bold', marginBottom: '36px', textAlign: 'center', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '21px', fontWeight: 'bold', color: '#334155', marginBottom: '12px' }}>帳號</label>
            <div style={{ position: 'relative' }}>
              <User size={27} color="#94a3b8" style={{ position: 'absolute', top: '50%', left: '18px', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                value={masked ? MASK : account}
                onChange={(e) => {
                  if (masked) unlockField('account')(e);
                  else setAccount(e.target.value);
                }}
                placeholder="輸入您的帳號"
                required={!masked}
                autoComplete="username"
                style={{ width: '100%', padding: '18px 18px 18px 60px', borderRadius: '18px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '22.5px', boxSizing: 'border-box', transition: 'border-color 0.2s', letterSpacing: masked ? '0.12em' : 'normal' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '21px', fontWeight: 'bold', color: '#334155', marginBottom: '12px' }}>密碼</label>
            <div style={{ position: 'relative' }}>
              <Lock size={27} color="#94a3b8" style={{ position: 'absolute', top: '50%', left: '18px', transform: 'translateY(-50%)' }} />
              <input 
                type={masked ? 'text' : 'password'}
                value={masked ? MASK : password}
                onChange={(e) => {
                  if (masked) unlockField('password')(e);
                  else setPassword(e.target.value);
                }}
                placeholder="輸入您的密碼"
                required={!masked}
                autoComplete="current-password"
                style={{ width: '100%', padding: '18px 18px 18px 60px', borderRadius: '18px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '22.5px', boxSizing: 'border-box', transition: 'border-color 0.2s', letterSpacing: masked ? '0.12em' : 'normal' }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none', color: '#334155', fontSize: '18px', fontWeight: '600' }}>
            <input
              type="checkbox"
              checked={useTestAccount}
              onChange={(e) => handleTestToggle(e.target.checked)}
              style={{ width: '20px', height: '20px', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            使用測試用帳號
          </label>

          <div>
            <button 
              type="submit" 
              disabled={isLoading || !account || !password}
              style={{ marginTop: '12px', width: '100%', padding: '21px', backgroundColor: '#2563eb', color: 'white', borderRadius: '18px', border: 'none', fontWeight: 'bold', fontSize: '24px', cursor: isLoading || !account || !password ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', transition: 'background-color 0.2s', opacity: isLoading || !account || !password ? 0.7 : 1 }}
            >
              {isLoading ? <Loader2 className="animate-spin" size={30} /> : '登入'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setShowNotice(true)}
                style={{ border: 'none', background: 'none', padding: 0, color: '#94a3b8', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}
              >
                註冊帳號
              </button>
              <button
                type="button"
                onClick={() => setShowNotice(true)}
                style={{ border: 'none', background: 'none', padding: 0, color: '#94a3b8', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}
              >
                忘記密碼
              </button>
            </div>
          </div>
        </form>
      </div>

      {showNotice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feature-notice-title"
          onClick={() => setShowNotice(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '24px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '420px', backgroundColor: 'white', borderRadius: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', padding: '36px 32px', boxSizing: 'border-box', textAlign: 'center' }}
          >
            <h2 id="feature-notice-title" style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>提示</h2>
            <p style={{ margin: '0 0 28px 0', fontSize: '18px', color: '#475569', lineHeight: 1.6 }}>此功能開發中，敬請期待~</p>
            <button
              type="button"
              onClick={() => setShowNotice(false)}
              style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '14px', backgroundColor: '#2563eb', color: 'white', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {showPicker && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-account-title"
          onClick={closePicker}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '24px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '480px', backgroundColor: 'white', borderRadius: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', padding: '32px', boxSizing: 'border-box' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 id="test-account-title" style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: '#0f172a' }}>選擇測試身分</h2>
              <button
                type="button"
                onClick={closePicker}
                aria-label="關閉"
                style={{ width: '40px', height: '40px', border: 'none', borderRadius: '12px', backgroundColor: '#f1f5f9', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {testAccounts.map((user) => (
                <button
                  key={user.account}
                  type="button"
                  onClick={() => selectTestAccount(user)}
                  style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
                >
                  <img
                    src={user.avatar}
                    alt=""
                    width={48}
                    height={48}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      objectPosition: `${50 + (user.avatarOffset?.x || 0)}% ${50 + (user.avatarOffset?.y || 0)}%`,
                      backgroundColor: '#e2e8f0',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>{user.name}</span>
                    <span style={{ fontSize: '14px', color: '#64748b' }}>@{user.account}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
