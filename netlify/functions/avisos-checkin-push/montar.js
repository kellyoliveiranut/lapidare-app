// Parte pura do push de check-in diário para a nutri (sem rede, sem banco),
// separada para ser testada (src/lib/avisosCheckinPush.teste.mjs).
//
// O corpo do push aparece na tela de bloqueio: só o primeiro nome e uma frase
// fixa, nunca sintoma nem número. Quem quiser o detalhe toca e abre a tela de
// oncologia da nutri.

// Mesma rota do link do aviso (src/lib/avisosNutri.js, ROTA_ONCOLOGIA_NUTRI).
const ROTA_ONCOLOGIA_NUTRI = '/nutri/monitoramento-oncologico';
// O mesmo ícone que o sw.js usa quando o payload não traz um.
const ICONE = '/icon-192.png';

function primeiroNome(nome) {
  const p = String(nome ?? '').trim().split(/\s+/)[0];
  return p || 'Sua paciente';
}

const TEXTOS = {
  checkin_diario: nome => ({
    title: 'Check-in respondido',
    body: `${nome} respondeu o check-in de hoje.`,
  }),
  alerta_oncologico: nome => ({
    title: 'Alerta no check-in',
    body: `${nome} registrou sinais que merecem sua atenção. Abra para conferir.`,
  }),
};

/** Linha devolvida por reservar_avisos_para_push → payload do push, ou null (tipo fora desta função). */
function montarPayload(aviso) {
  const texto = TEXTOS[aviso?.aviso_tipo];
  if (!texto) return null;
  return { ...texto(primeiroNome(aviso.paciente_nome)), icon: ICONE, url: ROTA_ONCOLOGIA_NUTRI };
}

/** Agrupa os avisos com payload por nutri: { [nutri_id]: [payload, ...] }. Ignora tipo desconhecido e aviso sem nutri. */
function agruparPorNutri(avisos) {
  const grupos = {};
  for (const a of avisos ?? []) {
    const payload = montarPayload(a);
    if (!payload || !a.aviso_nutri_id) continue;
    (grupos[a.aviso_nutri_id] ??= []).push(payload);
  }
  return grupos;
}

module.exports = { primeiroNome, montarPayload, agruparPorNutri, ROTA_ONCOLOGIA_NUTRI, ICONE };
