# Quick smoke tests for waitlist API (requires server running).
# Usage: .\scripts\waitlist-smoke.ps1
#        .\scripts\waitlist-smoke.ps1 -BaseUrl "https://xxxx.ngrok-free.app"

param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

function Test-Case {
  param($Name, [scriptblock]$Script)
  try {
    & $Script
    Write-Host "[OK] $Name" -ForegroundColor Green
    $script:passed++
  } catch {
    Write-Host "[FAIL] $Name — $($_.Exception.Message)" -ForegroundColor Red
    $script:failed++
  }
}

Write-Host "Waitlist smoke — $BaseUrl`n" -ForegroundColor Cyan

Test-Case "GET /api/waitlist/count returns JSON with count" {
  $r = Invoke-RestMethod -Uri "$BaseUrl/api/waitlist/count" -Method Get
  if (-not ($r.PSObject.Properties.Name -contains 'count')) { throw "missing count property" }
}

Test-Case "GET /api/waitlist/position without ref returns 400" {
  $code = curl.exe -s -o NUL -w "%{http_code}" "$BaseUrl/api/waitlist/position"
  if ($code -ne "400") { throw "expected HTTP 400, got $code" }
}

Test-Case "POST /api/waitlist invalid email returns 400" {
  $body = '{"email":"notvalid"}'
  $code = curl.exe -s -o NUL -w "%{http_code}" -X POST "$BaseUrl/api/waitlist" -H "Content-Type: application/json" -d $body
  if ($code -ne "400") { throw "expected HTTP 400, got $code" }
}

Write-Host "`nDone: $passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
if ($failed -gt 0) { exit 1 }
