# Essentia — acompanhamento nutricional em oncologia

Painel da nutricionista + PWA da paciente. App único, de uso próprio no
consultório. Não é template nem produto distribuído.

**Produção:** https://kelly-onco.netlify.app
**Notas internas:** [NOTES.md](NOTES.md) · **Operação e diagnóstico:** [SETUP.md](SETUP.md)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19.2.6 + Vite 8.0.12, React Router v6 |
| Backend | Supabase — Postgres, Auth, Storage, Realtime, RLS |
| Serverless | Netlify Functions (7): push, e-mail, proxy da IA, 2 crons |
| Deploy | Netlify — build `npm run build`, publish `dist` |
| Estilo | CSS puro + design tokens (sem framework) |

## Rodar local

```bash
npm install
cp .env.example .env    # preencher as 2 variáveis VITE_
npm run dev             # http://localhost:5173
```

`npm run build` gera `dist/`. `npm run lint` roda o ESLint.

## Variáveis de ambiente

O app precisa de **12**: 2 no cliente (prefixo `VITE_`, entram no build) e 10
no servidor, lidas pelas Netlify Functions. Faltar uma do servidor não quebra
a tela — a função falha calada. A tabela com o papel de cada uma está em
[SETUP.md](SETUP.md).

## Estrutura

```
src/app/{auth,nutri,paciente}   telas
src/components/                 layouts, guards, modais compartilhados
src/lib/                        supabase, sessão, tema, helpers
src/styles/                     tokens.css + folhas por área
netlify/functions/              7 funções serverless
supabase/setup.sql              schema base
supabase/migrations/            62 migrations aplicadas
```

## Origem

Nasceu em maio/2026 como cópia do template open-source Lapidare, de Daniela
Soares, e seguiu caminho próprio desde então. Não há sync com a origem.
