# Configurações e UX — 1.7.1

## Ajuste da versão 1.7.1

Por solicitação do usuário, o botão de descarte e a persistência de rascunhos em `sessionStorage` foram removidos. As edições ficam em memória ao navegar; recarregar perde as alterações não salvas. O diário e as configurações já salvas permanecem em `localStorage`.

O rodapé agora apresenta um único botão Salvar alterações, com largura total no mobile, ícone e estado de pendência/salvamento. A borda branca de foco foi removida; o teclado continua funcionando com feedback discreto por brilho/fundo.

Os 89 testes foram mantidos, atualizando os casos de rascunho para verificar a nova duração das edições. Testes no navegador confirmaram troca de categoria preservando a edição, perda ao recarregar e permanência após Salvar. A descrição abaixo registra o comportamento histórico da versão 1.7.0; a mudança acima substitui sua política de rascunhos e descarte.

## Validação anterior — 1.7.0

Validação em 23/10/2026. Implementação nativa; esquema do diário mantido na versão 3. O menu circular, sua transferência de captura por toque e os SVGs foram preservados.

## O que mudou

- Quatro categorias com rotas próprias: Corrida, Progressão, Semana e Dados. Os formulários permanecem montados durante a troca de categoria.
- Validação e salvamento independentes, erros nos campos e no resumo, foco no primeiro campo inválido, indicação de pendências e confirmação persistente.
- Rascunhos separados em `sessionStorage`, sem participação nos backups. Falhas desse armazenamento usam memória e mostram um aviso. Falhas ao salvar o diário mantêm os ajustes anteriores e o rascunho.
- Tipografia maior, campos de 16 px, ações principais de pelo menos 44 px e foco neutro. Barra de categorias aderente; ações aderentes apenas com pendências e espaço disponível. O campo focado é revelado quando necessário.
- Hoje distingue Planejado, Em andamento e Concluído; a ação muda para Abrir, Continuar ou Rever. O convite para paces aparece em dias de corrida.
- Calendário distingue Hoje, Dia selecionado e conclusão por texto/atributos. Retorno à semana atual aparece quando necessário.
- Intervalado mostra aquecimento, oito repetições recolhidas e caminhada. Os 18 estágios e os 40 minutos permanecem inalterados.
- Histórico agrupado por mês, com estado da sessão e séries recolhidas. Guias, modais e catálogo receberam ajustes de leitura e espaçamento, preservando a composição 32,5 / 35 / 32,5.

## Testes automatizados

89 testes: os 76 anteriores e 13 adicionais. Cobertura nova:

- Rotas das categorias, compatibilidade do endereço anterior, categorias desconhecidas e semântica dos quatro painéis.
- Atualização somente dos campos da categoria, limites e passos, paces vinculados/manuais e reinício das referências adaptativas.
- Recuperação de rascunhos parciais, descarte independente, exclusão dos backups, falhas e corrupção do armazenamento de sessão.
- Controlador com gravação recusada: conserva rascunho e configurações, sem mensagem de sucesso. Salvamento de Progressão enquanto Corrida contém um rascunho inválido.
- Invalidação dos rascunhos e mensagens após reset do controlador, utilizado depois da importação ou limpeza confirmada.
- Agrupamento dos oito ciclos sem alterar os estágios, duração ou cálculos.

## Validação no navegador

Usado um servidor local exclusivo em outra origem, com dados sintéticos. O diário de produção não foi alterado.

- Corrida incompleta gerou erro junto ao campo e resumo; foco no primeiro erro. Foi possível salvar Progressão independentemente.
- Recarregar preservou tanto o valor salvo quanto o rascunho inválido de outra categoria.
- Semana salva com domingo/75 min; rascunho de 90 min sobreviveu a sair da tela, voltar pelo histórico e recarregar. Descartar restaurou 75 min.
- Máscara `600` → `6:00`; corrida recente de 8 km/40 min → `5:00/km`; vínculo bloqueou o campo forte e desmarcar restaurou o manual `5:30`.
- Setas moveram o foco sem ativar outra categoria; Enter ativou. Somente um painel ficou visível. Dados não tem botão genérico de salvar.
- Importação abriu no painel do app; Escape fechou e devolveu foco ao botão Importar. Guia abriu com ilustrações e fechou retornando ao acionador.
- Registro sintético de uma série manteve foco, valores e card aberto; estado passou para Em andamento/Continuar treino.
- Corrida leve de 30 min/5 km/esforço 4 foi registrada. Histórico mostrou o mês, as duas sessões e as séries recolhidas. Plano registrado permaneceu identificado.
- Intervalado expandiu os oito ciclos, com 18 estágios no DOM e total de 40 min.
- Matriz de dimensões: 320, 375, 390, 430, 600, 601 e 1280 px; paisagem 844 × 390. Nove rotas por dimensão (Hoje, Semana, lista/detalhe de Treinos, Histórico e quatro categorias): 72 verificações sem rolagem horizontal no documento após as correções.
- Inspeção visual em amostras mobile e desktop; campos de 16 px. Ações pendentes não cobriram o campo em edição; viewport curta desativou o rodapé aderente.

## Limites da validação

Safari/iPhone físico e teclado virtual real continuam pendentes. O navegador de teste não aplicou o atalho de zoom; a ampliação real de texto a 200% precisa de conferência em um navegador que ofereça esse controle. A matriz de dimensões e a paisagem não substituem esses testes.

## Referências aplicadas

Consulta em 23/10/2026:

- [W3C — Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): papéis, relações, setas e ativação manual.
- [W3C — User Notification](https://www.w3.org/WAI/tutorials/forms/notifications/): erro contextual, resumo e confirmação de envio.
- [W3C — Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html): foco visível e proteção contra sobreposição por barras aderentes.

Esses padrões foram aplicados à implementação; não constituem uma certificação integral de conformidade WCAG.
