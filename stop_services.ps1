# ============================================
# GLASSBALLOTS PLATFORM - STOP SERVICES (Windows)
# ============================================
# Stops all running GlassBallots services
# ============================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidDir = "$ScriptDir\.pids"

function Print-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Print-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Print-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host "Stopping GlassBallots Services" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

$pidFiles = @{
    "hardhat.pid" = "Hardhat Node"
    "ai.pid" = "AI Service"
    "api.pid" = "Blockchain API"
    "frontend.pid" = "Frontend"
}

$stoppedCount = 0

foreach ($pidFile in $pidFiles.Keys) {
    $pidPath = Join-Path $PidDir $pidFile
    $serviceName = $pidFiles[$pidFile]
    
    if (Test-Path $pidPath) {
        $procId = Get-Content $pidPath -ErrorAction SilentlyContinue
        if ($procId) {
            try {
                $process = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($process) {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Print-Success "$serviceName stopped (PID: $procId)"
                    $stoppedCount++
                } else {
                    Print-Warning "$serviceName was not running (stale PID file)"
                }
            } catch {
                Print-Warning "Could not stop $serviceName"
            }
        }
        Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    }
}

# Also kill by port as a fallback
$ports = @(3000, 3001, 5001, 8545)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            try {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }
}

Write-Host ""
if ($stoppedCount -gt 0) {
    Print-Info "All services stopped"
} else {
    Print-Info "No services were running"
}
Write-Host ""
