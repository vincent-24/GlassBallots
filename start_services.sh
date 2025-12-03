#!/bin/bash

# ============================================
# GLASSBALLOTS PLATFORM - START SERVICES
# ============================================
# Launches all microservices for production
# 
# PREREQUISITE: Run ./setup_env.sh first!
# ============================================

set -e  # Exit on error

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

# PID file location
PID_DIR="$SCRIPT_DIR/.pids"
mkdir -p "$PID_DIR"

# Logs directory
LOGS_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOGS_DIR"

# Helper functions
print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
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

# ============================================
# PREREQUISITE CHECK - setup_env.sh must have run
# ============================================
print_header "Checking Prerequisites"

# Check if blockchain-service/node_modules exists
if [ ! -d "$SCRIPT_DIR/blockchain-service/node_modules" ]; then
    print_error "Dependencies not installed!"
    echo ""
    echo -e "${YELLOW}The blockchain-service/node_modules directory is missing.${NC}"
    echo -e "${YELLOW}Please run the setup script first:${NC}"
    echo ""
    echo -e "    ${GREEN}./setup_env.sh${NC}"
    echo ""
    exit 1
fi

# Check if frontend/node_modules exists
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    print_error "Dependencies not installed!"
    echo ""
    echo -e "${YELLOW}The frontend/node_modules directory is missing.${NC}"
    echo -e "${YELLOW}Please run the setup script first:${NC}"
    echo ""
    echo -e "    ${GREEN}./setup_env.sh${NC}"
    echo ""
    exit 1
fi

# Check if ai-service/venv exists
if [ ! -d "$SCRIPT_DIR/ai-service/venv" ]; then
    print_error "Python environment not configured!"
    echo ""
    echo -e "${YELLOW}The ai-service/venv directory is missing.${NC}"
    echo -e "${YELLOW}Please run the setup script first:${NC}"
    echo ""
    echo -e "    ${GREEN}./setup_env.sh${NC}"
    echo ""
    exit 1
fi

print_success "All dependencies are installed"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
    print_success "Environment variables loaded"
else
    print_error ".env file not found!"
    echo ""
    echo -e "${YELLOW}Please run the setup script first:${NC}"
    echo ""
    echo -e "    ${GREEN}./setup_env.sh${NC}"
    echo ""
    exit 1
fi

# Check OPENAI_API_KEY
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    print_error "OPENAI_API_KEY not configured!"
    echo ""
    echo -e "${YELLOW}Please edit .env and add your OpenAI API key:${NC}"
    echo ""
    echo -e "    ${GREEN}nano .env${NC}"
    echo ""
    print_info "Get your API key from: https://platform.openai.com/api-keys"
    exit 1
fi

print_success "OpenAI API key configured"

# Set default ports
FRONTEND_PORT=${FRONTEND_PORT:-3000}
API_PORT=${API_PORT:-3001}
AI_SERVICE_PORT=${AI_SERVICE_PORT:-5001}

# Check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Kill process on port
kill_port() {
    if check_port $1; then
        print_warning "Port $1 is in use. Killing existing process..."
        lsof -ti:$1 | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# ============================================
# CLEANUP FUNCTION
# ============================================
cleanup() {
    print_header "Stopping Services"
    
    # Kill all background processes
    if [ -f "$PID_DIR/hardhat.pid" ]; then
        kill $(cat "$PID_DIR/hardhat.pid") 2>/dev/null || true
        rm "$PID_DIR/hardhat.pid"
        print_success "Hardhat node stopped"
    fi
    
    if [ -f "$PID_DIR/ai.pid" ]; then
        kill $(cat "$PID_DIR/ai.pid") 2>/dev/null || true
        rm "$PID_DIR/ai.pid"
        print_success "AI service stopped"
    fi
    
    if [ -f "$PID_DIR/api.pid" ]; then
        kill $(cat "$PID_DIR/api.pid") 2>/dev/null || true
        rm "$PID_DIR/api.pid"
        print_success "Blockchain service stopped"
    fi
    
    if [ -f "$PID_DIR/frontend.pid" ]; then
        kill $(cat "$PID_DIR/frontend.pid") 2>/dev/null || true
        rm "$PID_DIR/frontend.pid"
        print_success "Frontend stopped"
    fi
    
    echo ""
    print_info "All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# ============================================
# START HARDHAT NODE (Port 8545)
# ============================================
print_header "Starting Hardhat Node"

kill_port 8545

cd "$SCRIPT_DIR/blockchain-service"

print_info "Launching local Ethereum node..."
# Use local npx from node_modules
./node_modules/.bin/hardhat node > "$LOGS_DIR/hardhat.log" 2>&1 &
HARDHAT_PID=$!
echo $HARDHAT_PID > "$PID_DIR/hardhat.pid"

# Wait for Hardhat to start
sleep 3

if ps -p $HARDHAT_PID > /dev/null; then
    print_success "Hardhat node running on http://127.0.0.1:8545 (PID: $HARDHAT_PID)"
else
    print_error "Failed to start Hardhat node"
    cat "$LOGS_DIR/hardhat.log"
    exit 1
fi

# ============================================
# DEPLOY SMART CONTRACTS
# ============================================
print_info "Deploying smart contracts..."
sleep 2  # Wait for node to be fully ready

./node_modules/.bin/hardhat run scripts/deploy.js --network hardhatMainnet > "$LOGS_DIR/deploy.log" 2>&1

if [ $? -eq 0 ]; then
    print_success "Smart contracts deployed"
else
    print_error "Failed to deploy contracts. Check logs/deploy.log"
    cat "$LOGS_DIR/deploy.log"
    cleanup
fi

cd "$SCRIPT_DIR"

# ============================================
# START AI SERVICE (Port 5001)
# ============================================
print_header "Starting AI Service"

kill_port $AI_SERVICE_PORT

cd "$SCRIPT_DIR/ai-service"

print_info "Activating Python virtual environment..."
source venv/bin/activate
python app.py > "$LOGS_DIR/ai-service.log" 2>&1 &
AI_PID=$!
echo $AI_PID > "$PID_DIR/ai.pid"

# Wait for AI service to start
sleep 3

if ps -p $AI_PID > /dev/null; then
    print_success "AI Service running on http://localhost:$AI_SERVICE_PORT (PID: $AI_PID)"
else
    print_error "Failed to start AI service"
    cat "$LOGS_DIR/ai-service.log"
    cleanup
fi

cd "$SCRIPT_DIR"

# ============================================
# START BLOCKCHAIN SERVICE API (Port 3001)
# ============================================
print_header "Starting Blockchain Service API"

kill_port $API_PORT

cd "$SCRIPT_DIR/blockchain-service"

print_info "Launching Express API server..."
node api/server.js > "$LOGS_DIR/blockchain-api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$PID_DIR/api.pid"

# Wait for API to start
sleep 2

if ps -p $API_PID > /dev/null; then
    print_success "Blockchain API running on http://localhost:$API_PORT (PID: $API_PID)"
else
    print_error "Failed to start Blockchain API"
    cat "$LOGS_DIR/blockchain-api.log"
    cleanup
fi

cd "$SCRIPT_DIR"

# ============================================
# START FRONTEND (Port 3000)
# ============================================
print_header "Starting Frontend"

kill_port $FRONTEND_PORT

cd "$SCRIPT_DIR/frontend"

print_info "Launching frontend server..."
node server.js > "$LOGS_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PID_DIR/frontend.pid"

# Wait for frontend to start
sleep 2

if ps -p $FRONTEND_PID > /dev/null; then
    print_success "Frontend running on http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)"
else
    print_error "Failed to start frontend"
    cat "$LOGS_DIR/frontend.log"
    cleanup
fi

cd "$SCRIPT_DIR"

# ============================================
# SUMMARY
# ============================================
print_header "All Services Running!"

echo ""
echo -e "${GREEN}Services:${NC}"
echo -e "  Frontend:       ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  API:            ${CYAN}http://localhost:$API_PORT${NC}"
echo -e "  AI Service:     ${CYAN}http://localhost:$AI_SERVICE_PORT${NC}"
echo -e "  Hardhat Node:   ${CYAN}http://localhost:8545${NC}"
echo ""
echo -e "${GREEN}Logs:${NC}"
echo -e "  ${YELLOW}tail -f logs/frontend.log${NC}"
echo -e "  ${YELLOW}tail -f logs/blockchain-api.log${NC}"
echo -e "  ${YELLOW}tail -f logs/ai-service.log${NC}"
echo -e "  ${YELLOW}tail -f logs/hardhat.log${NC}"
echo ""
print_info "Press Ctrl+C to stop all services"
echo ""

# Keep script running and monitor services
while true; do
    sleep 5
    
    # Check if services are still running
    if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
        print_error "Frontend crashed! Check logs/frontend.log"
        cleanup
    fi
    
    if ! ps -p $API_PID > /dev/null 2>&1; then
        print_error "Blockchain API crashed! Check logs/blockchain-api.log"
        cleanup
    fi
    
    if ! ps -p $AI_PID > /dev/null 2>&1; then
        print_error "AI Service crashed! Check logs/ai-service.log"
        cleanup
    fi
    
    if ! ps -p $HARDHAT_PID > /dev/null 2>&1; then
        print_error "Hardhat node crashed! Check logs/hardhat.log"
        cleanup
    fi
done
