/**
 * GlassBallots API Service
 * Centralized API client for all frontend API calls
 * 
 * Usage:
 *   import api from './services/api.js';
 *   
 *   // Proposals
 *   const proposals = await api.proposals.getAll();
 *   await api.proposals.vote(id, true);
 *   
 *   // Organizations
 *   await api.organizations.join('CODE123');
 *   const members = await api.organizations.getMembers(orgId);
 *   
 *   // User
 *   const profile = await api.user.getProfile(username);
 */

const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3001/api';

/**
 * Base API client with error handling
 */
class ApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    /**
     * Make an API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<any>}
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // Add auth token if available
        const token = sessionStorage.getItem('authToken');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new ApiError(
                    data.error || data.message || 'An error occurred',
                    response.status,
                    data
                );
            }

            return data;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            
            // Network or parsing error
            throw new ApiError(
                error.message || 'Network error',
                0,
                null
            );
        }
    }

    get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    post(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    put(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    delete(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'DELETE',
            body: Object.keys(body).length ? JSON.stringify(body) : undefined
        });
    }
}

/**
 * Custom API Error class
 */
class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }

    get isNotFound() {
        return this.status === 404;
    }

    get isUnauthorized() {
        return this.status === 401;
    }

    get isForbidden() {
        return this.status === 403;
    }

    get isValidationError() {
        return this.status === 400;
    }

    get isServerError() {
        return this.status >= 500;
    }
}

// Create client instance
const client = new ApiClient(API_BASE_URL);

/**
 * Proposals API
 */
const proposals = {
    /**
     * Get all proposals
     * @param {Object} params - { status?: 'pending'|'active'|'closed', limit?, offset? }
     */
    getAll(params = {}) {
        return client.get('/proposals', params);
    },

    /**
     * Get a single proposal by ID
     * @param {number} id - Proposal ID
     */
    getById(id) {
        return client.get(`/proposals/${id}`);
    },

    /**
     * Create a new proposal
     * @param {Object} data - { title, original_text, creator, authorized_by, decision_date, start_at?, end_at? }
     */
    create(data) {
        return client.post('/proposals/create', data);
    },

    /**
     * Update proposal status
     * @param {number} id - Proposal ID
     * @param {string} status - 'pending'|'active'|'closed'|'archived'
     */
    updateStatus(id, status) {
        return client.put(`/proposals/${id}/status`, { status });
    },

    /**
     * Vote on a proposal
     * @param {number} proposalId - Proposal ID
     * @param {boolean} vote - true = yes, false = no
     * @param {string} username - Voter username
     */
    vote(proposalId, vote, username) {
        return client.post('/votes', { proposalId, vote, username });
    },

    /**
     * Get vote counts for a proposal
     * @param {number} proposalId - Proposal ID
     */
    getVotes(proposalId) {
        return client.get(`/votes/proposal/${proposalId}`);
    },

    /**
     * Submit a petition
     * @param {number} proposalId - Proposal ID
     * @param {string} text - Petition text
     * @param {string} username - Username
     */
    submitPetition(proposalId, text, username) {
        return client.post(`/proposals/${proposalId}/petition`, { petition_text: text, username });
    },

    /**
     * Update a petition
     * @param {number} proposalId - Proposal ID
     * @param {number} petitionId - Petition ID
     * @param {string} text - Updated petition text
     * @param {string} username - Username
     */
    updatePetition(proposalId, petitionId, text, username) {
        return client.put(`/proposals/${proposalId}/petition`, { petition_id: petitionId, petition_text: text, username });
    },

    /**
     * Get user's petition for a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    getMyPetition(proposalId, username) {
        return client.get(`/proposals/${proposalId}/my-petition`, { username });
    },

    /**
     * Get all petitions for a proposal
     * @param {number} proposalId - Proposal ID
     */
    getAllPetitions(proposalId) {
        return client.get(`/proposals/${proposalId}/petitions`);
    },

    /**
     * Analyze proposal with AI
     * @param {number} proposalId - Proposal ID
     */
    analyze(proposalId) {
        return client.post(`/proposals/${proposalId}/analyze`);
    },

    /**
     * Analyze raw text with AI
     * @param {string} text - Text to analyze
     */
    analyzeText(text) {
        return client.post('/proposals/analyze', { text });
    },

    /**
     * Check if analysis is cached
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    isAnalysisCached(proposalId, username) {
        return client.get(`/proposals/${proposalId}/analysis-cached`, { username });
    }
};

/**
 * Organizations API
 */
const organizations = {
    /**
     * Search organizations
     * @param {string} query - Search query
     * @param {string} username - Optional username for membership status
     */
    search(query, username = null) {
        const params = { q: query };
        if (username) params.username = username;
        return client.get('/organizations/search', params);
    },

    /**
     * Get organization by ID
     * @param {number} id - Organization ID
     */
    getById(id) {
        return client.get(`/organizations/${id}`);
    },

    /**
     * Get organization by code
     * @param {string} code - Organization unique code
     */
    getByCode(code) {
        return client.get(`/organizations/code/${code}`);
    },

    /**
     * Create a new organization
     * @param {Object} data - { name, description, username }
     */
    create(data) {
        return client.post('/organizations', data);
    },

    /**
     * Delete an organization
     * @param {number} id - Organization ID
     * @param {string} username - Username (must be owner)
     */
    delete(id, username) {
        return client.delete(`/organizations/${id}`, { username });
    },

    /**
     * Join an organization by code
     * @param {string} code - Organization unique code
     * @param {string} username - Username requesting to join
     */
    join(code, username) {
        return client.post('/organizations/join', { code, username });
    },

    /**
     * Leave an organization
     * @param {number} orgId - Organization ID
     * @param {string} username - Username leaving
     */
    leave(orgId, username) {
        return client.post(`/organizations/${orgId}/leave`, { username });
    },

    /**
     * Get user's organizations (member of)
     * @param {string} username - Username
     */
    getForUser(username) {
        return client.get(`/organizations/user/${username}`);
    },

    /**
     * Get organizations owned by user
     * @param {string} username - Username
     */
    getOwned(username) {
        return client.get(`/organizations/owned/${username}`);
    },

    /**
     * Get user's membership status in an organization
     * @param {number} orgId - Organization ID
     * @param {string} username - Username
     */
    getMembership(orgId, username) {
        return client.get(`/organizations/${orgId}/membership/${username}`);
    },

    /**
     * Get all members of an organization
     * @param {number} orgId - Organization ID
     */
    getMembers(orgId) {
        return client.get(`/organizations/${orgId}/members`);
    },

    /**
     * Get pending membership requests
     * @param {number} orgId - Organization ID
     * @param {string} username - Username (must be admin/owner)
     */
    getPendingRequests(orgId, username) {
        return client.get(`/organizations/${orgId}/pending`, { username });
    },

    /**
     * Approve a membership request
     * @param {number} membershipId - Membership ID
     * @param {string} username - Approver username
     */
    approveMembership(membershipId, username) {
        return client.post(`/organizations/membership/${membershipId}/approve`, { username });
    },

    /**
     * Reject a membership request
     * @param {number} membershipId - Membership ID
     * @param {string} username - Rejecter username
     */
    rejectMembership(membershipId, username) {
        return client.post(`/organizations/membership/${membershipId}/reject`, { username });
    },

    /**
     * Remove a member from organization (kick)
     * @param {number} orgId - Organization ID
     * @param {number} userId - User ID to remove
     * @param {string} username - Username making the request
     */
    removeMember(orgId, userId, username) {
        return client.post(`/organizations/${orgId}/kick`, { memberUserId: userId, username });
    },

    /**
     * Get proposals for an organization
     * @param {number} orgId - Organization ID
     * @param {Object} params - { filter?: 'all'|'active'|'past', username? }
     */
    getProposals(orgId, params = {}) {
        return client.get(`/organizations/${orgId}/proposals`, params);
    },

    /**
     * Create a proposal for an organization
     * @param {number} orgId - Organization ID
     * @param {Object} data - { username, title, original_text, authorized_by?, decision_date, allowed_voters? }
     */
    createProposal(orgId, data) {
        return client.post(`/organizations/${orgId}/proposals`, data);
    },

    /**
     * Update a proposal for an organization
     * @param {number} orgId - Organization ID
     * @param {number} proposalId - Proposal ID
     * @param {Object} data - Fields to update
     */
    updateProposal(orgId, proposalId, data) {
        return client.put(`/organizations/${orgId}/proposals/${proposalId}`, data);
    },

    /**
     * Update voting permissions for a proposal
     * @param {number} orgId - Organization ID
     * @param {number} proposalId - Proposal ID
     * @param {string} allowedVoters - 'ALL' or comma-separated user IDs
     * @param {string} username - Username making the request
     */
    updateProposalPermissions(orgId, proposalId, allowedVoters, username) {
        return client.put(`/organizations/${orgId}/proposals/${proposalId}/permissions`, {
            allowed_voters: allowedVoters,
            username
        });
    },

    /**
     * Get petitions for an organization's proposals
     * @param {number} orgId - Organization ID
     * @param {string} username - Username
     */
    getPetitions(orgId, username) {
        return client.get(`/organizations/${orgId}/petitions`, { username });
    }
};

/**
 * User API
 */
const user = {
    /**
     * Register a new user (signup)
     * @param {Object} data - { email, username, password }
     */
    register(data) {
        return client.post('/users/signup', data);
    },

    /**
     * Login
     * @param {string} identifier - Username or email
     * @param {string} password - Password
     */
    login(identifier, password) {
        return client.post('/users/login', { identifier, password });
    },

    /**
     * Get user profile
     * @param {string} username - Username
     */
    getProfile(username) {
        return client.get(`/users/profile/by-username/${username}`);
    },

    /**
     * Update username
     * @param {string} currentUsername - Current username
     * @param {string} newUsername - New username
     */
    updateUsername(currentUsername, newUsername) {
        return client.put(`/users/profile/${currentUsername}/username`, { newUsername });
    },

    /**
     * Update password
     * @param {string} username - Username
     * @param {string} oldPassword - Current password
     * @param {string} newPassword - New password
     */
    updatePassword(username, oldPassword, newPassword) {
        return client.put(`/users/profile/${username}/password`, { oldPassword, newPassword });
    },

    /**
     * Get user's voted proposals
     * @param {string} username - Username
     */
    getVotedProposals(username) {
        return client.get(`/users/by-username/${username}/voted`);
    },

    /**
     * Get user's bookmarked proposals
     * @param {string} username - Username
     */
    getBookmarkedProposals(username) {
        return client.get(`/users/by-username/${username}/bookmarked`);
    },

    /**
     * Get user's petitioned proposals
     * @param {string} username - Username
     */
    getPetitionedProposals(username) {
        return client.get(`/users/by-username/${username}/petitioned`);
    },

    /**
     * Toggle bookmark for a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    toggleBookmark(proposalId, username) {
        return client.post(`/users/by-username/${username}/bookmarks/${proposalId}/toggle`);
    },

    /**
     * Add bookmark
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    addBookmark(proposalId, username) {
        return client.post(`/users/by-username/${username}/bookmarks/${proposalId}`);
    },

    /**
     * Remove bookmark
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    removeBookmark(proposalId, username) {
        return client.delete(`/users/by-username/${username}/bookmarks/${proposalId}`);
    },

    /**
     * Check if proposal is bookmarked
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    isBookmarked(proposalId, username) {
        return client.get(`/users/by-username/${username}/bookmarks/${proposalId}`);
    },

    /**
     * Get user's organizations
     * @param {string} username - Username
     */
    getOrganizations(username) {
        return client.get(`/users/by-username/${username}/organizations`);
    },

    /**
     * Validate session
     * @param {string} token - Session token
     */
    validateSession(token) {
        return client.request('/users/session/validate', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }
};

/**
 * Analysis API
 */
const analysis = {
    /**
     * Get full analysis for a proposal
     * @param {number} proposalId - Proposal ID
     */
    getFull(proposalId) {
        return client.get(`/analysis/proposal/${proposalId}`);
    },

    /**
     * Get summary for a proposal
     * @param {number} proposalId - Proposal ID
     */
    getSummary(proposalId) {
        return client.get(`/analysis/proposal/${proposalId}/summary`);
    },

    /**
     * Get pros and cons for a proposal
     * @param {number} proposalId - Proposal ID
     */
    getProsCons(proposalId) {
        return client.get(`/analysis/proposal/${proposalId}/pros-cons`);
    },

    /**
     * Get stakeholder analysis
     * @param {number} proposalId - Proposal ID
     */
    getStakeholders(proposalId) {
        return client.get(`/analysis/proposal/${proposalId}/stakeholders`);
    }
};

/**
 * Feedback API
 */
const feedback = {
    /**
     * Submit feedback for a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} text - Feedback text
     * @param {string} category - Feedback category
     * @param {string} username - Username
     */
    submit(proposalId, text, category, username) {
        return client.post('/feedback', { proposalId, text, category, username });
    },

    /**
     * Get feedback for a proposal
     * @param {number} proposalId - Proposal ID
     */
    getForProposal(proposalId) {
        return client.get(`/feedback/proposal/${proposalId}`);
    }
};

/**
 * Votes API
 */
const votes = {
    /**
     * Submit a vote on a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     * @param {string} vote - 'approve' or 'deny'
     */
    submit(proposalId, username, vote) {
        return client.post('/votes/submit', { proposal_id: proposalId, username, vote });
    },

    /**
     * Cast a blockchain-verified vote
     * @param {Object} data - { transactionHash, proposalId, voteValue, walletAddress, userId? }
     */
    cast(data) {
        return client.post('/votes/cast', data);
    },

    /**
     * Get voting results for a proposal
     * @param {number} proposalId - Proposal ID
     */
    getResults(proposalId) {
        return client.get(`/votes/${proposalId}/results`);
    },

    /**
     * Check if user has voted on a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    getUserVote(proposalId, username) {
        return client.get(`/votes/${proposalId}/user/${username}`);
    },

    /**
     * Check if user can vote on a proposal
     * @param {number} proposalId - Proposal ID
     * @param {string} username - Username
     */
    canVote(proposalId, username) {
        return client.get(`/votes/${proposalId}/can-vote/${username}`);
    }
};

// Export the API object
const api = {
    proposals,
    organizations,
    user,
    analysis,
    feedback,
    votes,
    // Utilities
    ApiError,
    client
};

// Make available globally for non-module scripts
if (typeof window !== 'undefined') {
    window.api = api;
}

export default api;
export { proposals, organizations, user, analysis, feedback, votes, ApiError };
