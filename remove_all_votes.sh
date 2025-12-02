#!/bin/bash

# Remove all votes from the database
# This script ONLY removes votes and nothing else

DB_PATH="blockchain-service/database/glassballots.db"

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found at $DB_PATH"
    exit 1
fi

echo "Removing all votes from the database..."

sqlite3 "$DB_PATH" <<EOF
-- Delete all votes
DELETE FROM votes;

-- Reset vote tallies
DELETE FROM vote_tallies;

-- Show confirmation
SELECT 'Votes remaining: ' || COUNT(*) FROM votes;
SELECT 'Vote tallies remaining: ' || COUNT(*) FROM vote_tallies;
EOF

echo "Done! All votes have been removed."
