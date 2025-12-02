/**
 * Organization Model
 * Handles organization CRUD, memberships, and permissions
 */

import BaseModel from './BaseModel.js';

class Organization extends BaseModel {
    constructor(db) {
        super(db);
    }

    // ==================== ORGANIZATION CRUD ====================

    /**
     * Create a new organization
     * @param {Object} data - { name, description, ownerUsername }
     * @returns {Promise<{success: boolean, organization?: Object, error?: string}>}
     */
    async create({ name, description, ownerUsername }) {
        try {
            // Get owner
            const owner = await this.get('SELECT id FROM users WHERE username = ?', [ownerUsername]);
            if (!owner) {
                return { success: false, error: 'Owner not found' };
            }

            const uniqueCode = await this.generateUniqueCode();

            const result = await this.run(
                `INSERT INTO organizations (name, description, owner_id, unique_code)
                 VALUES (?, ?, ?, ?)`,
                [name, description || '', owner.id, uniqueCode]
            );

            // Add owner as a member with 'owner' role
            await this.run(
                `INSERT INTO organization_memberships (organization_id, user_id, status, role, approved_at, approved_by)
                 VALUES (?, ?, 'approved', 'owner', CURRENT_TIMESTAMP, ?)`,
                [result.lastID, owner.id, owner.id]
            );

            const organization = await this.getById(result.lastID);
            return { success: true, organization };
        } catch (error) {
            console.error('Error creating organization:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get organization by ID
     * @param {number} id - Organization ID
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        const org = await this.get(
            `SELECT o.*, u.username as owner_username,
                    (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'approved') as member_count,
                    (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'pending') as pending_count
             FROM organizations o
             JOIN users u ON o.owner_id = u.id
             WHERE o.id = ?`,
            [id]
        );
        return org;
    }

    /**
     * Get organization by unique code
     * @param {string} code - Unique code
     * @returns {Promise<Object|null>}
     */
    async getByCode(code) {
        return this.get(
            `SELECT o.*, u.username as owner_username,
                    (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'approved') as member_count
             FROM organizations o
             JOIN users u ON o.owner_id = u.id
             WHERE o.unique_code = ?`,
            [code.toUpperCase()]
        );
    }

    /**
     * Search organizations
     * @param {string} query - Search query
     * @param {string} username - Current user's username (for membership status)
     * @returns {Promise<Array>}
     */
    async search(query, username = null) {
        let sql = `
            SELECT o.*, u.username as owner_username,
                   (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'approved') as member_count
        `;

        if (username) {
            sql += `,
                   (SELECT status FROM organization_memberships om
                    JOIN users u2 ON om.user_id = u2.id
                    WHERE om.organization_id = o.id AND u2.username = ?) as membership_status`;
        }

        sql += `
             FROM organizations o
             JOIN users u ON o.owner_id = u.id
             WHERE o.name LIKE ? OR o.unique_code LIKE ?
             ORDER BY o.name
             LIMIT 50`;

        const params = username
            ? [username, `%${query}%`, `%${query}%`]
            : [`%${query}%`, `%${query}%`];

        return this.all(sql, params);
    }

    /**
     * Delete organization
     * @param {number} orgId - Organization ID
     * @param {string} username - Username requesting deletion (must be owner)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async delete(orgId, username) {
        try {
            const org = await this.getById(orgId);
            if (!org) {
                return { success: false, error: 'Organization not found' };
            }

            const user = await this.get('SELECT id FROM users WHERE username = ?', [username]);
            if (!user || org.owner_id !== user.id) {
                return { success: false, error: 'Only the owner can delete this organization' };
            }

            // Delete associated proposals first (if any)
            await this.run('DELETE FROM proposals WHERE organization_id = ?', [orgId]);

            // Delete memberships
            await this.run('DELETE FROM organization_memberships WHERE organization_id = ?', [orgId]);

            // Delete organization
            await this.run('DELETE FROM organizations WHERE id = ?', [orgId]);

            return { success: true };
        } catch (error) {
            console.error('Error deleting organization:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== MEMBERSHIP MANAGEMENT ====================

    /**
     * Request to join an organization
     * @param {string} code - Organization unique code
     * @param {string} username - Username requesting to join
     * @returns {Promise<{success: boolean, message?: string, error?: string}>}
     */
    async requestJoin(code, username) {
        try {
            const org = await this.getByCode(code);
            if (!org) {
                return { success: false, error: 'Organization not found' };
            }

            const user = await this.get('SELECT id FROM users WHERE username = ?', [username]);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Check existing membership
            const existing = await this.get(
                'SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ?',
                [org.id, user.id]
            );

            if (existing) {
                if (existing.status === 'approved') {
                    return { success: false, error: 'Already a member of this organization' };
                } else if (existing.status === 'pending') {
                    return { success: false, error: 'Join request already pending' };
                }
            }

            await this.run(
                `INSERT OR REPLACE INTO organization_memberships (organization_id, user_id, status, role, requested_at)
                 VALUES (?, ?, 'pending', 'member', CURRENT_TIMESTAMP)`,
                [org.id, user.id]
            );

            return { success: true, message: 'Join request submitted successfully' };
        } catch (error) {
            console.error('Error requesting to join:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Approve a membership request
     * @param {number} membershipId - Membership ID
     * @param {string} approverUsername - Username approving the request
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async approveMembership(membershipId, approverUsername) {
        try {
            const membership = await this.get(
                'SELECT * FROM organization_memberships WHERE id = ?',
                [membershipId]
            );

            if (!membership) {
                return { success: false, error: 'Membership request not found' };
            }

            // Check if approver has permission
            const canApprove = await this.canManageMembers(membership.organization_id, approverUsername);
            if (!canApprove) {
                return { success: false, error: 'Not authorized to approve memberships' };
            }

            const approver = await this.get('SELECT id FROM users WHERE username = ?', [approverUsername]);

            await this.run(
                `UPDATE organization_memberships
                 SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
                 WHERE id = ?`,
                [approver.id, membershipId]
            );

            return { success: true };
        } catch (error) {
            console.error('Error approving membership:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Reject a membership request
     * @param {number} membershipId - Membership ID
     * @param {string} rejecterUsername - Username rejecting the request
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async rejectMembership(membershipId, rejecterUsername) {
        try {
            const membership = await this.get(
                'SELECT * FROM organization_memberships WHERE id = ?',
                [membershipId]
            );

            if (!membership) {
                return { success: false, error: 'Membership request not found' };
            }

            const canReject = await this.canManageMembers(membership.organization_id, rejecterUsername);
            if (!canReject) {
                return { success: false, error: 'Not authorized to reject memberships' };
            }

            await this.run('DELETE FROM organization_memberships WHERE id = ?', [membershipId]);

            return { success: true };
        } catch (error) {
            console.error('Error rejecting membership:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Remove a member from organization
     * @param {number} orgId - Organization ID
     * @param {number} userId - User ID to remove
     * @param {string} removerUsername - Username removing the member
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async removeMember(orgId, userId, removerUsername) {
        try {
            const canRemove = await this.canManageMembers(orgId, removerUsername);
            if (!canRemove) {
                return { success: false, error: 'Not authorized to remove members' };
            }

            // Can't remove the owner
            const org = await this.getById(orgId);
            if (org.owner_id === userId) {
                return { success: false, error: 'Cannot remove the organization owner' };
            }

            await this.run(
                'DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?',
                [orgId, userId]
            );

            return { success: true };
        } catch (error) {
            console.error('Error removing member:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Leave an organization
     * @param {number} orgId - Organization ID
     * @param {string} username - Username leaving
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async leave(orgId, username) {
        try {
            const user = await this.get('SELECT id FROM users WHERE username = ?', [username]);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const org = await this.getById(orgId);
            if (org.owner_id === user.id) {
                return { success: false, error: 'Owner cannot leave. Transfer ownership or delete the organization.' };
            }

            await this.run(
                'DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?',
                [orgId, user.id]
            );

            return { success: true };
        } catch (error) {
            console.error('Error leaving organization:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== QUERIES ====================

    /**
     * Get organizations owned by a user
     * @param {string} username - Username
     * @returns {Promise<Array>}
     */
    async getOwnedByUser(username) {
        return this.all(
            `SELECT o.*,
                    (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'approved') as member_count,
                    (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'pending') as pending_count
             FROM organizations o
             JOIN users u ON o.owner_id = u.id
             WHERE u.username = ?
             ORDER BY o.name`,
            [username]
        );
    }

    /**
     * Get organizations user is a member of (including owned)
     * @param {string} username - Username
     * @returns {Promise<Array>}
     */
    async getMembershipsByUser(username) {
        return this.all(
            `SELECT o.*, om.status, om.role,
                    (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id AND status = 'approved') as member_count
             FROM organizations o
             JOIN organization_memberships om ON o.id = om.organization_id
             JOIN users u ON om.user_id = u.id
             WHERE u.username = ?
             ORDER BY om.role = 'owner' DESC, o.name`,
            [username]
        );
    }

    /**
     * Get all members of an organization
     * @param {number} orgId - Organization ID
     * @returns {Promise<Array>}
     */
    async getMembers(orgId) {
        return this.all(
            `SELECT u.id as user_id, u.username, u.unique_id, om.role, om.status, om.approved_at
             FROM organization_memberships om
             JOIN users u ON om.user_id = u.id
             WHERE om.organization_id = ? AND om.status = 'approved'
             ORDER BY om.role = 'owner' DESC, u.username`,
            [orgId]
        );
    }

    /**
     * Get pending membership requests
     * @param {number} orgId - Organization ID
     * @returns {Promise<Array>}
     */
    async getPendingRequests(orgId) {
        return this.all(
            `SELECT om.id, u.id as user_id, u.username, u.unique_id, om.requested_at
             FROM organization_memberships om
             JOIN users u ON om.user_id = u.id
             WHERE om.organization_id = ? AND om.status = 'pending'
             ORDER BY om.requested_at`,
            [orgId]
        );
    }

    /**
     * Get user's membership in an organization
     * @param {number} orgId - Organization ID
     * @param {string} username - Username
     * @returns {Promise<Object|null>}
     */
    async getMembership(orgId, username) {
        return this.get(
            `SELECT om.*, u.id as user_id
             FROM organization_memberships om
             JOIN users u ON om.user_id = u.id
             WHERE om.organization_id = ? AND u.username = ?`,
            [orgId, username]
        );
    }

    // ==================== PERMISSIONS ====================

    /**
     * Check if user can manage members (owner or admin)
     * @param {number} orgId - Organization ID
     * @param {string} username - Username
     * @returns {Promise<boolean>}
     */
    async canManageMembers(orgId, username) {
        const membership = await this.getMembership(orgId, username);
        return membership && ['owner', 'admin'].includes(membership.role) && membership.status === 'approved';
    }

    /**
     * Check if user can create proposals
     * @param {number} orgId - Organization ID
     * @param {string} username - Username
     * @returns {Promise<boolean>}
     */
    async canCreateProposals(orgId, username) {
        const membership = await this.getMembership(orgId, username);
        return membership && ['owner', 'admin'].includes(membership.role) && membership.status === 'approved';
    }

    /**
     * Check if user is a member (approved)
     * @param {number} orgId - Organization ID
     * @param {string} username - Username
     * @returns {Promise<boolean>}
     */
    async isMember(orgId, username) {
        const membership = await this.getMembership(orgId, username);
        return membership && membership.status === 'approved';
    }

    // ==================== UTILITIES ====================

    /**
     * Generate unique 8-character organization code
     * @returns {Promise<string>}
     */
    async generateUniqueCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code;
        let exists = true;

        while (exists) {
            code = '';
            for (let i = 0; i < 8; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            const existing = await this.get('SELECT 1 FROM organizations WHERE unique_code = ?', [code]);
            exists = !!existing;
        }

        return code;
    }
}

export default Organization;
