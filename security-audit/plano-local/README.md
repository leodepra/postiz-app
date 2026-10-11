# Plano de segurança para uso local do Postiz

**Retomada em 2026-10-11:** consulte o [estado Windows e evidências atuais](C:/Claude/postiz-app/security-audit/plano-local/10-ESTADO-WINDOWS.md) e as [instruções do OAuth do YouTube](C:/Claude/postiz-app/security-audit/plano-local/11-YOUTUBE-OAUTH.md). A aplicação continua em validação.

**Decisão atual:** aplicação Windows nativa e banco Supabase na nuvem compartilhado com Clips-Imagens, conforme autorização posterior do usuário. O [adendo Supabase](C:/Claude/postiz-app/security-audit/plano-local/09-SUPABASE-COMPARTILHADO.md) prevalece sobre as referências anteriores a banco exclusivamente local, Docker e Redis/Garnet. Implementação ainda não liberada.

**Estado em 2026-10-10: planejamento de retomada atualizado, implementação parcial; não liberada para uso com contas reais.** Comece pela [ordem de correções e critérios](C:/Claude/postiz-app/security-audit/plano-local/07-RETOMADA-E-CRITERIOS.md). O [estado da entrega](C:/Claude/postiz-app/security-audit/plano-local/06-ESTADO-ENTREGA-1.md) registra evidências anteriores. Uma tarefa descrita não significa tarefa concluída.

Data: 2026-10-07. Base: auditoria do commit `3128e870e653b1763c47392784df20f5e58cc087` e revisão adicional dos provedores Instagram, TikTok e YouTube.

## Decisões do usuário

- Executar somente nesta máquina Windows, sem publicar a aplicação.
- Decisão mais recente: executar diretamente no Windows, sem Docker. A proposta anterior com Linux/contêineres foi substituída pelo [plano nativo](C:/Claude/postiz-app/security-audit/plano-local/08-WINDOWS-NATIVO.md).
- Guardar banco, vídeos originais, configuração e backups localmente.
- Inicialmente publicar vídeos próprios e comentar neles no Instagram, TikTok e YouTube; considerar outras redes depois.
- Parar e perguntar se houver uma dúvida que exija mudar esses limites.

“Tudo local” significa processamento/armazenamento da aplicação locais. Publicar vídeos e comentários inevitavelmente envia o conteúdo escolhido e credenciais de autorização às respectivas plataformas. Não significa uso offline nem impede que a plataforma armazene o material publicado. Não haverá envio deliberado de arquivos pessoais, telemetria, prompts ou backups a outros serviços.

## Documentos e sequência

| Ordem | Documento | Entrega esperada |
|---|---|---|
| 1 | [Arquitetura e limites](C:/Claude/postiz-app/security-audit/plano-local/01-ARQUITETURA.md) | Ambiente isolado, somente loopback, saída controlada e arquivos restritos. |
| 2 | [Compatibilidade das redes](C:/Claude/postiz-app/security-audit/plano-local/03-INTEGRACOES.md) | Confirmar que cada rede funciona sem túnel, mídia pública ou intermediário de OAuth. |
| 3 | [Plano de implementação](C:/Claude/postiz-app/security-audit/plano-local/02-IMPLEMENTACAO.md) | Corrigir os achados e criar um perfil local mínimo. |
| 4 | [Critérios de validação](C:/Claude/postiz-app/security-audit/plano-local/04-VALIDACAO.md) | Demonstrar as proteções antes de conectar contas importantes. |
| 5 | [Operação, backup e incidentes](C:/Claude/postiz-app/security-audit/plano-local/05-OPERACAO.md) | Manter o ambiente protegido após a implantação. |
| 6 | [Estado da entrega 1](C:/Claude/postiz-app/security-audit/plano-local/06-ESTADO-ENTREGA-1.md) | Separar implementação, evidências e bloqueios. |
| 7 | [Retomada e critérios](C:/Claude/postiz-app/security-audit/plano-local/07-RETOMADA-E-CRITERIOS.md) | Executar R01–R10 em ordem, incluindo lacunas encontradas na proteção candidata. |

Os itens começaram pendentes e vários têm implementação parcial. Nenhum marco de liberação está concluído. Uma tarefa só fica concluída com implementação e evidência de validação. A execução segue primeiro as tarefas bloqueadoras, depois a integração piloto e, por último, a ampliação de recursos.

## Limitações funcionais já identificadas

1. **Instagram:** o código atual usa `video_url`, esperando que a Meta obtenha o arquivo por URL. Uma URL disponível apenas nesta máquina não atende esse fluxo. Investigar e implementar upload direto oficialmente suportado para o tipo de conta/conteúdo. Se não for viável, a integração permanece bloqueada; não publicar `/uploads` para contornar.
2. **TikTok e Instagram standalone:** o código usa `redirectmeto.com` quando a origem está em HTTP. Esse intermediário externo poderá receber o callback, incluindo código de autorização e estado. Não há evidência de abuso pelo serviço, mas sua participação é desnecessária para o objetivo de privacidade e deverá ser removida.
3. **TikTok:** upload de vídeo por bytes existe no provedor comum. O provedor Business usa busca por URL e fica desabilitado neste perfil. Autorização local e elegibilidade do aplicativo nas regras oficiais são etapas separadas, ainda pendentes.
4. **Comentários:** há implementação explícita no Instagram; não foi localizada implementação equivalente de `comment()` nos provedores TikTok/YouTube examinados. Não prometer esse recurso nas três redes até validar API, permissões e interface.

Estas limitações não impedem preparar a segurança local; impedem declarar prontas todas as funcionalidades desejadas. Se alguma rede exigir exposição ou armazenamento externo, parar a integração e explicar ao usuário a incompatibilidade antes de propor qualquer exceção.

## Condição de liberação

Não conectar contas importantes até concluir as tarefas bloqueadoras de segurança e os testes aplicáveis à rede escolhida. A primeira rede candidata é YouTube, por já enviar os bytes e possuir fluxo OAuth com possibilidade de callback local documentado. Isso é uma ordem de validação, não uma afirmação de funcionamento já testado.

O objetivo é reduzir exposição e limitar danos, sem prometer blindagem absoluta. Contêineres não protegem de todo comprometimento do Windows, e uma aplicação que possui um token precisa conseguir usá-lo. Redução de permissões, isolamento, revogação e verificação de saída complementam as correções de código.

Referência: [relatório original](C:/Claude/postiz-app/security-audit/RELATORIO.md). A criação original do plano não alterou a máquina. Na execução posterior, dependências do projeto foram instaladas/atualizadas e houve tentativas de instalação do runtime, sem implantação validada. A revisão documental de 2026-10-10 não instalou software nem iniciou serviços.
