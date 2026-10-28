# Validação do sistema articulado — 27/10/2026

## Resultado e reprodução

Os 21 exercícios usam a mesma avaliação de cena, com corpo e equipamentos conectados em 3D e projeção SVG. As APIs anteriores e o player foram preservados; não houve alteração em armazenamento, backup ou registros de treino.

Comandos de verificação:

```sh
npm test
npm run preview:movements
npm run test:movements
```

A suíte Node cobre os nove arquivos de testes do projeto. Os três módulos específicos de movimento reúnem 30 casos: regressões do rig/player, geometria e mecanismos, e integração da cena. Os cinco cenários Playwright cobrem as duas larguras, a galeria, os controles usados no guia e o desempenho.

## Verificações geométricas

- Transformações locais/globais, quaternions e âncoras preservam distâncias. Hierarquias com ciclos, pais ausentes ou IDs repetidos são rejeitadas.
- IK permanece finita com polos paralelos, extensão completa e alvos próximos da flexão máxima. Alvos impossíveis falham explicitamente.
- Curvas têm continuidade na chave intermediária e não ultrapassam os alvos definidos.
- Barras conservam dimensões e distância entre pegadas; as pegadas também pertencem à geometria visível da barra, inclusive na EZ.
- Polias usam junções tangentes e comprimento analítico do arco. Circuitos 1:1 e 2:1 conservam comprimento e produzem a razão esperada de deslocamento dos pesos.
- Os oito exemplos de objetos/mecanismos são verificados em 101 fases cada, antes da integração com o corpo.
- As 2.121 cenas amostradas (101 fases × 21 exercícios) verificam proporções, limites de articulação, rigidez, contatos, pegadas, cabos e curso das torres.
- O bloco de pesos permanece conectado à extremidade de sustentação do cabo; não há uma curva independente para animá-lo.
- Consultas em ordem diferente e exercícios intercalados produzem o mesmo resultado.
- Volumes simplificados detectam interferência das cargas com cabeça/tronco. Um teste desloca deliberadamente uma carga para dentro da cabeça para verificar a detecção.

Tolerâncias: `1e-6` para comprimentos rígidos e cabos, `0,25` unidade para contatos e `1°` para orientação de pegadas que exigem alinhamento. Os limites articulares incluem os punhos e são específicos das variantes ilustradas.

## Revisão visual e funcional

As capturas de início, meio e final abrangem os 21 exercícios em 390 e 1280 px: 42 imagens com três posições cada, totalizando 126 posições. Cada exercício também executa um ciclo completo no navegador nas duas larguras. As verificações incluem ausência de erro JavaScript, de falhas geométricas e de rolagem horizontal da galeria.

Foram conferidos objetos isolados, corpo sem equipamentos, pontos de conexão, eixos locais, seleção de fase e movimento reduzido. O player usado em produção foi exercitado com reprodução, pausa, retomada, reinício, seleção de etapas, repetição do ciclo e descarte dos recursos. Os testes Node também cobrem interrupção ao ocultar a aba e mudança de preferência de movimento.

Correções observadas durante a integração:

- A alavanca da panturrilha sentada mantém seu raio; a almofada acompanha a superfície da coxa por uma relação geométrica.
- A barra da puxada passa à frente do tronco, termina na região superior do peito e orienta os punhos sem exigir dobra excessiva.
- A rosca na polia começa com a barra afastada da pelve; a Scott mantém os braços na almofada.
- No tríceps francês, as duas mãos convergem para regiões sob a cabeça do mesmo halter, com dimensões próprias, em vez de manterem a separação dos ombros.
- Rolos e almofadas ficam ao lado da superfície de contato do membro.
- O reverse crunch preserva os dois comprimentos da coluna, com o tórax fixo; a linha do chão não acompanha os pés elevados.
- Bancos têm profundidade e altura próprias, e seus apoios inferiores alcançam o plano do chão.

## Desempenho e limites

O teste mede 2.121 atualizações de uma cena ativa, incluindo avaliação, criação do SVG e layout, com as definições já carregadas. O percentil 95 deve ficar abaixo de 16 ms. `performance.json` registra mediana, percentil 95, máximo e identificação do navegador. A montagem dos cabos usa comprimentos declarados e não precisa amostrar outras fases durante a reprodução.

Na rodada final com Chromium headless 154 em Linux: mediana de **1,3 ms**, percentil 95 de **2,1 ms** e máximo de **29,4 ms**. O limite do percentil 95 foi atendido; o máximo mostra que há atualizações isoladas mais longas. Esses valores descrevem este ambiente, não uma garantia de FPS em aparelhos físicos.

Capturas, relatório de desempenho e traces de falhas ficam em `test-results/browser/`. A galeria fica em `test-results/movements.html`. Esses artefatos são ignorados pelo Git e não integram o site publicado. O HTML e uma captura geral da versão anterior foram preservados localmente em `test-results/` para comparação.

A revisão automatizada usa Chromium headless e larguras de viewport; não substitui verificação em aparelhos físicos. As figuras e volumes de contato são didáticos, os mecanismos são ideais e os equipamentos representam as variantes dos guias. Não há cálculo de força, atrito, ativação muscular ou validação biomecânica individual.

A arquitetura, o inventário e o cadastro de novos objetos estão em [sistema-movimentos.md](sistema-movimentos.md).

A atualização dos guias foi verificada com `npm test` e dois cenários Playwright específicos do player: os 21 exercícios abrem com exatamente um SVG, sem botão “Ver movimento”, e avançam automaticamente; o player continua reproduzindo após um ciclo e preserva pausa, etapas, descarte e movimento reduzido.
