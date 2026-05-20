export default class AdminAuth {
    static SESSION_TIMEOUT_MS = 30 * 60 * 1000;
    static watchersStarted = false;

    static check() {
        const session = sessionStorage.getItem('admin_session');
        let lastActive = sessionStorage.getItem('admin_last_active');

        // Fallback for existing sessions without last_active
        if (session && !lastActive) {
            lastActive = new Date().getTime().toString();
            sessionStorage.setItem('admin_last_active', lastActive);
        }

        if (!session) {
            this.redirectLogin();
            return false;
        }

        const now = new Date().getTime();
        if (now - parseInt(lastActive) > this.SESSION_TIMEOUT_MS) {
            // Use native alert since CustomDialog might not be ready
            alert('一定時間操作がなかったため、ログアウトしました。');
            this.forceLogout();
            return false;
        }

        // Update last active
        this.updateActivity();

        // Start interaction tracking and inactivity timer
        this.startWatchers();

        return true;
    }

    static updateActivity() {
        sessionStorage.setItem('admin_last_active', new Date().getTime().toString());
    }

    static startWatchers() {
        if (this.watchersStarted) return;
        this.watchersStarted = true;

        // User interaction tracking
        let activityThrottle = false;
        ['mousedown', 'keydown', 'touchstart'].forEach(evt => {
            document.addEventListener(evt, () => {
                if (!activityThrottle) {
                    this.updateActivity();
                    activityThrottle = true;
                    setTimeout(() => activityThrottle = false, 10000); // 10s throttle
                }
            });
        });

        // Inactivity Watcher Loop (checks every minute)
        setInterval(() => {
            const last = parseInt(sessionStorage.getItem('admin_last_active') || '0', 10);
            if (last && (new Date().getTime() - last) > this.SESSION_TIMEOUT_MS) {
                alert('一定時間操作がなかったため、自動的にログアウトしました。');
                this.forceLogout();
            }
        }, 60 * 1000);
    }

    static logout() {
        this.forceLogout();
    }

    static forceLogout() {
        sessionStorage.removeItem('admin_session');
        sessionStorage.removeItem('admin_verified_at');
        sessionStorage.removeItem('admin_last_active');
        this.redirectLogin();
    }

    static redirectLogin() {
        window.location.replace('admin-login.html');
    }
}
