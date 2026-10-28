# Cards compactos de musculação

Os 21 exercícios usam o mesmo card, com carga, repetições e conclusão como conteúdo principal. A variante permanece no guia. As sugestões são ações curtas junto à carga, com histórico, datas e justificativas em uma seção nativa recolhida. “Sem peso adicional” mantém seu comportamento para as três séries e deixa de ocupar um painel separado.

## Comparação visual

Capturas antes e depois usam o mesmo histórico sintético da mesa flexora unilateral: três referências concluídas de 12, 16 e 16 kg, oito repetições, com progressão de 5%. A referência anterior é de 21/10/2026 e a sessão de teste é de 28/10/2026. Os dados ficam em contextos isolados de navegador; nenhum diário real é alterado.

| Viewport | Altura anterior | Altura nova | Redução |
| -------- | --------------: | ----------: | ------: |
| 320 px   |        974,8 px |    672,5 px |   31,0% |
| 390 px   |        870,3 px |    651,5 px |   25,1% |
| 768 px   |        769,9 px |    464,9 px |   39,6% |
| 1440 px  |        769,9 px |    464,9 px |   39,6% |

As metas de redução mínima de 20% no celular e 35% no desktop foram atendidas. Os campos continuam com fonte de 16 px e pelo menos 48 px de altura. Botões, rótulos de conclusão, opção de peso e abertura do histórico mantêm áreas de toque de pelo menos 44 × 44 px. As capturas incluem a seção de histórico fechada e aberta, sem rolagem horizontal nas quatro larguras.

## Estados e interações verificados

Os cenários Playwright cobrem:

- As quatro larguras, disposição horizontal da sugestão no desktop e cabeçalho próprio para cada série até 600 px. No celular, identificação e sugestão ficam acima de carga, repetições e conclusão; os três controles têm a mesma altura e alinhamento, com rótulos locais para os campos.
- Primeiro registro sem sugestões e sem a descrição repetida da variante.
- Aplicação por série sem substituir cargas manuais ou repetições das outras séries.
- Sugestões arredondadas para o quilo inteiro superior e ajuste manual em passos de 0,5 kg, com persistência. Botões − e + respeitam os limites de 0 e 2000 kg e o modo sem peso adicional.
- Preservação do elemento de entrada e da rolagem ao aplicar uma sugestão, sem transferir o foco para o campo e abrir o teclado no celular; verificado também com toque em contexto mobile.
- Bloqueio e liberação de sugestões ao concluir e reabrir uma série, incluindo estado carregado do armazenamento.
- Modo sem peso adicional: cargas preservadas, campos desabilitados, sugestões ocultas e persistência após recarregar.
- Referências de datas diferentes por série, manutenção abaixo de oito repetições e progressão configurada em 0%.
- Sugestão acima de 2000 kg desabilitada, com indicação “Fora do limite” e justificativa disponível no histórico.
- Histórico independente do card principal, operação por teclado, foco visível e retorno do foco ao fechar o guia.
- Nomes acessíveis completos para campos e controles. As árvores acessíveis são registradas junto às capturas.

A suíte Node existente também passou, incluindo progressão, armazenamento, calendário, interface e demonstrações articuladas. Cálculos, esquema de backup e registros permanecem iguais. Apenas marcação, apresentação e sincronização dos controles foram adaptadas; os identificadores de cache do app e dos estilos foram atualizados em conjunto.

## Reproduzir

```sh
npm ci
npm test
npm run test:ui
```

Playwright usa Chromium do sistema quando disponível. Também é possível definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE` ou instalar o navegador com `npx playwright install chromium`. O servidor local é iniciado automaticamente quando necessário.

`tests/helpers/exercise-card-fixture.mjs` define os dados sintéticos. `test-results/ui/` contém capturas, alturas, árvores acessíveis e traces em caso de falha. A comparação local entre versões fica em `test-results/exercise-cards/`; os artefatos são ignorados pelo Git e não são publicados.

A validação usa Chromium headless e tamanhos de viewport. Não houve teste em aparelho físico nem operação de VoiceOver ou TalkBack; foram verificados os nomes acessíveis, as associações descritivas, a estrutura exposta pelo navegador e a navegação por teclado.
