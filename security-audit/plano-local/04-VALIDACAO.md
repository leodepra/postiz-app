# Validação antes de liberar contas reais

Estado em 2026-10-10: nove testes automatizados anteriores passaram, mas a matriz de aceite integrada permanece pendente. O ambiente protegido completo ainda não foi executado. Novas lacunas na política de rotas foram observadas na [revisão de retomada](C:/Claude/postiz-app/security-audit/plano-local/07-RETOMADA-E-CRITERIOS.md); elas não são cobertas pelo resultado anterior.

Os cinco testes antigos em `security-audit/validate-findings.cjs` demonstram comportamentos vulneráveis com dependências simuladas. Eles **não** aprovam segurança nem substituem os testes abaixo. Preservá-los como evidência histórica identificada e usar a suíte em `security-audit/tests` para expectativas de rejeição segura, ampliando-a com servidor/banco/navegador descartáveis.

## Cobertura disponível e trabalho restante

| Evidência anterior | Itens relacionados | O que ela ainda não comprova |
|---|---|---|
| Sessões opacas com store simulado | V05 | Login/logout/recuperação reais, TTL e indisponibilidade do Redis. |
| Middleware com requisições simuladas | V04, V06, V09, V12 | Roteamento real, variantes de caixa/barras/codificação, limite de tentativas e bloqueio de todas as rotas. |
| Criptografia e middleware Prisma com operação simulada | V13 | Persistência real, escritas aninhadas, histórico Temporal, logs, artefatos e backup. |
| Classificação de IPs, dispatcher e recusas do proxy via socket loopback | V08, V11 | Firewall, saída ignorando proxy, DNS, IPv6, redirects completos e reinício do guard. |
| Resolução de caminho de mídia | V07, V10 | Propriedade no servidor/worker, symlinks, substituição concorrente e rotas alternativas. |
| Backend compilado anteriormente e frontend com typecheck posterior | V17 | Build completo atual dos três serviços, módulos nativos, imagem mínima e dependências triadas. |

Todos os Vxx continuam pendentes de aceite completo. Registrar falhas/retestes sem apagar a evidência anterior; não marcar Vxx como aprovado apenas porque um teste unitário relacionado passou.

## Matriz de aceite

| ID | Teste | Resultado exigido | Evidência sem segredos |
|---|---|---|---|
| V01 | Listeners no Windows e bindings Docker, IPv4/IPv6 | Só a entrada local em loopback; nada em wildcard ou IP da LAN. | Lista filtrada de portas/bindings e configuração efetiva. |
| V02 | Acesso a partir da LAN e por interfaces VPN/WSL aplicáveis | UI/API e serviços internos inacessíveis a outras máquinas. | Resultado de conexão usando somente equipamentos autorizados; se indisponíveis, marcar teste pendente. |
| V03 | Banco/Redis/Temporal/painéis | Sem portas publicadas; comunicação interna apenas entre serviços previstos. | Inspeção das redes e tentativas negativas controladas. |
| V04 | TLS/cookies/Host | Certificado aceito, origem exata, Secure/HttpOnly; host arbitrário e header forjado rejeitados. | Cabeçalhos com tokens mascarados, testes localhost/IPv6. |
| V05 | Sessão e recuperação local | Sessão vencida/revogada e JWT de outro propósito negados; reset web indisponível; logout e troca de senha pelo console invalidam acesso. | Testes de integração com usuários artificiais, Redis e console local. |
| V06 | CSRF e DNS rebinding | Outra origem não lê dados nem altera estado; hostname externo apontando a loopback é recusado. | Navegador de teste, endpoints reversíveis; não excluir conta real. |
| V07 | HTML remoto, upload e prévias | MIME falso/script recusado; conteúdo não autenticado indisponível; caminho alternativo nginx/Next também protegido. | Fixtures inofensivas, cabeçalhos e códigos HTTP. |
| V08 | SSRF | IPv4/IPv6 mapeado, redirects, DNS rebinding e destinos privados bloqueados. | Serviços-fake isolados; nunca usar metadados reais ou máquinas de terceiros. |
| V09 | Rate limit e cadastro | Tentativas limitadas em toda variante de login atendida, cadastro fechado após provisionamento, X-Forwarded-For não permite contorno. | Pequena sequência limitada, incluindo barra final/query string; sem carga agressiva. |
| V10 | Acesso a arquivos | Processo não lê pasta pessoal/perfil/chaves/socket Docker; lê somente volumes previstos. | Teste com arquivo sentinela sem informações pessoais e inspeção de mounts. |
| V11 | Saída de rede | Destino não autorizado/IP direto/DNS alternativo negado, inclusive sem respeitar configuração de proxy. | Logs de decisão de rede com metadados mínimos. |
| V12 | Telemetria | Nenhuma conexão a analytics/IA/newsletters/relays não necessários em login, upload, erro e idle. | Captura controlada de destinos; não capturar tokens/conteúdo de terceiros. |
| V13 | Segredos | Sem chave na imagem, bundle frontend, source map, logs, URL persistida, erro ou backup não cifrado. | Busca em artefatos com fixtures e resultado redigido. |
| V14 | OAuth por rede | Callback direto local; state válido e de uso único; PKCE quando aplicável; sem redirectmeto ou fallback externo. | Diagrama/hosts observados e testes negativos sem registrar código. |
| V15 | Publicação por rede | Arquivo autorizado enviado por bytes, sem URL pública da máquina; conta/visibilidade escolhidas; sem duplicação após retry. | ID de teste e resultado, apenas com instrução para publicar. |
| V16 | Comentários por rede | Criar/responder no próprio vídeo conforme recurso suportado; nada enviado a outro vídeo/conta por troca de ID. | Conta de teste e operação especificamente autorizada; marcar indisponível se API/código não suportar. |
| V17 | Dependências/imagem | Build reprodutível; versões e avisos alcançáveis tratados; nenhuma ferramenta admin inesperada. | Lockfile, resumo de scanner e digest final. |
| V18 | Backup/restauração | Backup local cifrado restaurado com sucesso em ambiente sem saída de rede e sem duplicar jobs. | Checklist de restauração e comparação de registros sem conteúdo sensível. |
| V19 | Reinício e desligamento | Sem publicação ao ligar por surpresa; comportamento de jobs vencidos definido; shutdown efetivo. | Teste com fila fictícia e verificação de portas/processos. |

## Cenários mínimos de saída observada

Observar, com dados descartáveis: inicialização, página de login, login, upload local, prévia, página de configurações, erro proposital, ociosidade e desconexão. Só depois observar autorização e publicação da rede piloto.

Uma verificação curta sem tráfego inesperado é evidência limitada, não prova de que o código nunca enviará dados. Combinar observação com bloqueio de saída imposto fora do processo e revisão do código.

## Registro dos resultados

Para cada Vxx registrar: data, commit/digest, configuração não secreta, resultado `PASSOU`/`FALHOU`/`PENDENTE`/`NÃO APLICÁVEL`, evidência, limitação e reteste necessário. Um teste só pode ser não aplicável se o recurso estiver indisponível no servidor e isso for demonstrado. Não usar “não aplicável” para um caminho apenas oculto na interface.

Não armazenar HAR completo, dump de banco, bearer tokens, cookies ou payload de vídeo como evidência. Usar arquivos sintéticos. Se algum segredo for capturado acidentalmente, restringir/remover a evidência e avaliar revogação.

## Liberação

- Segurança: concluir V01–V14 e V17–V19 conforme recursos habilitados, sem falhas bloqueadoras ou testes essenciais presumidos.
- Funcionalidade: concluir V15 e V16 separadamente por rede; se comentário não existir, registrar a limitação visível e manter esse recurso desabilitado. Não declarar o objetivo completo enquanto a função solicitada estiver faltando.
- Compatibilidade externa: callback, permissões e uso da API precisam ser aceitos oficialmente; não usar exceções de segurança como substituto.
- Manter os testes automatizáveis como regressão para atualizações futuras. Falha numa rede não autoriza expor a máquina para fazê-la funcionar.
