/* ============================================================
   STATUS DOS CANAIS REALTIME

   Sem callback no .subscribe(), um canal que falha ao assinar fica
   mudo sem erro nenhum na tela nem no console. Isto só avisa: não
   tenta reassinar e não muda o comportamento do canal.

   Não pega tabela fora da publicação supabase_realtime: nesse caso o
   servidor aceita o join (SUBSCRIBED) e simplesmente não manda evento.
   CLOSED é ignorado porque dispara em todo removeChannel do cleanup.
   ============================================================ */

export function avisarStatus(nome) {
  return (status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(`[realtime] ${nome}: ${status}`, err ?? '');
    }
  };
}
