// Geração automática do plano alimentar (aba Plano da paciente).
//
// Parte PURA — sem rede, sem banco, sem React —, testada por
// src/lib/planoAutomatico.teste.mjs. O que é efeito (chamar a IA, preencher o
// editor) fica em PacientePerfil.jsx.
//
// REGRA DA CASA: o plano gerado é sempre RASCUNHO. Entra no editor, a nutri
// revisa cada item e só ela publica. Nada aqui publica nem fala com a paciente.

import { validarPlano } from './utils.js';

// Haiku: a function anthropic-proxy tem teto de tempo e um plano completo
// em Sonnet pode estourar (o import de PDF de treino já deu 504 em Sonnet).
// Para trocar de modelo basta mudar esta constante — a allowlist do proxy
// aceita 'claude-sonnet-4-6' e 'claude-haiku-4-5'.
export const MODELO_PLANO = 'claude-haiku-4-5';
export const MAX_TOKENS_PLANO = 4096;

// Diferença (em %) entre as calorias da meta e as do plano gerado a partir da
// qual a tela avisa. Só aviso de tela: não é regra clínica.
export const TOLERANCIA_KCAL_PCT = 5;

// Por ora a geração automática vale só para pacientes que NÃO são oncológicas.
// Oncologia fica de fora até a Kelly definir como o plano deve considerar
// regime, sintomas e restrições do tratamento. Devolve o motivo (texto para a
// tela) ou null se pode gerar.
export function motivoBloqueio({ objetivo, tipoPlano, qtdTratamentosOnco } = {}) {
  const ehOnco = String(objetivo ?? '').trim().toLowerCase() === 'oncologia';
  const ehEssentia = String(tipoPlano ?? '').trim().toLowerCase() === 'essentia';
  if (ehOnco || ehEssentia || (qtdTratamentosOnco ?? 0) > 0) {
    return 'A geração automática ainda não está liberada para pacientes oncológicas. Monte o plano manualmente ou pelo prompt.';
  }
  return null;
}

// A IA só distribui as metas que a nutri já calculou; sem elas ela inventaria
// os números. Devolve a mensagem ou null.
export function faltaMeta({ kcal, prot, carbo, gord } = {}) {
  const vazio = (v) => !String(v ?? '').trim() || String(v).trim() === '—';
  const faltando = [];
  if (vazio(kcal)) faltando.push('calorias');
  if (vazio(prot)) faltando.push('proteínas');
  if (vazio(carbo)) faltando.push('carboidratos');
  if (vazio(gord)) faltando.push('gorduras');
  if (!faltando.length) return null;
  return `Preencha antes ${faltando.join(', ')} (ou importe da aba Cálculos): a IA só distribui as metas, não define os números.`;
}

// Resposta da IA → plano. Aceita JSON puro, com cerca de markdown ou com texto
// em volta (pega do primeiro "{" ao último "}"). Reaproveita validarPlano.
// Devolve { ok:true, plano, texto } (texto = JSON limpo, no formato que o
// aplicarJson já entende) ou { ok:false, erro }.
export function lerRespostaPlano(resposta) {
  const bruto = String(resposta ?? '').replace(/```[\w]*\n?/gi, '').replace(/\n?```/g, '').trim();
  const ini = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (ini === -1 || fim <= ini) return { ok: false, erro: 'A IA não devolveu um plano em JSON. Tente de novo.' };
  const texto = bruto.slice(ini, fim + 1);
  let plano;
  try { plano = JSON.parse(texto); }
  catch { return { ok: false, erro: 'A resposta da IA veio incompleta ou fora do formato. Tente de novo.' }; }
  const v = validarPlano(plano);
  if (!v.ok) return { ok: false, erro: `A resposta da IA não serve como plano: ${v.erro}` };
  return { ok: true, plano, texto };
}

const nomeDe = (a) => String(a?.nome ?? a?.name ?? a?.alimento ?? '').trim();

// Alimentos do plano que a TACO não reconhece, como "Refeição: alimento", para
// a nutri olhar com atenção. `buscar` é buscarAlimento (injetada, para testar).
export function alimentosForaDaTaco(plano, buscar) {
  const fora = [];
  for (const r of plano?.refeicoes ?? []) {
    for (const a of r?.alimentos ?? []) {
      const nome = nomeDe(a);
      if (nome && !buscar(nome)) fora.push(`${String(r?.nome ?? 'Refeição').trim()}: ${nome}`);
    }
  }
  return fora;
}

// Calorias do plano × calorias da meta. Devolve texto de aviso ou null.
export function avisoKcal(kcalPlano, kcalMeta, tolerancia = TOLERANCIA_KCAL_PCT) {
  const p = parseFloat(String(kcalPlano ?? '').replace(',', '.'));
  const m = parseFloat(String(kcalMeta ?? '').replace(',', '.'));
  if (!Number.isFinite(p) || !Number.isFinite(m) || m <= 0) return null;
  const dif = Math.abs(p - m) / m * 100;
  if (dif <= tolerancia) return null;
  return `As calorias do plano (${Math.round(p)} kcal) diferem da meta (${Math.round(m)} kcal) em ${dif.toFixed(0)}%.`;
}
