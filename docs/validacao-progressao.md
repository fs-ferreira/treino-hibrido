# Validação — progressão e painéis (1.5.0)

Revisão em 22/10/2026. Dados de teste sintéticos, em origens locais separadas do app do usuário. Nenhum diário foi incluído no repositório.

## Cálculos e armazenamento

Os 40 testes existentes foram mantidos. Novos casos cobrem sugestão por posição de série e datas diferentes, séries incompletas, sem carga externa, manutenção abaixo de 8 repetições, percentual zero, arredondamento e limite de carga. Corridas cobrem 8:24 e 8:12, excesso de esforço, avanço após duas sessões, tipos independentes, ausência de dados fortes, conflito com recuperação, faixas válidas e cálculos sem efeitos colaterais. Backups cobrem migração v1/v2, v3, preservação de planos e rejeição de referências inconsistentes.

## Navegador

- Backup v2 importado e atualizado sem perder as sessões. Exportação v3 validada e restaurada em um diário vazio separado, preservando percentual de 2,5%, escolha sem peso, registros fortes e planejamento salvo.
- Séries de 20, 18 e 16 kg com 8 repetições sugeriram 21, 18,9 e 16,8 kg a 5%. Aplicar uma sugestão afeta a série selecionada; ao concluí-la, seu botão fica desabilitado e o foco permanece no checkbox.
- Sem peso adicional desabilita as três cargas, mantém repetições e conclusão, restaura a carga ao desmarcar e aparece no histórico. A próxima sessão herda o modo.
- Corrida leve a 8:00/km e esforço 6 sugeriu 8:24; com progressão, 8:12. Intervalado registrado com média geral diferente usou somente 6:00/km e esforço 9 dos blocos fortes para sugerir 6:05 com progressão. O formulário rejeita apenas um dos dois campos fortes preenchidos.
- Configurações de musculação puderam ser salvas com corrida ainda não configurada.
- Larguras de 320, 390 e 430 px sem rolagem horizontal ou overflow da data; revisão desktop e mobile dos painéis. O cabeçalho e as ações ficam fora da área de rolagem dos modais.
- Importação exibe validação, nome e resumo de sessões, séries e corridas antes de restaurar. Arquivo inválido mantém a restauração desabilitada e apresenta erro no painel. Seleção e cancelamento não alteram o diário.
- Confirmação de limpeza usa o painel do app. Cancelar e Escape preservam os dados, devolvem foco e liberam a rolagem. Não restam chamadas a alert, confirm ou prompt nativos.
- Animações e preferência reduzida continuam usando a camada e os testes existentes. Nenhum erro de JavaScript apareceu nos cenários verificados.

## Limites

Não houve aparelho iPhone disponível: validação real de Safari/iOS e teclado virtual permanece pendente. Os paces são sugestões por uma heurística explícita, não uma garantia de esforço fisiológico nem uma implementação VDOT. As ilustrações não foram modificadas.
