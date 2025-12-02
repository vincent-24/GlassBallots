-- ============================================
-- GLASSBALLOTS DATABASE SCHEMA
-- ============================================
-- SQLite schema for user management, proposals, votes, and feedback
-- ============================================

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

-- Users table to store account information
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'student' CHECK(role IN ('student', 'council', 'admin', 'moderator')),
    password_hash TEXT,
    salt TEXT,
    encrypted_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User profiles with encrypted personal data
CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, field_name)
);

-- Sessions for user authentication
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ============================================
-- PROPOSALS
-- ============================================

-- Proposals table to store all governance proposals
CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    original_text TEXT NOT NULL,
    creator TEXT NOT NULL,
    authorized_by TEXT,
    decision_date TEXT NOT NULL,
    created_by_user_id INTEGER,
    organization_id INTEGER,  -- Reference to organization (for org-specific proposals)
    allowed_voters TEXT DEFAULT 'ALL',  -- JSON array of user IDs or 'ALL' for all members
    blockchain_proposal_id INTEGER,  -- Reference to on-chain proposal ID
    ipfs_hash TEXT,  -- IPFS hash for decentralized storage
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'closed', 'archived')),
    start_at DATETIME,
    end_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

-- Petitions (user-submitted modification requests for proposals)
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
);

-- AI Analysis results for proposals
CREATE TABLE IF NOT EXISTS proposal_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id INTEGER NOT NULL UNIQUE,
    neutral_summary TEXT,
    loaded_language TEXT,  -- JSON array of loaded words
    stakeholders TEXT,  -- JSON array of stakeholder groups
    equity_concerns TEXT,  -- JSON array of equity concerns
    objective_facts TEXT,  -- JSON object of objective facts
    analysis_version TEXT DEFAULT '1.0',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE
);

-- Per-user AI Analysis cache (allows regeneration per user)
CREATE TABLE IF NOT EXISTS user_proposal_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    proposal_id INTEGER NOT NULL,
    neutral_summary TEXT,
    loaded_language TEXT,  -- JSON array of loaded words
    stakeholders TEXT,  -- JSON array of stakeholder groups
    equity_concerns TEXT,  -- JSON array of equity concerns
    objective_facts TEXT,  -- JSON object of objective facts
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
    UNIQUE(user_id, proposal_id)  -- One analysis per user per proposal
);

-- ============================================
-- VOTING
-- ============================================

-- Vote records (mirror of blockchain for fast queries)
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    vote_value BOOLEAN NOT NULL,  -- TRUE for yes, FALSE for no
    transaction_hash TEXT,  -- Blockchain transaction hash
    block_number INTEGER,  -- Block number where vote was recorded
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(proposal_id, user_id)  -- Prevent double voting
);

-- Vote tallies (cached for performance)
CREATE TABLE IF NOT EXISTS vote_tallies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id INTEGER NOT NULL UNIQUE,
    yes_count INTEGER DEFAULT 0,
    no_count INTEGER DEFAULT 0,
    total_votes INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE
);

-- ============================================
-- FEEDBACK
-- ============================================

-- Student feedback on proposals
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id INTEGER NOT NULL,
    user_id INTEGER,
    wallet_address TEXT NOT NULL,
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    category TEXT CHECK(category IN ('academic', 'campus', 'financial', 'other')),
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_visible BOOLEAN DEFAULT TRUE,
    moderated BOOLEAN DEFAULT FALSE,
    blockchain_feedback_id INTEGER,  -- Reference to on-chain feedback ID
    transaction_hash TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- ============================================
-- AUDIT TRAIL
-- ============================================

-- Audit log for tracking all important actions
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action_type TEXT NOT NULL,  -- 'create_proposal', 'vote', 'feedback', 'login', etc.
    entity_type TEXT,  -- 'proposal', 'vote', 'feedback', 'user'
    entity_id INTEGER,
    details TEXT,  -- JSON object with additional details
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- Proposal indexes
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_blockchain_id ON proposals(blockchain_proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON proposals(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_dates ON proposals(start_at, end_at);

-- Vote indexes
CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_wallet ON votes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(voted_at);

-- Feedback indexes
CREATE INDEX IF NOT EXISTS idx_feedback_proposal ON feedback(proposal_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_visible ON feedback(is_visible);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(category);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at);

-- ============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Update user updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update proposal updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_proposals_timestamp 
AFTER UPDATE ON proposals
FOR EACH ROW
BEGIN
    UPDATE proposals SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update vote tallies when a vote is inserted
CREATE TRIGGER IF NOT EXISTS update_vote_tallies_insert
AFTER INSERT ON votes
FOR EACH ROW
BEGIN
    INSERT INTO vote_tallies (proposal_id, yes_count, no_count, total_votes)
    VALUES (NEW.proposal_id, 
            CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
            CASE WHEN NEW.vote_value = 0 THEN 1 ELSE 0 END,
            1)
    ON CONFLICT(proposal_id) DO UPDATE SET
        yes_count = yes_count + CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
        no_count = no_count + CASE WHEN NEW.vote_value = 0 THEN 1 ELSE 0 END,
        total_votes = total_votes + 1,
        last_updated = CURRENT_TIMESTAMP;
END;

-- Clean up expired sessions (called manually or via cron)
CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
AFTER INSERT ON user_sessions
FOR EACH ROW
BEGIN
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
END;
