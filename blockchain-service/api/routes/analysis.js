/**
 * Analysis API Routes
 * Handles AI analysis generation and caching per user
 */

import express from 'express';
import userDB from '../../database/db.js';
import fetch from 'node-fetch';

const router = express.Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';

/**
 * GET /api/analysis/:proposalId/:username
 * Get cached analysis for a specific user and proposal
 */
router.get('/:proposalId/:username', async (req, res) => {
    try {
        const { proposalId, username } = req.params;
        
        // Get user by username
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        // Get cached analysis
        const analysis = await userDB.getUserAnalysis(user.id, parseInt(proposalId));
        
        if (!analysis) {
            return res.status(404).json({ 
                success: false, 
                error: 'No cached analysis found' 
            });
        }
        
        res.json({
            success: true,
            analysis,
            cached: true
        });
        
    } catch (error) {
        console.error('Error fetching analysis:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/analysis/generate
 * Generate new AI analysis and cache it for the user
 */
router.post('/generate', async (req, res) => {
    try {
        const { proposal_id, username } = req.body;
        
        if (!proposal_id || !username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing proposal_id or username' 
            });
        }
        
        // Get user by username
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        // Get proposal
        const proposal = await userDB.getProposalById(parseInt(proposal_id));
        if (!proposal) {
            return res.status(404).json({ 
                success: false, 
                error: 'Proposal not found' 
            });
        }
        
        // Call AI service to generate analysis
        console.log(`Calling AI service for proposal ${proposal_id}...`);
        const aiResponse = await fetch(`${AI_SERVICE_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: proposal.original_text
            })
        });
        
        if (!aiResponse.ok) {
            const errorData = await aiResponse.json();
            throw new Error(errorData.error || 'AI analysis failed');
        }
        
        const aiData = await aiResponse.json();
        
        // The AI service returns { success: true, summary: ..., loaded_language: ..., etc }
        // Transform the structure to match database schema
        const analysis = {
            neutral_summary: aiData.summary,
            objective_facts: aiData.objective_facts,
            loaded_language: aiData.loaded_language || [],
            stakeholders: aiData.stakeholders || [],
            equity_concerns: aiData.equity_concerns || []
        };
        
        // Cache the analysis for this user
        await userDB.saveUserAnalysis(user.id, proposal.id, analysis);
        
        res.json({
            success: true,
            analysis: analysis,
            cached: false
        });
        
    } catch (error) {
        console.error('Error generating analysis:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * DELETE /api/analysis/:proposalId/:username
 * Delete cached analysis (for regeneration)
 */
router.delete('/:proposalId/:username', async (req, res) => {
    try {
        const { proposalId, username } = req.params;
        
        // Get user by username
        const user = await userDB.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        // Delete cached analysis
        const result = await userDB.deleteUserAnalysis(user.id, parseInt(proposalId));
        
        res.json({
            success: true,
            deleted: result.deleted
        });
        
    } catch (error) {
        console.error('Error deleting analysis:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

export default router;
