import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { gravar } from '../../lib/gravar.js';
import { comprimirImagem } from '../../lib/imagem.js';
import { iniciais } from '../../lib/utils.js';
import { avisar as avisarJanela, confirmar as confirmarJanela } from '../../lib/dialogos.js';

/* Foto da paciente no topo do perfil: a nutri envia, troca e remove.
   Mesmo bucket e mesma coluna que o app da paciente usa (avatares_pacientes /
   pacientes.avatar_url), pasta = id da ficha. A foto é reduzida para 600 px
   antes de subir — é só um avatar. Sem a migration 2026-11-26 o envio é negado
   e a tela avisa. */
export default function FotoPaciente({ paciente, onMudou, podeEditar = true }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function enviar(e) {
    const arquivo = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) { avisarJanela('Escolha um arquivo de imagem (JPG, PNG…).'); return; }
    setBusy(true);
    try {
      const blob = await comprimirImagem(arquivo, { maxLado: 600, quality: 0.85 });
      const path = `${paciente.id}/avatar.jpg`;
      const up = await supabase.storage.from('avatares_pacientes')
        .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
      if (up.error) { avisarJanela('Não consegui enviar a foto. Se o erro continuar, falta rodar o SQL de permissão da foto.'); return; }
      const { data } = supabase.storage.from('avatares_pacientes').getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      const r = await gravar(supabase.from('pacientes').update({ avatar_url: url }).eq('id', paciente.id),
        { rotulo: 'salvar a foto da paciente' });
      if (!r.ok) { avisarJanela(r.msg); return; }
      onMudou(url);
    } finally {
      setBusy(false);
    }
  }

  async function remover() {
    if (!(await confirmarJanela('Remover a foto desta paciente?'))) return;
    setBusy(true);
    const r = await gravar(supabase.from('pacientes').update({ avatar_url: null }).eq('id', paciente.id),
      { rotulo: 'remover a foto da paciente' });
    if (!r.ok) { setBusy(false); avisarJanela(r.msg); return; }
    supabase.storage.from('avatares_pacientes').remove([`${paciente.id}/avatar.jpg`]).catch(() => {});
    setBusy(false);
    onMudou(null);
  }

  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', overflow: 'hidden',
        background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 600, color: 'var(--dark)', opacity: busy ? 0.5 : 1,
      }}>
        {paciente.avatar_url
          ? <img src={paciente.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : iniciais(paciente.nome)}
      </div>
      {podeEditar && (
        <>
          <input ref={inputRef} type="file" accept="image/*" onChange={enviar} style={{ display: 'none' }} />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
            title={paciente.avatar_url ? 'Trocar a foto' : 'Adicionar foto'}
            aria-label={paciente.avatar_url ? 'Trocar a foto da paciente' : 'Adicionar foto da paciente'}
            style={{
              position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: '50%',
              border: '1.5px solid var(--white)', background: 'var(--dark)', color: 'var(--white)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
            }}>
            <i className="ti ti-camera" style={{ fontSize: 13 }} aria-hidden="true" />
          </button>
          {paciente.avatar_url && (
            <button type="button" disabled={busy} onClick={remover} title="Remover a foto" aria-label="Remover a foto da paciente"
              style={{
                position: 'absolute', left: -4, bottom: -4, width: 20, height: 20, borderRadius: '50%',
                border: '1.5px solid var(--white)', background: 'var(--white)', color: 'var(--red)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
              }}>
              <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
