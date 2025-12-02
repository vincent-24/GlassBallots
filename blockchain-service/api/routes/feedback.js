/**
 * Feedback Routes
 * 
 * Handles feedback operations:
 * - Submit feedback on proposals
 * - Submit petitions (modification requests)
 * - Get feedback for a proposal
 * - Moderate feedback (admin only)
 */

import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import userDB from '../../database/db.js';

dotenv.config();

const router = express.Router();

// Database connection
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'database/glassballots.db');
const db = new sqlite3.Database(DB_PATH);

/**
 * POST /api/feedback/submit
 * Submit feedback on a proposal
 */
router.post('/submit', async (req, res) => {
    try {
        const {
            proposal_id,
            user_id,
            wallet_address,
            rating,
            comment,
            category,
            is_anonymous
        } = req.body;
        
        // Validation
        if (!proposal_id || !wallet_address) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['proposal_id', 'wallet_address']
            });
        }
        
        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }
        
        const validCategories = ['academic', 'campus', 'financial', 'other', 'petition'];
        if (category && !validCategories.includes(category)) {
            return res.status(400).json({
                error: 'Invalid category',
                valid: validCategories
            });
        }
        
        // Insert feedback
        db.run(
            `INSERT INTO feedback 
            (proposal_id, user_id, wallet_address, rating, comment, category, is_anonymous)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                proposal_id,
                user_id,
                wallet_address,
                rating,
                comment,
                category || 'other',
                is_anonymous ? 1 : 0
            ],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to submit feedback' });
                }
                
                res.status(201).json({
                    success: true,
                    message: 'Feedback submitted',
                    feedback_id: this.lastID
                });
            }
        );
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/petition
 * Submit a petition (modification request) on a proposal
 * This is an anonymous submission for suggesting changes to proposals
 */
router.post('/petition', async (req, res) => {
    try {
        const { proposal_id, modification_request, username } = req.body;
        
        // Validation
        if (!proposal_id || !modification_request) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                required: ['proposal_id', 'modification_request']
            });
        }
        
        // Get user if username provided
        let userId = null;
        let walletAddress = 'anonymous';
        
        if (username) {
            const user = await userDB.getUserByUsername(username);
            if (user) {
                userId = user.id;
                walletAddress = user.wallet_address;
            }
        }
        
        // Insert petition as feedback with category='petition'
        db.run(
            `INSERT INTO feedback 
            (proposal_id, user_id, wallet_address, comment, category, is_anonymous)
            VALUES (?, ?, ?, ?, 'petition', 1)`,
            [
                proposal_id,
                userId,
                walletAddress,
                modification_request
            ],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ 
                        success: false,
                        error: 'Failed to submit petition' 
                    });
                }
                
                res.status(201).json({
                    success: true,
                    message: 'Petition submitted successfully',
                    petition_id: this.lastID
                });
            }
        );
    } catch (error) {
        console.error('Error submitting petition:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

/**
 * GET /api/feedback/:proposalId
 * Get all feedback for a proposal
 */
router.get('/:proposalId', async (req, res) => {
    try {
        const { proposalId } = req.params;
        const { category, visible_only = 'true' } = req.query;
        
        let query = 'SELECT * FROM feedback WHERE proposal_id = ?';
        const params = [proposalId];
        
        if (visible_only === 'true') {
            query += ' AND is_visible = 1';
        }
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        query += ' ORDER BY submitted_at DESC';
        
        db.all(query, params, (err, feedback) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Calculate average rating
            const ratings = feedback.filter(f => f.rating).map(f => f.rating);
            const avgRating = ratings.length > 0
                ? ratings.reduce((a, b) => a + b, 0) / ratings.length
                : null;
            
            res.json({
                success: true,
                feedback: feedback.map(f => ({
                    id: f.id,
                    rating: f.rating,
                    comment: f.comment,
                    category: f.category,
                    is_anonymous: f.is_anonymous === 1,
                    submitted_at: f.submitted_at,
                    user_id: f.is_anonymous ? null : f.user_id
                })),
                statistics: {
                    total_count: feedback.length,
                    average_rating: avgRating,
                    rating_distribution: {
                        5: ratings.filter(r => r === 5).length,
                        4: ratings.filter(r => r === 4).length,
                        3: ratings.filter(r => r === 3).length,
                        2: ratings.filter(r => r === 2).length,
                        1: ratings.filter(r => r === 1).length
                    }
                }
            });
        });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/feedback/:id/moderate
 * Moderate feedback (admin/moderator only)
 */
router.put('/:id/moderate', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_visible } = req.body;
        
        if (is_visible === undefined) {
            return res.status(400).json({ error: 'is_visible field is required' });
        }
        
        db.run(
            'UPDATE feedback SET is_visible = ?, moderated = 1 WHERE id = ?',
            [is_visible ? 1 : 0, id],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to moderate feedback' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Feedback not found' });
                }
                
                res.json({
                    success: true,
                    message: 'Feedback moderated'
                });
            }
        );
    } catch (error) {
        console.error('Error moderating feedback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
