#!/bin/bash

# ============================================
# GLASSBALLOTS PLATFORM - SETUP SCRIPT
# ============================================
# One-Click Setup: Installs all dependencies and
# prepares the environment for production launch.
# 
# Run this ONCE after cloning the repository.
# ============================================

set -e  # Exit immediately on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================
# HELPER FUNCTIONS
# ============================================
print_header() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}[OK] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

print_info() {
    echo -e "${CYAN}[INFO] $1${NC}"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================
# STEP 1: CHECK PREREQUISITES
# ============================================
print_header "Step 1/6: Checking Prerequisites"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
    
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_success "Node.js $NODE_VERSION"
    else
        print_error "Node.js v18+ required (found $NODE_VERSION)"
        echo ""
        echo "Please upgrade Node.js:"
        echo "  - nvm: nvm install 18 && nvm use 18"
        echo "  - Homebrew: brew install node@18"
        echo "  - Download: https://nodejs.org/"
        exit 1
    fi
else
    print_error "Node.js not found!"
    echo ""
    echo "Please install Node.js v18+ from https://nodejs.org/"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    print_success "npm v$NPM_VERSION"
else
    print_error "npm not found!"
    exit 1
fi

# Check Python 3
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version)
    print_success "$PYTHON_VERSION"
else
    print_error "Python 3 not found!"
    echo ""
    echo "Please install Python 3.9+ from https://www.python.org/"
    exit 1
fi

# Check pip
if command_exists pip3; then
    PIP_CMD="pip3"
    print_success "pip3 available"
elif command_exists pip; then
    PIP_CMD="pip"
    print_success "pip available"
else
    print_error "pip not found!"
    echo "Please install pip for Python 3"
    exit 1
fi

# ============================================
# STEP 2: INSTALL BACKEND DEPENDENCIES
# ============================================
print_header "Step 2/6: Installing Backend Dependencies"

cd "$SCRIPT_DIR/blockchain-service"
print_info "Running npm install in blockchain-service/..."
npm install
print_success "Backend dependencies installed"

cd "$SCRIPT_DIR"

# ============================================
# STEP 3: INSTALL FRONTEND DEPENDENCIES
# ============================================
print_header "Step 3/6: Installing Frontend Dependencies"

cd "$SCRIPT_DIR/frontend"
print_info "Running npm install in frontend/..."
npm install
print_success "Frontend dependencies installed"

cd "$SCRIPT_DIR"

# ============================================
# STEP 4: SETUP AI SERVICE (Python venv)
# ============================================
print_header "Step 4/6: Setting Up AI Service"

cd "$SCRIPT_DIR/ai-service"

# Always use venv for consistency
if [ ! -d "venv" ]; then
    print_info "Creating Python virtual environment..."
    python3 -m venv venv
fi

print_info "Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
deactivate

print_success "AI Service dependencies installed (venv)"

cd "$SCRIPT_DIR"

# ============================================
# STEP 5: ENVIRONMENT CONFIGURATION
# ============================================
print_header "Step 5/6: Environment Configuration"

# Create runtime directories
mkdir -p logs
mkdir -p .pids
print_success "Created logs/ and .pids/ directories"

# Create .env from .env.example if it doesn't exist
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        print_success "Created .env from .env.example"
        echo ""
        print_warning "ACTION REQUIRED: Edit .env and add your OPENAI_API_KEY"
        print_info "Get your API key from: https://platform.openai.com/api-keys"
    else
        print_error ".env.example not found!"
        exit 1
    fi
else
    print_success ".env file already exists"
fi

# ============================================
# STEP 6: DATABASE INITIALIZATION
# ============================================
print_header "Step 6/6: Database Initialization"

# Database location: blockchain-service/database/glassballots.db
DB_DIR="$SCRIPT_DIR/blockchain-service/database"
DB_PATH="$DB_DIR/glassballots.db"
SCHEMA_PATH="$DB_DIR/schema.sql"

print_info "Database path: $DB_PATH"

# Ensure database directory exists
mkdir -p "$DB_DIR"

# Check if database already exists and has data
if [ -f "$DB_PATH" ]; then
    print_info "Database already exists, checking if seeding is needed..."
else
    print_info "Creating new database..."
fi

# Initialize schema and seed data using Node.js
cd "$SCRIPT_DIR/blockchain-service"

node -e "
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'glassballots.db');
const schemaPath = path.join(__dirname, 'database', 'schema.sql');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Read and execute schema
if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema, (err) => {
        if (err) {
            console.error('Schema error:', err.message);
            process.exit(1);
        }
        console.log('Database schema initialized successfully');
        
        // Check if proposals exist
        db.get('SELECT COUNT(*) as count FROM proposals', [], (err, row) => {
            if (err || !row || row.count === 0) {
                console.log('Database is empty, will seed on first run');
            } else {
                console.log('Database has ' + row.count + ' proposals');
            }
            db.close();
        });
    });
} else {
    console.error('Schema file not found:', schemaPath);
    process.exit(1);
}
"

if [ $? -eq 0 ]; then
    print_success "Database initialized at: $DB_PATH"
else
    print_warning "Database initialization deferred - will initialize on first run"
fi

# Seed proposals if needed
print_info "Checking proposal data..."
node database/seed_proposals.js 2>/dev/null && print_success "Proposals seeded" || print_info "Proposals will be seeded on first run"

cd "$SCRIPT_DIR"

# ============================================
# COMPILE SMART CONTRACTS
# ============================================
print_header "Compiling Smart Contracts"

cd "$SCRIPT_DIR/blockchain-service"
print_info "Compiling Solidity contracts..."
npx hardhat compile --quiet
print_success "Smart contracts compiled"

cd "$SCRIPT_DIR"

# ============================================
# SETUP COMPLETE
# ============================================
print_header "Setup Complete!"

echo ""
echo -e "${GREEN}GlassBallots is ready for launch!${NC}"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo ""
echo "  1. Configure your API key:"
echo -e "     ${YELLOW}nano .env${NC}  (add your OPENAI_API_KEY)"
echo ""
echo "  2. Start all services:"
echo -e "     ${YELLOW}./start_services.sh${NC}"
echo ""
echo "  3. Access the platform:"
echo -e "     Frontend:   ${GREEN}http://localhost:3000${NC}"
echo -e "     API:        ${GREEN}http://localhost:3001${NC}"
echo -e "     AI Service: ${GREEN}http://localhost:5001${NC}"
echo ""
print_success "Setup completed successfully!"
echo ""
