/**
 * maintenance-check.js
 * * すべての公開ページで読み込まれ、メンテナンス（計画停止）状態をチェックします。
 * GAS API (getMaintenanceSchedule) または Supabase (settings table) を参照します。
 * * 動作:
 * 1. ページ読み込み時にメンテナンス状態を確認
 * 2. 期間内の場合、画面全体をロックするオーバーレイを表示
 * 3. 終了予定時刻を表示
 */

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

        // Updated Premium Visuals
        overlay.style.cssText = `
            position: fixed; inset: 0; width: 100vw; height: 100vh;
            background-color: #f3f4f6;
            background-image: radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%), 
                              radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.15) 0px, transparent 50%);
            z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: #1f2937;
            animation: fadeIn 0.5s ease-out;
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

        const iconHtml = window.FontAwesome ? '<i class="fas fa-hammer" style="font-size: 2.5rem; color: #4f46e5;"></i>' :
            `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;

        overlay.innerHTML = `
            <style>
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
                .maint-card {
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    padding: 48px 32px;
                    border-radius: 24px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
                    text-align: center;
                    max-width: 440px;
                    width: 90%;
                    border: 1px solid rgba(255, 255, 255, 0.4);
                }
                .maint-icon-container {
                    width: 96px; height: 96px;
                    background: #ffffff;
                    border-radius: 24px;
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 32px;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
                    animation: float 4s ease-in-out infinite;
                }
                .maint-title {
                    font-size: 1.5rem; font-weight: 800; margin-bottom: 16px; color: #111827; letter-spacing: -0.025em;
                }
                .maint-desc {
                    font-size: 0.95rem; color: #4b5563; line-height: 1.6; margin-bottom: 32px;
                }
                .maint-status-badge {
                    display: inline-flex; align-items: center; gap: 6px;
                    background: #eef2ff; color: #4338ca;
                    padding: 6px 14px; border-radius: 9999px;
                    font-size: 0.75rem; font-weight: 700; margin-bottom: 20px;
                    text-transform: uppercase; letter-spacing: 0.05em;
                }
                .maint-status-dot {
                    width: 8px; height: 8px; background: #6366f1; border-radius: 50%;
                    animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
                .maint-time-card {
                    background: #ffffff;
                    padding: 20px;
                    border-radius: 16px;
                    border: 1px solid #f3f4f6;
                    box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02);
                }
                .maint-time-label {
                    display: block; font-size: 0.75rem; font-weight: 600; color: #9ca3af; margin-bottom: 4px;
                }
                .maint-time-val {
                    font-size: 1.15rem; font-weight: 700; color: #111827;
                }
                .maint-btn {
                    margin-top: 32px; width: 100%;
                    background: #111827; color: white;
                    padding: 14px 24px; border-radius: 12px; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                    border: none; display: flex; align-items: center; justify-content: center; gap: 10px;
                }
                .maint-btn:hover { background: #1f2937; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .maint-btn:active { transform: translateY(0px); }
            </style>

            <div class="maint-card">
                <div class="maint-status-badge">
                    <span class="maint-status-dot"></span>
                    Maintenance
                </div>
                <div class="maint-icon-container">
                    ${iconHtml}
                </div>
                <h1 class="maint-title">ただいまメンテナンス中です</h1>
                <p class="maint-desc">
                    現在システムメンテナンスを行っております。</br>ご不便をおかけしますが、再開まで今しばらくお待ちください。
                </p>
                <div class="maint-time-card">
                    <span class="maint-time-label">終了予定時刻</span>
                    <span class="maint-time-val">${endTimeStr}</span>
                </div>
                
                <button class="maint-btn" onclick="location.reload()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    最新の状態を確認する
                </button>
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