# Validação — Treinos e menu circular (1.6.0)

Revisão em 22/10/2026. Testes de interface em origem local isolada, sem utilizar ou publicar o diário do usuário.

## Testes automatizados

74 testes aprovados, preservando os 61 anteriores. Os 13 novos casos cobrem:

- Catálogo único ativo, 21 exercícios e divisão de três sessões de força, três corridas e um descanso. Compatibilidade de `workoutFor` com sábado ou domingo para o longão.
- Lista e detalhe sem mutações, sete dias, acesso aos 21 guias, etapas do intervalado, longão configurado e esquema local ainda na versão 3.
- Links diretos, rotas independentes e mensagem de identificador desconhecido.
- Geometria em 320, 375, 390, 430 e 600 px; 25 mil posições avaliadas sem lacunas, colisões ou salto visível no ponto de reciclagem. Em repouso, três itens completos e dois parciais.
- 500 gestos simulados nos dois sentidos, mantendo cinco links e encerrando o trabalho de animação em repouso. Atualizações agrupadas por quadro.
- Limiar de arraste, predominância vertical, toque, supressão do clique após arrastar, teclado, menor caminho circular e interrupção por novo gesto ou destino.
- Alteração dinâmica de movimento reduzido, aba oculta, redimensionamento, troca de breakpoint, limpeza dos ouvintes e alternativa sem Pointer Events.

## Navegador

- Lista, detalhe, retorno, histórico do navegador e recarga no link direto. Treinos permanece ativo ao consultar os detalhes. Endereço de plano inexistente apresenta a lista com aviso.
- Os 21 guias estão disponíveis no detalhe. Um guia foi aberto a partir do catálogo, exibindo as ilustrações e instruções existentes; fechar liberou a página. O histórico permaneceu vazio após a consulta.
- Alterar somente as preferências de teste para domingo e 75 minutos mudou o sábado para descanso e o domingo para longão com a duração configurada no detalhe.
- Abrir treino de hoje retornou à corrida leve da quinta-feira atual, em 22/10, com o dia correto selecionado e acesso à sessão.
- Arrastes repetidos nos dois sentidos mantiveram cinco destinos únicos, sem ativar telas durante o gesto. Home, setas, Enter e Tab revelaram o destino focado e permitiram sair da navegação.
- Layout estável sem rolagem horizontal em 320, 375, 390, 430, 600, 601 e 1.280 px. Conferência adicional em 844 × 390 px, na horizontal. Menu circular até 600 px e convencional em 601 px e acima.
- Resumo com indicadores centralizados na proporção 32,5/35/32,5. As siglas dos dias têm coluna própria, com separação de 12 px no celular, evitando colisão entre DOM e Domingo.
- Ações no final do detalhe e rodapé puderam ser posicionadas acima do menu fixo. O guia preserva o painel modal existente e seu isolamento de foco.
- Nenhum erro de JavaScript foi registrado nos cenários verificados. Animações do menu movimentam apenas os cinco links com `transform`; medições de largura ficam na inicialização e no redimensionamento.

## Publicação e limites

Assets e módulos modificados usam a versão 1.6.0 para evitar cache anterior. O workflow existente valida os testes antes de publicar os arquivos estáticos. Nenhum campo ou migração foi acrescentado ao armazenamento.

Não houve iPhone físico disponível. Safari/iOS, áreas seguras reais e resposta ao toque nesse aparelho permanecem pendentes de validação. As verificações de movimento reduzido e indisponibilidade de APIs foram automatizadas com ambientes controlados; não equivalem a uma medição em todos os navegadores ou dispositivos.

## Correção do arraste por toque — 1.6.1 (23/10/2026)

O encerramento do gesto tratava qualquer `lostpointercapture` recebido na faixa como fim do arraste. Em telas de toque, a captura implícita começa no elemento atingido, como um link ou ícone. Ao transferi-la para a faixa, a perda de captura do filho chega ao ancestral por propagação e encerrava prematuramente o gesto. A correção ignora essa transferência e continua encerrando o gesto quando a própria faixa perde sua captura. Referência: [captura implícita e processamento da transferência no W3C Pointer Events](https://www.w3.org/TR/pointerevents3/#implicit-pointer-capture).

Acrescentados dois testes: transferência de captura do link/ícone seguida de arraste contínuo e perda real da captura da faixa. O primeiro reproduziu a falha antes da correção; os 76 testes passaram depois. A política `pan-y pinch-zoom` também foi aplicada diretamente aos links e ao menu para explicitar o tratamento dos gestos nos elementos tocados. Toques e teclado continuam navegando; arrastes não ativam links. Assets alterados têm versão 1.6.1. A confirmação em Safari/iPhone físico continua pendente.


## Prioridade do gesto no menu — 1.7.2

O menu circular passou de `pan-y pinch-zoom` para `pinch-zoom` no menu, na faixa e nos links. Isso reserva o arraste de um dedo nessa região ao controlador desde o início, impedindo que o navegador assuma o movimento como rolagem vertical. Fora do menu, a política de toque permanece inalterada. A decisão precisa estar no CSS antes do gesto: alterá-la depois do primeiro movimento não muda a disputa atual. Referência: [MDN — touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).

O controlador também não abandona um toque por causa de desvio vertical inicial. Movimento sem arraste horizontal não abre um destino ao terminar; toque curto continua navegando. O segundo dedo encerra a manipulação do menu, sem cancelar o evento nativo, para permitir o zoom. A correção anterior de captura implícita continua preservada.

92 testes passaram. Os três casos novos cobrem desvio vertical seguido de arraste horizontal, movimento vertical sem clique acidental e segundo dedo interrompendo o menu sem impedir o evento nativo. No navegador desktop com viewport mobile: arraste diagonal mudou a posição dos links sem mudar o hash ou a rolagem da página; rolagem fora do menu continuou funcionando. O CSS computado confirmou `pinch-zoom` nas três camadas, e `auto` no corpo. Esses testes não simulam o reconhecedor nativo de gestos do Safari: a confirmação em iPhone físico continua pendente.


## Inércia curta — 1.7.3

O controlador estima a velocidade usando até 100 ms de movimentos recentes do ponteiro e considera a última direção ao inverter o gesto. Ao soltar, projeta uma continuação curta, limitada a 1,5 espaçamento entre itens, com desaceleração cúbica e encaixe exato em 320–460 ms. Segurar por mais de 80 ms antes de soltar não produz impulso. Amostras sem intervalo válido ou movimento muito lento usam apenas o encaixe habitual.

Novo toque cancela a animação imediatamente, sem herdar a velocidade anterior. Cancelamento do ponteiro e preferência por movimento reduzido não iniciam inércia; alterações de preferência, aba oculta, navegação e redimensionamento encerram o movimento. A política de prioridade de toque da versão 1.7.2 permanece preservada.

96 testes passaram. Os quatro casos novos cobrem cálculo da projeção, pausa/reversão, continuação e desaceleração nos dois sentidos e nas extremidades circulares, interrupção por novo toque, cancelamento e movimento reduzido. No navegador com viewport mobile, a posição continuou avançando após o arraste e estabilizou no encaixe, com o mesmo hash, rolagem da página e cinco links. Todos os quadros são agrupados em uma única fila de requestAnimationFrame, encerrada ao parar. Nenhuma mudança nos dados locais ou nas regras dos treinos. A percepção do movimento em Safari/iPhone físico continua pendente de validação.
