# 📘 Tutorial passo a passo — Setup do Lapidare

**Pra quem é:** nutricionistas (ou qualquer pessoa) que quer ter seu próprio app de acompanhamento nutricional, gratuito e privado.

**Tempo total:** ~30 minutos.

**Não precisa saber programar.** Só seguir os passos.

---

## ✅ Antes de começar — você vai precisar

- Computador com internet
- Email pessoal
- ~30 minutos sem interrupção

Vai criar contas grátis em 3 serviços:
- **Supabase** (banco de dados)
- **GitHub** (código)
- **Netlify** (hospedagem)

Todos têm planos gratuitos pra sempre. Você **não vai pagar nada**.

---

## Etapa 1 — Criar banco de dados no Supabase (10 min)

### 1.1 Criar conta
1. Acesse [supabase.com](https://supabase.com)
2. Clica em **Start your project**
3. Login com Google ou email

### 1.2 Criar projeto
1. **New project**
2. Preenche:
   - **Name**: `lapidare-suanome` (ex: `lapidare-ana`)
   - **Database password**: clica em **Generate** e **salva num lugar seguro** (gerenciador de senhas, anotação privada)
   - **Region**: `South America (São Paulo)` — importante pra velocidade
   - **Pricing Plan**: Free
3. Clica em **Create new project**
4. Aguarda ~2 minutos (vai mostrar "Setting up project")

### 1.3 Rodar o setup SQL
1. No menu lateral esquerdo, clica em **SQL Editor** (ícone que parece `>_`)
2. Clica em **+ New query** (canto superior direito)
3. Abre o arquivo [`supabase/setup.sql`](supabase/setup.sql) deste repositório
4. **Copia TUDO** (Cmd+A → Cmd+C)
5. **Cola** no SQL Editor do Supabase (Cmd+V)
6. Clica no botão **Run** (canto inferior direito, ou Cmd+Enter)
7. Esperado: caixinha verde com **"Success. No rows returned"**

> ⚠️ Se der erro, manda print do erro nos comentários do repositório.

### 1.4 Desabilitar confirmação de email
Importante pra teste e pra evitar limite de email.

1. Menu lateral → **Authentication** → **Sign In / Providers**
2. Procura **User Signups** (rola pra baixo se necessário)
3. **Desliga** a chave **"Confirm email"**
4. Clica em **Save changes**

### 1.5 Pegar credenciais
Você vai precisar de 2 valores. Estão em lugares diferentes do Supabase:

**Project URL:**
1. Ícone de engrenagem (canto inferior esquerdo) → **Project Settings**
2. Menu lateral → **General**
3. Copia o **Project ID** (ex: `ihlsexyjbbcdjdddmiym`)
4. Monta a URL: `https://<PROJECT_ID>.supabase.co`

**Publishable key (API key):**
1. Ainda em Project Settings → **API Keys**
2. Copia a chave que começa com `sb_publishable_...`

Guarda os 2 valores num arquivo de texto/Notion privado pra usar no Netlify.

---

## Etapa 2 — Fork do código no GitHub (5 min)

### 2.1 Criar conta no GitHub
1. Acesse [github.com](https://github.com) → **Sign up**
2. Confirma email

### 2.2 Fazer fork deste repositório
1. Acessa este repositório (link onde você baixou esse tutorial)
2. Canto superior direito → clica em **Fork**
3. Mantém o nome `lapidare-app`
4. Clica em **Create fork**

Pronto. Agora você tem o seu próprio repositório com o código do app.

---

## Etapa 3 — Hospedar no Netlify (10 min)

### 3.1 Criar conta
1. Acesse [netlify.com](https://netlify.com) → **Sign up**
2. Clica em **GitHub** (login pelo GitHub)
3. Autoriza o Netlify a ler seus repositórios

### 3.2 Conectar o repositório
1. **Add new site** → **Import an existing project**
2. **Deploy with GitHub**
3. Procura por `lapidare-app` e clica
4. Configurações de build (já vêm preenchidas — só confere):
   - **Branch to deploy**: `main`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`

### 3.3 Configurar variáveis de ambiente
**Antes de clicar em Deploy:**

1. Rola até **Environment variables**
2. **Add variable** → adiciona estas 2:

| Nome | Valor |
|------|-------|
| `VITE_SUPABASE_URL` | (a Project URL montada com o Project ID) |
| `VITE_SUPABASE_ANON_KEY` | (a **Publishable key** que começa com `sb_publishable_...`) |

3. Clica em **Deploy site**
4. Aguarda ~2-3 min — vai mostrar "Site is live" em verde

### 3.4 Pegar a URL do seu site
- Endereço fica tipo `https://relaxed-eclair-xyz.netlify.app`
- Pra mudar o nome: **Site configuration** → **Change site name** → escolhe algo tipo `app-ana-nutri`

---

## Etapa 4 — Criar sua conta de nutri (2 min)

1. Acessa a URL do seu site Netlify
2. Vai cair na tela de Login
3. Clica em **Criar conta**
4. Preenche:
   - **Nome completo**: seu nome
   - **CRN**: número do seu CRN
   - **Email**: seu email pessoal
   - **Senha**: mínimo 6 caracteres
5. **Criar conta**
6. Vai entrar direto no painel da Visão geral

🎉 **Pronto, seu app está no ar!**

---

## Etapa 5 — Personalizar (5 min)

1. Menu lateral → **Personalização**
2. Coloca o nome da sua marca, sobe seu logo, escolhe cores e tipografia
3. **Salvar personalização**
4. Pronto — agora o app tem a cara da sua marca

---

## 📲 Como cadastrar suas primeiras pacientes

1. Menu lateral → **Cadastrar paciente**
2. Preenche os dados (nome, email, objetivo, plano, modalidade)
3. **Cadastrar e gerar link**
4. Clica em **Copiar link** ou **WhatsApp**
5. Envia pra paciente
6. Quando ela criar a senha pelo link, **já entra no app**

---

## 🆘 Problemas comuns

### ⚠️ "Falha ao buscar" / "Failed to fetch" ao criar conta

Esse é o erro **mais comum** quando a nutri está montando o app pela primeira vez. Significa que o app **não conseguiu falar com o Supabase**. Resolve seguindo essa ordem:

**1. Confirma se as variáveis do Netlify estão certas**
- Vai em **Site settings → Environment variables**
- Confere que tem **EXATAMENTE** essas 2 (sem espaço extra, sem aspas):
  - `VITE_SUPABASE_URL` = `https://XXXXX.supabase.co` (XXXXX é o **Project ID**, sem traços ou nome bonito — exemplo: `ihlsexyjbbcdjdddmiym.supabase.co`)
  - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_xxxxx...`

**2. Fez redeploy DEPOIS de adicionar as variáveis?**
- Netlify só "lê" as variáveis quando faz build novo
- Vai em **Deploys → Trigger deploy → Deploy site**
- Aguarda ~2-3 min até ficar **"Published"** em verde

**3. Seu Supabase está pausado?** (só se app já funcionou antes e parou de funcionar agora)
- Plano grátis pausa projetos com 7+ dias sem acesso
- Vai em [supabase.com](https://supabase.com) → seu projeto
- Se aparecer botão verde **"Restore Project"**, clica e espera ~1 min

**4. Pra confirmar exatamente o que falhou:**
- No site, aperta **F12** (abre console do navegador)
- Tenta cadastrar de novo
- Olha a aba **Console** — vai mostrar a URL exata que falhou e por quê
- Se aparecer `ERR_NAME_NOT_RESOLVED` → URL errada (causa 1)
- Se aparecer `404` ou `Project does not exist` → Project ID errado
- Se aparecer `401 Unauthorized` → Publishable key errada

### "Bucket not found" ao subir arquivo
Faltou rodar parte do setup.sql. Volta na **Etapa 1.3** e roda o SQL inteiro de novo (é seguro repetir).

### "Email rate limit exceeded"
Você excedeu 3 emails/hora do Supabase grátis. **Etapa 1.4** desliga a confirmação de email, que evita esse problema. Confere se "Confirm email" está OFF.

### "Email não autorizado" ao cadastrar paciente
Algumas vezes o Supabase bloqueia emails do mesmo domínio. Use um email diferente ou um alias `+teste` (ex: `seuemail+ana@gmail.com`).

### App diz "Conectando..." sem fim
Mesma causa do "Falha ao buscar" — segue o passo a passo acima.

---

## 🔓 Recuperação de senha (importante)

A partir da v1.7 o Lapidare tem:
- Botão **"Esqueci minha senha"** na tela de Login (auto-serviço pra paciente)
- Botão **"Enviar redefinição de senha"** no perfil da paciente (nutri ajuda)

Pra esses botões funcionarem, você precisa fazer **2 configurações no Supabase** (1 vez só):

### 1. Adicionar Redirect URL

1. No Supabase → **Authentication** → **URL Configuration**
2. Em **Redirect URLs**, adiciona:
   ```
   https://SUA-URL.netlify.app/redefinir-senha
   ```
   (Substitui `SUA-URL` pelo nome do seu site Netlify)
3. Salva

### 2. (OPCIONAL) Configurar Resend pra emails ilimitados

O Supabase grátis envia **só 3 emails/hora**. Se você espera muito reset de senha, configura Resend (grátis, 3000 emails/mês):

1. Cria conta em [resend.com](https://resend.com) (gratuita)
2. **API Keys** → cria uma nova → copia
3. (Opcional) Verifica seu próprio domínio em **Domains** pra usar `nutri@suamarca.com.br` como remetente. Se pular, usa `onboarding@resend.dev` (funciona mas parece menos profissional).
4. No Supabase: **Project Settings** → **Authentication** → **SMTP Settings** → marca **Enable Custom SMTP**
5. Preenche:
   - Sender email: `onboarding@resend.dev` (ou seu domínio verificado)
   - Sender name: o nome da sua marca
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: a API key que você copiou
6. Salva. Pronto — todos os emails (signup, reset de senha, etc.) vão pelo Resend.

---

## 🔄 Como atualizar quando sair versão nova

1. No GitHub do seu fork, clica em **Sync fork** (botão no topo da página)
2. No Supabase, roda o `setup.sql` atualizado de novo (é seguro)
3. Netlify faz redeploy automático

---

## 💰 Quando vou começar a pagar?

Resumo dos limites grátis:

| Serviço | Limite Free | Quando estoura |
|---------|-------------|----------------|
| **Supabase Database** | 500 MB | ~100 pacientes ativas por ANOS |
| **Supabase Storage** | 1 GB | ~500 fotos de evolução |
| **Supabase Email Auth** | 3/hora | Configurar SMTP próprio (Resend grátis) |
| **GitHub** | Ilimitado pra repos públicos | Nunca |
| **Netlify** | 100 GB/mês de banda | Praticamente nunca pra esse uso |

Pra maioria das nutris, **dá pra ficar grátis indefinidamente.**

---

## 🤝 Contribuir / reportar problema

Esse é um projeto open source. Se encontrar bug, abre uma issue no GitHub.
Se quiser contribuir com código, abre um Pull Request.
