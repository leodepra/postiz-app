# Estado da implementação Windows — 2026-10-11

**Não liberado para uso com contas reais.** Este documento registra evidências da retomada; os documentos anteriores contêm histórico e propostas ainda não concluídas. A entrada Windows agora usa `http://localhost:7443`, vinculada a `127.0.0.1`. Nenhuma autoridade certificadora local precisa ser instalada. HTTP em loopback não protege contra outro processo do mesmo Windows capaz de ler o tráfego ou os arquivos da conta.

## Confirmado

- Supabase: TLS estrito com a CA fornecida; usuário restrito `postiz_app`, schema `postiz`, 88 tabelas e sete testes reais do armazenamento temporário aprovados na sessão anterior. Nenhum segredo do Clips-Imagens foi reutilizado como credencial de API.
- Node 22.23.3 portátil instalado no projeto; módulo nativo bcrypt 6 aprovado em teste de hash.
- Quinze testes locais de segurança aprovados. Evidência: `security-audit/windows-tests.log`.
- Temporal nativo: tarefa sintética executada por um worker real, quatro payloads de entrada/saída verificados como criptografados. Servidor temporário encerrado ao final. Evidência: `security-audit/temporal-live.log`. Isso não valida ainda reinício, recuperação de tarefas ou execução do worker completo do Postiz.
- Backend compilado com sucesso após ajustar o tipo do conversor Temporal e reservar 6 GiB ao compilador. Esse limite pertence ao build, não é uma medição do consumo normal do aplicativo.
- Publicações agendadas revalidam a propriedade e exclusão das mídias antes do envio; falhas locais não retornam silenciosamente os arquivos originais.
- Upload retomado do YouTube valida o destino antes de enviar o token e rejeita redirecionamentos HTTP.
- Fontes de sistema removem a necessidade de baixar fontes Google durante o build.
- Backend, frontend e worker recompilaram em Node 22 para HTTP. O gateway HTTP abriu a página de login (200), retornou `register: false` e recusou mídia anônima (401). Uma conta sintética confirmou login, cookie `HttpOnly`/`SameSite=Lax` sem `Domain`/`Secure`, leitura autenticada, logout e sessão revogada; os registros temporários foram removidos. A inicialização completa incluiu o worker e as seis portas 3001, 3002, 3128, 4200, 7233 e 7443, todas exclusivamente em `127.0.0.1`.
- API iniciou com o banco restrito; requisições sem sessão e com Host inválido retornaram 401 e 403. Uma conta sintética confirmou senha incorreta 400, login 200, leitura autenticada 200, logout 200 e sessão revogada 401. A conta e a organização temporárias foram removidas.
- O servidor Temporal preservou a tarefa sintética e o histórico criptografado após um reinício usando o arquivo SQLite nativo. Isso demonstra persistência básica, ainda sem provar recuperação de uma publicação interrompida.
- Removidas as dependências de teste Vitest não utilizadas: a nova auditoria do lockfile retornou **zero alertas críticos**, 118 altos, 141 moderados e 29 baixos. A suíte de 15 testes continuou verde. Os alertas altos exigem triagem por alcance no runtime.
- O processo externo que já usa a porta 3000 foi preservado; o backend Postiz passou para a 3001. A configuração do Caddy foi validada após a mudança.

## Ainda em validação

- Envio e leitura de mídia autenticada, calendário e recuperação de uma publicação interrompida.
- Cookies HTTP para `localhost` são compartilhados entre portas do mesmo host. Um outro serviço local em `localhost` pode receber o cookie se o navegador o visitar; processos não confiáveis no mesmo Windows continuam fora do isolamento deste perfil. A sessão expira em 30 minutos e é revogável, mas isso não elimina essa limitação. A opção futura é um hostname local exclusivo ou isolamento do usuário Windows.
- Isolamento de identidade/arquivos e controle de saída no Windows. Bind em loopback e proxy no código não comprovam isolamento de processos.
- Verificação de mídia nas retomadas de upload, miniaturas, limpeza de estados temporários expirados e remoção de dados sensíveis de logs.
- Auditoria de dependências: o inventário npm atual reporta 118 altos, 141 moderados e 29 baixos em todos os pacotes travados, inclusive ferramentas de desenvolvimento. A contagem isolada não comprova exploração pela interface; a triagem dos pacotes alcançáveis permanece aberta.

## Participação necessária do usuário

O usuário ainda não criou o cliente OAuth do Google. As instruções estão em [11-YOUTUBE-OAUTH.md](C:/Claude/postiz-app/security-audit/plano-local/11-YOUTUBE-OAUTH.md). O configurador grava o segredo somente no arquivo local protegido, preservando banco e chaves. A conta de login do Postiz também precisará de senha própria, diferente da senha do banco.

YouTube é o piloto. Instagram, TikTok e comentários nas três redes não estão liberados nem foram comprovados nesta retomada. Não há publicação automática autorizada como parte dos testes técnicos.
