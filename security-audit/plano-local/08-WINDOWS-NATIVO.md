# Execução nativa no Windows

**Atualização posterior:** o usuário escolheu Supabase na nuvem no projeto compartilhado com Clips-Imagens. A proposta de PostgreSQL local/Redis/Garnet abaixo foi substituída pelo [adendo Supabase](C:/Claude/postiz-app/security-audit/plano-local/09-SUPABASE-COMPARTILHADO.md).

Atualizado em 2026-10-10. **Não pronto para uso com contas reais.** O usuário autorizou continuar a implementação e escolheu Windows direto, sem Docker. Este adendo prevalece sobre as instruções de runtime Linux/contêineres dos documentos 01–07. Esses arquivos e os candidatos de Docker foram preservados como histórico; não executar seus procedimentos como instalação Windows.

## Alterações realizadas nesta retomada

- Substituídos os bloqueios parciais de API por uma lista explícita de método e rota. Funcionalidades não enumeradas permanecem bloqueadas. Identificadores dinâmicos são limitados aos formatos necessários, incluindo UUID e CUID de posts.
- Variações de maiúsculas, codificação de caminho, barra final e métodos alternativos não habilitam rotas. A integração da interface com essa política ainda exige teste ponta a ponta.
- Corrigida a seleção do limitador de tentativas de autenticação para incluir barras finais, maiúsculas e query strings.
- Cabeçalho interno inválido com caracteres multibyte não provoca erro na comparação criptográfica.
- Backend e proxy de saída usam loopback no Windows. O dispatcher SSRF exige o endereço exato do proxy Windows. Isso ainda não impede que outra biblioteca abra uma conexão direta: a restrição no sistema operacional permanece obrigatória.
- Criados `var/local/windows/Caddyfile` e `preflight.ps1`. O primeiro é configuração candidata de TLS/gateway, ainda sem validação com Caddy. O segundo apenas lê o ambiente; não instala nem inicia serviços e não aprova segurança.

## Evidências

Execução de `node --test security-audit/tests/*.test.cjs`: **11 testes passaram, zero falhas**, incluindo HTTP real em loopback contra Express. No sandbox, dois testes de socket falharam por `EACCES`; a repetição fora do sandbox passou. Foram usados dados artificiais e nenhuma conta real. Isso não testa a implantação inteira, o login com Redis real ou os serviços Windows.

O preflight encontrou Node `v24.18.0`, diferente da faixa `>=22.12.0 <23.0.0` declarada no projeto. PostgreSQL, Garnet, Memurai, Temporal e Caddy não foram encontrados no PATH; isso não comprova ausência em todos os diretórios da máquina. A sessão não está elevada. Não houve instalação desses componentes nesta retomada.

O build do backend via Nest CLI encerrou com código 0 nesta retomada, executado com Node 24. A alteração do binding Windows ocorreu durante essa execução, portanto ainda é necessário um build final estável com Node 22. `git diff --check` passou. A suíte de 11 testes foi repetida após os ajustes de rede e permaneceu verde. Builds finais do frontend/worker e testes operacionais continuam pendentes.

## Componentes e decisões pendentes

| Componente | Caminho de implementação | Condição de aceite |
|---|---|---|
| Node | Instância Node 22 dedicada ao projeto | Versão suportada, origem e integridade verificadas, sem substituir o Node global |
| PostgreSQL | Serviço nativo local | Loopback, autenticação, usuário sem privilégios administrativos, dados com ACL restrita |
| Cache/sessões | Aguardar escolha entre validar Garnet e usar alternativa autorizada | Testar expiração, revogação, Lua do throttler e os comandos realmente utilizados |
| Temporal | Validar distribuição nativa e persistência | Reinício, recuperação e histórico sem credenciais legíveis; modo de desenvolvimento não equivale a implantação cotidiana aprovada |
| Gateway | Caddy local com TLS | Validar configuração, certificado confiável, listeners restritos e bloqueio de uploads anônimos |
| Aplicação/worker | Build de produção | Sem privilégios de administrador, sem pastas pessoais, credenciais separadas por processo |

O [Redis documenta Memurai como alternativa nativa](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/install-redis-on-windows/). O [Memurai restringe a licença Developer a desenvolvimento/teste](https://www.memurai.com/terms); nenhuma licença foi adquirida. O [Garnet suporta Windows](https://microsoft.github.io/garnet/docs/getting-started), mas [não promete compatibilidade total com Redis](https://microsoft.github.io/garnet/docs/welcome/compatibility). A escolha foi apresentada ao usuário antes da instalação. A documentação do [Temporal distingue o servidor de desenvolvimento da implantação de produção](https://docs.temporal.io/production-deployment).

## Controles que substituem a proposta com contêineres

1. Identidade de execução dedicada, sem administrador, com permissões somente sobre código necessário, dados e mídia escolhida. Rodar na conta pessoal não satisfaz isolamento de arquivos. Testar leitura negada de um arquivo artificial fora da área autorizada.
2. ACLs nos dados, tokens, chaves, backups e configuração. Não distribuir chave de tokens e acesso ao banco ao frontend sem necessidade demonstrada.
3. Todos os listeners em loopback. Verificar IPv4 e IPv6 após subir os serviços; não abrir portas na LAN nem criar túnel.
4. Controle de saída imposto pelo Windows e testado com sockets diretos, DNS, HTTP e HTTPS. Variáveis de proxy e validação de URLs são complementares, não uma barreira suficiente contra uma dependência comprometida. Falha ou parada do proxy deve impedir saída externa dos processos da aplicação.
5. Testes de login, revogação, upload autenticado, propriedade de mídia, OAuth simulado, reinício, agendamento e recuperação. Remover tokens do histórico Temporal e concluir a triagem de dependências antes de liberar.

R01–R10 continuam válidos. Esta retomada avançou R01 e preparou parte de R05/R06; não concluiu esses marcos. Nenhum comando de inicialização cotidiana será considerado aprovado apenas por compilar ou passar nos testes unitários.
