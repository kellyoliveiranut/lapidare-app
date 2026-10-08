/* ============================================================
   HORÁRIOS DO PACOTE DE 6 — o select de cada linha só oferece livre

   Pedido 9, 2026-10-08. Cada uma das seis linhas do pacote tem data e hora
   próprias, e elas não podem bater nem com a agenda nem ENTRE SI. Função
   pura, sem supabase nem React: quem chama traz a ocupação de cada dia.

   A geometria de conflito é a de horariosLivres (agendaConflitos.js) — aqui
   só se decide O QUE conta como ocupado para cada linha.
   ============================================================ */

import { horariosLivres, opcoesHorario } from './agendaConflitos.js';
import { montarDataHoraISO } from './utils.js';

/**
 * Entrada:
 *   linhas          [{ data, hora }] na ordem da tela; data pode ser vazia
 *   duracao         minutos, a mesma para as seis
 *   ocupacaoPorData { 'YYYY-MM-DD': { consultas, bloqueios, falhou } };
 *                   data ausente = leitura ainda em andamento
 *   preferidoPadrao de onde procurar quando a linha não tem hora
 *
 * As linhas são processadas EM ORDEM. Cada uma vê como ocupado o que o banco
 * tem naquele dia E as linhas ANTERIORES do pacote no mesmo dia, já com a
 * hora EFETIVA delas (a que o select mostra e o salvar grava, não a do
 * estado). Uma linha posterior nunca muda uma anterior: sem isso, duas linhas
 * no mesmo horário se empurrariam uma à outra sem ponto fixo.
 *
 * Leitura que falhou num dia: a grade inteira menos as linhas anteriores do
 * pacote naquele dia — sem o banco, o pacote ainda não bate consigo mesmo.
 *
 * Saída, uma por linha: o resultado de opcoesHorario() mais
 *   falhou    a leitura daquele dia falhou
 *   ajustada  a hora do estado não é a efetiva (estava ocupada e a linha
 *             pulou para o próximo livre)
 */
export function horariosDoPacote({ linhas = [], duracao, ocupacaoPorData = {}, preferidoPadrao = '14:00' }) {
  // Linhas anteriores já resolvidas, como consultas "gravadas" para o
  // horariosLivres: { id, data_hora, duracao_min, status }.
  const anteriores = [];

  return (linhas ?? []).map((linha, i) => {
    const data = linha?.data || '';
    const hora = linha?.hora || null;
    const ocupacao = data ? ocupacaoPorData?.[data] : undefined;
    const carregando = !!data && !ocupacao;
    const falhou = !!ocupacao?.falhou;

    let livres = [];
    if (data && !carregando) {
      const doPacote = anteriores.filter(a => a.data === data).map(a => a.consulta);
      livres = horariosLivres({
        data,
        duracaoMin: Number(duracao),
        consultas: [...(falhou ? [] : ocupacao.consultas ?? []), ...doPacote],
        bloqueios: falhou ? [] : (ocupacao.bloqueios ?? []),
      });
    }

    const sel = opcoesHorario({
      livres, atual: null, hora,
      preferido: hora || preferidoPadrao,
      carregando, temData: !!data, escolherSozinho: true,
    });

    // Só uma linha com hora efetiva ocupa as seguintes. Sem data, carregando
    // ou sem horário livre, ela não tem horário — e não tira nada de ninguém.
    if (data && sel.valor) {
      anteriores.push({
        data,
        consulta: {
          id: `pacote-${i}`,
          data_hora: montarDataHoraISO(data, sel.valor),
          duracao_min: Number(duracao),
          status: 'agendada',
        },
      });
    }

    return { ...sel, falhou, ajustada: !!hora && !!sel.valor && sel.valor !== hora };
  });
}
