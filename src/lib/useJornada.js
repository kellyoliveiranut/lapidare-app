import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { montarJornada } from './jornada.js';

// Fora de _Jornada.jsx de propósito: arquivo .jsx que exporta componente não
// pode exportar hook nem função junto (react-refresh/only-export-components),
// senão o fast refresh do Vite recarrega a página inteira.

// Mesma normalização do gate do contrato (ContratoEssentia.jsx) e do plano
// avulso (PacienteLayout.jsx): o cadastro já gravou 'Essentia' e ' essentia'.
export function ehEssentia(profile) {
  return profile?.tipo_plano?.trim().toLowerCase() === 'essentia';
}

/**
 * Carrega as três fontes e monta a jornada Essentia (lib/jornada.js).
 *
 * Qualquer query com erro derruba a jornada inteira (erro preenchido,
 * jornada null). Montar com o que veio seria mentir: sem os contratos o passo
 * some como se ela fosse Essentia antiga; sem as consultas a trilha diria
 * "nenhuma feita".
 *
 * `recarregar` refaz a carga mantendo a jornada anterior na tela até a nova
 * chegar — é o que a volta ao app chama (ver abaixo), e por isso o card não
 * pisca.
 */
export function useJornada(pacienteId, habilitado = true) {
  const [res, setRes] = useState(null);   // { pacienteId, jornada, erro }
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao(v => v + 1), []);

  useEffect(() => {
    if (!pacienteId || !habilitado) return;
    let ativo = true;
    (async () => {
      try {
        const [contratosRes, planoRes, consultasRes] = await Promise.all([
          // A paciente lê só os dela: policy contratos_essentia_paciente_select.
          supabase.from('contratos_essentia')
            .select('id, aceito_em, created_at')
            .eq('paciente_id', pacienteId),
          // nullsFirst: false — em ordem decrescente o Postgres põe nulo
          // primeiro, e um publicado_em nulo esconderia o plano de verdade.
          supabase.from('planos')
            .select('publicado_em')
            .eq('paciente_id', pacienteId)
            .order('publicado_em', { ascending: false, nullsFirst: false })
            .limit(1).maybeSingle(),
          // TODAS as consultas, canceladas inclusive: a âncora do pacote e o
          // estado 'cancelada' dependem delas. O filtro é do montarJornada.
          supabase.from('consultas')
            .select('id, tipo, status, data_hora, encerrada_em, created_at')
            .eq('paciente_id', pacienteId),
        ]);
        if (!ativo) return;
        const erro = contratosRes.error ?? planoRes.error ?? consultasRes.error ?? null;
        setRes({
          pacienteId,
          erro,
          jornada: erro ? null : montarJornada({
            consultas: consultasRes.data ?? [],
            contratos: contratosRes.data ?? [],
            planoPublicadoEm: planoRes.data?.publicado_em ?? null,
          }),
        });
      } catch (erro) {
        if (ativo) setRes({ pacienteId, erro, jornada: null });
      }
    })();
    return () => { ativo = false; };
  }, [pacienteId, habilitado, versao]);

  // Atualização: SEM realtime, de propósito. Em 2026-09-25 a publicação
  // supabase_realtime do banco tinha só `mensagens` — consultas, planos e
  // contratos_essentia estão fora dela, e um canal postgres_changes nessas
  // tabelas abriria sem erro e nunca receberia evento. Os listeners de
  // consultas que já existem no app (Início, Agenda, banner) estão mudos
  // pelo mesmo motivo; isso é pendência própria, fora desta tela.
  //
  // O que atualiza a jornada: a carga ao montar, e a volta para o app
  // (visibilitychange). É o momento em que ela reabre o PWA depois da
  // consulta, e é quando a nutri já marcou realizada, publicou o plano ou
  // criou o pacote novo. Enquanto a tela fica aberta, ela não muda sozinha.
  // Se as três tabelas entrarem na publicação um dia, os canais entram aqui.
  useEffect(() => {
    if (!pacienteId || !habilitado) return;
    const aoVoltar = () => { if (document.visibilityState === 'visible') recarregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [pacienteId, habilitado, recarregar]);

  // Derivado, não guardado: trocar de paciente ou desligar não precisa de
  // setState síncrono no efeito para "limpar" o que ficou da anterior.
  const valido = habilitado && !!pacienteId && res?.pacienteId === pacienteId;
  return {
    jornada: valido ? res.jornada : null,
    erro: valido ? res.erro : null,
    carregando: habilitado && !!pacienteId && !valido,
    recarregar,
  };
}
