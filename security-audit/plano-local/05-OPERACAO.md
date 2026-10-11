# Operação local, backups e resposta a incidentes

Estado em 2026-10-10: procedimento proposto para depois da validação. `var/local/setup.ps1` e `var/local/account.cjs` são candidatos ainda não exercitados com a implantação real; não são prova de instalação, backup ou recuperação funcionais. R05 e R10 da [retomada](C:/Claude/postiz-app/security-audit/plano-local/07-RETOMADA-E-CRITERIOS.md) fecham esse aceite.

## Uso cotidiano

1. Usar o endereço local canônico e conferir que não há alerta de certificado. Não aceitar certificado inválido apenas para continuar.
2. Manter login no Postiz mesmo em localhost; usar senha própria e forte. Não reutilizar senha das redes sociais.
3. Usar perfil de navegador dedicado, sem extensões desnecessárias. Ativar 2FA nas contas de rede social; o Postiz recebe autorização OAuth, não a senha dessas contas.
4. Importar somente os vídeos escolhidos pelo seletor de arquivos. Não compartilhar pastas pessoais inteiras com contêineres.
5. Conferir rede, conta, vídeo, legenda, comentário e visibilidade antes de enviar/agendar. Autorização de uma plataforma não permite publicar em outra por padrão.
6. Agendamentos dependem da máquina ligada, runtime ativo e internet disponível. Comportamento proposto após parada/suspensão: informar jobs vencidos e aguardar revisão antes de publicar; distinguir falha confirmada de resultado desconhecido para evitar duplicações. Esse comportamento ainda precisa ser implementado e testado.
7. Parar a aplicação quando não for utilizada, se não houver jobs desejados. Verificar que os serviços realmente pararam, sem apagar volumes.

## Configuração sensível

- Segredos ficam em armazenamento local restrito, fora do repositório/build e sem sincronização automática para nuvem.
- Proteger acesso aos volumes e considerar criptografia de disco quando disponível, com recuperação guardada de forma segura. Isso protege principalmente contra acesso offline/furto, não contra processo malicioso executando na sessão desbloqueada.
- Logs não devem conter tokens OAuth, Authorization, cookies, códigos de callback, query strings com segredo, senha ou conteúdo integral de posts. Limitar retenção e permissões.
- Não ativar `NOT_SECURED`, desabilitar SSRF ou ampliar mounts para resolver dificuldades operacionais. Corrigir a causa.
- Não expor interfaces administrativas de banco/fila. Uma manutenção temporária deve permanecer local, protegida e ser encerrada ao terminar.

## Backup local

- Fazer backup cifrado e consistente de banco, configuração necessária e mídias desejadas para destino local dedicado, preferencialmente mídia removível desconectada após a cópia.
- Guardar a chave de recuperação separada do arquivo de backup, sem colocar a chave em MD, histórico do terminal ou no próprio repositório.
- Definir retenção, por exemplo sete cópias diárias e quatro semanais conforme espaço, e testar restauração antes de confiar no processo.
- Restaurar primeiro num ambiente isolado sem saída de rede: uma cópia do banco pode reativar fila, agendamentos e tokens. Evitar que original e cópia publiquem simultaneamente.
- Se perder vídeos/banco, restaurar. Se suspeitar de roubo de token, restaurar sozinho não basta: revogar nas plataformas e autorizar novamente.

## Atualizações

Antes de instalar atualização: fazer backup, revisar avisos oficiais e diferenças no código/configuração, construir em ambiente sem segredos e executar os testes de regressão do perfil local. Usar versão/digest conhecido e não atualizar `latest` silenciosamente.

Revalidar obrigatoriamente após mudanças em runtime, rede, autenticação, provedor social, armazenamento, dependências de mídia ou política de saída. Não retroceder para versão sabidamente vulnerável como solução permanente de compatibilidade.

Este plano não cria monitoramento ou automação recorrente. A verificação periódica de atualizações será uma rotina operacional definida na implantação.

## Suspeita de vazamento ou publicação indevida

1. Parar a aplicação/worker e bloquear sua saída de rede para interromper novas ações; preservar evidências mínimas sem divulgar segredos.
2. Em dispositivo/sessão confiável, revogar a autorização do aplicativo na rede afetada e revisar logins, publicações e comentários. Alterar senha se houver sinal de comprometimento da conta/sessão, além de revisar 2FA.
3. Revogar/rotacionar chaves atingidas. A troca de `JWT_SECRET` exige planejar a migração dos dados que dependem dela; não apagar volumes precipitadamente.
4. Identificar caminho de entrada, versão afetada, destinos e dados expostos; corrigir e reconstruir o ambiente antes de reconectar.
5. Se houver comprometimento do Windows, tratar a máquina como fronteira comprometida: só recriar contêineres não restaura confiança no host.

## Nova rede ou novo recurso

Adicionar uma rede exige revisar OAuth, destinos de saída, mídia, escopos, comentários e revogação. IA, cloud storage, clipping, extensões e integrações por cookies continuam fora do escopo inicial.

Se a rede exigir URL pública, webhook de entrada, relay externo ou dados fora da máquina, parar e explicar a exigência ao usuário. Não converter “apenas local” em exposição temporária sem uma decisão explícita.
