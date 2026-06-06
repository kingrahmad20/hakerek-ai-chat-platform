$ErrorActionPreference = "Stop"
$SSH_KEY  = "C:\Users\mohra\OneDrive\Github\SSHDokcer\biznetssh"
$SERVER   = "sanolu@103.93.132.77"
$REMOTE   = "/opt/hakerek"
$ENV_FILE = "$PSScriptRoot\..\\.env.production"

Write-Host "[1/3] Creating tarball..." -ForegroundColor Cyan
tar --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='deploy.tar.gz' --exclude='.env*' --exclude='backups' -czf deploy.tar.gz .

Write-Host "[2/3] Uploading files..." -ForegroundColor Cyan
scp -i $SSH_KEY -o StrictHostKeyChecking=no deploy.tar.gz "${SERVER}:${REMOTE}/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no $ENV_FILE "${SERVER}:${REMOTE}/.env"

Write-Host "[3/3] Extracting and deploying on server..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "cd $REMOTE && tar -xzf deploy.tar.gz && rm deploy.tar.gz && sh scripts/deploy.sh"

Remove-Item deploy.tar.gz -Force

Write-Host "Deploy selesai." -ForegroundColor Green
