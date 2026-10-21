# HÍBRIDO

Diário pessoal de musculação e corrida, em português. HTML, CSS e JavaScript nativos, sem dependências de execução e sem backend.

**Site:** https://fs-ferreira.github.io/treino-hibrido/

## Executar localmente

Requer Node.js 24 ou superior. Na pasta do projeto:

```sh
npm start
```

Abra http://127.0.0.1:4173. Use um servidor HTTP: módulos JavaScript não funcionam de forma consistente abrindo o HTML diretamente via `file://`.

```sh
npm test
```

Os testes verificam paces, distâncias, oito blocos do intervalado, calendário local, isolamento das semanas, validação de backup e completude dos 21 guias.

## Como usar

1. Abra Configurações e informe pace leve, pace moderado-forte e maior corrida recente. O pace de caminhada é opcional.
2. Escolha sábado ou domingo para o longão e a duração entre 60 e 90 minutos.
3. Em Hoje ou Semana, abra uma sessão. Na musculação, registre carga e repetições de cada série; em Como fazer, consulte o guia ilustrado e a demonstração externa.
4. Depois da corrida, registre duração, distância, esforço e observações.
5. Consulte Histórico e exporte periodicamente um backup em Configurações.

O app preserva os 21 exercícios, 3 séries de 6–8 repetições e a distribuição semanal das imagens do post de @thalleshirakawa. Variantes adotadas são indicadas nos guias. Ilustrações SVG são originais e esquemáticas; os vídeos externos mostram o movimento com mais detalhe.

## Cálculos e fontes

- Pace é convertido de `mm:ss` para segundos/km.
- Distância (km) = minutos × 60 ÷ pace; velocidade (km/h) = 3600 ÷ pace.
- Intervalado: 5 min leves + 8 × (3 min moderado-forte + 1 min leve) + 3 min de caminhada = 40 min. Sem pace de caminhada, a distância exibida é parcial.
- Corrida leve: 30 min. Longão: 60–90 min. Esforço 3–4/10 conforme o post, sem progressão automática.
- O pace moderado-forte é informado pelo usuário; não é derivado de um percentual arbitrário do pace leve. Não há implementação de cálculo VDOT.

Referências de corrida: [CDC](https://www.cdc.gov/physical-activity-basics/measuring/index.html) e [V.O2](https://vdoto2.com/calculator/). Referências específicas dos exercícios e demonstrações estão em `assets/references.json` e no guia de cada exercício. Consulta em 20/10/2026. Principais fontes: ACE, Muscle & Strength, NASM, NISMAT e Catalyst Athletics. Os links externos dependem da disponibilidade dos provedores. A demonstração de reverse crunch é no chão; o guia descreve a adaptação ao banco.

## Dados e backup

Um perfil por navegador. Armazenamento em `localStorage`, chave `treino-hibrido:v1`; esquema versão 1. Não há contas, analytics, GPS, cronômetro nem sincronização. Dados pessoais nunca são enviados ao repositório. A navegação a vídeos e fontes externas abre os respectivos sites somente quando o usuário clica.

Backup JSON contém configurações e sessões por data local `AAAA-MM-DD`, com tipo de treino, conclusão, séries e registro de corrida. A importação valida todo o arquivo antes de substituir o diário; é solicitada confirmação. Arquivos inválidos preservam os dados atuais. O navegador pode apagar o armazenamento; mantenha cópias exportadas. Limpar os dados exige confirmação. Se o armazenamento falhar, o app informa a limitação e permite exportar os dados da aba.

## Publicar e atualizar

Repositório público pessoal: `fs-ferreira/treino-hibrido`. GitHub Pages usa **GitHub Actions** como fonte. Cada push na branch `main` executa os testes e publica apenas HTML, CSS, JS e assets do app. Arquivos de teste e dados locais não integram o site. Assets usam caminhos relativos para funcionar sob `/treino-hibrido/`.

Para atualizar: editar, executar `npm test`, testar no navegador e enviar um commit para `main`. Acompanhar o workflow `Validate and deploy Pages`. Um deploy não altera o `localStorage` do usuário; futuras mudanças no esquema precisam de migração explícita.

## Estrutura

- `app.js`: interface, formulários, navegação e persistência.
- `lib/core.js`: calendário, cálculos e validação dos backups.
- `lib/exercises.js`, `lib/diagrams.js`: conteúdo dos guias e imagens SVG.
- `assets/references.json`: fontes e demonstrações verificadas.
- `tests/core.test.mjs`: testes de regressão.

O plano é uma reprodução organizacional do conteúdo fornecido; não faz avaliação individual nem ajusta automaticamente a carga de treino.
