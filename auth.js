// auth.js - シンプルなフロントエンド認証とアイドルタイムアウト

const AUTH_STORAGE_KEY = 'app_auth_session_v1';
const AUTH_LAST_ACTIVITY_KEY = 'app_auth_last_activity_v1';
const AUTH_TIMEOUT_MS = 30 * 60 * 1000; // 30分アイドルでログアウト

function authNow() {
  return Date.now();
}

function getAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.userId || !session.issuedAt) return null;
    return session;
  } catch (_) {
    return null;
  }
}

 function setAuthSessionToken(token, userId) {
   const session = { token, userId: userId || null, issuedAt: authNow() };
   localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
   localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(authNow()));
 }

function clearAuthSession() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (_) {}
  try { localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY); } catch (_) {}
}

function recordActivity() {
  try { localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(authNow())); } catch (_) {}
}

 async function isSessionActive() {
  const session = getAuthSession();
  if (!session) return false;
  try {
    const last = parseInt(localStorage.getItem(AUTH_LAST_ACTIVITY_KEY) || '0', 10);
    if (!last) return false;
    if ((authNow() - last) >= AUTH_TIMEOUT_MS) return false;
    // サーバ側トークン検証
    if (window.GasAPI && typeof GasAPI.validateSession === 'function') {
      try {
        const res = await GasAPI.validateSession(session.token, AUTH_TIMEOUT_MS);
        return !!(res && res.success);
      } catch (_) { return false; }
    }
    return true;
  } catch (_) {
    return false;
  }
}

 async function enforceAuthOrRedirect() {
  if (!(await isSessionActive())) {
    clearAuthSession();
    if (!location.pathname.endsWith('index.html') && location.pathname !== '/' && location.pathname !== '') {
      location.replace('index.html');
      return false;
    }
    return false;
  }
  return true;
}

function startInactivityWatcher() {
  const reset = () => recordActivity();
  ['click','keydown','scroll','mousemove','touchstart','visibilitychange'].forEach(evt => {
    try { window.addEventListener(evt, reset, { passive: true }); } catch (_) {}
  });
  setInterval(async () => {
    if (!(await isSessionActive())) {
      clearAuthSession();
      location.replace('index.html');
    }
  }, 60 * 1000);
}

 function mountLoginUI() {
  if (document.getElementById('auth-login-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'auth-login-modal';
  wrapper.style.cssText = 'position:fixed;inset:0;background:#fff;display:flex;align-items:center;justify-content:center;z-index:20000;';
  wrapper.innerHTML = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.25);max-width:360px;width:92%;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
      <div style="font-size:18px;font-weight:600;margin-bottom:14px;text-align:center;">座席管理システム-國枝版 へようこそ</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label style="font-size:13px;color:#555;">ユーザーID</label>
        <input id="auth-user-id" type="text" autocomplete="username" inputmode="text" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;" />
        <label style="font-size:13px;color:#555;">パスワード</label>
        <input id="auth-password" type="password" autocomplete="current-password" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;" />
        <button id="auth-login-btn" style="margin-top:6px;background:#007bff;color:#fff;border:none;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:600;cursor:pointer;">ログイン</button>
        <div id="auth-error" style="display:none;color:#d33;font-size:12px;text-align:center;margin-top:6px;">ログインに失敗しました</div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  let isSubmitting = false;
  const onSubmit = async () => {
    if (isSubmitting) return;
    const user = document.getElementById('auth-user-id');
    const pass = document.getElementById('auth-password');
    const err = document.getElementById('auth-error');
    const btn = document.getElementById('auth-login-btn');
    const uid = (user && user.value || '').trim();
    const pwd = (pass && pass.value || '').trim();
    // 直前のエラーをクリア
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (!uid || !pwd) {
      if (err) { err.style.display = 'block'; err.textContent = 'ユーザーIDとパスワードを入力してください'; }
      return;
    }
    // ローディング状態に
    try { if (btn) { btn.disabled = true; btn.textContent = 'ログイン中...'; btn.style.opacity = '0.7'; btn.style.cursor = 'not-allowed'; } } catch (_) {}
    isSubmitting = true;
    // サーバ側ログイン
    try {
      if (window.GasAPI && typeof GasAPI.login === 'function') {
        const res = await GasAPI.login(uid, pwd);
        if (!res || !res.success || !res.token) {
          if (err) { err.style.display = 'block'; err.textContent = 'ユーザーIDまたはパスワードが正しくありません'; }
          return;
        }
        setAuthSessionToken(res.token, uid);
      } else {
        if (err) { err.style.display = 'block'; err.textContent = '認証サービスが利用できません'; }
        return;
      }
    } catch (_) {
      if (err) { err.style.display = 'block'; err.textContent = '通信エラーが発生しました。接続を確認して再試行してください'; }
      return;
    } finally {
      // 成否にかかわらずボタンの状態を戻す（成功時は直後に閉じる）
      try { if (btn) { btn.disabled = false; btn.textContent = 'ログイン'; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; } } catch (_) {}
      isSubmitting = false;
    }
    // ログインUIを閉じる
    try { document.getElementById('auth-login-modal')?.remove(); } catch (_) {}
    recordActivity();
    startInactivityWatcher();
  };

  try { document.getElementById('auth-login-btn')?.addEventListener('click', onSubmit); } catch (_) {}
  try {
    document.getElementById('auth-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSubmit();
    });
  } catch (_) {}
}

async function ensureAuthenticatedOnIndex() {
  if (await isSessionActive()) {
    recordActivity();
    startInactivityWatcher();
    return;
  }
  mountLoginUI();
}

// ページ読み込み時に適用
 (async () => {
  try {
    const path = location.pathname;
    const isIndex = path.endsWith('index.html') || path === '/' || path === '';
    if (isIndex) {
      // index はログインUIを表示してから進ませる
      await ensureAuthenticatedOnIndex();
    } else {
      // 他ページは認証なければリダイレクト、あればウォッチ
      if (await enforceAuthOrRedirect()) {
        recordActivity();
        startInactivityWatcher();
      }
    }
  } catch (_) {}
 })();

// 公開API（必要に応じて使用）
window.AppAuth = {
  isSessionActive,
  clearAuthSession,
  enforceAuthOrRedirect,
  startInactivityWatcher,
  ensureAuthenticatedOnIndex
};


