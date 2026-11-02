# Validação de UX/UI e organização flexível — versão 4

Implementação sobre a `main` posterior à auditoria, preservando o splash de autenticação e os 23 exercícios atuais. Upper e Upper 2 possuem oito exercícios/24 séries; Lower possui sete/21. As quantidades vêm da prescrição existente.

## Cobertura

Os testes usam contas fictícias, APIs simuladas no navegador e PostgreSQL local em memória nos testes de serviço. Não há OAuth real, alterações no diário de produção, importação destrutiva ou exclusão de registros reais.

| Área          | Verificações                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Programação   | Acréscimo sem substituição, tipos repetidos, vários treinos por data, movimento com identidade estável, origem vazia, recarga e conclusão independente |
| Dados e API   | Conversão v1–v3, ID determinístico, rejeição de IDs repetidos, proteção de treino iniciado, transação interrompida e recibo repetido                   |
| Journal       | Resposta perdida, edição posterior ao movimento, payload imutável e recuperação de operações legadas sem substituir treinos irmãos                     |
| Corrida       | Rascunho por treino/data, navegação, foco no envio por teclado, ajuda aberta, esforço e snapshots preservados                                          |
| Sincronização | Um indicador, sucesso sem espaço visual, pendência aderente, recuperação e falha conjunta de rede/armazenamento                                        |
| Histórico     | 20 itens, carregar mais, filtros preservados, recorte de totais, comparação por exercício e escopos separados de corrida                               |
| Layout        | 320, 390, 768 e 1440 px; mapas também em 1024 px; acesso em telas pequenas; campos e alvos com medidas verificadas                                     |
| Guias         | Os 23 exercícios, nomes e links, mapas sob demanda, navegação por toque/teclado, reprodução e movimento reduzido                                       |
| Backup        | Prévia de versões antigas e 4, ausência de restauração automática, aviso de substituição e configurações consultáveis                                  |
| Acesso        | Splash, foco/inert, erros genéricos, recuperação compatível/incompatível, sessão revogada e saída com pendências                                       |

## Achados da auditoria atendidos

- U01/U03: rascunhos em memória e atualizações normalizadas preservam preenchimento, foco e contexto.
- U02: aviso único de pendência/falha aderente; sucesso automático continua visualmente oculto.
- U04/U07/U15: estados compartilhados, endereços por data/treino, navegação semanal em Hoje e progresso por treinos programados.
- U05: controle identificado como duração padrão global do longão.
- U06/U10/U14: filtros, paginação e tabelas com escopo e séries identificados.
- U08: quatro destinos circulares, três completos e controles alternativos ao arraste, sem clones.
- U09: mapa inicialmente recolhido após o registro no celular; anatomia lateral no desktop.
- U11: token de contraste de controles distinto das divisórias decorativas.
- U12/U16: recuperação com orientação contextual e região principal exposta conforme o estado de acesso.
- U13: caracterização do arquivo e consequência de restauração no momento da confirmação.

## Execução e limites

Resultados locais em 02/11/2026:

- `npm test`: 149 testes aprovados.
- `npm run build`: aprovado.
- `npm run test:ui`: 52 cenários aprovados.
- `npm run test:auth`: 36 cenários aprovados.
- `npm run test:movements`: 6 cenários aprovados, cobrindo os 23 guias.
- `git diff --check`: sem erros.
- Contorno normal `#737e8b` contra painel `#181a1d`: contraste de 4,22:1.

O teste de endereços antigos também verifica Voltar entre uma data passada, Histórico, Hoje e o antigo atalho Semana, sem criar entradas extras que prendam a navegação.

Para repetir:

```sh
npm test
npm run build
npm run test:ui
npm run test:auth
npm run test:movements
```

Testes automatizados e inspeção da árvore acessível não substituem leitor de tela real, Safari/iPhone/Android físicos ou teclado virtual. Essas combinações exigem validação manual externa ao ambiente headless. Não se declara conformidade integral WCAG nem ganho de tempo/compreensão já comprovado com usuários.

Medições locais de navegador não são Core Web Vitals de produção. O deploy deve ser vinculado ao commit integrado e verificado separadamente do sucesso do merge.
