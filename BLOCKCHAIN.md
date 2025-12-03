# GlassBallots Blockchain Architecture

This document provides a comprehensive explanation of how the blockchain integration works in GlassBallots, including the hybrid database architecture that ensures both transparency and performance.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [The Hybrid Approach](#the-hybrid-approach)
4. [Smart Contracts](#smart-contracts)
5. [Vote Flow](#vote-flow)
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
    FRONTEND              BLOCKCHAIN           DATABASE
    (React)               (Hardhat)            (SQLite)
       |                      |                    |
       |  1. User clicks "Vote"                    |
       v                      |                    |
    METAMASK                  |                    |
   (Wallet/Signer)            |                    |
       |                      |                    |
       |  2. Sign & Send Transaction               |
       +---------------------->                    |
       |                      |                    |
       |  3. Transaction Mined                     |
       <----------------------+                    |
       |     (txHash returned)                     |
       |                      |                    |
       |  4. Send txHash to API                    |
       +---------------------------------------------->
       |                      |                    |  |
       |                      |  5. API Verifies   |  |
       |                      |<-------------------+--+
       |                      |                    |
       |                      |  6. If valid, write to DB
       |                      +-------------------->
       |                      |                    |
       |  7. Return success                        |
       <-----------------------------------------------+
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
User Request -> Query Blockchain -> Wait 1-5 seconds -> Response

GlassBallots Hybrid Approach:
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
| createProposal(...) | Create a new proposal | Council/Admin only |
| vote(uint256 id, bool supportYes) | Cast a vote | Anyone |
| close(uint256 id) | Close voting on a proposal | Council/Admin only |
| getProposal(uint256 id) | Read proposal details | Public (view) |
| hasVoted(uint256 id, address) | Check if address voted | Public (view) |
| proposalsCount() | Get total proposals | Public (view) |

**Events Emitted:**

```solidity
event ProposalCreated(uint256 indexed id, address indexed proposer, ...);
event Voted(uint256 indexed id, address indexed voter, bool supportYes, uint256 yes, uint256 no);
event ProposalClosed(uint256 indexed id, uint256 yes, uint256 no);
```

### Contract Addresses

| Network | Ballot Address | Status |
|---------|---------------|--------|
| Hardhat Local | 0x5fbdb2315678afecb367f032d93f642f64180aa3 | Development |
| Sepolia Testnet | TBD | Not deployed |
| Ethereum Mainnet | TBD | Not deployed |

---

## Vote Flow

### Step 1: User Initiates Vote (Frontend)

```javascript
// Frontend code (simplified)
const vote = async (proposalId, support) => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const ballot = new ethers.Contract(BALLOT_ADDRESS, BALLOT_ABI, signer);
    const tx = await ballot.vote(proposalId, support);
    const receipt = await tx.wait();
    
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
5. Emits Voted event
6. Includes transaction in a block

### Step 4: API Verification (Backend)

The /api/votes/cast endpoint verifies:
1. Transaction exists on blockchain
2. Sender matches claimed wallet
3. Transaction went to Ballot contract
4. It called vote() function
5. Parameters match claimed vote

### Step 5: Database Cache Updated (SQLite)

The vote is stored in SQLite for fast retrieval:

```sql
INSERT INTO votes (user_id, proposal_id, vote_value, wallet_address, transaction_hash, block_number)
VALUES (?, ?, ?, ?, ?, ?);
```

---

## Transaction Verification

The API performs 7 verification checks before accepting a vote:

| Check | What It Verifies | Error If Failed |
|-------|------------------|-----------------|
| 1. Format | Transaction hash is valid format | Invalid hash format |
| 2. Existence | Transaction exists on blockchain | Transaction not found |
| 3. Status | Transaction was successful | Transaction failed |
| 4. Sender | tx.from matches claimed wallet | Sender mismatch |
| 5. Target | tx.to is the Ballot contract | Wrong contract |
| 6. Function | Calldata starts with vote() selector | Wrong function |
| 7. Parameters | Decoded proposalId and voteValue match | Parameter mismatch |

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

**Important:** The Hardhat node resets all blockchain state when restarted. You must redeploy contracts after each restart.

### Production (Ethereum/Polygon)

```
Configuration:
- RPC URL: https://polygon-rpc.com or Infura/Alchemy
- Chain ID: 137 (Polygon) or 1 (Mainnet)
- Block Time: ~2 seconds (Polygon)
- State: Permanent
- Gas: Real MATIC/ETH required
```

---

## Security Considerations

### Double Voting Prevention

Double voting is prevented at multiple layers:

1. **Smart Contract Layer**: Mapping prevents on-chain double votes
2. **Database Layer**: UNIQUE(proposal_id, user_id) constraint
3. **API Layer**: Pre-check before processing vote requests

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
- Cause: BALLOT_CONTRACT_ADDRESS not in .env
- Solution: Run deploy script and copy address to .env

**Problem:** "Contract function returned no data"
- Cause: Hardhat node was restarted, contracts no longer deployed
- Solution: Run deploy script again

### Useful Commands

Redeploy contracts:
```bash
cd blockchain-service && npx hardhat run scripts/deploy.js --network hardhatMainnet
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
| blockchain-service/contracts/Ballot.sol | Smart contract source |
| blockchain-service/api/routes/votes.js | Vote API endpoints |
| blockchain-service/config/blockchain.js | Contract address and ABI config |
| blockchain-service/database/db.js | SQLite database helper |
| blockchain-service/database/schema.sql | Database schema |
| blockchain-service/scripts/deploy.js | Contract deployment script |
| .env | Environment configuration |

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
