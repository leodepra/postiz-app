# Estado da entrega 1

Atualização: 2026-10-08. **Implementação em andamento; não liberada para contas reais.** Este registro complementa o planejamento original e distingue implementação de validação.

Revisão de planejamento em 2026-10-10: o usuário confirmou a continuidade do Postiz local. A [retomada R01–R10](C:/Claude/postiz-app/security-audit/plano-local/07-RETOMADA-E-CRITERIOS.md) acrescenta divergências observadas no filtro de rotas e no rate limit, detalha a proteção de tokens fora do banco e estabelece a ordem de fechamento. As evidências de build/teste abaixo são históricas; não houve nova homologação nem correção de código nessa revisão documental.

## Evidências disponíveis

- Nove testes passaram em `security-audit/local-tests.log`: sessões opacas com expiração/revogação; criptografia autenticada; operações de gravação cifradas; proxy de saída; bloqueio de IP literal e IPv6 mapeado; origem/Host/rotas; configuração; confinamento de mídia. Os testes usam dados fictícios. O teste de proxy utiliza socket temporário em loopback.
- Uma compilação do backend passou. Houve alterações posteriores, portanto ainda é necessário repetir o build final do backend e compilar o worker.
- A compilação do frontend chegou à verificação TypeScript e falhou em `Headers.entries` no fetch interno. O uso foi substituído por `Headers.forEach`; a verificação completa de tipos (`tsc --noEmit`) passou após a correção. Falta confirmar o build de produção completo.
- Dependências e lockfile foram atualizados com pnpm 10.6.1, sem execução automática dos scripts de instalação. O cliente Prisma foi gerado separadamente. O Node disponível no Windows é 24; o projeto requer Node 22 e a configuração candidata de contêiner usa essa linha.
- A consulta ao registro npm em `security-audit/dependencies-after.json` inclui todas as versões do lockfile, inclusive desenvolvimento: 4 avisos críticos, 130 altos, 147 moderados e 29 baixos. Não é uma prova de explorabilidade nem comparação direta com a auditoria inicial limitada a produção. O `pnpm audit` esgotou memória; `security-audit/audit-lock.cjs` consulta o inventário sem expandir cada caminho.

## Alterações preparadas

Perfil `POSTIZ_LOCAL_ONLY`, sessão local de 30 minutos mantida no Redis, rejeição de tokens JWT como sessão local, revogação e invalidação por mudança de senha, cookies seguros com interpretação explícita de booleanos, validação de Host/Origin e bloqueio de recursos não necessários. Provedores limitados ao YouTube; leitura de arquivos locais confinada; rota de mídia com autenticação e propriedade; tokens de integração cifrados no banco com AES-GCM e chave separada.

Arquivos em `var/local` e `compose.local.yaml` preparam gateway HTTPS em `127.0.0.1:7443`, volumes dedicados, rede interna, namespace com regras de saída e proxy com destinos exatos. Somente a configuração YAML foi inspecionada; **não houve execução desses contêineres nem comprovação de isolamento**. Scripts de geração de segredos e criação/recuperação de conta estão preparados, mas não foram executados.

## Pendências que bloqueiam o encerramento

1. Concluir a instalação administrativa de WSL2/Docker Desktop no Windows. A tentativa automática anterior falhou na etapa administrativa; o executável do Docker Desktop segue ausente no caminho padrão. Nenhum contêiner foi iniciado.
2. Confirmar os builds finais com Node 22, módulos nativos e lockfile atualizado; verificar configuração efetiva, imagens, permissões dos volumes, certificados, bootstrap da conta e recuperação.
3. Completar a triagem/correção dos avisos altos e críticos. Os quatro críticos restantes atingem `happy-dom` (via `@pigment-css/react`/transformação e pares do Vitest), `tar` (via `@mapbox/node-pre-gyp`, bcrypt/canvas) e dois avisos de `tinypool` (via Vitest, também transitivo de Copilot). Presença no lockfile não demonstra uso em uma rota, mas esses caminhos ainda não foram aprovados nem removidos da imagem candidata.
4. Testar saída direta sem proxy, DNS, IPv6, acesso ao host/LAN e acesso de outra máquina; verificar que regras do namespace continuam efetivas após reinicialização. Fixar imagens por digest e revisar a separação de dependências de build/runtime.
5. Testar login/logout, limite de tentativas, callback OAuth, consumo de estado, uploads protegidos e publicação com mocks de ponta a ponta. Rever todos os caminhos de leitura/gravação de tokens, inclusive histórico do Temporal e logs: a cifragem no banco **não comprova proteção desses outros locais**.
6. Validar o fluxo do YouTube e a seleção do canal. Comentários no YouTube não foram implementados. Nenhuma conta real foi conectada, nenhum conteúdo foi publicado e nenhuma integração foi autorizada externamente.
7. Atualizar a matriz de aceite e o guia operacional com os resultados efetivos antes de liberar a entrega.

O Docker é uma dependência para a validação prática, mas não é a única pendência. Não executar o Compose original como substituto, abrir portas na LAN, criar túneis ou desabilitar verificações para contornar os bloqueios.
