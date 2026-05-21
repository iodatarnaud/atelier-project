# scripts/tcli.ps1 — wrapper PowerShell pour ticket-cli.mjs
#
# Lit les 2 secrets depuis les variables d'env Windows (User puis Machine en
# fallback) et les injecte en scope Process avant de spawn Node — utile parce
# que les shells déjà ouverts au moment de la création d'une var n'en héritent
# pas, et que Node ne sait pas lire le registre Windows directement.
#
# Vars Windows attendues (à créer une fois via Settings > System > Advanced >
# Environment Variables, scope User OU Machine au choix) :
#   - "GitHub Gist Token"  : PAT GitHub avec scope `gist`
#   - "Atelier Gist ID"    : id du Gist privé contenant atelier-data.json
#
# Usage : .\scripts\tcli.ps1 list --client VVO

$ErrorActionPreference = 'Stop'

function Read-EnvVar([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name, "User")
  if (-not $v) { $v = [Environment]::GetEnvironmentVariable($name, "Machine") }
  return $v
}

$token = Read-EnvVar "GitHub Gist Token"
if (-not $token) {
  Write-Error "Variable d'env Windows 'GitHub Gist Token' introuvable (User ni Machine). Crée-la via Settings > System > Advanced > Environment Variables."
  exit 2
}

$gistId = Read-EnvVar "Atelier Gist ID"
if (-not $gistId) {
  Write-Error "Variable d'env Windows 'Atelier Gist ID' introuvable (User ni Machine). Crée-la avec la valeur du Gist id contenant atelier-data.json."
  exit 2
}

# Injecter sous noms sans espace pour Node (qui peut être tatillon sur les
# espaces dans process.env selon la stack).
$env:ATELIER_GIST_TOKEN = $token
$env:ATELIER_GIST_ID = $gistId

# Lancer le CLI. $PSScriptRoot = répertoire de ce wrapper.
& node "$PSScriptRoot\ticket-cli.mjs" @args
