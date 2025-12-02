/**
 * Organizations API Routes
 * Handles organization creation, membership, and management
 */

import express from 'express';
import userDB from '../../database/db.js';

const router = express.Router();

// ===== Organization CRUD =====

/**
 * Create a new organization
 * POST /api/organizations
 * Body: { name, description, username }
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, username } = req.body;
        
        if (!name || !username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Organization name and username are required' 
            });
        }

        // Get user ID from username
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const org = await userDB.createOrganization(name.trim(), user.id, description?.trim());
        
        res.status(201).json({
            success: true,
            organization: {
                id: org.id,
                name: org.name,
                unique_code: org.unique_code,
                owner_id: org.owner_id,
                description: description || null
            }
        });
    } catch (error) {
        console.error('Error creating organization:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create organization' 
        });
    }
});

/**
 * Search for organizations
 * GET /api/organizations/search?q=searchTerm&username=currentUser
 */
router.get('/search', async (req, res) => {
    try {
        const { q, username } = req.query;
        
        if (!q || q.trim().length < 2) {
            return res.status(400).json({ 
                success: false, 
                error: 'Search term must be at least 2 characters' 
            });
        }

        const organizations = await userDB.searchOrganizations(q.trim());
        
        // If username provided, add membership status to each org
        if (username) {
            const user = await userDB.getUserByUsername(username);
            if (user) {
                for (const org of organizations) {
                    const membership = await userDB.getUserMembershipStatus(user.id, org.id);
                    org.membership_status = membership ? membership.status : null;
                }
            }
        }
        
        res.json({
            success: true,
            organizations
        });
    } catch (error) {
        console.error('Error searching organizations:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to search organizations' 
        });
    }
});

/**
 * Get organization by unique code
 * GET /api/organizations/code/:code
 */
router.get('/code/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        const org = await userDB.getOrganizationByCode(code.toUpperCase());
        
        if (!org) {
            return res.status(404).json({ 
                success: false, 
                error: 'Organization not found' 
            });
        }

        res.json({
            success: true,
            organization: org
        });
    } catch (error) {
        console.error('Error getting organization:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get organization' 
        });
    }
});

/**
 * Get organization by ID
 * GET /api/organizations/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const org = await userDB.getOrganizationById(parseInt(id));
        
        if (!org) {
            return res.status(404).json({ 
                success: false, 
                error: 'Organization not found' 
            });
        }

        res.json({
            success: true,
            organization: org
        });
    } catch (error) {
        console.error('Error getting organization:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get organization' 
        });
    }
});

/**
 * Delete an organization (owner only)
 * DELETE /api/organizations/:id
 * Body: { username } - for owner verification
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username is required for verification' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const result = await userDB.deleteOrganization(parseInt(id), user.id);
        
        res.json({
            success: true,
            message: `Organization "${result.deleted}" has been deleted`
        });
    } catch (error) {
        console.error('Error deleting organization:', error);
        if (error.message.includes('Only the owner')) {
            return res.status(403).json({ success: false, error: error.message });
        }
        if (error.message.includes('not found')) {
            return res.status(404).json({ success: false, error: error.message });
        }
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete organization' 
        });
    }
});

// ===== User's Organizations =====

/**
 * Get all organizations for a user (with membership status)
 * GET /api/organizations/user/:username
 */
router.get('/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const organizations = await userDB.getUserOrganizations(user.id);
        
        res.json({
            success: true,
            organizations
        });
    } catch (error) {
        console.error('Error getting user organizations:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get user organizations' 
        });
    }
});

/**
 * Get organizations owned by a user
 * GET /api/organizations/owned/:username
 */
router.get('/owned/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const organizations = await userDB.getOwnedOrganizations(user.id);
        
        res.json({
            success: true,
            organizations
        });
    } catch (error) {
        console.error('Error getting owned organizations:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get owned organizations' 
        });
    }
});

// ===== Membership Management =====

/**
 * Request to join an organization (by code)
 * POST /api/organizations/join
 * Body: { code, username }
 */
router.post('/join', async (req, res) => {
    try {
        const { code, username } = req.body;
        
        if (!code || !username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Organization code and username are required' 
            });
        }

        // Get user
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Get organization by code
        const org = await userDB.getOrganizationByCode(code.toUpperCase());
        if (!org) {
            return res.status(404).json({ 
                success: false, 
                error: 'Organization not found. Please check the code.' 
            });
        }

        // Check if already a member or has pending request
        const existingMembership = await userDB.getMembershipStatus(org.id, user.id);
        if (existingMembership) {
            if (existingMembership.status === 'approved') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'You are already a member of this organization' 
                });
            } else if (existingMembership.status === 'pending') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'You already have a pending request for this organization' 
                });
            }
        }

        const membership = await userDB.requestToJoinOrganization(org.id, user.id);
        
        res.status(201).json({
            success: true,
            message: 'Join request submitted. Waiting for approval.',
            membership: {
                id: membership.id,
                organization_name: org.name,
                status: membership.status
            }
        });
    } catch (error) {
        console.error('Error requesting to join organization:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to submit join request' 
        });
    }
});

/**
 * Get pending membership requests for an organization (owner/admin only)
 * GET /api/organizations/:id/pending
 */
router.get('/:id/pending', async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.query;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username is required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Check if user is owner or admin
        const isOwnerOrAdmin = await userDB.isOrganizationOwnerOrAdmin(parseInt(id), user.id);
        if (!isOwnerOrAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only organization owners and admins can view pending requests' 
            });
        }

        const pending = await userDB.getPendingMemberships(parseInt(id));
        
        res.json({
            success: true,
            pending_memberships: pending
        });
    } catch (error) {
        console.error('Error getting pending memberships:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get pending memberships' 
        });
    }
});

/**
 * Get all members of an organization
 * GET /api/organizations/:id/members
 */
router.get('/:id/members', async (req, res) => {
    try {
        const { id } = req.params;
        
        const members = await userDB.getOrganizationMembers(parseInt(id));
        
        res.json({
            success: true,
            members
        });
    } catch (error) {
        console.error('Error getting organization members:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get organization members' 
        });
    }
});

/**
 * Approve a membership request (owner/admin only)
 * POST /api/organizations/membership/:membershipId/approve
 * Body: { username }
 */
router.post('/membership/:membershipId/approve', async (req, res) => {
    try {
        const { membershipId } = req.params;
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username is required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Get the membership to find the organization
        const result = await new Promise((resolve, reject) => {
            userDB.db.get(
                'SELECT organization_id FROM organization_memberships WHERE id = ?',
                [membershipId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!result) {
            return res.status(404).json({ 
                success: false, 
                error: 'Membership request not found' 
            });
        }

        // Check if user is owner or admin
        const isOwnerOrAdmin = await userDB.isOrganizationOwnerOrAdmin(result.organization_id, user.id);
        if (!isOwnerOrAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only organization owners and admins can approve requests' 
            });
        }

        const approval = await userDB.approveMembership(parseInt(membershipId), user.id);
        
        if (!approval.updated) {
            return res.status(400).json({ 
                success: false, 
                error: 'Request already processed or not found' 
            });
        }

        res.json({
            success: true,
            message: 'Membership approved'
        });
    } catch (error) {
        console.error('Error approving membership:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to approve membership' 
        });
    }
});

/**
 * Reject a membership request (owner/admin only)
 * POST /api/organizations/membership/:membershipId/reject
 * Body: { username }
 */
router.post('/membership/:membershipId/reject', async (req, res) => {
    try {
        const { membershipId } = req.params;
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username is required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Get the membership to find the organization
        const result = await new Promise((resolve, reject) => {
            userDB.db.get(
                'SELECT organization_id FROM organization_memberships WHERE id = ?',
                [membershipId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!result) {
            return res.status(404).json({ 
                success: false, 
                error: 'Membership request not found' 
            });
        }

        // Check if user is owner or admin
        const isOwnerOrAdmin = await userDB.isOrganizationOwnerOrAdmin(result.organization_id, user.id);
        if (!isOwnerOrAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only organization owners and admins can reject requests' 
            });
        }

        const rejection = await userDB.rejectMembership(parseInt(membershipId), user.id);
        
        if (!rejection.updated) {
            return res.status(400).json({ 
                success: false, 
                error: 'Request already processed or not found' 
            });
        }

        res.json({
            success: true,
            message: 'Membership rejected'
        });
    } catch (error) {
        console.error('Error rejecting membership:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reject membership' 
        });
    }
});

/**
 * Leave an organization
 * POST /api/organizations/:id/leave
 * Body: { username }
 */
router.post('/:id/leave', async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username is required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Check if user is the owner (owners can't leave, must transfer ownership first)
        const membership = await userDB.getMembershipStatus(parseInt(id), user.id);
        if (membership && membership.role === 'owner') {
            return res.status(400).json({ 
                success: false, 
                error: 'Organization owners cannot leave. Transfer ownership first.' 
            });
        }

        const result = await userDB.removeMembership(parseInt(id), user.id);
        
        if (!result.deleted) {
            return res.status(400).json({ 
                success: false, 
                error: 'Not a member of this organization' 
            });
        }

        res.json({
            success: true,
            message: 'Successfully left organization'
        });
    } catch (error) {
        console.error('Error leaving organization:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to leave organization' 
        });
    }
});

/**
 * Check membership status for a user in an organization
 * GET /api/organizations/:id/membership/:username
 */
router.get('/:id/membership/:username', async (req, res) => {
    try {
        const { id, username } = req.params;
        
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const membership = await userDB.getMembershipStatus(parseInt(id), user.id);
        
        res.json({
            success: true,
            is_member: membership?.status === 'approved',
            membership: membership || null
        });
    } catch (error) {
        console.error('Error checking membership:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to check membership' 
        });
    }
});

// ===== Organization Proposals =====

/**
 * Get proposals for an organization
 * GET /api/organizations/:id/proposals
 * Query: filter (all, active, past)
 */
router.get('/:id/proposals', async (req, res) => {
    try {
        const { id } = req.params;
        const { filter = 'all', username } = req.query;
        
        const proposals = await userDB.getOrganizationProposals(parseInt(id), filter);
        
        // If username provided, add voting permission info
        if (username) {
            const user = await userDB.getUserByUsername(username);
            if (user) {
                for (const proposal of proposals) {
                    const canVote = await userDB.canUserVoteOnProposal(user.id, proposal.id);
                    proposal.can_vote = canVote.canVote;
                    proposal.vote_restriction_reason = canVote.reason;
                    proposal.is_restricted = canVote.restricted || false;
                }
            }
        }
        
        res.json({
            success: true,
            proposals
        });
    } catch (error) {
        console.error('Error getting organization proposals:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get proposals' 
        });
    }
});

/**
 * Create a proposal for an organization
 * POST /api/organizations/:id/proposals
 */
router.post('/:id/proposals', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, title, original_text, authorized_by, decision_date, allowed_voters = 'ALL' } = req.body;
        
        if (!username || !title || !original_text || !decision_date) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username, title, original_text, and decision_date are required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Verify user is owner/admin
        const isOwnerOrAdmin = await userDB.isOrganizationOwnerOrAdmin(parseInt(id), user.id);
        if (!isOwnerOrAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only organization owners/admins can create proposals' 
            });
        }

        const result = await userDB.createOrganizationProposal(parseInt(id), user.id, {
            title,
            original_text,
            authorized_by,
            decision_date,
            allowed_voters
        });
        
        res.status(201).json({
            success: true,
            proposal_id: result.id
        });
    } catch (error) {
        console.error('Error creating organization proposal:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create proposal' 
        });
    }
});

/**
 * Update a proposal (owner/admin only)
 * PUT /api/organizations/:orgId/proposals/:proposalId
 */
router.put('/:orgId/proposals/:proposalId', async (req, res) => {
    try {
        const { orgId, proposalId } = req.params;
        const { username, title, original_text, decision_date } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username is required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const result = await userDB.updateProposal(parseInt(proposalId), user.id, {
            title,
            original_text,
            decision_date
        });
        
        res.json({
            success: true,
            message: 'Proposal updated'
        });
    } catch (error) {
        console.error('Error updating proposal:', error);
        if (error.message.includes('Only organization')) {
            return res.status(403).json({ success: false, error: error.message });
        }
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update proposal' 
        });
    }
});

/**
 * Update voting permissions for a proposal (owner/admin only)
 * PUT /api/organizations/:orgId/proposals/:proposalId/permissions
 * Body: { username, allowed_voters } where allowed_voters is 'ALL' or comma-separated user IDs
 */
router.put('/:orgId/proposals/:proposalId/permissions', async (req, res) => {
    try {
        const { orgId, proposalId } = req.params;
        const { username, allowed_voters } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username is required' 
            });
        }

        if (allowed_voters === undefined || allowed_voters === null) {
            return res.status(400).json({ 
                success: false, 
                error: 'allowed_voters is required (use "ALL" for all members or comma-separated user IDs)' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Verify user is owner or admin of the organization
        const isOwnerOrAdmin = await userDB.isOrganizationOwnerOrAdmin(parseInt(orgId), user.id);
        if (!isOwnerOrAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only organization owners/admins can update voting permissions' 
            });
        }

        // Verify the proposal belongs to this organization
        const proposal = await userDB.getProposalById(parseInt(proposalId));
        if (!proposal) {
            return res.status(404).json({ 
                success: false, 
                error: 'Proposal not found' 
            });
        }

        if (proposal.organization_id !== parseInt(orgId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Proposal does not belong to this organization' 
            });
        }

        // Update the allowed_voters field
        const result = await userDB.updateProposalVotingPermissions(parseInt(proposalId), allowed_voters);
        
        res.json({
            success: true,
            message: 'Voting permissions updated',
            allowed_voters: result.allowed_voters
        });
    } catch (error) {
        console.error('Error updating voting permissions:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to update voting permissions' 
        });
    }
});

// ===== Petitions =====

/**
 * Get petitions for an organization
 * GET /api/organizations/:id/petitions
 */
router.get('/:id/petitions', async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.query;
        
        if (username) {
            const user = await userDB.getUserByUsername(username);
            if (user) {
                // Verify user is owner/admin
                const isOwnerOrAdmin = await userDB.isOrganizationOwnerOrAdmin(parseInt(id), user.id);
                if (!isOwnerOrAdmin) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'Only organization owners/admins can view petitions' 
                    });
                }
            }
        }
        
        const petitions = await userDB.getOrganizationPetitions(parseInt(id));
        
        res.json({
            success: true,
            petitions
        });
    } catch (error) {
        console.error('Error getting organization petitions:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get petitions' 
        });
    }
});

/**
 * Kick a member from organization
 * POST /api/organizations/:id/kick
 */
router.post('/:id/kick', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, memberUserId } = req.body;
        
        if (!username || !memberUserId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username and memberUserId are required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const result = await userDB.kickMember(parseInt(id), parseInt(memberUserId), user.id);
        
        res.json({
            success: true,
            message: 'Member removed from organization'
        });
    } catch (error) {
        console.error('Error kicking member:', error);
        if (error.message.includes('Only organization') || error.message.includes('Cannot kick')) {
            return res.status(403).json({ success: false, error: error.message });
        }
        res.status(500).json({ 
            success: false, 
            error: 'Failed to kick member' 
        });
    }
});

export default router;
