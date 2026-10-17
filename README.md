# Gestão de Frota

Aplicação web para gestão operacional de veículos e equipamentos, abastecimentos, manutenção, pneus, custos e indicadores.

> **Estado atual:** fundação inicial do projeto. Ainda não é um sistema pronto para produção; módulos operacionais, persistência remota, autenticação e backup serão implementados e validados em etapas.

## Stack inicial
- React + TypeScript
- Vite
- Vitest para testes de regras de negócio
- CSS responsivo com tokens de design
- Supabase/PostgreSQL planejado para persistência, sujeito à configuração segura do ambiente

## Requisitos
- Node.js 20.19+ ou 22.12+
- npm

## Executar localmente
```bash
npm install
npm run dev
```

## Verificações
```bash
npm run test
npm run typecheck
npm run build
```

## Princípios
1. Não usar dados demonstrativos como se fossem dados reais.
2. Indicadores devem derivar de registros válidos e auditáveis.
3. Registros operacionais relevantes não devem ser apagados silenciosamente.
4. Regras críticas devem ser validadas no servidor, além da interface.
5. Nenhum segredo ou chave administrativa deve ser enviado ao navegador.

Consulte [STATUS_PROJETO.md](./STATUS_PROJETO.md) para progresso, testes e pendências, e [docs/ARQUITETURA.md](./docs/ARQUITETURA.md) para as decisões iniciais.
