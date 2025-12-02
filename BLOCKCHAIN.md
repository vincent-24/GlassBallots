# GlassBallots Blockchain Architecture

This document provides a comprehensive explanation of how the blockchain integration works in GlassBallots, including the hybrid database architecture that ensures both transparency and performance.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [The Hybrid Approach](#the-hybrid-approach)
4. [Smart Contracts](#smart-contracts)
5. [Vote Flow - Step by Step](#vote-flow---step-by-step)
6. [Transaction Verification](#transaction-verification)
7. [Data Storage Strategy](#data-storage-strategy)
8. [Development vs Production](#development-vs-production)
9. [Security Considerations](#security-considerations)
10. [API Reference](#api-reference)
11. [Troubleshooting](#troubleshooting)

---

## Overview

GlassBallots uses a **hybrid blockchain-database architecture** that combines the immutability and transparency of blockchain with the speed and flexibility of a traditional SQL database.

### Why Hybrid?

| Pure Blockchain | Pure Database | Hybrid (GlassBallots) |
|----------------|---------------|----------------------|
| Slow queries | Fast queries | Fast queries |
| High gas costs | No gas costs | Minimal gas costs |
| Fully transparent | Not transparent | Transparent + Fast |
| Immutable | Mutable | Immutable source of truth |
| Complex analytics | Easy analytics | Easy analytics |

The blockchain serves as the **source of truth** for all votes, while the SQLite database serves as a **read cache** for fast dashboard loading and analytics.

---

## Architecture Diagram

```
                                    GLASSBALLOTS ARCHITECTURE
    
    +------------------+         +------------------+         +------------------+
    |                  |         |                  |         |                  |
    |     FRONTEND     |         |    BLOCKCHAIN    |         |     DATABASE     |
    |     (React)      |         |    (Hardhat)     |         |     (SQLite)     |
    |                  |         |                  |         |                  |
    +--------+---------+         +--------+---------+         +--------+---------+
             |                            |                            |
             |  1. User clicks "Vote"     |                            |
             |                            |                            |
             v                            |                            |
    +------------------+                  |                            |
    |     METAMASK     |                  |                            |
    |  (Wallet/Signer) |                  |                            |
    +--------+---------+                  |                            |
             |                            |                            |
             |  2. Sign & Send Transaction|                            |
             +--------------------------->|                            |
             |                            |                            |
             |  3. Transaction Mined      |                            |
             |<---------------------------+                            |
             |     (txHash returned)      |                            |
             |                            |                            |
             |  4. Send txHash to API     |                            |
             +------------------------------------------------------------->
             |                            |                            |    |
             |                            |  5. API Verifies txHash    |    |
             |                            |<---------------------------+----+
             |                            |                            |
             |                            |  6. If valid, write to DB  |
             |                            +--------------------------->|
             |                            |                            |
             |  7. Return success         |                            |
             |<------------------------------------------------------------+
             |                            |                            |
    
    
    LEGEND:
    -------
    Frontend: User interface (browser)
    MetaMask: Ethereum wallet extension
    Blockchain: Hardhat local node (dev) or Ethereum network (prod)
    Database: SQLite file for fast reads and analytics
```

---

## The Hybrid Approach

### How It Works

1. **Write Path (Voting)**
   - User initiates vote through the frontend
   - MetaMask creates and signs a blockchain transaction
   - Transaction is sent directly to the Ballot smart contract
   - Once mined, the transaction hash is sent to our API
   - API verifies the transaction on-chain
   - If valid, the vote is cached in SQLite

2. **Read Path (Dashboard)**
   - Dashboard queries the SQLite database directly
   - No blockchain calls needed for displaying results
   - Sub-millisecond response times

### Why This Matters

```
Traditional Blockchain-Only Approach:
-------------------------------------
User Request -> Query Blockchain -> Wait 1-5 seconds -> Response

GlassBallots Hybrid Approach:
-----------------------------
User Request -> Query SQLite -> Response in <10ms
                     |
                     +-- Data verified against blockchain on write
```

---

## Smart Contracts

### Ballot.sol

The main voting contract that stores proposals and vote counts on-chain.

**Location:** `blockchain-service/contracts/Ballot.sol`

**Key Functions:**

| Function | Description | Access |
|----------|-------------|--------|
| `createProposal(...)` | Create a new proposal | Council/Admin only |
| `vote(uint256 id, bool supportYes)` | Cast a vote | Anyone |
| `close(uint256 id)` | Close voting on a proposal | Council/Admin only |
| `getProposal(uint256 id)` | Read proposal details | Public (view) |
| `hasVoted(uint256 id, address)` | Check if address voted | Public (view) |
| `proposalsCount()` | Get total proposals | Public (view) |

**Events Emitted:**

```solidity
event ProposalCreated(uint256 indexed id, address indexed proposer, ...);
event Voted(uint256 indexed id, address indexed voter, bool supportYes, uint256 yes, uint256 no);
event ProposalClosed(uint256 indexed id, uint256 yes, uint256 no);
```

### Contract Addresses

| Network | Ballot Address | Status |
|---------|---------------|--------|
| Hardhat Local | `0x5fbdb2315678afecb367f032d93f642f64180aa3` | Development |
| Sepolia Testnet | TBD | Not deployed |
| Ethereum Mainnet | TBD | Not deployed |

---

## Vote Flow - Step by Step

### Step 1: User Initiates Vote (Frontend)

```javascript
// Frontend code (simplified)
const vote = async (proposalId, support) => {
    // Connect to user's wallet
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    
    // Create contract instance
    const ballot = new ethers.Contract(BALLOT_ADDRESS, BALLOT_ABI, signer);
    
    // Send vote transaction (MetaMask popup appears)
    const tx = await ballot.vote(proposalId, support);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    // Send to our API for verification and caching
    await fetch('/api/votes/cast', {
        method: 'POST',
        body: JSON.stringify({
            transactionHash: receipt.hash,
            proposalId: proposalId,
            voteValue: support,
            walletAddress: signer.address
        })
    });
};
```

### Step 2: Transaction Created and Signed (MetaMask)

MetaMask:
1. Displays transaction details to user
2. User confirms and enters password
3. Transaction signed with private key
4. Signed transaction broadcast to network

### Step 3: Transaction Mined (Blockchain)

The Hardhat node (or Ethereum network):
1. Receives the transaction
2. Validates the transaction
3. Executes the smart contract code
4. Updates contract state (vote count)
5. Emits `Voted` event
6. Includes transaction in a block

### Step 4: API Verification (Backend)

The `/api/votes/cast` endpoint:

```javascript
// Simplified verification flow
router.post('/cast', async (req, res) => {
    const { transactionHash, proposalId, voteValue, walletAddress } = req.body;
    
    // 1. Fetch transaction from blockchain
    const tx = await provider.getTransaction(transactionHash);
    
    // 2. Verify sender matches claimed wallet
    if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(400).json({ error: 'Sender mismatch' });
    }
    
    // 3. Verify transaction went to Ballot contract
    if (tx.to.toLowerCase() !== BALLOT_ADDRESS.toLowerCase()) {
        return res.status(400).json({ error: 'Wrong contract' });
    }
    
    // 4. Verify it called vote() function
    if (!tx.data.startsWith(VOTE_FUNCTION_SELECTOR)) {
        return res.status(400).json({ error: 'Wrong function' });
    }
    
    // 5. Decode and verify parameters
    const decoded = iface.parseTransaction({ data: tx.data });
    if (decoded.args[0] !== proposalId) {
        return res.status(400).json({ error: 'Proposal ID mismatch' });
    }
    
    // 6. All checks passed - save to database
    await db.submitVote(userId, proposalId, voteValue, walletAddress, transactionHash);
    
    return res.json({ success: true });
});
```

### Step 5: Database Cache Updated (SQLite)

The vote is stored in SQLite for fast retrieval:

```sql
INSERT INTO votes (user_id, proposal_id, vote_value, wallet_address, transaction_hash, block_number)
VALUES (?, ?, ?, ?, ?, ?);
```

A trigger automatically updates the vote tallies:

```sql
-- Automatic tally update trigger
UPDATE vote_tallies SET
    yes_count = yes_count + (CASE WHEN vote_value = 1 THEN 1 ELSE 0 END),
    no_count = no_count + (CASE WHEN vote_value = 0 THEN 1 ELSE 0 END),
    total_votes = total_votes + 1
WHERE proposal_id = NEW.proposal_id;
```

---

## Transaction Verification

The API performs 7 verification checks before accepting a vote:

### Verification Checklist

| Check | What It Verifies | Error If Failed |
|-------|------------------|-----------------|
| 1. Format | Transaction hash is valid format | Invalid hash format |
| 2. Existence | Transaction exists on blockchain | Transaction not found |
| 3. Status | Transaction was successful (not reverted) | Transaction failed |
| 4. Sender | `tx.from` matches claimed wallet | Sender mismatch |
| 5. Target | `tx.to` is the Ballot contract | Wrong contract |
| 6. Function | Calldata starts with `vote()` selector | Wrong function |
| 7. Parameters | Decoded proposalId and voteValue match | Parameter mismatch |

### Function Selector

The `vote(uint256,bool)` function has selector `0xc9d27afe`:

```
keccak256("vote(uint256,bool)") = 0xc9d27afe...
                                    ^^^^^^^^
                                    First 4 bytes = function selector
```

### Example Transaction Data

```
0xc9d27afe                                                         <- Function selector
0000000000000000000000000000000000000000000000000000000000000001   <- proposalId (1)
0000000000000000000000000000000000000000000000000000000000000001   <- supportYes (true)
```

---

## Data Storage Strategy

### What Gets Stored Where

| Data | Blockchain | Database | Notes |
|------|------------|----------|-------|
| Vote record | Yes | Yes | Blockchain is source of truth |
| Vote counts | Yes | Yes | DB tallies auto-updated via trigger |
| Proposal text | Yes | Yes | Full text stored both places |
| User profiles | No | Yes | Personal data stays off-chain |
| AI analysis | No | Yes | Computed data, not votes |
| Session tokens | No | Yes | Authentication only |

### Database Schema (Voting Tables)

```sql
-- Individual vote records
CREATE TABLE votes (
    id INTEGER PRIMARY KEY,
    proposal_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    vote_value BOOLEAN NOT NULL,      -- 1 = yes, 0 = no
    transaction_hash TEXT,            -- Blockchain tx hash
    block_number INTEGER,             -- Block where vote recorded
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proposal_id, user_id)      -- Prevent double voting
);

-- Cached vote tallies (auto-updated by trigger)
CREATE TABLE vote_tallies (
    proposal_id INTEGER PRIMARY KEY,
    yes_count INTEGER DEFAULT 0,
    no_count INTEGER DEFAULT 0,
    total_votes INTEGER DEFAULT 0,
    last_updated DATETIME
);
```

---

## Development vs Production

### Development (Hardhat Local Node)

```
Configuration:
- RPC URL: http://127.0.0.1:8545
- Chain ID: 31337
- Block Time: Instant (auto-mine)
- State: Ephemeral (lost on restart)
- Gas: Free (test ETH)
```

**Important:** The Hardhat node resets all blockchain state when restarted. You must redeploy contracts after each restart:

```bash
cd blockchain-service
npm run deploy
```

However, the SQLite database persists across restarts, so historical vote data in the database cache remains available.

### Production (Ethereum/Sepolia)

```
Configuration:
- RPC URL: https://sepolia.infura.io/v3/YOUR_KEY (example)
- Chain ID: 11155111 (Sepolia) or 1 (Mainnet)
- Block Time: ~12 seconds
- State: Permanent
- Gas: Real ETH required
```

For production:
1. Deploy contracts to target network
2. Update `BALLOT_CONTRACT_ADDRESS` in `.env`
3. Update `BLOCKCHAIN_RPC_URL` to production endpoint
4. Users need real ETH for gas fees

---

## Security Considerations

### Double Voting Prevention

Double voting is prevented at multiple layers:

1. **Smart Contract Layer**
   ```solidity
   mapping(address => bool) voted;
   
   function vote(uint256 id, bool support) external {
       if (proposals[id].voted[msg.sender]) revert AlreadyVoted();
       proposals[id].voted[msg.sender] = true;
       // ... record vote
   }
   ```

2. **Database Layer**
   ```sql
   UNIQUE(proposal_id, user_id)  -- Constraint prevents duplicate entries
   ```

3. **API Layer**
   ```javascript
   // Check database before accepting vote
   const existingVote = await db.getUserVote(userId, proposalId);
   if (existingVote) {
       return res.status(409).json({ error: 'Already voted' });
   }
   ```

### Transaction Verification

All votes submitted to the API are verified against the blockchain:
- Fake transaction hashes are rejected
- Transactions to wrong contracts are rejected
- Transactions with wrong parameters are rejected

### Data Integrity

- Blockchain votes cannot be altered (immutable)
- Database is a cache that can be rebuilt from blockchain
- Transaction hashes link database records to blockchain proof

---

## API Reference

### POST /api/votes/cast

Submit a blockchain-verified vote.

**Request Body:**
```json
{
    "transactionHash": "0x123...",
    "proposalId": 1,
    "voteValue": true,
    "walletAddress": "0xabc...",
    "userId": 123
}
```

**Success Response (201):**
```json
{
    "success": true,
    "message": "Vote verified and recorded successfully",
    "data": {
        "transactionHash": "0x123...",
        "blockNumber": 42,
        "proposalId": 1,
        "voteValue": true,
        "walletAddress": "0xabc...",
        "verified": true
    },
    "tallies": {
        "yes_count": 10,
        "no_count": 5,
        "total_votes": 15
    }
}
```

**Error Responses:**

| Code | Error | Cause |
|------|-------|-------|
| 400 | Missing required fields | Request body incomplete |
| 400 | Invalid transaction hash format | Hash not 66 characters |
| 400 | Transaction not found | Hash doesn't exist on-chain |
| 400 | Transaction sender mismatch | tx.from != walletAddress |
| 400 | Wrong contract | tx.to != Ballot address |
| 400 | Wrong function | Not a vote() call |
| 409 | Already voted | User voted on this proposal |
| 500 | Configuration error | Contract address not set |

### GET /api/votes/:proposalId/results

Get current vote tallies for a proposal.

**Response:**
```json
{
    "success": true,
    "results": {
        "yes_count": 10,
        "no_count": 5,
        "total_votes": 15,
        "last_updated": "2025-11-24T10:30:00Z"
    }
}
```

---

## Troubleshooting

### Common Issues

**Problem:** "Transaction not found on blockchain"
- Cause: Transaction may still be pending or node restarted
- Solution: Wait for confirmation or redeploy contracts

**Problem:** "Blockchain configuration error: Contract address not set"
- Cause: `BALLOT_CONTRACT_ADDRESS` not in `.env`
- Solution: Run `npm run deploy` and copy address to `.env`

**Problem:** "Contract function returned no data"
- Cause: Hardhat node was restarted, contracts no longer deployed
- Solution: Run `cd blockchain-service && npm run deploy`

**Problem:** Vote shows in database but not on blockchain
- Cause: Using `/api/votes/submit` endpoint (Web2 mode) instead of `/api/votes/cast`
- Solution: Use the `/cast` endpoint with blockchain verification

### Useful Commands

Check blockchain status:
```bash
./view_blockchain.sh
```

Redeploy contracts:
```bash
cd blockchain-service && npm run deploy
```

View database contents:
```bash
./view_users.sh
```

Check if node is running:
```bash
curl -X POST http://127.0.0.1:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

---

## File Reference

| File | Purpose |
|------|---------|
| `blockchain-service/contracts/Ballot.sol` | Smart contract source |
| `blockchain-service/api/routes/votes.js` | Vote API endpoints |
| `blockchain-service/config/blockchain.js` | Contract address and ABI config |
| `blockchain-service/database/db.js` | SQLite database helper |
| `blockchain-service/database/schema.sql` | Database schema |
| `blockchain-service/scripts/deploy.js` | Contract deployment script |
| `.env` | Environment configuration |
| `view_blockchain.sh` | Blockchain status viewer |

---

## Summary

GlassBallots implements a hybrid architecture where:

1. **Blockchain** = Immutable source of truth for all votes
2. **Database** = Fast read cache for dashboards and analytics
3. **API** = Verification layer ensuring database matches blockchain

This approach provides:
- Transparency (all votes verifiable on-chain)
- Performance (instant dashboard loading)
- Security (multi-layer double-vote prevention)
- Auditability (transaction hashes link to blockchain proof)
