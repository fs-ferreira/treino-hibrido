# Diário e acompanhamento — formato 5

O formato 5 mantém dias com listas ordenadas de treinos, seus IDs, séries, corrida e programação. Acrescenta `completedAt` e `canceledAt`, timestamps ISO UTC ou `null`. O banco continua usando o payload JSONB existente; não há migração SQL nem regravação em massa.

## Estados

- Programado: sem registros, hoje ou no futuro. Abrir os exercícios não inicia uma sessão.
- Em andamento: registros parciais. Um rascunho local de corrida também indica andamento, sem persistir o rascunho.
- Concluído: `done: true`. Concluir pela primeira vez registra `completedAt`; salvar alterações de uma corrida concluída preserva esse horário. Reabrir ou editar séries limpa o horário e a conclusão.
- Cancelado: `canceledAt` preenchido, sem conclusão ou registros. Cancelar preserva ID, data, posição e histórico; reativar limpa o campo. Treinos iniciados não podem ser cancelados, mesmo que um payload tente apagar seus registros primeiro.
- Não realizado: data anterior a hoje e nenhum registro/conclusão/cancelamento. É derivado, sem gravar sessões virtuais. Sessões parciais antigas permanecem em andamento.
- Descanso: lista vazia ou ausência de treino no plano. Cancelar o único treino não transforma o dia em descanso.

Datas e horários são exibidos em português no fuso do navegador. A data prevista continua separada do instante de conclusão/cancelamento. Registros antigos com conclusão, mas sem horário, mantêm `completedAt: null`.

## Fluxos e contagens

Reorganizar permite mover para outra data válida ou cancelar. Treinos do destino são preservados, assim como a transação de dois dias. Cancelados precisam ser reativados antes de mover ou registrar. Falhas de rede com armazenamento local disponível mostram sincronização pendente; falha simultânea de armazenamento mantém o modal e oferece nova tentativa, sem afirmar salvamento durável.

O carrossel mostra estados individuais, até três indicadores e `+N`; o nome acessível enumera todos. Check verde indica conclusão; círculo cinza com traço indica cancelamento ou não realizado, diferenciados nos textos. Pausa usa lua. No celular, a lista de dias permite rolagem horizontal.

O resumo semanal inclui cancelados e não realizados na meta, mas somente concluídos no numerador. Mover entre semanas transfere a unidade, enquanto mover na mesma semana mantém o total. O Histórico inclui cancelamentos explícitos na data prevista sem resultados fictícios; não gera entradas para toda sessão virtual passada. Cancelados não alimentam referências de progressão.

## Compatibilidade e sincronização

Backups 1–4 são convertidos para 5, mantendo IDs, descansos, modos e snapshots; nenhum horário é inferido retroativamente. Exportações novas são v5. Mutações exigem `X-Hibrido-Data-Version: 5`; abas antigas recebem 426 com `CLIENT_UPGRADE_REQUIRED` e preservam suas pendências.

Operações antigas mantêm o conteúdo e o recibo imutáveis, inclusive em respostas perdidas. Tanto o replay local quanto o servidor preservam metadados omitidos por payloads antigos; valores `null` explícitos permitem reabertura/reativação. Combinações conflitantes entram em recuperação, sem substituir os dados confirmados. Importar backup ou limpar o diário continuam operações explícitas protegidas pela geração.

## Validação

`npm test` cobre codec, transições, API, recibos e recuperação. A suíte de navegador inclui `workout-lifecycle-browser.spec.mjs`, com dados sintéticos e API simulada: cancelamento passado, recarga, reativação, horários, dia misto, calendário, falhas de rede/armazenamento e mudança de data.

As capturas locais ficam em `test-results/workout-lifecycle/`, incluindo 320, 390, 768 e 1440 px. A regressão também verifica ampliação CSS em 200% no desktop, foco/teclado e movimento reduzido. Não substitui teste de dispositivo físico ou autenticação Google real.
