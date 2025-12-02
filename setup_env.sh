#!/bin/bash

# ============================================
# GLASSBALLOTS PLATFORM - SETUP SCRIPT
# ============================================
# One-click setup for development environment
# Windows/Linux Compatible Version
# ============================================

set -e  # Exit on error

# Detect if running on Windows (Git Bash, WSL, etc.)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    IS_WINDOWS=true
else
    IS_WINDOWS=false
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

print_info() {
    echo -e "${BLUE}$1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================
# PREREQUISITE CHECKS
# ============================================
print_header "Checking Prerequisites"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node -v)
    print_success "Node.js installed: $NODE_VERSION"
    
    # Check version (require v22+ for Hardhat 3)
    NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 22 ]; then
        print_error "Node.js version 22+ required for Hardhat 3 (found v$NODE_MAJOR)"
        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}  Please upgrade Node.js before continuing${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo -e "${BLUE}Option 1: Using Homebrew (Recommended)${NC}"
        echo -e "  ${GREEN}brew install node@22${NC}"
        echo -e "  ${GREEN}brew link node@22${NC}"
        echo ""
        echo -e "${BLUE}Option 2: Using nvm${NC}"
        echo -e "  ${GREEN}nvm install 22${NC}"
        echo -e "  ${GREEN}nvm use 22${NC}"
        echo -e "  ${GREEN}nvm alias default 22${NC}"
        echo ""
        echo -e "${BLUE}Option 3: Download from nodejs.org${NC}"
        echo -e "  ${GREEN}https://nodejs.org/ ${NC}(download 22.x LTS)"
        echo ""
        echo -e "${YELLOW}After upgrading, close this terminal, open a new one, and run:${NC}"
        echo -e "  ${GREEN}./setup_env.sh${NC}"
        echo ""
        exit 1
    fi
else
    print_error "Node.js not found. Please install Node.js v22+ from https://nodejs.org/"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    print_success "npm installed: v$NPM_VERSION"
else
    print_error "npm not found"
    exit 1
fi

# Check Python
if [ "$IS_WINDOWS" = true ]; then
        
    if command_exists python; then
        PYTHON_VERSION=$(python --version)
        print_success "Python installed: $PYTHON_VERSION"
    else
        print_error "Python 3 not found. Please install Python 3.9+ from https://www.python.org/"
        exit 1
    fi
else
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version)
        print_success "Python installed: $PYTHON_VERSION"
    else
        print_error "Python 3 not found. Please install Python 3.9+ from https://www.python.org/"
        exit 1
    fi
fi

# Check for conda (recommended but not required)
if command_exists conda; then
    CONDA_VERSION=$(conda --version)
    print_success "Conda installed: $CONDA_VERSION"
    USE_CONDA=true
else
    print_warning "Conda not found. Will use venv instead (recommended: install Anaconda/Miniconda)"
    USE_CONDA=false
fi

# Check Git
if command_exists git; then
    print_success "Git installed"
else
    print_warning "Git not found (optional)"
fi

# ============================================
# ENVIRONMENT CONFIGURATION
# ============================================
print_header "Configuring Environment"

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    print_info "Creating .env from .env.example..."
    cp .env.example .env
    print_success ".env file created"
    print_warning "IMPORTANT: Edit .env and add your OPENAI_API_KEY!"
    print_info "Get your API key from: https://platform.openai.com/api-keys"
else
    print_success ".env file already exists"
fi

# ============================================
# AI SERVICE SETUP
# ============================================
print_header "Setting Up AI Service (Python)"

cd ai-service

if [ "$USE_CONDA" = true ]; then
    print_info "Creating conda environment: ai_env..."
    
    # Check if environment already exists
    if conda env list | grep -q "ai_env"; then
        print_warning "Conda environment 'ai_env' already exists. Updating packages..."
        # Use conda run instead of activate in scripts
        conda run -n ai_env pip install -r requirements.txt --upgrade
    else
        conda create -n ai_env python=3.11 -y
        print_success "Conda environment created"
        
        print_info "Installing Python packages..."
        conda run -n ai_env pip install -r requirements.txt
    fi
    
    print_success "AI Service dependencies installed"
else
    print_info "Creating Python virtual environment..."
    
    if [ ! -d "venv" ]; then
        python -m venv venv
        print_success "Virtual environment created"
    else
        print_warning "Virtual environment already exists"
    fi
    
    print_info "Installing Python packages..."
    
    # Handle Windows bash vs Unix bash
    if [ "$IS_WINDOWS" = true ]; then
        source venv/Scripts/activate
        python -m pip install --upgrade pip
    else
        source venv/bin/activate
        pip install --upgrade pip
    fi
    
    
    pip install -r requirements.txt
    deactivate
    print_success "AI Service dependencies installed"
fi

cd ..

# ============================================
# BLOCKCHAIN SERVICE SETUP
# ============================================
print_header "Setting Up Blockchain Service (Node.js)"

cd blockchain-service

print_info "Installing Node.js dependencies..."
npm install

print_success "Blockchain Service dependencies installed"

# Initialize database
print_info "Initializing database..."
if [ -f "database/db.js" ]; then
    node -e "
    const db = require('./database/db.js');
    console.log('Database initialized successfully');
    process.exit(0);
    " 2>/dev/null || print_warning "Database initialization will occur on first run"
fi

print_success "Blockchain Service setup complete"

cd ..

# ============================================
# FRONTEND SETUP
# ============================================
print_header "Setting Up Frontend"

cd frontend

print_info "Installing Node.js dependencies..."
npm install

print_success "Frontend dependencies installed"

cd ..

# ============================================
# SMART CONTRACT COMPILATION
# ============================================
print_header "Compiling Smart Contracts"

cd blockchain-service

print_info "Compiling contracts with Hardhat..."
npx hardhat compile

print_success "Smart contracts compiled"

cd ..

# ============================================
# DATABASE INITIALIZATION
# ============================================
print_header "Initializing Database"

print_info "Creating database schema..."

cd blockchain-service

# Run schema creation
node -e "
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || './database/glassballots.db';
const schemaPath = './database/schema.sql';

// Create database directory if it doesn't exist
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Read and execute schema
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema, (err) => {
    if (err) {
        console.error('Error creating schema:', err);
        process.exit(1);
    }
    console.log('Database schema created successfully');
    db.close();
    process.exit(0);
});
" 2>/dev/null && print_success "Database initialized" || print_warning "Database will be initialized on first run"

cd ..

# ============================================
# DEPLOYMENT INSTRUCTIONS
# ============================================
print_header "Setup Complete!"

echo ""
print_success "GlassBallots platform is ready for development!"
echo ""
print_info "Next steps:"
echo ""
echo "  1. Edit .env and add your OPENAI_API_KEY"
echo "     ${YELLOW}nano .env${NC}"
echo ""
echo "  2. Start all services:"
echo "     ${YELLOW}./start_services.sh${NC}"
echo ""
echo "  3. Access the platform:"
echo "     • Frontend:  ${GREEN}http://localhost:3000${NC}"
echo "     • API:       ${GREEN}http://localhost:3001${NC}"
echo "     • AI Service: ${GREEN}http://localhost:5000${NC}"
echo ""

if [ "$USE_CONDA" = true ]; then
    print_info "To activate AI service environment:"
    echo "     ${YELLOW}conda activate ai_env${NC}"
else
    print_info "To activate AI service environment:"
    if [ "$IS_WINDOWS" = true ]; then
        echo "     ${YELLOW}cd ai-service && source venv/Scripts/activate${NC}"
    else
        echo "     ${YELLOW}cd ai-service && source venv/bin/activate${NC}"
    fi
fi

echo ""
print_info "For manual service management, see README.md"
echo ""

# ============================================
# OPTIONAL: RUN TESTS
# ============================================
echo ""
read -p "Would you like to run tests now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_header "Running Tests"
    
    cd blockchain-service
    print_info "Running smart contract tests..."
    npx hardhat test
    cd ..
    
    print_success "All tests passed!"
fi

echo ""
print_success "Setup script completed successfully!"
echo ""
