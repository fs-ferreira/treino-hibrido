# Google, Neon e Vercel

O diário exige login Google e limita o acesso a `ALLOWED_GOOGLE_EMAILS`. A aplicação atual em GitHub Pages permanece publicada até o novo endereço funcionar. O código não cria automaticamente contas nos serviços nem contém credenciais reais.

## Preparar os serviços

1. Crie um projeto Neon PostgreSQL, preferencialmente em AWS US East (N. Virginia), próximo das funções Vercel `iad1`. Separe produção e homologação por bancos/branches. Copie a URL com pooling para `DATABASE_URL`; a conexão direta será `DATABASE_URL_UNPOOLED`, usada apenas no comando de migração.
2. Importe este repositório na Vercel, com framework **Other**, Node **24.x**, build `npm run build` e diretório público `dist`. As funções ficam em `api/`; módulos privados em `server/` não são arquivos estáticos. Defina a branch de produção como `main`.
3. Reserve o endereço estável de produção. No Google Cloud crie a tela de consentimento e um cliente OAuth do tipo **Web application**. Solicite somente `openid`, `email` e `profile`. Registre exatamente `https://SEU-ENDERECO/api/auth/callback/google` e, para desenvolvimento, `http://localhost:4173/api/auth/callback/google`. Configure os usuários de teste enquanto o consentimento estiver em modo de teste. A lista de teste do Google não substitui a autorização no servidor.
4. Cadastre no ambiente protegido da Vercel: `DATABASE_URL`, `BETTER_AUTH_SECRET` (gerado com pelo menos 32 bytes aleatórios), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL` (origem HTTPS, sem caminho) e `ALLOWED_GOOGLE_EMAILS` (e-mails separados por vírgulas). Use o tipo Secret para credenciais e lista autorizada. Não use prefixos públicos, não cole valores em issues/PRs e não os adicione ao código.
5. Para migrações, forneça `DATABASE_URL_UNPOOLED` num terminal seguro ou gerenciador de segredos; execute `npm run db:migrate`. Localmente, `node --env-file-if-exists=.env.local` carrega o arquivo ignorado pelo Git. Não use credenciais de produção em previews. As migrações são transacionais e registradas em `schema_migrations`, sem DDL durante requisições. Para execução, prefira um papel limitado a CRUD, com permissões necessárias nas tabelas de auth e do diário; reserve DDL ao papel de migração.
6. Faça deploy de homologação com origem e cliente OAuth próprios. Teste login autorizado/bloqueado, um segundo login invalidando o anterior, registro e recarga, queda de conexão, logout e importação. Só depois publique produção. URLs aleatórias de preview não são liberadas por wildcard no OAuth ou nas origens confiáveis.
7. Após validar a produção, defina a variável **pública do repositório** `APP_URL` para a origem HTTPS oficial e execute o workflow `Validate app and publish migration page`. Ele substituirá o Pages pela página de exportação/transferência. Sem `APP_URL`, o job de publicação é pulado e o Pages atual fica intacto. Não coloque credenciais do banco ou do Google no GitHub para esse workflow.

O fluxo real de consentimento Google depende dessas configurações e deve ser conferido por uma pessoa com a conta autorizada. As dependências estão fixadas no lockfile. Não solicite nem guarde refresh tokens Google para o funcionamento offline do diário.

## Persistência e sessão única

`GET /api/me` verifica o cookie assinado via Better Auth e a sessão ativa no banco. O trigger de inserção de sessão atualiza atomicamente `diaries.active_session_id`; sessões antigas são rejeitadas nas APIs de dados, mesmo que seu cookie ainda exista. Uma transação bloqueia a linha do diário, revalida sessão, expiração e lista autorizada, e só então lê/grava. Essa mesma linha serializa a ativação de um novo login e as gravações em andamento.

O cliente envia imediatamente cada alteração válida. Há um registro temporário em IndexedDB para requisições em andamento, removido depois da confirmação. Em falhas transitórias, mantém a fila e o snapshot necessário ao fallback, identificados pelo usuário e pela sessão; tentativas usam esperas de 1, 2, 4, 8, 16 e até 30 segundos. O servidor guarda recibos por operação: repetir um envio após perder a resposta não executa a gravação novamente. Alterações durante uma requisição geram uma operação posterior.

Não há JWT ou cookie de autenticação no armazenamento local. Uma nova abertura precisa primeiro validar a sessão e ler o banco. Uma queda na aba já autenticada permite continuar editando. `401`/`403` bloqueiam a interface e não são tratados como offline. Reentrada com outra sessão exige revisar as pendências da mesma conta. Outra conta nunca as recebe. Logout revoga a sessão; se houver pendências, oferece exportar ou descartá-las explicitamente. Logout offline não é confirmado.

As configurações são gravadas apenas por Salvar alterações. Rascunhos dos formulários continuam temporários. O indicador só diz “Salvo na nuvem” após a confirmação do servidor; falhas simultâneas de rede e disco informam “apenas nesta aba”. A última gravação confirmada vence por treino/data ou pelo conjunto de configurações, sem sobrescrever treinos de outras datas.

## Backup e restauração

O formato JSON continua na versão 3 e lê versões 1 e 2. A página antiga exporta a chave `treino-hibrido:v1` sem removê-la e sem enviar o conteúdo a outro domínio. Importe o arquivo no app novo após o login; confira o resumo e confirme a substituição do diário da conta.

Backups de até 10 MB são divididos em partes binárias de até 1 MiB, transportadas em base64. Cada treino tem limite de 1 MiB; a listagem usa páginas limitadas para respeitar os limites das funções Vercel. Partes incompletas/invalidas não alteram o diário. A confirmação valida o documento inteiro e substitui configurações e treinos numa única transação. Importações expiram em uma hora; partes expiradas são eliminadas na próxima criação de importação. São permitidas até quatro importações pendentes por conta.

Limpar/restaurar exige conexão e uma fila sem pendências. Ambas trocam a geração do diário. Operações antigas não podem recriar os dados removidos. Se a resposta de uma operação destrutiva se perder, o cliente repete o mesmo identificador; se ainda não conseguir confirmar, bloqueia a edição até reconectar e conferir o estado do banco. Não presume que a operação falhou antes do commit.

## Testes e manutenção

- `npm test`: domínio, fila, migrações e API com PostgreSQL embarcado PGlite, incluindo o adaptador real do Better Auth, cookies assinados e SQL transacional. Não exige credenciais externas.
- `npm run test:ui`, `npm run test:auth`, `npm run test:movements`: Playwright. As APIs de dados são interceptadas apenas no código de teste do navegador; não existe variável para desabilitar auth no servidor de produção.
- `npm run build`: copia somente a lista pública. Um teste injeta segredos fictícios e verifica que não aparecem nos artefatos.
- `npm audit --omit=dev`: verificar dependências do servidor.

A API usa respostas `no-store`, SQL parametrizado e proteção de origem nas mutações. Erros internos não serializam exceções do banco/provedor; logs do Better Auth estão desabilitados. O servidor local bloqueia fontes privadas. Não registre tokens, corpos dos treinos, URLs de conexão ou cookies em logs.

Para rollback, volte à versão anterior do app na Vercel preservando o banco. Não reverta migrações apagando dados. Mantenha o destino do Pages coerente com o endereço ativo e guarde backup antes de operações destrutivas. Nunca registre dados reais em fixtures ou capturas de teste.
