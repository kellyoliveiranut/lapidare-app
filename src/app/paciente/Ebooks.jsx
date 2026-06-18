import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { dataBR } from '../../lib/utils.js';

const TAG_LABEL = {
  receitas:    'Receitas',
  guia:        'Guia',
  protocolo:   'Protocolo',
  formulacoes: 'Formulações',
  materiais:   'Materiais',
  outro:       'Outro',
};

export default function Ebooks() {
  const { user, profile } = useSession();
  const [ebooks, setEbooks] = useState(null);
  const [erroAbrir, setErroAbrir] = useState(null);

  useEffect(() => {
    if (!user) return;
    const pacienteId = profile?.id ?? user.id;
    (async () => {
      const { data: links } = await supabase
        .from('ebooks_pacientes')
        .select('ebook_id')
        .eq('paciente_id', pacienteId);
      const ids = (links ?? []).map(l => l.ebook_id);
      if (ids.length === 0) {
        setEbooks([]);
        return;
      }
      const { data } = await supabase
        .from('ebooks')
        .select('*')
        .in('id', ids)
        .not('tag', 'in', '("manipulados","suplementacao","formulacoes")')
        .order('created_at', { ascending: false });
      setEbooks(data ?? []);
    })();
  }, [user, profile]);

  async function abrir(eb) {
    const { data } = await supabase.storage.from('ebooks')
      .createSignedUrl(eb.storage_path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener');
    } else {
      setErroAbrir('Não consegui abrir o arquivo, tente novamente');
      setTimeout(() => setErroAbrir(null), 4000);
    }
  }

  return (
    <>
      {erroAbrir && (
        <div style={{
          background: 'var(--red-bg, #fef2f2)', color: 'var(--red, #dc2626)',
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-alert-circle" aria-hidden="true" />
          {erroAbrir}
        </div>
      )}
      {ebooks === null ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
          Carregando...
        </div>
      ) : ebooks.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <i className="ti ti-book-2" style={{ fontSize: 40, color: 'var(--muted-2)' }} aria-hidden="true"></i>
          <div style={{ fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>Nenhum material ainda</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            A Dra. ainda não compartilhou materiais com você.
          </div>
        </div>
      ) : (
        <div style={{ padding: '0' }}>
          {ebooks.map(eb => (
            <button key={eb.id} onClick={() => abrir(eb)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'var(--white)',
                border: '0.5px solid var(--hair)', borderRadius: 14,
                padding: 14, marginBottom: 10,
                display: 'flex', gap: 12, alignItems: 'center',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: 'var(--bg-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className="ti ti-file-text" style={{ fontSize: 24, color: 'var(--gold-deep)' }} aria-hidden="true"></i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
                  {eb.titulo}
                </div>
                {eb.descricao && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, marginBottom: 4 }}>
                    {eb.descricao}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{TAG_LABEL[eb.tag] ?? 'Material'}</span>
                  <span>·</span>
                  <span>{dataBR(eb.created_at)}</span>
                </div>
              </div>
              <i className="ti ti-download" style={{ fontSize: 18, color: 'var(--muted)' }} aria-hidden="true"></i>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
