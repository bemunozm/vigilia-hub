$tempDir = Join-Path $env:TEMP "vigilia-hub-deploy"
Write-Host "Usando directorio temporal: $tempDir"

if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

Write-Host "Copiando archivos..."
robocopy "c:\PROYECTOS\Taller de Titulo\vigilia-hub" $tempDir /E /XD .git node_modules | Out-Null

Write-Host "Inicializando Git..."
Set-Location $tempDir
git init
git remote add origin https://github.com/bemunozm/vigilia-hub.git
git checkout -b main
git add .
git commit -m "Deploy hacia la raspberry"
Write-Host "Subiendo a GitHub (sobrescribiendo)..."
git push -f origin main

Write-Host "Limpiando directorio temporal..."
Set-Location "c:\PROYECTOS\Taller de Titulo\vigilia-hub"
Remove-Item -Recurse -Force $tempDir

Write-Host "¡Completado exitosamente!"
