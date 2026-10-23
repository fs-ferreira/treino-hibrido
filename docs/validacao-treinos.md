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
- Ações no final do detalhe e rodapé puderam ser posicionadas acima do menu fixo. O guia preserva o painel modal existente e seu isolamento de foco.
- Nenhum erro de JavaScript foi registrado nos cenários verificados. Animações do menu movimentam apenas os cinco links com `transform`; medições de largura ficam na inicialização e no redimensionamento.

## Publicação e limites

Assets e módulos modificados usam a versão 1.6.0 para evitar cache anterior. O workflow existente valida os testes antes de publicar os arquivos estáticos. Nenhum campo ou migração foi acrescentado ao armazenamento.

Não houve iPhone físico disponível. Safari/iOS, áreas seguras reais e resposta ao toque nesse aparelho permanecem pendentes de validação. As verificações de movimento reduzido e indisponibilidade de APIs foram automatizadas com ambientes controlados; não equivalem a uma medição em todos os navegadores ou dispositivos.
