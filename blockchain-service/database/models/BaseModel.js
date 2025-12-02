/**
 * BaseModel - Foundation class for all database models
 * Provides common database operations and utilities
 */

class BaseModel {
    constructor(db) {
        this.db = db;
    }

    /**
     * Run a query that returns multiple rows
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>}
     */
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    /**
     * Run a query that returns a single row
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object|null>}
     */
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    /**
     * Run an INSERT/UPDATE/DELETE query
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<{lastID: number, changes: number}>}
     */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    /**
     * Execute multiple SQL statements
     * @param {string} sql - SQL statements
     * @returns {Promise<void>}
     */
    exec(sql) {
        return new Promise((resolve, reject) => {
            this.db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Begin a transaction
     * @returns {Promise<void>}
     */
    beginTransaction() {
        return this.run('BEGIN TRANSACTION');
    }

    /**
     * Commit a transaction
     * @returns {Promise<void>}
     */
    commit() {
        return this.run('COMMIT');
    }

    /**
     * Rollback a transaction
     * @returns {Promise<void>}
     */
    rollback() {
        return this.run('ROLLBACK');
    }

    /**
     * Run multiple operations in a transaction
     * @param {Function} callback - Async function containing operations
     * @returns {Promise<any>}
     */
    async transaction(callback) {
        await this.beginTransaction();
        try {
            const result = await callback();
            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }
}

export default BaseModel;
