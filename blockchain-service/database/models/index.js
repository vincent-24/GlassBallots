/**
 * Database Module Index
 * Initializes the database connection and exports all models
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Models
import User from './models/User.js';
import Organization from './models/Organization.js';
import Proposal from './models/Proposal.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'glassballots.db');

// Singleton database connection
let db = null;
let models = null;

/**
 * Initialize the database connection and models
 * @returns {Promise<{db: sqlite3.Database, models: Object}>}
 */
export async function initDatabase() {
    if (db && models) {
        return { db, models };
    }

    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, async (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
                return;
            }

            console.log(`Connected to SQLite database at ${DB_PATH}`);

            try {
                // Run schema initialization
                await initSchema(db);

                // Initialize models
                const encryptionKey = process.env.ENCRYPTION_KEY;
                models = {
                    User: new User(db, encryptionKey),
                    Organization: new Organization(db),
                    Proposal: new Proposal(db)
                };

                resolve({ db, models });
            } catch (initError) {
                reject(initError);
            }
        });
    });
}

/**
 * Initialize database schema
 * @param {sqlite3.Database} db - Database connection
 */
async function initSchema(db) {
    const schema = `
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            username TEXT UNIQUE,
            role TEXT DEFAULT 'student',
            password_hash TEXT,
            salt TEXT,
            encrypted_data TEXT,
            unique_id TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- User profiles for encrypted additional data
        CREATE TABLE IF NOT EXISTS user_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            encrypted_value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(user_id, field_name)
        );

        -- User sessions for authentication
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );

        -- Proposals table
        CREATE TABLE IF NOT EXISTS proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            original_text TEXT NOT NULL,
            authorized_by TEXT,
            decision_date TEXT,
            creator_id INTEGER,
            organization_id INTEGER,
            allowed_voters TEXT DEFAULT 'ALL',
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE SET NULL,
            FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
        );

        -- Votes table
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proposal_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            vote INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(proposal_id, user_id)
        );

        -- Bookmarks table
        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            proposal_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
            UNIQUE(user_id, proposal_id)
        );

        -- Petitions table
        CREATE TABLE IF NOT EXISTS petitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proposal_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            petition_text TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'accepted', 'rejected')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(proposal_id, user_id)
        );

        -- Organizations table
        CREATE TABLE IF NOT EXISTS organizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            unique_code TEXT UNIQUE NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
        );

        -- Organization memberships
        CREATE TABLE IF NOT EXISTS organization_memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            role TEXT DEFAULT 'member' CHECK(role IN ('member', 'moderator', 'admin', 'owner')),
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            approved_at DATETIME,
            approved_by INTEGER,
            FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
            UNIQUE(organization_id, user_id)
        );

        -- AI Analysis cache
        CREATE TABLE IF NOT EXISTS analysis_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proposal_id INTEGER NOT NULL,
            analysis_type TEXT NOT NULL,
            analysis_data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
            UNIQUE(proposal_id, analysis_type)
        );

        -- Feedback table
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proposal_id INTEGER NOT NULL,
            user_id INTEGER,
            feedback_text TEXT NOT NULL,
            category TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        );

        -- Create indexes for performance
        CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
        CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
        CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
        CREATE INDEX IF NOT EXISTS idx_petitions_proposal ON petitions(proposal_id);
        CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON organization_memberships(organization_id);
        CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON organization_memberships(user_id);
        CREATE INDEX IF NOT EXISTS idx_proposals_org ON proposals(organization_id);
    `;

    return new Promise((resolve, reject) => {
        db.exec(schema, (err) => {
            if (err) {
                console.error('Error initializing schema:', err);
                reject(err);
            } else {
                console.log('Database schema initialized');
                resolve();
            }
        });
    });
}

/**
 * Get initialized models
 * @returns {Object} - { User, Organization, Proposal }
 */
export function getModels() {
    if (!models) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return models;
}

/**
 * Get the database connection
 * @returns {sqlite3.Database}
 */
export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Close the database connection
 * @returns {Promise<void>}
 */
export function closeDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    db = null;
                    models = null;
                    console.log('Database connection closed');
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

// Export models for direct import
export { User, Organization, Proposal };

// Default export
export default {
    initDatabase,
    getModels,
    getDb,
    closeDatabase,
    User,
    Organization,
    Proposal
};
