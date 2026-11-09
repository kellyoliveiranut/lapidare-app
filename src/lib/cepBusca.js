/**
 * CEP automático a partir do endereço (e o contrário), via ViaCEP — serviço
 * público dos Correios; recebe só UF, cidade e rua (ou só o CEP), nenhum dado
 * da paciente.
 *
 * Regra de ouro: só preenche CEP quando houver UMA resposta possível. Rua grande
 * tem vários CEPs, um por trecho de numeração; chutar o primeiro põe CEP errado
 * na nota fiscal. Com mais de uma, a tela mostra as opções para a nutri escolher.
 *
 * As funções puras (faixa de numeração, filtro) são testadas em cepBusca.teste.mjs;
 * as de rede só chamam fetch e devolvem [] em qualquer falha.
 */

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** "Rua Mundurucus" -> "Mundurucus" (o ViaCEP casa pelo nome, sem o tipo). */
export function nomeDaRua(logradouro) {
  return String(logradouro ?? '')
    .trim()
    .replace(/^(rua|r\.?|avenida|av\.?|travessa|tv\.?|tr\.?|alameda|al\.?|passagem|psg\.?|pass\.?|estrada|rodovia|rod\.?|praça|praca|pç\.?|largo|beco|vila|vl\.?)\s+/i, '')
    .trim();
}

const primeiroNumero = (txt) => {
  const n = parseInt(soDigitos(String(txt).split('/')[0]), 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * O número cabe na faixa descrita pelo complemento dos Correios?
 * Formatos: "até 799", "de 1 a 99", "de 1.001/1.002 ao fim", "- lado par/ímpar",
 * "- de 100 a 200 - lado par". Sem faixa reconhecível (rua inteira, "s/n",
 * nome de edifício) devolve true: não há motivo para descartar.
 */
export function numeroNaFaixa(complemento, numero) {
  const n = parseInt(soDigitos(numero), 10);
  if (!Number.isFinite(n)) return true;
  const c = norm(complemento);
  if (!c) return true;

  const lado = /lado (par|impar)/.exec(c)?.[1];
  if (lado === 'par' && n % 2 !== 0) return false;
  if (lado === 'impar' && n % 2 === 0) return false;

  let m = /de ([\d./]+) a ([\d./]+)/.exec(c);
  if (m) {
    const a = primeiroNumero(m[1]);
    const b = primeiroNumero(m[2]);
    if (a !== null && b !== null) return n >= a && n <= b;
  }
  m = /de ([\d./]+) ao fim/.exec(c);
  if (m) { const a = primeiroNumero(m[1]); if (a !== null) return n >= a; }
  m = /ate ([\d./]+)/.exec(c);
  if (m) { const b = primeiroNumero(m[1]); if (b !== null) return n <= b; }
  return true;
}

/** Restringe a lista pelo número da casa e, se informado, pelo bairro. */
export function filtrarCandidatos(lista, { numero, bairro } = {}) {
  let r = (lista ?? []).filter(d => d && soDigitos(d.cep).length === 8);
  if (numero) {
    const f = r.filter(d => numeroNaFaixa(d.complemento, numero));
    if (f.length) r = f;
  }
  if (bairro && bairro.trim()) {
    const f = r.filter(d => norm(d.bairro) === norm(bairro));
    if (f.length) r = f;
  }
  // CEP repetido (mesmo CEP em duas linhas) conta uma vez.
  const vistos = new Set();
  return r.filter(d => { const k = soDigitos(d.cep); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

/** Rótulo curto para a nutri escolher entre as opções. */
export function rotuloCandidato(d) {
  const faixa = String(d.complemento ?? '').trim();
  return [d.cep, d.bairro, faixa].filter(Boolean).join(' — ');
}

/** Pelo CEP: devolve { logradouro, bairro, localidade, uf } ou null. */
export async function buscarPorCep(cep) {
  const d8 = soDigitos(cep);
  if (d8.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${d8}/json/`);
    const d = resp.ok ? await resp.json() : null;
    return d && !d.erro ? d : null;
  } catch { return null; }
}

/** Pelo endereço: lista de { cep, logradouro, complemento, bairro, localidade, uf }. */
export async function buscarPorEndereco({ uf, cidade, logradouro }) {
  const u = String(uf ?? '').trim().toUpperCase();
  const c = String(cidade ?? '').trim();
  const rua = nomeDaRua(logradouro);
  if (u.length !== 2 || c.length < 3 || rua.length < 3) return [];
  try {
    const resp = await fetch(
      `https://viacep.com.br/ws/${u}/${encodeURIComponent(c)}/${encodeURIComponent(rua)}/json/`);
    const lista = resp.ok ? await resp.json() : [];
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
}
