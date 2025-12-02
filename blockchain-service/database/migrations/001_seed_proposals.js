/**
 * Migration: Seed Proposals from JSON files
 * 
 * This script imports existing proposal JSON files into the database.
 * Run this after the database schema has been created.
 */

import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../glassballots.db');

// Proposals directory
const PROPOSALS_DIR = path.join(__dirname, '../../../data/proposals');

/**
 * Import proposals from JSON files
 */
async function seedProposals() {
    const db = new sqlite3.Database(DB_PATH);
    
    console.log('Starting proposal migration...');
    console.log(`📂 Reading proposals from: ${PROPOSALS_DIR}`);
    
    // Check if proposals directory exists
    if (!fs.existsSync(PROPOSALS_DIR)) {
        console.error(`Proposals directory not found: ${PROPOSALS_DIR}`);
        process.exit(1);
    }
    
    // Read all JSON files
    const files = fs.readdirSync(PROPOSALS_DIR)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => {
            const numA = parseInt(a.replace('.json', ''));
            const numB = parseInt(b.replace('.json', ''));
            return numA - numB;
        });
    
    console.log(`Found ${files.length} proposal files`);
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const file of files) {
        const filePath = path.join(PROPOSALS_DIR, file);
        
        try {
            // Read JSON file
            const content = fs.readFileSync(filePath, 'utf8');
            const proposal = JSON.parse(content);
            
            // Check if proposal already exists
            const existing = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT id FROM proposals WHERE id = ?',
                    [proposal.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (existing) {
                console.log(`Skipping proposal ${proposal.id} (already exists)`);
                skipped++;
                continue;
            }
            
            // Insert proposal
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO proposals 
                    (id, title, original_text, creator, authorized_by, decision_date, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        proposal.id,
                        proposal.title,
                        proposal.original_text,
                        proposal.creator,
                        proposal.authorized_by,
                        proposal.decision_date,
                        'pending',  // Default status
                        new Date().toISOString()
                    ],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this.lastID);
                        }
                    }
                );
            });
            
            console.log(`Imported proposal ${proposal.id}: ${proposal.title.substring(0, 50)}...`);
            imported++;
            
        } catch (error) {
            console.error(`Error importing ${file}:`, error.message);
            errors++;
        }
    }
    
    // Close database
    await new Promise((resolve) => {
        db.close(() => {
            console.log('\nMigration Summary:');
            console.log(`   Imported: ${imported}`);
            console.log(`   Skipped:  ${skipped}`);
            console.log(`   Errors:   ${errors}`);
            console.log(`   Total:    ${files.length}`);
            console.log('\nMigration completed!');
            resolve();
        });
    });
}

// Run migration
seedProposals().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
