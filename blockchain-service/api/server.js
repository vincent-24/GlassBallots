/**
 * GlassBallots Unified API Server
 * 
 * This server provides a unified REST API for:
 * - User authentication and management
 * - Proposal CRUD operations
 * - AI analysis proxy
 * - Blockchain voting integration
 * - Feedback collection
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import usersRouter from './routes/users.js';
import proposalsRouter from './routes/proposals.js';
import votesRouter from './routes/votes.js';
import feedbackRouter from './routes/feedback.js';
import analysisRouter from './routes/analysis.js';
import organizationsRouter from './routes/organizations.js';

// Import security utilities
import { sanitizationMiddleware } from '../utils/security.js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();

// Get port from environment
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
const corsOptions = {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Input sanitization middleware (applied to all routes)
app.use(sanitizationMiddleware);

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'blockchain-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API routes
app.use('/api/users', usersRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/votes', votesRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/organizations', organizationsRouter);

// Petition route (mapped to feedback router)
app.use('/api/petition', (req, res, next) => {
    // Redirect /api/petition to the petition endpoint in feedback router
    req.url = '/petition';
    feedbackRouter(req, res, next);
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'GlassBallots API',
        version: '1.0.0',
        description: 'Unified API for AI-enhanced civic engagement platform',
        endpoints: {
            health: 'GET /health',
            users: {
                register: 'POST /api/users/register',
                login: 'POST /api/users/login',
                profile: 'GET /api/users/profile',
                update: 'PUT /api/users/profile'
            },
            proposals: {
                list: 'GET /api/proposals',
                get: 'GET /api/proposals/:id',
                create: 'POST /api/proposals/create',
                analyze: 'POST /api/proposals/:id/analyze'
            },
            votes: {
                cast: 'POST /api/votes/cast',
                results: 'GET /api/votes/:proposalId/results'
            },
            feedback: {
                submit: 'POST /api/feedback/submit',
                list: 'GET /api/feedback/:proposalId'
            },
            organizations: {
                create: 'POST /api/organizations',
                search: 'GET /api/organizations/search?q=term',
                getByCode: 'GET /api/organizations/code/:code',
                userOrgs: 'GET /api/organizations/user/:username',
                join: 'POST /api/organizations/join',
                pending: 'GET /api/organizations/:id/pending',
                members: 'GET /api/organizations/:id/members',
                approve: 'POST /api/organizations/membership/:id/approve',
                reject: 'POST /api/organizations/membership/:id/reject',
                leave: 'POST /api/organizations/:id/leave'
            }
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    
    res.status(status).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('GlassBallots API Server');
    console.log('================================');
    console.log(`Port:        ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS:        ${corsOptions.origin.join(', ')}`);
    console.log('================================');
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('');
});

export default app;
