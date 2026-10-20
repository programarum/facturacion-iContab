param(
    [string] $LicenseServerUrl = $env:ICONTAB_LICENSE_SERVER_URL,
    [string] $LicensePublicKey = $env:ICONTAB_LICENSE_PUBLIC_KEY
)

$ErrorActionPreference = "Stop"

function Require-Command([string] $Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontró '$Name'. Instálalo y vuelve a ejecutar este script."
    }
}

Require-Command "node"
Require-Command "pnpm"
Require-Command "rustup"
Require-Command "cargo"

if ([string]::IsNullOrWhiteSpace($LicensePublicKey)) {
    throw "Configura ICONTAB_LICENSE_PUBLIC_KEY con la clave pública Base64 antes de compilar."
}

$env:ICONTAB_LICENSE_PUBLIC_KEY = $LicensePublicKey
if ([string]::IsNullOrWhiteSpace($LicenseServerUrl)) {
    Remove-Item Env:ICONTAB_LICENSE_SERVER_URL -ErrorAction SilentlyContinue
    Write-Host "Compilando con activación offline por archivo firmado."
} else {
    $env:ICONTAB_LICENSE_SERVER_URL = $LicenseServerUrl.TrimEnd("/")
    Write-Host "Compilando con activación online y validación local offline."
}

Write-Host "Instalando dependencias de JavaScript..."
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) {
    throw "Falló pnpm install (código $LASTEXITCODE)."
}

$builds = @(
    @{
        Architecture = "64 bits"
        RustTarget = "x86_64-pc-windows-msvc"
        PnpmScript = "tauri:build:windows"
    },
    @{
        Architecture = "32 bits"
        RustTarget = "i686-pc-windows-msvc"
        PnpmScript = "tauri:build:windows:x86"
    }
)

$allInstallers = @()
foreach ($build in $builds) {
    Write-Host "Preparando el target $($build.RustTarget)..."
    rustup target add $build.RustTarget
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo instalar el target Rust $($build.RustTarget) (código $LASTEXITCODE)."
    }

    Write-Host "Compilando instaladores para Windows de $($build.Architecture)..."
    pnpm $build.PnpmScript
    if ($LASTEXITCODE -ne 0) {
        throw "Falló la compilación para $($build.Architecture) (código $LASTEXITCODE)."
    }

    $bundleDirectory = Join-Path $PSScriptRoot "..\src-tauri\target\$($build.RustTarget)\release\bundle"
    $installers = Get-ChildItem -Path $bundleDirectory -Recurse -File -Include "*.exe", "*.msi" -ErrorAction SilentlyContinue
    if (-not $installers) {
        throw "La compilación de $($build.Architecture) terminó, pero no se encontraron instaladores en '$bundleDirectory'."
    }
    $allInstallers += $installers
}

Write-Host "Instaladores generados para 64 y 32 bits:"
$allInstallers | ForEach-Object { Write-Host "  $($_.FullName)" }
