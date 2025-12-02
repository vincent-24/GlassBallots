/**
 * Proposal Model
 * Handles proposal CRUD, voting, and petitions
 */

import BaseModel from './BaseModel.js';

class Proposal extends BaseModel {
    constructor(db) {
        super(db);
    }

    // ==================== PROPOSAL CRUD ====================

    /**
     * Create a new proposal
     * @param {Object} data - Proposal data
     * @returns {Promise<{success: boolean, proposal?: Object, error?: string}>}
     */
    async create({
        title,
        originalText,
        authorizedBy,
        decisionDate,
        creatorUsername,
        organizationId = null,
        allowedVoters = 'ALL'
    }) {
        try {
            const creator = await this.get('SELECT id FROM users WHERE username = ?', [creatorUsername]);
            if (!creator) {
                return { success: false, error: 'Creator not found' };
            }

            const result = await this.run(
                `INSERT INTO proposals (title, original_text, authorized_by, decision_date, creator_id, organization_id, allowed_voters, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [title, originalText, authorizedBy, decisionDate, creator.id, organizationId, 
                 Array.isArray(allowedVoters) ? JSON.stringify(allowedVoters) : allowedVoters]
            );

            const proposal = await this.getById(result.lastID);
            return { success: true, proposal };
        } catch (error) {
            console.error('Error creating proposal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get proposal by ID
     * @param {number} id - Proposal ID
     * @param {string} username - Optional username for user-specific data
     * @returns {Promise<Object|null>}
     */
    async getById(id, username = null) {
        let sql = `
            SELECT p.*, 
                   u.username as creator_username,
                   o.name as organization_name,
                   o.unique_code as organization_code,
                   (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id) as total_votes,
                   (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote = 1) as yes_votes,
                   (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote = 0) as no_votes
        `;

        if (username) {
            sql += `,
                   (SELECT vote FROM votes v JOIN users vu ON v.user_id = vu.id 
                    WHERE v.proposal_id = p.id AND vu.username = ?) as user_vote,
                   (SELECT 1 FROM votes v JOIN users vu ON v.user_id = vu.id 
                    WHERE v.proposal_id = p.id AND vu.username = ?) as has_voted,
                   (SELECT 1 FROM bookmarks b JOIN users bu ON b.user_id = bu.id 
                    WHERE b.proposal_id = p.id AND bu.username = ?) as is_bookmarked`;
        }

        sql += `
             FROM proposals p
             LEFT JOIN users u ON p.creator_id = u.id
             LEFT JOIN organizations o ON p.organization_id = o.id
             WHERE p.id = ?`;

        const params = username ? [username, username, username, id] : [id];
        const proposal = await this.get(sql, params);

        if (proposal && username) {
            proposal.has_voted = !!proposal.has_voted;
            proposal.is_bookmarked = !!proposal.is_bookmarked;
            proposal.can_vote = await this.canVote(id, username);
        }

        return proposal;
    }

    /**
     * Get all proposals with optional filtering
     * @param {Object} options - { filter: 'active'|'past'|'all', organizationId?, username? }
     * @returns {Promise<Array>}
     */
    async getAll({ filter = 'all', organizationId = null, username = null } = {}) {
        let sql = `
            SELECT p.*, 
                   u.username as creator_username,
                   o.name as organization_name,
                   (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id) as total_votes,
                   (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote = 1) as yes_votes,
                   (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote = 0) as no_votes
        `;

        if (username) {
            sql += `,
                   (SELECT vote FROM votes v JOIN users vu ON v.user_id = vu.id 
                    WHERE v.proposal_id = p.id AND vu.username = ?) as user_vote,
                   (SELECT 1 FROM votes v JOIN users vu ON v.user_id = vu.id 
                    WHERE v.proposal_id = p.id AND vu.username = ?) as has_voted`;
        }

        sql += `
             FROM proposals p
             LEFT JOIN users u ON p.creator_id = u.id
             LEFT JOIN organizations o ON p.organization_id = o.id
             WHERE 1=1`;

        const params = username ? [username, username] : [];

        if (organizationId) {
            sql += ' AND p.organization_id = ?';
            params.push(organizationId);
        } else {
            // Only show public proposals (no organization) in main list
            sql += ' AND p.organization_id IS NULL';
        }

        const today = new Date().toISOString().split('T')[0];
        if (filter === 'active') {
            sql += ' AND (p.decision_date >= ? OR p.decision_date IS NULL)';
            params.push(today);
        } else if (filter === 'past') {
            sql += ' AND p.decision_date < ?';
            params.push(today);
        }

        sql += ' ORDER BY p.decision_date ASC, p.created_at DESC';

        const proposals = await this.all(sql, params);

        // Add vote status for past proposals
        if (filter === 'past') {
            proposals.forEach(p => {
                const total = p.yes_votes + p.no_votes;
                if (total > 0) {
                    // Has votes: approved if more yes, denied if more no, recast if tied
                    p.vote_status = p.yes_votes > p.no_votes ? 'approved' : 
                                    p.yes_votes < p.no_votes ? 'denied' : 'recast';
                } else {
                    // Zero votes on a past proposal = needs recast
                    p.vote_status = 'recast';
                }
            });
        }

        return proposals;
    }

    /**
     * Update a proposal
     * @param {number} id - Proposal ID
     * @param {Object} data - Fields to update
     * @param {string} username - Username making the update (for permission check)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async update(id, data, username) {
        try {
            const proposal = await this.getById(id);
            if (!proposal) {
                return { success: false, error: 'Proposal not found' };
            }

            // Check permission
            const canEdit = await this.canEdit(id, username);
            if (!canEdit) {
                return { success: false, error: 'Not authorized to edit this proposal' };
            }

            const allowedFields = ['title', 'original_text', 'authorized_by', 'decision_date', 'allowed_voters'];
            const updates = [];
            const params = [];

            for (const [key, value] of Object.entries(data)) {
                const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
                if (allowedFields.includes(dbKey)) {
                    updates.push(`${dbKey} = ?`);
                    params.push(key === 'allowedVoters' && Array.isArray(value) ? JSON.stringify(value) : value);
                }
            }

            if (updates.length === 0) {
                return { success: false, error: 'No valid fields to update' };
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id);

            await this.run(`UPDATE proposals SET ${updates.join(', ')} WHERE id = ?`, params);

            return { success: true };
        } catch (error) {
            console.error('Error updating proposal:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a proposal
     * @param {number} id - Proposal ID
     * @param {string} username - Username making the deletion
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async delete(id, username) {
        try {
            const canEdit = await this.canEdit(id, username);
            if (!canEdit) {
                return { success: false, error: 'Not authorized to delete this proposal' };
            }

            await this.run('DELETE FROM votes WHERE proposal_id = ?', [id]);
            await this.run('DELETE FROM petitions WHERE proposal_id = ?', [id]);
            await this.run('DELETE FROM bookmarks WHERE proposal_id = ?', [id]);
            await this.run('DELETE FROM proposals WHERE id = ?', [id]);

            return { success: true };
        } catch (error) {
            console.error('Error deleting proposal:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== VOTING ====================

    /**
     * Cast a vote on a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     * @param {boolean} vote - true = yes, false = no
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async vote(proposalId, username, vote) {
        try {
            const user = await this.get('SELECT id FROM users WHERE username = ?', [username]);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const proposal = await this.getById(proposalId);
            if (!proposal) {
                return { success: false, error: 'Proposal not found' };
            }

            // Check if user can vote
            const canVote = await this.canVote(proposalId, username);
            if (!canVote) {
                return { success: false, error: 'You are not allowed to vote on this proposal' };
            }

            // Check if already voted
            const existingVote = await this.get(
                'SELECT id FROM votes WHERE proposal_id = ? AND user_id = ?',
                [proposalId, user.id]
            );

            if (existingVote) {
                return { success: false, error: 'Already voted on this proposal' };
            }

            // Check if proposal is still active
            if (proposal.decision_date) {
                const today = new Date().toISOString().split('T')[0];
                if (proposal.decision_date < today) {
                    return { success: false, error: 'Voting period has ended' };
                }
            }

            await this.run(
                'INSERT INTO votes (proposal_id, user_id, vote) VALUES (?, ?, ?)',
                [proposalId, user.id, vote ? 1 : 0]
            );

            return { success: true };
        } catch (error) {
            console.error('Error voting:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if user can vote on a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     * @returns {Promise<boolean>}
     */
    async canVote(proposalId, username) {
        const proposal = await this.get('SELECT allowed_voters, organization_id FROM proposals WHERE id = ?', [proposalId]);
        if (!proposal) return false;

        // If not restricted, anyone can vote
        if (!proposal.allowed_voters || proposal.allowed_voters === 'ALL') {
            return true;
        }

        // Parse allowed voters
        let allowedVoters;
        try {
            allowedVoters = JSON.parse(proposal.allowed_voters);
        } catch {
            return true; // If parsing fails, allow voting
        }

        // Get user ID
        const user = await this.get('SELECT id FROM users WHERE username = ?', [username]);
        if (!user) return false;

        return allowedVoters.includes(user.id);
    }

    /**
     * Get vote counts for a proposal
     * @param {number} proposalId - Proposal ID
     * @returns {Promise<{total: number, yes: number, no: number}>}
     */
    async getVoteCounts(proposalId) {
        const counts = await this.get(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) as yes,
                SUM(CASE WHEN vote = 0 THEN 1 ELSE 0 END) as no
             FROM votes WHERE proposal_id = ?`,
            [proposalId]
        );

        return {
            total: counts?.total || 0,
            yes: counts?.yes || 0,
            no: counts?.no || 0
        };
    }

    // ==================== PETITIONS ====================

    /**
     * Submit a petition for a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     * @param {string} text - Petition text
     * @returns {Promise<{success: boolean, petition?: Object, error?: string}>}
     */
    async submitPetition(proposalId, username, text) {
        try {
            const user = await this.get('SELECT id FROM users WHERE username = ?', [username]);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const proposal = await this.getById(proposalId);
            if (!proposal) {
                return { success: false, error: 'Proposal not found' };
            }

            // Check for existing petition
            const existing = await this.get(
                'SELECT id FROM petitions WHERE proposal_id = ? AND user_id = ?',
                [proposalId, user.id]
            );

            if (existing) {
                // Update existing petition
                await this.run(
                    'UPDATE petitions SET petition_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [text, existing.id]
                );
                return { success: true, updated: true };
            }

            const result = await this.run(
                'INSERT INTO petitions (proposal_id, user_id, petition_text) VALUES (?, ?, ?)',
                [proposalId, user.id, text]
            );

            return { success: true, petitionId: result.lastID };
        } catch (error) {
            console.error('Error submitting petition:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get petition by user and proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     * @returns {Promise<Object|null>}
     */
    async getPetition(proposalId, username) {
        return this.get(
            `SELECT pt.*, u.username
             FROM petitions pt
             JOIN users u ON pt.user_id = u.id
             WHERE pt.proposal_id = ? AND u.username = ?`,
            [proposalId, username]
        );
    }

    /**
     * Get all petitions for a proposal
     * @param {number} proposalId - Proposal ID
     * @returns {Promise<Array>}
     */
    async getPetitions(proposalId) {
        return this.all(
            `SELECT pt.*, u.username, u.unique_id
             FROM petitions pt
             JOIN users u ON pt.user_id = u.id
             WHERE pt.proposal_id = ?
             ORDER BY pt.created_at DESC`,
            [proposalId]
        );
    }

    /**
     * Get petitions for an organization's proposals
     * @param {number} organizationId - Organization ID
     * @returns {Promise<Array>}
     */
    async getOrganizationPetitions(organizationId) {
        return this.all(
            `SELECT pt.*, u.username, u.unique_id, p.title as proposal_title, p.id as proposal_id
             FROM petitions pt
             JOIN users u ON pt.user_id = u.id
             JOIN proposals p ON pt.proposal_id = p.id
             WHERE p.organization_id = ?
             ORDER BY pt.created_at DESC`,
            [organizationId]
        );
    }

    // ==================== ORGANIZATION PROPOSALS ====================

    /**
     * Get proposals for an organization
     * @param {number} organizationId - Organization ID
     * @param {Object} options - { filter: 'active'|'past', username? }
     * @returns {Promise<Array>}
     */
    async getByOrganization(organizationId, { filter = 'active', username = null } = {}) {
        let sql = `
            SELECT p.*,
                   (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id) as total_votes
        `;

        if (username) {
            sql += `,
                   (SELECT vote FROM votes v JOIN users vu ON v.user_id = vu.id 
                    WHERE v.proposal_id = p.id AND vu.username = ?) as user_vote,
                   (SELECT 1 FROM votes v JOIN users vu ON v.user_id = vu.id 
                    WHERE v.proposal_id = p.id AND vu.username = ?) as has_voted`;
        }

        sql += ' FROM proposals p WHERE p.organization_id = ?';

        const params = username ? [username, username, organizationId] : [organizationId];

        const today = new Date().toISOString().split('T')[0];
        if (filter === 'active') {
            sql += ' AND (p.decision_date >= ? OR p.decision_date IS NULL)';
            params.push(today);
        } else if (filter === 'past') {
            sql += ' AND p.decision_date < ?';
            params.push(today);
        }

        sql += ' ORDER BY p.decision_date ASC, p.created_at DESC';

        const proposals = await this.all(sql, params);

        // Process vote permissions
        if (username) {
            for (const p of proposals) {
                p.has_voted = !!p.has_voted;
                p.can_vote = await this.canVote(p.id, username);
                p.is_restricted = p.allowed_voters && p.allowed_voters !== 'ALL';
            }
        }

        return proposals;
    }

    // ==================== PERMISSIONS ====================

    /**
     * Check if user can edit a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     * @returns {Promise<boolean>}
     */
    async canEdit(proposalId, username) {
        const proposal = await this.get(
            `SELECT p.creator_id, p.organization_id, o.owner_id
             FROM proposals p
             LEFT JOIN organizations o ON p.organization_id = o.id
             WHERE p.id = ?`,
            [proposalId]
        );

        if (!proposal) return false;

        const user = await this.get('SELECT id FROM users WHERE username = ?', [username]);
        if (!user) return false;

        // Creator can edit
        if (proposal.creator_id === user.id) return true;

        // Organization owner/admin can edit
        if (proposal.organization_id) {
            const membership = await this.get(
                `SELECT role FROM organization_memberships 
                 WHERE organization_id = ? AND user_id = ? AND status = 'approved'`,
                [proposal.organization_id, user.id]
            );

            return membership && ['owner', 'admin'].includes(membership.role);
        }

        return false;
    }

    /**
     * Update voting permissions for a proposal
     * @param {number} proposalId - Proposal ID
     * @param {Array|string} allowedVoters - Array of user IDs or 'ALL'
     * @param {string} username - Username making the update
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updateVotingPermissions(proposalId, allowedVoters, username) {
        try {
            const canEdit = await this.canEdit(proposalId, username);
            if (!canEdit) {
                return { success: false, error: 'Not authorized to update voting permissions' };
            }

            const value = Array.isArray(allowedVoters) ? JSON.stringify(allowedVoters) : allowedVoters;

            await this.run(
                'UPDATE proposals SET allowed_voters = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [value, proposalId]
            );

            return { success: true };
        } catch (error) {
            console.error('Error updating voting permissions:', error);
            return { success: false, error: error.message };
        }
    }
}

export default Proposal;
