# Antebraço nos treinos Upper — 02/11/2026

O Upper inclui rosca inversa com barra reta logo após a rosca direta na polia; o Upper 2 inclui rosca de punho unilateral com halter logo após a Scott. Os outros exercícios preservam a ordem. O plano passa a 23 exercícios, com 8/7/8 por sessão e 24/21/24 séries. São mantidas três séries de 6–8 repetições; a unilateral usa carga por lado e orienta completar os dois braços.

## Cobertura

- Catálogo, guias completos, fontes externas e mapas com regiões de braquiorradial, braquial, flexores do punho e flexores dos dedos.
- Animações determinísticas em 101 fases, comprimentos rígidos, estabilidade dos cotovelos, contato do antebraço com a coxa e pegadas conectadas. A normal da palma é verificada para baixo na inversa e para cima na rosca de punho; nesta, o eixo do único halter permanece transversal à mão.
- Hoje, calendário, Treinos, confirmação de conclusão e progresso calculam seus totais pelo catálogo. O Lower mantém sete exercícios e 21 séries.
- Registro, recarga, histórico e progressão dos dois novos IDs. Backup versão 3 preserva registros antigos e novos; consultar cards, mapas e guias não grava sessões. Uma sessão Upper antiga concluída continua concluída, sem preencher retroativamente séries do novo exercício.
- Teclado no mapa, movimento reduzido, uma única cena por guia e instrução bilateral na unilateral. Revisão de cards e guias em 390 e 1280 px; a regressão existente cobre também 320, 600, 768, 1024 e 1440 px.

## Execução

- `npm test`: 139 testes aprovados. Após o ajuste final das pegadas, repetidos os testes de antebraço, catálogo e cenas/movimentos afetados.
- `npm run test:ui`: 43 cenários únicos, com os cenários inicialmente reprovados corrigidos e repetidos por seleção de arquivo/nome. Os testes antigos foram atualizados para os novos totais e para a orientação de unilateral no Upper 2.
- `npm run test:movements`: seis cenários aprovados, incluindo os 23 movimentos nos dois tamanhos, reprodução de todos os guias e desempenho. Após o ajuste das pegadas, repetidos reprodução e desempenho.
- `npm run test:auth`: 36 cenários aprovados.
- `npm run build`, conferência de formatação dos arquivos alterados e `git diff --check` aprovados.

As capturas locais ficam em `test-results/ui`, `test-results/forearm`, `test-results/forearm-final` e `test-results/browser`, ignoradas pelo Git. Os cenários do diário usam API e histórico sintéticos. Não houve alteração de um diário real, migração de banco ou mudança no esquema de backup.
