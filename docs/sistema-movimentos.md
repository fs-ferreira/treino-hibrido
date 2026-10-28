# Corpo e equipamentos articulados

O catálogo inteiro de 21 exercícios usa `evaluateMovement(kind, t)`. A função recebe uma fase finita (0–1; valores fora da faixa são limitados) e devolve uma cena determinística: corpo, equipamentos, conexões, cabos e diagnósticos. Nenhum resultado depende do quadro anterior. Não há motor físico, dependência de execução, mudança no diário ou no esquema de backup.

## Modelo e fluxo

- **EntityDefinition:** identificador, tipo, transformação local, pai opcional, dimensões, geometria e volumes simplificados de colisão. Peças rígidas só mudam de posição/orientação.
- **Anchor:** posição e quaternion locais e papel (`grip`, `support`, `axis`, `cable`, `contact`). A resolução da hierarquia fornece `worldAnchors`.
- **ExerciseDefinition:** controlador independente, família de carga, mecanismo, apoios e articulações envolvidos; catálogo em `lib/movement-presets.js`.
- **Constraint:** origem/destino e erro medido de uma pegada, superfície, mecanismo ou cabo. Pegadas rígidas também verificam orientação.
- **SceneFrame:** `kind`, `t`, `definition`, `entities`, `skeleton`, `rig`, `constraints`, `cables`, `diagnostics`. `rig` adapta o resultado à silhueta e à API anterior.

Convenção: X para a direita, Y para cima, Z em direção ao observador; distâncias nas unidades de desenho existentes; ângulos internos em radianos; quaternions `[x,y,z,w]`. Apenas os controladores de entrada conservam as poses históricas em graus de tela. Toda a cena resolvida compartilha o mesmo referencial 3D. A projeção para SVG inverte Y e usa a elevação frontal existente. As assinaturas de `poseAt`, `rigAt` e `drawMovement` continuam disponíveis.

O fluxo é: amostrar curvas Hermite sem ultrapassar alvos → resolver controladores e pegadas compartilhadas → construir a hierarquia do corpo → resolver equipamentos/conexões/cabos → medir erros → projetar e ordenar peças por profundidade. Estruturas fixas ficam ao fundo; mãos são desenhadas sobre suas pegadas quando coincidem em profundidade. Não se alongam ossos para esconder um alvo impossível.

A coluna tem segmentos lombar e torácico rígidos (30 e 33 unidades). O corpo inclui pelve, coluna, cabeça, cintura escapular simplificada, braços, punhos/palmas, pernas, tornozelos, antepés e dedos. A elevação escapular acompanha elevação lateral e desenvolvimento. As pegadas possuem rotação axial independente; barras compartilhadas orientam as palmas, e o deslocamento da palma é resolvido antes do cotovelo. Na Scott e na rosca, o controlador mantém o cotovelo fixo enquanto posiciona a pegada. A IK de dois segmentos usa um plano de flexão e uma referência estável para polos paralelos.

## Inventário e direção das relações

As variantes e referências de execução permanecem nos guias e em [revisao-movimentos.md](revisao-movimentos.md). O equipamento é genérico, dimensionado para a figura didática.

| Movimento               | Controlador               | Objetos e conexões principais                                     |
| ----------------------- | ------------------------- | ----------------------------------------------------------------- |
| Elevação lateral        | Abdução do ombro          | Dois halteres, palmas, chão                                       |
| Supino inclinado        | Alvos das mãos            | Dois halteres, banco/encosto, pelve, costas, pés                  |
| Remada curvada          | Trajetória da barra       | Barra rígida, duas pegadas, pés                                   |
| Extensora unilateral    | Rotação do joelho         | Eixo fixo, alavanca/rolo, assento e encosto                       |
| Puxada aberta           | Trajetória da barra       | Duas pegadas fixas, cabo, polia, torre e bloco de pesos           |
| Tríceps corda           | Extensão do cotovelo      | Dois ramos de comprimento fixo, junção, cabo, pesos               |
| Panturrilha sentada     | Rotação sobre o antepé    | Plataforma, assento, alavanca de raio fixo, almofada sobre a coxa |
| RDL unilateral          | Dobradiça do quadril      | Halter contralateral e pé de apoio                                |
| Búlgaro                 | Trajetória da pelve       | Dois halteres, pé no chão, dorso do pé sobre banco                |
| Crucifixo máquina       | Adução do ombro           | Duas alavancas, pegadas, assento/encosto                          |
| Crossover               | Adução do ombro           | Dois puxadores, dois circuitos de cabo/pesos, base afastada       |
| Remada máquina          | Trajetória do puxador     | Puxador compartilhado, cabo/pesos, peito e assento                |
| Rosca na polia          | Flexão do cotovelo        | Barra curta, duas pegadas, polia baixa e pesos                    |
| Rosca Scott             | Flexão do cotovelo        | Barra EZ, almofada dos braços, assento                            |
| Mesa flexora unilateral | Rotação do joelho         | Banco, apoio da coxa/pelve, eixo e rolo                           |
| Cadeira adutora         | Adução do quadril         | Assento/encosto, duas alavancas, almofadas e descansos dos pés    |
| Panturrilha em pé       | Rotação sobre o antepé    | Plataforma, pegadas fixas de equilíbrio                           |
| Desenvolvimento         | Elevação dos braços       | Dois halteres, assento/encosto e pés                              |
| Tríceps francês         | Extensão do cotovelo      | Um halter com duas regiões de apoio sob a cabeça superior         |
| Abdominal máquina       | Flexão lombar/torácica    | Assento, puxador compartilhado, cabo/pesos                        |
| Reverse crunch          | Rotação/elevação da pelve | Banco, apoio torácico e pegadas fixas                             |

## Peças e mecanismos

`lib/movement-space.js` concentra transformações, quaternions, interpolação e IK. `lib/movement-objects.js` oferece fábricas de halter, barra/EZ, puxador, banco, plataforma, almofada, alavanca, polia, torre e bloco de pesos. A hierarquia rejeita pais ausentes, IDs repetidos e ciclos.

O banco tem base/assento e encosto separados. A configuração posiciona superfícies de apoio na montagem inicial; os apoios são filhos do equipamento, e não são reposicionados a cada fase. As alavancas mantêm seu raio. Na panturrilha sentada, uma solução escalar mantém o raio e permite que a almofada deslize ao longo da superfície da coxa.

`lib/movement-mechanisms.js` calcula tangentes e o arco de contato de uma polia orientável. O comprimento analítico inclui arco e trechos retos. O circuito ideal conserva `percurso externo + N × comprimento dos ramos de sustentação`. O bloco de pesos deriva desse comprimento, com curso limitado; não usa uma curva decorativa independente. A galeria verifica as transmissões 1:1 e 2:1, incluindo o semicírculo da polia móvel. A corda tem dois ramos de comprimento fixo e uma junção geometricamente resolvida.

Os circuitos dos exercícios são 1:1. Sua montagem é declarada em `cableLayouts`, considera a faixa de trajetórias do clipe e reserva margem de curso. Ao alterar uma trajetória, confira também o comprimento declarado e o curso dos pesos; a avaliação não amostra outros quadros durante a reprodução. A demonstração não calcula forças, atrito, massa ou ativação muscular. Os limites de articulação são limites das animações adotadas, não amplitudes clínicas individuais.

## Como adicionar um objeto ou exercício

1. Crie uma fábrica em `movement-objects.js` com dimensões próprias, geometria local e pontos de conexão nomeados. Use uma hierarquia quando houver peças que se movem entre si. Para cargas, acrescente cápsulas locais de colisão.
2. Inclua um exemplo em `scripts/movement-lab-examples.js`. Anime apenas transformações ou graus de liberdade do mecanismo. Verifique dimensões, conexões e extremos sem o corpo.
3. Para um mecanismo novo, implemente a relação geométrica em `movement-mechanisms.js`, com falha explícita em estados impossíveis. Acrescente um teste que confira o resultado físico esperado.
4. Cadastre a variante em `exerciseScenes` e suas três poses em `movement-data.js`. Defina quem conduz o movimento e quais resultados são derivados. Um equipamento ou alvo não deve depender recursivamente de sua própria saída.
5. Conecte as âncoras em `movement-scene.js`; mantenha a matemática específica fora do renderer. Para uma nova cadeia corporal, atualize também `movement-skeleton.js` e seus limites ilustrativos.
6. Verifique 101 fases, consultas fora de ordem, continuidade, contatos e interferências. Revise a execução contínua e três posições no navegador, nas duas larguras.

## Galeria e verificações

```sh
npm run preview:movements
npm start
# http://127.0.0.1:4173/test-results/movements.html
npm test
npm run test:movements
```

A galeria inclui objetos e mecanismos isolados, corpo sem equipamentos, exercício conectado, seleção livre de fase, reprodução/pausa, repetição opcional, eixos e pontos de conexão. Movimento reduzido impede reprodução, mantendo a seleção de fases. Galeria, capturas e relatórios ficam em `test-results/`, ignorado pelo Git e fora da publicação.

Os testes de navegador usam Playwright apenas em desenvolvimento. Usa-se Chromium do sistema quando disponível; também é possível definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE` ou instalar o navegador com `npx playwright install chromium`. A configuração inicia o servidor local quando necessário.

As verificações automáticas abrangem comprimentos rígidos e de cabo (`1e-6`), contatos (`0,25` unidade), orientação de pegada (`1°`), singularidades, limites, consultas determinísticas e volumes simplificados de interferência das cargas com cabeça/tronco. Esses volumes não representam todas as colisões anatômicas possíveis. A revisão visual continua necessária para conferir a variante didática e a legibilidade da projeção.

Referências de arquitetura: [OpenSim — componentes, corpos e articulações](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53088473), [Blender — alvos e polos de IK](https://docs.blender.org/manual/en/dev/animation/constraints/tracking/ik_solver.html), [MuJoCo — percursos e polias](https://mujoco.readthedocs.io/en/3.4.0/XMLreference.html#tendon-spatial).

## Reprodução nos guias

Os 21 guias mostram uma única cena animada, iniciada automaticamente ao abrir. O movimento repete ciclos de ida e volta de seis segundos. Pausar e selecionar uma etapa interrompem a reprodução; fechar o guia ou ocultar a aba também a interrompe. Com movimento reduzido, o guia oferece a seleção de Início, Meio e Final sem reprodução automática. Os quadros separados e o botão intermediário “Ver movimento” foram removidos.
