# Validação — apresentação de corrida e Configurações v6.1

Data: 05/11/2026. Validação local com dados sintéticos e API simulada; nenhuma conta real, diário pessoal ou banco de produção foi utilizado.

## Comportamento entregue

- Hoje e Treinos compartilham etapas com duração, pace e FC disponível. O resumo do intervalado inclui forte e recuperação; os oito ciclos permanecem recolhidos.
- Velocidade, distância, zonas, percentuais, ajuste de pace e orientação cardíaca estão em uma única área **Detalhes e ajuda**. A explicação sobre atraso da FC aparece uma vez.
- Configurações prioriza campos e resultado resumido. **Como calculamos** reúne fórmulas por sexo, cálculo da idade, fontes, relógio e referências históricas.
- Nascimento usa seleção exclusiva de ano e mês, com salto direto entre anos, seleção evidente, limpeza e alternativa de dois selects sem Popover API. O rascunho continua MM/AAAA e o dado salvo AAAA-MM.
- Fórmulas, faixas, progressão, duração, paces, snapshots, versões de backup e protocolo de sincronização permanecem inalterados. Nenhuma migração foi necessária.

## Matriz de layout

| Conteúdo                                           | 320 px    | 390 px    | 1440 px   |
| -------------------------------------------------- | --------- | --------- | --------- |
| Hoje: intervalado recolhido e expandido            | Conferido | Conferido | Conferido |
| Treinos: dia de corrida expandido                  | Conferido | Conferido | Conferido |
| Configurações: Corrida, Progressão, Semana e Dados | Conferido | Conferido | Conferido |
| Seletor de nascimento aberto                       | Conferido | Conferido | Conferido |
| Zoom real de 200% no Edge                          | Conferido | Conferido | Conferido |

A validação de zoom usa um perfil temporário do navegador e sua escala real de página, confirmando `devicePixelRatio = 2` e larguras úteis de 160, 195 e 720 CSS px. Não usa `transform`, `zoom` CSS ou apenas `deviceScaleFactor` como substituto. Nenhuma das páginas da matriz ultrapassa horizontalmente a janela.

Nos espaços mais estreitos, o cabeçalho, os botões e o resumo semanal se reorganizam. A navegação passa ao fluxo normal e mostra os quatro destinos em duas linhas, evitando cobrir o conteúdo; nas larguras habituais, o menu circular é preservado. Abas de Configurações e dias da semana mantêm sua rolagem local.

As capturas foram inspecionadas em `test-results/run-presentation/`, incluindo planejamento, Configurações e painel de nascimento. Elas são artefatos locais ignorados pelo Git.

## Verificações funcionais

- Fórmulas masculina/feminina, idade por mês, limites inclusivos de 18–100 anos e mudança no mês de aniversário.
- Seleção de anos distantes, setas, Home/End, Enter/Espaço, Escape, retorno de foco, seleção anunciada e operação por toque em emulação.
- Limpar nascimento sem apagar sexo; erro contextual no salvamento; ausência de gravação ao navegar pelo seletor; persistência após salvar e recarregar.
- Rascunhos entre categorias, campos vinculados à corrida recente, falhas de sincronização, longão e preservação de foco/ajudas depois de registrar uma corrida.
- Oito ciclos, 18 etapas e 40 minutos. Referências salvas imutáveis e registros antigos sem bpm retroativos.
- Regressão de importação/exportação, programação, cancelamento e restauração, sem alteração do formato v6.
- Ações e erro de campo acessíveis em viewport curto; barra de salvamento no fluxo normal quando o espaço é reduzido.

## Execução e limites

- `npm test`: **181 testes passaram**.
- `npm run test:ui`: regressão ampla com **83 testes aprovados**, antes do último cenário adicional de viewport curto; somente o teste exclusivo de toque foi pulado no projeto desktop.
- Verificação final focada em `heart-rate-browser.spec.mjs` e `run-presentation-browser.spec.mjs`: **13 testes aprovados**, incluindo o cenário adicional e a prévia reduzida. O zoom real também foi repetido com ciclos e ajuda expandidos.
- `npm run test:compat`: **46 cenários aprovados** em Firefox 157, WebKit 27.2 e emulações Pixel 7/iPhone 13. Os seis skips correspondem ao zoom desktop específico de Chromium e ao toque não aplicável nos projetos desktop. O cenário adicional de viewport curto também foi repetido nesses quatro projetos.
- `npm run build` e `git diff --check`: aprovados.

Os projetos de compatibilidade testam os motores no Windows e os recursos de emulação do Playwright. Permanecem pendentes o teste com dispositivos físicos Android/iOS, Safari real, teclado virtual físico e leitores de tela NVDA/VoiceOver. Os nomes acessíveis, papéis, seleção e foco foram verificados automaticamente; isso não substitui uma sessão com leitor de tela.

## Ajuste v6.1.2

A lista expandida dos oito ciclos foi removida de Hoje e Treinos. O planejamento mostra aquecimento, um par de forte e recuperação com **Repetir 8 vezes**, e caminhada final. As 18 etapas e os 40 minutos permanecem no modelo e nos snapshots. Pace, km/h, FC e fontes reduzidas continuam visíveis. A ajuda técnica permanece disponível.
