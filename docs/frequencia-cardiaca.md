# Frequência cardíaca nas corridas — diário v6

Em Configurações → Corrida, nascimento escolhido em um seletor exclusivo de mês e ano (ex.: **nov/1996**) e sexo **Masculino/Feminino** são opcionais e devem ser preenchidos juntos. Não há campo de FC máxima manual. Sem perfil, as etapas mostram apenas o pace; zonas e percentuais continuam disponíveis em **Detalhes e ajuda**. A estimativa em bpm aparece com o perfil preenchido, mesmo sem paces configurados.

## Cálculo e uso

A idade em anos considera o mês de nascimento: aumenta no primeiro dia do mês de aniversário, porque o dia não é coletado. A interface aceita uma referência adulta de 18–100 anos. Para cada novo planejamento, a idade é calculada na data prevista da corrida; o catálogo e a prévia das configurações usam a data local atual.

Convenção de estimativa adotada no app, conforme configuração solicitada:

- Masculino: **FC máxima = 220 − idade**.
- Feminino: **FC máxima = 226 − idade**.

As duas fórmulas são identificadas como estimativas, não medições individuais. Não usamos a fórmula de Tanaka. A referência geral de 220 − idade publicada pela AHA não é apresentada como validação da regra específica de 226 − idade para feminino. As faixas em bpm são `Math.round(FC máxima × percentual / 100)`.

| Etapa                | Zona            | % da FC máxima |
| -------------------- | --------------- | -------------- |
| Leve e longão        | Z2              | 60–70%         |
| Aquecimento          | Z1–Z2           | 50–70%         |
| 3 min fortes         | Z4              | 80–90%         |
| 1 min de recuperação | Buscar Z1–Z2    | 50–70%         |
| 3 min de caminhada   | Em direção a Z1 | 50–60%         |

A associação das zonas às etapas é uma orientação do app. Volume, pace e progressão não mudam. No intervalado, a FC responde com atraso: não acelerar para atingir imediatamente a faixa e não exigir queda até a faixa durante a recuperação de um minuto ou caminhada final. O esforço e o teste da conversa continuam sendo referências complementares. Estar numa faixa de FC não comprova um pace específico.

O relógio deve usar a mesma FC máxima estimada e o método **% da FC máxima** para comparar as zonas; reserva cardíaca e limiar podem produzir números diferentes. A entrega permite consulta/configuração manual, sem integração ou exportação para relógios.

## Dados e compatibilidade

- `settings.heartRate = { birthMonth: "AAAA-MM" | null, sex: "male" | "female" | null }`.
- Novos `run.plan.heartRate` guardam versão do método, origem (`age` ou `none`), idade, sexo, FC máxima estimada e metas de todas as etapas. Valores em bpm ausentes são `null`.
- Mudar sexo/nascimento ou avançar o mês afeta somente os próximos planejamentos. O snapshot registrado é preservado. Registros antigos sem referência cardíaca mostram percentuais com o rótulo **Orientação geral**, sem bpm retroativos.
- Backups 1–5 continuam importáveis e saem como versão 6. A chave local e as colunas JSONB permanecem; não há migração SQL.
- Mutações exigem `X-Hibrido-Data-Version: 6`. Clientes antigos recebem 426 e devem recarregar. Operações pendentes mantêm IDs, valores e recibos; a omissão de `heartRate` preserva a referência já salva, no replay local e no servidor. `{ birthMonth: null, sex: null }` limpa o perfil explicitamente.

## Fontes

Consultadas em **05/11/2026**:

- [Polar — zonas por percentual da FC máxima](https://www.polar.com/us-en/guide/heart-rate-zones).
- [Garmin — cálculo das cinco zonas](https://www8.garmin.com/manuals/webhelp/vivosmarthr/EN-US/GUID-A8716C0B-B267-4C42-B45F-B9C7928BCA19.html).
- [Polar — resposta gradual entre zonas](https://support.polar.com/e_manuals/Team_Pro/Polar_Team_Pro_user_manual_English/polar_heart_rate_zones.htm).
- [AHA — estimativa geral de FC máxima como 220 − idade](https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/target-heart-rates).
- [CDC — intensidade relativa e teste da conversa](https://www.cdc.gov/physical-activity-basics/measuring/).

## Verificação

`heart-rate.test.mjs` cobre fórmulas, mês de aniversário, limites, validação do perfil, 18 etapas, cálculos de corrida, importações e snapshots. `heart-rate-server.test.mjs` verifica persistência, rejeição de dados inválidos e replay imutável. A suíte de sincronização cobre pendências v5. `heart-rate-browser.spec.mjs` verifica configurações, teclado, recarga, catálogo, snapshots e layout em 320 e 1440 px, usando contas/dados sintéticos e API simulada. Capturas ficam em `test-results/heart-rate/`.

Validação em 05/11/2026: **179 testes unitários/API** e **76 testes de interface** passaram; `npm run build` e `git diff --check` passaram. Os testes de interface usaram o Microsoft Edge instalado via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. As capturas de Configurações em 320 px e do intervalado em 1440 px foram revisadas visualmente. Não foi necessário conectar contas reais nem alterar serviços externos.

## Apresentação v6.1

As linhas principais mostram duração, pace e bpm quando existe referência válida. **Faixas de FC estimadas** aparece uma vez por planejamento. Os ciclos do intervalado continuam recolhidos e **Detalhes e ajuda** reúne métricas secundárias e a orientação de FC, sem repeti-la em cada etapa. Em Configurações, **Como calculamos** contém fórmulas, cálculo da idade, fontes e a explicação do histórico. O seletor mantém o contrato interno de rascunho MM/AAAA e o armazenamento AAAA-MM; limpar nascimento não limpa sexo nem salva automaticamente.
