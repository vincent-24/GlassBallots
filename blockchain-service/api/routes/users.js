import express from 'express';
import userDB from '../../database/db.js';
import crypto from 'crypto';

const router = express.Router();

// Register new user (wallet-based, no password)
router.post('/register', async (req, res) => {
    try {
        const { walletAddress, email, username, role } = req.body;
        
        if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address is required' });
        }

        const user = await userDB.createUser({
            walletAddress,
            email,
            username,
            role
        });

        // Create session
        const session = await userDB.createSession(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                email: user.email,
                username: user.username,
                role: user.role
            },
            session: session.sessionToken,
            expiresAt: session.expiresAt
        });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            res.status(409).json({ error: 'User already exists' });
        } else {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Register new user with password
router.post('/register-with-password', async (req, res) => {
    try {
        const { walletAddress, email, username, role, password } = req.body;
        
        if (!walletAddress || !password) {
            return res.status(400).json({ error: 'Wallet address and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        const user = await userDB.createUserWithPassword({
            walletAddress,
            email,
            username,
            role,
            password
        });

        // Create session
        const session = await userDB.createSession(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                email: user.email,
                username: user.username,
                role: user.role
            },
            session: session.sessionToken,
            expiresAt: session.expiresAt
        });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            res.status(409).json({ error: 'User already exists' });
        } else {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Signup with username, email, and password
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters long' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Check if username already exists
        const existingUser = await userDB.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        // Check if email already exists
        const existingEmail = await userDB.getUserByEmail(email);
        if (existingEmail) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Generate unique wallet address based on username + timestamp
        const walletHash = crypto.createHash('sha256')
            .update(`${username}-${email}-${Date.now()}`)
            .digest('hex')
            .substring(0, 40);
        const walletAddress = `0x${walletHash}`;

        const user = await userDB.createUserWithPassword({
            walletAddress,
            email,
            username,
            role: 'student',
            password
        });

        // Create session
        const session = await userDB.createSession(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.walletAddress || user.wallet_address,
                email: user.email,
                username: user.username,
                role: user.role,
                unique_id: user.unique_id
            },
            session: session.sessionToken,
            expiresAt: session.expiresAt
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login with email/username and password
router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        
        if (!identifier || !password) {
            return res.status(400).json({ error: 'Username/email and password are required' });
        }

        const user = await userDB.verifyUserCredentials(identifier, password);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Create session
        const session = await userDB.createSession(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.wallet_address,
                email: user.email,
                username: user.username,
                role: user.role,
                unique_id: user.unique_id
            },
            session: session.sessionToken,
            expiresAt: session.expiresAt
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            error: 'An error occurred during login. Please try again.' 
        });
    }
});

// Get user profile by username
router.get('/profile/by-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.wallet_address,
                email: user.email,
                username: user.username,
                role: user.role,
                unique_id: user.unique_id,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update username
router.put('/profile/:username/username', async (req, res) => {
    try {
        const { username } = req.params;
        const { newUsername } = req.body;
        
        if (!newUsername || newUsername.length < 3) {
            return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await userDB.updateUsername(user.id, newUsername);
        
        res.json({ 
            success: true, 
            message: 'Username updated successfully',
            username: newUsername 
        });
    } catch (error) {
        console.error('Username update error:', error);
        if (error.message === 'Username is already taken') {
            return res.status(409).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Change password
router.put('/profile/:username/password', async (req, res) => {
    try {
        const { username } = req.params;
        const { oldPassword, newPassword } = req.body;
        
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Old and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await userDB.updatePassword(user.id, oldPassword, newPassword);
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        if (error.message === 'Current password is incorrect') {
            return res.status(401).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get user profile
router.get('/profile/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const user = await userDB.getUserByWallet(walletAddress);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const profile = await userDB.getUserProfile(user.id);

        res.json({
            user: {
                id: user.id,
                walletAddress: user.wallet_address,
                email: user.email,
                username: user.username,
                role: user.role,
                createdAt: user.created_at
            },
            profile
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user profile (encrypted data)
router.put('/profile/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { profileData } = req.body;

        const user = await userDB.getUserByWallet(walletAddress);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await userDB.updateUserProfile(user.id, profileData);

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update password
router.put('/:walletAddress/password', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { currentPassword, newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long' });
        }

        const user = await userDB.getUserByWallet(walletAddress);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password if one exists
        if (user.password_hash) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password is required' });
            }
            
            const isValid = await userDB.verifyPassword(currentPassword, user.password_hash);
            if (!isValid) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
        }

        await userDB.updatePassword(user.id, newPassword);

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Validate session
router.get('/session/validate', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        
        if (!sessionToken) {
            return res.status(401).json({ error: 'No session token provided' });
        }

        const session = await userDB.validateSession(sessionToken);
        
        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        res.json({
            valid: true,
            user: {
                walletAddress: session.wallet_address,
                email: session.email,
                username: session.username,
                role: session.role
            }
        });
    } catch (error) {
        console.error('Session validation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== User Proposals Endpoints (by username) =====
// These routes must come BEFORE the generic /:walletAddress routes

// Get user's voted proposals
router.get('/by-username/:username/voted', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const proposals = await userDB.getUserVotedProposals(user.id);

        res.json({
            success: true,
            proposals
        });
    } catch (error) {
        console.error('Error fetching voted proposals:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Get user's bookmarked proposals
router.get('/by-username/:username/bookmarked', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const proposals = await userDB.getUserBookmarkedProposals(user.id);

        res.json({
            success: true,
            proposals
        });
    } catch (error) {
        console.error('Error fetching bookmarked proposals:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Get user's petitioned proposals
router.get('/by-username/:username/petitioned', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const proposals = await userDB.getUserPetitionedProposals(user.id);

        res.json({
            success: true,
            proposals
        });
    } catch (error) {
        console.error('Error fetching petitioned proposals:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// ===== Bookmark Management =====

// Add bookmark
router.post('/by-username/:username/bookmarks/:proposalId', async (req, res) => {
    try {
        const { username, proposalId } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        await userDB.addBookmark(user.id, parseInt(proposalId));

        res.json({
            success: true,
            message: 'Proposal bookmarked'
        });
    } catch (error) {
        if (error.message.includes('already bookmarked')) {
            return res.status(409).json({ 
                success: false, 
                error: error.message 
            });
        }
        console.error('Error adding bookmark:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Remove bookmark
router.delete('/by-username/:username/bookmarks/:proposalId', async (req, res) => {
    try {
        const { username, proposalId } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const result = await userDB.removeBookmark(user.id, parseInt(proposalId));

        res.json({
            success: true,
            deleted: result.deleted
        });
    } catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Check if proposal is bookmarked
router.get('/by-username/:username/bookmarks/:proposalId', async (req, res) => {
    try {
        const { username, proposalId } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const isBookmarked = await userDB.isBookmarked(user.id, parseInt(proposalId));

        res.json({
            success: true,
            isBookmarked
        });
    } catch (error) {
        console.error('Error checking bookmark:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Toggle bookmark (add if not exists, remove if exists)
router.post('/by-username/:username/bookmarks/:proposalId/toggle', async (req, res) => {
    try {
        const { username, proposalId } = req.params;
        const user = await userDB.getUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const isCurrentlyBookmarked = await userDB.isBookmarked(user.id, parseInt(proposalId));
        
        if (isCurrentlyBookmarked) {
            await userDB.removeBookmark(user.id, parseInt(proposalId));
            res.json({
                success: true,
                bookmarked: false,
                message: 'Bookmark removed'
            });
        } else {
            await userDB.addBookmark(user.id, parseInt(proposalId));
            res.json({
                success: true,
                bookmarked: true,
                message: 'Proposal bookmarked'
            });
        }
    } catch (error) {
        console.error('Error toggling bookmark:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// ===== Wallet-based routes (generic param routes must come last) =====

// Check if user has password
router.get('/:walletAddress/has-password', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const user = await userDB.getUserByWallet(walletAddress);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const hasPassword = await userDB.hasPassword(user.id);

        res.json({ hasPassword });
    } catch (error) {
        console.error('Password check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;