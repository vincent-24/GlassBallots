# ============================================
# GLASSBALLOTS PLATFORM - SETUP SCRIPT (Windows)
# ============================================
# One-Click Setup: Installs all dependencies and
# prepares the environment for production launch.
# 
# Run this ONCE after cloning the repository.
# ============================================

$ErrorActionPreference = "Stop"

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# ============================================
# HELPER FUNCTIONS
# ============================================
function Print-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host $Message -ForegroundColor Blue
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host ""
}

function Print-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Print-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        if (Get-Command $Command) { return $true }
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $oldPreference
    }
    return $false
}

# ============================================
# STEP 1: CHECK PREREQUISITES
# ============================================
Print-Header "Step 1/6: Checking Prerequisites"

# Check Node.js
if (Test-Command "node") {
    $NodeVersion = node -v
    $NodeMajor = [int]($NodeVersion -replace 'v(\d+)\..*', '$1')
    
    if ($NodeMajor -ge 18) {
        Print-Success "Node.js $NodeVersion"
    } else {
        Print-Error "Node.js v18+ required (found $NodeVersion)"
        Write-Host ""
        Write-Host "Please upgrade Node.js:"
        Write-Host "  - Download: https://nodejs.org/"
        exit 1
    }
} else {
    Print-Error "Node.js not found!"
    Write-Host ""
    Write-Host "Please install Node.js v18+ from https://nodejs.org/"
    exit 1
}

# Check npm
if (Test-Command "npm") {
    $NpmVersion = npm -v
    Print-Success "npm v$NpmVersion"
} else {
    Print-Error "npm not found!"
    exit 1
}

# Check Python 3
$PythonCmd = $null
if (Test-Command "python") {
    $PythonVersion = python --version 2>&1
    if ($PythonVersion -match "Python 3") {
        Print-Success "$PythonVersion"
        $PythonCmd = "python"
    }
}
if (-not $PythonCmd -and (Test-Command "python3")) {
    $PythonVersion = python3 --version 2>&1
    Print-Success "$PythonVersion"
    $PythonCmd = "python3"
}
if (-not $PythonCmd) {
    Print-Error "Python 3 not found!"
    Write-Host ""
    Write-Host "Please install Python 3.9+ from https://www.python.org/"
    exit 1
}

# Check pip
$PipCmd = $null
if (Test-Command "pip") {
    $PipCmd = "pip"
    Print-Success "pip available"
} elseif (Test-Command "pip3") {
    $PipCmd = "pip3"
    Print-Success "pip3 available"
} else {
    Print-Error "pip not found!"
    Write-Host "Please install pip for Python 3"
    exit 1
}

# ============================================
# STEP 2: INSTALL BACKEND DEPENDENCIES
# ============================================
Print-Header "Step 2/6: Installing Backend Dependencies"

Set-Location "$ScriptDir\blockchain-service"
Print-Info "Running npm install in blockchain-service/..."
npm install
if ($LASTEXITCODE -ne 0) {
    Print-Error "Failed to install backend dependencies"
    exit 1
}
Print-Success "Backend dependencies installed"

Set-Location $ScriptDir

# ============================================
# STEP 3: INSTALL FRONTEND DEPENDENCIES
# ============================================
Print-Header "Step 3/6: Installing Frontend Dependencies"

Set-Location "$ScriptDir\frontend"
Print-Info "Running npm install in frontend/..."
npm install
if ($LASTEXITCODE -ne 0) {
    Print-Error "Failed to install frontend dependencies"
    exit 1
}
Print-Success "Frontend dependencies installed"

Set-Location $ScriptDir

# ============================================
# STEP 4: SETUP AI SERVICE (Python venv)
# ============================================
Print-Header "Step 4/6: Setting Up AI Service"

Set-Location "$ScriptDir\ai-service"

# Create venv if it doesn't exist
if (-not (Test-Path "venv")) {
    Print-Info "Creating Python virtual environment..."
    & $PythonCmd -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Print-Error "Failed to create virtual environment"
        exit 1
    }
}

Print-Info "Installing Python dependencies..."
& ".\venv\Scripts\pip.exe" install --upgrade pip --quiet
& ".\venv\Scripts\pip.exe" install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) {
    Print-Error "Failed to install Python dependencies"
    exit 1
}

Print-Success "AI Service dependencies installed (venv)"

Set-Location $ScriptDir

# ============================================
# STEP 5: ENVIRONMENT CONFIGURATION
# ============================================
Print-Header "Step 5/6: Environment Configuration"

# Create runtime directories
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" | Out-Null }
if (-not (Test-Path ".pids")) { New-Item -ItemType Directory -Path ".pids" | Out-Null }
Print-Success "Created logs/ and .pids/ directories"

# Create .env from .env.example if it doesn't exist
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Print-Success "Created .env from .env.example"
        Write-Host ""
        Print-Warning "ACTION REQUIRED: Edit .env and add your OPENAI_API_KEY"
        Print-Info "Get your API key from: https://platform.openai.com/api-keys"
    } else {
        Print-Error ".env.example not found!"
        exit 1
    }
} else {
    Print-Success ".env file already exists"
}

# ============================================
# STEP 6: DATABASE INITIALIZATION
# ============================================
Print-Header "Step 6/6: Database Initialization"

$DbDir = "$ScriptDir\blockchain-service\database"
$DbPath = "$DbDir\glassballots.db"
$SchemaPath = "$DbDir\schema.sql"

Print-Info "Database path: $DbPath"

# Ensure database directory exists
if (-not (Test-Path $DbDir)) { New-Item -ItemType Directory -Path $DbDir | Out-Null }

# Check if database already exists
if (Test-Path $DbPath) {
    Print-Info "Database already exists, checking if seeding is needed..."
} else {
    Print-Info "Creating new database..."
}

# Initialize schema and seed data using Node.js
Set-Location "$ScriptDir\blockchain-service"

$NodeScript = @"
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
"@

node -e $NodeScript
if ($LASTEXITCODE -eq 0) {
    Print-Success "Database initialized at: $DbPath"
} else {
    Print-Warning "Database initialization deferred - will initialize on first run"
}

# Seed proposals if needed
Print-Info "Checking proposal data..."
try {
    node database/seed_proposals.js 2>$null
    Print-Success "Proposals seeded"
} catch {
    Print-Info "Proposals will be seeded on first run"
}

Set-Location $ScriptDir

# ============================================
# COMPILE SMART CONTRACTS
# ============================================
Print-Header "Compiling Smart Contracts"

Set-Location "$ScriptDir\blockchain-service"
Print-Info "Compiling Solidity contracts..."
npx hardhat compile --quiet
if ($LASTEXITCODE -ne 0) {
    Print-Warning "Contract compilation had issues - will retry on start"
}
Print-Success "Smart contracts compiled"

Set-Location $ScriptDir

# ============================================
# SETUP COMPLETE
# ============================================
Print-Header "Setup Complete!"

Write-Host ""
Write-Host "GlassBallots is ready for launch!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Configure your API key:"
Write-Host "     notepad .env" -ForegroundColor Yellow
Write-Host "     (add your OPENAI_API_KEY)"
Write-Host ""
Write-Host "  2. Start all services:"
Write-Host "     .\start_services.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "  3. Access the platform:"
Write-Host "     Frontend:   " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Green
Write-Host "     API:        " -NoNewline; Write-Host "http://localhost:3001" -ForegroundColor Green
Write-Host "     AI Service: " -NoNewline; Write-Host "http://localhost:5001" -ForegroundColor Green
Write-Host ""
Print-Success "Setup completed successfully!"
Write-Host ""
