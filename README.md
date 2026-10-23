# HÍBRIDO

Diário pessoal de musculação e corrida, em português. HTML, CSS e JavaScript nativos, sem dependências de execução e sem backend.

**Site:** https://fs-ferreira.github.io/treino-hibrido/

## Executar localmente

Requer Node.js 24 ou superior. Na pasta do projeto:

```sh
npm start
```

Abra http://127.0.0.1:4173. Use um servidor HTTP: módulos JavaScript não funcionam de forma consistente abrindo o HTML diretamente via `file://`.

```sh
npm test
```

Os 89 testes verificam cálculos, calendário, backups, guias, progressão, movimentos da interface, catálogo de treinos, navegação circular e configurações por categoria, incluindo falhas ao salvar e edições temporárias em memória.

## Como usar

1. Abra **Configurações → Corrida** e informe os paces com a máscara automática (digite `600` para `6:00`). O pace de caminhada é opcional. Registre a maior corrida recente em distância, tempo e data; o pace médio aparece automaticamente. A opção de usar esse pace como moderado-forte bloqueia o campo manual; desmarcar restaura o valor manual anterior. Use **Salvar alterações** para aplicar.
2. Em **Configurações → Semana**, escolha sábado ou domingo para o longão e a duração entre 60 e 90 minutos. Em **Progressão**, ajuste as sugestões de carga e ritmo. Cada categoria tem seu próprio salvamento.
3. Em Hoje ou Semana, abra uma sessão. Na musculação, registre carga e repetições de cada série; em Como fazer, consulte o guia ilustrado e a demonstração externa.
4. Depois da corrida, registre duração, distância, esforço e observações.
5. Em Treinos, consulte o plano ativo e sua divisão em sete dias. Abra os dias para ver exercícios, guias e etapas das corridas. O catálogo é apenas para consulta; os resultados continuam sendo registrados nas sessões.
6. Consulte Histórico, organizado por mês, e exporte periodicamente um backup em **Configurações → Dados**.

O app preserva os 21 exercícios, 3 séries de 6–8 repetições e a distribuição semanal das imagens do post de @thalleshirakawa. Variantes adotadas são indicadas nos guias. Ilustrações SVG são originais e esquemáticas; os vídeos externos mostram o movimento com mais detalhe.

## Cálculos e fontes

- Pace é convertido de `mm:ss` para segundos/km.
- Distância (km) = minutos × 60 ÷ pace; velocidade (km/h) = 3600 ÷ pace.
- Intervalado: 5 min leves + 8 × (3 min moderado-forte + 1 min leve) + 3 min de caminhada = 40 min. Sem pace de caminhada, a distância exibida é parcial.
- Corrida leve: 30 min. Longão: 60–90 min. Esforço 3–4/10 conforme o post; duração sem progressão automática. Os blocos fortes usam alvo de esforço 7–8/10, escolhido para o aplicativo.
- O pace moderado-forte é informado pelo usuário; não é derivado de um percentual arbitrário do pace leve. Não há implementação de cálculo VDOT.

Referências de corrida: [CDC](https://www.cdc.gov/physical-activity-basics/measuring/index.html) e [V.O2](https://vdoto2.com/calculator/). Referências específicas dos exercícios e demonstrações estão em `assets/references.json` e no guia de cada exercício. Consulta em 20/10/2026. Principais fontes: ACE, Muscle & Strength, NASM, NISMAT e Catalyst Athletics. Os links externos dependem da disponibilidade dos provedores. A demonstração de reverse crunch é no chão; o guia descreve a adaptação ao banco.

## Progressão de cargas e paces

Em cada exercício, **Sem peso adicional** vale para as três séries. Os campos de carga ficam desabilitados; as cargas digitadas são preservadas para restaurar ao desmarcar. O histórico e as sugestões ignoram essas cargas enquanto o modo estiver ativo. Novos treinos herdam a última escolha por exercício; registros antigos com carga zero continuam como foram registrados.

**Progressão de carga (%)** começa em 5%, aceita 0–10% em passos de 0,5. Cada série busca a última referência concluída com carga positiva e repetições, na mesma posição da série e antes da data aberta. Ao atingir pelo menos 8 repetições, sugere `carga × (1 + percentual/100)`; abaixo disso, mantém. Arredondamento a centésimos de kg, sem presumir os incrementos da academia. O botão **Usar** aplica apenas àquela série, com ajuste manual disponível; séries concluídas não são substituídas. O percentual é uma preferência, não uma avaliação automática de capacidade. A [ACSM de 2009](https://pubmed.ncbi.nlm.nih.gov/19204579/) relaciona progressão ao desempenho em repetições; o gatilho exato de 8 é uma regra deste app, não uma reprodução literal da recomendação.

Na corrida, o próximo treino equivalente usa o pace realizado e o esforço da última sessão elegível, separando **leve**, **longão** e **intervalado**. Leve e longão têm alvo 3–4/10; os blocos fortes têm alvo 7–8/10. Intervalados precisam de **pace médio dos blocos fortes** e **esforço dos blocos fortes**, ambos opcionais e preenchidos juntos. A média da sessão inteira não substitui esses dados. Esforço 0, sessões abertas, datas iguais/posteriores ao plano e dados ausentes não alimentam o ajuste.

A política inicial é uma **heurística do aplicativo**, não uma fórmula fisiológica validada que converte esforço em velocidade. Como reforça o [CDC](https://www.cdc.gov/physical-activity-basics/measuring/), o esforço é relativo a cada pessoa:

- Acima do teto: aumentar segundos/km em 2,5% por ponto excedente, até 10%.
- Abaixo do piso: reduzir segundos/km em 2,5% por ponto, até 5%.
- Dentro da faixa: manter o pace realizado.
- **Progressão de pace**, desligada por padrão: metade da desaceleração quando o excesso é de 1–2 pontos; correção integral com 3 ou mais. Após as duas últimas sessões equivalentes dentro da faixa, reduzir o pace em 1%, sem somar outra correção.

Exemplo: 8:00/km com esforço 6 e teto 4 resulta em `480 × 1,05 = 504`, ou **8:24/km**. Com progressão, `480 × 1,025 = 492`, ou **8:12/km**. Arredondar apenas o pace final para segundos inteiros. Abrir telas ou semanas sem novos registros não acumula ajustes. Volume, recuperação e caminhada não aumentam automaticamente; no intervalado, somente os blocos fortes recebem a adaptação. Um ritmo forte que deixe de ser mais rápido que a recuperação fica sem estimativa até recalibrar os paces.

Os paces base e o vínculo com a corrida recente são preservados. Mudar a base leve reinicia as referências de leve, longão e intervalado; mudar somente a base forte reinicia a do intervalado. As sessões mantêm suas medições. Novas corridas salvam também uma cópia do planejamento; configurações ou histórico editados depois não alteram esse plano. Registros antigos sem cópia são identificados como simulação quando abertos. Backups versão 3 preservam essas informações.

Para usar apenas a musculação, é possível salvar Progressão sem preencher Corrida. Se começar a preencher um par de paces ou uma corrida recente, complete os respectivos campos antes de salvar essa categoria.

## Configurações por categoria

As quatro abas são **Corrida**, **Progressão**, **Semana** e **Dados**. As três primeiras têm um único botão **Salvar alterações**; Dados reúne backup, fontes e limpeza com confirmação. Links diretos usam `#configuracoes/corrida`, `#configuracoes/progressao`, `#configuracoes/semana` e `#configuracoes/dados`. O endereço anterior `#configuracoes` continua abrindo Corrida.

As edições não salvas ficam somente em memória. Trocar de categoria ou tela preserva a edição durante a visita; **recarregar a página ou fechar a aba perde essas alterações** e restaura os últimos valores salvos. Não há botão de descarte nem recuperação de rascunhos em `sessionStorage`.

Somente **Salvar alterações** muda o planejamento. Cada categoria valida apenas seus campos; um pace incompleto não impede salvar a progressão. Erros aparecem nos campos e num resumo; o foco vai para o primeiro campo inválido. Falhas de gravação preservam a edição em memória e os ajustes anteriores. Uma confirmação persistente identifica o salvamento concluído.

Os formulários continuam montados ao alternar categorias. Na barra de abas, setas movem o foco, Enter/Espaço ativam e Tab segue para o conteúdo. A barra tem rolagem horizontal finita em telas estreitas. As ações ficam aderentes quando há alterações e espaço disponível; em viewports curtas ou com teclado reduzindo a área visível, voltam ao fluxo normal.

Backups incluem apenas configurações salvas. Restaurar um backup ou limpar o diário após confirmação invalida as edições anteriores. Nenhuma mudança no esquema versão 3.

## Dados e backup

Um perfil por navegador. Armazenamento em `localStorage`, chave `treino-hibrido:v1`; esquema versão 3. Diários e backups das versões 1 e 2 são migrados, preservando o texto da corrida recente como anotação e todas as sessões. Os novos campos são preenchidos pelo usuário, sem interpretar o texto antigo. Não há contas, analytics, GPS, cronômetro nem sincronização. Dados pessoais nunca são enviados ao repositório. A navegação a vídeos e fontes externas abre os respectivos sites somente quando o usuário clica.

Backup JSON contém configurações e sessões por data local `AAAA-MM-DD`, com tipo de treino, conclusão, séries e registro de corrida. A importação abre um painel com seleção de JSON, validação e resumo de sessões, séries e corridas; somente o botão Restaurar backup confirma a substituição. Erros aparecem no painel. Cabeçalho e ações permanecem acessíveis enquanto o conteúdo rola. Arquivos inválidos preservam os dados atuais. O navegador pode apagar o armazenamento; mantenha cópias exportadas. Limpar os dados exige confirmação em um painel do app. Não há alert, confirm ou prompt nativos; Escape, cancelar ou fechar preserva o diário. Se o armazenamento falhar, o app informa a limitação e permite exportar os dados da aba.

A [validação de progressão e painéis](docs/validacao-progressao.md) registra os testes dessa funcionalidade. A [validação de Treinos e navegação](docs/validacao-treinos.md) cobre a versão 1.6.0. A [validação de Configurações e UX](docs/validacao-ux.md) detalha as versões 1.7.0 e 1.7.1 e as limitações dos testes de dispositivo.

## Treinos e navegação

O catálogo estático contém um único plano, **Treino Híbrido — força e corrida**, ativo por definição. Lista em `#treinos`; detalhes em `#treinos/hibrido-3x3`. Dia e duração do longão refletem Configurações. Não há criação, edição, exclusão ou troca de plano; consultar o catálogo ou abrir um guia não cria sessões. O esquema local permanece na versão 3.

Em telas de até 600 px, arraste o menu inferior para revelar os destinos nos dois sentidos. Ele mostra três opções completas e partes das vizinhas, usando os mesmos cinco links, sem cópias. Arrastar não troca de tela; toque para navegar. O destino aberto fica destacado mesmo quando outra opção está no centro. Acima de 600 px, o menu mantém a navegação convencional.

Tab percorre os cinco destinos uma vez. Setas esquerda/direita movem o foco circularmente; Enter abre a tela. O item focado fica visível. Com movimento reduzido, o encaixe é imediato; sem suporte a Pointer Events, o app oferece o menu convencional com rolagem horizontal. Lista e detalhe preservam suas posições de rolagem em memória, incluindo navegação pelo histórico do navegador.

## Publicar e atualizar

Repositório público pessoal: `fs-ferreira/treino-hibrido`. GitHub Pages usa **GitHub Actions** como fonte. Cada push na branch `main` executa os testes e publica apenas HTML, CSS, JS e assets do app. Arquivos de teste e dados locais não integram o site. Assets usam caminhos relativos para funcionar sob `/treino-hibrido/`.

Para atualizar: editar, executar `npm test`, testar no navegador e enviar um commit para `main`. Acompanhar o workflow `Validate and deploy Pages`. Um deploy não altera o `localStorage` do usuário; futuras mudanças no esquema precisam de migração explícita.

## Estrutura

- `app.js`: interface, formulários, navegação e persistência.
- `lib/motion.js`: transições canceláveis, acordeões e ciclo de vida dos painéis.
- `lib/mobile-nav.js`: menu circular com cinco links, gestos, teclado e encaixe cancelável.
- `lib/plans.js`, `lib/plans-view.js`, `lib/routes.js`: catálogo estático, consulta dos sete dias e rotas de lista/detalhe.
- `lib/settings.js`: catálogo das categorias, formulários, validação independente e edições temporárias em memória.
- `lib/run-view.js`: etapas da corrida, com os oito ciclos do intervalado agrupados para consulta.
- `assets/ux.css`: escala de leitura, controles, categorias e ajustes responsivos compartilhados.
- `lib/core.js`: calendário, cálculos e validação dos backups.
- `lib/progression.js`: sugestões por série, ajuste de paces e planejamento preservado por sessão.
- `lib/icons.js`, `lib/ui.js`: ícones SVG locais Lucide e máscaras de digitação.
- `lib/exercises.js`, `lib/diagrams.js`: conteúdo dos guias e imagens SVG.
- `assets/references.json`: fontes e demonstrações verificadas.
- `tests/core.test.mjs`: testes de regressão.
- `lib/movement-data.js`, `lib/movement-equipment.js`, `lib/movement-player.js`: poses, equipamentos e reprodução dos movimentos.

O plano é uma reprodução organizacional do conteúdo fornecido; não faz avaliação individual nem ajusta automaticamente a carga de treino.

## Movimento da interface

As transições duram de 120 a 420 ms, com entrada mais gradual. Abas usam 300 ms; cards expansíveis, 320 ms; painéis mobile abrem em 420 ms e fecham em 320 ms. Marcar séries e ajustar a duração do longão atualiza os indicadores no lugar, preservando campos e foco. As abas guardam a posição de rolagem em memória durante a visita. Os guias e confirmações usam painéis pela base em telas de até 600 px; no desktop permanecem centralizados. O fechamento devolve foco e rolagem ao ponto anterior.

O app respeita `prefers-reduced-motion`, inclusive quando a preferência muda durante o uso, e mantém os controles funcionais sem a Web Animations API. A camada de movimento não altera o armazenamento. As animações de execução dos exercícios continuam opcionais e independentes das transições da interface.

Para medir localmente, abra `http://127.0.0.1:4173/?motion-debug=1#hoje`. Um indicador mostra intervalos de quadros e tarefas acima de 50 ms que se sobrepõem às transições. Os valores são observações do navegador e do dispositivo em uso, não uma garantia de FPS. O diagnóstico só é ativado por esse parâmetro e não transmite nem armazena dados. A [validação da interface](docs/validacao-interface.md) registra os cenários testados e as limitações.

## Ícones

[Lucide](https://lucide.dev/guide/static) é distribuído localmente, sem CDN nem fonte de emoji. Licença ISC em `assets/lucide-LICENSE.txt`. Para regenerar os ícones: `npm ci` e `npm run icons`. As dependências são apenas de desenvolvimento; execução e publicação não exigem instalação ou build.

## Ilustrações e movimento

Os 21 guias têm desenhos SVG originais com silhueta, articulações, apoios, cargas e setas. Os quadros Início e Final permanecem disponíveis e são empilhados no celular. O contorno destaca a região que se move, não uma representação de ativação muscular.

Em **Ver movimento**, use Reproduzir, Pausar e Reiniciar ou escolha Início, Meio e Final. A animação executa uma ida e volta em cerca de seis segundos, sem repetição automática; a velocidade é ilustrativa. Com `prefers-reduced-motion`, os controles de reprodução são substituídos pela seleção de etapas. Fechar o guia ou ocultar a aba interrompe a reprodução.

As poses compartilham as mesmas proporções de braços e pernas. Contatos fixos usam cinemática inversa com verificação de alcance. Vistas frontais projetam a profundidade dos membros, incluindo a flexão dos joelhos para a frente. Pés, cabeça, pelve e palmas acompanham a orientação anatômica; nas panturrilhas, os dedos permanecem apoiados enquanto o calcanhar sobe. Os equipamentos são formas simplificadas e podem diferir da máquina da academia. As referências de cada guia continuam disponíveis para consultar a execução.

A [revisão individual dos 21 exercícios](docs/revisao-movimentos.md) descreve as inconsistências corrigidas e suas referências. `lib/movement-anatomy.js` reúne as proporções e articulações; `lib/movement-rig.js` calcula as poses; `lib/movement-renderer.js` desenha os SVGs preservando o estilo visual.

Para revisão visual dos 21 exercícios em três posições, execute `node scripts/preview-movements.mjs` e abra `http://127.0.0.1:4173/test-results/movements.html` com o servidor local iniciado. A galeria fica em diretório ignorado pelo Git e não é publicada. Os testes cobrem integridade das poses, comprimentos, apoios, IDs acessíveis, ciclo, pausa, encerramento e movimento reduzido.
