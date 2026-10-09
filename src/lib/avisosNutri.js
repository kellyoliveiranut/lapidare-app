/**
 * Avisos da nutri (tabela avisos_nutri) — regra pura da lista.
 *
 * Quem grava é o banco (trigger no aceite do contrato); quem marca como visto
 * é a função marcar_avisos_vistos. O cliente só lê, e esta função só arruma o
 * que foi lido: rótulo, link e ordem. Sem banco, para poder ser testada.
 */

// A página Avisos dispara este evento depois de marcar como visto, e o
// NutriLayout reconta o número do menu pelo banco. É o caminho garantido; o
// Realtime é o atalho. Mora aqui, e não na página, para o layout não puxar a
// página (lazy) para o bundle dele.
export const EVENTO_AVISOS_MUDOU = 'avisos-nutri:mudou';

// O NutriLayout dispara este depois de zerar as fotos novas ao abrir o Feed, e
// o Feed recarrega a lista: clicar de novo em "Feed de pratos" estando nele não
// remonta a página. Mora aqui pelo mesmo motivo do evento acima. O `detail.desde`
// (Date.now() de quando o layout pediu para zerar) deixa o Feed ignorar o
// evento se já começou uma carga depois disso.
export const EVENTO_FEED_RECARREGAR = 'feed-nutri:recarregar';

// Mesmo molde, do lado da paciente: o Ebooks.jsx dispara depois de gravar o
// visto_em com sucesso, e o PacienteLayout reconta o número do menu de E-books
// (o canal Realtime de ebooks_pacientes não basta para zerar sem recarregar).
export const EVENTO_EBOOKS_VISTOS = 'ebooks-paciente:vistos';

export const ROTULO_AVISO = {
  contrato_assinado: 'Assinou o contrato',
  foto_prato:        'Enviou foto do prato',
};

// Por aba. A consulta já pede só isso; acima disso a lista mostra os mais
// recentes, e "Marcar todos como vistos" continua valendo para todos (a função
// do banco não depende do que está na tela).
export const LIMITE_AVISOS = 100;

/** Link da linha: ficha da paciente para contrato, feed para foto. */
export function linkDoAviso(aviso) {
  if (aviso?.tipo === 'contrato_assinado' && aviso.paciente_id) {
    return { to: `/nutri/pacientes/${aviso.paciente_id}`, texto: 'Abrir ficha' };
  }
  if (aviso?.tipo === 'foto_prato') {
    return { to: '/nutri/feed', texto: 'Ver no feed' };
  }
  return null;
}

/**
 * Linhas do banco + nomes das pacientes → linhas da tela, mais recentes
 * primeiro, no máximo LIMITE_AVISOS.
 *
 * @param linhas [{ id, paciente_id, tipo, criado_em, visto_em }]
 * @param nomes  { [paciente_id]: nome }
 */
export function montarAvisos(linhas, nomes = {}) {
  return [...(linhas ?? [])]
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0))
    .slice(0, LIMITE_AVISOS)
    .map(a => ({
      id:        a.id,
      paciente:  nomes[a.paciente_id] ?? '—',
      rotulo:    ROTULO_AVISO[a.tipo] ?? '—',
      link:      linkDoAviso(a),
      criado_em: a.criado_em,
      visto:     a.visto_em != null,
    }));
}
