# GlassBallots

**AI-Enhanced Civic Engagement Platform**

A comprehensive platform combining AI-driven proposal analysis with blockchain-verified voting to revolutionize democratic decision-making in organizations.

---

## Overview

GlassBallots solves three critical problems in organizational governance:

1. **Accessibility**: AI-powered analysis transforms complex proposals into clear, unbiased summaries
2. **Transparency**: Blockchain voting provides immutable, verifiable records
3. **Trust**: Zero-knowledge proofs enable anonymous voting with mathematical proof of integrity

---

## Architecture

The platform is built as a microservices architecture with three core services:

```
                     FRONTEND (Port 3000)
                    React-based UI for proposal management and voting
                              |
                              v
                  BLOCKCHAIN SERVICE (Port 3001)
        Unified API for users, proposals, votes, and feedback
        - User Authentication & Management
        - Proposal CRUD operations
        - Smart Contract interactions (Ballot.sol, Feedback.sol)
        - SQLite database with encryption
                    /                   \
                   /                     \
          AI SERVICE              BLOCKCHAIN NETWORK
         (Port 5001)              Polygon/Hardhat
       OpenAI GPT-4o Analysis    - Ballot Smart Contract
       - Proposal Summarization  - Feedback Smart Contract
       - Bias Detection          - ZK-Proof Voting
       - Fairness Analysis
```

---

## Quick Start

### Prerequisites

- **Node.js** v18+ and npm
- **Python** 3.9+
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/vincent-24/GlassBallots.git
   cd GlassBallots
   ```

2. **Run the setup script**
   ```bash
   chmod +x setup_env.sh
   ./setup_env.sh
   ```

3. **Start all services**
   ```bash
   ./start_services.sh
   ```

---

## Project Structure

```
GlassBallots/
├── .env.example              # Environment configuration template
├── README.md                 # This file
├── setup_env.sh              # One-click setup script
├── start_services.sh         # Launch all services
│
├── ai-service/               # Python AI Microservice
│   ├── app.py                # Flask API server
│   ├── analyst.py            # Proposal analysis engine
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile            # Container definition
│
├── blockchain-service/       # Node.js Backend API
│   ├── api/                  # Express.js REST API
│   │   ├── server.js         # Main API server
│   │   └── routes/           # API route handlers
│   ├── contracts/            # Solidity smart contracts
│   │   ├── Ballot.sol        # Voting contract
│   │   └── Feedback.sol      # Feedback contract
│   ├── database/             # Database layer
│   │   ├── schema.sql        # Database schema
│   │   ├── db.js             # Database manager
│   │   └── migrations/       # Database migrations
│   ├── scripts/              # Deployment scripts
│   ├── test/                 # Smart contract tests
│   ├── hardhat.config.js     # Hardhat configuration
│   └── package.json          # Node.js dependencies
│
├── data/                     # Shared data files
│   └── proposals/            # Proposal JSON files for seeding
│
└── frontend/                 # Web Frontend
    ├── public/               # Static assets
    │   ├── styles.css        # Styling
    │   ├── script.js         # Utility functions
    │   ├── dashboard/        # Dashboard modules
    │   └── services/         # API client
    ├── views/                # HTML templates
    └── server.js             # Frontend server
```

---

## API Documentation

### Authentication

**POST** `/api/users/register`
```json
{
  "wallet_address": "0x1234...",
  "email": "user@example.com",
  "username": "john_doe",
  "password": "secure_password"
}
```

**POST** `/api/users/login`
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

### Proposals

**GET** `/api/proposals` - List all proposals

**GET** `/api/proposals/:id` - Get proposal details

**POST** `/api/proposals/create` - Create new proposal

### AI Analysis

**POST** `/api/analysis/analyze` - Analyze proposal for bias

**Response:**
```json
{
  "summary": "3-sentence summary",
  "loaded_language": ["word1", "word2"],
  "stakeholders": ["group1", "group2"],
  "equity_concerns": "Analysis of fairness issues",
  "objective_facts": ["fact1", "fact2"]
}
```

### Voting

**POST** `/api/votes/cast` - Cast a vote

**GET** `/api/votes/:proposalId/results` - Get voting results

### Feedback

**POST** `/api/feedback/submit` - Submit feedback

**GET** `/api/feedback/:proposalId` - Get feedback for proposal

---

## Testing

### Run Smart Contract Tests
```bash
cd blockchain-service
npx hardhat test
```

### Test Coverage
```bash
cd blockchain-service
npx hardhat coverage
```

---

## Acknowledgments

- **OpenAI** - GPT-4o API for proposal analysis
- **Hardhat** - Ethereum development environment
- **OpenZeppelin** - Secure smart contract libraries
- **Polygon** - Scalable blockchain infrastructure
