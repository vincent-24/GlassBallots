# GlassBallots Platform

**Aequitas** - AI-Enhanced Civic Engagement Platform

A comprehensive platform combining AI-driven proposal analysis with blockchain-verified voting to revolutionize democratic decision-making in organizations.

---

## Overview

GlassBallots (Aequitas) solves three critical problems in organizational governance:

1. **Accessibility**: AI-powered analysis transforms complex proposals into clear, unbiased summaries
2. **Transparency**: Blockchain voting provides immutable, verifiable records
3. **Trust**: Zero-knowledge proofs enable anonymous voting with mathematical proof of integrity

---

## 🏗️ Architecture

The platform is built as a microservices architecture with three core services:

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Port 3000)                      │
│  React-based UI for proposal management and voting           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              BLOCKCHAIN SERVICE (Port 3001)                 │
│  Unified API for users, proposals, votes, and feedback      │
│  • User Authentication & Management                         │
│  • Proposal CRUD operations                                 │
│  • Smart Contract interactions (Ballot.sol, Feedback.sol)   │
│  • SQLite database with encryption                          │
└────────────┬───────────────────────────┬────────────────────┘
             │                           │
             ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│  AI SERVICE (Port 5000)  │  │   BLOCKCHAIN NETWORK         │
│  OpenAI GPT-4o Analysis  │  │   Polygon/Hardhat            │
│  • Proposal Summarization│  │   • Ballot Smart Contract    │
│  • Bias Detection        │  │   • Feedback Smart Contract  │
│  • Fairness Analysis     │  │   • ZK-Proof Voting          │
└──────────────────────────┘  └──────────────────────────────┘
```

---

## Project Structure

```
glass-ballots/
├── .env.example                    # Environment configuration template
├── README.md                       # This file
├── setup_env.sh                    # One-click setup script
├── start_services.sh               # Launch all services
├── docker-compose.yml              # Docker orchestration
│
├── ai-service/                     # Python AI Microservice
│   ├── app.py                      # Flask API server
│   ├── analyst.py                  # Proposal analysis engine
│   ├── requirements.txt            # Python dependencies
│   └── Dockerfile                  # Container definition
│
├── blockchain-service/             # Node.js Backend API
│   ├── api/                        # Express.js REST API
│   │   ├── server.js               # Main API server
│   │   └── routes/                 # API route handlers
│   │       ├── users.js            # User authentication
│   │       ├── proposals.js        # Proposal management
│   │       ├── votes.js            # Voting operations
│   │       ├── feedback.js         # Feedback collection
│   │       └── analysis.js         # AI analysis caching
│   ├── contracts/                  # Solidity smart contracts
│   │   ├── Ballot.sol              # Voting contract
│   │   └── Feedback.sol            # Feedback contract
│   ├── database/                   # Database layer
│   │   ├── schema.sql              # Database schema
│   │   ├── db.js                   # Database manager
│   │   ├── glassballots.db         # SQLite database
│   │   ├── seed_proposals.js       # Seed script
│   │   └── migrations/             # Database migrations
│   │       └── 001_seed_proposals.js
│   ├── scripts/                    # Deployment scripts
│   │   └── deploy.js               # Contract deployment
│   ├── test/                       # Smart contract tests
│   ├── hardhat.config.js           # Hardhat configuration
│   └── package.json                # Node.js dependencies
│
├── data/                           # Shared data files
│   └── proposals/                  # Proposal JSON files
│       ├── 1.json                  # Proposal data
│       ├── 2.json
│       └── ...
│
└── frontend/                       # Web Frontend
    ├── public/                     # Static assets
    │   ├── styles.css              # Styling
    │   ├── dashboard.js            # Main application logic
    │   ├── script.js               # Utility functions
    │   └── signup.js               # Signup logic
    ├── views/                      # HTML templates
    │   ├── index.html              # Landing page
    │   ├── login.html              # Login page
    │   ├── signup.html             # Signup page
    │   ├── dashboard.html          # Main dashboard
    │   └── proposal.html           # Proposal detail view
    ├── server.js                   # Frontend server
    └── package.json                # Frontend dependencies
```

---

## Quick Start

### Prerequisites

- **Node.js** v18+ and npm
- **Python** 3.9+ (Anaconda/Miniconda recommended)
- **Git**
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/CS4800-SCRUMBAGS/GlassBallots.git
   cd GlassBallots
   ```

2. **Run the setup script**
   ```bash
   chmod +x setup_env.sh
   ./setup_env.sh
   ```

   This will:
   - Install all Node.js dependencies
   - Create a Python virtual environment
   - Install Python packages
   - Copy `.env.example` to `.env`
   - Initialize the database
   - Deploy smart contracts to local Hardhat network

3. **Configure environment variables**
   ```bash
   nano .env
   # Add your OPENAI_API_KEY
   ```

4. **Start all services**
   ```bash
   chmod +x start_services.sh
   ./start_services.sh
   ```

5. **Access the platform**
   - Frontend: http://localhost:3000
   - API: http://localhost:3001
   - AI Service: http://localhost:5000

---

## Manual Setup (Alternative)

If you prefer to set up services individually:

### 1. AI Service
```bash
cd ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### 2. Blockchain Service
```bash
cd blockchain-service
npm install
npx hardhat node  # In separate terminal
npx hardhat run scripts/deploy.js --network hardhatMainnet
node api/server.js
```

### 3. Frontend
```bash
cd frontend
npm install
node server.js
```

---

## 📚 API Documentation

### Authentication Endpoints

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

### Proposal Endpoints

**GET** `/api/proposals` - List all proposals

**GET** `/api/proposals/:id` - Get proposal details

**POST** `/api/proposals/create` - Create new proposal
```json
{
  "title": "Proposal Title",
  "original_text": "Full proposal text...",
  "creator": "Student Council",
  "authorized_by": "Board of Trustees",
  "decision_date": "2026-04-01"
}
```

### AI Analysis Endpoint

**POST** `/api/ai/analyze` - Analyze proposal
```json
{
  "text": "Proposal text to analyze..."
}
```

**Response:**
```json
{
  "summary": "3-sentence summary",
  "loaded_language": ["word1", "word2"],
  "stakeholders": ["group1", "group2"],
  "equity_concerns": "Analysis of fairness issues",
  "objective_facts": ["fact1", "fact2"],
  "neutral_summary": "Unbiased summary based on facts"
}
```

### Voting Endpoints

**POST** `/api/vote` - Cast a vote
```json
{
  "proposal_id": 1,
  "support_yes": true,
  "voter_address": "0x1234..."
}
```

**GET** `/api/proposals/:id/results` - Get voting results

### Feedback Endpoints

**POST** `/api/feedback` - Submit feedback
```json
{
  "proposal_id": 1,
  "rating": 4,
  "comment": "Great proposal!",
  "category": "academic",
  "is_anonymous": false
}
```

---

## 🧪 Testing

### Run Smart Contract Tests
```bash
cd blockchain-service
npx hardhat test
```

### Run Integration Tests
```bash
npm run test:integration
```

### Test Coverage
```bash
npx hardhat coverage
```

---

## 🐳 Docker Deployment

For production deployment with Docker:

```bash
docker-compose up -d
```

This will start all services in containers with proper networking and volume mounts.

---

## Security Considerations

1. **Never commit `.env` file** - Contains sensitive API keys
2. **Use strong encryption keys** - Generate with `openssl rand -hex 32`
3. **Rotate JWT secrets** - In production, rotate regularly
4. **Use HTTPS in production** - Set up reverse proxy (Nginx/Caddy)
5. **Audit smart contracts** - Before mainnet deployment
6. **Rate limiting** - Implement API rate limiting for production

---

## 🛠️ Development

### Adding New Features

1. Create a feature branch
   ```bash
   git checkout -b feature/new-feature
   ```

2. Make changes and test locally

3. Run linting
   ```bash
   npm run lint
   ```

4. Commit and push
   ```bash
   git commit -m "Add new feature"
   git push origin feature/new-feature
   ```

5. Create a Pull Request

### Database Migrations

To create a new migration:

```bash
cd blockchain-service/database/migrations
# Create new file: XXX_migration_name.js
node XXX_migration_name.js
```

---

## Monitoring & Logging

Logs are stored in:
- AI Service: `ai-service/logs/`
- Blockchain Service: `blockchain-service/logs/`
- Frontend: `frontend/logs/`

View real-time logs:
```bash
tail -f blockchain-service/logs/api.log
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/CS4800-SCRUMBAGS/GlassBallots/issues)
- **Email**: support@glassballots.com

---

## 🙏 Acknowledgments

- **OpenAI** - GPT-4o API for proposal analysis
- **Hardhat** - Ethereum development environment
- **OpenZeppelin** - Secure smart contract libraries
- **Polygon** - Scalable blockchain infrastructure

---

**Built with ❤️ by the CS4800 SCRUMBAGS Team**
