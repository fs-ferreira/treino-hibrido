# Validação do filtro do Histórico

O painel usa os controles nativos e os tokens existentes, com padding de 24 px no desktop e 16 px no celular. Cabeçalho, resumo aplicado e limpeza ficam fora da grade. Até 600 px, o formulário começa recolhido; acima disso, permanece aberto, com duas colunas até 1023 px e três a partir de 1024 px. Corridas usam dois campos. As datas possuem um grupo separado.

## Comportamento e acessibilidade

- Valores em edição e recorte aplicado são separados. Enquanto as datas estiverem incompletas ou invertidas, nenhum dos filtros em edição altera lista, métricas, comparação por exercício ou paginação. O resumo continua identificando o recorte aplicado e um aviso neutro identifica a edição pendente.
- A seleção de intervalo personalizado começa com orientação, sem erro antecipado. Datas inválidas ou invertidas têm mensagem associada aos campos e `aria-invalid`. Um intervalo de um único dia é válido e inclui as duas extremidades.
- Seleções válidas são aplicadas automaticamente. Alterar o recorte reinicia a exibição em 20 treinos; limpar também remove as datas e pendências, mantendo a expansão. Treinos incompatíveis limpam a seleção de exercício.
- Resumo usa datas DD/MM/AAAA e nomes selecionados. Contagens distinguem singular e plural. Datas dentro dos campos mantêm o formato nativo do idioma do navegador.
- Expansão e filtros permanecem apenas na memória da visita. Campos, rolagem e foco são preservados nas atualizações; o controle de expansão opera por Enter/Espaço, informa `aria-expanded`/`aria-controls` e mantém foco visível. Ao reduzir a largura com foco em um campo, o painel permanece aberto.
- Uma região persistente de status anuncia o recorte, a quantidade total/exibida e eventuais pendências sem usar toast visual ou mover o foco.

## Comparação visual

Capturas antes/depois usam o mesmo diário sintético de 26 registros, a mesma data e idioma pt-BR. A versão anterior é lida diretamente do commit base, sem substituir arquivos de trabalho. Artefatos locais em `test-results/history-comparison/`: `before-390-default.png`, `after-390-default.png`, `before-390-custom.png`, `after-390-custom.png`, `before-1440-default.png`, `after-1440-default.png` e `measurements.json`.

| Estado em 390 × 844 px                   | Altura anterior |        Altura atual |
| ---------------------------------------- | --------------: | ------------------: |
| Inicial                                  |        320,5 px | 135,4 px, recolhido |
| Campos abertos, período padrão           |        320,5 px |            417,9 px |
| Datas personalizadas incompletas, aberto |        583,1 px |            733,1 px |

A redução de aproximadamente 58% corresponde ao estado inicial recolhido. Ao expandir, o espaçamento e os grupos aumentam a altura do formulário; os campos permanecem no fluxo rolável da página. Não se atribui essa redução aos estados abertos.

O cenário responsivo automatizado salva capturas inicial/expandida/personalizada para 320, 390, 600, 601, 768, 1024 e 1440 px, além de 844 × 390 px em paisagem. A conferência adicional verificou as colunas, o padding, controles com pelo menos 48 px e ausência de overflow horizontal. As capturas da suíte ficam sob `test-results/ui/`.

## Verificações

| Check                         | Resultado local       |
| ----------------------------- | --------------------- |
| `npm test`                    | 156 testes aprovados  |
| `npm run build`               | Aprovado              |
| `npm run test:ui`             | 57 cenários aprovados |
| `npm run test:auth`           | 36 cenários aprovados |
| `npm run test:movements`      | 6 cenários aprovados  |
| Prettier e `git diff --check` | Sem erros             |

Sete testes unitários cobrem limites de 30/90 dias, exclusão de datas futuras e treinos apenas programados, datas iguais/incompletas/inválidas/invertidas, preservação integral do recorte, compatibilidade de exercício e limpeza. Cinco novos cenários de navegador complementam a paginação e comparação já existentes: resultados e métricas durante edição pendente, troca de treino com comparação aplicada, teclado/foco/resize/navegação, limpeza de estado vazio e matriz visual responsiva. Os cenários verificam que consultar e filtrar não grava no diário.

Executar:

```sh
npm test
npm run build
npm run test:ui
npm run test:auth
npm run test:movements
git diff --check
```

Dados e API são simulados no navegador; nenhum diário real é alterado. A conferência headless não substitui Safari/iPhone físico, teclado virtual ou leitor de tela real. O deploy de produção deve ser confirmado pelo commit integrado na main.
