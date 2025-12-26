/**
 * supabase-client.js
 * Supabase JSクライアントの初期化とラッパー
 * 依存: config.js, @supabase/supabase-js (CDN)
 */

import { SUPABASE_CONFIG } from './config.js';

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
        const [groups, dates, timeslots] = await Promise.all([
            sb.from('groups').select('*').order('display_order'),
            sb.from('event_dates').select('*').order('display_order'),
            sb.from('time_slots').select('*').order('display_order')
        ]);

        if (groups.error) throw groups.error;
        if (dates.error) throw dates.error;
        if (timeslots.error) throw timeslots.error;

        return {
            success: true,
            data: {
                groups: groups.data,
                dates: dates.data,
                timeslots: timeslots.data
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

// --- Admin RPC Wrappers (Added for Refactor) ---

export async function adminGetReservations(filters) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'System Error' };

    try {
        const { data, error } = await sb.rpc('admin_get_reservations', {
            p_group: filters.group || null,
            p_day: filters.day ? parseInt(filters.day) : null,
            p_timeslot: filters.timeslot || null,
            p_status: filters.status || null,
            p_search: filters.search || null
        });
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('RPC Error:', e);
        return { success: false, error: e.message };
    }
}

export async function adminUpdateBooking(bookingData) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'System Error' };

    try {
        const { data, error } = await sb.rpc('admin_update_booking', {
            p_id: parseInt(bookingData.id),
            p_name: bookingData.name,
            p_email: bookingData.email,
            p_grade_class: bookingData.grade_class,
            p_club_affiliation: bookingData.club_affiliation,
            p_notes: bookingData.notes,
            p_status: bookingData.status // Added
        });
        if (error) throw error;
        return data;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminCancelBooking(id) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'System Error' };

    try {
        const { data, error } = await sb.rpc('admin_cancel_booking', { p_id: parseInt(id) });
        if (error) throw error;
        return data;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminSwapSeats(bookingId, newSeatIds) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'System Error' };

    try {
        const { data, error } = await sb.rpc('admin_swap_seats', {
            p_booking_id: parseInt(bookingId),
            p_new_seat_ids_str: newSeatIds.join(',')
        });
        if (error) throw error;
        return data;
    } catch (e) {
        return { success: false, error: e.message };
    }
}

export async function adminManageMaster(table, op, recordData) {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'System Error' };

    try {
        const { data, error } = await sb.rpc('admin_manage_master', {
            p_table: table,
            p_op: op,
            p_data: recordData
        });
        if (error) throw error;
        return data;
    } catch (e) {
        return { success: false, error: e.message };
    }
}
