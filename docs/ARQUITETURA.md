# Arquitetura inicial

## Objetivo
Aplicação web empresarial para uma única empresa. A fase inicial não implementa tenancy/SaaS comercial multiempresa.

## Camadas
1. **Interface React**: páginas, formulários, filtros e estados vazios.
2. **Domínio TypeScript puro**: fórmulas e regras determinísticas, testáveis sem UI.
3. **Serviços de aplicação**: validação de comandos, transações e coordenação de operações.
4. **Persistência**: PostgreSQL/Supabase proposto; deve ser configurado antes de operar dados reais.
5. **Auditoria**: eventos imutáveis para correções e operações críticas, preferencialmente registrados no backend na mesma transação da alteração.

A interface não será fonte de verdade para permissões, totais financeiros, estados de autorização ou validações críticas.

## Decisões de integridade
- Dinheiro representado em centavos inteiros ou NUMERIC no banco, nunca como float para persistência.
- Leituras mantêm unidade e sequência; valores regressivos, intervalos zero e trocas de painel precisam de tratamento explícito.
- Consumo tanque-cheio-a-tanque-cheio: somente intervalo delimitado por abastecimentos completos válidos pode ser considerado confiável. O primeiro abastecimento completo estabelece referência; parciais não geram média isoladamente.
- Custo por km: custo de combustível atribuível ao intervalo dividido pela distância válida. Quando houver preços diferentes, a regra de atribuição deve ser explícita e consistente.
- Pneus: eventos de montagem/desmontagem/transferência/serviço são registros históricos; posição atual é projeção do histórico validado.
- Um pneu não pode ocupar duas posições simultaneamente; uma posição não pode ter mais de um pneu instalado. A proteção deve existir no banco/transação, não só na UI.
- Cancelamento/estorno preserva o registro original e registra motivo.
- Indicadores são derivados de registros vigentes e válidos, com recálculo independente disponível.
- Nenhuma média deve fingir confiabilidade quando os dados forem insuficientes.

## Persistência e ambiente
O projeto não deve simular persistência com localStorage. O backend remoto exige conexão. Não afirmar modo offline completo sem fila local, resolução de conflitos e testes explícitos.
As credenciais públicas de cliente (quando necessárias) não substituem políticas de segurança do banco. Chaves administrativas nunca podem ir para o navegador.

## Modelo de domínio previsto
- vehicles: veículos e equipamentos, unidade de medição e status.
- drivers: motoristas e responsáveis.
- fuel_stations, suppliers: postos e fornecedores.
- fuel_authorizations: limites, validade, estado e consumo único/concorrente.
- fuel_events: abastecimentos com quantidade, preço em centavos, leitura e documento.
- meter_reading_revisions: valor anterior/novo, motivo, responsável e timestamp.
- maintenance_plans, work_orders, work_order_items: planos, ordens, peças e mão de obra.
- tires, vehicle_tire_positions, tire_events: identidade, configuração de posições e eventos.
- tire_service_cycles: recapagens/remoldes/reparos, fornecedores, custos e inspeção.
- expenses: despesas com referência a origem para impedir dupla contagem.
- audit_events: trilha de operações críticas.
- attachments: metadados e referências seguras para documentos.

A modelagem física deverá ser refinada em migrações versionadas antes de usar dados reais.

## Fórmulas iniciais
- Distância válida: leitura final menos leitura inicial, apenas se ambas as leituras forem válidas e pertencerem à mesma série/unidade.
- Consumo rodoviário: litros atribuídos ao intervalo / distância válida (km/l).
- Equipamento: litros atribuídos ao intervalo / horas válidas (l/h).
- Custo por km: custo atribuído ao intervalo / distância válida.
- Custo por km do pneu: custo acumulado elegível do ciclo de vida / km válidos acumulados, sem duplicar intervalos.
- Financeiro: multiplicação em centavos inteiros, com política explícita de arredondamento quando houver rateio.

## Segurança
- Validar permissões no servidor em cada operação.
- Row Level Security e políticas específicas, se Supabase for escolhido.
- Migrações sob controle de versão.
- Validação de entrada no frontend e backend.
- Limitar campos atualizáveis por operação; não repassar payload arbitrário.
- Auditar alterações críticas e não expor detalhes sensíveis em mensagens de erro.

## Testes
- Testes unitários para domínio puro.
- Testes de integração com banco para restrições e transações.
- Testes concorrentes para autorização e posições de pneus.
- Teste-oráculo implementado independentemente das funções de produção.
- Build e typecheck na CI.
