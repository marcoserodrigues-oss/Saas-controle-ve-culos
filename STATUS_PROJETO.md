# STATUS DO PROJETO

**Atualizado em:** 2026-10-17  
**Fase atual:** Etapa 1 — Fundação  
**Status geral:** Em implementação; não homologado para produção.

## Implementado nesta fundação
- [x] Repositório inicializado com documentação.
- [x] Estrutura planejada para React + TypeScript + Vite.
- [x] Política explícita contra dados operacionais fictícios.
- [ ] App React/TypeScript compilável, testes e CI — em andamento.

## Não implementado / não validado
- [ ] Persistência PostgreSQL/Supabase conectada.
- [ ] Autenticação e autorização reais.
- [ ] Migrações do banco executadas.
- [ ] Cadastro CRUD conectado a banco.
- [ ] Abastecimentos e autorizações persistidos.
- [ ] Auditoria de alterações em backend.
- [ ] Controle completo de manutenção.
- [ ] Ciclo de vida de pneus.
- [ ] Importação real de planilhas.
- [ ] Exportação real PDF/XLSX.
- [ ] Backup e restauração testados.
- [ ] Testes executados em CI e build confirmado no ambiente de desenvolvimento.

## Etapas e critérios
### Etapa 1 — Fundação
- [x] Documentação inicial e organização do projeto.
- [ ] App React/TypeScript compilável.
- [ ] Testes de regras de negócio passando.
- [ ] CI executando typecheck, testes e build.
- [ ] Variáveis de ambiente documentadas sem segredos.

### Etapa 2 — Cadastros e abastecimentos
- [ ] Veículos/equipamentos, motoristas, postos e fornecedores.
- [ ] Abastecimentos e validações de leitura.
- [ ] Autorizações com proteção contra uso duplicado.
- [ ] Correções de leitura com trilha de auditoria.

### Etapa 3 — Importação e integridade
- [ ] Pré-visualização, mapeamento, validação e relatório de rejeições.
- [ ] Importação transacional.
- [ ] Auditoria e estratégia de backup/recuperação.

### Etapa 4 — Manutenção e pneus
- [ ] Ordens de serviço e planos preventivos.
- [ ] Cadastro individual e posições configuráveis de pneus.
- [ ] Montagem, desmontagem, rodízio e transferência.
- [ ] Remolde/recapagem, inspeção, descarte e histórico de custos.
- [ ] Duração por ciclo e custo por km com intervalos válidos.

### Etapa 5 — Despesas e relatórios
- [ ] Despesas vinculadas sem dupla contagem.
- [ ] Indicadores calculados a partir de dados válidos.
- [ ] Relatórios com filtros e exportação.

### Etapa 6 — Testes e homologação
- [ ] Testes de unidade, integração e concorrência.
- [ ] Teste-oráculo independente para cálculos.
- [ ] Testes de persistência, permissões, backup e restauração.
- [ ] Homologação pelo usuário.

## Registro de validações
| Data | Verificação | Resultado |
|---|---|---|
| 2026-10-17 | Inspeção da API do GitHub | Repositório confirmado vazio antes da inicialização |
| 2026-10-17 | Testes/build | Ainda não executados neste ambiente; não declarar sucesso |

## Próxima ação
Concluir a fundação executável (Vite, React, TypeScript, testes, CI e documentação de arquitetura). Depois implementar o domínio e o backend por etapas. Não marcar item como concluído sem executar e registrar a verificação correspondente.
