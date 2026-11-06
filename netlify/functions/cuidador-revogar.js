const { createClient } = require('@supabase/supabase-js');

// Revoga o acesso do cuidador de uma paciente da nutri que chamou.
// Desliga o vínculo (o RLS deixa de reconhecê-lo na hora) e apaga o login dele.

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const token = (event.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(401, { error: 'Token ausente.' });
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) return json(401, { error: 'Token inválido ou expirado.' });

    let body;
    try { body = JSON.parse(event.body ?? '{}'); } catch { return json(400, { error: 'Body JSON inválido.' }); }
    if (!body.paciente_id) return json(400, { error: 'paciente_id é obrigatório.' });

    const { data: pac, error: pacErr } = await supabase
      .from('pacientes')
      .select('id, cuidador_user_id')
      .eq('id', body.paciente_id)
      .eq('nutri_id', caller.id)
      .maybeSingle();
    if (pacErr) return json(500, { error: pacErr.message });
    if (!pac) return json(403, { error: 'Paciente não encontrada ou sem vínculo.' });

    const { error: updErr } = await supabase
      .from('pacientes')
      .update({
        cuidador_user_id: null, cuidador_token: null,
        cuidador_convidado_em: null, cuidador_ativado_em: null,
      })
      .eq('id', pac.id);
    if (updErr) return json(500, { error: 'Não consegui revogar o acesso.' });

    if (pac.cuidador_user_id) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(pac.cuidador_user_id);
      if (delErr) console.error('cuidador deleteUser:', delErr.message);
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error('cuidador-revogar unhandled error:', err);
    return json(500, { error: 'Erro interno.' });
  }
};
