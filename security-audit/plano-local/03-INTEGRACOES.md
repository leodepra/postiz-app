# Instagram, TikTok e YouTube sem publicar o Postiz

Estado: revisão de código e documentação; nenhuma conta conectada. Referências consultadas em 2026-10-07; requisitos devem ser reconfirmados no momento de registrar o aplicativo.

## O que precisa ser distinguido

- **Aplicação local:** UI, banco e processamento ficam nesta máquina.
- **Callback OAuth local:** o navegador volta a um endereço local permitido pelo provedor. Aceitação depende do tipo de cliente e registro.
- **Upload direto:** o computador envia bytes ao provedor; não precisa receber requisições da internet.
- **Busca por URL:** o provedor precisa acessar a mídia em uma URL alcançável por ele. `localhost` da sua máquina não atende isso.
- **Comentários:** publicar vídeo e permitir comentários não significa que a API permita escrever/responder comentários pelo Postiz.

## Matriz atual

| Provedor | Envio de vídeo observado | OAuth observado | Comentários observados | Decisão para este plano |
|---|---|---|---|---|
| YouTube | Upload retomável por bytes; leitura por stream. | Callback derivado de FRONTEND_URL, sem relay no caminho examinado. | Sem método `comment()` localizado no provedor examinado; a variável `comments` em `postPending` não comprova publicação deles. | Primeiro candidato para validação local. Comentários ainda precisam ser implementados/confirmados. |
| TikTok comum | FILE_UPLOAD para vídeos; fotos usam PULL_FROM_URL. | HTTP gera URI via `redirectmeto.com`. | Sem método `comment()` localizado no provedor examinado. | Apenas vídeos, após eliminar relay, validar callback/PKCE e elegibilidade da API. |
| TikTok Business | Busca por URL de mídia. | Fluxo próprio que exige validação adicional. | Não validado; métricas de comentários não são envio de comentários. | Desabilitado no perfil inicial. |
| Instagram / standalone | Criação de container com `video_url`; standalone delega ao provedor Instagram. | Standalone usa `redirectmeto.com` em HTTP. | Método `comment()` existe; não comprova uma caixa completa de respostas. | Bloqueado até haver envio por bytes e callback compatíveis, sem mídia pública. |

Evidências locais:

- [YouTube: OAuth e escopos](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts:28) e [upload](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts:559).
- [TikTok: intermediário no OAuth](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts:340) e [FILE_UPLOAD](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts:841).
- [TikTok Business: busca por URL](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/tiktok.business.provider.ts:528).
- [Instagram: video_url](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts:737), [comentário](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts:1076) e [standalone OAuth](C:/Claude/postiz-app/libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.ts:106).

## YouTube

A [documentação oficial de OAuth](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps) apresenta callbacks localhost e exige compatibilidade do URI registrado. Validar o tipo correto de cliente, a origem escolhida e a duração/revogação dos tokens do aplicativo em teste; não supor que qualquer configuração de produção aceite qualquer localhost.

Roteiro: criar/selecionar aplicativo próprio, revisar escopos, registrar URI exata, autorizar pelo navegador, receber callback local sem relay, enviar bytes do volume, consultar estado e desconectar/revogar. Validar quotas e eventuais restrições de publicação do aplicativo sem liberar escopos extras por tentativa.

Registrar separadamente a viabilidade de escrever um comentário e responder a um comentário no próprio vídeo. Essas funções exigem fluxos e permissões verificáveis; não considerar a integração pronta só porque o upload funciona.

## TikTok

O [Login Kit Desktop](https://developers.tiktok.com/docs/en/login-kit-desktop) documenta callbacks loopback. Isso é uma possibilidade de adaptação, não prova que o provedor web atual possa ser usado sem mudanças. Confirmar tipo de cliente, parâmetros, PKCE e compatibilidade com os produtos/permissões de publicação.

A [API de upload](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video) oferece envio de bytes para `upload_url`, alinhado ao código atual para vídeos. Preservar validação do host recebido, streaming, limites e retries sem duplicar publicações.

Há um bloqueio potencial de produto, além da segurança: as [diretrizes de Direct Post](https://developers.tiktok.com/docs/en/content-sharing-guidelines) restringem clientes não auditados e não aceitam utilitários feitos apenas para contas próprias/internas como uso pretendido do Direct Post. Portanto não prometer publicação pública automática por aplicativo pessoal. Confirmar elegibilidade ou modalidade oficial disponível; se não atender, deixar a publicação automática bloqueada. Não contornar com cookies, relay ou identidade de outro aplicativo.

Não confundir `disable_comment`/permissão de receber comentários com capacidade de criar ou responder comentários. Validar esta última separadamente antes de planejar sua implementação.

## Instagram

O caminho atual utiliza `video_url`, que requer acesso ao arquivo pelo servidor da Meta; a [coleção oficial da Meta no Postman](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00) explicita esse requisito. Isso é incompatível com vídeos disponíveis somente em loopback.

Investigar uma alternativa oficial de upload retomável/direto para o produto, conta e formato usados. A página de documentação de upload retomável da Meta não pôde ser consultada pela ferramenta nesta revisão; **não foi confirmada compatibilidade**. Não considerar exemplos de terceiros prova suficiente, nem misturar APIs de Facebook, Instagram Login e Facebook Login sem verificar elegibilidade.

Roteiro de investigação: identificar tipo de conta aceito; conferir publicação de Reels/vídeo, bytes, limites, estado e comentário; confirmar callback sem intermediário; implementar somente o fluxo oficialmente aplicável. Sem solução compatível, registrar a limitação e perguntar ao usuário sobre alternativas antes de mudar qualquer restrição.

## Política comum

Não abrir túnel, porta no roteador, bucket, proxy de callback ou relay de terceiros. Não enviar mídia a armazenamento auxiliar para “tornar a integração funcional”. Não ativar webhook de entrada como pré-requisito quando houver consulta de estado compatível; se não houver, registrar o bloqueio.

Para cada rede habilitada, guardar localmente: tipo de aplicativo, escopos, callback, hosts necessários, prazo/renovação de tokens, teste de publicação, teste de comentário e procedimento de revogação. Guardar identificadores não secretos; não copiar tokens, códigos OAuth ou chaves para estes MDs.
