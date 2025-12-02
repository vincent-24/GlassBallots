-- Migration: Add user-specific analysis caching
-- This allows each user to have their own cached AI analysis for proposals

-- Drop the old proposal_analyses table (it had UNIQUE constraint on proposal_id)
DROP TABLE IF EXISTS proposal_analyses;

-- Create new user_proposal_analyses table with composite key
CREATE TABLE IF NOT EXISTS user_proposal_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    proposal_id INTEGER NOT NULL,
    neutral_summary TEXT,
    loaded_language TEXT,  -- JSON array of loaded words
    stakeholders TEXT,  -- JSON array of stakeholder groups
    equity_concerns TEXT,  -- JSON array of equity concerns
    objective_facts TEXT,  -- JSON object of objective facts
    analysis_version TEXT DEFAULT '1.0',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
    UNIQUE(user_id, proposal_id)  -- Each user can only have one analysis per proposal
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_proposal_analyses_lookup 
ON user_proposal_analyses(user_id, proposal_id);
