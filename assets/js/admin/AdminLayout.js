import AdminAuth from './AdminAuth.js';
import AdminSidebar from './AdminSidebar.js';
import AdminUI from './AdminUI.js';

export default class AdminLayout {
    static init(activePage) {
        // Double check authentication
        if (!AdminAuth.check()) return false;

        // Expose globally for inline event handlers and modules
        window.AdminLayout = this;

        // Inject Sidebar
        const container = document.getElementById('admin-sidebar-container');
        if (container) {
            container.innerHTML = AdminSidebar.getHTML(activePage);
        }

        // Check if there is a tab request in URL for admin.html
        if (window.location.search.includes('tab=settings') && typeof window.switchTab === 'function') {
            setTimeout(() => window.switchTab('settings'), 50);
        }

        return true;
    }

    static toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
    }

    static closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }

    static logout() {
        AdminAuth.logout();
    }
    
    static showLoading(text) { AdminUI.showLoading(text); }
    static hideLoading() { AdminUI.hideLoading(); }
    static showError(msg) { AdminUI.showError(msg); }
    static hideError() { AdminUI.hideError(); }
}

// Expose functions globally for legacy inline DOM onclick handlers
window.toggleSidebar = AdminLayout.toggleSidebar;
window.closeSidebar = AdminLayout.closeSidebar;
window.logout = AdminLayout.logout;
