$tempDir = Join-Path $env:TEMP "vigilia-hub-deploy"
Write-Host "Usando directorio temporal: $tempDir"

if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}

Write-Host "Clonando estado actual para no destruir el historial (Fast-Forward)..."
git clone https://github.com/bemunozm/vigilia-hub.git $tempDir | Out-Null

Write-Host "Limpiando archivos antiguos en la clonación..."
# Borramos todo menos la carpeta .git para mantener la conexión y el historial
Get-ChildItem -Path $tempDir -Exclude ".git" | Remove-Item -Recurse -Force

Write-Host "Copiando tu código nuevo..."
robocopy "c:\PROYECTOS\Taller de Titulo\vigilia-hub" $tempDir /E /XD .git node_modules | Out-Null

Write-Host "Subiendo cambios de manera limpia..."
Set-Location $tempDir
git add .
git commit -m "Deploy automático de código vigente"
git push origin main

Write-Host "Limpiando directorio temporal..."
Set-Location "c:\PROYECTOS\Taller de Titulo\vigilia-hub"
Remove-Item -Recurse -Force $tempDir

Write-Host "¡Completado exitosamente! Ahora en tu Raspberry Pi solo necesitas hacer 'git pull origin main'"
