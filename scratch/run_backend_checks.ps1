$env:PATH = "C:\nvm4w\nodejs;$env:PATH"
Set-Location backend

Write-Host "--- BACKEND TYPECHECK ---"
npm run typecheck
Write-Host "TYPECHECK_EXIT=$LASTEXITCODE"

Write-Host "--- BACKEND LINT ---"
npm run lint
Write-Host "LINT_EXIT=$LASTEXITCODE"

Write-Host "--- BACKEND TEST ---"
npm test
Write-Host "TEST_EXIT=$LASTEXITCODE"
