$env:PATH = "C:\nvm4w\nodejs;$env:PATH"
Set-Location backend
npm test
Write-Host "TEST_EXIT=$LASTEXITCODE"
