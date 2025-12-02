#!/bin/bash

# ============================================
# View All Users in Database
# ============================================

DB_PATH="$(dirname "$0")/blockchain-service/database/glassballots.db"

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found at: $DB_PATH"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              GlassBallots - User Database                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "Total Users:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" | awk '{print "   " $0 " accounts"}'
echo ""

echo "All Users:"
echo "   ID | Username          | Email                    | Role      | Created"
echo "   ───┼──────────────────┼─────────────────────────┼──────────┼────────────────────"
sqlite3 "$DB_PATH" "SELECT 
    printf('%4s', id) || ' | ' ||
    printf('%-16s', COALESCE(username, 'N/A')) || ' | ' ||
    printf('%-24s', COALESCE(email, 'N/A')) || ' | ' ||
    printf('%-8s', COALESCE(role, 'N/A')) || ' | ' ||
    datetime(created_at)
FROM users 
ORDER BY created_at DESC;"

echo ""
echo "Database location: $DB_PATH"
echo ""
