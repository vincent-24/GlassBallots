#!/bin/bash

# ============================================
# GLASSBALLOTS PLATFORM - START SERVICES
# ============================================
# Launches all microservices for development
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# PID file location
PID_DIR="./.pids"
mkdir -p "$PID_DIR"

# Logs directory
LOGS_DIR="./logs"
mkdir -p "$LOGS_DIR"

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
    echo -e "${CYAN}$1${NC}"
}

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    print_success "Environment variables loaded"
else
    print_error ".env file not found. Run ./setup_env.sh first"
    exit 1
fi

# Set default ports if not specified
FRONTEND_PORT=${FRONTEND_PORT:-3000}
API_PORT=${API_PORT:-3001}
AI_SERVICE_PORT=${AI_SERVICE_PORT:-5000}

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
# CHECK OPENAI API KEY
# ============================================
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    print_error "OPENAI_API_KEY not set in .env file"
    print_info "Get your API key from: https://platform.openai.com/api-keys"
    exit 1
fi

# ============================================
# START HARDHAT NODE
# ============================================
print_header "Starting Hardhat Node"

kill_port 8545

cd blockchain-service

print_info "Launching local Ethereum node..."
npx hardhat node > ../logs/hardhat.log 2>&1 &
HARDHAT_PID=$!
echo $HARDHAT_PID > "../$PID_DIR/hardhat.pid"

# Wait for Hardhat to start
sleep 3

if ps -p $HARDHAT_PID > /dev/null; then
    print_success "Hardhat node running on http://127.0.0.1:8545 (PID: $HARDHAT_PID)"
else
    print_error "Failed to start Hardhat node"
    cat ../logs/hardhat.log
    exit 1
fi

# ============================================
# DEPLOY SMART CONTRACTS
# ============================================
print_info "Deploying smart contracts..."
sleep 2  # Wait for node to be fully ready

npx hardhat run scripts/deploy.js --network hardhatMainnet > ../logs/deploy.log 2>&1

if [ $? -eq 0 ]; then
    print_success "Smart contracts deployed"
else
    print_error "Failed to deploy contracts. Check logs/deploy.log"
    cat ../logs/deploy.log
    cleanup
fi

cd ..

# ============================================
# START AI SERVICE
# ============================================
print_header "Starting AI Service"

kill_port $AI_SERVICE_PORT

cd ai-service

# Check if conda environment exists
if conda env list 2>/dev/null | grep -q "ai_env"; then
    print_info "Using conda environment: ai_env"
    # Use conda run instead of activate
    conda run -n ai_env python app.py > ../logs/ai-service.log 2>&1 &
    AI_PID=$!
elif [ -d "venv" ]; then
    print_info "Using virtual environment: venv"
    source venv/bin/activate
    python app.py > ../logs/ai-service.log 2>&1 &
    AI_PID=$!
else
    print_error "No Python environment found. Run ./setup_env.sh first"
    cleanup
fi

echo $AI_PID > "../$PID_DIR/ai.pid"

# Wait for AI service to start
sleep 3

if ps -p $AI_PID > /dev/null; then
    print_success "AI Service running on http://localhost:$AI_SERVICE_PORT (PID: $AI_PID)"
else
    print_error "Failed to start AI service"
    cat ../logs/ai-service.log
    cleanup
fi

cd ..

# ============================================
# START BLOCKCHAIN SERVICE (API)
# ============================================
print_header "Starting Blockchain Service API"

kill_port $API_PORT

cd blockchain-service

print_info "Launching Express API server..."
node api/server.js > ../logs/blockchain-api.log 2>&1 &
API_PID=$!
echo $API_PID > "../$PID_DIR/api.pid"

# Wait for API to start
sleep 2

if ps -p $API_PID > /dev/null; then
    print_success "Blockchain API running on http://localhost:$API_PORT (PID: $API_PID)"
else
    print_error "Failed to start Blockchain API"
    cat ../logs/blockchain-api.log
    cleanup
fi

cd ..

# ============================================
# START FRONTEND
# ============================================
print_header "Starting Frontend"

kill_port $FRONTEND_PORT

cd frontend

print_info "Launching frontend server..."
node server.js > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "../$PID_DIR/frontend.pid"

# Wait for frontend to start
sleep 2

if ps -p $FRONTEND_PID > /dev/null; then
    print_success "Frontend running on http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)"
else
    print_error "Failed to start frontend"
    cat ../logs/frontend.log
    cleanup
fi

cd ..

# ============================================
# SUMMARY
# ============================================
print_header "All Services Running!"

echo ""
echo -e "${GREEN}Services:${NC}"
echo -e "  • Frontend:       ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  • API:            ${CYAN}http://localhost:$API_PORT${NC}"
echo -e "  • AI Service:     ${CYAN}http://localhost:$AI_SERVICE_PORT${NC}"
echo -e "  • Hardhat Node:   ${CYAN}http://localhost:8545${NC}"
echo ""
echo -e "${GREEN}Logs:${NC}"
echo -e "  • Frontend:       ${YELLOW}logs/frontend.log${NC}"
echo -e "  • Blockchain API: ${YELLOW}logs/blockchain-api.log${NC}"
echo -e "  • AI Service:     ${YELLOW}logs/ai-service.log${NC}"
echo -e "  • Hardhat Node:   ${YELLOW}logs/hardhat.log${NC}"
echo ""
echo -e "${GREEN}PIDs:${NC}"
echo -e "  • Frontend:       $FRONTEND_PID"
echo -e "  • Blockchain API: $API_PID"
echo -e "  • AI Service:     $AI_PID"
echo -e "  • Hardhat Node:   $HARDHAT_PID"
echo ""

print_info "Press Ctrl+C to stop all services"
echo ""

# Keep script running
while true; do
    sleep 5
    
    # Check if services are still running
    if ! ps -p $FRONTEND_PID > /dev/null; then
        print_error "Frontend crashed! Check logs/frontend.log"
        cleanup
    fi
    
    if ! ps -p $API_PID > /dev/null; then
        print_error "Blockchain API crashed! Check logs/blockchain-api.log"
        cleanup
    fi
    
    if ! ps -p $AI_PID > /dev/null; then
        print_error "AI Service crashed! Check logs/ai-service.log"
        cleanup
    fi
    
    if ! ps -p $HARDHAT_PID > /dev/null; then
        print_error "Hardhat node crashed! Check logs/hardhat.log"
        cleanup
    fi
done
