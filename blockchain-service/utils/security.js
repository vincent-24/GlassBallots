/**
 * Security Utilities
 * 
 * AES-256-GCM encryption for sensitive data (email)
 * Input sanitization for user-provided data
 */

import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Get or generate encryption key from environment
function getEncryptionKey() {
    let key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY must be set in environment.');
    }
    // Ensure key is 32 bytes (64 hex characters)
    if (key.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    
    return Buffer.from(key, 'hex');
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string} plaintext - The data to encrypt
 * @returns {string} - Base64 encoded encrypted data (iv:authTag:ciphertext)
 */
export function encrypt(plaintext) {
    if (!plaintext) return null;
    
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        // Format: iv:authTag:ciphertext (all in hex, then base64 encoded)
        const combined = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
        return Buffer.from(combined).toString('base64');
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @returns {string} - The decrypted plaintext
 */
export function decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
        const key = getEncryptionKey();
        
        // Decode from base64
        const combined = Buffer.from(encryptedData, 'base64').toString('utf8');
        const [ivHex, authTagHex, ciphertext] = combined.split(':');
        
        if (!ivHex || !authTagHex || !ciphertext) {
            // Data might not be encrypted (legacy), return as-is
            return encryptedData;
        }
        
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        // If decryption fails, the data might be unencrypted (legacy)
        // Return original value if it looks like an email
        if (encryptedData.includes('@')) {
            return encryptedData;
        }
        console.error('Decryption error:', error);
        return null;
    }
}

/**
 * Check if a string is encrypted (base64 with our format)
 * @param {string} data - The data to check
 * @returns {boolean}
 */
export function isEncrypted(data) {
    if (!data) return false;
    try {
        const decoded = Buffer.from(data, 'base64').toString('utf8');
        const parts = decoded.split(':');
        return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
    } catch {
        return false;
    }
}

// ===== Input Sanitization =====

/**
 * HTML entity encoding to prevent XSS
 */
const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
};

/**
 * Sanitize a string by escaping HTML entities
 * @param {string} input - User input to sanitize
 * @returns {string} - Sanitized string
 */
export function sanitizeHtml(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[&<>"'`=\/]/g, char => HTML_ENTITIES[char] || char);
}

/**
 * Remove potentially dangerous characters and patterns
 * @param {string} input - User input to sanitize
 * @returns {string} - Sanitized string
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');
    
    // Remove script tags and their content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove event handlers (onclick, onerror, etc.)
    sanitized = sanitized.replace(/\bon\w+\s*=/gi, '');
    
    // Remove javascript: and data: protocols
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:/gi, '');
    
    // Escape HTML entities
    sanitized = sanitizeHtml(sanitized);
    
    return sanitized.trim();
}

/**
 * Sanitize username (alphanumeric and underscores only)
 * @param {string} username - Username to sanitize
 * @returns {string} - Sanitized username
 */
export function sanitizeUsername(username) {
    if (typeof username !== 'string') return '';
    // Allow alphanumeric, underscores, and hyphens only
    return username.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
}

/**
 * Validate and sanitize email format
 * @param {string} email - Email to validate
 * @returns {string|null} - Sanitized email or null if invalid
 */
export function sanitizeEmail(email) {
    if (typeof email !== 'string') return null;
    
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmed = email.trim().toLowerCase();
    
    if (!emailRegex.test(trimmed)) {
        return null;
    }
    
    // Limit length
    if (trimmed.length > 254) {
        return null;
    }
    
    return trimmed;
}

/**
 * Sanitize SQL-like input (prevent basic injection)
 * Note: Always use parameterized queries as primary defense
 * @param {string} input - Input to sanitize
 * @returns {string} - Sanitized input
 */
export function sanitizeSqlInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove common SQL injection patterns
    return input
        .replace(/['";\\]/g, '') // Remove quotes and backslashes
        .replace(/--/g, '') // Remove SQL comments
        .replace(/\/\*/g, '') // Remove block comment start
        .replace(/\*\//g, ''); // Remove block comment end
}

/**
 * Deep sanitize an object (for request bodies)
 * @param {object} obj - Object to sanitize
 * @param {object} options - { skipFields: ['field1', 'field2'] }
 * @returns {object} - Sanitized object
 */
export function sanitizeObject(obj, options = {}) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const skipFields = options.skipFields || ['password', 'passwordHash'];
    const result = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
        if (skipFields.includes(key)) {
            // Don't sanitize passwords
            result[key] = value;
        } else if (typeof value === 'string') {
            result[key] = sanitizeInput(value);
        } else if (typeof value === 'object' && value !== null) {
            result[key] = sanitizeObject(value, options);
        } else {
            result[key] = value;
        }
    }
    
    return result;
}

/**
 * Express middleware for input sanitization
 */
export function sanitizationMiddleware(req, res, next) {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body, { skipFields: ['password', 'passwordHash', 'encryptedEmail'] });
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
                req.query[key] = sanitizeInput(value);
            }
        }
    }
    
    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
        for (const [key, value] of Object.entries(req.params)) {
            if (typeof value === 'string') {
                req.params[key] = sanitizeInput(value);
            }
        }
    }
    
    next();
}

export default {
    encrypt,
    decrypt,
    isEncrypted,
    sanitizeHtml,
    sanitizeInput,
    sanitizeUsername,
    sanitizeEmail,
    sanitizeSqlInput,
    sanitizeObject,
    sanitizationMiddleware
};
