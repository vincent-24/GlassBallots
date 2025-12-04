# ============================================
# GLASSBALLOTS PLATFORM - START SERVICES (Windows)
# ============================================
# Launches all microservices for production
# 
# PREREQUISITE: Run .\setup_env.ps1 first!
# ============================================

$ErrorActionPreference = "Stop"

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# PID file location
$PidDir = "$ScriptDir\.pids"
if (-not (Test-Path $PidDir)) { New-Item -ItemType Directory -Path $PidDir | Out-Null }

# Logs directory
$LogsDir = "$ScriptDir\logs"
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir | Out-Null }

# Store process objects for cleanup
$Script:Processes = @{}

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

function Test-PortInUse {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

function Stop-PortProcess {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            try {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                Print-Warning "Killed process on port $Port"
            } catch {}
        }
        Start-Sleep -Seconds 1
    }
}

function Stop-AllServices {
    Print-Header "Stopping Services"
    
    foreach ($name in $Script:Processes.Keys) {
        $proc = $Script:Processes[$name]
        if ($proc -and -not $proc.HasExited) {
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                Print-Success "$name stopped"
            } catch {
                Print-Warning "Could not stop $name"
            }
        }
    }
    
    # Also try to kill by PID files
    $pidFiles = @("hardhat.pid", "ai.pid", "api.pid", "frontend.pid")
    foreach ($pidFile in $pidFiles) {
        $pidPath = Join-Path $PidDir $pidFile
        if (Test-Path $pidPath) {
            $procId = Get-Content $pidPath -ErrorAction SilentlyContinue
            if ($procId) {
                try {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                } catch {}
            }
            Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
        }
    }
    
    Write-Host ""
    Print-Info "All services stopped"
}

# Register cleanup on script exit
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-AllServices }

# ============================================
# PREREQUISITE CHECK
# ============================================
Print-Header "Checking Prerequisites"

# Check if blockchain-service/node_modules exists
if (-not (Test-Path "$ScriptDir\blockchain-service\node_modules")) {
    Print-Error "Dependencies not installed!"
    Write-Host ""
    Write-Host "The blockchain-service\node_modules directory is missing." -ForegroundColor Yellow
    Write-Host "Please run the setup script first:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    .\setup_env.ps1" -ForegroundColor Green
    Write-Host ""
    exit 1
}

# Check if frontend/node_modules exists
if (-not (Test-Path "$ScriptDir\frontend\node_modules")) {
    Print-Error "Dependencies not installed!"
    Write-Host ""
    Write-Host "The frontend\node_modules directory is missing." -ForegroundColor Yellow
    Write-Host "Please run the setup script first:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    .\setup_env.ps1" -ForegroundColor Green
    Write-Host ""
    exit 1
}

# Check if ai-service/venv exists
if (-not (Test-Path "$ScriptDir\ai-service\venv")) {
    Print-Error "Python environment not configured!"
    Write-Host ""
    Write-Host "The ai-service\venv directory is missing." -ForegroundColor Yellow
    Write-Host "Please run the setup script first:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    .\setup_env.ps1" -ForegroundColor Green
    Write-Host ""
    exit 1
}

Print-Success "All dependencies are installed"

# Load environment variables from .env
if (Test-Path "$ScriptDir\.env") {
    Get-Content "$ScriptDir\.env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove quotes if present
            $value = $value -replace '^["'']|["'']$', ''
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    # Override DATABASE_PATH with absolute path
    $absoluteDbPath = "$ScriptDir\blockchain-service\database\glassballots.db"
    [Environment]::SetEnvironmentVariable("DATABASE_PATH", $absoluteDbPath, "Process")
    Print-Success "Environment variables loaded"
} else {
    Print-Error ".env file not found!"
    Write-Host ""
    Write-Host "Please run the setup script first:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    .\setup_env.ps1" -ForegroundColor Green
    Write-Host ""
    exit 1
}

# Check OPENAI_API_KEY
$ApiKey = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "Process")
if (-not $ApiKey -or $ApiKey -eq "your_openai_api_key_here") {
    Print-Error "OPENAI_API_KEY not configured!"
    Write-Host ""
    Write-Host "Please edit .env and add your OpenAI API key:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    notepad .env" -ForegroundColor Green
    Write-Host ""
    Print-Info "Get your API key from: https://platform.openai.com/api-keys"
    exit 1
}

Print-Success "OpenAI API key configured"

# Set default ports
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { 3000 }
$ApiPort = if ($env:API_PORT) { $env:API_PORT } else { 3001 }
$AiServicePort = if ($env:AI_SERVICE_PORT) { $env:AI_SERVICE_PORT } else { 5001 }
$HardhatPort = 8545

# ============================================
# START HARDHAT NODE (Port 8545)
# ============================================
Print-Header "Starting Hardhat Node"

Stop-PortProcess -Port $HardhatPort

Set-Location "$ScriptDir\blockchain-service"

Print-Info "Launching local Ethereum node..."
$hardhatProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npx", "hardhat", "node" `
    -WorkingDirectory "$ScriptDir\blockchain-service" `
    -RedirectStandardOutput "$LogsDir\hardhat.log" `
    -RedirectStandardError "$LogsDir\hardhat-error.log" `
    -WindowStyle Hidden `
    -PassThru

$Script:Processes["Hardhat"] = $hardhatProcess
$hardhatProcess.Id | Out-File "$PidDir\hardhat.pid"

# Wait for Hardhat to start
Start-Sleep -Seconds 5

if (-not $hardhatProcess.HasExited) {
    Print-Success "Hardhat node running on http://127.0.0.1:$HardhatPort (PID: $($hardhatProcess.Id))"
} else {
    Print-Error "Failed to start Hardhat node"
    Get-Content "$LogsDir\hardhat.log" -ErrorAction SilentlyContinue
    Get-Content "$LogsDir\hardhat-error.log" -ErrorAction SilentlyContinue
    Stop-AllServices
    exit 1
}

# ============================================
# DEPLOY SMART CONTRACTS
# ============================================
Print-Info "Deploying smart contracts..."
Start-Sleep -Seconds 2

$deployResult = & npx hardhat run scripts/deploy.js --network hardhatMainnet 2>&1
$deployResult | Out-File "$LogsDir\deploy.log"

if ($LASTEXITCODE -eq 0) {
    Print-Success "Smart contracts deployed"
} else {
    Print-Error "Failed to deploy contracts. Check logs\deploy.log"
    Get-Content "$LogsDir\deploy.log"
    Stop-AllServices
    exit 1
}

Set-Location $ScriptDir

# ============================================
# START AI SERVICE (Port 5001)
# ============================================
Print-Header "Starting AI Service"

Stop-PortProcess -Port $AiServicePort

Print-Info "Launching AI service..."
$aiProcess = Start-Process -FilePath "$ScriptDir\ai-service\venv\Scripts\python.exe" `
    -ArgumentList "app.py" `
    -WorkingDirectory "$ScriptDir\ai-service" `
    -RedirectStandardOutput "$LogsDir\ai-service.log" `
    -RedirectStandardError "$LogsDir\ai-service-error.log" `
    -WindowStyle Hidden `
    -PassThru

$Script:Processes["AI Service"] = $aiProcess
$aiProcess.Id | Out-File "$PidDir\ai.pid"

# Wait for AI service to start
Start-Sleep -Seconds 3

if (-not $aiProcess.HasExited) {
    Print-Success "AI Service running on http://localhost:$AiServicePort (PID: $($aiProcess.Id))"
} else {
    Print-Error "Failed to start AI service"
    Get-Content "$LogsDir\ai-service.log" -ErrorAction SilentlyContinue
    Get-Content "$LogsDir\ai-service-error.log" -ErrorAction SilentlyContinue
    Stop-AllServices
    exit 1
}

# ============================================
# START BLOCKCHAIN SERVICE API (Port 3001)
# ============================================
Print-Header "Starting Blockchain Service API"

Stop-PortProcess -Port $ApiPort

Print-Info "Launching Express API server..."
$apiProcess = Start-Process -FilePath "node.exe" `
    -ArgumentList "api/server.js" `
    -WorkingDirectory "$ScriptDir\blockchain-service" `
    -RedirectStandardOutput "$LogsDir\blockchain-api.log" `
    -RedirectStandardError "$LogsDir\blockchain-api-error.log" `
    -WindowStyle Hidden `
    -PassThru

$Script:Processes["Blockchain API"] = $apiProcess
$apiProcess.Id | Out-File "$PidDir\api.pid"

# Wait for API to start
Start-Sleep -Seconds 2

if (-not $apiProcess.HasExited) {
    Print-Success "Blockchain API running on http://localhost:$ApiPort (PID: $($apiProcess.Id))"
} else {
    Print-Error "Failed to start Blockchain API"
    Get-Content "$LogsDir\blockchain-api.log" -ErrorAction SilentlyContinue
    Get-Content "$LogsDir\blockchain-api-error.log" -ErrorAction SilentlyContinue
    Stop-AllServices
    exit 1
}

# ============================================
# START FRONTEND (Port 3000)
# ============================================
Print-Header "Starting Frontend"

Stop-PortProcess -Port $FrontendPort

Print-Info "Launching frontend server..."
$frontendProcess = Start-Process -FilePath "node.exe" `
    -ArgumentList "server.js" `
    -WorkingDirectory "$ScriptDir\frontend" `
    -RedirectStandardOutput "$LogsDir\frontend.log" `
    -RedirectStandardError "$LogsDir\frontend-error.log" `
    -WindowStyle Hidden `
    -PassThru

$Script:Processes["Frontend"] = $frontendProcess
$frontendProcess.Id | Out-File "$PidDir\frontend.pid"

# Wait for frontend to start
Start-Sleep -Seconds 2

if (-not $frontendProcess.HasExited) {
    Print-Success "Frontend running on http://localhost:$FrontendPort (PID: $($frontendProcess.Id))"
} else {
    Print-Error "Failed to start frontend"
    Get-Content "$LogsDir\frontend.log" -ErrorAction SilentlyContinue
    Get-Content "$LogsDir\frontend-error.log" -ErrorAction SilentlyContinue
    Stop-AllServices
    exit 1
}

# ============================================
# SUMMARY
# ============================================
Print-Header "All Services Running!"

Write-Host ""
Write-Host "Services:" -ForegroundColor Green
Write-Host "  Frontend:       " -NoNewline; Write-Host "http://localhost:$FrontendPort" -ForegroundColor Cyan
Write-Host "  API:            " -NoNewline; Write-Host "http://localhost:$ApiPort" -ForegroundColor Cyan
Write-Host "  AI Service:     " -NoNewline; Write-Host "http://localhost:$AiServicePort" -ForegroundColor Cyan
Write-Host "  Hardhat Node:   " -NoNewline; Write-Host "http://localhost:$HardhatPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "Logs:" -ForegroundColor Green
Write-Host "  Get-Content logs\frontend.log -Wait" -ForegroundColor Yellow
Write-Host "  Get-Content logs\blockchain-api.log -Wait" -ForegroundColor Yellow
Write-Host "  Get-Content logs\ai-service.log -Wait" -ForegroundColor Yellow
Write-Host "  Get-Content logs\hardhat.log -Wait" -ForegroundColor Yellow
Write-Host ""
Print-Info "Press Ctrl+C to stop all services"
Write-Host ""

# Keep script running and monitor services
try {
    while ($true) {
        Start-Sleep -Seconds 5
        
        # Check if services are still running
        if ($frontendProcess.HasExited) {
            Print-Error "Frontend crashed! Check logs\frontend.log"
            Stop-AllServices
            exit 1
        }
        
        if ($apiProcess.HasExited) {
            Print-Error "Blockchain API crashed! Check logs\blockchain-api.log"
            Stop-AllServices
            exit 1
        }
        
        if ($aiProcess.HasExited) {
            Print-Error "AI Service crashed! Check logs\ai-service.log"
            Stop-AllServices
            exit 1
        }
        
        if ($hardhatProcess.HasExited) {
            Print-Error "Hardhat node crashed! Check logs\hardhat.log"
            Stop-AllServices
            exit 1
        }
    }
} finally {
    Stop-AllServices
}
