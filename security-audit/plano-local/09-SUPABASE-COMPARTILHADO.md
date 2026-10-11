# Windows local e Supabase compartilhado com Clips-Imagens

Estado em 2026-10-10: implementação candidata, **não pronto para uso**. Esta decisão substitui a exigência de banco exclusivamente local e a escolha de Redis/Garnet do documento 08. O usuário autorizou armazenar os dados do banco no Supabase na nuvem e usar o projeto que já atende o Clips-Imagens. Aplicação e arquivos de mídia continuam no Windows; não foi autorizado publicar a aplicação nem tornar arquivos locais públicos.

## Contexto consultado

Foi feita leitura de `C:/Claude/clipsimagenscodex/src/supabase.mjs`, `docs/banco.md` e dos nomes de variáveis do `.env`, sem imprimir valores. O projeto usa `SUPABASE_URL` e `SUPABASE_SECRET_KEY` para API REST e RPCs. Não foi encontrada uma variável de conexão PostgreSQL nesse arquivo. A documentação do projeto informa que a chave possui acesso amplo. Nenhuma chave foi copiada para Postiz; nenhum dado, tabela, função ou configuração remota foi alterado.

O contrato documentado contém `empresas`, `canais`, `videos`, `artefatos`, `eventos`, `solicitacoes_imagem` e funções de reserva/entrega/aprovação. Isso é evidência documental, não uma introspecção atual de todas as tabelas remotas. As aprovações de mídia do Clips devem ser preservadas; compartilhar banco não autoriza publicar automaticamente todos os vídeos.

## Separação necessária

- Schema `postiz`: tabelas próprias da aplicação.
- Schema `postiz_private`: estados temporários criptografados, sem exposição na Data API.
- Papel `postiz_app`: login dedicado, sem DDL, sem privilégios administrativos, sem propriedade dos schemas. Permissões somente nas tabelas necessárias.
- Papel proprietário separado `postiz_owner`, sem login. Migrações revisadas executam sob essa identidade; não usar a credencial cotidiana para alterar estrutura.
- Não desabilitar a Data API global do Supabase: o Clips-Imagens depende dela. Manter os schemas novos fora dos schemas expostos e verificar privilégios efetivos, inclusive herdados de PUBLIC, antes de ativar.
- Não reutilizar `SUPABASE_SECRET_KEY`, `service_role`, a senha administrativa do banco ou credenciais do navegador no runtime do Postiz.
- Sem permissões sobre tabelas existentes até definir o contrato de integração. Uma futura função/view pode expor somente vídeos aprovados, campos necessários e atualização restrita do resultado da publicação. Não foi implementada essa ponte.

## Implementação candidata desta etapa

O perfil local seleciona `PostgresEphemeralStore` no lugar de abrir Redis. O armazenamento implementa os comandos identificados no código: leitura, escrita com expiração, escrita somente se ausente, consumo único, remoção, listas e atualização de expiração. O limitador de autenticação usa um contador transacional com janela fixa e período de bloqueio. Erro do banco não gera fallback em memória.

As operações utilizam parâmetros SQL, bloqueio consultivo por chave dentro da transação e relógio do banco. As chaves são armazenadas como SHA-256; conteúdo e expiração são autenticados com AES-GCM e chave derivada da chave local. O ciphertext é vinculado ao registro. A chave de criptografia permanece no Windows. Isso protege o conteúdo desses registros em repouso, não elimina exposição dos demais dados autorizados no Supabase nem ataques de replay por um administrador do banco comprometido.

A URL do banco exige endpoint exato configurado, porta 5432, papel `postiz_app`, schema `postiz` e parâmetros Prisma `sslmode=require&sslaccept=strict`. A conexão direta ou pooler em modo sessão deve ser obtida no painel do projeto. O certificado/CA e a validação real de TLS ainda precisam ser testados. O frontend não deverá receber essa credencial.

Arquivos:

- [Configuração sem segredos](C:/Claude/postiz-app/var/local/windows/supabase.env.example).
- [Inventário SQL somente leitura](C:/Claude/postiz-app/security-audit/supabase/00-read-only-inventory.sql), incluindo permissões PUBLIC e funções SECURITY DEFINER que poderiam dar acesso indireto aos dados existentes. Schema e usuário separados, sozinhos, não comprovam isolamento.
- [DDL candidato de isolamento e estados temporários](C:/Claude/postiz-app/security-audit/supabase/01-isolated-schemas.sql). Não aplicado; não cria ainda todas as tabelas do Postiz. Falha se os nomes já existirem, sem reaproveitar permissões desconhecidas.
- [Adaptador PostgreSQL](C:/Claude/postiz-app/libraries/nestjs-libraries/src/security/postgres-ephemeral-store.ts).

## Verificação realizada e pendências

**Conexão confirmada nesta sessão:** a CA fornecida pelo usuário foi validada quanto ao tipo e período de validade, copiada para a pasta protegida e configurada em `sslcert`, preservando `sslmode=require&sslaccept=strict`. O teste real confirmou usuário `postiz_app`, schema `postiz`, TLS ativo e 88 tabelas. Passaram também sete verificações reais de `PostgresEphemeralStore`: conteúdo criptografado, concorrência SET NX, consumo único GETDEL, expiração, listas, throttling e autenticação da expiração. Foram criadas somente chaves aleatórias de teste na tabela privada e removidas ao final; nenhum registro existente de vídeos foi acessado. Evidências em `connection-validation-2026-10-10.json`. O bloqueio anterior P1011 foi resolvido. Isso não libera o aplicativo completo: runtime Windows, isolamento de processos/saída, Temporal, builds finais, dependências e fluxos ponta a ponta permanecem pendentes.

Configuração local criada nesta sessão, após ajuste do tratamento da ACL para preservar proprietário/grupo existentes: `local-data/secrets/windows-config.json`, ignorado pelo Git. A ACL efetiva do arquivo foi conferida: somente usuário Windows atual e SYSTEM. Senha recebida por entrada oculta; não registrada neste documento nem em argumentos de processo. O teste `var/local/windows/verify-database.cjs` chegou ao endpoint direto, mas falhou com **P1011 (validação TLS)**. Ainda não foi possível confirmar autenticação ou executar as consultas de metadados. Obter a CA oficial em Database Settings → SSL Configuration no painel autenticado e configurar `sslcert`; não desabilitar a validação nem mudar a exigência de SSL do banco compartilhado. A configuração foi salva; não executar novamente o gerador de chaves.

Retorno adicional do usuário: 88 tabelas de aplicação e 1 privada, todas com RLS e proprietário esperado; nenhuma permissão ausente do runtime; sem acesso das roles da API, sem acesso externo a tabelas/funções SECURITY DEFINER, sem associação ao owner ou permissão de criação de schema/objetos. Evidência fornecida pelo usuário, ainda sem conexão PostgreSQL nesta sessão.

O `.env` do Clips-Imagens foi reconsultado com autorização: contém URL do projeto e chave REST, sem conexão PostgreSQL ou senha de `postiz_app`. Nenhum segredo foi exibido ou copiado. Foram preparados `04-password-template.sql` (substituição local no painel pelo usuário) e `var/local/windows/configure-database.ps1` (senha em entrada oculta, ACL restrita, arquivo ignorado pelo Git, recusa de sobrescrita de chaves). O script passou na análise sintática PowerShell; ainda não foi executado com senha real nem validado em conexão real. Não desabilitar TLS para resolver eventual erro de certificado.

Atualização do usuário: scripts executados com sucesso, `table_count = 88`. Isso confirma a criação relatada das tabelas; conexão direta e permissões efetivas ainda não foram testadas por esta sessão. Foi preparado `03-verify-isolation.sql` para verificar RLS, propriedade, privilégios de DDL/DML, acesso pelas roles da API e acesso indireto aos objetos existentes. A aplicação continua não liberada.

O usuário forneceu o inventário em 2026-10-10: os roles/schemas Postiz não existem; os únicos grants de tabela a PUBLIC reportados são SELECT nas duas views `extensions.pg_stat_statements*`; nenhuma função SECURITY DEFINER pública foi reportada. Isso permite preparar os scripts, mas não comprova isolamento completo de futuras credenciais. A evidência está em `security-audit/supabase/inventory-user-2026-10-10.json`.

Foram preparados `01-isolated-schemas.sql` e `02-application-tables.sql`. O segundo foi gerado offline com Prisma 6.5.0 a partir do schema deste checkout (88 tabelas e 11 enums), encapsulado em transação, sob `postiz_owner`, com search_path controlado, RLS e grants específicos para `postiz_app`. A execução remota e seus resultados ainda não foram confirmados. `generated-tables.sql` é apenas entrada do empacotador: **não executar esse arquivo isoladamente**, pois ele não contém a seleção de schema nem as restrições adicionadas pelo empacotador.

13 testes locais passaram, incluindo política de conexão, rejeição de TLS permissivo/usuário administrativo/schema público e criptografia autenticada. O typecheck do backend passou com Node 24; o runtime suportado Node 22 ainda é pendência. **Não houve teste SQL real:** sintaxe/execução das consultas, expiração, concorrência de SET NX e GETDEL, throttling, reinício e cleanup devem passar com conexão restrita antes de aprovar o adaptador.

É necessário obter a conexão PostgreSQL por arquivo local protegido ou preparar o papel via painel Supabase. Os arquivos atuais de bootstrap para Docker são históricos e incompatíveis com este perfil; não executar para contornar a validação. Ainda faltam:

1. Introspecção somente leitura de schemas, roles e privilégios existentes; nenhum `db push --accept-data-loss`, reset ou migração sobre `public`.
2. DDL completo das tabelas próprias revisado, grants/RLS e teste de ausência de acesso às tabelas Clips por `postiz_app` e de acesso às tabelas Postiz pelas chaves públicas/API.
3. Configuração local com ACL, TLS real, testes de concorrência e rotina de remoção de registros expirados. Expiração lógica já rejeita leituras, mas a limpeza periódica ainda não foi integrada à operação.
4. Remover segredos do histórico Temporal; finalizar rede Windows, builds, dependências e demais critérios R01–R10.
5. Definir o contrato de integração Clips → Postiz, aprovação humana e idempotência, sem alterar os fluxos de geração/entrega de imagens existentes.

Referências: [Prisma com Supabase](https://supabase.com/docs/guides/database/prisma), [conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS no Prisma 6](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql). A orientação genérica de desabilitar a Data API não se aplica ao projeto compartilhado, pois quebraria a integração existente.
