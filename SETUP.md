# ⚙️ Operação do Essentia — configuração e diagnóstico

Para quem **mantém este deploy**. Não é tutorial de setup para terceiros.

**Produção:** https://kelly-onco.netlify.app · **Build:** `npm run build` → `dist/` (`netlify.toml`)

**Teste das regras de agenda:** `node src/lib/agendaConflitos.teste.mjs` — 29 casos
de borda de conflito e bloqueio, sem framework e sem banco. Aceita `TZ_TESTE`
para rodar em outro fuso (ex.: `TZ_TESTE=Asia/Tokyo`).

---

## 🔑 Variáveis de ambiente

São **12**. As 2 do cliente entram no build do Vite e precisam existir no
`.env` local **e** no Netlify. As 10 do servidor existem só no Netlify, lidas
pelas Functions em tempo de execução.

### Cliente (2)

| Variável | Para quê |
|---|---|
| `VITE_SUPABASE_URL` | `https://<PROJECT_ID>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_...`) |

### Servidor (10)

| Variável | Usada por | Para quê |
|---|---|---|
| `SUPABASE_URL` | as 7 funções | mesma URL do cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | as 7 funções | acesso que ignora RLS; **nunca** vai ao cliente |
| `VAPID_PUBLIC_KEY` | `send-push`, `aniversarios`, `lembretes-consulta` | push web |
| `VAPID_PRIVATE_KEY` | idem | push web |
| `VAPID_SUBJECT` | idem | contato do remetente (`mailto:`) |
| `GMAIL_USER` | `enviar-farmacia` | conta SMTP do Gmail |
| `GMAIL_APP_PASSWORD` | `enviar-farmacia` | senha de app do Gmail |
| `EMAIL_FROM_NOME` | `enviar-farmacia` | nome exibido como remetente |
| `ANTHROPIC_API_KEY` | `anthropic-proxy` | chave da IA, só no servidor |
| `CRON_SECRET` | `aniversarios`, `lembretes-consulta` | impede disparo do cron por fora |

> ⚠️ Variável marcada como **secret** no Netlify chega **vazia** no `netlify
> dev`. O sintoma é `supabaseKey is required` — é isso, não é bug de código.

> ⚠️ Faltar variável do servidor **não quebra a tela**. A função falha calada:
> push que não chega, e-mail que não sai, IA que não responde.

### As 7 Functions

| Função | O que faz |
|---|---|
| `send-push.js` | envia notificação push |
| `aniversarios.js` | cron diário, 12:00 UTC |
| `lembretes-consulta.js` | cron diário, 11:00 UTC |
| `enviar-farmacia.js` | envia a fórmula manipulada por e-mail |
| `anthropic-proxy.js` | chama a IA sem expor a chave no cliente |
| `acesso-senha.js` | acesso da paciente cadastrada sem e-mail |
| `login-telefone.js` | login por telefone |

---

## 🔧 O que precisa estar ligado no Supabase

Configuração de uma vez. Se o projeto for recriado, refazer.

### Confirm email — DESLIGADO
**Authentication → Sign In / Providers → User Signups → "Confirm email" OFF.**
O plano grátis manda 3 e-mails/hora; com a confirmação ligada, o cadastro de
paciente esbarra nesse teto.

### Redirect URL da redefinição de senha
**Authentication → URL Configuration → Redirect URLs:**

```
https://kelly-onco.netlify.app/redefinir-senha
```

Sem isso, "Esqueci minha senha" (Login) e "Enviar redefinição de senha"
(perfil da paciente) mandam a paciente para uma URL que não abre. A rota
existe em `src/App.jsx`.

### Onde achar as credenciais
- **Project ID:** Project Settings → General → monta `https://<ID>.supabase.co`
- **Publishable key:** Project Settings → API Keys → `sb_publishable_...`
- **Service role key:** mesma tela — ignora RLS, vive só no Netlify

### SMTP próprio (opcional)
Só se o teto de 3 e-mails/hora incomodar: **Project Settings → Authentication
→ SMTP Settings → Enable Custom SMTP**. O e-mail da farmácia **não passa por
aqui** — sai pela Function `enviar-farmacia`, via Gmail, com as `GMAIL_*`.

---

## 🆘 Quando para de responder

### "Falha ao buscar" / "Failed to fetch" / "Conectando..." sem fim
O app não falou com o Supabase. Nessa ordem:

1. **Variáveis no Netlify** — Site settings → Environment variables. Sem
   espaço extra, sem aspas.
2. **Houve redeploy depois de mexer nelas?** O Netlify só lê variável em build
   novo. Deploys → Trigger deploy → aguardar "Published".
3. **Projeto Supabase pausado?** O plano grátis pausa com 7+ dias sem acesso —
   aparece o botão **Restore Project**.
4. **Ler o erro exato:** F12 → Console → repetir a ação.
   - `ERR_NAME_NOT_RESOLVED` → URL errada
   - `404` / `Project does not exist` → Project ID errado
   - `401 Unauthorized` → publishable key errada

### "Email rate limit exceeded"
Teto de 3/hora do Supabase. Conferir se "Confirm email" está OFF.

### "Bucket not found" ao subir arquivo
Falta o bucket ou as policies dele. Conferir em Supabase → Storage e nas
policies do banco — o `setup.sql` não é fonte de verdade sobre o que está lá.

### Push não chega
Não dá erro de tela. Conferir se as 3 `VAPID_*` existem no Netlify e se a
paciente tem assinatura registrada.

### "Mudei e não aparece na tela"
Antes de suspeitar do código: o commit foi **pushado**? (`git rev-parse HEAD`
contra `origin/main`) e o deploy ficou "Published"? Um `200` numa URL de asset
**não prova nada** — o redirect SPA do `netlify.toml` devolve `index.html` com
status 200 para qualquer caminho inexistente. Olhar o `content-type`.

---

## 💰 Limites do plano grátis

| Serviço | Limite | Observação |
|---|---|---|
| Supabase Database | 500 MB | ~100 pacientes ativas por anos |
| Supabase Storage | 1 GB | imagens são comprimidas no cliente |
| Supabase Email Auth | 3/hora | SMTP próprio resolve |
| Netlify | 100 GB/mês de banda | praticamente nunca |

Supabase Pro: US$ 25/mês. Atenção: **transformação de imagem não funciona no
plano Free e falha em silêncio** — é por isso que a compressão acontece no
cliente.

---

## 🔄 Se precisar recriar o site no Netlify

1. Add new site → Import from GitHub → `kellyoliveiranut/lapidare-app`
2. Build `npm run build` · Publish `dist` · Branch `main`
3. **Cadastrar as 12 variáveis antes do primeiro deploy**
4. Conferir os 2 crons agendados no `netlify.toml`
5. Refazer as configurações do Supabase da seção acima
