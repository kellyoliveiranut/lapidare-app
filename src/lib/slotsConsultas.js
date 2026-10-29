// Posições fixas da lista de consultas no perfil da paciente. Funções puras.
//
//  - Essentia: 1ª consulta, Consulta 2 … Consulta 6, sempre nesta ordem;
//  - Avulsa:   1ª consulta e Retorno.
// A posição que ainda não existe aparece vazia (consulta: null), com o botão
// de agendar. Consultas de outro tipo (avulsa antiga, avaliação, retorno no
// Essentia, tipo desconhecido) vão para `outras`, por data.

const TIPOS_ESSENTIA = ['primeira', 'consulta_2', 'consulta_3', 'consulta_4', 'consulta_5', 'consulta_6'];
const TIPOS_AVULSA = ['primeira', 'retorno'];

export function rotuloTipo(tipo) {
  if (!tipo) return 'Consulta';
  if (tipo === 'primeira') return '1ª consulta';
  if (tipo === 'avaliacao') return 'Avaliação';
  if (tipo === 'retorno') return 'Retorno';
  if (tipo === 'avulsa') return 'Consulta avulsa';
  const m = String(tipo).match(/^consulta_(\d+)$/);
  return m ? `Consulta ${m[1]}` : String(tipo);
}

export const ehPlanoEssentia = (tipoPlano) => (tipoPlano ?? '').trim().toLowerCase() === 'essentia';

export function tiposDoPlano(tipoPlano) {
  return ehPlanoEssentia(tipoPlano) ? TIPOS_ESSENTIA : TIPOS_AVULSA;
}

// Mais antiga primeiro; sem data (a definir) vem por último.
const porData = (a, b) => {
  if (!a.data_hora && !b.data_hora) return 0;
  if (!a.data_hora) return 1;
  if (!b.data_hora) return -1;
  return a.data_hora.localeCompare(b.data_hora);
};

export function montarSlots(tipoPlano, consultas) {
  const lista = [...(consultas ?? [])].filter(c => c.status !== 'cancelada').sort(porData);
  const usadas = new Set();
  const slots = tiposDoPlano(tipoPlano).map(tipo => {
    // Se houver duas do mesmo tipo, a posição fica com a mais antiga e a outra
    // aparece em `outras`: nada é escondido.
    const c = lista.find(x => x.tipo === tipo && !usadas.has(x.id)) ?? null;
    if (c) usadas.add(c.id);
    return { tipo, rotulo: rotuloTipo(tipo), consulta: c };
  });
  const outras = lista.filter(c => !usadas.has(c.id));
  return { slots, outras };
}
