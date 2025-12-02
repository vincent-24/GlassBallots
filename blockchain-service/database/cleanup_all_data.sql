-- ============================================
-- DATABASE CLEANUP SCRIPT
-- ============================================
-- This script deletes ALL user data while preserving table structures.
-- Run this to start fresh with no users, organizations, proposals, etc.
-- ============================================

-- Disable foreign key checks temporarily for clean deletion
PRAGMA foreign_keys = OFF;

-- Delete from tables in dependency order (children first)

-- User-related data
DELETE FROM user_sessions;
DELETE FROM user_profiles;
DELETE FROM bookmarks;
DELETE FROM user_proposal_analyses;

-- Voting and feedback data
DELETE FROM votes;
DELETE FROM vote_tallies;
DELETE FROM feedback;

-- Proposal-related data
DELETE FROM petitions;
DELETE FROM proposal_analyses;
DELETE FROM proposals;

-- Organization-related data
DELETE FROM organization_memberships;
DELETE FROM organizations;

-- Users (delete last since other tables reference it)
DELETE FROM users;

-- Audit log (optional - uncomment if you want to clear audit history too)
DELETE FROM audit_log;

-- Reset auto-increment counters
DELETE FROM sqlite_sequence WHERE name IN (
    'users',
    'user_sessions',
    'user_profiles',
    'bookmarks',
    'user_proposal_analyses',
    'votes',
    'vote_tallies',
    'feedback',
    'petitions',
    'proposal_analyses',
    'proposals',
    'organization_memberships',
    'organizations',
    'audit_log'
);

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;

-- Verify tables are empty
SELECT 'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL SELECT 'organization_memberships', COUNT(*) FROM organization_memberships
UNION ALL SELECT 'proposals', COUNT(*) FROM proposals
UNION ALL SELECT 'petitions', COUNT(*) FROM petitions
UNION ALL SELECT 'votes', COUNT(*) FROM votes
UNION ALL SELECT 'bookmarks', COUNT(*) FROM bookmarks;
