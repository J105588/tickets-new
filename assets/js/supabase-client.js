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

// データ取得ヘルパー (GASのレスポンス形式に合わせる)
export async function fetchMasterDataFromSupabase() {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'Supabase client not initialized' };

    try {
        const [groups, dates, timeslots] = await Promise.all([
            sb.from('groups').select('*').eq('is_active', true).order('display_order'),
            sb.from('event_dates').select('*').eq('is_active', true).order('display_order'),
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
    const result = await fetchMasterDataFromSupabase();
    if (result.success) {
        return result.data.groups;
    }
    console.error('Failed to fetch master groups', result.error);
    return [];
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

        // 3. Format as Map (seat_id -> status) or Object as expected by renderSeatMap
        // renderSeatMap expects array of seat objects or similar.
        // Let's return the array directly.

        return { success: true, data: seatsData };

    } catch (e) {
        return { success: false, error: e.message };
    }
}
