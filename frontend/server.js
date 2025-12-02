/**
 * GlassBallots Frontend Server
 * 
 * Simple Express server to serve static frontend assets and HTML templates
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.FRONTEND_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (CSS, JS, images)
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Routes for HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Dashboard routes - all serve the same SPA but with different paths for routing
// Order matters: more specific routes first
app.get('/dashboard/organization/:orgId', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/dashboard/:tab', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/proposal/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'proposal.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'frontend',
        version: '1.0.0'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('<h1>404 - Page Not Found</h1>');
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('GlassBallots Frontend');
    console.log('================================');
    console.log(`Port:        ${PORT}`);
    console.log(`API Backend: http://localhost:${process.env.API_PORT || 3001}`);
    console.log('================================');
    console.log(`Frontend running at http://localhost:${PORT}`);
    console.log('');
});
