// Classifica as pacientes do painel "Notificações" (Visão geral). Função pura.
//
// Linha de entrada (public.painel_notificacoes_pacientes):
//   { id, nome, telefone, tipo_plano, ultimo_acesso, volta_app_enviado_em,
//     volta_app_envios, tem_push }
//
// Saída:
//   semNotificacao  quem não tem push: { ...p, situacao: 'nunca_abriu' | 'abriu' }
//   convitePendente quem recebeu "volte ao app" e não abriu o app depois
//   voltaram        quem recebeu "volte ao app" e abriu o app depois
//
// Plano avulso fica de fora do "sem notificação": não usa o app todo.

const ehAvulsa = (p) => (p.tipo_plano ?? '').trim().toLowerCase() === 'avulsa';
const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

export function classificar(linhas = []) {
  const semNotificacao = [];
  const convitePendente = [];
  const voltaram = [];

  for (const p of linhas) {
    if (!p.tem_push && !ehAvulsa(p)) {
      semNotificacao.push({ ...p, situacao: p.ultimo_acesso ? 'abriu' : 'nunca_abriu' });
    }
    const env = ms(p.volta_app_enviado_em);
    if (env !== null && Number(p.volta_app_envios) > 0) {
      const ult = ms(p.ultimo_acesso);
      if (ult !== null && ult > env) voltaram.push(p);
      else convitePendente.push(p);
    }
  }

  const porNome = (a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR');
  // Quem nunca abriu o app vem primeiro; depois, as que sumiram há mais tempo.
  semNotificacao.sort((a, b) =>
    (a.situacao === b.situacao ? 0 : a.situacao === 'nunca_abriu' ? -1 : 1) ||
    ((ms(a.ultimo_acesso) ?? 0) - (ms(b.ultimo_acesso) ?? 0)) || porNome(a, b));
  convitePendente.sort((a, b) => (ms(a.volta_app_enviado_em) ?? 0) - (ms(b.volta_app_enviado_em) ?? 0) || porNome(a, b));
  voltaram.sort(porNome);
  return { semNotificacao, convitePendente, voltaram };
}

// Mesmo formato do wa.me usado na Agenda: só dígitos, com o código do país.
export function telefoneWhatsapp(raw) {
  let n = (raw ?? '').replace(/\D/g, '');
  if (!n) return null;
  if (n.startsWith('0')) n = n.slice(1);
  if (n.startsWith('55') && n.length >= 12) return n;
  return '55' + n;
}

// Sem conteúdo clínico (CFN 856): só explica como ligar os avisos do app.
export function mensagemAtivarAvisos(nome) {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  const abertura = primeiro ? `Oi, ${primeiro}!` : 'Oi!';
  return `${abertura} Para você receber os avisos do seu acompanhamento no app, abra o app Essentia, toque em "Mais" e depois em "Ativar notificações". Se o celular perguntar, é só permitir. No iPhone, primeiro toque em Compartilhar → Adicionar à Tela de Início e abra o app por lá. Qualquer dúvida, me chama por aqui.`;
}

export function linkWhatsapp(p) {
  const tel = telefoneWhatsapp(p.telefone);
  if (!tel) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensagemAtivarAvisos(p.nome))}`;
}
