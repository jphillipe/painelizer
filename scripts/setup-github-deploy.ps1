<#
.SYNOPSIS
  Prepara o Google Cloud para o deploy automático pelo GitHub Actions (.github/workflows/deploy.yml).

.DESCRIPTION
  Roda uma vez, na raiz do repositório, com a conta que já faz o deploy manual (docs/12-hospedagem-cloud-run.md, seção 7):
    1. confere gcloud, conta e projeto;
    2. ativa as APIs do login sem chave (IAM, IAM Credentials, Security Token Service);
    3. cria a conta de serviço github-deploy, só para deploy;
    4. dá a ela o papel Cloud Run Source Developer no projeto e o de usar a conta de serviço do Cloud Run;
    5. cria o pool de identidade "github" e o provedor OIDC do GitHub, que só aceita tokens deste repositório na main;
    6. deixa o repositório agir como github-deploy;
    7. imprime o provedor e a conta, que precisam bater com o env do workflow.
  Pode ser rodado de novo: o que já existe é mantido.
  Não dá permissão de mudar o IAM do serviço: o deploy pelo Actions não mexe no acesso público, nas variáveis
  nem no segredo — isso continua com scripts/deploy-cloud-run.ps1.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-github-deploy.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-github-deploy.ps1 -DryRun   # só confere, não faz nada
#>
param(
  [string]$Project = 'national-lumber-1883b',
  [string]$Repo = 'jphillipe/painelizer',
  [string]$Branch = 'main',
  [string]$DeployAccount = 'github-deploy',
  [string]$Pool = 'github',
  [string]$Provider = 'github',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Step([string]$text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail([string]$text) { Write-Host "ERRO: $text" -ForegroundColor Red; exit 1 }
function Check([string]$what) { if ($LASTEXITCODE -ne 0) { Fail "$what falhou (código $LASTEXITCODE). Veja a saída acima." } }

# 1. Pré-requisitos ---------------------------------------------------------------------------------
Step 'Conferindo gcloud, conta e projeto'
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  # Janela aberta antes da instalação não vê o PATH novo: procura o SDK nas pastas padrão e usa a primeira que existir.
  $sdkBins = @(
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin",
    "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin",
    "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin"
  ) | Where-Object { Test-Path (Join-Path $_ 'gcloud.cmd') }
  if ($sdkBins) {
    $env:PATH = ($sdkBins | Select-Object -First 1) + ';' + $env:PATH
  } else {
    Fail 'gcloud não encontrado. Instale o Google Cloud SDK (https://cloud.google.com/sdk/docs/install) e abra um PowerShell novo.'
  }
}

$account = (gcloud config get-value account | Out-String).Trim()
Check 'gcloud config get-value account'
if (-not $account) { Fail 'Nenhuma conta logada. Rode: gcloud auth login' }
$projectNumber = (gcloud projects describe $Project --format='value(projectNumber)' | Out-String).Trim()
Check "gcloud projects describe $Project"
if (-not $projectNumber) { Fail "Projeto $Project não encontrado ou sem acesso para $account." }

$deploySa = "$DeployAccount@$Project.iam.gserviceaccount.com"
$runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
$poolName = "projects/$projectNumber/locations/global/workloadIdentityPools/$Pool"
$providerName = "$poolName/providers/$Provider"
$member = "principalSet://iam.googleapis.com/$poolName/attribute.repository/$Repo"

Write-Host "Conta:       $account"
Write-Host "Projeto:     $Project ($projectNumber)"
Write-Host "Repositório: $Repo, branch $Branch"
Write-Host "Deploy como: $deploySa"
if ($DryRun) { Write-Host ''; Write-Host 'DryRun: tudo conferido, nada foi feito.' -ForegroundColor Green; exit 0 }

# 2. APIs -------------------------------------------------------------------------------------------
Step 'Ativando as APIs do login sem chave (rápido se já estiverem ativas)'
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project $Project --quiet
Check 'gcloud services enable'

# 3. Conta de serviço -------------------------------------------------------------------------------
Step "Conta de serviço $DeployAccount"
$existing = (gcloud iam service-accounts list --project $Project --filter="email:$deploySa" --format='value(email)' | Out-String).Trim()
Check 'gcloud iam service-accounts list'
if ($existing) {
  Write-Host 'Já existe; mantida.'
} else {
  gcloud iam service-accounts create $DeployAccount --project $Project --display-name='GitHub Actions deploy' --quiet
  Check 'gcloud iam service-accounts create'
  Write-Host 'Criada.'
}

# 4. Papéis -----------------------------------------------------------------------------------------
# Cloud Run Source Developer cobre subir o código, rodar o Cloud Build e criar a revisão, mas não mudar o
# IAM do serviço. Service Account User deixa a revisão nova rodar como a conta padrão do Cloud Run.
Step 'Papéis da conta de deploy'
gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$deploySa" --role='roles/run.sourceDeveloper' --condition=None --quiet --format='value(etag)' | Out-Null
Check 'gcloud projects add-iam-policy-binding (run.sourceDeveloper)'
gcloud iam service-accounts add-iam-policy-binding $runtimeSa --project $Project --member="serviceAccount:$deploySa" --role='roles/iam.serviceAccountUser' --quiet --format='value(etag)' | Out-Null
Check 'gcloud iam service-accounts add-iam-policy-binding (serviceAccountUser)'
Write-Host "OK: roles/run.sourceDeveloper no projeto, roles/iam.serviceAccountUser em $runtimeSa"

# 5. Pool e provedor --------------------------------------------------------------------------------
Step "Pool de identidade $Pool e provedor do GitHub"
$existing = (gcloud iam workload-identity-pools list --project $Project --location=global --filter="name:$poolName" --format='value(name)' | Out-String).Trim()
Check 'gcloud iam workload-identity-pools list'
if ($existing) {
  Write-Host 'Pool já existe; mantido.'
} else {
  gcloud iam workload-identity-pools create $Pool --project $Project --location=global --display-name='GitHub Actions' --quiet
  Check 'gcloud iam workload-identity-pools create'
  Write-Host 'Pool criado.'
}

# A condição é o que impede outro repositório (ou um fork, ou outro branch) de usar este pool.
$condition = "assertion.repository == '$Repo' && assertion.ref == 'refs/heads/$Branch'"
$existing = (gcloud iam workload-identity-pools providers list --project $Project --location=global --workload-identity-pool=$Pool --filter="name:$providerName" --format='value(name)' | Out-String).Trim()
Check 'gcloud iam workload-identity-pools providers list'
if ($existing) {
  gcloud iam workload-identity-pools providers update-oidc $Provider --project $Project --location=global --workload-identity-pool=$Pool --attribute-condition="$condition" --quiet
  Check 'gcloud iam workload-identity-pools providers update-oidc'
  Write-Host 'Provedor já existe; condição reaplicada.'
} else {
  gcloud iam workload-identity-pools providers create-oidc $Provider --project $Project --location=global --workload-identity-pool=$Pool `
    --display-name='GitHub' --issuer-uri='https://token.actions.githubusercontent.com' `
    --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref' `
    --attribute-condition="$condition" --quiet
  Check 'gcloud iam workload-identity-pools providers create-oidc'
  Write-Host 'Provedor criado.'
}

# 6. Repositório → conta de deploy ------------------------------------------------------------------
Step "Deixando $Repo agir como $DeployAccount"
gcloud iam service-accounts add-iam-policy-binding $deploySa --project $Project --member="$member" --role='roles/iam.workloadIdentityUser' --quiet --format='value(etag)' | Out-Null
Check 'gcloud iam service-accounts add-iam-policy-binding (workloadIdentityUser)'
Write-Host "OK: $member"

# 7. Conferência ------------------------------------------------------------------------------------
Write-Host ''
Write-Host 'Pronto. O env de .github/workflows/deploy.yml precisa ter:' -ForegroundColor Green
Write-Host "  WIF_PROVIDER: $providerName"
Write-Host "  DEPLOY_SA: $deploySa"
Write-Host 'O primeiro deploy automático roda no próximo push na main (ou em Actions > Deploy > Run workflow).'
