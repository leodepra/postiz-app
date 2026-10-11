# Plano de implementação e rastreabilidade

Estado em 2026-10-10: plano-base L00–L22 com implementação parcial, ainda sem aceite completo. O [estado da entrega](C:/Claude/postiz-app/security-audit/plano-local/06-ESTADO-ENTREGA-1.md) registra o que foi feito; a [retomada R01–R10](C:/Claude/postiz-app/security-audit/plano-local/07-RETOMADA-E-CRITERIOS.md) determina a ordem atual e relaciona os itens abaixo aos testes. Não interpretar os checkboxes pendentes como ausência de todo trabalho nem como autorização para refazer alterações já existentes.

P0 bloqueia a conexão de contas reais. P1 deve ser concluído antes do uso cotidiano com dados pessoais. Uma funcionalidade pode ficar desabilitada no servidor em vez de ser corrigida imediatamente, desde que a desativação seja testada e não deixe caminhos equivalentes acessíveis.

## Fase 0 — Confirmar o ambiente e a viabilidade sem segredos

- [ ] **L00 / P0:** inventariar Windows, virtualização, WSL2, recursos de disco/RAM, listeners existentes e runtime disponível. Não assumir que `wsl.exe` confirma instalação. Registrar evidência sem imprimir variáveis de ambiente ou credenciais.
- [ ] **L01 / P0:** confirmar no portal de cada plataforma o tipo de aplicativo, callback local permitido, escopos, revisão exigida e limites. Não criar túnel nem hospedar arquivos para contornar incompatibilidade. Dependência: [matriz de integrações](C:/Claude/postiz-app/security-audit/plano-local/03-INTEGRACOES.md).
- [ ] **L02 / P0:** definir uma origem local HTTPS consistente para UI/API/cookies/callbacks e eliminar relays OAuth externos. Confirmar certificado e suporte do navegador. Se precisar mudar infraestrutura global ou contrariar as restrições do usuário, apresentar a necessidade antes de executar.

## Fase 1 — Reduzir exposição e tornar o build reproduzível

| ID / prioridade | Achado | Mudança a executar | Evidência de conclusão |
|---|---|---|---|
| L03 / P0 | A01 | Atualizar Next e dependências críticas alcançáveis; revisar transitivas; alinhar pnpm ao projeto; separar dependências de build/runtime. Reconsultar avisos na execução. | Lockfile reproduzível, build/testes passando, auditoria triada por caminho, sem crítico/alto alcançável não resolvido. |
| L04 / P0 | A02 | Criar Compose exclusivo de uso local, sem herdar portas perigosas. Remover painéis e publicar só a entrada em loopback. | Configuração mesclada efetiva e teste de rede, inclusive IPv6, sem acesso pela LAN. |
| L05 / P0 | A02, A10 | Segredos aleatórios por instalação, exclusão de `.env*` e arquivos sensíveis no build; runtime sem privilégios e sem montagens pessoais. | Imagem/camadas sem segredos, montagem/usuário/permissões verificados. |
| L06 / P0 | Privacidade | Desabilitar telemetria, IA, newsletter, cobrança, MCP/relay e provedores desnecessários no servidor e frontend. | Rotas desativadas e captura de tráfego sem os destinos removidos. |
| L07 / P0 | A06 | Implementar saída de rede controlada, sem alternativa direta; proteger acesso ao host e à LAN; separar manutenção de runtime. | Conexões permitidas funcionam e negativas falham mesmo ignorando variáveis de proxy. |

**Arquivos de entrega previstos:** Compose local independente, configuração de gateway/TLS, política de saída, exemplo de ambiente sem segredos, `.dockerignore` revisado, Dockerfile de produção mínimo e instruções de inicialização/parada. Os nomes e valores finais serão definidos durante a implementação; não usar os exemplos de portas do Compose atual como configuração aprovada.

## Fase 2 — Corrigir os caminhos que permanecem perigosos em localhost

### L08 / P0 — Sessões e recuperação de senha (A03)

Alterar `libraries/helpers/src/auth/auth.service.ts`, o serviço de autenticação, middleware e persistência de sessões/reset.

- No perfil local, a implementação candidata utiliza sessão opaca de 30 minutos, mantida no Redis sob hash do identificador. JWT não autentica sessão nesse perfil; esta decisão substitui a proposta inicial de JWT de sessão. Validar expiração, revogação, indisponibilidade/reinício do Redis e invalidação por mudança de senha no servidor real.
- Recuperação local por console, sem endpoints de reset por email nesse perfil. Validar que reset/ativação/convite nunca autenticam sessão e que os caminhos alternativos estão efetivamente desativados. Se uma implantação futura habilitar reset web, ele precisa de finalidade própria, validade curta e consumo atômico de uso único; isso não faz parte do piloto local.
- Revogar sessões no logout, mudança de senha e ação explícita de encerrar sessões. Validar estado/versão no servidor.
- Não incluir objeto completo de usuário no JWT. Separar chaves de assinatura, criptografia e demais finalidades.
- No perfil local, não habilitar email externo de recuperação por padrão. Projetar recuperação administrativa local, sem endpoint público de reset de emergência.
- Se já houver dados, elaborar migração antes de trocar `JWT_SECRET`, pois a chave também cifra outros registros.

Aceite: token vencido, consumido, de outro propósito ou revogado é rejeitado. Login legítimo e recuperação local funcionam sem revelar segredo em log.

### L09 / P0 — HTML externo e mídia (A04)

Desabilitar `/public/stream` no perfil local ou corrigir validação de MIME/conteúdo, cabeçalhos e sandbox. Remover o caminho público de prévias; servir mídia local somente a usuário autenticado, ou por acesso interno limitado ao worker. Upload para a rede deve ler o arquivo pelo seu registro autorizado, não depender de uma URL pública.

Validar que nginx/Next não fornecem uma segunda rota anônima para o mesmo arquivo. Tratar symlinks, caminhos normalizados, ownership e arquivos truncados. Não quebrar a proteção SSRF global para permitir que o worker leia `localhost`; usar acesso interno explícito ou leitura local confinada.

Aceite: HTML/SVG ativo não executa na origem da UI; nenhuma mídia ou prévia pode ser obtida sem a autorização prevista; publicação direta continua funcionando.

### L10 / P0 — CSRF, host e origem (A05)

Exigir origem permitida e proteção CSRF em mutações por cookie; proteger também exclusão de conta e rotação de chave com reautenticação. Validar `Host` e WebSocket. Usar SameSite compatível com o fluxo OAuth escolhido; não escolher `Strict` cegamente se isso quebrar callback. O callback deve validar estado/PKCE quando aplicável, uso único e URI registrada exata.

Aceite: página de outra origem e hostname de rebinding não conseguem ler dados ou executar mutações; login e callbacks legítimos continuam funcionando. Bloquear por CORS apenas não cumpre o requisito.

### L11 / P0 — SSRF e conteúdo remoto (A06)

Normalizar IPv4/IPv6, cobrir endereços mapeados e faixas reservadas, aplicar transporte com resolução validada e revalidar redirects. Desabilitar webhooks/RSS/importação remota no servidor para este perfil. Proteger também callbacks de integração e URLs de upload recebidas de APIs, preservando parâmetros assinados necessários sem registrá-los.

Aceite: corpus de IPs/redirects/rebinding bloqueado em teste isolado; não há caminho alternativo pelo worker, MCP ou download de avatar. `DISABLE_SSRF_PROTECTION` não é habilitado.

### L12 / P0 — Cookies e flags (A08)

Interpretar booleanos explicitamente e centralizar opções de cookie. `NOT_SECURED="false"` mantém Secure/HttpOnly. Desligar transporte de token por headers de resposta e parâmetros de URL quando desnecessário ao perfil. Não aceitar segredo de exemplo ou configuração incompatível com o modo protegido; falhar na inicialização com mensagem sem valores secretos.

Aceite: testes de variável ausente/false/true, TLS e cookies; nenhuma correção depende de desligar verificação de certificados.

### L13 / P1 — Tentativas e conta única (A07, A02)

Aplicar rate limit de login/recuperação/cadastro com origem confiável, atraso progressivo e limites de tamanho; revisar custo síncrono de hash. Criar a conta inicial por procedimento local controlado, desabilitar novo cadastro e métodos de criação alternativos. Não usar cabeçalho `X-Forwarded-For` do cliente como identidade confiável.

Aceite: uma segunda conta não pode ser criada, tentativas excessivas são contidas e mudança de header não contorna o limite; usuário legítimo tem recuperação local definida.

## Fase 3 — Proteger credenciais e habilitar uma rede por vez

- [ ] **L14 / P1 / A09:** cifrar tokens de integração com AEAD e chave separada, identificador de versão e plano de migração. Restringir banco/volumes/backups; mascarar logs, URLs e payloads de workflows. Não guardar chave e backup na mesma cópia exportada. Criptografia não impede leitura pelo processo autorizado enquanto ele está comprometido.
- [ ] **L15 / P0 por rede:** eliminar `redirectmeto.com` e qualquer relay não aprovado; provar callback local direto. O fallback em HTTP não pode continuar silenciosamente.
- [ ] **L16 / P0 por rede:** adaptar YouTube/TikTok comum para arquivo local autorizado e tamanho/stream corretos; investigar upload direto oficial no Instagram. Falta de compatibilidade deixa a rede desabilitada, sem fallback para upload externo.
- [ ] **L17 / P1 por rede:** revisar permissões solicitadas. YouTube atualmente pede escopos amplos, incluindo parceiro e analytics; justificar cada um e remover o desnecessário após verificar dependências. Usar 2FA nas plataformas e tokens revogáveis de aplicativos próprios.
- [ ] **L18 / P1 funcional:** validar publicação e comentários separados. Completar implementação de comentários somente quando houver API oficial, permissão e caminho funcional confirmado. Não usar cookies do navegador, raspagem de sessão ou extensão como solução automática.

## Fase 4 — Validar, entregar e manter

- [ ] **L19:** executar [a matriz de validação](C:/Claude/postiz-app/security-audit/plano-local/04-VALIDACAO.md) primeiro com dados falsos e serviços locais controlados.
- [ ] **L20:** conectar uma conta de teste da rede piloto e testar conteúdo não sensível/visibilidade restrita quando suportada. Publicação é uma ação real: não publicar como mero teste de segurança sem instrução específica.
- [ ] **L21:** registrar inventário do build, versão/digest, portas, destinos autorizados, testes e limitações; treinar procedimento de backup/restauração/revogação.
- [ ] **L22:** habilitar contas importantes só depois dos critérios de liberação; ampliar uma rede por vez repetindo L01, L15–L20.

## Regras de continuidade

Esta revisão atualiza o planejamento. A autorização anterior para executar a entrega 1 permanece no histórico; estes MDs não ampliam o escopo para firewall global, exposição externa ou publicação real. Na execução, perguntar apenas por decisões faltantes que mudem os limites acordados ou por intervenção técnica indispensável.

Parar o trecho afetado e perguntar se for necessário expor serviço, adicionar intermediário/cloud, ampliar acesso a pastas pessoais, conceder escopo que não corresponde ao uso ou adotar API que não atenda às regras da plataforma. Não relaxar segurança silenciosamente para atingir compatibilidade.
