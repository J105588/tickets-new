/**
 * maintenance-check.js
 * 
 * すべての公開ページで読み込まれ、メンテナンス（計画停止）状態をチェックします。
 * GAS API (getMaintenanceSchedule) または Supabase (settings table) を参照します。
 * 
 * 動作:
 * 1. ページ読み込み時にメンテナンス状態を確認
 * 2. 期間内の場合、画面全体をロックするオーバーレイを表示
 * 3. 終了予定時刻を表示
 */

// maintenance-check.js
// すべての公開ページで読み込まれ、メンテナンス（計画停止）状態をチェックします。

(async function () {
    // 管理画面では常に実行しない
    if (window.location.pathname.includes('admin.html') || window.location.pathname.includes('admin-login.html')) {
        return;
    }

    const BYPASS_SESSION_KEY = 'maintenance_bypass_active';
    let currentSchedule = null;
    let bypassToken = null;

    async function fetchSettings() {
        // Resolve credentials
        let sbUrl = window.SUPABASE_URL;
        let sbKey = window.SUPABASE_ANON_KEY;

        if (!sbUrl && typeof SUPABASE_CONFIG !== 'undefined') {
            sbUrl = SUPABASE_CONFIG.url;
            sbKey = SUPABASE_CONFIG.anonKey;
        }

        // Fallback hardcoded credentials
        if (!sbUrl) {
            sbUrl = "https://dsmnqpcizmudfkfitrfg.supabase.co";
            sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzbW5xcGNpem11ZGZrZml0cmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5ODc3OTksImV4cCI6MjA3NDU2Mzc5OX0.0BBCmyV_IrZBch-hvPgW5HuG6-zgE7T1Hdvl7a-aB7g";
        }

        if (typeof supabase !== 'undefined' && sbUrl && sbKey) {
            // Get or create singleton client
            let client = window._maintSupabaseClient;
            if (!client) {
                client = supabase.createClient(sbUrl, sbKey, {
                    auth: {
                        persistSession: false,
                        storageKey: 'maintenance-check-token'
                    }
                });
                window._maintSupabaseClient = client;

                // Realtime Subscription (Initialize ONLY ONCE)
                client.channel('public:settings:maintenance_v2')
                    .on('postgres_changes',
                        { event: '*', schema: 'public', table: 'settings' },
                        (payload) => {
                            if (payload.new && payload.new.key === 'MAINTENANCE_SCHEDULE') {
                                try {
                                    currentSchedule = JSON.parse(payload.new.value);
                                    checkStatus();
                                } catch (e) { console.error(e); }
                            } else if (payload.new && payload.new.key === 'MAINTENANCE_BYPASS_TOKEN') {
                                bypassToken = payload.new.value;
                                checkBypass();
                            } else if (payload.eventType === 'DELETE' && payload.old.key === 'MAINTENANCE_SCHEDULE') {
                                currentSchedule = { enabled: false };
                                checkStatus();
                            }
                        }
                    )
                    .subscribe();
            }

            // Fetch Schedule AND Bypass Token
            const { data, error } = await client
                .from('settings')
                .select('key, value')
                .in('key', ['MAINTENANCE_SCHEDULE', 'MAINTENANCE_BYPASS_TOKEN']);

            if (!error && data) {
                // 1. Process Bypass Token
                const tokenRow = data.find(r => r.key === 'MAINTENANCE_BYPASS_TOKEN');
                if (tokenRow && tokenRow.value) {
                    bypassToken = tokenRow.value;
                    checkBypass();
                }

                // 2. Process Schedule
                const scheduleRow = data.find(r => r.key === 'MAINTENANCE_SCHEDULE');
                if (scheduleRow && scheduleRow.value) {
                    try {
                        currentSchedule = JSON.parse(scheduleRow.value);
                        checkStatus();
                    } catch (e) { }
                }
            }
        }
    }

    function checkBypass() {
        try {
            // Already active in session?
            if (sessionStorage.getItem(BYPASS_SESSION_KEY) === 'true') {
                return true;
            }

            // Check URL param against DB token
            if (bypassToken) {
                const urlParams = new URLSearchParams(window.location.search);
                const paramValue = urlParams.get('maintenance_bypass');

                if (paramValue === bypassToken) {
                    // Success: Activate session
                    sessionStorage.setItem(BYPASS_SESSION_KEY, 'true');
                    console.log('[Maintenance] Bypass activated via DB token match.');

                    // Clean URL
                    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.hash;
                    window.history.replaceState({ path: newUrl }, '', newUrl);

                    // Re-check status (should clear overlay)
                    checkStatus();
                    return true;
                }
            }
        } catch (e) { console.error(e); }
        return false;
    }

    function showMaintenanceOverlay(schedule) {
        if (document.getElementById('maintenance-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'maintenance-overlay';

        // Premium Solid Design
        overlay.style.cssText = `
            position: fixed; inset: 0; width: 100vw; height: 100vh;
            background: #f8f9fa; 
            z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: #333;
            animation: fadeIn 0.3s ease-out;
        `;

        let endTimeStr = '未定';
        if (schedule.end) {
            const d = new Date(schedule.end);
            if (!isNaN(d.getTime())) {
                endTimeStr = d.toLocaleString('ja-JP', {
                    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            }
        }

        // Icon
        const iconHtml = window.FontAwesome ? '<i class="fas fa-tools" style="font-size: 3rem; color: #6366f1;"></i>' :
            `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;

        overlay.innerHTML = `
            <style>
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
                .maint-card {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    text-align: center;
                    max-width: 480px;
                    width: 90%;
                    border: 1px solid rgba(0,0,0,0.05);
                }
                .maint-icon-wrapper {
                    width: 80px; height: 80px;
                    background: #e0e7ff;
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 24px;
                    animation: pulse 2s infinite;
                }
                .maint-title {
                    font-size: 1.75rem; font-weight: 700; margin-bottom: 12px; color: #111827;
                }
                .maint-desc {
                    font-size: 1rem; color: #6b7280; line-height: 1.6; margin-bottom: 32px;
                }
                .maint-time-box {
                    background: #f3f4f6;
                    padding: 16px;
                    border-radius: 12px;
                    display: inline-block;
                    width: 100%;
                }
                .maint-time-label {
                    display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;
                }
                .maint-time-val {
                    font-size: 1.25rem; font-weight: 700; color: #4338ca;
                }
                .maint-btn {
                    margin-top: 32px;
                    background: white; border: 1px solid #d1d5db; color: #374151;
                    padding: 10px 20px; border-radius: 8px; font-weight: 500;
                    cursor: pointer; transition: all 0.2s;
                    display: inline-flex; align-items: center; gap: 8px;
                }
                .maint-btn:hover { background: #f9fafb; border-color: #9ca3af; }
            </style>

            <div class="maint-card">
                <div class="maint-icon-wrapper">
                    ${iconHtml}
                </div>
                <h1 class="maint-title">システムメンテナンス中</h1>
                <p class="maint-desc">
                    現在、サービス向上のためメンテナンスを実施しております。<br>
                    ご不便をおかけしますが、終了までしばらくお待ちください。
                </p>
                <div class="maint-time-box">
                    <span class="maint-time-label">終了予定時刻</span>
                    <span class="maint-time-val">${endTimeStr}</span>
                </div>
                
                <div style="margin-top: 20px;">
                    <button class="maint-btn" onclick="location.reload()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        再読み込み
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    function checkStatus() {
        // If bypass is active, do NOT show overlay
        if (sessionStorage.getItem(BYPASS_SESSION_KEY) === 'true') {
            const ov = document.getElementById('maintenance-overlay');
            if (ov) {
                ov.remove();
                document.body.style.overflow = '';
            }
            return;
        }

        if (!currentSchedule || !currentSchedule.enabled) {
            const ov = document.getElementById('maintenance-overlay');
            if (ov) {
                ov.remove();
                document.body.style.overflow = '';
            }
            return;
        }

        const now = new Date();
        const start = currentSchedule.start ? new Date(currentSchedule.start) : new Date(0);
        const end = currentSchedule.end ? new Date(currentSchedule.end) : new Date(8640000000000000);

        if (now >= start && now <= end) {
            showMaintenanceOverlay(currentSchedule);
        } else {
            const ov = document.getElementById('maintenance-overlay');
            if (ov) ov.remove();
        }
    }

    // Interval Checks
    setInterval(checkStatus, 1000);
    // Poll every 3 seconds to ensure fresh data even if realtime disconnnects
    setInterval(fetchSettings, 3000);

    fetchSettings();

})();
