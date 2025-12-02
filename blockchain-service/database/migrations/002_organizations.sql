-- ============================================
-- ORGANIZATIONS FEATURE - MIGRATION
-- ============================================
-- Adds tables for organization management and membership
-- ============================================

-- Organizations table
-- Stores organization details with unique join codes
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unique_code TEXT UNIQUE NOT NULL,       -- 8-character unique join code
    description TEXT,
    owner_id INTEGER NOT NULL,              -- User who created the organization
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Organization memberships table
-- Tracks user membership in organizations with approval status
CREATE TABLE IF NOT EXISTS organization_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    role TEXT DEFAULT 'member' CHECK(role IN ('member', 'moderator', 'admin', 'owner')),
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    approved_by INTEGER,                    -- User who approved the membership
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
    UNIQUE(organization_id, user_id)        -- One membership per user per org
);

-- Update proposals table to link to organizations
-- Add organization_id column to proposals (nullable for existing proposals)
ALTER TABLE proposals ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- ============================================
-- INDEXES FOR ORGANIZATIONS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_organizations_code ON organizations(unique_code);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);

CREATE INDEX IF NOT EXISTS idx_memberships_org ON organization_memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON organization_memberships(status);

CREATE INDEX IF NOT EXISTS idx_proposals_org ON proposals(organization_id);

-- ============================================
-- TRIGGERS FOR ORGANIZATIONS
-- ============================================

-- Update organization updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_organizations_timestamp 
AFTER UPDATE ON organizations
FOR EACH ROW
BEGIN
    UPDATE organizations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- When a new organization is created, automatically add owner as approved member
CREATE TRIGGER IF NOT EXISTS auto_add_owner_membership
AFTER INSERT ON organizations
FOR EACH ROW
BEGIN
    INSERT INTO organization_memberships (organization_id, user_id, status, role, approved_at)
    VALUES (NEW.id, NEW.owner_id, 'approved', 'owner', CURRENT_TIMESTAMP);
END;
