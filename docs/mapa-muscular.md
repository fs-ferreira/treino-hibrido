# Mapa muscular dos exercícios

O mapa aparece dentro dos cards abertos da sessão e em cada exercício dos dias expandidos em Treinos. O nome continua no cabeçalho. A mesma anatomia SVG local é usada nos dois contextos, com vermelho luminoso `#FF6B6B` para os alvos principais, vermelho escuro `#7F1D1D` para os secundários e cinza para as demais regiões. A razão de contraste entre os preenchimentos passou de 2,21:1 para 3,61:1; os contornos dos secundários preservam sua visibilidade no fundo escuro. Frente e costas são selecionadas pelo menor conjunto que mostre todos os alvos; a frente vence os empates.

O mapa é estático. Cursor, toque e foco pelo teclado exibem o nome e a função do músculo na linha abaixo da legenda. Enter e Espaço selecionam ou desmarcam uma região; Escape, toque fora, saída do foco e fechamento do card limpam a indicação. As regiões bilaterais pertencem ao mesmo grupo interativo. A descrição do mapa lista os nomes e funções em texto acessível; o SVG mantém seus grupos navegáveis em vez de ocultá-los sob um `role="img"`.

As figuras medem 180 px de altura. Abaixo de 1024 px, ficam acima dos controles. A partir desse ponto, a sessão usa uma coluna de 220 px ao lado do formulário; Treinos usa a mesma largura ao lado do nome. O controlador delegado permanece no elemento principal e apenas atualiza a seleção e o texto de feedback: não recria campos, salva dados nem inicia animações. O estado é limpo antes de renderizar outra tela.

## Cadastro e referências

Revisão em 01/11/2026. Os identificadores em `lib/muscle-data.js` se referem às variantes descritas nos guias. O cadastro é uma seleção qualitativa de alvos e sinergistas relevantes, não uma medição de ativação nem uma lista exaustiva de todos os estabilizadores. Uma lista secundária vazia significa que nenhum secundário é destacado neste atlas, não que os demais músculos estejam inativos. Não há percentuais.

| Exercício                        | Principais                   | Secundários destacados                                                             |
| -------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Crucifixo na máquina             | Peitoral maior               | Deltoide anterior                                                                  |
| Supino inclinado                 | Peitoral maior               | Deltoide anterior, tríceps                                                         |
| Puxada aberta                    | Latíssimo do dorso           | Bíceps, trapézio, romboides, deltoide posterior                                    |
| Remada máquina                   | Trapézio, romboides          | Latíssimo do dorso, bíceps, deltoide posterior                                     |
| Elevação lateral                 | Deltoide lateral             | —                                                                                  |
| Rosca direta na polia            | Bíceps                       | —                                                                                  |
| Tríceps corda                    | Tríceps                      | —                                                                                  |
| RDL unilateral                   | Glúteo máximo, isquiotibiais | Eretores da coluna                                                                 |
| Búlgaro                          | Quadríceps                   | Glúteo máximo, isquiotibiais, adutores                                             |
| Mesa flexora unilateral          | Isquiotibiais                | —                                                                                  |
| Cadeira extensora unilateral     | Quadríceps                   | —                                                                                  |
| Cadeira adutora                  | Adutores                     | Glúteo máximo, isquiotibiais                                                       |
| Panturrilha sentado              | Sóleo                        | Gastrocnêmio                                                                       |
| Panturrilha em pé                | Gastrocnêmio                 | Sóleo                                                                              |
| Remada curvada                   | Trapézio, romboides          | Latíssimo do dorso, bíceps, deltoide posterior, eretores da coluna, reto abdominal |
| Cross over                       | Peitoral maior               | Deltoide anterior                                                                  |
| Desenvolvimento                  | Deltoides anterior e lateral | Tríceps, trapézio                                                                  |
| Rosca Scott                      | Bíceps                       | —                                                                                  |
| Tríceps francês                  | Tríceps                      | —                                                                                  |
| Abdominal máquina                | Reto abdominal               | —                                                                                  |
| Abdominal infra / reverse crunch | Reto abdominal               | —                                                                                  |

As fontes individuais já estão em `assets/references.json`. Os perfis de alvo e músculos secundários de 17 páginas do Muscle & Strength foram consultados diretamente, assim como as instruções da ACE para o RDL e da Catalyst Athletics para o reverse crunch. A categoria ampla “upper back” foi representada por trapézio e romboides; as porções dos deltoides e os sinergistas das puxadas foram discriminados de forma didática conforme as ações articulares dos guias. Não são novos dados de EMG. O desenho projeta regiões musculares, inclusive romboides e a porção visível do sóleo, sem pretender uma dissecação de camadas.

Complementos usados na revisão:

- [ACE — Romanian Deadlift](https://www.acefitness.org/continuing-education/certified/may-2025/8865/the-ace-do-it-better-series-the-romanian-deadlift/): cadeia posterior, incluindo glúteos, isquiotibiais e eretores.
- [PureGym — Seated Calf Raises](https://www.puregym.com/exercises/legs/calf-exercises/seated-calf-raises/) e [HSS — Posterior Chain](https://www.hss.edu/health-library/move-better/posterior-chain-strengthening): distinção de ênfase entre sóleo com joelho flexionado e gastrocnêmio em pé.
- [NASM — Cable Crossover](https://www.nasm.org/resource-center/exercise-library/cable-crossover): peitoral como motor principal da adução e contribuição do deltoide anterior. A página original do Muscle & Strength retornou 403 nesta revisão; a classificação do deltoide como secundário no app exprime sua função de assistência.
- [WorkoutLabs — Machine Ab Crunches](https://workoutlabs.com/exercise-guide/ab-crunch-machine/): a página direta retornou 403; as instruções e o alvo abdominal foram conferidos no [conteúdo indexado do próprio WorkoutLabs](https://workoutlabs.com/fit/wkt/xpNy1m7/abs/). Não foram atribuídos flexores do quadril ou oblíquos como secundários sem discriminar o equipamento.
- [Catalyst Athletics — Reverse Crunch](https://www.catalystathletics.com/exercise/320/Reverse-Crunch/): a elevação da pelve é uma variação de crunch, e o app mantém o reto abdominal como alvo, sem inventar um músculo “infra”.

Todos os exercícios unilaterais mostram os dois lados, coerentemente com a instrução de completar ambos. Desenhos e preenchimentos são originais; nenhuma imagem das referências foi copiada. Guias animados, rotinas, séries, progressão, registros e backup versão 3 mantêm seus contratos.

## Validação

`npm test` verifica cobertura dos 21 exercícios, identificadores e regiões válidas, seleção mínima de vistas, simetria bilateral, casos de panturrilha e abdômen e descrições independentes entre contextos. `npm run test:ui` inclui os cenários do mapa e a regressão dos cards existentes.

A comparação de compactação desconta apenas o novo bloco anatômico quando ele fica acima do formulário, mantendo cabeçalho, espaçamentos e controles no orçamento original; no desktop, ainda considera o card inteiro. Limita também a altura do mapa e do card fechado. As larguras verificadas são 320, 390, 768, 1024 e 1440 px. As capturas de sessão posterior, sessão com duas vistas e catálogo ficam em `test-results/ui/`, junto das árvores acessíveis e traces das suítes existentes. Toque é exercitado em contexto mobile com dados sintéticos e API simulada, sem alterar um diário real.

Resultados da execução local: 132 testes Node, 22 testes de interface, 5 de autenticação e 6 de movimentos aprovados, além do build público e da conferência de formatação. A suíte de interface inclui Escape com o foco fora do mapa e nenhuma gravação na API ao consultar ou selecionar músculos. Capturas de 390 e 1440 px na sessão e 1024 px no catálogo foram inspecionadas visualmente.

| Viewport | Card aberto | Formulário | Bloco anatômico |
| -------- | ----------: | ---------: | --------------: |
| 320 px   |      957 px |   560,5 px |        282,5 px |
| 390 px   |      936 px |   560,5 px |        282,5 px |
| 768 px   |    747,4 px |   366,5 px |        282,5 px |
| 1440 px  |    464,9 px |   374,5 px |        281,5 px |

O bloco anatômico inclui figuras de 180 px, rótulos de vista, legenda e espaço reservado ao nome selecionado. No desktop, mapa e formulário ocupam colunas lado a lado; por isso suas alturas não se somam.

A validação de navegador usa Chromium headless. Não substitui revisão em aparelho físico, Safari, VoiceOver ou TalkBack. Esta alteração não inclui publicação.
