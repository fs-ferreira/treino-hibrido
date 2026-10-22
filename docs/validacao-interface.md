# Validação da interface fluida — 1.4.0

Revisão em 21/10/2026. HTML, CSS e JavaScript nativos; sem dependências de execução adicionais e sem alteração no esquema de armazenamento.

## Regressões automatizadas

Os 31 testes anteriores são mantidos. Nove cenários adicionais cobrem substituição de animações, ausência da API, mudança de movimento reduzido, aba oculta, confirmação única, retorno de foco e rolagem, reabertura durante fechamento, Escape e reversão dos acordeões. Executar `npm test`.

## Navegador

- Série: carga e repetições preservadas; check permanece focado; card continua aberto; barra e contagem atualizam sem recriar os inputs.
- Navegação: troca rápida de abas e semanas, foco na região principal, retorno à rolagem anterior e voltar/avançar do navegador.
- Calendário: abre a sessão do dia escolhido sem renderização duplicada.
- Longão: rascunho da corrida preservado durante ajuste do slider; 90 minutos com pace leve de teste de 7:00/km mostra 12,86 km, mantendo a duração de 90 min no resumo e nas etapas.
- Painéis: entrada pela base até 600 px, confirmação compacta, fechamento por botão/Escape, retorno ao acionador e liberação do scroll. Cabeçalho com fechar permanece acessível após rolar o guia.
- Dimensões: 320, 375, 390 e 430 px; desktop 1280 px; paisagem 844 × 390. Sem rolagem horizontal nem recorte lateral dos painéis. Guias móveis limitados a 92dvh; desktop limitado a 90dvh.
- Campo de data: preservadas as regras de dimensionamento para iOS; permanece com seletor nativo.

## Medição de movimento

O modo `?motion-debug=1` mede rAF somente enquanto há transições JavaScript ativas e observa tarefas longas que se sobrepõem a esses intervalos. Não mede o custo isolado de todos os elementos nem substitui um perfil em aparelho real.

Em uma sequência local de navegação, troca de semanas, acordeão e painéis no navegador integrado com viewport 390 × 844: 245 intervalos de quadros, p95 de 6,2 ms, máximo de 18,2 ms e nenhuma tarefa superior a 50 ms observada durante os intervalos. A frequência de atualização desse ambiente difere de um celular; esses resultados não garantem desempenho equivalente no iPhone.

## Pendente em aparelho real

Safari/iOS, teclado virtual, insets físicos de área segura e desempenho em aparelhos mais lentos precisam de conferência em um iPhone. Movimento reduzido dinâmico e fallback sem a API têm cobertura automatizada; a preferência do sistema não foi alterada no computador do usuário.

## Referências

- [Apple: Motion](https://developer.apple.com/design/human-interface-guidelines/motion).
- [web.dev: animações de alta performance](https://web.dev/articles/animations-guide).
- [WebKit: Web Animations no Safari 13.1](https://webkit.org/blog/10266/web-animations-in-safari-13-1/).
- [MDN: dialog e gerenciamento de foco](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).
