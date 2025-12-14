# GlassBallots System Architecture

A comprehensive technical overview of the GlassBallots platform, including system architecture, tech stack, blockchain integration, and AI implementation.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Tech Stack](#tech-stack)
4. [Service Architecture](#service-architecture)
5. [Blockchain Integration](#blockchain-integration)
6. [AI Integration](#ai-integration)
7. [Database Design](#database-design)
8. [Data Flow](#data-flow)
9. [Security Architecture](#security-architecture)

---

## System Overview

GlassBallots is an AI-enhanced civic engagement platform that combines:

- **AI-Powered Analysis**: Transforms complex proposals into unbiased, accessible summaries
- **Blockchain Voting**: Provides immutable, transparent, and verifiable voting records
- **Organizational Governance**: Enables structured decision-making within organizations

The platform follows a **microservices architecture** with three distinct services communicating via REST APIs.

---

## Architecture Diagram

```
USER INTERFACE (Browser - HTML/CSS/JavaScript)
                    |
    ----------------+----------------
    |               |               |
    v               v               v
FRONTEND        METAMASK            
(Port 3000)     (Wallet)            
Express.js      Transaction         
Static Files    Signing             
SPA Routing     Wallet Connect      
    |               |               
    |   REST API    |               
    v               |               
BLOCKCHAIN SERVICE (Port 3001)
Express.js REST API
- /users - User authentication
- /proposals - Proposal management
- /votes - Voting operations
- /feedback - Feedback collection
- /analysis - AI analysis caching
- /organizations - Organization management
    |                           |
    v                           v
SQLite DB                   Ethers.js
- Users                     (Blockchain Interface)
- Proposals                 Verification &
- Votes Cache               Contract Calls
- Organizations
- Feedback
                                |
                                v
                    ETHEREUM BLOCKCHAIN
                    (Hardhat Local / Polygon)
                    - Ballot.sol (Proposals, Votes)
                    - Feedback.sol (Ratings, Moderation)
                    Port 8545 (Dev)

AI SERVICE (Port 5001)
Flask REST API
- /analyze - Single proposal analysis
- /analyze/batch - Batch analysis
    |
    v
ProposalAnalyst Pipeline
- spaCy NLP (Text Processing)
- Regex Patterns (Loaded Language Detection)
- OpenAI GPT-4o (Equity Analysis, Fact Extraction, Neutral Summary)
```

---

## Tech Stack

### Frontend
| Technology | Purpose | Version |
|------------|---------|---------|
| HTML5/CSS3 | Page structure and styling | - |
| Vanilla JavaScript | Client-side logic, DOM manipulation | ES6+ |
| Express.js | Static file serving and routing | 4.x |

### Backend (Blockchain Service)
| Technology | Purpose | Version |
|------------|---------|---------|
| Node.js | Runtime environment | 18+ |
| Express.js | REST API framework | 4.x |
| SQLite3 | Database (via better-sqlite3) | 3.x |
| Ethers.js | Ethereum blockchain interaction | 6.x |
| bcrypt | Password hashing | 5.x |
| dotenv | Environment configuration | 16.x |
| cors | Cross-origin resource sharing | 2.x |

### AI Service
| Technology | Purpose | Version |
|------------|---------|---------|
| Python | Runtime environment | 3.9+ |
| Flask | REST API framework | 2.x |
| spaCy | Natural language processing | 3.x |
| OpenAI SDK | GPT-4o API integration | 1.x |
| Flask-CORS | Cross-origin support | 4.x |

### Blockchain
| Technology | Purpose | Version |
|------------|---------|---------|
| Solidity | Smart contract language | 0.8.28 |
| Hardhat | Development environment | 3.x |
| OpenZeppelin | Secure contract libraries | 5.x |
| Ethereum/Polygon | Blockchain network | - |

### Development Tools
| Tool | Purpose |
|------|---------|
| TypeScript | Type-safe contract testing |
| Mocha/Chai | Testing framework |
| Docker | Containerization |
| Git | Version control |

---

## Service Architecture

### 1. Frontend Service (Port 3000)

**Purpose**: Serves the user interface and handles client-side routing.

**Responsibilities**:
- Serve static HTML, CSS, and JavaScript files
- Client-side SPA routing for dashboard views
- Make API calls to the Blockchain Service
- Interact with MetaMask for wallet operations

**Key Files**:
```
frontend/
├── server.js                    # Express server
├── public/
│   ├── script.js               # Landing page logic
│   ├── signup.js               # Registration logic
│   ├── styles.css              # Global styles
│   ├── services/api.js         # API client wrapper
│   └── dashboard/
│       ├── dashboard-core.js       # Main dashboard logic
│       ├── dashboard-proposals.js  # Proposal management
│       ├── dashboard-organizations.js # Org management
│       └── dashboard-profile.js    # User profile
└── views/
    ├── index.html              # Landing/login page
    ├── signup.html             # Registration page
    ├── dashboard.html          # Main dashboard SPA
    └── proposal.html           # Individual proposal view
```

### 2. Blockchain Service (Port 3001)

**Purpose**: Central API handling users, proposals, votes, and blockchain interactions.

**Responsibilities**:
- User authentication and session management
- Proposal CRUD operations
- Vote recording and verification
- Blockchain transaction verification
- Database operations
- AI service proxy

**API Routes**:
| Route | Description |
|-------|-------------|
| /api/users | User registration, login, profile management |
| /api/proposals | Create, read, update proposals |
| /api/votes | Cast votes, get results, verify transactions |
| /api/feedback | Submit and retrieve feedback |
| /api/analysis | Proxy to AI service, cache results |
| /api/organizations | Org creation, membership, management |

**Key Files**:
```
blockchain-service/
├── api/
│   ├── server.js              # Express API server
│   └── routes/
│       ├── users.js           # User endpoints
│       ├── proposals.js       # Proposal endpoints
│       ├── votes.js           # Voting endpoints
│       ├── feedback.js        # Feedback endpoints
│       ├── analysis.js        # AI proxy endpoints
│       └── organizations.js   # Organization endpoints
├── database/
│   ├── db.js                  # Database manager class
│   └── schema.sql             # Full database schema
├── config/
│   └── blockchain.js          # Contract addresses & ABIs
├── contracts/
│   ├── Ballot.sol             # Voting smart contract
│   └── Feedback.sol           # Feedback smart contract
└── utils/
    └── security.js            # Encryption, sanitization
```

### 3. AI Service (Port 5001)

**Purpose**: Analyzes proposals for bias and generates neutral summaries.

**Responsibilities**:
- Accept proposal text via REST API
- Detect loaded/biased language
- Identify stakeholder groups
- Generate equity concern questions
- Extract objective facts
- Produce neutral summaries

**Key Files**:
```
ai-service/
├── app.py                     # Flask API server
├── analyst.py                 # ProposalAnalyst class
├── requirements.txt           # Python dependencies
└── Dockerfile                 # Container definition
```

---

## Blockchain Integration

### Overview

GlassBallots uses a **hybrid blockchain-database architecture**:

- **Blockchain**: Immutable source of truth for all votes
- **Database**: Fast read cache for UI performance and analytics

### Smart Contracts

#### Ballot.sol

The primary voting contract built with OpenZeppelin's AccessControl.

**Features**:
- Role-based access (Admin, Council, Voters)
- Proposal creation with metadata
- Yes/No voting with double-vote prevention
- Time-bounded voting periods
- Event emission for transparency

**Key Functions**:
```solidity
// Create a new proposal (Council/Admin only)
function createProposal(...) external returns (uint256 id);

// Cast a vote (any address)
function vote(uint256 id, bool supportYes) external;

// Close voting (Council/Admin only)
function close(uint256 id) external;

// Read proposal data (public)
function getProposal(uint256 id) external view returns (...);

// Check if address voted (public)
function hasVoted(uint256 id, address account) external view returns (bool);
```

#### Feedback.sol

Collects student feedback on proposals with moderation capabilities.

**Features**:
- Student registration and role management
- 1-5 rating system with categories
- Anonymous feedback option
- Moderator controls (ban, hide content)
- Bulk student registration

### Vote Flow

```
1. User clicks "Vote" in UI
2. MetaMask popup - User signs transaction
3. Transaction sent to Ballot.sol on blockchain
4. Transaction mined - txHash returned
5. Frontend sends txHash to /api/votes/cast
6. API verifies transaction on blockchain:
   - tx exists?
   - tx.from matches wallet?
   - tx.to is Ballot contract?
   - tx called vote() function?
   - Parameters match claimed vote?
7. If valid - Vote cached in SQLite database
8. Vote tallies auto-updated via database trigger
```

### Verification Checks

The API performs 7 security checks before accepting a vote:

| # | Check | What It Verifies |
|---|-------|------------------|
| 1 | Format | Transaction hash is valid 66-character hex |
| 2 | Existence | Transaction exists on blockchain |
| 3 | Status | Transaction succeeded (not reverted) |
| 4 | Sender | tx.from matches claimed wallet address |
| 5 | Target | tx.to is the Ballot contract address |
| 6 | Function | Calldata matches vote() function selector |
| 7 | Parameters | Decoded proposalId and voteValue match request |

### Double-Vote Prevention

Triple-layer protection:

1. **Smart Contract Layer**: mapping prevents on-chain double votes
2. **Database Layer**: UNIQUE(proposal_id, user_id) constraint
3. **API Layer**: Pre-check before processing vote requests

---

## AI Integration

### Overview

The AI service uses a multi-step analysis pipeline combining:
- **spaCy**: Natural language processing
- **Regex Patterns**: Loaded language and stakeholder detection
- **OpenAI GPT-4o**: Deep analysis and summarization

### Analysis Pipeline

```
Input: Proposal Text
         |
         v
STEP 1: Loaded Language Detection (Regex)
Searches for bias indicators:
- "disastrous", "unprecedented", "clearly", "obviously"
- "everyone knows", "without a doubt", "perfect"
Output: List of flagged words/phrases
         |
         v
STEP 2: Stakeholder Identification (Regex)
Searches for affected groups:
- "commuter students", "international students"
- "adjunct faculty", "graduate students"
Output: List of mentioned stakeholder groups
         |
         v
STEP 3: Equity Concerns Analysis (OpenAI GPT-4o)
Identifies:
- Groups disproportionately affected but not mentioned
- Access or resource disparities created
- Questions for decision-makers to ensure fairness
Output: 3-5 specific equity questions/concerns
         |
         v
STEP 4: Objective Fact Extraction (OpenAI GPT-4o)
Extracts ONLY objective, verifiable facts.
IGNORES: persuasive language, opinions, predictions
Output: Structured JSON with facts
         |
         v
STEP 5: Neutral Summary Generation (OpenAI GPT-4o)
Input: Only the JSON facts from Step 4
Generates 3-5 sentence summary that:
- Uses neutral, factual language
- Avoids persuasive/emotional language
- Is accessible to general audience
Output: Plain-language neutral summary
         |
         v
Final Analysis Output
```

### API Response Format

```json
{
  "success": true,
  "summary": "Neutral 3-5 sentence summary...",
  "loaded_language": ["obviously", "unprecedented"],
  "stakeholders": ["graduate students", "international students"],
  "equity_concerns": [
    "How will this affect commuter students?",
    "What accommodations are provided for disabled students?",
    "Will low-income students face additional financial burden?"
  ],
  "objective_facts": {
    "main_objective": "Increase student engagement",
    "key_actions": ["Create event calendar", "Allocate funding"],
    "cost": "$50,000 annual budget",
    "timeline": "Implementation Fall 2026"
  }
}
```

### Per-User Analysis Caching

Analysis results are cached per-user in the database, allowing:
- Fast retrieval without re-calling OpenAI
- Users can regenerate analysis if needed
- Different users can have slightly different cached results

---

## Database Design

### Entity Relationship Overview

```
users ----+---- organizations -------- proposals
  |       |         |                      |
  |       |         |                      |
  v       |         v                      v
sessions  |    memberships              votes
  |       |                                |
  |       |                                |
  v       |                                v
profiles  |                          vote_tallies
          |
          +---- feedback -------- petitions
                                      |
                                      |
                                      v
                                  audit_log
```

### Key Tables

| Table | Purpose |
|-------|---------|
| users | User accounts with encrypted credentials |
| user_profiles | Encrypted personal data (name, student ID) |
| user_sessions | Session tokens for authentication |
| organizations | Groups with unique join codes |
| organization_memberships | User-org relationships with roles |
| proposals | Governance proposals with metadata |
| votes | Vote records with blockchain tx hashes |
| vote_tallies | Cached vote counts (auto-updated via trigger) |
| feedback | Student feedback on proposals |
| petitions | User-submitted proposal modification requests |
| user_proposal_analyses | Per-user AI analysis cache |
| audit_log | Activity tracking |

---

## Data Flow

### User Registration Flow
```
Browser -> POST /api/users/register -> Hash password (bcrypt)
                                    -> Generate wallet address
                                    -> Generate unique ID (#XXXXXXX)
                                    -> Encrypt email
                                    -> Store in database
                                    -> Create session token
                                    -> Return session to browser
```

### Proposal Analysis Flow
```
Dashboard -> Click "Analyze" -> API /api/analysis/analyze
                             -> Check cache (user_proposal_analyses)
                             -> If cached, return cached result
                             -> If not, call AI Service /analyze
                             -> AI runs 5-step pipeline
                             -> Return analysis to API
                             -> Cache result in database
                             -> Return to Dashboard
```

### Vote Casting Flow (Blockchain)
```
Dashboard -> Click "Vote Yes/No" -> MetaMask signs transaction
                                 -> Transaction sent to Ballot.sol
                                 -> Wait for confirmation
                                 -> POST /api/votes/cast with txHash
                                 -> API verifies tx on blockchain
                                 -> If valid, store in database
                                 -> Trigger updates vote_tallies
                                 -> Return updated counts to UI
```

---

## Security Architecture

### Authentication
- **Password Storage**: bcrypt with 12 salt rounds
- **Sessions**: Cryptographically random 32-byte tokens
- **Session Expiry**: 7 days
- **Email Encryption**: AES-256-GCM for PII

### Input Validation
- **Sanitization Middleware**: Applied to all API routes
- **SQL Injection**: Parameterized queries throughout
- **XSS Prevention**: Output encoding in frontend

### Blockchain Security
- **Smart Contract Auditing**: OpenZeppelin base contracts
- **Access Control**: Role-based (Admin, Council, Student, Moderator)
- **Transaction Verification**: 7-check verification before accepting votes

### Environment Security
- **Secrets**: Stored in .env (never committed)
- **API Keys**: OpenAI key server-side only
- **CORS**: Configured for specific origins
