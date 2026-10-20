param(
    [ValidateSet("x64", "x86")]
    [string] $Architecture = "x64",
    [string] $MsiPath
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$cargoManifestPath = Join-Path $projectRoot "src-tauri\Cargo.toml"
$rustTarget = if ($Architecture -eq "x64") { "x86_64-pc-windows-msvc" } else { "i686-pc-windows-msvc" }
$targetBundle = Join-Path $projectRoot "src-tauri\target\$rustTarget\release\bundle\msi"

if (-not (Test-Path $tauriConfigPath) -or -not (Test-Path $cargoManifestPath)) {
    throw "No se encontraron los manifiestos de Tauri y Rust en '$projectRoot'."
}

$tauriVersion = (Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json).version
$cargoContent = Get-Content -LiteralPath $cargoManifestPath -Raw
$cargoVersionMatch = [regex]::Match($cargoContent, '(?m)^version\s*=\s*"([^"]+)"')
if (-not $cargoVersionMatch.Success) {
    throw "No se pudo leer la versión del paquete en '$cargoManifestPath'."
}
$cargoVersion = $cargoVersionMatch.Groups[1].Value
if ($tauriVersion -ne $cargoVersion) {
    throw "Las versiones deben coincidir antes de publicar. tauri.conf.json=$tauriVersion; Cargo.toml=$cargoVersion."
}

if ([string]::IsNullOrWhiteSpace($MsiPath)) {
    $candidates = @(Get-ChildItem -LiteralPath $targetBundle -Filter "*.msi" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name.Contains($tauriVersion) } |
        Sort-Object LastWriteTime -Descending)
    if (-not $candidates) {
        throw "No se encontró un MSI $Architecture de la versión $tauriVersion en '$targetBundle'. Compila primero la aplicación."
    }
    $MsiPath = $candidates[0].FullName
}

$msi = Get-Item -LiteralPath $MsiPath
if ($msi.Extension -ne ".msi") {
    throw "El instalador debe ser un archivo MSI: '$($msi.FullName)'."
}

$outputRoot = Split-Path -Parent $projectRoot
$packageName = "icontab-facturacion-update-$tauriVersion-$Architecture"
$archivePath = Join-Path $outputRoot "$packageName.zip"
if (Test-Path $archivePath) {
    throw "Ya existe '$archivePath'. Incrementa la versión o mueve el paquete anterior."
}

$stagingDirectory = Join-Path $env:TEMP ("icontab-update-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
try {
    Copy-Item -LiteralPath $msi.FullName -Destination $stagingDirectory
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "apply-offline-update.ps1") -Destination $stagingDirectory

    $manifest = [ordered]@{
        product = "icontab-facturacion"
        version = $tauriVersion
        architecture = $Architecture
        installer = $msi.Name
        sha256 = (Get-FileHash -LiteralPath $msi.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stagingDirectory "update-manifest.json") -Encoding UTF8

    @"
Actualización iContab $tauriVersion (Windows $Architecture)

1. Copia y extrae este paquete en el computador que tiene iContab instalado.
2. Cierra iContab.
3. Abre PowerShell en esta carpeta y ejecuta:
   powershell -ExecutionPolicy Bypass -File .\apply-offline-update.ps1
4. Completa el asistente MSI de Windows.

El script respalda la base de datos y license.json antes de iniciar el instalador.
No requiere conexión a internet.
"@ | Set-Content -LiteralPath (Join-Path $stagingDirectory "LEEME.txt") -Encoding UTF8

    Compress-Archive -Path (Join-Path $stagingDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal
} finally {
    if (Test-Path $stagingDirectory) {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
    }
}

Write-Host "Paquete de actualización offline creado: $archivePath"
