# Auditoria de segurança do Postiz — 7 de outubro de 2026

**Parecer: não recomendo colocar esta cópia na internet nem conectar contas importantes antes de corrigir os itens prioritários abaixo.** Para conhecer a interface, usaria uma instalação isolada, com contas de teste e sem credenciais pessoais. Baixar o código, por si só, não significa que o computador foi invadido.

Não encontrei, nos caminhos examinados, evidência de uma porta dos fundos deliberada ou de envio obrigatório das suas credenciais aos autores. Isso não comprova a ausência de código malicioso em todo o projeto, nas dependências ou nas imagens distribuídas. Há problemas concretos de segurança suficientes para impedir uma aprovação de uso em produção nesta revisão.

## Escopo e limites

- Código local: `C:\Claude\postiz-app`.
- Commit: `3128e870e653b1763c47392784df20f5e58cc087`, datado de 2026-10-07. A árvore estava limpa antes da auditoria.
- Revisão direcionada de autenticação, recuperação de senha, autorização, rotas públicas, upload, URLs externas, armazenamento de tokens, telemetria, Docker e dependências.
- Cinco verificações isoladas executam trechos do código real, com serviços externos e banco simulados. Elas confirmam comportamentos específicos; não são um teste completo da aplicação em execução.
- A aplicação não foi iniciada, não foram instaladas suas dependências, e não foram usadas contas reais ou enviados ataques a servidores. Não examinei firewall, TLS, processos em execução ou uma implantação existente.
- Foram consultados avisos públicos de segurança e o registro npm. A consulta npm envia informações sobre nomes/versões de dependências, não o conteúdo das suas contas.
- A auditoria não modificou código de aplicação ou configurações. Os únicos arquivos novos são os artefatos desta pasta.
- Não é uma certificação de segurança, uma análise exaustiva de todas as integrações ou uma garantia contra invasões. A imagem Docker `latest` pode conter código diferente deste checkout e não foi inspecionada.

## Achados prioritários

### A01 — Dependências com avisos críticos, inclusive Next.js no Windows

**Severidade: crítica quando os requisitos do aviso se aplicam. Evidência: versão confirmada no projeto e avisos publicados; exploração não executada.**

O projeto fixa `next` em **16.3.1**, inclusive nos overrides: [package.json](C:/Claude/postiz-app/package.json:193). O lockfile também resolve essa versão.

O [aviso oficial GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) descreve execução remota de código em aplicações hospedadas em sistema de arquivos Windows, em configurações com Pages/App Router sem Cache Components; a correção da linha 16 está em **16.3.3**. Esta aplicação usa App Router e não habilita Cache Components no arquivo de configuração examinado. Se executada diretamente no Windows, há forte indicação de aplicabilidade. A localização do checkout no Windows não prova que seu servidor será Windows: um contêiner Linux é uma situação diferente.

Outros avisos para essa versão incluem [otimização de AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), corrigida em 16.3.3, e [ImageResponse em Node](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), corrigida em 16.3.6. Não localizei uso explícito de `next/og`/`ImageResponse` na busca no frontend, portanto **não classifico esse último caminho como explorável nesta aplicação**. A disponibilidade do otimizador AVIF exige validação na implantação.

`pnpm audit --prod --json` retornou **336 ocorrências: 13 críticas, 141 altas, 153 moderadas e 29 baixas**. São 286 URLs distintas de avisos; versões/faixas diferentes podem produzir entradas repetidas. Isso não equivale a 336 vulnerabilidades comprovadamente exploráveis no Postiz.

Exemplos adicionais encontrados no lockfile: `form-data@2.3.3`, por dependência do cliente Telegram, e `happy-dom@15.11.7`, por dependências que incluem Vitest. Ferramentas de teste chegam à árvore de produção por dependências transitivas; presença não prova execução de seu caminho vulnerável.

**Correção:** atualizar Next e dependências compatíveis, considerando todos os avisos atuais, regenerar o lockfile com a versão de pnpm adotada pelo projeto, executar os testes e auditar novamente. 16.3.6 é o mínimo para os três avisos de Next citados, não uma garantia de ausência de outros problemas. Não aplicar atualizações forçadas em massa sem validar compatibilidade.

**Limitação da ferramenta:** o ambiente forneceu pnpm **11.19.0**, enquanto o projeto declara **10.6.1**. A ferramenta avisou que não interpreta `pnpm.overrides` e `pnpm.onlyBuiltDependencies` dentro de `package.json`. Não houve instalação nem alteração do lockfile. As versões destacadas foram conferidas no lockfile; repetir a auditoria com o gerenciador declarado é parte da validação antes da implantação. Resultado integral: [dependencies.json](C:/Claude/postiz-app/security-audit/dependencies.json).

### A02 — Segredo público de exemplo e serviços administrativos publicados

**Severidade: crítica se o segredo de exemplo for mantido; alta para serviços administrativos alcançáveis sem proteção. Evidência: configuração fornecida, não exposição real medida.**

O [docker-compose.yaml](C:/Claude/postiz-app/docker-compose.yaml:11) contém um `JWT_SECRET` de exemplo, conhecido por qualquer pessoa que leia o repositório. O verificador apenas exige que a variável não esteja vazia: [configuration.checker.ts](C:/Claude/postiz-app/libraries/helpers/src/configuration/configuration.checker.ts:31). Se essa configuração for usada literalmente, um atacante conhece a chave que assina os tokens. O middleware consulta os privilégios no banco, o que impede inventar privilégios apenas no corpo do token, mas ainda permite falsificar a identidade de um usuário cujo ID seja conhecido.

O Compose publica no host as portas **7233** (Temporal), **8080** (interface Temporal) e **8969** (Spotlight), além da aplicação em 4007. Não configura autenticação/TLS para esses serviços administrativos. As publicações não estão restritas a `127.0.0.1`; o alcance externo depende do Docker, da rede e do firewall. Temporal acessível permite acesso operacional a workflows e seus dados. Spotlight pode expor dados de diagnóstico quando utilizado.

O [Compose de desenvolvimento](C:/Claude/postiz-app/docker-compose.dev.yaml:18) ainda publica PostgreSQL/Redis e painéis, incluindo pgAdmin com senha de exemplo. O próprio arquivo diz que não se destina a produção.

**Correção:** gerar um segredo aleatório forte antes da primeira utilização; trocar senhas de exemplo; retirar a publicação de serviços internos ou vinculá-los ao loopback; proteger acesso administrativo; usar HTTPS para a aplicação; desabilitar cadastro público após criar a conta necessária. `DISABLE_REGISTRATION=false` é o padrão e permite a terceiros criar contas e alcançar funcionalidades autenticadas se o serviço estiver acessível.

**Cuidado numa instalação já utilizada:** `JWT_SECRET` também cifra outros dados. Trocar a chave sem migração pode tornar credenciais armazenadas ilegíveis. Planejar rotação e reconexão das integrações, sem apenas substituir o valor e esperar que tudo continue funcionando.

### A03 — Tokens de sessão sem expiração e confusão com recuperação de senha

**Severidade: alta. Evidência: fluxo de código e teste isolado confirmado.**

[AuthService.signJWT](C:/Claude/postiz-app/libraries/helpers/src/auth/auth.service.ts:42) assina os tokens sem `expiresIn`/`exp`. O cookie vencer em um ano não faz o token deixar de ser válido no servidor. [Logout](C:/Claude/postiz-app/apps/backend/src/api/routes/users.controller.ts:367) limpa cookies; não revoga a credencial copiada. [updatePassword](C:/Claude/postiz-app/libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts:212) altera a senha, sem invalidar sessões existentes.

A recuperação de senha usa a mesma assinatura e um campo particular chamado `expires`, que não é o `exp` padrão: [auth.service.ts](C:/Claude/postiz-app/apps/backend/src/services/auth/auth.service.ts:214). O [middleware de autenticação](C:/Claude/postiz-app/apps/backend/src/services/auth/auth.middleware.ts:43) aceita qualquer payload assinado com `id` de usuário existente e ativado; não exige finalidade de sessão nem verifica esse campo `expires`.

**Impacto:** se um link de recuperação vazar, seu token pode servir de credencial de sessão mesmo depois do prazo de 20 minutos informado no email. Não basta conhecer o email: o atacante precisa obter o token válido. Um token de sessão roubado também continua útil após logout/troca de senha, enquanto a conta e a assinatura permanecerem válidas. O reset não registra consumo de token, permitindo reutilização dentro de sua validade no endpoint de troca.

**Validação:** o teste executou o método real do middleware com um payload de recuperação cujo `expires` era de 2000, assinatura previamente considerada válida e banco simulado. A requisição foi aceita. A biblioteca criptográfica não foi substituída em produção nem testada contra uma conta real.

**Correção:** separar finalidades (`session`, `password-reset`, `activation`), validar `issuer`/`audience`/tipo e `exp`, usar recuperação de uso único e expiração curta, e implementar revogação de sessões ao sair/trocar senha. Restringir os dados incluídos no JWT. Evitar reutilizar a chave de sessão para criptografia de integrações.

### A04 — Rota pública de vídeo serve HTML de terceiros como conteúdo da aplicação

**Severidade: alta. Evidência: comportamento confirmado em teste isolado; execução em navegador não testada.**

[PublicController.streamFile](C:/Claude/postiz-app/apps/backend/src/api/routes/public.controller.ts:168) exige somente que a URL termine em `mp4`, mas repassa o `Content-Type` e os bytes retornados pelo servidor remoto. Não exige MIME de vídeo, não força download e não aplica CSP de sandbox nessa resposta. A rota é pública. No Docker fornecido, `/api/` é encaminhado ao backend no mesmo domínio do frontend.

**Impacto:** um servidor controlado por terceiro pode devolver uma página HTML no lugar do vídeo. Se a vítima abrir o link correspondente no Postiz, há um caminho para execução de JavaScript na origem da aplicação (XSS), leitura de dados da API e ações com sua sessão. `HttpOnly` não impede um script na mesma origem de fazer requisições autenticadas. A CSP existente em `/uploads/` não protege essa outra rota.

**Validação:** o método real encaminhou uma resposta simulada `text/html` com um marcador de script, sem modificar o corpo e sem adicionar `Content-Disposition` ou CSP. Nenhuma URL de atacante foi acessada.

**Correção:** aceitar apenas tipos de mídia previstos, verificar conteúdo, recusar HTML/SVG ativo, aplicar `nosniff` e sandbox adequados; preferir uma origem separada para conteúdo não confiável. Bloquear temporariamente essa rota até corrigir.

### A05 — Ausência de proteção CSRF em ações sensíveis

**Severidade: alta, condicionada ao envio dos cookies pelo navegador. Evidência: análise estática; não houve exclusão de conta nem teste destrutivo.**

Os cookies de autenticação usam `SameSite=None`. Não identifiquei middleware global de CSRF nem checagem de origem para ações como [POST /user/delete-account](C:/Claude/postiz-app/apps/backend/src/api/routes/users.controller.ts:330), que não exige senha atual ou confirmação adicional no servidor. A validação de `Content-Type: application/json` presente em uma rota OAuth não se aplica globalmente.

**Impacto:** uma página externa pode tentar fazer o navegador da vítima enviar uma ação autenticada, inclusive exclusão de conta, nas condições em que o navegador envie esses cookies. CORS não impede o envio de formulários simples; em geral impede a leitura da resposta. Restrições a cookies de terceiros variam e não substituem a proteção da aplicação.

**Correção:** verificar origem nas mutações, implementar token CSRF para autenticação por cookie, ajustar SameSite quando compatível e exigir reautenticação para exclusão de conta/ações críticas. Validar com dois domínios de teste e conta descartável.

### A06 — Proteção contra requisições à rede interna possui lacunas

**Severidade: alta potencial; impacto depende da rede e do transporte. Evidência: bypass do validador confirmado, outros caminhos por inspeção.**

O [validador de URLs](C:/Claude/postiz-app/libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts:49) só reconhece IPv4 embutido em IPv6 quando escrito com pontos. O parser de URL normaliza esse endereço para hexadecimal. Nos testes, uma URL HTTPS equivalente a loopback passou como pública. O bloqueio de IPv6 link-local também usa apenas o prefixo textual `fe80:`, em vez de normalizar toda a faixa.

Há ainda um caminho distinto: [POST /webhooks/send](C:/Claude/postiz-app/apps/backend/src/api/routes/webhooks.controller.ts:57) valida a URL inicial pelo DTO, mas usa `fetch` sem o dispatcher seguro e sem controle de redirecionamentos. Um destino inicialmente público pode redirecionar para um endereço interno; o código não revalida cada salto. A consulta de RSS por `/autopost/send` também usa `parser.parseURL` sem o transporte seguro observado em outras rotas.

**Impacto:** possibilidade de usar o servidor como intermediário para alcançar serviços internos. No caminho de teste de webhook a resposta não é devolvida, portanto trata-se principalmente de SSRF cego/efeitos no destino. Não comprovei extração de metadados de nuvem, acesso a Temporal ou execução de comandos por esses caminhos. HTTPS/TLS, redirecionamentos, bibliotecas e conectividade afetam o resultado.

**Correção:** normalizar IPv4/IPv6 com biblioteca apropriada, cobrir todas as faixas reservadas, bloquear IP literal privado e cada redirecionamento, aplicar resolução DNS validada na conexão e limitar destinos/saída de rede. Manter `DISABLE_SSRF_PROTECTION` desativado.

### A07 — Login, cadastro e recuperação sem limite efetivo na aplicação

**Severidade: média a alta, conforme exposição. Evidência: teste isolado confirmado.**

O [guard global](C:/Claude/postiz-app/libraries/nestjs-libraries/src/throttler/throttler.provider.ts:10) limita apenas alguns caminhos de posts/comentários. Para `/auth/login`, `/auth/register` e `/auth/forgot`, retorna `true` sem executar o limitador; os métodos correspondentes não têm guard específico. Configurar `API_LIMIT` não resolve isso.

**Impacto:** facilita tentativas automatizadas de senha, criação de contas e abuso de emails/CPU. O bcrypt é síncrono, o que aumenta o custo de requisições repetidas para o servidor. Onde existe limitação por IP, o código confia no primeiro `X-Forwarded-For`, e o nginx padrão acrescenta o IP à lista recebida, exigindo cuidado contra falsificação.

**Correção:** limitar por conta e origem confiável, adicionar atraso progressivo, quotas de envio/cadastro e tratamento correto da cadeia de proxies. Usar senha única e forte; para acesso pessoal, uma camada externa de autenticação com MFA pode reduzir a exposição.

### A08 — NOT_SECURED="false" desativa proteções de cookie

**Severidade: média, aumenta o impacto de outras falhas. Evidência: teste isolado confirmado.**

O [controller de autenticação](C:/Claude/postiz-app/apps/backend/src/api/routes/auth.controller.ts:79) testa a presença da variável, não seu valor booleano. Variáveis de ambiente são texto: `"false"` é verdadeiro nesse teste. A orientação comentada no `.env.example` pode, portanto, induzir a uma configuração insegura.

**Impacto:** mesmo configurada com o texto `false`, a variável remove `Secure`/`HttpOnly` e habilita comportamentos alternativos de transporte do token.

**Correção:** comparar explicitamente com `'true'` em todos os usos. Até corrigir, deixar `NOT_SECURED` ausente/vazia para manter as proteções e configurar HTTPS corretamente.

### A09 — Tokens de redes sociais legíveis no banco de dados

**Severidade: média como falta de defesa adicional; impacto alto se banco/backup for comprometido. Evidência: caminho de persistência examinado.**

O fluxo de conexão repassa `accessToken` e `refreshToken` e o [repositório](C:/Claude/postiz-app/libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts:334) os grava diretamente. A camada Prisma examinada não cifra esses campos. Algumas integrações específicas cifram seus próprios dados, mas isso não protege uniformemente os tokens OAuth.

**Impacto:** quem obtiver um dump, backup ou acesso de leitura ao banco poderá usar tokens dentro dos escopos concedidos pelas redes. Isto não significa que qualquer visitante consegue ler o banco. Criptografia de disco/volume também não protege contra um usuário de banco autorizado a consultar esses campos.

**Correção:** cifrar credenciais com AEAD e chave gerenciada separadamente, restringir banco/backups, evitar exposição de portas, limitar escopos OAuth e definir procedimento de revogação. Credenciais cifradas com a chave disponível no mesmo servidor não ficam protegidas de um comprometimento completo desse servidor.

### A10 — Build Docker pode incorporar o arquivo .env à imagem

**Severidade: alta se a imagem/contexto for compartilhado com segredos reais. Evidência: configuração de build.**

[Dockerfile.dev](C:/Claude/postiz-app/Dockerfile.dev:22) executa `COPY . /app`. O [.dockerignore](C:/Claude/postiz-app/.dockerignore:1) não exclui `.env`/`.env.*`. O `.gitignore` não controla o contexto de build Docker.

**Impacto:** se você criar um `.env` real e depois construir uma imagem usando esse Dockerfile/contexto, suas chaves podem entrar em camadas da imagem e ser obtidas por quem tiver acesso à imagem ou ao serviço de build. Não identifiquei um `.env` real nesta revisão nem afirmei que uma imagem sua já vazou.

**Correção:** excluir arquivos de segredos do contexto; injetar segredos apenas em runtime ou usar mounts de segredo no build quando necessário. Se uma imagem com segredos já foi distribuída, remover o arquivo de builds futuros não apaga as camadas antigas: revogar/rotacionar credenciais afetadas. O processo da aplicação também roda sem `USER` final no Dockerfile; reduzir privilégios é uma melhoria adicional de contenção.

## Privacidade e conteúdo compartilhado

**Arquivos enviados e prévias não devem ser considerados um cofre privado.** O nginx serve `/uploads/` sem autenticação. A [prévia pública de posts](C:/Claude/postiz-app/apps/backend/src/api/routes/public.controller.ts:55) recupera posts pelo ID sem exigir organização/autenticação, e o [repositório](C:/Claude/postiz-app/libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts:408) não exige estado publicado nessa consulta. Quem receber uma URL/ID válido pode acessar conteúdo correspondente, inclusive rascunhos. Não constatei enumeração simples dos IDs; o problema é tratar um link não adivinhável como controle de acesso permanente, sem consentimento/revogação específica.

**Telemetria existe e depende de configuração.** O [Sentry](C:/Claude/postiz-app/libraries/nestjs-libraries/src/sentry/initialize.sentry.ts:29), se `NEXT_PUBLIC_SENTRY_DSN` estiver preenchido, registra contexto com email/ID, logs e entradas/saídas de OpenAI (`recordInputs`/`recordOutputs`). Há integrações condicionais com PostHog, DataFast, Meta e newsletters. Plausible/Dub são habilitados em caminhos ligados à configuração de cobrança; não ativar essas variáveis sem revisar os destinos e a finalidade.

Não encontrei nesses caminhos envio obrigatório de todas as credenciais para um servidor dos autores em uma instalação self-hosted padrão. Isso não elimina o compartilhamento esperado com redes sociais, provedores de IA, email, armazenamento ou processamento de mídia quando você habilita esses recursos. Para maior privacidade, habilitar apenas serviços necessários, usar contas próprias dos provedores e evitar registrar prompts/conteúdo sensível em telemetria.

## Controles positivos e problemas antigos já tratados

- Senhas locais usam bcrypt com custo 10; não são gravadas diretamente como texto.
- A autenticação consulta usuário, ativação e organizações no banco; não aceita o privilégio `isSuperAdmin` apenas porque veio no corpo do JWT.
- Diversas consultas administrativas e operações de dados incluem filtro por organização. Isso é positivo, mas não equivale a revisar todos os caminhos contra acesso entre organizações.
- O upload local inspeciona o tipo real dos arquivos e restringe formatos; nginx adiciona `nosniff` e CSP restritiva para `/uploads/`.
- O handler de uploads agora resolve o caminho e confina a leitura ao diretório de uploads. O [antigo aviso de traversal](https://github.com/gitroomhq/postiz-app/security/advisories/GHSA-4hgh-5rhf-4qpm) informa correção em 2.22.1; o controle correspondente está presente nesta cópia. Não o contei como vulnerabilidade atual.
- Há proteção de DNS no dispatcher usado em vários downloads, associada ao [aviso antigo de SSRF](https://github.com/gitroomhq/postiz-app/security/advisories/GHSA-f7jj-p389-4w45). A06 aponta lacunas atuais, e não ausência total desse controle.

## Condições para uso

| Cenário | Parecer desta revisão |
|---|---|
| Apenas guardar e ler o código baixado | A revisão não indica que o simples download tenha comprometido o computador. |
| Avaliar a interface em ambiente isolado, com dados descartáveis | Aceitável como avaliação, reduzindo portas expostas e sem segredos reais. |
| Executar diretamente no Windows com acesso de outras máquinas | Não recomendo com Next 16.3.1; corrigir A01 antes. |
| Usar contas pessoais/profissionais em um servidor público | Não recomendo no estado auditado. Corrigir os achados e validar em execução. |
| Uso pessoal atrás de VPN/autenticação adicional | Reduz exposição; não corrige tokens, XSS, conteúdo público ou dependências. Exige correções antes de confiar contas importantes. |

Ordem recomendada:

1. Atualizar componentes vulneráveis e escolher um runtime/contêiner suportado; não usar uma imagem `latest` não verificada como prova de correção.
2. Fechar serviços internos, trocar os valores de exemplo antes do primeiro uso, habilitar HTTPS e restringir cadastro/acesso.
3. Corrigir sessões/reset, a rota de streaming, CSRF, SSRF, limitação de autenticação e interpretação de variáveis booleanas.
4. Proteger credenciais e contexto Docker; revisar backups, links públicos, permissões OAuth e telemetria.
5. Validar em ambiente descartável com navegador e banco reais: separação de organizações, expiração/revogação de tokens, ataques de origem cruzada, MIME/redirects, portas e regras de firewall. Auditar a imagem efetivamente implantada.

## Artefatos e reprodução segura

- [Script de verificações isoladas](C:/Claude/postiz-app/security-audit/validate-findings.cjs).
- [Resultado: cinco verificações concluídas](C:/Claude/postiz-app/security-audit/validation-results.json).
- [Resultado completo de dependências](C:/Claude/postiz-app/security-audit/dependencies.json).

Para repetir somente os testes isolados, a partir da raiz do repositório, executar `node security-audit/validate-findings.cjs` com Node que forneça `stripTypeScriptTypes` (a execução registrada usou Node 24.18.0). O script lê os arquivos do checkout, executa trechos em ambiente controlado e não inicia a aplicação, não acessa rede e não altera dados. Os testes verificam a presença dos comportamentos encontrados; após correções, devem ser adaptados para exigir a rejeição segura, não preservados como expectativas funcionais do produto.
