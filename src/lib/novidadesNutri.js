/**
 * Novidades do painel da nutri (BannerNovidades) — regra pura, sem React e
 * sem banco, para ser testada no Node.
 *
 * Dados: src/data/novidades.json. Campos de sempre: id (maior = mais novo),
 * data, rota (null = toda tela; senão a tela e as sub-rotas dela) e texto.
 * Opcionais (bloco-103): rotulo, titulo (com **trecho forte**), apoio, icone
 * (nome Tabler sem o "ti-") e destino (rota interna, aberta ao clicar).
 *
 * "Já visto" (localStorage 'novidades_vistas', objeto de strings):
 *  - formato antigo, que continua valendo: chave = balde (a rota do item, ou
 *    '*' se global) → id. No modelo antigo só a mais nova de cada balde
 *    aparecia, então "dispensei o id N" queria dizer "nada até N nesse balde";
 *    é assim que ele continua sendo lido.
 *  - entradas novas: chave '#<id>' → id. Cada cartão da pilha é dispensado
 *    sozinho, sem esconder os outros do mesmo balde.
 */
export const ROTULO_PADRAO = 'NOVIDADE NA SUA ÁREA';
export const ICONE_PADRAO = 'sparkles';
const GLOBAL = '*';

export const balde = n => n?.rota ?? GLOBAL;

/** rota null/ausente → toda tela; senão igualdade ou prefixo seguido de '/'. */
export function valeAqui(n, pathname) {
  if (n?.rota == null) return true;
  const p = String(pathname ?? '');
  return p === n.rota || p.startsWith(n.rota + '/');
}

/** O item foi dispensado (formato antigo por balde ou entrada nova por id)? */
export function dispensada(n, vistas) {
  const v = vistas && typeof vistas === 'object' && !Array.isArray(vistas) ? vistas : {};
  if (v['#' + n.id] != null) return true;
  const ate = Number(v[balde(n)]);
  return Number.isFinite(ate) && Number(n.id) <= ate;
}

/** Valor a gravar em 'novidades_vistas' ao dispensar este item. */
export function marcarDispensada(vistas, n) {
  const v = vistas && typeof vistas === 'object' && !Array.isArray(vistas) ? vistas : {};
  return { ...v, ['#' + n.id]: String(n.id) };
}

/** Itens a mostrar: valem nesta rota, não dispensados, do mais novo ao mais antigo, no máximo `max`. */
export function selecionarNovidades({ itens, rotaAtual, vistas, max = 3 } = {}) {
  return (Array.isArray(itens) ? itens : [])
    .filter(n => n && Number.isFinite(Number(n.id)) && valeAqui(n, rotaAtual) && !dispensada(n, vistas))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, Math.max(0, max));
}

/**
 * Convite "Ative as notificações": só com suporte, permissão que não seja
 * 'denied', SEM inscrição ativa neste aparelho e fora da soneca.
 * (Permissão 'granted' com inscrição = já ativado → falso pelo temInscricao.)
 */
export function mostrarConviteNotificacoes({ suportado, permissao, temInscricao, sonecaAte, agora } = {}) {
  if (!suportado) return false;
  if (permissao === 'denied') return false;
  if (temInscricao !== false) return false;          // true ou ainda desconhecido
  const ate = Number(sonecaAte) || 0;
  const t = agora instanceof Date ? agora.getTime() : Number(agora);
  return Number.isFinite(t) && t > ate;
}

/** "Novo: **Panorama** da paciente" → [{texto, forte}]. Sem HTML; marcador sem par vira texto. */
export function partesDoTitulo(titulo) {
  if (titulo == null || titulo === '') return [];
  const s = String(titulo);
  const pedacos = s.split('**');
  // Número par de pedaços = um '**' sem par: o último fica como texto normal.
  const semPar = pedacos.length % 2 === 0;
  const partes = [];
  pedacos.forEach((p, i) => {
    let forte = i % 2 === 1;
    let texto = p;
    if (semPar && i === pedacos.length - 1) { forte = false; texto = '**' + p; }
    if (!texto) return;
    const ult = partes[partes.length - 1];
    if (ult && ult.forte === forte) ult.texto += texto; else partes.push({ texto, forte });
  });
  return partes;
}
