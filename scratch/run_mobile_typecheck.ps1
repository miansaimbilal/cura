$env:PATH = "C:\nvm4w\nodejs;$env:PATH"
Set-Location mobile
npm run typecheck
Write-Host "EXIT_CODE=$LASTEXITCODE"
