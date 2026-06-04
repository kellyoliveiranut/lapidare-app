import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { dataBR } from '../../lib/utils.js';
import { formatarResposta } from '../../lib/checkinDefault.js';
import DateInput from '../../components/DateInput.jsx';

const TIPOS_FOTO = [
  { id: 'frente',          label: 'Frente' },
  { id: 'perfil_direito',  label: 'Perfil direito' },
  { id: 'perfil_esquerdo', label: 'Perfil esquerdo' },
  { id: 'costas',          label: 'Costas' },
  { id: 'livre',           label: 'Livre' },
];

// Cache de signed URLs (5 min)
const urlCache = new Map();
async function signedUrl(path) {
  const cached = urlCache.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data } = await supabase.storage.from('fotos_evolucao').createSignedUrl(path, 300);
  if (!data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 280_000 });
  return data.signedUrl;
}

export default function Evolucao({ pacienteId, paciente, nutriId }) {
  const [carregando, setCarregando] = useState(true);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [checkins, setCheckins] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [prescricoes, setPrescricoes] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [apresentacao, setApresentacao] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [comparar, setComparar] = useState({ a: null, b: null });
  const [verCheckin, setVerCheckin] = useState(null);

  async function carregar() {
    const [avRes, ftRes, ckRes, plRes, prRes, csRes] = await Promise.all([
      supabase.from('peso_registros').select('id,data,kg,altura_cm,pgc,mm_kg,mm_pct,gordura_kg,cintura_cm,quadril_cm,abdome_cm,braco_cm,braco_dir_cm,braco_esq_cm,coxa_cm,coxa_dir_cm,coxa_esq_cm,panturrilha_cm,hidratacao_pct,geb_kcal,get_kcal,obs').eq('paciente_id', pacienteId).order('data'),
      supabase.from('fotos_evolucao').select('id,storage_path,data_foto,tipo').eq('paciente_id', pacienteId).order('data_foto'),
      supabase.from('checkin_envios').select('id, perguntas, respostas, respondido_em, enviado_em').eq('paciente_id', pacienteId).not('respondido_em', 'is', null).order('respondido_em'),
      supabase.from('planos').select('id, dados, publicado_em').eq('paciente_id', pacienteId).order('publicado_em'),
      supabase.from('prescricoes').select('id, tipo, titulo, created_at').eq('paciente_id', pacienteId).order('created_at'),
      supabase.from('consultas').select('id, tipo, data_hora, status').eq('paciente_id', pacienteId).order('data_hora'),
    ]);
    setAvaliacoes(avRes.data ?? []);
    setFotos(ftRes.data ?? []);
    setCheckins(ckRes.data ?? []);
    setPlanos(plRes.data ?? []);
    setPrescricoes(prRes.data ?? []);
    setConsultas(csRes.data ?? []);

    // pré-fetch signed URLs
    const novasUrls = {};
    for (const f of ftRes.data ?? []) {
      const u = await signedUrl(f.storage_path);
      if (u) novasUrls[f.id] = u;
    }
    setUrls(novasUrls);

    // por padrão, comparativo = primeira foto vs última (frente)
    const frentes = (ftRes.data ?? []).filter(f => f.tipo === 'frente');
    const todas = ftRes.data ?? [];
    const ordem = frentes.length >= 2 ? frentes : todas;
    if (ordem.length >= 2) {
      setComparar({ a: ordem[0].id, b: ordem[ordem.length - 1].id });
    } else if (ordem.length === 1) {
      setComparar({ a: ordem[0].id, b: null });
    }

    setCarregando(false);
  }
  useEffect(() => { carregar(); }, [pacienteId]);

  async function excluirFoto(foto) {
    if (!window.confirm(`Excluir foto de ${dataBR(foto.data_foto)}? Esta ação não pode ser desfeita.`)) return;
    await supabase.storage.from('fotos_evolucao').remove([foto.storage_path]);
    await supabase.from('fotos_evolucao').delete().eq('id', foto.id);
    // se a foto excluída estava no comparativo, limpa
    setComparar(c => ({
      a: c.a === foto.id ? null : c.a,
      b: c.b === foto.id ? null : c.b,
    }));
    carregar();
  }

  // ESC pra sair do modo apresentação
  useEffect(() => {
    if (!apresentacao) return;
    const onKey = (e) => { if (e.key === 'Escape') setApresentacao(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apresentacao]);

  // ─── Highlights ───
  const primeira = avaliacoes[0];
  const ultima   = avaliacoes[avaliacoes.length - 1];
  const totalDias = primeira && ultima
    ? Math.round((new Date(ultima.data) - new Date(primeira.data)) / 86_400_000)
    : 0;

  const delta = (campo) => {
    if (!primeira || !ultima || primeira.id === ultima.id) return null;
    const a = Number(primeira[campo] ?? 0);
    const b = Number(ultima[campo] ?? 0);
    if (!a || !b) return null;
    return { de: a, para: b, dif: b - a };
  };

  const deltaPeso = delta('kg');
  const deltaCintura = delta('cintura_cm');
  const deltaPgc = delta('pgc');

  // ─── Timeline consolidada ───
  const eventos = useMemo(() => {
    const lst = [];
    for (const a of avaliacoes) {
      lst.push({
        data: new Date(a.data + 'T12:00:00').toISOString(),
        tipo: 'avaliacao', icon: 'scale', cor: '#1a5a8c',
        titulo: 'Avaliação antropométrica',
        desc: [
          a.kg && `${Number(a.kg).toFixed(1).replace('.', ',')} kg`,
          a.cintura_cm && `cintura ${a.cintura_cm}cm`,
          a.pgc && `${a.pgc}% gordura`,
        ].filter(Boolean).join(' · ') || 'Registrada',
      });
    }
    for (const f of fotos) {
      lst.push({
        data: new Date(f.data_foto + 'T12:00:00').toISOString(),
        tipo: 'foto', icon: 'camera', cor: 'var(--gold-deep, #a08456)',
        titulo: `Foto · ${TIPOS_FOTO.find(t => t.id === f.tipo)?.label ?? f.tipo}`,
        desc: f.obs ?? 'Foto de evolução enviada',
        fotoId: f.id,
      });
    }
    for (const c of checkins) {
      lst.push({
        data: c.respondido_em,
        tipo: 'checkin', icon: 'clipboard-check', cor: 'var(--green)',
        titulo: 'Check-in respondido',
        desc: `${c.perguntas?.length ?? 0} perguntas`,
        checkinId: c.id,
        checkin: c,
      });
    }
    for (const p of planos) {
      lst.push({
        data: p.publicado_em,
        tipo: 'plano', icon: 'salad', cor: 'var(--amber)',
        titulo: 'Plano alimentar publicado',
        desc: `${p.dados?.macros?.kcal ?? '—'} kcal · ${p.dados?.refeicoes?.length ?? 0} refeições`,
      });
    }
    for (const p of prescricoes) {
      lst.push({
        data: p.created_at,
        tipo: 'prescricao', icon: 'file-text', cor: 'var(--blue)',
        titulo: `Prescrição · ${p.tipo}`,
        desc: p.titulo,
      });
    }
    for (const c of consultas.filter(c => c.status === 'realizada')) {
      lst.push({
        data: c.data_hora,
        tipo: 'consulta', icon: 'calendar-check', cor: 'var(--green)',
        titulo: 'Consulta realizada',
        desc: `Tipo: ${c.tipo}`,
      });
    }
    return lst.sort((a, b) => b.data.localeCompare(a.data));  // mais recente primeiro
  }, [avaliacoes, fotos, checkins, planos, prescricoes, consultas]);

  // ─── Renders auxiliares ───
  function HighlightCard({ titulo, atual, delta, unidade, melhorMenor = true }) {
    if (!atual) {
      return (
        <div className="stat-card" style={{ opacity: .5 }}>
          <div className="stat-label">{titulo}</div>
          <div className="stat-val">—</div>
          <div className="stat-sub">sem registro</div>
        </div>
      );
    }
    let corDelta = 'var(--text3)';
    let setaDelta = '';
    if (delta) {
      const desejado = melhorMenor ? delta.dif < 0 : delta.dif > 0;
      corDelta = desejado ? 'var(--green)' : (delta.dif === 0 ? 'var(--text3)' : 'var(--red)');
      setaDelta = delta.dif > 0 ? '↑' : delta.dif < 0 ? '↓' : '—';
    }
    return (
      <div className="stat-card">
        <div className="stat-label">{titulo}</div>
        <div className="stat-val">{Number(atual).toFixed(1).replace('.', ',')}{unidade && <span style={{ fontSize: 14, color: 'var(--text3)', marginLeft: 3 }}>{unidade}</span>}</div>
        <div className="stat-sub" style={{ color: corDelta, fontWeight: 500 }}>
          {delta
            ? <>{setaDelta} {Math.abs(delta.dif).toFixed(1).replace('.', ',')}{unidade} vs início</>
            : 'só uma avaliação'}
        </div>
      </div>
    );
  }

  if (carregando) {
    return <div className="card empty-card"><div className="empty-sub">Carregando linha do tempo…</div></div>;
  }

  if (eventos.length === 0) {
    return (
      <div className="card empty-card">
        <i className="ti ti-history empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Sem registros de evolução ainda</div>
        <div className="empty-sub">
          Conforme você registrar avaliações antropométricas, enviar fotos e a paciente responder check-ins,
          tudo vai aparecer aqui em ordem cronológica.
        </div>
      </div>
    );
  }

  const fotoA = fotos.find(f => f.id === comparar.a);
  const fotoB = fotos.find(f => f.id === comparar.b);

  // ─── Modo apresentação ───
  if (apresentacao) {
    return (
      <ModoApresentacao
        paciente={paciente}
        avaliacoes={avaliacoes}
        deltaPeso={deltaPeso}
        deltaCintura={deltaCintura}
        deltaPgc={deltaPgc}
        totalDias={totalDias}
        fotoA={fotoA} fotoB={fotoB}
        urls={urls}
        onClose={() => setApresentacao(false)}
      />
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          {totalDias > 0 && <>Acompanhamento de <strong style={{ color: 'var(--dark)' }}>{totalDias} dia{totalDias === 1 ? '' : 's'}</strong> · </>}
          {eventos.length} evento{eventos.length === 1 ? '' : 's'} no histórico
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-camera-plus" aria-hidden="true"></i> Adicionar foto
          </button>
          <button className="btn" onClick={() => setApresentacao(true)}>
            <i className="ti ti-presentation" aria-hidden="true"></i> Modo apresentação
          </button>
        </div>
      </div>

      {/* Highlights */}
      <div className="stats-grid">
        <HighlightCard titulo="Peso atual"      atual={ultima?.kg}         delta={deltaPeso}     unidade=" kg" />
        <HighlightCard titulo="Cintura atual"   atual={ultima?.cintura_cm} delta={deltaCintura}  unidade=" cm" />
        <HighlightCard titulo="% gordura atual" atual={ultima?.pgc}        delta={deltaPgc}      unidade="%" />
        <div className="stat-card">
          <div className="stat-label">Adesão check-ins</div>
          <div className="stat-val">{checkins.length}</div>
          <div className="stat-sub">respondidos no total</div>
        </div>
      </div>

      {/* Comparativo de fotos */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Comparativo · antes e depois</div>
        {fotos.length >= 2 && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            Escolha quais comparar nos seletores
          </span>
        )}
      </div>
      {fotos.length === 0 ? (
        <div className="card empty-card">
          <i className="ti ti-camera empty-icon" aria-hidden="true"></i>
          <div className="empty-title">Sem fotos ainda</div>
          <div className="empty-sub">Adicione a primeira foto pra começar o histórico visual.</div>
          <button className="btn" onClick={() => setUploadOpen(true)}>
            <i className="ti ti-camera-plus" aria-hidden="true"></i> Adicionar foto
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'a', foto: fotoA, label: 'Antes' },
              { key: 'b', foto: fotoB, label: 'Depois' },
            ].map(({ key, foto, label }) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontWeight: 500, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                  {label}
                </div>
                <select value={comparar[key] ?? ''} onChange={e => setComparar(c => ({ ...c, [key]: e.target.value || null }))}
                  style={{ marginBottom: 8 }}>
                  <option value="">— Selecionar —</option>
                  {fotos.map(f => (
                    <option key={f.id} value={f.id}>
                      {dataBR(f.data_foto)} · {TIPOS_FOTO.find(t => t.id === f.tipo)?.label ?? f.tipo}
                    </option>
                  ))}
                </select>
                <div style={{
                  background: 'var(--bg2)', borderRadius: 8,
                  aspectRatio: '3/4', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                }}>
                  {foto && urls[foto.id] ? (
                    <img src={urls[foto.id]} alt={label}
                      loading="lazy" decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="ti ti-photo" style={{ fontSize: 36, color: 'var(--text3)' }} aria-hidden="true"></i>
                  )}
                  {foto && (
                    <button
                      onClick={() => excluirFoto(foto)}
                      title="Excluir foto"
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'rgba(0,0,0,.7)', color: 'white',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, padding: 0,
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                  )}
                </div>
                {foto && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
                    {dataBR(foto.data_foto)}
                    {foto.obs && <> · <em>"{foto.obs}"</em></>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mini galeria de todas as fotos */}
          {fotos.length > 0 && (
            <>
              <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginTop: 16, marginBottom: 8, fontWeight: 500 }}>
                Todas as fotos ({fotos.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                {fotos.map(f => (
                  <div key={f.id}
                    onClick={() => {
                      // se já é A ou B, ignora; senão substitui o B (mais recente)
                      if (comparar.a === f.id || comparar.b === f.id) return;
                      setComparar(c => ({ ...c, b: f.id }));
                    }}
                    style={{
                      aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                      background: 'var(--bg2)', cursor: 'pointer',
                      position: 'relative',
                      outline: (comparar.a === f.id || comparar.b === f.id) ? '2px solid var(--amber)' : 'none',
                    }}>
                    {urls[f.id] && (
                      <img src={urls[f.id]} alt=""
                        loading="lazy" decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); excluirFoto(f); }}
                      title="Excluir foto"
                      style={{
                        position: 'absolute', top: 3, right: 3,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'rgba(0,0,0,.65)', color: 'white',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, padding: 0,
                      }}>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                    </button>
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,.55)', color: 'white',
                      fontSize: 8, padding: '2px 4px', textAlign: 'center',
                    }}>
                      {dataBR(f.data_foto)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-title">Linha do tempo</div>
        <span className="card-sub">mais recente primeiro</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 28, marginTop: 8 }}>
        {/* Linha vertical */}
        <div style={{
          position: 'absolute', left: 11, top: 0, bottom: 0,
          width: 2, background: 'var(--border)',
        }} />
        {eventos.map((ev, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            {/* Ponto */}
            <div style={{
              position: 'absolute', left: -22, top: 14,
              width: 16, height: 16, borderRadius: '50%',
              background: ev.cor,
              border: '2px solid var(--white)',
              boxShadow: '0 0 0 1px var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className={`ti ti-${ev.icon}`} style={{ fontSize: 9, color: 'var(--white)' }} aria-hidden="true"></i>
            </div>
            {/* Card do evento */}
            <div
              className="card"
              style={{
                padding: '12px 14px', marginBottom: 0,
                cursor: ev.checkinId ? 'pointer' : 'default',
              }}
              onClick={() => ev.checkinId && setVerCheckin(ev.checkin)}>
              <div style={{
                fontSize: 10, color: ev.cor, letterSpacing: '.5px',
                textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
              }}>
                {dataBR(ev.data)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)' }}>{ev.titulo}</div>
              {ev.desc && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{ev.desc}</div>
              )}
              {ev.checkinId && (
                <div style={{ fontSize: 10, color: 'var(--gold-deep, #a08456)', marginTop: 4 }}>
                  toque para ver respostas →
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {uploadOpen && (
        <UploadFoto
          pacienteId={pacienteId}
          nutriId={nutriId}
          onClose={() => setUploadOpen(false)}
          onSaved={async () => { setUploadOpen(false); await carregar(); }}
        />
      )}

      {verCheckin && (
        <VerCheckinModal envio={verCheckin} onClose={() => setVerCheckin(null)} />
      )}
    </>
  );
}

/* ============================================================
   UPLOAD DE FOTO
   ============================================================ */
function UploadFoto({ pacienteId, nutriId, onClose, onSaved }) {
  const [tipo, setTipo] = useState('frente');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rot, setRot] = useState(0);        // 0/90/180/270
  const [flip, setFlip] = useState(false);  // espelhamento horizontal
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  function escolherArquivo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    setPreview(URL.createObjectURL(f));
    setRot(0);
    setFlip(false);
  }

  // Aplica rotação + flip no arquivo via canvas. Retorna um Blob.
  async function transformarArquivo() {
    if (rot === 0 && !flip) return arquivo;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const swap = rot === 90 || rot === 270;
        const w = swap ? img.height : img.width;
        const h = swap ? img.width  : img.height;
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.translate(w / 2, h / 2);
        ctx.rotate((rot * Math.PI) / 180);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas falhou')),
          arquivo.type || 'image/jpeg', 0.92);
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  async function enviar() {
    setErro(null);
    if (!arquivo) return setErro('Selecione uma foto.');
    setBusy(true);
    let blob;
    try {
      blob = await transformarArquivo();
    } catch (e) {
      setBusy(false);
      return setErro('Erro ao processar: ' + e.message);
    }
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${pacienteId}/${Date.now()}-${tipo}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('fotos_evolucao').upload(path, blob, { contentType: arquivo.type });
    if (upErr) {
      setBusy(false);
      return setErro('Upload falhou: ' + upErr.message);
    }
    const { error: insErr } = await supabase.from('fotos_evolucao').insert({
      paciente_id: pacienteId,
      nutri_id: nutriId,
      storage_path: path,
      tipo, data_foto: data,
      obs: obs.trim() || null,
    });
    setBusy(false);
    if (insErr) {
      await supabase.storage.from('fotos_evolucao').remove([path]);
      return setErro('Erro: ' + insErr.message);
    }
    onSaved();
  }

  const swap = rot === 90 || rot === 270;
  const transform = `${flip ? 'scaleX(-1) ' : ''}rotate(${rot}deg)`;

  return (
    <ModalShell title="Adicionar foto de evolução"
      subtitle="A foto fica privada — só você e a paciente veem"
      onClose={onClose}>
      <label className="form-lbl">Foto</label>
      <input type="file" accept="image/*" capture="environment" onChange={escolherArquivo}
        style={{ padding: 6 }} />
      {preview && (
        <>
          <div style={{
            marginTop: 8, borderRadius: 8, overflow: 'hidden',
            background: '#000',
            height: 320,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={preview} alt="prévia"
              loading="lazy" decoding="async"
              style={{
                maxWidth: swap ? '320px' : '100%',
                maxHeight: swap ? '100%' : '320px',
                objectFit: 'contain',
                transform,
                transition: 'transform .18s ease',
              }} />
          </div>
          <div style={{
            display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            <button type="button" className="btn-outline"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setRot(r => (r + 270) % 360)}>
              <i className="ti ti-rotate-2" aria-hidden="true"></i> Girar esquerda
            </button>
            <button type="button" className="btn-outline"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setRot(r => (r + 90) % 360)}>
              <i className="ti ti-rotate-clockwise-2" aria-hidden="true"></i> Girar direita
            </button>
            <button type="button" className="btn-outline"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setFlip(f => !f)}>
              <i className="ti ti-flip-horizontal" aria-hidden="true"></i> Espelhar
            </button>
            {(rot !== 0 || flip) && (
              <button type="button" className="btn-outline"
                style={{ fontSize: 11, padding: '4px 10px', color: 'var(--text3)' }}
                onClick={() => { setRot(0); setFlip(false); }}>
                <i className="ti ti-refresh" aria-hidden="true"></i> Resetar
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="form-lbl">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS_FOTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-lbl">Data da foto</label>
          <DateInput value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <label className="form-lbl">Observação (opcional)</label>
      <input value={obs} onChange={e => setObs(e.target.value)}
        placeholder="Ex: 30 dias de acompanhamento" />

      {erro && (
        <div style={{
          background: 'var(--red-bg)', color: 'var(--red)',
          padding: '6px 10px', borderRadius: 6, fontSize: 11, marginTop: 10,
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={enviar} disabled={busy || !arquivo}>
          <i className="ti ti-check" aria-hidden="true"></i> {busy ? 'Enviando...' : 'Salvar foto'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   MODO APRESENTAÇÃO (fullscreen pra consulta)
   ============================================================ */
function ModoApresentacao({ paciente, avaliacoes, deltaPeso, deltaCintura, deltaPgc, totalDias, fotoA, fotoB, urls, onClose }) {
  const primeira = avaliacoes[0];
  const ultima   = avaliacoes[avaliacoes.length - 1];
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      zIndex: 200,
      overflow: 'auto',
      padding: '40px 32px',
    }}>
      <button onClick={onClose} style={{
        position: 'fixed', top: 20, right: 20,
        background: 'var(--dark)', color: 'var(--white)',
        border: 'none', borderRadius: 8, padding: '8px 14px',
        cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        zIndex: 201,
      }}>
        <i className="ti ti-x" aria-hidden="true"></i> Sair (ESC)
      </button>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase',
          color: 'var(--gold-deep, #a08456)', marginBottom: 8,
        }}>
          Evolução
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 500,
          color: 'var(--dark)', marginBottom: 4, lineHeight: 1.1,
        }}>
          {paciente?.nome}
        </h1>
        {totalDias > 0 && (
          <div style={{ fontSize: 16, color: 'var(--text2)', marginBottom: 32 }}>
            {totalDias} dias de acompanhamento
          </div>
        )}

        {/* Stats grandes */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14, marginBottom: 36,
        }}>
          {[
            { label: 'Peso',      atual: ultima?.kg,         delta: deltaPeso,    un: 'kg', melhorMenor: true },
            { label: 'Cintura',   atual: ultima?.cintura_cm, delta: deltaCintura, un: 'cm', melhorMenor: true },
            { label: '% gordura', atual: ultima?.pgc,        delta: deltaPgc,     un: '%', melhorMenor: true },
          ].map((s, i) => {
            if (!s.atual) return null;
            const corDelta = s.delta
              ? (s.melhorMenor ? s.delta.dif < 0 : s.delta.dif > 0) ? 'var(--green)' : 'var(--red)'
              : 'var(--text3)';
            return (
              <div key={i} style={{
                background: 'var(--white)', border: '0.5px solid var(--border)',
                borderRadius: 14, padding: '24px 28px',
              }}>
                <div style={{
                  fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                  color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
                }}>{s.label}</div>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontSize: 56, fontWeight: 600,
                  color: 'var(--dark)', lineHeight: 1,
                }}>
                  {Number(s.atual).toFixed(1).replace('.', ',')}
                  <span style={{ fontSize: 22, color: 'var(--text3)', marginLeft: 6 }}>{s.un}</span>
                </div>
                {s.delta && (
                  <div style={{
                    fontSize: 18, fontWeight: 500, color: corDelta,
                    marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {s.delta.dif > 0 ? '↑' : s.delta.dif < 0 ? '↓' : '—'}{' '}
                    {Math.abs(s.delta.dif).toFixed(1).replace('.', ',')}{s.un}
                    <span style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 6, fontWeight: 400 }}>
                      desde {dataBR(primeira?.data)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Fotos antes/depois grandes */}
        {(fotoA || fotoB) && (
          <>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500,
              color: 'var(--dark)', marginBottom: 18,
            }}>
              Antes e depois
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
              {[{ foto: fotoA, label: 'Antes' }, { foto: fotoB, label: 'Depois' }].map((x, i) => (
                <div key={i}>
                  <div style={{
                    fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                    color: 'var(--text3)', marginBottom: 10, fontWeight: 500,
                  }}>{x.label}</div>
                  <div style={{
                    background: 'var(--bg2)', borderRadius: 14,
                    aspectRatio: '3/4', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {x.foto && urls[x.foto.id] ? (
                      <img src={urls[x.foto.id]} alt={x.label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ color: 'var(--text3)', fontSize: 14 }}>Sem foto</span>
                    )}
                  </div>
                  {x.foto && (
                    <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 10, textAlign: 'center' }}>
                      {dataBR(x.foto.data_foto)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {avaliacoes.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            Sem avaliações antropométricas registradas ainda.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MODAL DE VER RESPOSTAS DO CHECK-IN
   ============================================================ */
function VerCheckinModal({ envio, onClose }) {
  const respostas = envio.respostas ?? {};
  return (
    <ModalShell title="Respostas do check-in"
      subtitle={`Respondido em ${dataBR(envio.respondido_em)}`}
      onClose={onClose} large>
      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12 }}>
        {envio.perguntas?.map(p => (
          <div key={p.id} style={{
            padding: '10px 0',
            borderBottom: '0.5px solid #e3dcce',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {p.secao}
            </div>
            <div style={{ fontSize: 13, color: 'var(--dark)', fontWeight: 500, marginBottom: 4 }}>
              {p.pergunta}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft, #4a3828)', background: 'var(--white)', padding: '8px 10px', borderRadius: 6 }}>
              {formatarResposta(p, respostas[p.id])}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, children, onClose, large }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: large ? 600 : 460, maxWidth: '92vw',
        maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}
