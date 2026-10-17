# Implantação: Supabase + Vercel

## Supabase
- [ ] Criar projeto e escolher região conforme requisitos de latência e residência dos dados.
- [ ] Revisar e aplicar migrações versionadas.
- [ ] Definir backup e procedimento de restauração.
- [ ] Configurar Auth com domínio de produção e URLs de redirecionamento.
- [ ] Provisionar memberships por processo administrativo confiável.
- [ ] Validar RLS com usuários de organizações distintas.
- [ ] Garantir que service-role nunca esteja disponível no frontend.

## Vercel
- [ ] Importar o repositório GitHub.
- [ ] Framework Vite; build command: npm run build; output directory: dist.
- [ ] Configurar VITE_SUPABASE_URL.
- [ ] Configurar VITE_SUPABASE_ANON_KEY.
- [ ] Configurar Preview e Production separadamente.
- [ ] Validar deploy com e sem sessão autenticada.
- [ ] Cadastrar o domínio de produção no Supabase Auth.

## Critérios de aceite antes de dados reais
- Usuários não conseguem ler nem alterar dados de outra organização.
- Nenhum usuário consegue se autoatribuir papel privilegiado.
- Alterações críticas geram trilha de auditoria confiável no servidor.
- Autorizações e montagem de pneus são transacionais sob concorrência.
- Backup e restauração foram exercitados e documentados.
