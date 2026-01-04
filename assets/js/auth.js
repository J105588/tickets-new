// auth.js

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
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (_) { }
  try { localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY); } catch (_) { }
}

function recordActivity() {
  try { localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(authNow())); } catch (_) { }
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
  // Admin Backdoor: Skip all checks if admin=true in URL
  // Admin Backdoor Removed for Security


  if (!(await isSessionActive())) {
    clearAuthSession();
    if (!location.pathname.endsWith('index.html') && location.pathname !== '/' && location.pathname !== '') {
      location.replace('../index.html');
      return false;
    }
    return false;
  }
  return true;
}

function startInactivityWatcher() {
  const reset = () => recordActivity();
  ['click', 'keydown', 'scroll', 'mousemove', 'touchstart', 'visibilitychange'].forEach(evt => {
    try { window.addEventListener(evt, reset, { passive: true }); } catch (_) { }
  });
  setInterval(async () => {
    if (!(await isSessionActive())) {
      clearAuthSession();
      location.replace('../index.html');
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
      <div style="font-size:18px;font-weight:600;margin-bottom:14px;text-align:center;">市川学園座席管理システムへ ようこそ</div>
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

  // スクロールを禁止（既存値を保持して後で戻す）
  const prevHtmlOverflow = document.documentElement.style.overflow;
  const prevBodyOverflow = document.body.style.overflow;
  try {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  } catch (_) { }

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
    try { if (btn) { btn.disabled = true; btn.textContent = 'ログイン中...'; btn.style.opacity = '0.7'; btn.style.cursor = 'not-allowed'; } } catch (_) { }
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
      try { if (btn) { btn.disabled = false; btn.textContent = 'ログイン'; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; } } catch (_) { }
      isSubmitting = false;
    }
    // ログインUIを閉じる（スクロールを元に戻す）
    try {
      document.documentElement.style.overflow = prevHtmlOverflow || '';
      document.body.style.overflow = prevBodyOverflow || '';
    } catch (_) { }
    // ログインUIを閉じる
    try { document.getElementById('auth-login-modal')?.remove(); } catch (_) { }
    recordActivity();
    startInactivityWatcher();
  };

  try { document.getElementById('auth-login-btn')?.addEventListener('click', onSubmit); } catch (_) { }
  try {
    document.getElementById('auth-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSubmit();
    });
  } catch (_) { }
}

async function ensureAuthenticatedOnIndex() {
  if (await isSessionActive()) {
    recordActivity();
    startInactivityWatcher();
    return;
  }
  // 先にログインモーダルを表示し、その上にオープニング層を被せる
  mountLoginUI();
  try {
    await showOpeningCeremony();
  } catch (_) { }
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
  } catch (_) { }
})();

// 公開API（必要に応じて使用）
window.AppAuth = {
  isSessionActive,
  clearAuthSession,
  enforceAuthOrRedirect,
  startInactivityWatcher,
  ensureAuthenticatedOnIndex,
  getToken: () => { const s = getAuthSession(); return s ? s.token : null; }
};


// 厳かなオープニングアニメーション（未認証時のみ）
async function showOpeningCeremony() {
  return new Promise((resolve) => {
    try {
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const overlay = document.createElement('div');
      overlay.id = 'opening-ceremony-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:30002',
        'background:	#EEEEEE',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'opacity:0',
        'pointer-events:none'
      ].join(';') + ';';

      const wrapper = document.createElement('div');
      wrapper.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'justify-content:center',
        'gap:20px',
        'color:#333',
        'text-align:center'
      ].join(';') + ';';

      const crest = document.createElement('img');
      crest.src = 'https://www.ichigaku.ac.jp/html/top/images/img_topics04.jpg';
      crest.alt = '';
      crest.decoding = 'async';
      crest.style.cssText = [
        'width:clamp(160px, 32vw, 300px)',
        'height:auto',
        'opacity:0',
        'transform: scale(0.98) translateY(4px)'
      ].join(';') + ';';

      const title = document.createElement('div');
      title.textContent = '市川学園座席管理システム';
      title.style.cssText = [
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
        'letter-spacing:0.35em',
        'text-indent:0.35em',
        'font-weight:600',
        'font-size:clamp(14px, 1.8vw, 18px)',
        'opacity:0',
        'color:#333'
      ].join(';') + ';';

      wrapper.appendChild(crest);
      wrapper.appendChild(title);
      overlay.appendChild(wrapper);
      document.body.appendChild(overlay);

      // 禁止: スクロール
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const prevBodyOverflow = document.body.style.overflow;
      try {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
      } catch (_) { }

      const runNoMotion = () => {
        overlay.style.opacity = '1';
        crest.style.opacity = '1';
        crest.style.transform = 'none';
        title.style.opacity = '1';
        setTimeout(finish, 600);
      };

      const finish = () => {
        try {
          overlay.style.transition = 'opacity 800ms ease';
          overlay.style.opacity = '0';
          setTimeout(() => {
            try { overlay.remove(); } catch (_) { }
            try {
              document.documentElement.style.overflow = prevHtmlOverflow || '';
              document.body.style.overflow = prevBodyOverflow || '';
            } catch (_) { }
            resolve();
          }, 820);
        } catch (_) {
          resolve();
        }
      };

      if (reduced) {
        // 低モーション: 簡易表示
        requestAnimationFrame(runNoMotion);
        return;
      }

      // まず画面を即時覆う（モーダルを隠す）
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';

      // 少し遅延してからコンテンツのみゆっくりフェードイン
      setTimeout(() => {
        requestAnimationFrame(() => {
          // 紋章のゆっくりフェードイン
          crest.style.transition = 'transform 1200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 1200ms ease';
          crest.style.opacity = '1';
          crest.style.transform = 'scale(1) translateY(0)';

          // タイトルの遅延淡入
          setTimeout(() => {
            title.style.transition = 'opacity 900ms ease';
            title.style.opacity = '1';
          }, 350);

          // 合計約3.5秒後にフェードアウト
          setTimeout(finish, 3500);
        });
      }, 350); // リロード完了後、少し間を空ける
    } catch (_) {
      resolve();
    }
  });
}

