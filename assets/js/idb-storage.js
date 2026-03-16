/**
 * idb-storage.js
 * IndexedDB を用いた堅牢なオフラインストレージラッパー
 * 大容量データのキャッシュと、べき等性を持つ操作キューを管理する
 */

const DB_NAME = 'NTicketOfflineDB';
const DB_VERSION = 1;

// Stores
const STORE_SNAPSHOTS = 'snapshots'; // キャッシュデータ (bookings, seats 等)
const STORE_QUEUE = 'offline_queue'; // 未同期の操作キュー
const STORE_PROCESSED = 'processed_ids'; // 同期済みのトランザクションID (1週間程度でパージ)

class IDBStorage {
    constructor() {
        this.db = null;
        this.initPromise = this._initDB();
    }

    _initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('[IDBStorage] Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // スナップショット用ストア (key: 'bookings_GroupName_Day_Timeslot' 等)
                if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                    db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'key' });
                }

                // オフラインキュー用ストア (順序保証のためAutoIncrement)
                if (!db.objectStoreNames.contains(STORE_QUEUE)) {
                    const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
                    queueStore.createIndex('transaction_id', 'transaction_id', { unique: true });
                    queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // パージ管理用の処理済みIDストア
                if (!db.objectStoreNames.contains(STORE_PROCESSED)) {
                    db.createObjectStore(STORE_PROCESSED, { keyPath: 'transaction_id' });
                }
            };
        });
    }

    async _getStore(storeName, mode = 'readonly') {
        await this.initPromise;
        const transaction = this.db.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    }

    // ==========================================
    // Snapshots (Data Caching)
    // ==========================================

    /**
     * データをスナップショットとして保存する
     * @param {string} key - 保存キー (例: 'bookings_all')
     * @param {any} data - 保存するデータ
     */
    async saveSnapshot(key, data) {
        const store = await this._getStore(STORE_SNAPSHOTS, 'readwrite');
        const payload = {
            key: key,
            data: data,
            timestamp: Date.now()
        };
        return new Promise((resolve, reject) => {
            const request = store.put(payload);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * スナップショットを取得する
     * @param {string} key 
     * @returns {Promise<{data: any, timestamp: number} | null>}
     */
    async getSnapshot(key) {
        const store = await this._getStore(STORE_SNAPSHOTS, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    // ==========================================
    // Offline Queue (Operations)
    // ==========================================

    /**
     * 操作をキューに追加する
     * @param {string} type - 操作タイプ (例: 'processCheckIn')
     * @param {object} payload - 送信データ
     * @returns {Promise<string>} 生成された transaction_id
     */
    async enqueueOperation(type, payload) {
        const store = await this._getStore(STORE_QUEUE, 'readwrite');
        const transactionId = crypto.randomUUID();
        
        const operation = {
            transaction_id: transactionId,
            type: type,
            payload: payload,
            timestamp: Date.now(),
            retry_count: 0
        };

        return new Promise((resolve, reject) => {
            const request = store.add(operation);
            request.onsuccess = () => resolve(transactionId);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 全てのキューを取得する (古い順)
     * @returns {Promise<Array>}
     */
    async getAllQueuedOperations() {
        const store = await this._getStore(STORE_QUEUE, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                // Fetch returns array sorted by the primary key (auto-increment string/number ID)
                resolve(request.result || []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * キューのアイテムを更新する (リトライ回数増加時など)
     */
    async updateQueuedOperation(operation) {
        const store = await this._getStore(STORE_QUEUE, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(operation);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * キューからアイテムを削除する (API成功時)
     */
    async dequeueOperation(id) {
        const store = await this._getStore(STORE_QUEUE, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ==========================================
    // Idempotency Tracking (Processed Logs)
    // ==========================================
    
    /**
     * 完了したトランザクションを記録
     */
    async markTransactionProcessed(transactionId) {
        const store = await this._getStore(STORE_PROCESSED, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put({ transaction_id: transactionId, timestamp: Date.now() });
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 10日以上古い処理済み記録をパージする
     */
    async purgeOldProcessedLogs() {
        const store = await this._getStore(STORE_PROCESSED, 'readwrite');
        const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
        
        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.timestamp < tenDaysAgo) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve(true); // 完成
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// Singleton Instance
const idbStorage = new IDBStorage();

if (typeof window !== 'undefined') {
    window.IDBStorage = idbStorage;
}

export default idbStorage;
