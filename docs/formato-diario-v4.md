# Diário e sincronização — formato 4

O diário mantém `settings` e `sessions`, indexado por data local `AAAA-MM-DD`. Cada valor de `sessions` agora é um dia com uma lista ordenada `workouts`.

```json
{
  "version": 4,
  "settings": "mesmos campos e validações das configurações atuais",
  "sessions": {
    "2026-11-02": {
      "workouts": [
        {
          "id": "plan-2026-11-02",
          "type": "upper",
          "done": false,
          "sets": {},
          "run": null
        },
        { "id": "UUID", "type": "easy", "done": false, "sets": {}, "run": null }
      ]
    },
    "2026-11-03": { "workouts": [] }
  }
}
```

O exemplo omite o objeto real de configurações por brevidade; não é um arquivo de importação pronto. Cada treino preserva seus campos opcionais `withoutWeight`, revisões de pace e snapshot em `run.plan`.

## Identidade e programação

- Consultar um dia ausente usa o plano semanal sem gravar. Seu treino virtual tem ID `plan-DATA` e só é materializado quando necessário.
- Uma lista vazia é descanso explícito. Não deve ser removida na limpeza de objetos vazios, exportação ou sincronização.
- Adicionar materializa o dia e acrescenta um UUID, conservando os treinos existentes. Tipos repetidos são permitidos.
- Mover conserva o ID, retira da origem e acrescenta ao final do destino; a programação padrão do destino também é conservada quando ainda era virtual.
- Séries preenchidas, conclusão ou corrida tornam o treino iniciado. O cliente também impede movimento de corrida com rascunho em memória. Cada treino conclui/reabre independentemente.
- Alterações do padrão semanal não substituem dias explicitamente materializados. Duração global do longão continua aplicada aos planejamentos não registrados; snapshots salvos não são recalculados.

## API e transações

O cliente envia `X-Hibrido-Data-Version: 4`. Mutações de dados sem esse cabeçalho recebem HTTP 426 / `CLIENT_UPGRADE_REQUIRED`, antes de gravar. OAuth mantém seu contrato.

`GET /api/diary` retorna versão 4, com os mesmos metadados de geração, revisão e paginação por data. Registros antigos são normalizados na leitura, sem migração SQL ou regravação de toda a conta.

`PUT /api/days` recebe:

```text
operationId: UUID idempotente
generation: geração atual do diário
value: { DATA: { workouts: [...] }, [OUTRA_DATA]: { workouts: [...] } }
```

Uma operação contém um ou dois dias, até 1 MiB por dia. A transação autentica a sessão ativa, bloqueia o diário, verifica a geração, valida os dias e IDs e grava todos os dias junto do recibo. IDs não podem pertencer a outra data fora da operação. Treinos iniciados não podem desaparecer, mudar de tipo ou mudar de data. Edições dos próprios campos e reabertura permanecem disponíveis.

A leitura das mutações é restrita aos dias alterados. A verificação de identidade fora deles consulta o banco sem transferir todo o histórico para cada edição.

`PUT /api/settings` e importação/limpeza conservam sua função. Substituição e limpeza continuam operações explícitas, separadas da edição de dias e protegidas pela geração do diário.

## Fila local e respostas perdidas

O par origem/destino é uma única entrada `/days` no journal. Sua identidade e conteúdo permanecem imutáveis depois de começar o envio. Uma resposta perdida é repetida com o mesmo recibo; não é interpretada como autorização para duplicar a operação.

Somente a última operação ainda não enviada e com o mesmo escopo pode ser compactada. Uma edição posterior ao remanejamento permanece em outra entrada, preservando a ordem.

Pendência é gravada no journal antes de depender da rede. Falha conjunta de rede e armazenamento é identificada como dados apenas na aba; não equivale a salvamento durável. Falhas permanentes bloqueiam o envio e conservam as pendências para recuperação/exportação.

## Legados e backups

- Versões 1, 2 e 3 são importadas, validadas e convertidas para 4. Os campos de cada sessão são preservados, com ID determinístico `legacy-DATA`.
- Descanso legado sem registro é convertido em dia explicitamente vazio. Dados legados existentes não recebem os novos exercícios retroativamente.
- Operações pendentes antigas mantêm seus IDs e payloads, inclusive quando já podem ter sido confirmadas no servidor. O adaptador de `/sessions/DATA` aplica a sessão legada ao item `legacy-DATA`, conservando os outros treinos do dia.
- Backups novos são versão 4 e incluem a programação materializada e descansos explícitos. Rascunhos de formulário em memória não são incluídos.
- A prévia distingue dias com registros, treinos, conclusões, séries, corridas, programação no arquivo, descanso e intervalo de registros. O nome do arquivo não é usado para inferir titular ou data de exportação.
- Não existe exportação reduzida para versão 3: ela perderia os treinos adicionais e a programação.

## Referências e reversão

Cálculos de carga e pace são preservados. Referências usam datas estritamente anteriores; dentro de uma data anterior, a ordem persistida é percorrida do último treino para o primeiro. Corridas usam no máximo uma referência elegível por data para os dois registros que sustentam a progressão. Treinos no mesmo dia não acumulam progressão.

Depois de gravar dias no formato 4, qualquer reversão de interface deve manter o codec e os contratos da versão 4. Reimplantar uma versão 3 sem essa compatibilidade não é uma estratégia de rollback válida.
