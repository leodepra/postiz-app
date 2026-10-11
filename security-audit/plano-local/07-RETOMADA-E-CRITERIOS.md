# Retomada da segurança local — entrega 1

Data: 2026-10-10. Caminho confirmado pelo usuário: **continuar a segurança do Postiz local**, sem migrar funcionalidades para outro projeto nesta etapa.

**Situação: planejamento atualizado; aplicação não liberada para contas reais.** A revisão desta data não alterou código de produção, não iniciou serviços e não instalou software. As mudanças já presentes são candidatas, não uma versão de segurança aprovada.

## Escopo e decisões mantidas

- Windows desta máquina, agora com execução nativa conforme decisão posterior do usuário; sem publicação na LAN/internet, túnel, relay, bucket ou acesso a pastas pessoais. O [adendo Windows](C:/Claude/postiz-app/security-audit/plano-local/08-WINDOWS-NATIVO.md) prevalece sobre instruções de contêineres e atualiza as evidências desta retomada.
- Origem Windows definida: `http://localhost:7443`, somente em loopback. O callback do Google deve corresponder exatamente a esse endereço.
- Uma conta local, recuperação administrativa local, cadastro público desligado.
- YouTube é o piloto. Instagram/TikTok continuam desabilitados até comprovação de compatibilidade oficial com as restrições. Publicar nas três redes e comentar nelas continua sendo o objetivo funcional mais amplo, não um resultado já entregue.
- Nenhuma conta real, autorização OAuth externa ou publicação de teste nesta fase de correção e testes com dados artificiais.
- Agendamentos dependem de máquina ligada, serviço ativo e internet. Proposta operacional conservadora: jobs vencidos durante uma parada aguardam revisão, sem publicação automática ao religar.

## Evidências e limites da revisão

As nove verificações registradas em `security-audit/local-tests.log` e o typecheck do frontend pertencem à execução anterior. Não foram repetidos nesta revisão. O backend passou em uma revisão anterior, com alterações posteriores ainda sem build final. O build completo do frontend e o worker permanecem pendentes.

A última consulta de dependências está em `security-audit/dependencies-after.json`: quatro avisos críticos e 130 altos no inventário que inclui desenvolvimento. Esses números não foram atualizados em 2026-10-10 e não equivalem à quantidade de vulnerabilidades exploráveis. A triagem é uma tarefa obrigatória, não uma isenção presumida para dependências transitivas.

Em 2026-10-10, o comando `docker` não foi encontrado no PATH consultado e o executável do Docker Desktop não foi encontrado no caminho padrão. Isso não exclui instalação em outro local; funcionamento do daemon e do WSL2 precisa ser confirmado na etapa de ambiente.

### Lacunas confirmadas na política candidata, sem executar o servidor

Foi carregada a função real `localSecurity`, usando o carregador TypeScript dos testes, objetos de requisição/resposta simulados e origem local. Nenhuma requisição de rede foi enviada. Resultado observado:

| Entrada POST | Decisão do middleware | Observação |
|---|---|---|
| `/media/generate-image` | Bloqueia com 404 | Caminho previsto no filtro. |
| `/media/Generate-image` | Chama a próxima etapa | A comparação de nomes não trata variações de caixa. |
| `/posts/generator` | Bloqueia com 404 | Caminho previsto no filtro. |
| `/posts/Generator` | Chama a próxima etapa | Mesma inconsistência. |
| `/auth/login` | Chama a próxima etapa | Também coincide com a expressão do rate limit. |
| `/auth/login/` | Chama a próxima etapa | Não coincide com a expressão atual do rate limit. |

“Chama a próxima etapa” não significa resposta HTTP 200 do aplicativo nem exploração completa: o roteamento Nest/Express, a autenticação e o controlador não foram exercitados. A evidência demonstra divergência entre políticas; o teste integrado deverá verificar o caminho completo. Não declarar a desativação das funcionalidades comprovada com base nos testes anteriores.

## Ordem de execução

Cada item abaixo deve produzir código revisável, teste aplicável e registro do resultado. R01–R04 podem avançar sem Docker. R05 prepara a instalação; R06 e os testes integrados seguintes dependem do runtime. Não esperar pela instalação para corrigir as lacunas de código.

### R01 — Fechar rotas e aplicar rate limit ao endpoint efetivo — P0

Relaciona-se a L06, L10, L13; validação V06, V09, V12.

**Arquivos principais:** `apps/backend/src/services/auth/local-security.middleware.ts`, `libraries/nestjs-libraries/src/throttler/throttler.provider.ts`, controladores e `apps/frontend/src/proxy.ts`.

1. Inventariar método e rota de cada endpoint necessário ao perfil local. Substituir permissões amplas por raiz e listas parciais de bloqueio por permissões explícitas; tudo fora delas fica indisponível.
2. Usar uma política consistente de caixa, barras finais, codificação e métodos entre gateway, middleware e roteador. Rejeitar variantes ambíguas antes de qualquer efeito; não normalizar IDs ou dados arbitrariamente.
3. Aplicar limite de tentativas ao login efetivamente atendido, preferencialmente com metadados/guard do controlador, evitando depender só de uma expressão sobre a URL bruta. Cobrir barra final e query string; não confiar em `X-Forwarded-For` do cliente.
4. Validar cabeçalhos internos como bytes antes da comparação constante, rejeitar entradas malformadas sem erro 500 e impedir que cabeçalhos externos obtenham privilégios internos.
5. Testar funções auxiliares, chamadas indiretas, controladores sem autenticação, frontend e callback; esconder uma opção na interface não basta.

**Aceite:** os exemplos acima, variantes codificadas, métodos alternativos e rotas não listadas não executam funcionalidades desativadas. Todas as variantes de login aceitas compartilham limite. Testar também um login legítimo e rotas necessárias para não bloquear o piloto por engano.

### R02 — Proteger tokens em todo o percurso — P0

Relaciona-se a L05, L08, L14; validação V05, V10, V13.

**Arquivos principais:** helpers de sessão/cifragem, `prisma.service.ts`, `integration-cipher-middleware.ts`, `var/local/bootstrap.cjs`, `compose.local.yaml` e atividades/workflows do orchestrator.

1. Mapear onde tokens são recebidos, cifrados, decifrados, retornados, enfileirados e registrados. A interceptação Prisma atual cobre escritas diretas de Integration; investigar escritas aninhadas, consultas SQL e caminhos alternativos.
2. Evitar transportar a entidade Integration completa e credenciais entre atividades/workflows. Preferir IDs e obter o token dentro da atividade que precisa usá-lo. Examinar resultados, falhas, heartbeats, dados de upload retomável e históricos existentes. Se ainda houver payload sensível, projetar cifragem específica e testar compatibilidade cliente/worker/replay.
3. Garantir que logs, respostas de erro e exportações de diagnóstico não incluam tokens, cabeçalhos, códigos OAuth ou URLs de upload com credenciais. Usar tokens sintéticos marcados para procurar vazamentos em todas as persistências.
4. Separar segredos por serviço. O `local_config` atual é montado em frontend, backend e worker; reduzir o frontend ao mínimo comprovadamente necessário. A chave de tokens do banco não deve ser entregue ao frontend por conveniência.
5. Definir rotação e recuperação das chaves; não converter banco anterior automaticamente nem sobrescrever segredos. Banco novo dedicado é o padrão. Se aparecerem dados reais, inventariar e preservar antes de qualquer migração.

**Aceite:** login, logout, expiração e recuperação invalidam acesso conforme previsto; não há token sintético em texto claro no banco, histórico Temporal, logs, bundle, source map ou backup exportado. Acesso em memória pelo processo publicador permanece necessário e deve ser registrado como limite.

### R03 — Garantir propriedade e leitura restrita da mídia — P0

Relaciona-se a L09, L11, L16; validação V07, V08, V10, V15.

**Arquivos principais:** `local-media.ts`, controladores de mídia/posts, `posts.service.ts`, `youtube.provider.ts`, `var/local/Caddyfile` e a rota de uploads do Next.

1. Validar arquivo e propriedade no agendamento e novamente quando a atividade vai publicar, incluindo mídia excluída, ID trocado, miniatura e caminhos recebidos de etapas anteriores.
2. Restringir leitura a registros autorizados e ao volume de mídia. Testar traversal, links simbólicos, arquivo substituído, extensões/MIME, arquivos incompletos e janelas entre validação e abertura. Não buscar localhost por HTTP para contornar SSRF.
3. Verificar Range/HEAD, cache privado e ausência de uma rota anônima equivalente no gateway ou no Next. Conteúdo ativo não pode executar na origem da interface.
4. Aplicar validação de destino em cada retomada/redirect de upload, não apenas na criação da sessão. Não registrar a URL sensível retornada pela plataforma.

**Aceite:** somente a sessão autorizada visualiza mídia e somente o worker autorizado lê os bytes selecionados; nenhuma URL/caminho arbitrário permite ler outros arquivos ou publicar mídia de outro registro.

### R04 — Fechar dependências e gerar artefatos finais — P0

Relaciona-se a L03, L05, L21; validação V13, V17.

1. Repetir o inventário de avisos; classificar cada crítico/alto por caminho, uso no build, uso em runtime, entrada controlável e correção/removal disponível. Os quatro críticos anteriores incluem happy-dom, tar e dois avisos de tinypool.
2. Remover dependências de funcionalidades desativadas quando possível, atualizar dependências compatíveis e revisar qualquer mudança de versão principal. Testar módulos nativos usados de fato; não habilitar indiscriminadamente scripts de instalação de terceiros.
3. O Dockerfile candidato copia `/app` inteiro do build. Substituir por artefatos/dependências mínimos e demonstrar que compiladores, ferramentas de teste e pacotes desnecessários não entram no runtime aprovado.
4. Usar Node 22 e pnpm 10.6.1, lockfile congelado, builds finais de backend/frontend/worker e inventário da imagem. Resolver versões/digests antes da liberação; não inventar digest nem usar uma tag móvel como prova de reprodutibilidade.

**Aceite:** builds e regressões passam na configuração final, imagem sem segredos, nenhum crítico/alto alcançável permanece sem tratamento. Uma exceção por não alcançabilidade exige evidência do artefato final e revisão; a contagem global isolada não aprova nem reprova uma integração.

### R05 — Preparar ambiente, conta única e TLS — P0

Relaciona-se a L00, L02, L04, L05, L13; validação V01, V03–V05, V09, V10.

1. Confirmar instalação funcional de WSL2/Docker e recursos disponíveis; concluir a etapa administrativa quando necessária. Não presumir sucesso a partir da existência de um executável.
2. Conferir conflito da sub-rede candidata `172.30.251.0/24` com VPN/LAN/WSL e ocupação da porta 7443. Se for preciso trocar endereços, alterar Compose, guard, bootstrap e testes em conjunto.
3. Validar sintaxe/configuração efetiva de Compose e Caddy. Confirmar disponibilidade/adequação da imagem Temporal escolhida; o servidor de desenvolvimento com SQLite é candidato a piloto, não homologação de operação cotidiana.
4. Completar a inicialização do banco dedicado sem `--accept-data-loss`, criar a conta por console local e verificar credenciais/permissões de volumes. A configuração atual não demonstra esse procedimento completo.
5. Testar o script de segredos com dados descartáveis, recusa de sobrescrita, ACLs no Windows e acesso mínimo nos contêineres.
6. No perfil Windows HTTP, exigir bind `127.0.0.1`, origem e Host exatos, cookie host-only `HttpOnly` e `SameSite=Lax`; verificar que nenhuma autoridade local foi instalada. TLS continua obrigatório nas conexões externas, como Supabase e provedores sociais.
7. Acrescentar verificações reais de prontidão e de encerramento. Ordem de início de contêiner não significa serviço pronto.

**Aceite:** conta inicial e recuperação funcionam; porta só em loopback; certificado válido para a origem; volumes e mounts conferidos; nenhuma credencial impressa. Nenhuma instalação, importação de certificado ou reinicialização do Windows é considerada realizada por este plano.

### R06 — Demonstrar isolamento de entrada e saída — P0

Relaciona-se a L04, L07; validação V01–V03, V08, V10–V12, V19.

1. Testar namespace/regras com aplicação sem NET_ADMIN: TCP/UDP, IPv4/IPv6, IP literal, DNS externo e DNS embutido do Docker, host/LAN, gateway e conexões que ignoram proxy.
2. Substituir a prova de prontidão baseada somente em `/tmp/ready` por verificação do estado efetivo ou controle equivalente. Se o guard falhar ou for recriado, a aplicação não pode continuar publicando sem isolamento demonstrado.
3. Confirmar que destinos não autorizados são recusados antes de resolução no proxy, inclusive userinfo, sufixos de domínio, redirects e resolução para IP reservado. Provar também conexão permitida com serviço de teste controlado.
4. Limitar recursos de conexão/resolução e verificar encerramento de sockets. Confirmar que gateway, banco, Temporal e proxy não oferecem caminhos alternativos para a aplicação chegar ao host ou à internet.
5. Inspecionar bindings e testar de outro equipamento autorizado, quando disponível. Ausência de equipamento mantém V02 pendente; não substituir por uma inferência sobre o YAML.

**Aceite:** negativos falham mesmo com bibliotecas sem configuração de proxy; positivos necessários funcionam; reinício e falha dos componentes não abrem acesso. O proxy limita destinos, mas não impede que um processo comprometido envie conteúdo indevido a um destino permitido; minimização de arquivos e permissões continua necessária.

### R07 — Eliminar saídas desnecessárias do navegador e serviços — P0

Relaciona-se a L06, L12; validação V06, V12, V13, V17.

1. Revisar módulos inicializados, não apenas rotas. Desabilitar efetivamente IA, billing, telemetria, newsletters, MCP, ingestão externa e filas que não participam do piloto.
2. Auditar variáveis compiladas no frontend e scripts/componentes que possam iniciar conexões. Limpar variáveis em runtime não remove valores já incorporados no build.
3. Revisar a CSP candidata, inclusive `unsafe-inline`, e avaliar nonce compatível com Next antes de declarar proteção contra scripts injetados. Testar funcionamento real da UI e OAuth; não ampliar domínios para eliminar erros sem justificar a necessidade.
4. Observar login, upload, prévia, erro, configurações e idle no navegador e nos serviços, sem armazenar HAR com segredos.

**Aceite:** nenhum destino não necessário recebe dados nos cenários testados; recursos excluídos não são executáveis por rotas alternativas; segredos de backend não estão no JavaScript entregue ao navegador.

### R08 — Validar OAuth e canal YouTube com serviços simulados — P0

Relaciona-se a L01, L08, L15–L17; validação V05, V14, V15.

1. Vincular state à sessão, conta local, organização e provedor. A ordem atual consome a chave de state antes de validar a sessão; rever consumo atômico após validação, concorrência e recuperação de falhas.
2. Confirmar callback exato, expiração, finalidade, rejeição de replay e tentativas vindas de outra sessão. Revisar escopos estritamente necessários para upload e comentário, sem restaurar analytics/parceiro apenas para contornar erro.
3. Testar a seleção de canal com respostas simuladas da API e propriedade do canal, renovação de token, desconexão, rate limits e destino de upload.
4. Após os testes locais, reconfirmar documentação oficial e registro do aplicativo do usuário. A etapa com conta real requer ação específica de autorização e publicação.

**Aceite:** sessão/estado corretos completam o fluxo; sessão revogada, estado reutilizado, provedor trocado ou canal indevido são rejeitados. A integração não utiliza relay nem torna `/uploads` público.

### R09 — Fechar agendamento e comentários sem duplicações — P1 funcional

Relaciona-se a L16, L18–L20; validação V15, V16, V19.

1. Testar relógio/fuso, suspensão do Windows, perda de internet, timeout após envio, retries e reinício no meio do upload. Persistir estado suficiente para distinguir publicação concluída de tentativa desconhecida.
2. Implementar comentário YouTube apenas pelo endpoint oficial aplicável, depois da confirmação da publicação e vinculado ao vídeo/canal autorizado. Modelar horário absoluto ou atraso após a publicação de forma explícita na interface.
3. Tratar resultado desconhecido de publicação/comentário com reconciliação ou revisão, evitando repetir cegamente uma ação remota.
4. Manter funcionalidades ausentes indisponíveis e indicadas na UI. Aprovação da segurança do perfil não autoriza afirmar que comentários ou as três redes estão funcionais.

**Aceite:** cenários simulados não criam posts/comentários duplicados nem publicam atrasados inesperadamente. O teste externo usa conta/conteúdo indicados pelo usuário e autorização específica; não é executado automaticamente como parte do build.

### R10 — Restaurar, registrar e liberar — P0 para uso cotidiano

Relaciona-se a L19–L22; validação V01–V19 conforme recursos efetivos.

1. Criar backup cifrado local consistente; restaurar em ambiente sem saída de rede e com workers/publicação suspensos. Separar material de recuperação da cópia exportada.
2. Registrar versões/digests, configuração não secreta, testes, falhas, limites e procedimentos de parar/revogar/atualizar. Não incluir dumps com tokens, senhas ou mídia pessoal nos MDs.
3. Atualizar a matriz com evidência do mesmo artefato final. Evidência de revisão anterior é revalidada quando a alteração afeta a proteção correspondente.

**Aceite:** restauração comprovada, testes essenciais concluídos, nenhuma falha bloqueadora aberta e funcionalidades habilitadas claramente listadas. A aprovação é do perfil/artefato testado; não significa que o Postiz original ou qualquer implantação futura esteja automaticamente seguro.

## Marcos para acompanhamento

| Marco | Condição para encerrar | Situação atual |
|---|---|---|
| M1 — Correções de código | R01–R04 corrigidos/revisados, builds finais e regressões | Pendente; há implementação parcial anterior. |
| M2 — Ambiente isolado | R05–R07 validados na máquina, sem contas reais | Pendente; Docker não localizado na verificação atual. |
| M3 — Piloto simulado | R08 e cenários de R09 passam sem envio real | Pendente. |
| M4 — Liberação controlada | R10 e aceite de segurança, seguido de autorização específica do teste externo | Pendente. |

Não estimar conclusão por quantidade de arquivos alterados ou de testes unitários. A ordem imediata é **R01, R02, R03 e R04**; R05 pode ser preparado em paralelo como trabalho de ambiente, sem pressupor delegação a outros agentes. Instagram/TikTok ficam para avaliação separada, preservando os limites já definidos.
