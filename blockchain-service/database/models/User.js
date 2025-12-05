/**
 * User Model
 * Handles authentication, profiles, and user management
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import BaseModel from './BaseModel.js';

class User extends BaseModel {
    constructor(db, encryptionKey) {
        super(db);
        this.encryptionKey = encryptionKey || process.env.ENCRYPTION_KEY;
        if (!this.encryptionKey) {
            throw new Error('ENCRYPTION_KEY must be set in environment or passed to User model.');
        }
    }

    // ==================== AUTHENTICATION ====================

    /**
     * Create a new user with password
     * @param {Object} userData - { email, username, password, walletAddress }
     * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
     */
    async createUser({ email, username, password, walletAddress }) {
        try {
            // Check for existing user
            const existing = await this.get(
                'SELECT id FROM users WHERE email = ? OR username = ? OR wallet_address = ?',
                [email, username, walletAddress]
            );

            if (existing) {
                return { success: false, error: 'Email, username, or wallet already exists' };
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            const uniqueId = await this.generateUniqueId();

            const result = await this.run(
                `INSERT INTO users (email, username, password_hash, salt, wallet_address, unique_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [email, username, passwordHash, salt, walletAddress, uniqueId]
            );

            const user = await this.get('SELECT id, email, username, unique_id, wallet_address FROM users WHERE id = ?', [result.lastID]);

            return { success: true, user };
        } catch (error) {
            console.error('Error creating user:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Authenticate user with username/email and password
     * @param {string} identifier - Username or email
     * @param {string} password - Plain text password
     * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
     */
    async authenticate(identifier, password) {
        try {
            const user = await this.get(
                'SELECT * FROM users WHERE username = ? OR email = ?',
                [identifier, identifier]
            );

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            if (!user.password_hash) {
                return { success: false, error: 'Password not set for this account' };
            }

            const isValid = await bcrypt.compare(password, user.password_hash);

            if (!isValid) {
                return { success: false, error: 'Invalid password' };
            }

            // Return user without sensitive data
            const { password_hash, salt, encrypted_data, ...safeUser } = user;
            return { success: true, user: safeUser };
        } catch (error) {
            console.error('Authentication error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update user password
     * @param {string} username - Username
     * @param {string} oldPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updatePassword(username, oldPassword, newPassword) {
        try {
            const auth = await this.authenticate(username, oldPassword);
            if (!auth.success) {
                return { success: false, error: 'Current password is incorrect' };
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(newPassword, salt);

            await this.run(
                'UPDATE users SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?',
                [passwordHash, salt, username]
            );

            return { success: true };
        } catch (error) {
            console.error('Error updating password:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== PROFILE MANAGEMENT ====================

    /**
     * Get user profile by username
     * @param {string} username - Username
     * @returns {Promise<Object|null>}
     */
    async getByUsername(username) {
        return this.get(
            'SELECT id, email, username, unique_id, wallet_address, role, created_at FROM users WHERE username = ?',
            [username]
        );
    }

    /**
     * Get user by ID
     * @param {number} id - User ID
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        return this.get(
            'SELECT id, email, username, unique_id, wallet_address, role, created_at FROM users WHERE id = ?',
            [id]
        );
    }

    /**
     * Get user by unique ID
     * @param {string} uniqueId - Unique ID (#XXXXX...)
     * @returns {Promise<Object|null>}
     */
    async getByUniqueId(uniqueId) {
        return this.get(
            'SELECT id, email, username, unique_id, wallet_address, role, created_at FROM users WHERE unique_id = ?',
            [uniqueId]
        );
    }

    /**
     * Update username
     * @param {string} currentUsername - Current username
     * @param {string} newUsername - New username
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updateUsername(currentUsername, newUsername) {
        try {
            // Check if new username is taken
            const existing = await this.get('SELECT id FROM users WHERE username = ?', [newUsername]);
            if (existing) {
                return { success: false, error: 'Username already taken' };
            }

            await this.run(
                'UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?',
                [newUsername, currentUsername]
            );

            return { success: true };
        } catch (error) {
            console.error('Error updating username:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get user with stats (votes, petitions count)
     * @param {string} username - Username
     * @returns {Promise<Object|null>}
     */
    async getProfileWithStats(username) {
        const user = await this.getByUsername(username);
        if (!user) return null;

        const votesCount = await this.get(
            'SELECT COUNT(*) as count FROM votes WHERE user_id = ?',
            [user.id]
        );

        const petitionsCount = await this.get(
            'SELECT COUNT(*) as count FROM petitions WHERE user_id = ?',
            [user.id]
        );

        return {
            ...user,
            votes_count: votesCount?.count || 0,
            petitions_count: petitionsCount?.count || 0
        };
    }

    // ==================== USER PROPOSALS ====================

    /**
     * Get proposals user has voted on
     * @param {string} username - Username
     * @returns {Promise<Array>}
     */
    async getVotedProposals(username) {
        return this.all(
            `SELECT p.*, v.vote as user_vote, v.created_at as vote_date
             FROM proposals p
             JOIN votes v ON p.id = v.proposal_id
             JOIN users u ON v.user_id = u.id
             WHERE u.username = ?
             ORDER BY v.created_at DESC`,
            [username]
        );
    }

    /**
     * Get user's bookmarked proposals
     * @param {string} username - Username
     * @returns {Promise<Array>}
     */
    async getBookmarkedProposals(username) {
        return this.all(
            `SELECT p.*, b.created_at as bookmarked_at
             FROM proposals p
             JOIN bookmarks b ON p.id = b.proposal_id
             JOIN users u ON b.user_id = u.id
             WHERE u.username = ?
             ORDER BY b.created_at DESC`,
            [username]
        );
    }

    /**
     * Get proposals user has petitioned
     * @param {string} username - Username
     * @returns {Promise<Array>}
     */
    async getPetitionedProposals(username) {
        return this.all(
            `SELECT p.id, p.title, p.original_text, p.decision_date, p.status,
                    pt.petition_text, pt.created_at as petition_date, pt.id as petition_id,
                    CASE WHEN pt.updated_at > pt.created_at THEN 1 ELSE 0 END as is_edited
             FROM proposals p
             JOIN petitions pt ON p.id = pt.proposal_id
             JOIN users u ON pt.user_id = u.id
             WHERE u.username = ?
             ORDER BY pt.created_at DESC`,
            [username]
        );
    }

    /**
     * Toggle bookmark for a proposal
     * @param {string} username - Username
     * @param {number} proposalId - Proposal ID
     * @returns {Promise<{success: boolean, bookmarked: boolean}>}
     */
    async toggleBookmark(username, proposalId) {
        try {
            const user = await this.getByUsername(username);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const existing = await this.get(
                'SELECT id FROM bookmarks WHERE user_id = ? AND proposal_id = ?',
                [user.id, proposalId]
            );

            if (existing) {
                await this.run('DELETE FROM bookmarks WHERE id = ?', [existing.id]);
                return { success: true, bookmarked: false };
            } else {
                await this.run(
                    'INSERT INTO bookmarks (user_id, proposal_id) VALUES (?, ?)',
                    [user.id, proposalId]
                );
                return { success: true, bookmarked: true };
            }
        } catch (error) {
            console.error('Error toggling bookmark:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user has bookmarked a proposal
     * @param {string} username - Username
     * @param {number} proposalId - Proposal ID
     * @returns {Promise<boolean>}
     */
    async isBookmarked(username, proposalId) {
        const user = await this.getByUsername(username);
        if (!user) return false;

        const bookmark = await this.get(
            'SELECT id FROM bookmarks WHERE user_id = ? AND proposal_id = ?',
            [user.id, proposalId]
        );

        return !!bookmark;
    }

    // ==================== UTILITIES ====================

    /**
     * Generate unique 16-character ID starting with #
     * @returns {Promise<string>}
     */
    async generateUniqueId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let uniqueId;
        let exists = true;

        while (exists) {
            let id = '#';
            for (let i = 0; i < 15; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            uniqueId = id;

            const existing = await this.get('SELECT 1 FROM users WHERE unique_id = ?', [uniqueId]);
            exists = !!existing;
        }

        return uniqueId;
    }

    /**
     * Encrypt sensitive data
     * @param {string} text - Text to encrypt
     * @returns {Object} - { iv, data, authTag }
     */
    encrypt(text) {
        try {
            const algorithm = 'aes-256-gcm';
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
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
            return {
                iv: '',
                data: Buffer.from(text).toString('base64'),
                authTag: '',
                fallback: true
            };
        }
    }

    /**
     * Decrypt sensitive data
     * @param {Object} encrypted - { iv, data, authTag, fallback? }
     * @returns {string}
     */
    decrypt(encrypted) {
        try {
            if (encrypted.fallback) {
                return Buffer.from(encrypted.data, 'base64').toString('utf8');
            }

            const algorithm = 'aes-256-gcm';
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const iv = Buffer.from(encrypted.iv, 'hex');
            const authTag = Buffer.from(encrypted.authTag, 'hex');
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }

    /**
     * Search users by username or unique ID
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>}
     */
    async search(query, limit = 20) {
        return this.all(
            `SELECT id, username, unique_id FROM users
             WHERE username LIKE ? OR unique_id LIKE ?
             LIMIT ?`,
            [`%${query}%`, `%${query}%`, limit]
        );
    }
}

export default User;
