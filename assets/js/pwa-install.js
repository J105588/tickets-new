// PWA Install Prompt Handler
class PWAInstallHandler {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.isInstalled = false;

    this.init();
  }

  init() {
    // インストール済みかチェック
    this.checkIfInstalled();

    // インストールプロンプトのイベントリスナー
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA install prompt triggered');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    // インストール完了のイベントリスナー
    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed');
      this.isInstalled = true;
      this.hideInstallButton();
    });

    // ページ読み込み時にインストールボタンをチェック
    window.addEventListener('load', () => {
      this.createInstallButton();
      this.maybeShowOSSpecificBanner();
      // Windows ではプロンプト未発火時でもボタンを表示して手動導線を用意
      const { isWindows } = this.detectPlatform();
      if (!this.isInstalled && isWindows) {
        this.showInstallButton();
      }
    });
  }

  checkIfInstalled() {
    // スタンドアロンモードかチェック
    if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
      this.isInstalled = true;
    }
  }

  detectPlatform() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isWindows = /Windows NT/i.test(ua);
    return { isIOS, isWindows };
  }

  maybeShowOSSpecificBanner() {
    if (this.isInstalled) return;
    const { isIOS, isWindows } = this.detectPlatform();
    // iOS Safari は beforeinstallprompt が無いのでガイダンス出す
    if (isIOS) {
      this.showInstallBanner('iOS', '共有ボタン → 「ホーム画面に追加」 でインストールできます。');
      return;
    }
    // Windows Chrome/Edge の場合も初回ガイダンス
    if (isWindows) {
      this.showInstallBanner('Windows', 'アドレスバー右端の「インストール」アイコンから追加できます。');
    }
  }

  showInstallBanner(osLabel, message) {
    // 既に表示済みならスキップ
    if (document.getElementById('pwa-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #0d6efd;
      color: #fff;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10000;
      box-shadow: 0 -6px 20px rgba(0,0,0,.15);
    `;
    banner.innerHTML = `
      <div style="font-weight:600;">インストールのご案内（${osLabel}）</div>
      <div style="flex:1;opacity:.95;">${message}</div>
      <button id="pwa-install-now" style="background:#ffffff; color:#0d6efd; border:none; padding:6px 10px; border-radius:6px; font-weight:600; cursor:pointer;">今すぐ</button>
      <button id="pwa-install-dismiss" style="background:transparent; color:#ffffff; border:1px solid rgba(255,255,255,.5); padding:6px 10px; border-radius:6px; cursor:pointer;">閉じる</button>
    `;
    document.body.appendChild(banner);
    const dismiss = () => banner.remove();
    document.getElementById('pwa-install-dismiss').addEventListener('click', dismiss);
    document.getElementById('pwa-install-now').addEventListener('click', () => {
      // iOS は手順モーダル、Windows/他は可能ならプロンプト
      if (this.deferredPrompt) {
        this.installApp();
      } else {
        this.showManualInstallInstructions();
      }
      dismiss();
    });
  }

  createInstallButton() {
    if (this.isInstalled) return;

    // シンプルなインストールボタンを作成
    this.installButton = document.createElement('button');
    this.installButton.id = 'pwa-install-btn';
    // OSに応じて表記を最適化（Windowsではダウンロード表記）
    const { isWindows } = this.detectPlatform();
    this.installButton.innerHTML = isWindows ? 'ダウンロード' : 'インストール';
    this.installButton.className = 'pwa-install-btn';
    this.installButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      z-index: 1000;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    `;

    // シンプルなホバー効果
    this.installButton.addEventListener('mouseenter', () => {
      this.installButton.style.background = '#0056b3';
    });

    this.installButton.addEventListener('mouseleave', () => {
      this.installButton.style.background = '#007bff';
    });

    // クリックイベント
    this.installButton.addEventListener('click', () => {
      this.installApp();
    });

    document.body.appendChild(this.installButton);
  }

  showInstallButton() {
    if (this.installButton && !this.isInstalled) {
      this.installButton.style.display = 'block';
    }
  }

  hideInstallButton() {
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      // フォールバック: 手動インストール手順を表示
      this.showManualInstallInstructions();
      return;
    }

    try {
      // インストールプロンプトを表示
      this.deferredPrompt.prompt();

      // ユーザーの選択を待つ
      const { outcome } = await this.deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }

      // プロンプトをクリア
      this.deferredPrompt = null;
      this.hideInstallButton();
    } catch (error) {
      console.error('Error during PWA installation:', error);
      this.showManualInstallInstructions();
    }
  }

  showManualInstallInstructions() {
    // シンプルな手動インストール手順のモーダルを表示
    const modal = document.createElement('div');
    modal.className = 'pwa-install-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 350px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    content.innerHTML = `
      <h3 style="margin-top: 0; color: #333; font-size: 16px;">アプリをインストール</h3>
      <p style="color: #666; line-height: 1.4; font-size: 14px; margin: 10px 0;">
        <strong>Chrome/Edge:</strong> アドレスバーの「インストール」ボタン
      </p>
      <p style="color: #666; line-height: 1.4; font-size: 14px; margin: 10px 0;">
        <strong>Safari (iOS):</strong> 共有ボタン → 「ホーム画面に追加」
      </p>
      <p style="color: #666; line-height: 1.4; font-size: 14px; margin: 10px 0;">
        <strong>Firefox:</strong> アドレスバーの「+」ボタン
      </p>
      <button onclick="this.closest('.pwa-install-modal').remove()" 
              style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 15px; font-size: 14px;">
        閉じる
      </button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
}

// PWAインストールハンドラーを初期化
document.addEventListener('DOMContentLoaded', () => {
});
