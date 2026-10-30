<#
  Instala el agente de impresión de Restaurante Hub como servicio en Windows.

  NOTA: si usas la app de escritorio "Restaurante Hub" (.exe), NO necesitas esto:
  la app ya trae el agente integrado. Este script es para una PC sin la app
  (por ejemplo, una PC de cocina sin pantalla).

  Uso (PowerShell como Administrador, desde la raíz del repositorio):
    powershell -ExecutionPolicy Bypass -File apps\print-agent\deploy\install-windows.ps1 `
      -ApiUrl https://mi-restaurante.up.railway.app -Token TOKEN_DEL_AGENTE [-Mode Nssm|Task]

  Modos:
    Nssm  (recomendado) Servicio de Windows con NSSM (https://nssm.cc). Arranca aunque nadie inicie
          sesión y se reinicia si falla. IMPORTANTE: el servicio corre como LocalSystem; las impresoras
          instaladas "por usuario" o compartidas de red pueden no verse. Para impresoras compartidas
          (\\PC\Impresora) configura el servicio con una cuenta de usuario:  nssm edit RestauranteHubAgent
    Task  Tarea programada "al iniciar sesión" del usuario actual. Ve las mismas impresoras que el
          usuario. Requiere que alguien inicie sesión en Windows (configura inicio de sesión automático).
#>
param(
  [string]$ApiUrl,
  [string]$Token,
  [ValidateSet('Nssm', 'Task')][string]$Mode = 'Nssm',
  [string]$InstallDir = "$env:ProgramFiles\RestauranteHubAgent"
)
$ErrorActionPreference = 'Stop'
$ServiceName = 'RestauranteHubAgent'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}
if ($Mode -eq 'Nssm' -and -not (Test-Admin)) { throw 'Ejecuta PowerShell como Administrador para instalar el servicio.' }

if (-not $ApiUrl) { $ApiUrl = Read-Host 'URL del servidor (https://...)' }
if (-not $Token) { $Token = Read-Host 'Token del agente (Configuración → Impresoras → Agentes)' }

Write-Host '==> Verificando Node.js' -ForegroundColor Cyan
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  } else { throw 'Instala Node.js 22 LTS desde https://nodejs.org y vuelve a ejecutar.' }
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { npm install -g pnpm@10 }

Write-Host '==> Compilando' -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  pnpm install --filter '@rh/print-agent...' --frozen-lockfile
  pnpm --filter '@rh/shared' build
  pnpm --filter '@rh/printing' build
  pnpm --filter '@rh/print-agent' build
  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
  pnpm --filter '@rh/print-agent' deploy --prod --legacy "$InstallDir"
  if (-not (Test-Path "$InstallDir\dist\cli.js")) { Copy-Item -Recurse "apps\print-agent\dist" "$InstallDir\dist" }
} finally { Pop-Location }

Write-Host '==> Guardando configuración' -ForegroundColor Cyan
$ConfDir = Join-Path $env:ProgramData 'RestauranteHub'
New-Item -ItemType Directory -Force -Path $ConfDir | Out-Null
$ConfFile = Join-Path $ConfDir 'agent.json'
@{ apiUrl = $ApiUrl; token = $Token; name = $env:COMPUTERNAME } | ConvertTo-Json | Set-Content -Encoding UTF8 $ConfFile

$NodeExe = (Get-Command node).Source
$Cli = Join-Path $InstallDir 'dist\cli.js'

if ($Mode -eq 'Nssm') {
  Write-Host '==> Instalando servicio con NSSM' -ForegroundColor Cyan
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if (-not $nssm) {
    if (Get-Command winget -ErrorAction SilentlyContinue) { winget install -e --id NSSM.NSSM --accept-source-agreements --accept-package-agreements }
    elseif (Get-Command choco -ErrorAction SilentlyContinue) { choco install nssm -y }
    else { throw 'Instala NSSM (https://nssm.cc/download) y agrega nssm.exe al PATH, o usa -Mode Task.' }
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $nssm = Get-Command nssm
  }
  & $nssm.Source stop $ServiceName 2>$null | Out-Null
  & $nssm.Source remove $ServiceName confirm 2>$null | Out-Null
  & $nssm.Source install $ServiceName $NodeExe "`"$Cli`" start"
  & $nssm.Source set $ServiceName AppDirectory $InstallDir
  & $nssm.Source set $ServiceName AppEnvironmentExtra "RH_AGENT_CONFIG=$ConfFile" 'NO_COLOR=1'
  & $nssm.Source set $ServiceName DisplayName 'Restaurante Hub - agente de impresion'
  & $nssm.Source set $ServiceName Start SERVICE_AUTO_START
  & $nssm.Source set $ServiceName AppStdout (Join-Path $ConfDir 'agent.log')
  & $nssm.Source set $ServiceName AppStderr (Join-Path $ConfDir 'agent.log')
  & $nssm.Source set $ServiceName AppRotateFiles 1
  & $nssm.Source set $ServiceName AppRotateBytes 5000000
  & $nssm.Source start $ServiceName
  Write-Host "Servicio '$ServiceName' instalado. Logs: $ConfDir\agent.log" -ForegroundColor Green
} else {
  Write-Host '==> Creando tarea programada al iniciar sesión' -ForegroundColor Cyan
  $action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$Cli`" start --config `"$ConfFile`"" -WorkingDirectory $InstallDir
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
  Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $ServiceName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Restaurante Hub - agente de impresion' | Out-Null
  Start-ScheduledTask -TaskName $ServiceName
  Write-Host "Tarea '$ServiceName' creada (se inicia al entrar a Windows)." -ForegroundColor Green
}

Write-Host ''
Write-Host 'Impresoras detectadas:' -ForegroundColor Cyan
& $NodeExe $Cli discover
Write-Host ''
Write-Host "Prueba: node `"$Cli`" test --windows `"NOMBRE DE LA IMPRESORA`""
