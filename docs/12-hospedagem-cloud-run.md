# 12 — Hospedagem no Cloud Run (Google Cloud / Firebase)

Decisão de 2026-10-29: o app roda no **Cloud Run**, no projeto Google da National Lumber (conta no plano Blaze,
criada em 2026-10-28). Motivo: a Vercel corta a leitura da IA (mais de 10 min) e recusa uploads acima de 4,5 MB;
no Cloud Run o tempo por requisição vai a 60 min e o corpo a 32 MB, e o uso de testes fica dentro das cotas
gratuitas. O Supabase continua sendo o banco e o login. Ver `04-decisoes.md`.

O que vai para lá é a imagem do `Dockerfile` da raiz: build do Next em modo standalone, só o que o rastreio de
arquivos lista. `gcloud run deploy --source .` manda o código ao Cloud Build, que constrói a imagem e publica.

## O caminho curto: um script

Com o gcloud instalado e logado (passo 1 abaixo), tudo o mais é um comando só, na raiz do repositório:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-cloud-run.ps1
```

`scripts/deploy-cloud-run.ps1` ativa as APIs, cria o segredo da Anthropic a partir do `packages/web/.env.local`
(se ainda não existir), dá a permissão à conta de serviço e roda o deploy, sem perguntas; no fim imprime a URL.
Serve também para cada atualização. `-DryRun` só confere conta, projeto e `.env.local` sem fazer nada;
`-UpdateKey` grava a chave atual do `.env.local` como versão nova do segredo. As seções 2 e 3 explicam o que
o script faz, para quem preferir comando a comando. Para o deploy sair sozinho a cada push na `main`, ver a seção 7.

## 1. Uma vez: programas e acesso

1. Instale o **Google Cloud SDK**: https://cloud.google.com/sdk/docs/install (Windows: instalador; marque
   "Run gcloud init" no fim ou rode o passo 2).
2. No PowerShell:
   ```powershell
   gcloud auth login
   gcloud config set project national-lumber-1883b
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   ```
   `national-lumber-1883b` é o **Project ID** (não o nome), visível em Project settings no Firebase ou no seletor de
   projetos do Google Cloud. O `auth login` abre o browser: entre com a conta Google da empresa.

## 2. Uma vez: a chave da Anthropic como segredo

A chave da API não vai em variável de ambiente nem no código: fica no **Secret Manager**, e o Cloud Run a monta
na variável `ANTHROPIC_API_KEY` em cada instância. Os comandos abaixo leem a chave do `packages/web/.env.local`
(sem mostrá-la), gravam num arquivo temporário, criam o segredo e apagam o arquivo. Rodar na raiz do repositório:

```powershell
$key = (Get-Content packages\web\.env.local | Where-Object { $_ -like "ANTHROPIC_API_KEY=*" }) -replace "^ANTHROPIC_API_KEY=", ""
[IO.File]::WriteAllText("$env:TEMP\anthropic-key.txt", $key.Trim())
gcloud secrets create anthropic-api-key --data-file="$env:TEMP\anthropic-key.txt" --replication-policy=automatic
Remove-Item "$env:TEMP\anthropic-key.txt"
$projectNumber = gcloud projects describe national-lumber-1883b --format="value(projectNumber)"
gcloud secrets add-iam-policy-binding anthropic-api-key --member="serviceAccount:$projectNumber-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

A última linha deixa a conta de serviço padrão do Cloud Run ler o segredo. Para trocar a chave depois:
`gcloud secrets versions add anthropic-api-key --data-file=...` e um novo deploy.

Projetos criados depois de 2024 têm mais um passo, que o script também faz: a conta de serviço padrão
(`<número>-compute@developer.gserviceaccount.com`) não ganha mais papéis automaticamente, e o primeiro deploy falha
com `PERMISSION_DENIED … could not resolve source`. Resolve dando a ela o papel do Cloud Build, uma vez:

```powershell
gcloud projects add-iam-policy-binding national-lumber-1883b --member="serviceAccount:$projectNumber-compute@developer.gserviceaccount.com" --role="roles/cloudbuild.builds.builder"
```

## 3. Deploy (a primeira vez e a cada atualização)

Na raiz do repositório, no PowerShell (a crase no fim de cada linha continua o comando). As duas primeiras
linhas leem a URL e a chave pública do Supabase do `packages/web/.env.local`:

```powershell
$supabaseUrl = ((Get-Content packages\web\.env.local | Where-Object { $_ -like "NEXT_PUBLIC_SUPABASE_URL=*" }) -replace "^[^=]+=", "").Trim()
$supabaseKey = ((Get-Content packages\web\.env.local | Where-Object { $_ -like "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=*" }) -replace "^[^=]+=", "").Trim()
gcloud run deploy panelizer --source . --region us-east1 --allow-unauthenticated `
  --memory 1Gi --cpu 1 --timeout 3600 --concurrency 20 --min-instances 0 --max-instances 1 `
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$supabaseKey" `
  --set-secrets "ANTHROPIC_API_KEY=anthropic-api-key:latest"
```

- Na primeira vez o gcloud pergunta se pode criar o repositório de imagens (`cloud-run-source-deploy`): sim.
- O build leva uns 5 a 8 minutos (instala o workspace e roda o `next build`). No fim imprime a URL do serviço,
  do tipo `https://panelizer-xxxxxxxxxx-ue.a.run.app`. Abra: deve pedir login.
- `--allow-unauthenticated` só quer dizer que a URL é pública; o login do app continua barrando quem não tem conta.
- `--timeout 3600`: uma requisição pode durar até 60 min (a leitura leva ~10). `--max-instances 1`: o registro de
  leituras em curso vive na memória do processo (M7); com uma instância só, progresso, cancelar e retomar após
  F5 funcionam como no localhost. Sobe para mais quando os jobs forem para o banco.
- `--memory 1Gi`: o pdf.js e o resvg (PDF das folhas) passam de 512 MB em conjuntos grandes.

Atualizações: o mesmo comando. Variáveis, segredo, memória e limites ficam guardados na revisão anterior, então
um deploy sem as flags também vale: `gcloud run deploy panelizer --source . --region us-east1`.

Para ver a URL depois: `gcloud run services describe panelizer --region us-east1 --format "value(status.url)"`.
Logs: `gcloud run services logs read panelizer --region us-east1 --limit 100`, ou no console, em Cloud Run › panelizer › Logs.

### 3b. URL pública e a política da organização

O projeto está na organização Google Workspace da National Lumber (`nationallumberusa.com`), e organizações novas
vêm com a política **Domain Restricted Sharing** (`iam.allowedPolicyMemberDomains`) ligada: nenhum recurso pode ser
compartilhado com quem não é do domínio, o que inclui `allUsers`. Por isso o `--allow-unauthenticated` só avisa
(`Setting IAM policy failed`) e a URL responde **403 Forbidden** para todo mundo, antes mesmo de chegar ao app.

A saída é uma **exceção só neste projeto**, que precisa do papel *Organization Policy Administrator* na organização
(quem administra o Google Workspace da empresa tem, ou pode dar à conta `sales@`):

1. Console: https://console.cloud.google.com/iam-admin/orgpolicies/iam-allowedPolicyMemberDomains?project=national-lumber-1883b
   › **Manage policy** › *Override parent's policy* › regra **Allow all** › **Set policy**.
2. Ou, no PowerShell, na raiz do repositório (o arquivo já está em `scripts/`):
   ```powershell
   gcloud org-policies set-policy scripts/cloud-run-allow-public.yaml
   ```

Depois, rode o script de novo (ou só `gcloud run services add-iam-policy-binding panelizer --region us-east1
--member=allUsers --role=roles/run.invoker`). A exceção vale só para este projeto; o resto da organização continua
protegido. O login do app continua sendo a barreira de verdade: a URL pública só mostra a tela de login.

### 3c. Conferir o deploy: `/api/health`

`GET /api/health` responde, sem login e sem expor valores, o que o processo enxerga:

```json
{"ok":true,"ai":true,"auth":true,"service":"panelizer","revision":"panelizer-00003-s8k"}
```

`ai: false` quer dizer que `ANTHROPIC_API_KEY` não chegou (segredo ou `--set-secrets`); `auth: false`, que faltam as
variáveis do Supabase. O script lê esse endpoint no fim de cada deploy e avisa. Fonte: `src/lib/health.ts`.

Atenção ao build da imagem: ele roda **sem** `.env.local` e sem variáveis. Uma página que lê `process.env` ou o
usuário sem passar por `cookies()`/`headers()` é pré-renderizada estática nesse build, e o site serve o HTML
congelado (foi o caso de `/app` em 2026-10-30: "AI reading is off" e header sem usuário, com o segredo montado).
Essas rotas declaram `export const dynamic = 'force-dynamic'`; a tabela de rotas do build deve mostrá-las com ƒ.

O `extract` renderiza recortes das plantas em Node com `@napi-rs/canvas` (módulo nativo, prebuilt para `linux-x64-gnu`).
Ele é dependência direta e importado estaticamente, e está em `serverExternalPackages` no `next.config.ts`, para o rastreio
do build levar o binário ao `standalone`. Para conferir na imagem: `docker run --rm -w /app/packages/web <imagem> node -e
"console.log(require('@napi-rs/canvas').createCanvas(8,8).encodeSync('png').length)"` deve imprimir um número. Se faltar, o log do
Cloud Run mostra `Cannot find module '@napi-rs/canvas'` na primeira leitura e a saída é `outputFileTracingIncludes`.

## 4. Limites e custo

- **Corpo da requisição: 32 MB.** Um conjunto de folhas maior que isso dá erro antes de chegar ao app. Resolve
  na S22.3 (upload direto ao Supabase Storage).
- **Custo**: o Cloud Run cobra por segundo de CPU e memória enquanto processa pedidos, com cotas gratuitas
  mensais (180 mil vCPU-s, 360 mil GiB-s, 2 milhões de pedidos). Uma leitura de 10 min usa ~600 vCPU-s: cabem
  ~300 leituras por mês de graça; acima, centavos por leitura. Com `--min-instances 0` nada roda, nem custa,
  sem acesso; a primeira requisição depois de um tempo parado demora uns segundos a mais (cold start).
- **Alerta de orçamento**: Billing › Budgets & alerts › US$ 5, avisos por e-mail.

## 5. Testar a imagem localmente (opcional, precisa de Docker)

```powershell
docker build -t panelizer-web .
docker run --rm -p 8080:8080 --env-file packages\web\.env.local panelizer-web
```

Abra http://localhost:8080. É exatamente o que o Cloud Run roda.

## 6. Domínio próprio (depois)

Cloud Run › panelizer › Manage custom domains, ou Firebase Hosting na frente. Não é necessário para testes.

## 7. Deploy automático a cada push na main (GitHub Actions)

`.github/workflows/deploy.yml` roda a cada push na `main` (e pelo botão Actions › Deploy › Run workflow):

1. **Tests and typecheck** — `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`. Se algo falhar,
   o deploy não acontece. Os testes que precisam da chave da Anthropic ou dos PDFs de `docs/examples` se pulam.
2. **Cloud Run** — entra no Google sem chave guardada (Workload Identity Federation), roda
   `gcloud run deploy --source .` e confere `/api/health`; falha se `ai` ou `auth` vierem `false`.

O deploy pelo Actions **só troca o código**: variáveis do Supabase, segredo da Anthropic, memória, timeout e
acesso público vêm da revisão anterior, como o Cloud Run faz quando a linha de comando não os menciona. Para
mudar qualquer um deles, rode `scripts/deploy-cloud-run.ps1` (que continua servindo para deploy manual).

**Uma vez**, com a conta que já faz o deploy manual:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-github-deploy.ps1
```

O script cria a conta de serviço `github-deploy` (papéis Cloud Run Source Developer no projeto e Service Account
User na conta padrão do Cloud Run — nada de mudar IAM) e o pool `github` com um provedor OIDC que só aceita
tokens do repositório `jphillipe/painelizer` na `main`: fork, outro repositório ou outro branch não entram.
No fim imprime o provedor e a conta, que precisam bater com o `env` do workflow. `-DryRun` só confere.

Um deploy de cada vez (`concurrency`): um push durante um deploy espera ele terminar. Cada push na `main` vira
um deploy de 5 a 8 minutos; trabalho que ainda não deve ir para o ar fica em outro branch.
