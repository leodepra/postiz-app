# Credenciais próprias do YouTube

Estado: o usuário informou em 2026-10-11 que ainda não criou o cliente OAuth. A integração real depende desta etapa e da liberação dos testes locais. Não envie o segredo pelo chat.

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) com a conta que administrará o projeto. Crie um projeto exclusivo para este Postiz.
2. Em APIs e serviços, ative **YouTube Data API v3**.
3. Configure a tela de consentimento em Google Auth Platform com seu email de contato e o nome Postiz local. Para a configuração inicial externa em teste, adicione sua própria conta Google como usuário de teste.
4. Em Clients/Credenciais, crie um cliente OAuth do tipo **Aplicativo da Web**. Este é o fluxo implementado neste código, mesmo que o servidor rode localmente.
5. Cadastre exatamente este URI de redirecionamento autorizado:

   `http://localhost:7443/integrations/social/youtube`

6. Abra `C:\Claude\postiz-app\var\local\windows\configure-youtube.cmd`. Informe o Client ID e o Client Secret quando solicitados. O segundo campo é oculto. O script preserva a conexão do banco e as chaves existentes; não inicia a aplicação nem conecta o canal.
7. Somente após liberação dos testes locais, reinicie os processos e conecte o canal pela interface. Faça a autorização no navegador e confira os acessos solicitados. A publicação de teste será uma etapa separada, com conteúdo escolhido por você.

O certificado HTTPS local precisa estar confiável no Windows antes da autorização; não ignore alertas de certificado. Esta URL não exige publicar o servidor nem criar um túnel. A configuração de teste do Google não equivale à aprovação do aplicativo ou à garantia de publicação pública; as restrições da API devem ser verificadas antes do uso definitivo.

Referências oficiais consultadas: [OAuth para aplicações web do YouTube](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps) e [gerenciamento de clientes OAuth](https://support.google.com/cloud/answer/15549257).
