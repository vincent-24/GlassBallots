#!/bin/bash
# ============================================
# GlassBallots - Blockchain Status Viewer
# ============================================
# This script displays the current state of both
# the blockchain and the SQLite database.
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
RPC_URL="http://127.0.0.1:8545"
BALLOT_ADDRESS="0x5fbdb2315678afecb367f032d93f642f64180aa3"
DB_PATH="$SCRIPT_DIR/glassballots.db"

echo ""
echo "============================================"
echo "     GLASSBALLOTS BLOCKCHAIN STATUS"
echo "============================================"
echo ""

# ============================================
# Section 1: Blockchain Node Status
# ============================================
echo "--------------------------------------------"
echo " BLOCKCHAIN NODE"
echo "--------------------------------------------"

# Check if node is running
BLOCK_NUMBER=$(curl -s -X POST $RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null | \
  python3 -c "import sys,json; r=json.load(sys.stdin); print(int(r.get('result', '0x0'), 16))" 2>/dev/null)

if [ -z "$BLOCK_NUMBER" ] || [ "$BLOCK_NUMBER" = "" ]; then
    echo -e " Status:        ${RED}OFFLINE${NC}"
    echo " RPC URL:       $RPC_URL"
    echo ""
    echo " [!] Hardhat node is not running."
    echo "     Start it with: cd blockchain-service && npx hardhat node"
    echo ""
else
    echo -e " Status:        ${GREEN}ONLINE${NC}"
    echo " RPC URL:       $RPC_URL"
    echo " Current Block: $BLOCK_NUMBER"
    
    # Get chain ID
    CHAIN_ID=$(curl -s -X POST $RPC_URL \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' 2>/dev/null | \
      python3 -c "import sys,json; r=json.load(sys.stdin); print(int(r.get('result', '0x0'), 16))" 2>/dev/null)
    echo " Chain ID:      $CHAIN_ID"
fi
echo ""

# ============================================
# Section 2: Smart Contract Status
# ============================================
echo "--------------------------------------------"
echo " BALLOT SMART CONTRACT"
echo "--------------------------------------------"
echo " Address:       $BALLOT_ADDRESS"

if [ -n "$BLOCK_NUMBER" ] && [ "$BLOCK_NUMBER" != "" ]; then
    # Check if contract exists (has bytecode)
    CODE=$(curl -s -X POST $RPC_URL \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$BALLOT_ADDRESS\",\"latest\"],\"id\":1}" 2>/dev/null | \
      python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r.get('result', '0x')))" 2>/dev/null)
    
    if [ "$CODE" -gt 2 ]; then
        echo -e " Status:        ${GREEN}DEPLOYED${NC}"
        
        # Get proposal count using eth_call
        # Function selector for proposalsCount() = 0xdbb1c2e6
        PROPOSAL_COUNT=$(curl -s -X POST $RPC_URL \
          -H "Content-Type: application/json" \
          -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$BALLOT_ADDRESS\",\"data\":\"0xdbb1c2e6\"},\"latest\"],\"id\":1}" 2>/dev/null | \
          python3 -c "import sys,json; r=json.load(sys.stdin); result=r.get('result', '0x0'); print(int(result, 16) if result and result != '0x' else 0)" 2>/dev/null)
        
        echo " Proposals:     $PROPOSAL_COUNT"
    else
        echo -e " Status:        ${RED}NOT DEPLOYED${NC}"
        echo ""
        echo " [!] Contract not found at this address."
        echo "     Deploy with: cd blockchain-service && npm run deploy"
    fi
else
    echo -e " Status:        ${YELLOW}UNKNOWN${NC} (node offline)"
fi
echo ""

# ============================================
# Section 3: Database Status
# ============================================
echo "--------------------------------------------"
echo " SQLITE DATABASE (Cache)"
echo "--------------------------------------------"
echo " Path:          $DB_PATH"

if [ -f "$DB_PATH" ]; then
    echo -e " Status:        ${GREEN}EXISTS${NC}"
    
    # Get counts from database
    USER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    PROPOSAL_COUNT_DB=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM proposals;" 2>/dev/null || echo "0")
    VOTE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM votes;" 2>/dev/null || echo "0")
    
    echo ""
    echo " Users:         $USER_COUNT"
    echo " Proposals:     $PROPOSAL_COUNT_DB"
    echo " Votes:         $VOTE_COUNT"
    
    # Show vote breakdown if there are votes
    if [ "$VOTE_COUNT" -gt 0 ]; then
        echo ""
        echo " Vote Breakdown by Proposal:"
        sqlite3 -column -header "$DB_PATH" "
            SELECT 
                proposal_id as 'Proposal',
                SUM(CASE WHEN vote_value = 1 THEN 1 ELSE 0 END) as 'Yes',
                SUM(CASE WHEN vote_value = 0 THEN 1 ELSE 0 END) as 'No',
                COUNT(*) as 'Total'
            FROM votes 
            GROUP BY proposal_id
            ORDER BY proposal_id;
        " 2>/dev/null
    fi
else
    echo -e " Status:        ${RED}NOT FOUND${NC}"
fi
echo ""

# ============================================
# Section 4: Recent Transactions (if any blocks)
# ============================================
if [ -n "$BLOCK_NUMBER" ] && [ "$BLOCK_NUMBER" != "" ] && [ "$BLOCK_NUMBER" -gt 0 ]; then
    echo "--------------------------------------------"
    echo " RECENT BLOCKS"
    echo "--------------------------------------------"
    
    # Show last 5 blocks or all if less than 5
    START_BLOCK=$((BLOCK_NUMBER > 4 ? BLOCK_NUMBER - 4 : 0))
    
    for ((i=BLOCK_NUMBER; i>=START_BLOCK; i--)); do
        BLOCK_HEX=$(printf '0x%x' $i)
        BLOCK_INFO=$(curl -s -X POST $RPC_URL \
          -H "Content-Type: application/json" \
          -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$BLOCK_HEX\",false],\"id\":1}" 2>/dev/null)
        
        TX_COUNT=$(echo "$BLOCK_INFO" | python3 -c "import sys,json; r=json.load(sys.stdin); txs=r.get('result',{}).get('transactions',[]); print(len(txs))" 2>/dev/null)
        TIMESTAMP=$(echo "$BLOCK_INFO" | python3 -c "import sys,json,datetime; r=json.load(sys.stdin); ts=int(r.get('result',{}).get('timestamp','0x0'),16); print(datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S') if ts else 'N/A')" 2>/dev/null)
        
        echo " Block $i: $TX_COUNT transaction(s) - $TIMESTAMP"
    done
    echo ""
fi

# ============================================
# Section 5: Configuration Check
# ============================================
echo "--------------------------------------------"
echo " CONFIGURATION"
echo "--------------------------------------------"

ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    ENV_BALLOT=$(grep "BALLOT_CONTRACT_ADDRESS" "$ENV_FILE" | cut -d'=' -f2)
    if [ -n "$ENV_BALLOT" ]; then
        echo " .env Address:  $ENV_BALLOT"
        if [ "$ENV_BALLOT" = "$BALLOT_ADDRESS" ]; then
            echo -e " Match:         ${GREEN}YES${NC}"
        else
            echo -e " Match:         ${RED}NO - Update .env!${NC}"
        fi
    else
        echo -e " .env Address:  ${YELLOW}NOT SET${NC}"
    fi
else
    echo -e " .env File:     ${RED}NOT FOUND${NC}"
fi
echo ""

echo "============================================"
echo ""
