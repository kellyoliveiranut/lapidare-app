/**
 * Alerta oncológico do check-in diário (monitoramento_oncologico).
 *
 * MESMA regra da função do banco public.alerta_oncologico_checkin
 * (supabase/migrations/2026-10-12c_avisos_checkin_alerta.sql), decidida pelo
 * operador em 12/10/2026: febre, náusea >= 7, diarreia >= 7, apetite <= 2,
 * hidratação = 0 ou suplemento = 'nao'. Campo ausente ou nulo nunca dispara
 * (no SQL é o coalesce(..., false)).
 *
 * Cuidado com o JavaScript: `null <= 2` é true (null vira 0). Por isso cada
 * comparação numérica exige número de verdade antes.
 */
const numero = v => typeof v === 'number' && Number.isFinite(v);

export function alertaOncologicoCheckin(m) {
  if (!m) return false;
  return m.febre === true
    || (numero(m.nausea) && m.nausea >= 7)
    || (numero(m.diarreia) && m.diarreia >= 7)
    || (numero(m.apetite) && m.apetite <= 2)
    || m.hidratacao === 0
    || m.suplemento === 'nao';
}
