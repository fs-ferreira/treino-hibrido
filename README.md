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

Os testes verificam paces, distâncias, oito blocos do intervalado, calendário local, isolamento das semanas, validação de backup e completude dos 21 guias.

## Como usar

1. Abra Configurações e informe os paces com a máscara automática (digite `600` para `6:00`). O pace de caminhada é opcional. Registre a maior corrida recente em distância, tempo e data; o pace médio aparece automaticamente. A opção de usar esse pace como moderado-forte bloqueia o campo manual; desmarcar restaura o valor manual anterior.
2. Escolha sábado ou domingo para o longão e a duração entre 60 e 90 minutos.
3. Em Hoje ou Semana, abra uma sessão. Na musculação, registre carga e repetições de cada série; em Como fazer, consulte o guia ilustrado e a demonstração externa.
4. Depois da corrida, registre duração, distância, esforço e observações.
5. Consulte Histórico e exporte periodicamente um backup em Configurações.

O app preserva os 21 exercícios, 3 séries de 6–8 repetições e a distribuição semanal das imagens do post de @thalleshirakawa. Variantes adotadas são indicadas nos guias. Ilustrações SVG são originais e esquemáticas; os vídeos externos mostram o movimento com mais detalhe.

## Cálculos e fontes

- Pace é convertido de `mm:ss` para segundos/km.
- Distância (km) = minutos × 60 ÷ pace; velocidade (km/h) = 3600 ÷ pace.
- Intervalado: 5 min leves + 8 × (3 min moderado-forte + 1 min leve) + 3 min de caminhada = 40 min. Sem pace de caminhada, a distância exibida é parcial.
- Corrida leve: 30 min. Longão: 60–90 min. Esforço 3–4/10 conforme o post, sem progressão automática.
- O pace moderado-forte é informado pelo usuário; não é derivado de um percentual arbitrário do pace leve. Não há implementação de cálculo VDOT.

Referências de corrida: [CDC](https://www.cdc.gov/physical-activity-basics/measuring/index.html) e [V.O2](https://vdoto2.com/calculator/). Referências específicas dos exercícios e demonstrações estão em `assets/references.json` e no guia de cada exercício. Consulta em 20/10/2026. Principais fontes: ACE, Muscle & Strength, NASM, NISMAT e Catalyst Athletics. Os links externos dependem da disponibilidade dos provedores. A demonstração de reverse crunch é no chão; o guia descreve a adaptação ao banco.

## Dados e backup

Um perfil por navegador. Armazenamento em `localStorage`, chave `treino-hibrido:v1`; esquema versão 2. Diários e backups da versão 1 são migrados, preservando o texto da corrida recente como anotação e todas as sessões. Os novos campos são preenchidos pelo usuário, sem interpretar o texto antigo. Não há contas, analytics, GPS, cronômetro nem sincronização. Dados pessoais nunca são enviados ao repositório. A navegação a vídeos e fontes externas abre os respectivos sites somente quando o usuário clica.

Backup JSON contém configurações e sessões por data local `AAAA-MM-DD`, com tipo de treino, conclusão, séries e registro de corrida. A importação valida todo o arquivo antes de substituir o diário; é solicitada confirmação. Arquivos inválidos preservam os dados atuais. O navegador pode apagar o armazenamento; mantenha cópias exportadas. Limpar os dados exige confirmação. Se o armazenamento falhar, o app informa a limitação e permite exportar os dados da aba.

## Publicar e atualizar

Repositório público pessoal: `fs-ferreira/treino-hibrido`. GitHub Pages usa **GitHub Actions** como fonte. Cada push na branch `main` executa os testes e publica apenas HTML, CSS, JS e assets do app. Arquivos de teste e dados locais não integram o site. Assets usam caminhos relativos para funcionar sob `/treino-hibrido/`.

Para atualizar: editar, executar `npm test`, testar no navegador e enviar um commit para `main`. Acompanhar o workflow `Validate and deploy Pages`. Um deploy não altera o `localStorage` do usuário; futuras mudanças no esquema precisam de migração explícita.

## Estrutura

- `app.js`: interface, formulários, navegação e persistência.
- `lib/motion.js`: transições canceláveis, acordeões e ciclo de vida dos painéis.
- `lib/core.js`: calendário, cálculos e validação dos backups.
- `lib/icons.js`, `lib/ui.js`: ícones SVG locais Lucide e máscaras de digitação.
- `lib/exercises.js`, `lib/diagrams.js`: conteúdo dos guias e imagens SVG.
- `assets/references.json`: fontes e demonstrações verificadas.
- `tests/core.test.mjs`: testes de regressão.
- `lib/movement-data.js`, `lib/movement-equipment.js`, `lib/movement-player.js`: poses, equipamentos e reprodução dos movimentos.

O plano é uma reprodução organizacional do conteúdo fornecido; não faz avaliação individual nem ajusta automaticamente a carga de treino.

## Movimento da interface

As transições duram de 90 a 220 ms. Marcar séries e ajustar a duração do longão atualiza os indicadores no lugar, preservando campos e foco. As abas guardam a posição de rolagem em memória durante a visita. Os guias e confirmações usam painéis pela base em telas de até 600 px; no desktop permanecem centralizados. O fechamento devolve foco e rolagem ao ponto anterior.

O app respeita `prefers-reduced-motion`, inclusive quando a preferência muda durante o uso, e mantém os controles funcionais sem a Web Animations API. Não há migração de armazenamento. As animações de execução dos exercícios continuam opcionais e independentes das transições da interface.

Para medir localmente, abra `http://127.0.0.1:4173/?motion-debug=1#hoje`. Um indicador mostra intervalos de quadros e tarefas acima de 50 ms que se sobrepõem às transições. Os valores são observações do navegador e do dispositivo em uso, não uma garantia de FPS. O diagnóstico só é ativado por esse parâmetro e não transmite nem armazena dados. A [validação da interface](docs/validacao-interface.md) registra os cenários testados e as limitações.

## Ícones

[Lucide](https://lucide.dev/guide/static) é distribuído localmente, sem CDN nem fonte de emoji. Licença ISC em `assets/lucide-LICENSE.txt`. Para regenerar os ícones: `npm ci` e `npm run icons`. As dependências são apenas de desenvolvimento; execução e publicação não exigem instalação ou build.

## Ilustrações e movimento

Os 21 guias têm desenhos SVG originais com silhueta, articulações, apoios, cargas e setas. Os quadros Início e Final permanecem disponíveis e são empilhados no celular. O contorno destaca a região que se move, não uma representação de ativação muscular.

Em **Ver movimento**, use Reproduzir, Pausar e Reiniciar ou escolha Início, Meio e Final. A animação executa uma ida e volta em cerca de seis segundos, sem repetição automática; a velocidade é ilustrativa. Com `prefers-reduced-motion`, os controles de reprodução são substituídos pela seleção de etapas. Fechar o guia ou ocultar a aba interrompe a reprodução.

As poses compartilham as mesmas proporções de braços e pernas. Contatos fixos usam cinemática inversa com verificação de alcance. Vistas frontais projetam a profundidade dos membros, incluindo a flexão dos joelhos para a frente. Pés, cabeça, pelve e palmas acompanham a orientação anatômica; nas panturrilhas, os dedos permanecem apoiados enquanto o calcanhar sobe. Os equipamentos são formas simplificadas e podem diferir da máquina da academia. As referências de cada guia continuam disponíveis para consultar a execução.

A [revisão individual dos 21 exercícios](docs/revisao-movimentos.md) descreve as inconsistências corrigidas e suas referências. `lib/movement-anatomy.js` reúne as proporções e articulações; `lib/movement-rig.js` calcula as poses; `lib/movement-renderer.js` desenha os SVGs preservando o estilo visual.

Para revisão visual dos 21 exercícios em três posições, execute `node scripts/preview-movements.mjs` e abra `http://127.0.0.1:4173/test-results/movements.html` com o servidor local iniciado. A galeria fica em diretório ignorado pelo Git e não é publicada. Os testes cobrem integridade das poses, comprimentos, apoios, IDs acessíveis, ciclo, pausa, encerramento e movimento reduzido.
