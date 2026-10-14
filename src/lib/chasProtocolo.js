import {
  chaveProtocolo, getProtocolo, registroPendente, marcosProvisorios,
  CHAVES_PENDENTE_PRESCRICAO, CHAVES_AGUARDANDO_CONFERENCIA,
} from './protocoloCiclo.js';

/**
 * "Chás do meu tratamento": quando o cartão aparece para a paciente, e com
 * qual conteúdo. Funções puras, sem efeito colateral; entrada ruim devolve
 * null (ou lista de erros), nunca exceção.
 *
 * O conteúdo mora em src/data/chas_protocolos.json e só entra lá depois de
 * validado pela Kelly. Este arquivo não tem texto clínico nenhum: o que a
 * paciente lê vem inteiro dos dados.
 *
 * Esquema dos dados:
 *
 *   {
 *     "meta": { "uso": "...", "versao": "1" },
 *     "base": null | BLOCO,          // parte comum a todos os protocolos
 *     "protocolos": { "<chave>": BLOCO, ... }
 *   }
 *
 *   BLOCO = {
 *     "liberado": true,              // só `true` exato libera ("true" e 1 não)
 *     "validado_por": "<texto>",
 *     "validado_em": "AAAA-MM-DD",
 *     "secoes": [ { "titulo": "<texto>", "itens": [ "<texto>", ... ] } ]
 *   }
 *
 * `<chave>` é chaveProtocolo(nome da ficha do catálogo), a mesma do slug da
 * Lâmina. O cartão só aparece com a base E o protocolo liberados.
 */

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoCheio = v => typeof v === 'string' && v.trim() !== '';
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Chave que não libera nada sozinha: prescrição a conferir (FOLFIRINOX) ou
// equivalência com a ficha a conferir (grafias de T-AC DD).
function chaveBloqueada(chave) {
  return CHAVES_PENDENTE_PRESCRICAO.has(chave) || CHAVES_AGUARDANDO_CONFERENCIA.has(chave);
}

/**
 * O protocolo da paciente, se ele pode ter cartão de chás: { chave, nome } ou
 * null. Não lê os dados de chás — serve para decidir se eles são baixados.
 *
 * Todas as condições, sem exceção:
 *   - registro do tratamento confirmado (registroPendente: só `false` exato);
 *   - ficha achada por getProtocolo (nome exato, chave igual ou alias;
 *     nunca por inclusão);
 *   - chave fora de CHAVES_PENDENTE_PRESCRICAO e CHAVES_AGUARDANDO_CONFERENCIA,
 *     tanto a do texto do cadastro quanto a da ficha (um alias de FOLFIRINOX
 *     não pode passar por ter grafia diferente);
 *   - ficha sem marcos_provisorios.
 */
export function protocoloElegivelParaChas(trat) {
  if (!ehObjeto(trat)) return null;
  if (registroPendente(trat) !== false) return null;
  if (!textoCheio(trat.protocolo)) return null;
  if (chaveBloqueada(chaveProtocolo(trat.protocolo))) return null;
  const proto = getProtocolo(trat.protocolo);
  if (!proto || !textoCheio(proto.nome)) return null;
  const chave = chaveProtocolo(proto.nome);
  if (!chave || chaveBloqueada(chave)) return null;
  if (marcosProvisorios(proto)) return null;
  return { chave, nome: proto.nome };
}

function secaoValida(s) {
  return ehObjeto(s) && textoCheio(s.titulo) &&
    Array.isArray(s.itens) && s.itens.length > 0 && s.itens.every(textoCheio);
}

function blocoLiberado(b) {
  return ehObjeto(b) && b.liberado === true &&
    textoCheio(b.validado_por) && textoCheio(b.validado_em) &&
    Array.isArray(b.secoes) && b.secoes.length > 0 && b.secoes.every(secaoValida);
}

// Cópia do que o cartão usa: quem desenha não recebe referência aos dados.
function copiaBloco(b) {
  return {
    validado_por: b.validado_por,
    validado_em: b.validado_em,
    secoes: b.secoes.map(s => ({ titulo: s.titulo, itens: [...s.itens] })),
  };
}

/**
 * Conteúdo do cartão: { base, protocolo } ou null. null sempre que faltar
 * qualquer coisa — elegibilidade, base liberada, protocolo liberado, seção
 * ou item válido, validado_por/validado_em. Não muta a entrada.
 */
export function montarChas(elegivel, dados) {
  if (!ehObjeto(elegivel) || !textoCheio(elegivel.chave)) return null;
  if (chaveBloqueada(elegivel.chave)) return null;
  if (!ehObjeto(dados) || !ehObjeto(dados.protocolos)) return null;
  if (!Object.hasOwn(dados.protocolos, elegivel.chave)) return null;
  const base = dados.base;
  const protocolo = dados.protocolos[elegivel.chave];
  if (!blocoLiberado(base) || !blocoLiberado(protocolo)) return null;
  return { base: copiaBloco(base), protocolo: copiaBloco(protocolo) };
}

function errosDoBloco(b, onde) {
  if (!ehObjeto(b)) return [`${onde}: precisa ser objeto`];
  const erros = [];
  if (typeof b.liberado !== 'boolean') erros.push(`${onde}.liberado: precisa ser true ou false`);
  if (!textoCheio(b.validado_por)) erros.push(`${onde}.validado_por: texto vazio ou ausente`);
  if (!textoCheio(b.validado_em) || !DATA_ISO.test(b.validado_em)) erros.push(`${onde}.validado_em: precisa ser AAAA-MM-DD`);
  if (!Array.isArray(b.secoes) || b.secoes.length === 0) {
    erros.push(`${onde}.secoes: lista vazia ou ausente`);
  } else {
    b.secoes.forEach((s, i) => {
      if (!secaoValida(s)) erros.push(`${onde}.secoes[${i}]: precisa de titulo e de itens (textos não vazios)`);
    });
  }
  return erros;
}

/**
 * Erros do arquivo de dados contra o catálogo (lista vazia = tudo certo).
 * `catalogo` é o objeto de protocolos_efeitos.json ({ protocolos: [...] }).
 *
 * Chave bloqueada ou de ficha com marcos_provisorios é ERRO, mesmo com
 * liberado false: liberar um desses exige tirar o bloqueio de propósito.
 */
export function validarDadosChas(dados, catalogo) {
  const fichas = Array.isArray(catalogo?.protocolos) ? catalogo.protocolos : null;
  if (!fichas) return ['catalogo: sem lista de protocolos'];
  if (!ehObjeto(dados)) return ['dados: precisa ser objeto'];

  const erros = [];
  if (!('base' in dados)) erros.push('base: ausente (use null enquanto não houver base validada)');
  else if (dados.base !== null) erros.push(...errosDoBloco(dados.base, 'base'));

  if (!ehObjeto(dados.protocolos)) {
    erros.push('protocolos: ausente ou não é objeto');
    return erros;
  }
  const porChave = new Map(fichas.map(p => [chaveProtocolo(p?.nome), p]));
  for (const [chave, bloco] of Object.entries(dados.protocolos)) {
    const ficha = porChave.get(chave);
    if (!ficha) erros.push(`protocolos.${chave}: chave não existe no catálogo`);
    if (chaveBloqueada(chave)) erros.push(`protocolos.${chave}: chave bloqueada (conferência pendente)`);
    if (ficha && marcosProvisorios(ficha)) erros.push(`protocolos.${chave}: ficha com marcos provisórios`);
    erros.push(...errosDoBloco(bloco, `protocolos.${chave}`));
  }
  return erros;
}
