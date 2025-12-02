/**
 * Seed proposals from data/proposals/*.json files into the database
 */

import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'glassballots.db');
const PROPOSALS_DIR = path.join(__dirname, '../../data/proposals');

const db = new sqlite3.Database(DB_PATH);

async function seedProposals() {
    console.log('Seeding proposals from:', PROPOSALS_DIR);
    
    // Read all JSON files from proposals directory
    const files = fs.readdirSync(PROPOSALS_DIR).filter(f => f.endsWith('.json'));
    
    console.log(`Found ${files.length} proposal files`);
    
    for (const file of files) {
        try {
            const filePath = path.join(PROPOSALS_DIR, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Insert or replace proposal
            const query = `
                INSERT OR REPLACE INTO proposals 
                (id, title, original_text, creator, authorized_by, decision_date, status)
                VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `;
            
            await new Promise((resolve, reject) => {
                db.run(query, [
                    data.id,
                    data.title,
                    data.original_text,
                    data.creator,
                    data.authorized_by,
                    data.decision_date
                ], (err) => {
                    if (err) {
                        console.error(`Error inserting proposal ${data.id}:`, err.message);
                        reject(err);
                    } else {
                        console.log(`Inserted proposal ${data.id}: ${data.title.substring(0, 50)}...`);
                        resolve();
                    }
                });
            });
            
        } catch (error) {
            console.error(`Error processing ${file}:`, error.message);
        }
    }
    
    // Verify
    db.get('SELECT COUNT(*) as count FROM proposals', [], (err, row) => {
        if (err) {
            console.error('Error counting proposals:', err);
        } else {
            console.log(`\nTotal proposals in database: ${row.count}`);
        }
        
        db.close();
    });
}

seedProposals();
