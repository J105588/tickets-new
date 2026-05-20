export default class AdminSidebar {
    static getHTML(activePage) {
        const isDashboard = activePage === 'dashboard' || activePage === 'settings';
        
        let dashboardBtn = '';
        let settingsBtn = '';
        
        if (isDashboard) {
            dashboardBtn = `<button class="nav-btn ${activePage === 'dashboard' ? 'active' : ''}" id="nav-dashboard" onclick="window.switchTab ? window.switchTab('dashboard') : window.location.href='admin.html'">
                                <span class="nav-icon"><i class="fas fa-table-list"></i></span>予約管理
                            </button>`;
            settingsBtn = `<button class="nav-btn ${activePage === 'settings' ? 'active' : ''}" id="nav-settings" onclick="window.switchTab ? window.switchTab('settings') : window.location.href='admin.html?tab=settings'">
                                <span class="nav-icon"><i class="fas fa-sliders"></i></span>データ設定
                           </button>`;
        } else {
            dashboardBtn = `<a href="admin.html" class="nav-btn">
                                <span class="nav-icon"><i class="fas fa-table-list"></i></span>予約管理
                            </a>`;
            settingsBtn = `<a href="admin.html?tab=settings" class="nav-btn">
                                <span class="nav-icon"><i class="fas fa-sliders"></i></span>データ設定
                           </a>`;
        }

        return `
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
            <div class="sidebar-brand-icon">
                <img src="https://www.ichigaku.ac.jp/html/top/images/img_topics04.jpg" alt="Nチケ"
                    style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">
            </div>
            <div>
                <div class="sidebar-brand-name">Nチケ</div>
                <div class="sidebar-brand-sub">管理画面</div>
            </div>
        </div>

        <div class="sidebar-section">
            <div class="sidebar-section-label">ページ</div>
            <ul class="nav-links">
                <li>${dashboardBtn}</li>
                <li>${settingsBtn}</li>
                <li>
                    <a href="admin-logs.html" class="nav-btn ${activePage === 'logs' ? 'active' : ''}">
                        <span class="nav-icon"><i class="fas fa-terminal"></i></span>システムログ
                    </a>
                </li>
                <li>
                    <a href="monitoring-dashboard.html" class="nav-btn ${activePage === 'monitoring' ? 'active' : ''}">
                        <span class="nav-icon"><i class="fas fa-chart-line"></i></span>ダッシュボード
                    </a>
                </li>
            </ul>
        </div>

        <div class="sidebar-footer">
            <button class="sidebar-footer-btn" onclick="location.href='../index.html'">
                <i class="fas fa-house"></i> ホームへ戻る
            </button>
            <button class="sidebar-footer-btn danger" onclick="window.logout()">
                <i class="fas fa-right-from-bracket"></i> ログアウト
            </button>
        </div>
    </aside>
    <!-- Sidebar overlay (mobile) -->
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="window.closeSidebar()"></div>
        `;
    }
}
