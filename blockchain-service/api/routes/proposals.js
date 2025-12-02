/**
 * Proposals Routes
 * 
 * Handles all proposal-related operations:
 * - List proposals
 * - Get proposal details
 * - Create new proposals
 * - Analyze proposals with AI
 * - Update proposal status
 * - Petitions
 */

import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import userDB from '../../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const router = express.Router();

// Database connection - use absolute path from environment
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database/glassballots.db');
console.log('Proposals router using database:', DB_PATH);
const db = new sqlite3.Database(DB_PATH);

// AI Service configuration
const AI_SERVICE_URL = `http://localhost:${process.env.AI_SERVICE_PORT || 5000}`;

/**
 * GET /api/proposals
 * List all proposals with optional filtering and vote tallies
 */
router.get('/', async (req, res) => {
    try {
        const { status, limit = 100, offset = 0 } = req.query;
        
        let query = `
            SELECT 
                p.*,
                COALESCE(vt.yes_count, 0) as yes_count,
                COALESCE(vt.no_count, 0) as no_count,
                COALESCE(vt.total_votes, 0) as total_votes
            FROM proposals p
            LEFT JOIN vote_tallies vt ON p.id = vt.proposal_id
        `;
        const params = [];
        
        if (status) {
            query += ' WHERE p.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        db.all(query, params, (err, proposals) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Calculate vote status for each proposal
            proposals = proposals.map(p => {
                let voteStatus = 'pending';
                const decisionDate = p.decision_date ? new Date(p.decision_date) : null;
                if (decisionDate) decisionDate.setHours(0, 0, 0, 0);
                const isPast = decisionDate && decisionDate < today;
                
                if (p.total_votes > 0) {
                    if (p.yes_count > p.no_count) {
                        voteStatus = 'approved';
                    } else if (p.no_count > p.yes_count) {
                        voteStatus = 'denied';
                    } else {
                        voteStatus = 'recast'; // Tie
                    }
                } else if (isPast) {
                    // Zero votes on a past proposal = needs recast
                    voteStatus = 'recast';
                }
                return {
                    ...p,
                    vote_status: voteStatus
                };
            });
            
            res.json({
                success: true,
                proposals,
                count: proposals.length
            });
        });
    } catch (error) {
        console.error('Error fetching proposals:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/proposals/user/:username
 * List proposals from organizations the user is a member/owner of
 * Supports pagination with limit and offset
 * Supports search query that searches across ALL user's proposals (not just loaded)
 * Supports filtering by organization_id
 */
router.get('/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const { 
            limit = 10, 
            offset = 0, 
            search = '', 
            organization_id = null,
            filter = 'all' // 'all', 'upcoming', 'past'
        } = req.query;
        
        // Get user
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Get user's organizations (approved memberships + owned)
        const userOrgs = await userDB.getUserOrganizations(user.id);
        
        if (!userOrgs || userOrgs.length === 0) {
            return res.json({
                success: true,
                proposals: [],
                total: 0,
                hasMore: false,
                userOrganizations: []
            });
        }
        
        const orgIds = userOrgs.map(org => org.id);
        const placeholders = orgIds.map(() => '?').join(',');
        
        // Build the query with filters
        let whereConditions = [`p.organization_id IN (${placeholders})`];
        let params = [...orgIds];
        
        // Filter by specific organization if provided
        if (organization_id && organization_id !== 'all') {
            whereConditions = ['p.organization_id = ?'];
            params = [parseInt(organization_id)];
        }
        
        // Filter by date (upcoming vs past)
        const today = new Date().toISOString().split('T')[0];
        if (filter === 'upcoming') {
            whereConditions.push(`(p.decision_date >= ? OR p.decision_date IS NULL)`);
            params.push(today);
        } else if (filter === 'past') {
            whereConditions.push(`p.decision_date < ?`);
            params.push(today);
        }
        
        // Search filter - searches title, creator, authorized_by
        if (search && search.trim()) {
            const searchTerm = `%${search.trim().toLowerCase()}%`;
            whereConditions.push(`(LOWER(p.title) LIKE ? OR LOWER(p.creator) LIKE ? OR LOWER(p.authorized_by) LIKE ?)`);
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM proposals p
            WHERE ${whereClause}
        `;
        
        const countResult = await new Promise((resolve, reject) => {
            db.get(countQuery, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        const total = countResult ? countResult.total : 0;
        
        // Get proposals with pagination
        const query = `
            SELECT 
                p.*,
                o.name as organization_name,
                COALESCE(vt.yes_count, 0) as yes_count,
                COALESCE(vt.no_count, 0) as no_count,
                COALESCE(vt.total_votes, 0) as total_votes
            FROM proposals p
            LEFT JOIN organizations o ON p.organization_id = o.id
            LEFT JOIN vote_tallies vt ON p.id = vt.proposal_id
            WHERE ${whereClause}
            ORDER BY p.decision_date ASC, p.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        params.push(parseInt(limit), parseInt(offset));
        
        const proposals = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        
        // Calculate vote status for each proposal
        const processedProposals = proposals.map(p => {
            let voteStatus = 'pending';
            const decisionDate = p.decision_date ? new Date(p.decision_date) : null;
            if (decisionDate) decisionDate.setHours(0, 0, 0, 0);
            const isPast = decisionDate && decisionDate < todayDate;
            
            if (p.total_votes > 0) {
                if (p.yes_count > p.no_count) {
                    voteStatus = 'approved';
                } else if (p.no_count > p.yes_count) {
                    voteStatus = 'denied';
                } else {
                    voteStatus = 'recast';
                }
            } else if (isPast) {
                // Zero votes on a past proposal = needs recast
                voteStatus = 'recast';
            }
            return {
                ...p,
                vote_status: voteStatus
            };
        });
        
        const hasMore = (parseInt(offset) + proposals.length) < total;
        
        res.json({
            success: true,
            proposals: processedProposals,
            total,
            hasMore,
            userOrganizations: userOrgs.map(org => ({
                id: org.id,
                name: org.name,
                role: org.role
            }))
        });
        
    } catch (error) {
        console.error('Error fetching user proposals:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/proposals/:id
 * Get a specific proposal with its AI analysis and vote tallies
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get proposal with vote tallies
        const proposalQuery = `
            SELECT 
                p.*,
                COALESCE(vt.yes_count, 0) as yes_count,
                COALESCE(vt.no_count, 0) as no_count,
                COALESCE(vt.total_votes, 0) as total_votes
            FROM proposals p
            LEFT JOIN vote_tallies vt ON p.id = vt.proposal_id
            WHERE p.id = ?
        `;
        
        db.get(proposalQuery, [id], (err, proposal) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!proposal) {
                return res.status(404).json({ error: 'Proposal not found' });
            }
            
            // Calculate vote status
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const decisionDate = proposal.decision_date ? new Date(proposal.decision_date) : null;
            if (decisionDate) decisionDate.setHours(0, 0, 0, 0);
            const isPast = decisionDate && decisionDate < today;
            
            let voteStatus = 'pending';
            if (proposal.total_votes > 0) {
                if (proposal.yes_count > proposal.no_count) {
                    voteStatus = 'approved';
                } else if (proposal.no_count > proposal.yes_count) {
                    voteStatus = 'denied';
                } else {
                    voteStatus = 'recast';
                }
            } else if (isPast) {
                // Zero votes on a past proposal = needs recast
                voteStatus = 'recast';
            }
            proposal.vote_status = voteStatus;
            
            // Get AI analysis if exists
            db.get(
                'SELECT * FROM proposal_analyses WHERE proposal_id = ?',
                [id],
                (err, analysis) => {
                    if (err) {
                        console.error('Database error:', err);
                    }
                    
                    // Parse JSON fields if analysis exists
                    if (analysis) {
                        try {
                            analysis.loaded_language = JSON.parse(analysis.loaded_language || '[]');
                            analysis.stakeholders = JSON.parse(analysis.stakeholders || '[]');
                            analysis.equity_concerns = JSON.parse(analysis.equity_concerns || '[]');
                            analysis.objective_facts = JSON.parse(analysis.objective_facts || '{}');
                        } catch (e) {
                            console.error('Error parsing analysis JSON:', e);
                        }
                    }
                    
                    res.json({
                        success: true,
                        proposal,
                        analysis
                    });
                }
            );
        });
    } catch (error) {
        console.error('Error fetching proposal:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/proposals/create
 * Create a new proposal
 */
router.post('/create', async (req, res) => {
    try {
        const {
            title,
            original_text,
            creator,
            authorized_by,
            decision_date,
            start_at,
            end_at
        } = req.body;
        
        // Validation
        if (!title || !original_text || !creator || !authorized_by || !decision_date) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['title', 'original_text', 'creator', 'authorized_by', 'decision_date']
            });
        }
        
        // Insert proposal
        db.run(
            `INSERT INTO proposals 
            (title, original_text, creator, authorized_by, decision_date, start_at, end_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, original_text, creator, authorized_by, decision_date, start_at, end_at, 'pending'],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to create proposal' });
                }
                
                const proposalId = this.lastID;
                
                // Fetch the created proposal
                db.get('SELECT * FROM proposals WHERE id = ?', [proposalId], (err, proposal) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Proposal created but failed to fetch' });
                    }
                    
                    res.status(201).json({
                        success: true,
                        proposal
                    });
                });
            }
        );
    } catch (error) {
        console.error('Error creating proposal:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/proposals/:id/analyze
 * Analyze a proposal using the AI service
 */
router.post('/:id/analyze', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get proposal
        db.get('SELECT * FROM proposals WHERE id = ?', [id], async (err, proposal) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!proposal) {
                return res.status(404).json({ error: 'Proposal not found' });
            }
            
            try {
                // Call AI service
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`${AI_SERVICE_URL}/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: proposal.original_text })
                });
                
                if (!response.ok) {
                    throw new Error(`AI service returned ${response.status}`);
                }
                
                const aiResult = await response.json();
                
                // Store analysis in database
                db.run(
                    `INSERT OR REPLACE INTO proposal_analyses 
                    (proposal_id, neutral_summary, loaded_language, stakeholders, equity_concerns, objective_facts)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        aiResult.summary,
                        JSON.stringify(aiResult.loaded_language),
                        JSON.stringify(aiResult.stakeholders),
                        JSON.stringify(aiResult.equity_concerns),
                        JSON.stringify(aiResult.objective_facts)
                    ],
                    (err) => {
                        if (err) {
                            console.error('Failed to store analysis:', err);
                            return res.status(500).json({ error: 'Failed to store analysis' });
                        }
                        
                        res.json({
                            success: true,
                            analysis: {
                                neutral_summary: aiResult.summary,
                                loaded_language: aiResult.loaded_language,
                                stakeholders: aiResult.stakeholders,
                                equity_concerns: aiResult.equity_concerns,
                                objective_facts: aiResult.objective_facts
                            }
                        });
                    }
                );
            } catch (error) {
                console.error('AI service error:', error);
                res.status(503).json({
                    error: 'AI service unavailable',
                    details: error.message
                });
            }
        });
    } catch (error) {
        console.error('Error analyzing proposal:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/proposals/analyze
 * Analyze raw text using the AI service
 */
router.post('/analyze', async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        
        // Call AI service
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`${AI_SERVICE_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        if (!response.ok) {
            throw new Error(`AI service returned ${response.status}`);
        }
        
        const aiResult = await response.json();
        
        res.json({
            success: true,
            analysis: {
                neutral_summary: aiResult.summary,
                loaded_language: aiResult.loaded_language,
                stakeholders: aiResult.stakeholders,
                equity_concerns: aiResult.equity_concerns,
                objective_facts: aiResult.objective_facts
            }
        });
    } catch (error) {
        console.error('AI service error:', error);
        res.status(503).json({
            error: 'AI service unavailable',
            details: error.message
        });
    }
});

/**
 * PUT /api/proposals/:id/status
 * Update proposal status
 */
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['pending', 'active', 'closed', 'archived'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                valid: validStatuses
            });
        }
        
        db.run(
            'UPDATE proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, id],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to update status' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Proposal not found' });
                }
                
                res.json({
                    success: true,
                    message: 'Status updated'
                });
            }
        );
    } catch (error) {
        console.error('Error updating proposal status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===== Petitions =====

/**
 * POST /api/proposals/:id/petition
 * Submit a petition for a proposal
 */
router.post('/:id/petition', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, petition_text } = req.body;
        
        if (!username || !petition_text) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username and petition_text are required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Check if user already has a petition
        const existing = await userDB.getUserPetition(parseInt(id), user.id);
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                error: 'You already have a petition for this proposal. Edit it instead.' 
            });
        }

        const result = await userDB.createPetition(parseInt(id), user.id, petition_text);
        
        res.status(201).json({
            success: true,
            petition_id: result.id
        });
    } catch (error) {
        console.error('Error creating petition:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to submit petition' 
        });
    }
});

/**
 * PUT /api/proposals/:id/petition
 * Update user's petition for a proposal
 */
router.put('/:id/petition', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, petition_text, petition_id } = req.body;
        
        if (!username || !petition_text || !petition_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username, petition_id and petition_text are required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const result = await userDB.updatePetition(parseInt(petition_id), user.id, petition_text);
        
        if (!result.updated) {
            return res.status(404).json({ 
                success: false, 
                error: 'Petition not found or not owned by you' 
            });
        }
        
        res.json({
            success: true,
            message: 'Petition updated'
        });
    } catch (error) {
        console.error('Error updating petition:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update petition' 
        });
    }
});

/**
 * DELETE /api/proposals/:id/petition
 * Delete user's petition for a proposal
 */
router.delete('/:id/petition', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, petition_id } = req.body;
        
        if (!username || !petition_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username and petition_id are required' 
            });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const result = await userDB.deletePetition(parseInt(petition_id), user.id);
        
        if (!result.deleted) {
            return res.status(404).json({ 
                success: false, 
                error: 'Petition not found or not owned by you' 
            });
        }
        
        res.json({
            success: true,
            message: 'Petition deleted'
        });
    } catch (error) {
        console.error('Error deleting petition:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete petition' 
        });
    }
});

/**
 * GET /api/proposals/:id/petitions
 * Get all petitions for a proposal
 */
router.get('/:id/petitions', async (req, res) => {
    try {
        const { id } = req.params;
        
        const petitions = await userDB.getPetitionsForProposal(parseInt(id));
        
        res.json({
            success: true,
            petitions
        });
    } catch (error) {
        console.error('Error getting petitions:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get petitions' 
        });
    }
});

/**
 * GET /api/proposals/:id/my-petition
 * Get user's petition for a proposal
 */
router.get('/:id/my-petition', async (req, res) => {
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

        const petition = await userDB.getUserPetition(parseInt(id), user.id);
        
        res.json({
            success: true,
            petition: petition || null
        });
    } catch (error) {
        console.error('Error getting user petition:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get petition' 
        });
    }
});

// ===== AI Analysis Cache =====

/**
 * GET /api/proposals/:id/analysis-cached
 * Check if user has cached AI analysis for a proposal
 */
router.get('/:id/analysis-cached', async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.query;
        
        if (!username) {
            return res.json({ success: true, cached: false });
        }

        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.json({ success: true, cached: false });
        }

        const hasCached = await userDB.hasUserAnalysis(user.id, parseInt(id));
        
        res.json({
            success: true,
            cached: hasCached
        });
    } catch (error) {
        console.error('Error checking analysis cache:', error);
        res.json({ success: true, cached: false });
    }
});

export default router;
