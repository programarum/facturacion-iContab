$ErrorActionPreference = "Stop"
$packageDirectory = $PSScriptRoot
$manifestPath = Join-Path $packageDirectory "update-manifest.json"

if (-not (Test-Path $manifestPath)) {
    throw "No se encontró update-manifest.json junto al script. Extrae el ZIP completo antes de ejecutar la actualización."
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.product -ne "icontab-facturacion" -or $manifest.architecture -notin @("x64", "x86")) {
    throw "El paquete no corresponde a una actualización x64/x86 de iContab."
}
if ($manifest.architecture -eq "x64" -and -not [Environment]::Is64BitOperatingSystem) {
    throw "Este paquete es x64, pero Windows en este computador es de 32 bits. Usa el paquete x86."
}

$msiPath = Join-Path $packageDirectory $manifest.installer
if (-not (Test-Path $msiPath)) {
    throw "No se encontró el instalador '$($manifest.installer)' junto al script."
}
$actualHash = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $manifest.sha256.ToLowerInvariant()) {
    throw "El MSI no coincide con el hash del manifiesto; vuelve a copiar o extraer el paquete."
}

$runningApp = Get-Process -Name "icontab-facturacion" -ErrorAction SilentlyContinue
if ($runningApp) {
    throw "Cierra iContab antes de actualizar y vuelve a ejecutar este script. No se cerró la aplicación para proteger los datos abiertos."
}

$appDataDirectory = Join-Path $env:LOCALAPPDATA "com.icontab-facturacion.dev"
$backupDirectory = Join-Path $env:LOCALAPPDATA ("iContab\update-backups\" + $manifest.version + "-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$dataFiles = @("facticontab.db", "facticontab.db-wal", "facticontab.db-shm", "license.json")
$backedUpFiles = @()
if (Test-Path $appDataDirectory) {
    foreach ($fileName in $dataFiles) {
        $sourcePath = Join-Path $appDataDirectory $fileName
        if (Test-Path $sourcePath -PathType Leaf) {
            New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
            Copy-Item -LiteralPath $sourcePath -Destination $backupDirectory
            $backedUpFiles += $fileName
        }
    }
}

if ($backedUpFiles.Count -eq 0) {
    Write-Warning "No se encontraron la base de datos ni el archivo de licencia para respaldar. Se continuará con la actualización."
} else {
    Write-Host "Respaldo creado en: $backupDirectory"
    Write-Host ("Archivos respaldados: " + ($backedUpFiles -join ", "))
}

$msiLog = Join-Path $packageDirectory "instalacion-msi.log"
$msiArguments = "/i `"$msiPath`" /L*v `"$msiLog`""
Write-Host "Se abrirá el asistente MSI de iContab $($manifest.version). Sigue sus instrucciones."
$process = Start-Process -FilePath (Join-Path $env:SystemRoot "System32\msiexec.exe") `
    -ArgumentList $msiArguments -Wait -PassThru

if ($process.ExitCode -notin @(0, 3010, 1641)) {
    throw "La instalación MSI terminó con código $($process.ExitCode). El respaldo se conserva en '$backupDirectory'; consulta '$msiLog' para más detalles."
}

if ($process.ExitCode -eq 3010) {
    Write-Host "Actualización instalada. Windows solicita reiniciar el equipo."
} elseif ($process.ExitCode -eq 1641) {
    Write-Host "Actualización instalada; el instalador inició un reinicio."
} else {
    Write-Host "iContab $($manifest.version) se actualizó correctamente. Los datos y la licencia se conservaron."
}
