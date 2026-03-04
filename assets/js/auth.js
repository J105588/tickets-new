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
  // Security Fix: Removed dangerous URL parameter bypass (?admin=true)
  // Authentication must rely on valid storage presence (session/local)
  const urlParams = new URLSearchParams(window.location.search);

  // NOTE: If using iframe, ensure parent context shares sessionStorage or passes auth securely.
  // Current implementation shares sessionStorage within same origin.
  if (urlParams.get('mode') === 'admin') {
    // If explicit admin mode requested but no session, we fail through to isSessionActive checks
  }
  try {
    if (sessionStorage.getItem('admin_session') || sessionStorage.getItem('superadmin_session')) return true;
  } catch (_) { } if (!(await isSessionActive())) {
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
  const reset = () => {
    recordActivity();
    try {
      if (sessionStorage.getItem('admin_session') || sessionStorage.getItem('superadmin_session')) {
        sessionStorage.setItem('admin_last_active', String(Date.now()));
      }
    } catch (_) { }
  };
  ['click', 'keydown', 'scroll', 'mousemove', 'touchstart', 'visibilitychange'].forEach(evt => {
    try { window.addEventListener(evt, reset, { passive: true }); } catch (_) { }
  });
  setInterval(async () => {
    // Standard User Auth Check
    if (!(await isSessionActive())) {
      let isOnlyAdmin = false;
      try {
        isOnlyAdmin = !!(sessionStorage.getItem('admin_session') || sessionStorage.getItem('superadmin_session'));
      } catch (_) { }

      if (!isOnlyAdmin) {
        clearAuthSession();
        location.replace('../index.html');
        return;
      }
    }

    // Admin Auth Check
    try {
      const hasAdmin = sessionStorage.getItem('admin_session') || sessionStorage.getItem('superadmin_session');
      if (hasAdmin) {
        const lastAdminActive = parseInt(sessionStorage.getItem('admin_last_active') || '0', 10);
        if (lastAdminActive && (Date.now() - lastAdminActive) > AUTH_TIMEOUT_MS) {
          alert('一定時間操作がなかったため、自動的にログアウトしました。');
          sessionStorage.removeItem('admin_session');
          sessionStorage.removeItem('superadmin_session');
          sessionStorage.removeItem('admin_verified_at');
          sessionStorage.removeItem('admin_last_active');
          location.replace('admin-login.html'); // redirect properly based on path if needed
          // If they are on index or walkin, reloading to index is safer
          if (location.pathname.endsWith('index.html') || location.pathname === '/' || location.pathname === '') {
            location.replace('./');
          } else if (location.pathname.includes('/pages/')) {
            location.replace('admin-login.html');
          } else {
            location.replace('pages/admin-login.html');
          }
        }
      }
    } catch (_) { }

  }, 60 * 1000);
}

function mountLoginUI() {
  if (document.getElementById('auth-login-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'auth-login-modal';
  wrapper.style.cssText = 'position:fixed;inset:0;background:#fff;display:flex;align-items:center;justify-content:center;z-index:20000;';
  wrapper.innerHTML = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.25);max-width:360px;width:92%;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
      <div style="font-size:18px;font-weight:600;margin-bottom:14px;text-align:center;">ログイン</div>
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

      // 1. 黒寄りの漆黒オーバーレイ
      const overlay = document.createElement('div');
      overlay.id = 'opening-ceremony-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:30002',
        'background: radial-gradient(circle at center, #1b2a47 0%, #0c162c 100%)', // 深い紺色のグラデーション
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'opacity:0',
        'pointer-events:none',
        'overflow:hidden'
      ].join(';') + ';';

      // 2. 背景の巨大な透かし紋章
      const bgCrest = document.createElement('img');
      bgCrest.src = 'https://lh3.googleusercontent.com/pw/AP1GczNF7LLZlv3RdKkFgScUndLX8l0OqrTUUu9gn3or7vRSYZz7n07r3Ds_Em5d3v6KtshefwP1yEuWJ6cVlYbU21ZcwKj31XqLZcJveEQ7IrDCHVYmZetqhDe_URyiwUxHw_8zRJljfgyQgxSRFwrD6qkp=w365-h366-s-no-gm';
      bgCrest.alt = '';
      bgCrest.decoding = 'async';
      bgCrest.style.cssText = [
        'position:absolute',
        'width:clamp(400px, 90vw, 900px)',
        'height:auto',
        'opacity:0',
        'filter: grayscale(100%) contrast(120%) brightness(1.2) drop-shadow(0 0 40px rgba(139, 0, 0, 0.2))',
        'mix-blend-mode: color-dodge',
        'transform: rotate(-15deg) scale(1.1)',
        'pointer-events:none'
      ].join(';') + ';';

      // 3. コンテンツのラッパー
      const content = document.createElement('div');
      content.style.cssText = [
        'position:relative',
        'z-index:10',
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'justify-content:center',
        'text-align:center'
      ].join(';') + ';';

      // メインタイトル
      const title = document.createElement('div');
      title.textContent = 'Nチケ';
      title.style.cssText = [
        'font-family: "Georgia", "YuMincho", "Hiragino Mincho ProN", serif',
        'letter-spacing:0.4em',
        'font-weight:600',
        'font-size:clamp(42px, 8vw, 84px)',
        'opacity:0',
        'color:transparent',
        'background: linear-gradient(135deg, #f8f9fa 0%, #dcdcdc 50%, #ffffff 100%)', // 白系統にえんじ色の反射光
        '-webkit-background-clip: text',
        'background-clip: text',
        'transform:translateY(30px)',
        'margin-left:0.4em'
      ].join(';') + ';';

      // 装飾ライン
      const line = document.createElement('div');
      line.style.cssText = [
        'width:0px',
        'height:1px',
        'background: linear-gradient(90deg, transparent, rgba(139, 0, 0, 0.9), rgba(180, 20, 20, 1), rgba(139, 0, 0, 0.9), transparent)', // えんじ色のアクセントライン
        'margin: 28px 0',
        'opacity:0'
      ].join(';') + ';';

      // サブタイトル
      const subtitle = document.createElement('div');
      subtitle.textContent = '市川学園座席管理システム';
      subtitle.style.cssText = [
        'font-family: "Shippori Mincho", "YuMincho", "Hiragino Mincho ProN", serif',
        'letter-spacing:0.8em',
        'font-size:clamp(12px, 1.8vw, 16px)',
        'font-weight:400',
        'opacity:0',
        'color:rgba(255, 255, 255, 0.75)',
        'transform:translateY(-20px)',
        'margin-left:0.8em'
      ].join(';') + ';';

      content.appendChild(title);
      content.appendChild(line);
      content.appendChild(subtitle);

      overlay.appendChild(bgCrest);
      overlay.appendChild(content);
      document.body.appendChild(overlay);

      // 禁止: スクロール
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const prevBodyOverflow = document.body.style.overflow;
      try {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
      } catch (_) { }

      const finish = () => {
        try {
          overlay.style.transition = 'opacity 1.8s cubic-bezier(0.4, 0, 0.2, 1)';
          overlay.style.opacity = '0';
          content.style.transition = 'transform 1.8s cubic-bezier(0.4, 0, 0.2, 1)';
          content.style.transform = 'scale(1.05)';
          bgCrest.style.transition = 'transform 10s ease-out, opacity 1s ease'; // transformを維持してopacityだけ変える
          bgCrest.style.opacity = '0';
          setTimeout(() => {
            try { overlay.remove(); } catch (_) { }
            try {
              document.documentElement.style.overflow = prevHtmlOverflow || '';
              document.body.style.overflow = prevBodyOverflow || '';
            } catch (_) { }
            resolve();
          }, 1850);
        } catch (_) {
          resolve();
        }
      };

      if (reduced) {
        overlay.style.opacity = '1';
        title.style.opacity = '1';
        title.style.transform = 'translateY(0)';
        line.style.width = 'clamp(200px, 40vw, 400px)';
        line.style.opacity = '1';
        subtitle.style.opacity = '1';
        subtitle.style.transform = 'translateY(0)';
        setTimeout(finish, 800);
        return;
      }

      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';

      // アニメーションステップ
      setTimeout(() => {
        requestAnimationFrame(() => {
          // 1. 巨大な透かしエンブレムが極低速で回転しながら現れる
          bgCrest.style.transition = 'transform 10s ease-out, opacity 4s ease';
          bgCrest.style.opacity = '0.12'; // 暗い背景に上品に
          bgCrest.style.transform = 'rotate(0deg) scale(1)';

          // 2. 中央のラインが左右に伸びる
          setTimeout(() => {
            line.style.transition = 'width 1.8s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 1.5s ease';
            line.style.width = 'clamp(240px, 50vw, 500px)';
            line.style.opacity = '1';
          }, 600);

          // 3. タイトル 「Nチケ」 が浮かび上がる
          setTimeout(() => {
            title.style.transition = 'opacity 2.5s ease, transform 3s cubic-bezier(0.16, 1, 0.3, 1), filter 3s ease';
            title.style.opacity = '1';
            title.style.transform = 'translateY(0)';
            title.style.filter = 'drop-shadow(0 0 24px rgba(255, 255, 255, 0.15)) drop-shadow(0 4px 12px rgba(139, 0, 0, 0.4))'; // 薄くえんじ色の後光
          }, 1200);

          // 4. サブタイトルが下りてくる
          setTimeout(() => {
            subtitle.style.transition = 'opacity 2s ease, transform 2s cubic-bezier(0.16, 1, 0.3, 1)';
            subtitle.style.opacity = '1';
            subtitle.style.transform = 'translateY(0)';
          }, 2000);

          // 全体が余韻をもってフェードアウト
          setTimeout(finish, 5800);
        });
      }, 200);

    } catch (_) {
      resolve();
    }
  });
}

