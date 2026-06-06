$ErrorActionPreference = "Stop"
$SSH_KEY = "C:\Users\mohra\OneDrive\Github\SSHDokcer\biznetssh"
$SERVER  = "sanolu@103.93.132.77"
$REMOTE  = "/opt/hakerek"

Write-Host "Rebuilding and restarting on server (no file upload)..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "cd $REMOTE && sh scripts/deploy.sh"

Write-Host "Update selesai." -ForegroundColor Green
