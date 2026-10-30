<#
.SYNOPSIS
  Faz o deploy do Panelizer no Cloud Run de uma vez só (docs/12-hospedagem-cloud-run.md).

.DESCRIPTION
  Roda na raiz do repositório, sem perguntas:
    1. confere gcloud, conta e projeto;
    2. ativa as APIs (Cloud Run, Cloud Build, Artifact Registry, Secret Manager);
    3. cria o segredo anthropic-api-key a partir do packages/web/.env.local, se ainda não existir
       (com -UpdateKey grava uma versão nova com a chave atual do .env.local);
    4. dá à conta de serviço padrão permissão de ler o segredo e de rodar o Cloud Build;
    5. gcloud run deploy --source . com as variáveis públicas do Supabase lidas do .env.local;
    6. imprime a URL do serviço.
  Pode ser rodado de novo a cada atualização: os passos 2 a 4 já feitos são rápidos e não mudam nada.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-cloud-run.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-cloud-run.ps1 -UpdateKey
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-cloud-run.ps1 -DryRun   # só confere, não faz nada
#>
param(
  [string]$Project = 'national-lumber-1883b',
  [string]$Region = 'us-east1',
  [string]$Service = 'panelizer',
  [string]$SecretName = 'anthropic-api-key',
  [switch]$UpdateKey,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

function Step([string]$text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail([string]$text) { Write-Host "ERRO: $text" -ForegroundColor Red; exit 1 }
function Check([string]$what) { if ($LASTEXITCODE -ne 0) { Fail "$what falhou (código $LASTEXITCODE). Veja a saída acima." } }

function Get-EnvValue([string[]]$lines, [string]$name) {
  $line = $lines | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -replace "^\s*$name\s*=", '').Trim()
  if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

# 1. Pré-requisitos ---------------------------------------------------------------------------------
Step 'Conferindo gcloud, .env.local e projeto'
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  # Janela aberta antes da instalação não vê o PATH novo: procura o SDK nas pastas padrão e usa a primeira que existir.
  $sdkBins = @(
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin",
    "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin",
    "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin"
  ) | Where-Object { Test-Path (Join-Path $_ 'gcloud.cmd') }
  if ($sdkBins) {
    $env:PATH = ($sdkBins | Select-Object -First 1) + ';' + $env:PATH
    Write-Host "gcloud encontrado em $($sdkBins | Select-Object -First 1) (não estava no PATH desta janela)."
  } else {
    Fail 'gcloud não encontrado. Instale o Google Cloud SDK (https://cloud.google.com/sdk/docs/install) e abra um PowerShell novo.'
  }
}
if (-not (Test-Path 'Dockerfile')) { Fail "Dockerfile não encontrado em $root. O script precisa estar em scripts/ na raiz do repositório." }

$envFile = Join-Path $root 'packages\web\.env.local'
if (-not (Test-Path $envFile)) { Fail "packages\web\.env.local não existe. Veja supabase/README.md." }
$envLines = Get-Content $envFile
$anthropicKey = Get-EnvValue $envLines 'ANTHROPIC_API_KEY'
$supabaseUrl = Get-EnvValue $envLines 'NEXT_PUBLIC_SUPABASE_URL'
$supabaseKey = Get-EnvValue $envLines 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
if (-not $anthropicKey) { Fail 'ANTHROPIC_API_KEY não está no .env.local.' }
if (-not $supabaseUrl) { Fail 'NEXT_PUBLIC_SUPABASE_URL não está no .env.local.' }
if (-not $supabaseKey) { Fail 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY não está no .env.local.' }

$account = (gcloud config get-value account | Out-String).Trim()
Check 'gcloud config get-value account'
if (-not $account) { Fail 'Nenhuma conta logada. Rode: gcloud auth login' }
Write-Host "Conta:    $account"
Write-Host "Projeto:  $Project"
Write-Host "Serviço:  $Service em $Region"
Write-Host "Supabase: $supabaseUrl"

$projectNumber = (gcloud projects describe $Project --format='value(projectNumber)' | Out-String).Trim()
Check "gcloud projects describe $Project"
if (-not $projectNumber) { Fail "Projeto $Project não encontrado ou sem acesso para $account." }
if ($DryRun) { Write-Host "Número:   $projectNumber"; Write-Host ""; Write-Host "DryRun: tudo conferido, nada foi feito." -ForegroundColor Green; exit 0 }

# 2. APIs -------------------------------------------------------------------------------------------
Step 'Ativando as APIs (rápido se já estiverem ativas)'
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project $Project --quiet
Check 'gcloud services enable'

# 3. Segredo ----------------------------------------------------------------------------------------
Step "Segredo $SecretName (chave da Anthropic)"
$existing = (gcloud secrets list --project $Project --filter="name:$SecretName" --format='value(name)' | Out-String).Trim()
Check 'gcloud secrets list'
if ($existing -and -not $UpdateKey) {
  Write-Host 'Já existe; mantido. Para gravar a chave atual do .env.local como versão nova, rode com -UpdateKey.'
} else {
  $tmp = Join-Path $env:TEMP ("anthropic-key-" + [guid]::NewGuid().ToString('N') + '.txt')
  try {
    [IO.File]::WriteAllText($tmp, $anthropicKey)
    if ($existing) {
      gcloud secrets versions add $SecretName --project $Project --data-file="$tmp" --quiet
      Check 'gcloud secrets versions add'
      Write-Host 'Versão nova gravada.'
    } else {
      gcloud secrets create $SecretName --project $Project --data-file="$tmp" --replication-policy=automatic --quiet
      Check 'gcloud secrets create'
      Write-Host 'Segredo criado.'
    }
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

# 4. Permissão --------------------------------------------------------------------------------------
Step 'Permissão de leitura do segredo para a conta de serviço do Cloud Run'
$runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding $SecretName --project $Project --member="serviceAccount:$runtimeSa" --role='roles/secretmanager.secretAccessor' --quiet --format='value(etag)' | Out-Null
Check 'gcloud secrets add-iam-policy-binding'
Write-Host "OK: $runtimeSa"

# 4b. Permissão do Cloud Build ----------------------------------------------------------------------
# Em projetos criados depois de 2024 a conta de serviço padrão não ganha mais papéis automaticamente, e o
# build falha com PERMISSION_DENIED ao baixar o código enviado. O papel Cloud Build Service Account cobre
# ler as fontes, gravar a imagem no Artifact Registry e escrever os logs.
Step 'Permissão do Cloud Build para a conta de serviço padrão'
gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$runtimeSa" --role='roles/cloudbuild.builds.builder' --quiet --format='value(etag)' | Out-Null
Check 'gcloud projects add-iam-policy-binding'
Write-Host "OK: roles/cloudbuild.builds.builder para $runtimeSa"

# 5. Deploy -----------------------------------------------------------------------------------------
Step 'Deploy (Cloud Build constrói a imagem; uns 5 a 8 minutos)'
gcloud run deploy $Service --source . --project $Project --region $Region --allow-unauthenticated `
  --memory 1Gi --cpu 1 --timeout 3600 --concurrency 20 --min-instances 0 --max-instances 1 `
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$supabaseKey" `
  --set-secrets "ANTHROPIC_API_KEY=${SecretName}:latest" `
  --quiet
Check 'gcloud run deploy'

# 5b. Acesso público ----------------------------------------------------------------------------------
# O deploy só avisa (não falha) quando não consegue liberar a URL para todos. Em organizações do Google
# Workspace a política "Domain Restricted Sharing" bloqueia `allUsers`, e o site responde 403 a todo mundo.
Step 'Liberando a URL para qualquer pessoa (allUsers → roles/run.invoker)'
gcloud run services add-iam-policy-binding $Service --project $Project --region $Region --member='allUsers' --role='roles/run.invoker' --quiet --format='value(etag)' | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'O serviço foi publicado, mas a URL continua fechada (403 para todos).' -ForegroundColor Yellow
  Write-Host 'Causa provável: a política iam.allowedPolicyMemberDomains da organização proíbe membros fora do domínio.'
  Write-Host 'Abra uma exceção só para este projeto (precisa do papel Organization Policy Administrator na organização):'
  Write-Host '  console: IAM & Admin > Organization Policies > "Domain restricted sharing" > Manage policy >'
  Write-Host '           Override parent''s policy > Allow all > Set policy'
  Write-Host "  ou:      gcloud org-policies set-policy <arquivo yaml com allowAll: true para projects/$Project>"
  Write-Host 'Depois rode este script de novo. Detalhes em docs/12-hospedagem-cloud-run.md, seção 3b.'
  exit 1
}
Write-Host 'OK: URL pública.'

# 6. URL --------------------------------------------------------------------------------------------
$url = (gcloud run services describe $Service --project $Project --region $Region --format='value(status.url)' | Out-String).Trim()
Check 'gcloud run services describe'
Write-Host ''
Write-Host "Pronto. O site está em: $url" -ForegroundColor Green
Write-Host "Logs: gcloud run services logs read $Service --project $Project --region $Region --limit 100"

# 7. Saúde ------------------------------------------------------------------------------------------
# GET /api/health diz se a chave da Anthropic e o Supabase chegaram ao processo e qual revisão responde.
try {
  $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 60
  Write-Host ("Saúde: ai=" + $health.ai + " auth=" + $health.auth + " revisão=" + $health.revision)
  if (-not $health.ai) { Write-Host 'A leitura da IA está DESLIGADA: a chave não chegou ao processo. Veja o segredo e --set-secrets.' -ForegroundColor Yellow }
  if (-not $health.auth) { Write-Host 'Login DESLIGADO: faltam as variáveis do Supabase.' -ForegroundColor Yellow }
} catch {
  Write-Host "Não deu para ler $url/api/health: $($_.Exception.Message)" -ForegroundColor Yellow
}
