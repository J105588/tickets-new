export default class AdminUI {
    static showLoading(text = '処理中...') {
        const loading = document.getElementById('loading');
        if (loading) {
            const textDiv = loading.querySelector('div:not(.loading-spinner) > div') || loading.querySelector('div');
            if (textDiv) textDiv.textContent = text;
            loading.style.display = 'flex';
        }
    }

    static hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }

    static showError(message) {
        let container = document.getElementById('error-container');
        if (!container) {
            // Create if missing
            container = document.createElement('div');
            container.id = 'error-container';
            container.style.cssText = 'display:none; background:#fff3f3; border:1px solid #f5c6cb; border-radius:8px; padding:12px 16px; margin-bottom:16px; color:#842029; font-size:14px; align-items:center; gap:8px;';
            container.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span id="error-message"></span>';
            const pageContent = document.querySelector('.page-content');
            if (pageContent) {
                pageContent.insertBefore(container, pageContent.firstChild);
            }
        }
        const msgEl = document.getElementById('error-message') || container.querySelector('span');
        if (msgEl) msgEl.textContent = message;
        container.style.display = 'flex';
    }

    static hideError() {
        const container = document.getElementById('error-container');
        if (container) container.style.display = 'none';
    }
}
