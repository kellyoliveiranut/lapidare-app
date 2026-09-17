# 📝 NOTES.md — Lapidare App

Registro vivo das decisões tomadas sobre o app **Lapidare** (painel da nutri + app da paciente).
Atualizado conforme o produto evolui. **Não é documentação pública** — é nosso log interno.

---

## 🎯 Visão geral

**O que é:** template open-source de plataforma completa pra nutricionistas autônomas. Cada nutri tem seu próprio painel + app das pacientes, com banco isolado e zero custo recorrente no plano grátis.

**Pra quem:** nutris que querem profissionalizar o acompanhamento sem pagar SaaS mensal e sem precisar saber programar.

**Modelo:** distribuído via GitHub fork → cada nutri cria seu próprio Supabase + deploy no Netlify (instruções em SETUP.md).

**Repositório:** [github.com/kellyoliveiranut/lapidare-app](https://github.com/kellyoliveiranut/lapidare-app)
**Deploy de referência:** [kelly-onco.netlify.app](https://kelly-onco.netlify.app)

---

## 🏗️ Stack & arquitetura

| Camada | Tecnologia | Por quê |
|--------|-----------|---------|
| Frontend | **React 18 + Vite** | Build rápido, dev experience boa |
| Roteamento | **React Router v6** | Padrão React, simples |
| Backend | **Supabase** (Postgres + Auth + Storage + Realtime + RLS) | Tudo em um, plano grátis generoso, RLS pra isolar dados |
| Deploy | **Netlify** | Grátis, integra com GitHub, HTTPS automático |
| Estilo | **Plain CSS + Design Tokens** (sem Tailwind) | Personalizável visualmente sem mexer em código |
| PWA | manifest.json + ícones PNG + meta tags | App instalável no celular da paciente |

**Duas personas no mesmo app:**
- **Painel da Nutri** → desktop-first (sidebar + áreas largas)
- **App da Paciente** → mobile-only PWA (instalável no celular)

---

## 🎨 Identidade visual

### Paleta padrão (editável pela tela Personalização)
- Cream `#F0EBE3` — fundo da página
- Dark `#1C1712` — texto / sidebar / botões primários
- Gold `#C4A882` — acento / destaque
- Verde / Vermelho / Azul / Laranja funcionais

### Tipografia
- **Serif** (títulos): Cormorant Garamond
- **Sans** (corpo): Inter
- Alternativas: Manrope, Playfair + Lato (selecionáveis em Personalização)

### Sistema de Personalização
- Tela `Personalização` no painel da nutri permite:
  - Upload de logo
  - Mudança de nome da marca + tagline
  - Cor primária + secundária
  - Tipografia
- Tudo salvo na tabela `nutris` (campos `brand_*`) e aplicado via ThemeProvider
- **Importante:** sobrescreve `--dark` também (não só `--gold`), pra mudar visual da sidebar/botões

---

## 👩‍⚕️ Painel da Nutri

### Estrutura da sidebar
```
ATENDIMENTO
  📊 Visão geral
  👥 Pacientes
  ➕ Cadastrar paciente
  📅 Agenda
  💬 Chat
  📸 Feed de pratos
  📋 Check-ins
  📑 Prescrições
  📚 Biblioteca (e-books)

GESTÃO DO CONSULTÓRIO
  🧠 Cérebro do negócio
  ⚙️ Meus serviços
  📈 Previsibilidade
  💰 Financeiro real
  🎨 Personalização

SESSÃO
  Nome + Sair
```

### Telas / features principais

**Visão geral:**
- KPIs: receita do mês, meta, mentoradas ativas
- Próximas consultas da semana
- Alertas relacionais: aniversariante, paciente sumida há X dias, parcela atrasada, baixa aderência
- Meta mensal com progresso

**Pacientes:**
- Lista filtrada por status / plano / modalidade
- Cadastro gera link único (token) pra paciente criar senha
- Perfil da paciente com **9 abas**:
  - Evolução (linha do tempo)
  - Follow-up
  - Plano alimentar (importa via JSON)
  - Lista de compras (importa via JSON)
  - Suplementação (habit tracker)
  - Prescrições (PDF)
  - E-books atribuídos
  - Avaliação antropométrica
  - Check-ins / Anamnese / Hábitos

**Agenda:**
- Calendário mensal
- Tipos de consulta: primeira / retorno
- Link automático Jitsi (grátis) ou Meet manual
- Botão "Adicionar ao Google Calendar"
- Links extras: Shaped, Notion, Trello

**Financeiro real:**
- 4 tabs: Entradas / Saídas / Previsibilidade / Por produto
- Vendas com parcelamento (cartão / Pix / Asaas / boleto)
- Status: pago / pendente / atrasado
- Edição e exclusão de venda inteira (cascade nas parcelas)
- Edição de parcela individual

**Cérebro do negócio:**
- Funil de aquisição
- LTV, CAC, churn
- Forecast por produto
- Insights estratégicos

**Previsibilidade:**
- Calculadora: gastos fixos + ticket médio + horas semanais → "você precisa de X pacientes pra bater a meta"
- Persistido em `nutris.previsibilidade_*`

**Meus serviços:**
- Catálogo dos serviços vendidos
- Nome + ticket + descrição + ativo
- Usado pelo Financeiro pra preencher venda com 1 clique

**Check-ins / Questionários:**
- Templates customizáveis
- Múltiplos templates por nutri
- Agendamento recorrente (pg_cron quando disponível)
- Banner no início da paciente quando há pendente
- Anamnese / QFA / Recordatório 24h prontos como modelo

**Biblioteca de e-books:**
- Upload de PDF (1 vez)
- Atribuição individual por paciente
- Banner dourado "📚 Novo e-book" pra paciente

**Personalização:**
- Logo, marca, cores, tipografia
- Tudo aplicado instantaneamente no app

---

## 📱 App da Paciente

### Estrutura
- **Layout mobile-first** (header + body + tab bar inferior)
- **Sheet "Mais"** pra itens secundários
- **PWA instalável** ("Adicionar à Tela de Início")
- Termo de consentimento LGPD no primeiro acesso

### Tab bar principal
- 🏠 Início
- 🥗 Plano
- 📷 Feed
- 💊 Suplementos
- ⋯ Mais (Compras / Progresso / Prescrições / E-books / Hábitos)

### Telas
- **Início:** banners (próxima consulta, check-in pendente, e-book novo), hábitos do dia, atalhos
- **Plano alimentar:** refeições com substituições
- **Lista de compras:** itens por categoria
- **Feed:** posta foto da refeição → nutri comenta
- **Progresso:** gráficos de peso, medidas, % gordura, fotos de evolução
- **Suplementos:** check diário + streak + aderência%
- **Prescrições + E-books:** download de PDF
- **Chat realtime:** com a nutri (Supabase Realtime)
- **Check-in:** responde banner

---

## ✅ Decisões importantes que tomamos

### Cadastro e link único
- **Nutri cadastra paciente** → entra em `pacientes_pendentes` com token único
- Link gerado: `/signup-paciente/:nutriId/:token`
- Paciente clica → cria conta no Supabase Auth → preenche senha → trigger move pra `pacientes`
- Botões "Copiar link" e "WhatsApp" (mensagem pronta)

### Autenticação
- Supabase Auth (email + senha)
- Confirm email **desligado por padrão** (evita rate limit grátis de 3/hora)
- SessionProvider resolve role automaticamente (`nutri` ou `paciente`)
- RequireAuth + RequireRole guards nas rotas

### Plano alimentar
- Importado via **JSON** colado pela nutri
- Validador checa formato antes de salvar
- "Dica do ChatGPT" em amarelo com prompt pronto pra gerar JSON novo

### PWA (instalável no celular)
- `manifest.json` em `/public/`
- Ícones PNG: 192x192, 512x512, 180x180 (apple-touch)
- Meta tags: `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `theme-color`
- Tutorial pra paciente "Adicionar à Tela de Início" no Safari (iOS) e Chrome (Android)

### Distribuição open source
- README.md + SETUP.md + CUSTOMIZAR.md
- Workshop site (`lapidare-fase02-workshop`) com 4 dias de tarefas + 41 itens
- Tutorial em vídeo + prints
- Cada nutri precisa criar seu **próprio Supabase** + **fork no GitHub** + **deploy no Netlify**

### Atualização do template (Sync Fork)
- Nutri faz Sync Fork no GitHub → Netlify auto-redeploy
- **Dados ficam intactos** (estão no Supabase dela, não no GitHub)
- Setup.sql é **idempotente** (`create table if not exists`) → pode rodar de novo sem perder dados

---

## 🐛 Bugs corrigidos (histórico)

| Bug | Causa | Solução |
|-----|-------|---------|
| `Bucket not found` (ebooks) | Bucket Storage não criado pelo setup | SQL pra criar bucket + policies |
| Infinite recursion em policy de ebooks | Policy referenciava a própria tabela | Criar funções `SECURITY DEFINER` (`paciente_pode_ver_ebook`, `nutri_dona_do_ebook`) |
| `--white` não funcionava em paciente | Variável CSS sobrescrita no contexto | Hardcode `#ffffff` em botões críticos |
| Tabs quebradas (Follow-up wrap em 2 linhas) | Falta de overflow control | `white-space: nowrap` + `overflow-x: auto` |
| Personalização só mudava acentos pequenos | Não sobrescrevia `--dark` (sidebar/botões usam) | Sobrescrever `--dark` + tons derivados via `mistura()` |
| Botão "Aceito" do termo invisível | `var(--white)` não resolvia no contexto | Hardcode `#ffffff` |
| `relation "public.servicos" does not exist` (Kelly) | `vendas` tinha FK pra `servicos` mas era criada antes | Mover `CREATE TABLE servicos` antes de `vendas` em setup.sql |
| `schema "cron" does not exist` (Kelly) | pg_cron precisa de permissão Supabase Pro | Wrap em `EXCEPTION` handler + `IF EXISTS pg_namespace` |
| JS quebra (lightbox + check + tabs) | Temporal dead zone com `let diasCompletados` | Mover declaração ANTES do `updateProgress()` |
| Financeiro: sem editar/excluir venda inteira | Só tinha modal de parcela | Botões "Editar venda" + "Excluir venda" no rodapé do card expandido + `EditarVendaModal` (paciente, serviço, data, obs) |

---

## 🔄 Workshop Fase 02 (`lapidare-fase02-workshop`)

Site HTML interativo pra ensinar nutris a fazer o setup + cadastrar primeira paciente.

### Características
- **4 dias de tarefas**, 41 itens no total:
  - Dia 01 — Setup (11 tarefas): GitHub, Fork, Supabase, pg_cron, setup.sql, Netlify, deploy
  - Dia 02 — Personalização (6 tarefas): logo, cores, tipografia
  - Dia 03 — Primeira paciente (11 tarefas): cadastro, **ensinar a instalar app no celular**, JSON do plano, anamnese, hábitos, suplementos
  - Dia 04 — Modificar app com Claude Code (13 tarefas)
- Tabs entre dias + progresso por dia + total
- Checkboxes com persistência no localStorage
- Confetti animation quando completa
- Lightbox com botão "+" pra zoom em prints
- Animações smooth nos checks
- "Como usar este guia" banner explicativo

### Tarefa #2 do Dia 03 (importante)
**"Orientar a paciente a instalar o app no celular"** com mensagem pronta pra mandar no WhatsApp + instruções separadas pra iPhone (Safari) e Android (Chrome).

---

## ⚠️ Limites do plano Free

| Recurso | Limite | Quando estoura |
|---------|--------|----------------|
| Supabase Database | 500 MB | ~100 pacientes ativas por anos |
| Supabase Storage | 1 GB | ~500 fotos de evolução |
| Supabase Email Auth | 3/hora | Configurar SMTP próprio (Resend grátis) |
| GitHub | Ilimitado (repos públicos) | Nunca |
| Netlify | 100 GB/mês banda | Praticamente nunca |

Quando estourar: **Supabase Pro US$ 25/mês** (~R$ 130) com 8 GB DB + 100 GB storage.

---

## 📌 Próximos passos sugeridos (não prioritários)

- [ ] Integração WhatsApp Business API pra disparo automático (boas-vindas, lembretes, alertas)
- [ ] App da paciente PWA com notificações push (já tem manifest, falta service worker)
- [ ] Importação de pacientes via CSV (já tem schema, falta UI completa)
- [ ] Multi-idioma (en, es) pra escalar pra fora do BR
- [ ] Tela de Cérebro do Negócio mais visual (gráficos)
- [ ] Integração Stripe / Asaas pra cobrança automática
- [ ] Export do banco da nutri (backup completo)

---

## 🆘 Suporte recorrente das alunas

**Erros mais comuns:**
1. **"Email rate limit exceeded"** → desligar Confirm email no Supabase
2. **"Bucket not found"** → rodar setup.sql completo de novo
3. **"App diz Conectando... sem fim"** → conferir variáveis VITE_SUPABASE_* no Netlify
4. **"Email não autorizado"** → usar alias `+teste` (ex: `seuemail+ana@gmail.com`)

**Pra atualizar app:**
1. GitHub do fork → botão **Sync fork** → **Update branch**
2. Netlify auto-redeploy em 2-3 min
3. Setup.sql é idempotente, pode rodar de novo se houver mudança no schema
4. **Dados NÃO somem** (estão no Supabase dela)

---

## 📂 Estrutura de pastas (referência)

```
lapidare-app/
├── README.md           # Visão geral pública
├── SETUP.md            # Passo a passo de setup
├── CUSTOMIZAR.md       # Como modificar com Claude Code
├── NOTES.md            # ESTE ARQUIVO (notas internas)
├── LICENSE             # MIT
├── package.json
├── vite.config.js
├── netlify.toml
├── index.html          # PWA meta tags + manifest
├── public/
│   ├── manifest.json   # PWA manifest
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── apple-touch-icon.png
│   ├── icon-source.svg # SVG fonte dos ícones (editar pra rebrand)
│   └── icons.svg
├── src/
│   ├── app/
│   │   ├── auth/       # Login, signup, callback
│   │   ├── nutri/      # 14 telas do painel da nutri
│   │   └── paciente/   # 11 telas do app da paciente
│   ├── components/     # Layouts compartilhados (NutriLayout, PacienteLayout, RequireAuth, etc)
│   ├── lib/            # supabase.js, session.jsx, theme.jsx, utils.js, validators
│   ├── styles/         # tokens.css, nutri.css, paciente.css, checkin.css
│   └── main.jsx
└── supabase/
    └── setup.sql       # Schema completo (idempotente, 700+ linhas)
```

---

## 📜 Histórico de versões

- **v1.0** — Lançamento inicial open source
- **v1.1** — Fix pg_cron opcional + ordem servicos/vendas no setup
- **v1.2** — PWA completo (manifest + ícones) + editar/excluir venda no Financeiro

---

_Última atualização: maio/2026 · Mantido por Daniela Soares + Claude Code_
