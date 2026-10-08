import { useEffect, useMemo, useRef, useState } from 'react';
import { carregarOcupacaoDoDia, horariosLivres } from './agendaConflitos.js';
import { HORARIOS_CONSULTA } from './utils.js';

/**
 * Horários livres de um dia, para os selects de horário que ficam FORA do
 * ConsultaModal da Agenda (pedido 9, 2026-10-08): avulsa e "dar data" no
 * perfil da paciente. É o mesmo comportamento do ConsultaModal
 * (Agenda.jsx, "Horários livres do dia"), copiado para um hook — o modal da
 * Agenda segue com o código dele.
 *
 * A ocupação é lida do banco a cada data; a duração só recalcula a lista, sem
 * nova ida ao banco. `ocupacao.data` diz de qual dia é a resposta em mãos:
 * "carregando" é derivado disso, e não estado, e uma resposta atrasada de um
 * dia anterior é descartada pelo `vivo`.
 *
 * Leitura falhou: não bloqueia. `livres` volta a ser a grade inteira, com
 * `falhou` true para a tela avisar, e a trava do salvar (verificarAgenda)
 * segue como rede de segurança.
 *
 * `supabase` vem por parâmetro, como no agendaConflitos.js: este arquivo não
 * arrasta o cliente.
 *
 * Devolve { carregando, falhou, livres }.
 */
export function useHorariosLivres({ supabase, nutriId, data, duracao, ignorarIds = [] }) {
  const [ocupacao, setOcupacao] = useState({ data: null, consultas: [], bloqueios: [], falhou: false });

  useEffect(() => {
    if (!data) return;
    let vivo = true;
    carregarOcupacaoDoDia(supabase, { nutriId, data })
      .then(r => { if (vivo) setOcupacao({ data, ...r, falhou: false }); })
      .catch(() => { if (vivo) setOcupacao({ data, consultas: [], bloqueios: [], falhou: true }); });
    return () => { vivo = false; };
  }, [supabase, data, nutriId]);

  // Chave estável: o array chega novo a cada render de quem chama, e usá-lo
  // direto nas dependências recalcularia a lista em todo render.
  const chaveIgnorar = (ignorarIds ?? []).filter(Boolean).join(',');

  const carregando = !!data && ocupacao.data !== data;
  // Só um dia em mãos de cada vez: a resposta de outro dia não vale para este.
  const falhou = !carregando && !!data && ocupacao.falhou;

  const livres = useMemo(() => {
    if (!data || carregando) return [];
    if (ocupacao.falhou) return HORARIOS_CONSULTA;
    return horariosLivres({
      data, duracaoMin: Number(duracao),
      consultas: ocupacao.consultas, bloqueios: ocupacao.bloqueios,
      ignorarIds: chaveIgnorar ? chaveIgnorar.split(',') : [],
    });
  }, [data, duracao, ocupacao, carregando, chaveIgnorar]);

  return { carregando, falhou, livres };
}

/**
 * Ocupação de VÁRIOS dias, para o pacote de 6 (pedido 9, parte 2): cada linha
 * tem a própria data. Lê cada data distinta UMA vez, com carregarOcupacaoDoDia,
 * e guarda por data — trocar uma linha não relê as outras. Em falha, aquela
 * data fica { falhou: true, consultas: [], bloqueios: [] }; quem desenha decide
 * (horariosDoPacote cai na grade menos o próprio pacote).
 *
 * Uma data que sai da lista pode ficar no cache: voltar a ela não relê.
 * Resposta que chega depois de o componente desmontar é descartada; resposta
 * de uma data que só saiu da lista é guardada, porque continua válida.
 *
 * Devolve { ocupacaoPorData }: data ausente = ainda carregando.
 */
export function useOcupacaoDeDatas({ supabase, nutriId, datas = [] }) {
  const [ocupacaoPorData, setOcupacaoPorData] = useState({});
  // O que já tem resposta ou está a caminho. Ref, e não o estado, para o
  // efeito não depender do cache inteiro — só da lista de datas.
  const pedidas = useRef(new Set());
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // Chave estável: datas não vazias, únicas e ordenadas.
  const chave = [...new Set((datas ?? []).filter(Boolean))].sort().join(',');

  useEffect(() => {
    if (!chave) return;
    for (const data of chave.split(',')) {
      if (pedidas.current.has(data)) continue;
      pedidas.current.add(data);
      carregarOcupacaoDoDia(supabase, { nutriId, data })
        .then(r => ({ consultas: r.consultas, bloqueios: r.bloqueios, falhou: false }))
        .catch(() => ({ consultas: [], bloqueios: [], falhou: true }))
        .then(oc => {
          if (!montado.current) { pedidas.current.delete(data); return; }
          setOcupacaoPorData(prev => ({ ...prev, [data]: oc }));
        });
    }
  }, [supabase, nutriId, chave]);

  return { ocupacaoPorData };
}
