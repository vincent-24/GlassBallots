import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { encrypt, decrypt } from '../utils/security.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use absolute path to database file
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'glassballots.db');

class UserDatabase {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('Connected to SQLite database.');
                this.init();
            }
        });
    }

    async init() {
        try {
            // First, check if we need to migrate the schema
            try {
                await this.migrateSchema();
            } catch (migrationError) {
                // Migration errors are not fatal - tables might already exist
                console.log('Migration check completed with warnings (safe to ignore)');
            }
            
            const schema = `
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

                CREATE TABLE IF NOT EXISTS user_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    field_name TEXT NOT NULL,
                    encrypted_value TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                    UNIQUE(user_id, field_name)
                );

                CREATE TABLE IF NOT EXISTS user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    session_token TEXT UNIQUE NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS bookmarks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    proposal_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
                    UNIQUE(user_id, proposal_id)
                );

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
            `;

            await new Promise((resolve, reject) => {
                this.db.exec(schema, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('Database tables initialized.');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.error('Error initializing database:', error.message);
        }
    }

    // Migrate schema to add password_hash and unique_id columns if they don't exist
    async migrateSchema() {
        return new Promise((resolve, reject) => {
            // Check columns in users table
            this.db.all(
                "PRAGMA table_info(users)", 
                async (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const hasPasswordHash = rows && rows.some(col => col.name === 'password_hash');
                    const hasUniqueId = rows && rows.some(col => col.name === 'unique_id');
                    
                    const migrations = [];
                    
                    if (!hasPasswordHash) {
                        migrations.push(this.runMigration('ALTER TABLE users ADD COLUMN password_hash TEXT', 'password_hash'));
                    }
                    
                    if (!hasUniqueId) {
                        // Note: SQLite doesn't support adding UNIQUE constraint with ALTER TABLE
                        // The uniqueness is enforced by the generateUserUniqueId function
                        migrations.push(this.runMigration('ALTER TABLE users ADD COLUMN unique_id TEXT', 'unique_id'));
                    }
                    
                    try {
                        await Promise.all(migrations);
                        
                        // Always backfill unique_id for any users that don't have one
                        await this.backfillUniqueIds();
                        
                        // Migrate proposals table
                        await this.migrateProposalsTable();
                        
                        // Create petitions table
                        await this.createPetitionsTable();
                        
                        console.log('Schema is up to date');
                        resolve();
                    } catch (migrationErr) {
                        console.error('Migration error:', migrationErr);
                        resolve(); // Don't reject - migrations might have partially succeeded
                    }
                }
            );
        });
    }

    // Migrate proposals table to add organization_id and allowed_voters
    async migrateProposalsTable() {
        return new Promise((resolve, reject) => {
            this.db.all("PRAGMA table_info(proposals)", async (err, rows) => {
                if (err) {
                    resolve(); // Don't fail - table might not exist yet
                    return;
                }
                
                if (!rows || rows.length === 0) {
                    resolve();
                    return;
                }
                
                const hasOrgId = rows.some(col => col.name === 'organization_id');
                const hasAllowedVoters = rows.some(col => col.name === 'allowed_voters');
                
                const migrations = [];
                
                if (!hasOrgId) {
                    migrations.push(this.runMigration('ALTER TABLE proposals ADD COLUMN organization_id INTEGER', 'organization_id'));
                }
                
                if (!hasAllowedVoters) {
                    migrations.push(this.runMigration("ALTER TABLE proposals ADD COLUMN allowed_voters TEXT DEFAULT 'ALL'", 'allowed_voters'));
                }
                
                try {
                    await Promise.all(migrations);
                    resolve();
                } catch (e) {
                    console.log('Proposals migration completed with warnings');
                    resolve();
                }
            });
        });
    }

    // Create petitions table if it doesn't exist
    async createPetitionsTable() {
        return new Promise((resolve, reject) => {
            const sql = `
                CREATE TABLE IF NOT EXISTS petitions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    proposal_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    petition_text TEXT NOT NULL,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'accepted', 'rejected')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `;
            this.db.run(sql, (err) => {
                if (err) {
                    console.log('Petitions table creation note:', err.message);
                }
                resolve();
            });
        });
    }

    // Helper to run a single migration
    runMigration(sql, columnName) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, (err) => {
                if (err) {
                    if (err.message.includes('duplicate column')) {
                        console.log(`Column ${columnName} already exists`);
                        resolve();
                    } else {
                        reject(err);
                    }
                } else {
                    console.log(`Added column: ${columnName}`);
                    resolve();
                }
            });
        });
    }

    // Backfill unique_id for existing users who don't have one
    async backfillUniqueIds() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT id FROM users WHERE unique_id IS NULL', async (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!rows || rows.length === 0) {
                    console.log('No users need unique_id backfill');
                    resolve();
                    return;
                }
                
                console.log(`Backfilling unique_id for ${rows.length} users...`);
                
                for (const row of rows) {
                    const uniqueId = await this.generateUserUniqueId();
                    await new Promise((res, rej) => {
                        this.db.run('UPDATE users SET unique_id = ? WHERE id = ?', [uniqueId, row.id], (updateErr) => {
                            if (updateErr) rej(updateErr);
                            else res();
                        });
                    });
                }
                
                console.log('Unique ID backfill complete');
                resolve();
            });
        });
    }

    // Generate a unique 16-character alphanumeric ID starting with #
    async generateUserUniqueId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let uniqueId;
        let exists = true;
        
        while (exists) {
            let id = '#';
            for (let i = 0; i < 15; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            uniqueId = id;
            
            // Check if this ID already exists
            exists = await new Promise((resolve, reject) => {
                this.db.get('SELECT 1 FROM users WHERE unique_id = ?', [uniqueId], (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                });
            });
        }
        
        return uniqueId;
    }

    // Encryption key (in production, use environment variables)
    getEncryptionKey() {
        return process.env.ENCRYPTION_KEY || 'your-secure-encryption-key-32-chars-long!';
    }

    // Updated encryption using createCipheriv (modern approach)
    encrypt(text) {
        try {
            const algorithm = 'aes-256-gcm';
            const key = crypto.scryptSync(this.getEncryptionKey(), 'salt', 32);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(algorithm, key, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                iv: iv.toString('hex'),
                data: encrypted,
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            console.error('Encryption error:', error);
            // Fallback: simple base64 encoding if encryption fails
            return {
                iv: '',
                data: Buffer.from(text).toString('base64'),
                authTag: '',
                fallback: true
            };
        }
    }

    // Updated decryption using createDecipheriv
    decrypt(encryptedData) {
        try {
            // Handle fallback base64 encoding
            if (encryptedData.fallback) {
                return Buffer.from(encryptedData.data, 'base64').toString('utf8');
            }

            const algorithm = 'aes-256-gcm';
            const key = crypto.scryptSync(this.getEncryptionKey(), 'salt', 32);
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Decryption failed');
        }
    }

    // Password hashing methods
    async hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    // Get raw password hash for verification testing (for testing only)
    async getPasswordHash(userId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT password_hash FROM users WHERE id = ?`;
            this.db.get(query, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row?.password_hash);
                }
            });
        });
    }

    // User management methods
    async createUser(userData) {
        const uniqueId = await this.generateUserUniqueId();
        return new Promise((resolve, reject) => {
            const { walletAddress, email, username, role = 'student' } = userData;
            
            // Encrypt email for secure storage
            const encryptedEmail = email ? encrypt(email) : null;
            
            const query = `
                INSERT INTO users (wallet_address, email, username, role, unique_id) 
                VALUES (?, ?, ?, ?, ?)
            `;
            
            this.db.run(query, [walletAddress, encryptedEmail, username, role, uniqueId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, walletAddress, email, username, role, unique_id: uniqueId });
                }
            });
        });
    }

    async createUserWithPassword(userData) {
        const uniqueId = await this.generateUserUniqueId();
        return new Promise(async (resolve, reject) => {
            const { walletAddress, email, username, role = 'student', password } = userData;
            
            if (!password) {
                reject(new Error('Password is required'));
                return;
            }

            try {
                const password_hash = await this.hashPassword(password);
                
                // Encrypt email for secure storage
                const encryptedEmail = email ? encrypt(email) : null;
                
                const query = `
                    INSERT INTO users (wallet_address, email, username, role, password_hash, unique_id) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `;
                
                this.db.run(query, [walletAddress, encryptedEmail, username, role, password_hash, uniqueId], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ 
                            id: this.lastID, 
                            walletAddress, 
                            email, 
                            username, 
                            role,
                            unique_id: uniqueId
                        });
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async getUserByWallet(walletAddress) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM users WHERE wallet_address = ?';
            
            this.db.get(query, [walletAddress], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    // Decrypt email before returning
                    if (row && row.email) {
                        row.email = decrypt(row.email);
                    }
                    resolve(row);
                }
            });
        });
    }

    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM users WHERE id = ?';
            
            this.db.get(query, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    // Decrypt email before returning
                    if (row && row.email) {
                        row.email = decrypt(row.email);
                    }
                    resolve(row);
                }
            });
        });
    }

    async getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM users WHERE username = ?';
            
            this.db.get(query, [username], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    // Decrypt email before returning
                    if (row && row.email) {
                        row.email = decrypt(row.email);
                    }
                    resolve(row);
                }
            });
        });
    }

    async getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            // Since email is encrypted, we need to search differently
            // For email lookup, we encrypt the search term and compare
            const encryptedSearch = encrypt(email);
            
            // Try direct match first (for newly encrypted emails)
            // Then fall back to checking all emails (for legacy or if encryption varies)
            this.db.all('SELECT * FROM users', [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Check each user's decrypted email
                const user = rows.find(row => {
                    if (!row.email) return false;
                    const decryptedEmail = decrypt(row.email);
                    return decryptedEmail && decryptedEmail.toLowerCase() === email.toLowerCase();
                });
                
                if (user) {
                    user.email = decrypt(user.email);
                }
                resolve(user || null);
            });
        });
    }

    // Update user's username
    async updateUsername(userId, newUsername) {
        return new Promise((resolve, reject) => {
            // First check if new username is already taken
            this.db.get('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, userId], (err, existing) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (existing) {
                    reject(new Error('Username is already taken'));
                    return;
                }
                
                this.db.run('UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                    [newUsername, userId], 
                    function(updateErr) {
                        if (updateErr) reject(updateErr);
                        else if (this.changes === 0) reject(new Error('User not found'));
                        else resolve({ success: true, username: newUsername });
                    }
                );
            });
        });
    }

    // Update user's password
    async updatePassword(userId, oldPassword, newPassword) {
        return new Promise(async (resolve, reject) => {
            try {
                // Get the current user
                const user = await this.getUserById(userId);
                if (!user) {
                    reject(new Error('User not found'));
                    return;
                }

                // Verify old password
                const isValid = await this.verifyPassword(oldPassword, user.password_hash);
                if (!isValid) {
                    reject(new Error('Current password is incorrect'));
                    return;
                }

                // Hash new password and update
                const newHash = await this.hashPassword(newPassword);
                this.db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [newHash, userId],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ success: true });
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    // Verify user credentials (email/username + password)
    async verifyUserCredentials(identifier, password) {
        return new Promise(async (resolve, reject) => {
            const query = `
                SELECT * FROM users 
                WHERE (email = ? OR username = ?) AND password_hash IS NOT NULL
            `;
            
            this.db.get(query, [identifier, identifier], async (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null); // User not found
                } else {
                    try {
                        const isValid = await this.verifyPassword(password, row.password_hash);
                        if (isValid) {
                            resolve({
                                id: row.id,
                                walletAddress: row.wallet_address,
                                email: row.email,
                                username: row.username,
                                role: row.role
                            });
                        } else {
                            resolve(null); // Invalid password
                        }
                    } catch (error) {
                        reject(error);
                    }
                }
            });
        });
    }

    // Update password for existing user
    async updatePassword(userId, newPassword) {
        return new Promise(async (resolve, reject) => {
            try {
                const password_hash = await this.hashPassword(newPassword);
                
                const query = `UPDATE users SET password_hash = ? WHERE id = ?`;
                this.db.run(query, [password_hash, userId], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ success: true });
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    // Check if user has password set
    async hasPassword(userId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT password_hash FROM users WHERE id = ?`;
            this.db.get(query, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!row?.password_hash);
                }
            });
        });
    }

    async updateUserProfile(userId, profileData) {
        return new Promise(async (resolve, reject) => {
            try {
                // Start transaction
                this.db.run('BEGIN TRANSACTION');
                
                // Delete existing profile data
                await new Promise((res, rej) => {
                    this.db.run('DELETE FROM user_profiles WHERE user_id = ?', [userId], (err) => {
                        if (err) rej(err);
                        else res();
                    });
                });
                
                // Insert new profile data
                for (const [field, value] of Object.entries(profileData)) {
                    const encrypted = this.encrypt(value.toString());
                    const encryptedString = JSON.stringify(encrypted);
                    
                    await new Promise((res, rej) => {
                        this.db.run(
                            'INSERT INTO user_profiles (user_id, field_name, encrypted_value) VALUES (?, ?, ?)',
                            [userId, field, encryptedString],
                            (err) => {
                                if (err) rej(err);
                                else res();
                            }
                        );
                    });
                }
                
                // Commit transaction
                this.db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve({ success: true, userId });
                });
                
            } catch (error) {
                this.db.run('ROLLBACK');
                reject(error);
            }
        });
    }

    async getUserProfile(userId) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM user_profiles WHERE user_id = ?';
            
            this.db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const profile = {};
                    rows.forEach(row => {
                        try {
                            const encryptedData = JSON.parse(row.encrypted_value);
                            profile[row.field_name] = this.decrypt(encryptedData);
                        } catch (error) {
                            console.error(`Error decrypting field ${row.field_name}:`, error);
                            profile[row.field_name] = '[Decryption Error]';
                        }
                    });
                    resolve(profile);
                }
            });
        });
    }

    async createSession(userId) {
        return new Promise((resolve, reject) => {
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            
            const query = `
                INSERT INTO user_sessions (user_id, session_token, expires_at) 
                VALUES (?, ?, ?)
            `;
            
            this.db.run(query, [userId, sessionToken, expiresAt.toISOString()], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ sessionToken, expiresAt, sessionId: this.lastID });
                }
            });
        });
    }

    async validateSession(sessionToken) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT us.*, u.wallet_address, u.role, u.email, u.username
                FROM user_sessions us 
                JOIN users u ON us.user_id = u.id 
                WHERE us.session_token = ? AND us.expires_at > datetime('now')
            `;
            
            this.db.get(query, [sessionToken], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // ===== AI Analysis Caching (Per User) =====
    
    async getProposalById(proposalId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM proposals WHERE id = ?`;
            
            this.db.get(query, [proposalId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    
    async saveUserAnalysis(userId, proposalId, analysis) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO user_proposal_analyses 
                (user_id, proposal_id, neutral_summary, loaded_language, stakeholders, equity_concerns, objective_facts, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(user_id, proposal_id) DO UPDATE SET
                    neutral_summary = excluded.neutral_summary,
                    loaded_language = excluded.loaded_language,
                    stakeholders = excluded.stakeholders,
                    equity_concerns = excluded.equity_concerns,
                    objective_facts = excluded.objective_facts,
                    updated_at = datetime('now')
            `;
            
            this.db.run(query, [
                userId,
                proposalId,
                analysis.neutral_summary || null,
                JSON.stringify(analysis.loaded_language || []),
                JSON.stringify(analysis.stakeholders || []),
                JSON.stringify(analysis.equity_concerns || []),
                JSON.stringify(analysis.objective_facts || {})
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, success: true });
                }
            });
        });
    }

    async getUserAnalysis(userId, proposalId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM user_proposal_analyses 
                WHERE user_id = ? AND proposal_id = ?
            `;
            
            this.db.get(query, [userId, proposalId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    // Parse JSON fields
                    resolve({
                        neutral_summary: row.neutral_summary,
                        loaded_language: JSON.parse(row.loaded_language || '[]'),
                        stakeholders: JSON.parse(row.stakeholders || '[]'),
                        equity_concerns: JSON.parse(row.equity_concerns || '[]'),
                        objective_facts: JSON.parse(row.objective_facts || '{}'),
                        created_at: row.created_at,
                        updated_at: row.updated_at
                    });
                }
            });
        });
    }

    async deleteUserAnalysis(userId, proposalId) {
        return new Promise((resolve, reject) => {
            const query = `DELETE FROM user_proposal_analyses WHERE user_id = ? AND proposal_id = ?`;
            
            this.db.run(query, [userId, proposalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ deleted: this.changes > 0 });
                }
            });
        });
    }

    async submitVote(userId, proposalId, voteValue, walletAddress = null, transactionHash = null, blockNumber = null) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO votes (user_id, proposal_id, vote_value, wallet_address, transaction_hash, block_number)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(query, [userId, proposalId, voteValue ? 1 : 0, walletAddress || 'pending', transactionHash, blockNumber], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        reject(new Error('You have already voted on this proposal'));
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ id: this.lastID, success: true });
                }
            });
        });
    }

    async getVoteTallies(proposalId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM vote_tallies WHERE proposal_id = ?`;
            
            this.db.get(query, [proposalId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    // No votes yet
                    resolve({
                        yes_count: 0,
                        no_count: 0,
                        total_votes: 0
                    });
                } else {
                    resolve({
                        yes_count: row.yes_count,
                        no_count: row.no_count,
                        total_votes: row.total_votes,
                        last_updated: row.last_updated
                    });
                }
            });
        });
    }

    async getUserVote(userId, proposalId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT vote_value FROM votes WHERE user_id = ? AND proposal_id = ?`;
            
            this.db.get(query, [userId, proposalId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    resolve(row.vote_value === 1 ? 'approve' : 'deny');
                }
            });
        });
    }

    // ===== User Proposals (Voted, Bookmarked, Petitioned) =====

    async getUserVotedProposals(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT p.*, v.vote_value as user_vote
                FROM proposals p
                INNER JOIN votes v ON p.id = v.proposal_id
                WHERE v.user_id = ?
                ORDER BY v.voted_at DESC
            `;
            
            this.db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getUserBookmarkedProposals(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT p.*, b.created_at as bookmarked_at
                FROM proposals p
                INNER JOIN bookmarks b ON p.id = b.proposal_id
                WHERE b.user_id = ?
                ORDER BY b.created_at DESC
            `;
            
            this.db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getUserPetitionedProposals(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT DISTINCT p.*, pt.id as petition_id, pt.created_at as petitioned_at, pt.petition_text,
                       pt.updated_at as petition_updated_at,
                       CASE WHEN pt.updated_at > pt.created_at THEN 1 ELSE 0 END as is_edited
                FROM proposals p
                INNER JOIN petitions pt ON p.id = pt.proposal_id
                WHERE pt.user_id = ?
                ORDER BY pt.created_at DESC
            `;
            
            this.db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // ===== Bookmark Management =====

    async addBookmark(userId, proposalId) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO bookmarks (user_id, proposal_id)
                VALUES (?, ?)
            `;
            
            this.db.run(query, [userId, proposalId], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        reject(new Error('Proposal already bookmarked'));
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ id: this.lastID, success: true });
                }
            });
        });
    }

    async removeBookmark(userId, proposalId) {
        return new Promise((resolve, reject) => {
            const query = `DELETE FROM bookmarks WHERE user_id = ? AND proposal_id = ?`;
            
            this.db.run(query, [userId, proposalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ deleted: this.changes > 0 });
                }
            });
        });
    }

    async isBookmarked(userId, proposalId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT 1 FROM bookmarks WHERE user_id = ? AND proposal_id = ?`;
            
            this.db.get(query, [userId, proposalId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!row);
                }
            });
        });
    }

    // ===== Organization Management =====

    // Generate a unique 8-character alphanumeric code
    generateUniqueCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars (0, O, 1, I)
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async createOrganization(name, ownerId, description = null) {
        // Generate unique code and ensure it doesn't exist
        let uniqueCode;
        let codeExists = true;
        let attempts = 0;
        
        while (codeExists && attempts < 10) {
            uniqueCode = this.generateUniqueCode();
            codeExists = await this.organizationCodeExists(uniqueCode);
            attempts++;
        }
        
        if (codeExists) {
            throw new Error('Failed to generate unique organization code');
        }

        const db = this.db; // Store reference for use in callbacks
        
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO organizations (name, unique_code, description, owner_id)
                VALUES (?, ?, ?, ?)
            `;
            
            db.run(query, [name, uniqueCode, description, ownerId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    const orgId = this.lastID;
                    // Auto-add owner as approved member with 'owner' role
                    const memberQuery = `
                        INSERT INTO organization_memberships 
                        (organization_id, user_id, status, role, approved_at)
                        VALUES (?, ?, 'approved', 'owner', CURRENT_TIMESTAMP)
                    `;
                    db.run(memberQuery, [orgId, ownerId], (memberErr) => {
                        if (memberErr) {
                            console.warn('Note: Owner membership insert failed:', memberErr.message);
                        }
                        // Resolve regardless - org was created successfully
                        resolve({ id: orgId, unique_code: uniqueCode, name, owner_id: ownerId });
                    });
                }
            });
        });
    }

    async organizationCodeExists(code) {
        return new Promise((resolve, reject) => {
            const query = `SELECT 1 FROM organizations WHERE unique_code = ?`;
            this.db.get(query, [code], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    }

    async getOrganizationByCode(code) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT o.*, u.username as owner_username
                FROM organizations o
                LEFT JOIN users u ON o.owner_id = u.id
                WHERE o.unique_code = ?
            `;
            this.db.get(query, [code], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getOrganizationById(orgId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT o.*, u.username as owner_username
                FROM organizations o
                LEFT JOIN users u ON o.owner_id = u.id
                WHERE o.id = ?
            `;
            this.db.get(query, [orgId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async searchOrganizations(searchTerm) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT o.*, u.username as owner_username,
                       (SELECT COUNT(*) FROM organization_memberships 
                        WHERE organization_id = o.id AND status = 'approved') as member_count
                FROM organizations o
                LEFT JOIN users u ON o.owner_id = u.id
                WHERE o.name LIKE ? OR o.unique_code = ?
                ORDER BY o.name ASC
                LIMIT 50
            `;
            this.db.all(query, [`%${searchTerm}%`, searchTerm.toUpperCase()], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getUserOrganizations(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT o.*, om.status, om.role, om.requested_at, om.approved_at,
                       u.username as owner_username,
                       (SELECT COUNT(*) FROM organization_memberships 
                        WHERE organization_id = o.id AND status = 'approved') as member_count
                FROM organizations o
                INNER JOIN organization_memberships om ON o.id = om.organization_id
                LEFT JOIN users u ON o.owner_id = u.id
                WHERE om.user_id = ?
                ORDER BY om.role = 'owner' DESC, o.name ASC
            `;
            this.db.all(query, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getOwnedOrganizations(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT o.*, 
                       (SELECT COUNT(*) FROM organization_memberships 
                        WHERE organization_id = o.id AND status = 'approved') as member_count,
                       (SELECT COUNT(*) FROM organization_memberships 
                        WHERE organization_id = o.id AND status = 'pending') as pending_count
                FROM organizations o
                WHERE o.owner_id = ?
                ORDER BY o.created_at DESC
            `;
            this.db.all(query, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // Delete an organization (owner only)
    async deleteOrganization(orgId, userId) {
        return new Promise(async (resolve, reject) => {
            try {
                // First verify the user is the owner
                const org = await this.getOrganizationById(orgId);
                if (!org) {
                    reject(new Error('Organization not found'));
                    return;
                }
                if (org.owner_id !== userId) {
                    reject(new Error('Only the owner can delete this organization'));
                    return;
                }

                // Delete memberships first (cascade), then organization
                this.db.run('DELETE FROM organization_memberships WHERE organization_id = ?', [orgId], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    this.db.run('DELETE FROM organizations WHERE id = ?', [orgId], function(delErr) {
                        if (delErr) reject(delErr);
                        else if (this.changes === 0) reject(new Error('Organization not found'));
                        else resolve({ success: true, deleted: org.name });
                    });
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    // ===== Membership Management =====

    async getUserMembershipStatus(userId, orgId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT status, role FROM organization_memberships
                WHERE user_id = ? AND organization_id = ?
            `;
            this.db.get(query, [userId, orgId], (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    async requestToJoinOrganization(orgId, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO organization_memberships (organization_id, user_id, status)
                VALUES (?, ?, 'pending')
            `;
            this.db.run(query, [orgId, userId], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        reject(new Error('Already requested or member of this organization'));
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ id: this.lastID, status: 'pending' });
                }
            });
        });
    }

    async approveMembership(membershipId, approverId) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE organization_memberships 
                SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
                WHERE id = ? AND status = 'pending'
            `;
            this.db.run(query, [approverId, membershipId], function(err) {
                if (err) reject(err);
                else resolve({ updated: this.changes > 0 });
            });
        });
    }

    async rejectMembership(membershipId, approverId) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE organization_memberships 
                SET status = 'rejected', approved_at = CURRENT_TIMESTAMP, approved_by = ?
                WHERE id = ? AND status = 'pending'
            `;
            this.db.run(query, [approverId, membershipId], function(err) {
                if (err) reject(err);
                else resolve({ updated: this.changes > 0 });
            });
        });
    }

    async removeMembership(orgId, userId) {
        return new Promise((resolve, reject) => {
            // Prevent removing the owner
            const query = `
                DELETE FROM organization_memberships 
                WHERE organization_id = ? AND user_id = ? AND role != 'owner'
            `;
            this.db.run(query, [orgId, userId], function(err) {
                if (err) reject(err);
                else resolve({ deleted: this.changes > 0 });
            });
        });
    }

    async getPendingMemberships(orgId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT om.*, u.username, u.email, u.unique_id
                FROM organization_memberships om
                INNER JOIN users u ON om.user_id = u.id
                WHERE om.organization_id = ? AND om.status = 'pending'
                ORDER BY om.requested_at ASC
            `;
            this.db.all(query, [orgId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getOrganizationMembers(orgId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT om.*, u.username, u.email, u.unique_id
                FROM organization_memberships om
                INNER JOIN users u ON om.user_id = u.id
                WHERE om.organization_id = ? AND om.status = 'approved'
                ORDER BY om.role = 'owner' DESC, u.username ASC
            `;
            this.db.all(query, [orgId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getMembershipStatus(orgId, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM organization_memberships 
                WHERE organization_id = ? AND user_id = ?
            `;
            this.db.get(query, [orgId, userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async isOrganizationMember(orgId, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 1 FROM organization_memberships 
                WHERE organization_id = ? AND user_id = ? AND status = 'approved'
            `;
            this.db.get(query, [orgId, userId], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    }

    async isOrganizationOwnerOrAdmin(orgId, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 1 FROM organization_memberships 
                WHERE organization_id = ? AND user_id = ? 
                AND status = 'approved' AND role IN ('owner', 'admin')
            `;
            this.db.get(query, [orgId, userId], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    }

    // ===== Organization Proposals =====

    async getOrganizationProposals(orgId, filter = 'all') {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT p.*, 
                       (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote_value = 1) as yes_count,
                       (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote_value = 0) as no_count,
                       (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id) as total_votes
                FROM proposals p
                WHERE p.organization_id = ?
            `;
            
            const today = new Date().toISOString().split('T')[0];
            
            if (filter === 'active') {
                query += ` AND (p.decision_date >= '${today}' OR p.decision_date IS NULL)`;
            } else if (filter === 'past') {
                query += ` AND p.decision_date < '${today}'`;
            }
            
            query += ` ORDER BY p.created_at DESC`;
            
            this.db.all(query, [orgId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async createOrganizationProposal(orgId, userId, proposalData) {
        return new Promise(async (resolve, reject) => {
            const { title, original_text, authorized_by, decision_date, allowed_voters } = proposalData;
            
            try {
                // Get organization name for 'creator' field
                const org = await this.getOrganizationById(orgId);
                if (!org) {
                    reject(new Error('Organization not found'));
                    return;
                }
                
                // Get user for authorized_by if not provided
                let authorizer = authorized_by;
                if (!authorizer) {
                    const user = await this.getUserById(userId);
                    authorizer = user ? user.username : 'System';
                }
                
                const allowedVotersStr = allowed_voters === 'ALL' ? 'ALL' : JSON.stringify(allowed_voters);
                
                const query = `
                    INSERT INTO proposals (title, original_text, creator, authorized_by, decision_date, created_by_user_id, organization_id, allowed_voters, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `;
                
                this.db.run(query, [title, original_text, org.name, authorizer, decision_date, userId, orgId, allowedVotersStr], function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, success: true });
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async updateProposal(proposalId, userId, updateData) {
        return new Promise(async (resolve, reject) => {
            try {
                // Verify user has permission (is org owner/admin)
                const proposal = await this.getProposalById(proposalId);
                if (!proposal) {
                    reject(new Error('Proposal not found'));
                    return;
                }
                
                if (proposal.organization_id) {
                    const isOwnerOrAdmin = await this.isOrganizationOwnerOrAdmin(proposal.organization_id, userId);
                    if (!isOwnerOrAdmin) {
                        reject(new Error('Only organization owners/admins can edit proposals'));
                        return;
                    }
                }
                
                const { title, original_text, decision_date } = updateData;
                const updates = [];
                const params = [];
                
                if (title) { updates.push('title = ?'); params.push(title); }
                if (original_text) { updates.push('original_text = ?'); params.push(original_text); }
                if (decision_date) { updates.push('decision_date = ?'); params.push(decision_date); }
                
                if (updates.length === 0) {
                    resolve({ success: true, message: 'No changes' });
                    return;
                }
                
                updates.push('updated_at = CURRENT_TIMESTAMP');
                params.push(proposalId);
                
                const query = `UPDATE proposals SET ${updates.join(', ')} WHERE id = ?`;
                
                this.db.run(query, params, function(err) {
                    if (err) reject(err);
                    else resolve({ success: true, changes: this.changes });
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Update voting permissions for a proposal
     * @param {number} proposalId - The proposal ID
     * @param {string} allowedVoters - 'ALL' or JSON array of user IDs
     * @returns {Promise<{success: boolean, allowed_voters: string}>}
     */
    async updateProposalVotingPermissions(proposalId, allowedVoters) {
        return new Promise((resolve, reject) => {
            // Convert array to JSON string for storage, or keep 'ALL' as is
            const votersValue = Array.isArray(allowedVoters) 
                ? JSON.stringify(allowedVoters) 
                : allowedVoters;
            
            const query = `
                UPDATE proposals 
                SET allowed_voters = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            
            this.db.run(query, [votersValue, proposalId], function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('Proposal not found'));
                } else {
                    resolve({ success: true, allowed_voters: votersValue });
                }
            });
        });
    }

    async canUserVoteOnProposal(userId, proposalId) {
        return new Promise(async (resolve, reject) => {
            try {
                const proposal = await this.getProposalById(proposalId);
                if (!proposal) {
                    resolve({ canVote: false, reason: 'Proposal not found' });
                    return;
                }
                
                // Check if user is org member
                if (proposal.organization_id) {
                    const isMember = await this.isOrganizationMember(proposal.organization_id, userId);
                    if (!isMember) {
                        resolve({ canVote: false, reason: 'Not a member of this organization' });
                        return;
                    }
                    
                    // Check allowed_voters
                    if (proposal.allowed_voters && proposal.allowed_voters !== 'ALL') {
                        try {
                            const allowedList = JSON.parse(proposal.allowed_voters);
                            if (!allowedList.includes(userId.toString()) && !allowedList.includes(userId)) {
                                resolve({ canVote: false, reason: 'Not in allowed voters list', restricted: true });
                                return;
                            }
                        } catch (e) {
                            // If parsing fails, assume ALL
                        }
                    }
                }
                
                // Check if already voted
                const existingVote = await this.getUserVote(userId, proposalId);
                if (existingVote !== null) {
                    resolve({ canVote: false, reason: 'Already voted', alreadyVoted: true });
                    return;
                }
                
                resolve({ canVote: true });
            } catch (error) {
                reject(error);
            }
        });
    }

    // ===== Petitions =====

    async createPetition(proposalId, userId, petitionText) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO petitions (proposal_id, user_id, petition_text)
                VALUES (?, ?, ?)
            `;
            this.db.run(query, [proposalId, userId, petitionText], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, success: true });
            });
        });
    }

    async updatePetition(petitionId, userId, petitionText) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE petitions 
                SET petition_text = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `;
            this.db.run(query, [petitionText, petitionId, userId], function(err) {
                if (err) reject(err);
                else resolve({ success: true, updated: this.changes > 0 });
            });
        });
    }

    async deletePetition(petitionId, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                DELETE FROM petitions 
                WHERE id = ? AND user_id = ?
            `;
            this.db.run(query, [petitionId, userId], function(err) {
                if (err) reject(err);
                else resolve({ success: true, deleted: this.changes > 0 });
            });
        });
    }

    async getPetitionsForProposal(proposalId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT pt.*, u.username, u.unique_id,
                       CASE WHEN pt.updated_at > pt.created_at THEN 1 ELSE 0 END as is_edited
                FROM petitions pt
                INNER JOIN users u ON pt.user_id = u.id
                WHERE pt.proposal_id = ?
                ORDER BY pt.created_at DESC
            `;
            this.db.all(query, [proposalId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getOrganizationPetitions(orgId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT pt.*, u.username, u.unique_id, p.title as proposal_title,
                       CASE WHEN pt.updated_at > pt.created_at THEN 1 ELSE 0 END as is_edited
                FROM petitions pt
                INNER JOIN users u ON pt.user_id = u.id
                INNER JOIN proposals p ON pt.proposal_id = p.id
                WHERE p.organization_id = ?
                ORDER BY pt.created_at DESC
            `;
            this.db.all(query, [orgId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async getUserPetition(proposalId, userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM petitions
                WHERE proposal_id = ? AND user_id = ?
            `;
            this.db.get(query, [proposalId, userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Check if user has cached AI analysis
    async hasUserAnalysis(userId, proposalId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT 1 FROM user_proposal_analyses WHERE user_id = ? AND proposal_id = ?`;
            this.db.get(query, [userId, proposalId], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    }

    // Kick member from organization
    async kickMember(orgId, memberId, kickerId) {
        return new Promise(async (resolve, reject) => {
            try {
                // Verify kicker is owner/admin
                const isOwnerOrAdmin = await this.isOrganizationOwnerOrAdmin(orgId, kickerId);
                if (!isOwnerOrAdmin) {
                    reject(new Error('Only organization owners/admins can kick members'));
                    return;
                }
                
                // Can't kick the owner
                const membership = await this.getMembershipStatus(orgId, memberId);
                if (membership && membership.role === 'owner') {
                    reject(new Error('Cannot kick the organization owner'));
                    return;
                }
                
                const result = await this.removeMembership(orgId, memberId);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    }

    close() {
        this.db.close();
    }
}

// Create singleton instance
const userDB = new UserDatabase();
export default userDB;