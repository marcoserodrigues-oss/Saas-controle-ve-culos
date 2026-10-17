# SaaS Controle de Veículos

Aplicação web para gestão de frota, abastecimentos, manutenção, pneus e custos. Stack: React, TypeScript, Vite, Supabase/PostgreSQL e Vercel.

## Estado atual

A fundação da interface e as primeiras funções puras de domínio estão implementadas. O schema inicial do Supabase foi versionado em `supabase/migrations`. A aplicação ainda não é um sistema operacional completo: antes de inserir dados reais, configure o projeto Supabase, aplique a migração e implemente os fluxos CRUD autenticados por módulo.

Consulte [STATUS_PROJETO.md](./STATUS_PROJETO.md) e [docs/ARQUITETURA.md](./docs/ARQUITETURA.md).

## Requisitos

- Node.js 22+
- npm
- Projeto Supabase
- Conta Vercel conectada ao GitHub para deploy

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Preencha `.env.local` com a URL do projeto Supabase e a chave pública/anon. Nunca coloque a service-role key em variáveis `VITE_*` nem no navegador.

## Configurar Supabase

1. Crie um projeto no painel do Supabase.
2. Instale o Supabase CLI conforme a documentação oficial.
3. Faça login no CLI e vincule o projeto: `supabase link --project-ref SEU_PROJECT_REF`.
4. Revise a migração inicial em `supabase/migrations`.
5. Aplique a migração: `supabase db push`.
6. Configure Auth > URL Configuration com o domínio de produção da Vercel e URLs locais.
7. Crie uma organização e vincule usuários em `organization_members` por processo administrativo confiável. Não permita que um usuário se torne owner inserindo seu próprio membership.

A migração cria tabelas e políticas RLS para isolamento por organização. Faça backup antes de aplicar em qualquer banco que já contenha dados. O fluxo confiável de provisionamento de organização/owner ainda não existe; não abra cadastro operacional até isso existir.

## Deploy na Vercel

1. Importe este repositório na Vercel.
2. Framework preset: Vite; build command: `npm run build`; output directory: `dist`.
3. Adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente de Preview/Production.
4. Faça redeploy após alterar variáveis.
5. Configure URLs de redirecionamento do Supabase Auth para o domínio Vercel definitivo.

## Scripts

- `npm run dev` — desenvolvimento local
- `npm run typecheck` — verificação TypeScript
- `npm test` — testes unitários
- `npm run build` — typecheck e build de produção

## Segurança

A chave anon/public pode estar no frontend desde que RLS esteja corretamente configurado. A chave service-role é secreta e nunca deve ir para Vercel como variável `VITE_*`, código cliente, commits ou logs.
