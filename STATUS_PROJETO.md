# STATUS DO PROJETO

**Atualizado em:** 2026-10-17  
**Fase atual:** Etapa 2 — Fundação do banco e preparação de deploy  
**Status geral:** Em implementação; não homologado para produção.

## Implementado nesta fundação
- [x] Repositório inicializado com documentação.
- [x] Estrutura planejada para React + TypeScript + Vite.
- [x] Política explícita contra dados operacionais fictícios.
- [x] App React/TypeScript com dashboard responsivo e navegação inicial.
- [x] Regras puras para intervalos de hodômetro/horímetro, consumo e custo de pneus.
- [x] Testes unitários para os cálculos de aceite definidos no prompt.
- [x] Workflow CI criado para typecheck, testes e build.
- [ ] Execução verde da CI — correção aplicada após falha inicial de configuração do cache; nova execução aguardando resultado.

## Não implementado / não validado
- [x] Cliente Supabase preparado para receber variáveis públicas de ambiente.
- [x] Migração inicial PostgreSQL/Supabase versionada com tabelas de base e RLS.
- [ ] Projeto Supabase real conectado e migração aplicada.
- [ ] Fluxo de autenticação e provisionamento seguro de organização/owner.
- [ ] Migrações do banco executadas.
- [ ] Cadastro CRUD conectado a banco (não implementado).
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
| 2026-10-17 | CI inicial | Falhou antes da instalação de dependências na configuração de cache npm sem lockfile; workflow corrigido e nova execução enfileirada |

## Próxima ação
Concluir a fundação executável (Vite, React, TypeScript, testes, CI e documentação de arquitetura). Depois implementar o domínio e o backend por etapas. Não marcar item como concluído sem executar e registrar a verificação correspondente.


## Supabase e Vercel — configuração pendente
- [x] Dependência @supabase/supabase-js e cliente condicional criados.
- [x] Variáveis documentadas em .env.example.
- [x] Schema inicial versionado com isolamento por organização e RLS.
- [x] Checklist de deploy criado em docs/DEPLOY_VERCEL_SUPABASE.md.
- [ ] Criar/vincular projeto Supabase do proprietário e aplicar migração.
- [ ] Configurar variáveis Vercel e publicar frontend.
- [ ] Executar testes de isolamento RLS e provisionamento de owner.
- [ ] CI verde confirmado após a última alteração.

**Nota de segurança:** o schema inicial não permite ao usuário comum criar organizações ou memberships. O fluxo de provisionamento privilegiado ainda precisa ser implementado antes de liberar o cadastro de usuários.
