/**
 * supabase-client.js
 * Supabase JSクライアントの初期化とラッパー
 * 依存: config.js, @supabase/supabase-js (CDN)
 */

import { SUPABASE_CONFIG, GAS_API_URLS } from './config.js';

// シングルトンインスタンス
let supabaseInstance = null;

// クライアント初期化
function getSupabase() {
    if (supabaseInstance) return supabaseInstance;

    if (!window.supabase) {
        console.error('Supabase JS library not loaded. Check script tags.');
        return null;
    }

    if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey || SUPABASE_CONFIG.url.includes('YOUR_')) {
        console.error('Supabase configuration missing in config.js');
        return null;
    }

    try {
        supabaseInstance = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        return supabaseInstance;
    } catch (e) {
        console.error('Failed to initialize Supabase client:', e);
        return null;
    }
}

// データ取得ヘルパー
export async function fetchMasterDataFromSupabase() {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'Supabase client not initialized' };

    try {
        // Parallel fetch: Supabase Tables + Settings
        const [groups, dates, timeslots, settings] = await Promise.all([
            sb.from('groups').select('*').order('display_order'),
            sb.from('event_dates').select('*').order('display_order'),
            sb.from('time_slots').select('*').order('display_order'),
            sb.from('settings').select('value').eq('key', 'RESERVATION_DEADLINE').maybeSingle()
        ]);

        if (groups.error) throw groups.error;
        if (dates.error) throw dates.error;
        if (timeslots.error) throw timeslots.error;

        // Extract deadline
        const globalDeadline = (settings.data) ? settings.data.value : null;

        return {
            success: true,
            data: {
                groups: groups.data,
                dates: dates.data,
                timeslots: timeslots.data,
                global_deadline: globalDeadline
            }
        };
    } catch (e) {
        return { success: false, error: e.message || 'Unknown error' };
    }
}

export async function fetchMasterGroups() {
    const sb = getSupabase();
    if (!sb) return [];

    // active only for filters
    const { data, error } = await sb.from('groups').select('*').eq('is_active', true).order('display_order');
    if (error) {
        console.error(error);
        return [];
    }
    return data;
}

export async function fetchMasterTimeslots(groupName = null) {
    const sb = getSupabase();
    if (!sb) return [];

    // If groupName provided, might need filtering, but currently master timeslots are global or we filter by convention.
    // For now returning all timeslots.
    const { data, error } = await sb.from('time_slots').select('*').order('display_order');

    if (error) {
        console.error('fetchMasterTimeslots error:', error);
        return [];
    }
    return data;
}

export async function fetchPerformancesFromSupabase(groupName) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'Supabase client not initialized' };

    try {
        const { data, error } = await sb
            .from('performances')
            .select('day, timeslot, id')
            .eq('group_name', groupName);

        if (error) throw error;

        return { success: true, data: data };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function fetchSeatsFromSupabase(group, day, timeslot) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'Supabase client not initialized' };

    try {
        // 1. Get Performance ID
        const { data: perfData, error: perfError } = await sb
            .from('performances')
            .select('id')
            .eq('group_name', group)
            .eq('day', day)
            .eq('timeslot', timeslot)
            .single();

        if (perfError) throw new Error('公演が見つかりません');
        if (!perfData) throw new Error('公演データなし');

        const performanceId = perfData.id;

        // 2. Get Seats
        const { data: seatsData, error: seatsError } = await sb
            .from('seats')
            .select('seat_id, status, row_letter, seat_number')
            .eq('performance_id', performanceId);

        if (seatsError) throw seatsError;

        return { success: true, data: seatsData };

    } catch (e) {
        return { success: false, error: e.message };
    }
}

export function subscribeToSeatUpdates(bookingId, onUpdate) {
    const sb = getSupabase();
    if (!sb) return null;

    console.log(`Subscribing to updates for booking_id=${bookingId}`);

    const channel = sb.channel(`booking-${bookingId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'seats',
                filter: `booking_id=eq.${bookingId}`
            },
            (payload) => {
                console.log('Realtime update received:', payload);
                if (onUpdate) onUpdate(payload.new);
            }
        )
        .subscribe();

    return channel;
}

export function subscribeToReservationUpdates(bookingId, onUpdate) {
    const sb = getSupabase();
    if (!sb) return null;

    console.log(`Subscribing to RESERVATION updates for booking_id=${bookingId}`);

    const channel = sb.channel(`reservation-${bookingId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'bookings',
                filter: `id=eq.${bookingId}`
            },
            (payload) => {
                console.log('Realtime reservation update:', payload);
                if (onUpdate) onUpdate(payload.new);
            }
        )
        .subscribe();

    return channel;
}

export async function checkInReservation(id, passcode) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'System Error' };

    try {
        const { data, error } = await sb.rpc('check_in_reservation', {
            p_reservation_id: parseInt(id),
            p_passcode: passcode || ''
        });

        if (error) throw error;
        return data;

    } catch (e) {
        console.error('RPC Error:', e);
        return { success: false, error: e.message };
    }
}

export async function getBookingForScan(id) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'System Error' };

    try {
        const { data, error } = await sb.rpc('get_booking_for_scan', {
            p_id: parseInt(id)
        });

        if (error) throw error;
        return data;

    } catch (e) {
        console.error('RPC Error:', e);
        return { success: false, error: e.message };
    }
}

// --- Admin API Wrappers (GAS JSONP) ---

export async function adminGetReservations(filters) {
    try {
        const params = {
            action: 'admin_get_reservations',
            ...filters
        };
        // Ensure numbers are strings or handle in GAS
        if (filters.day) params.day = filters.day;
        if (filters.year) params.year = filters.year;

        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminUpdateBooking(bookingData) {
    try {
        const params = {
            action: 'admin_update_reservation',
            id: bookingData.id,
            name: bookingData.name,
            email: bookingData.email,
            grade_class: bookingData.grade_class,
            club_affiliation: bookingData.club_affiliation,
            club_affiliation: bookingData.club_affiliation,
            notes: bookingData.notes,
            status: bookingData.status
        };
        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminCancelBooking(id) {
    try {
        const params = {
            action: 'admin_cancel_reservation',
            id: id
        };
        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminResendEmail(id) {
    try {
        const params = {
            action: 'admin_resend_email',
            id: id
        };
        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminSwapSeats(id, newSeats) {
    try {
        const params = {
            action: 'admin_change_seats',
            id: id,
            seats: Array.isArray(newSeats) ? newSeats.join(',') : newSeats
        };
        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminManageMaster(table, op, recordData) {
    try {
        const params = {
            action: 'admin_manage_master',
            table: table,
            op: op, // 'save' or 'delete'
            data: JSON.stringify(recordData) // Pass complete object as string
        };

        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Bulk Summary Email
export async function adminSendSummaryEmails(payload, endpointUrl = null) {
    try {
        const params = {
            action: 'admin_send_summary_email',
            jobs: JSON.stringify(payload)
        };
        // Use provided URL or default to first (though logic should provide one)
        const url = endpointUrl || GAS_API_URLS[0];
        const result = await jsonpRequest(url, params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}



// GAS API Wrapper for Schedule Management (Since complex join updates/saves are better handled in GAS for now)
// Note: config.js exports GAS_API_URLS. supabase-client.js imports SUPABASE_CONFIG. Let's add GAS_API_URLS to imports.

/**
 * JSONP Helper
 * @param {string} url Base URL
 * @param {Object} params Query parameters
 * @returns {Promise<Object>}
 */
function jsonpRequest(url, params = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = 'gasCallback_' + Math.round(100000 * Math.random());
        const script = document.createElement('script');

        window[callbackName] = (data) => {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };

        script.onerror = (err) => {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request failed'));
        };

        // Construct query string
        const queryParams = new URLSearchParams(params);
        queryParams.set('callback', callbackName);
        queryParams.set('t', Date.now()); // Cache buster

        script.src = `${url}?${queryParams.toString()}`;
        document.body.appendChild(script);
    });
}

export async function adminFetchSchedules() {
    try {
        const result = await jsonpRequest(GAS_API_URLS[0], { action: 'get_all_schedules' });
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminManageSchedule(scheduleData) {
    try {
        // save_schedule uses data in query params for JSONP
        const params = {
            action: 'save_schedule',
            group_name: scheduleData.group_name,
            day: scheduleData.day,
            timeslot: scheduleData.timeslot
        };
        if (scheduleData.id) {
            params.id = scheduleData.id;
        }
        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Direct Supabase Access for Rebooking (Bypassing GAS)
export async function getBookingWithSeats(bookingId) {
    // Use RPC 'get_booking_for_scan' to bypass RLS and fetch full details
    // This allows rebooking via ID even if public 'select' is restricted
    try {
        const result = await getBookingForScan(bookingId);
        // Ensure result structure matches expectation (res.success, res.data.seats)
        if (result && result.success) {
            return result;
        }
        // Fallback or error
        return result || { success: false, error: 'Booking lookup failed' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Expose to Global Scope for non-module scripts (seats-main.js)
if (typeof window !== 'undefined') {
    window.SupabaseClient = {
        getBookingWithSeats,
        fetchMasterDataFromSupabase,
        fetchSeatsFromSupabase,
        adminGetReservations,
        adminUpdateBooking,
        adminCancelBooking,
        adminResendEmail,
        adminSwapSeats,
        adminFetchSchedules,
        adminManageSchedule,
        adminManageMaster,
        adminSendSummaryEmails,
        adminResetPerformance
    };
}

export async function adminDeleteSchedule(id) {
    try {
        const params = {
            action: 'delete_schedule',
            id: id
        };
        const result = await jsonpRequest(GAS_API_URLS[0], params);
        return result;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminResetPerformance(performanceId) {
    return await jsonpRequest(GAS_API_URLS[0], {
        action: 'admin_reset_performance',
        performanceId: performanceId
    });
}

export async function adminGenerateInviteToken(minutes = 30) {
    return await jsonpRequest(GAS_API_URLS[0], {
        action: 'admin_generate_invite_token',
        minutes: minutes
    });
}

// Unified Admin/Client Settings Access (Direct DB)
export async function adminDeadlineSettings(op, value = null) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'Supabase client not initialized' };

    try {
        if (op === 'get') {
            const { data, error } = await sb
                .from('settings')
                .select('value')
                .eq('key', 'RESERVATION_DEADLINE')
                .maybeSingle();

            if (error) throw error;
            return { success: true, deadline: data ? data.value : null };
        }
        else if (op === 'save') {
            if (!value) {
                // Delete
                const { error } = await sb
                    .from('settings')
                    .delete()
                    .eq('key', 'RESERVATION_DEADLINE');
                if (error) throw error;
            } else {
                // Upsert
                const { error } = await sb
                    .from('settings')
                    .upsert({
                        key: 'RESERVATION_DEADLINE',
                        value: value,
                        updated_at: new Date().toISOString()
                    });
                if (error) throw error;
            }
            return { success: true };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// 時間同期 (Server Time Sync)
export async function getServerTime() {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.rpc('get_server_time');
    if (error) {
        console.error('Time sync failed:', error);
        return new Date(); // Fallback to local
    }
    return new Date(data);
}

// 締め切り監視 (Realtime)
export function subscribeToDeadline(onUpdate) {
    const sb = getSupabase();
    if (!sb) return null;

    return sb.channel('public:settings')
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'key=eq.RESERVATION_DEADLINE' },
            (payload) => {
                onUpdate(payload.new.value);
            }
        )
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'settings', filter: 'key=eq.RESERVATION_DEADLINE' },
            (payload) => {
                onUpdate(payload.new.value);
            }
        )
        .subscribe();
}

// Ensure global access for admin.js
if (typeof window !== 'undefined') {
    window.adminResetPerformance = adminResetPerformance;
    window.adminGenerateInviteToken = adminGenerateInviteToken;
    window.adminDeadlineSettings = adminDeadlineSettings;
}

// Seat Number Translation (UI Only)
export function toDisplaySeatId(dbId) {
    if (!dbId) return '';
    // Single ID translation
    const translateOne = (id) => {
        const match = id.match(/^([A-Z]+)(\d+)$/);
        if (!match) return id;
        const row = match[1];
        const num = parseInt(match[2]);

        let offset = 0;
        switch (row) {
            case 'A': offset = 5; break; // A6 -> A1
            case 'B': offset = 4; break; // B5 -> B1
            case 'C': offset = 3; break; // C4 -> B1
            case 'D': offset = 2; break; // D3 -> D1
            case 'E': offset = 1; break; // E2 -> E1
        }

        const newNum = num - offset;
        return (newNum > 0) ? `${row}${newNum}` : id; // Fallback if invalid
    };

    // Handle CSV or single ID
    if (dbId.includes(',')) {
        return dbId.split(',').map(s => translateOne(s.trim())).join(', ');
    }
    return translateOne(dbId);
}

export function toDbSeatId(displayId) {
    if (!displayId) return '';
    const translateOne = (id) => {
        const match = id.match(/^([A-Z]+)(\d+)$/);
        if (!match) return id;
        const row = match[1];
        const num = parseInt(match[2]);

        let offset = 0;
        switch (row) {
            case 'A': offset = 5; break; // A1 -> A6
            case 'B': offset = 4; break; // B1 -> B5
            case 'C': offset = 3; break; // B1 -> C4
            case 'D': offset = 2; break; // D1 -> D3
            case 'E': offset = 1; break; // E1 -> E2
        }

        const newNum = num + offset;
        return `${row}${newNum}`;
    };

    if (displayId.includes(',')) {
        return displayId.split(',').map(s => translateOne(s.trim())).join(', ');
    }
    return translateOne(displayId);
}
