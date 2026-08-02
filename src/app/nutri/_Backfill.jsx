// TELA DESCARTÁVEL — backfill único das fotos de prato já no bucket.
//
// Comprime os originais que subiram antes de o feed passar a comprimir no
// upload. NÃO sobrescreve nada: grava o resultado num caminho novo com
// sufixo "-c" e troca o ponteiro em feed_pratos.storage_path. O original
// continua no bucket, então voltar atrás é só devolver o storage_path.
//
// Fora do menu de propósito. Rota: /nutri/_backfill
// Depois que as fotos estiverem convertidas e conferidas, este arquivo e a
// rota podem ser apagados.
import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';
import { comprimirImagem } from '../../lib/imagem.js';

const BUCKET = 'fotos_pratos';
const LIMIAR_TAMANHO = 400 * 1024; // acima disto é original; as comprimidas dão ~145 kB
const LIMIAR_GANHO = 0.8;          // precisa encolher pelo menos 20% para valer a troca

const kb = n => (n == null ? '—' : `${Math.round(n / 1024)} kB`);

// Mantém o nome original INTEIRO e só acrescenta o sufixo. Assim desfazer é
// tirar os 6 caracteres finais, sem precisar adivinhar a extensão de origem
// (que num iPhone pode ser .heic). O conteúdo é sempre JPEG, daí o .jpg.
//   1785678194400-almoo.jpg  →  1785678194400-almoo.jpg-c.jpg
function caminhoComprimido(path) {
  return `${path}-c.jpg`;
}

export default function Backfill() {
  const { user } = useSession();
  const [linhas, setLinhas] = useState(undefined); // resultado da simulação
  const [quantidade, setQuantidade] = useState(5);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState(null);

  // ── SIMULAR: não escreve nada. Lê os tamanhos do metadado do storage,
  // sem baixar nenhum arquivo.
  async function simular() {
    setErro(null);
    setRodando(true);
    setProgresso('Lendo o banco…');
    try {
      const { data, error } = await supabase
        .from('feed_pratos')
        .select('id, storage_path, created_at, paciente:pacientes(id, nome, nutri_id)')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw new Error('feed_pratos: ' + error.message);

      const rows = (data ?? []).filter(
        r => r.storage_path && r.paciente?.nutri_id === user.id
      );

      setProgresso('Lendo os tamanhos no storage…');
      const pastas = [...new Set(rows.map(r => r.storage_path.split('/')[0]))];
      const tamanhos = new Map();
      await Promise.all(
        pastas.map(async pasta => {
          const { data: objs, error: e } = await supabase.storage
            .from(BUCKET)
            .list(pasta, { limit: 1000 });
          if (e) return;
          for (const o of objs ?? []) {
            tamanhos.set(`${pasta}/${o.name}`, o.metadata?.size ?? null);
          }
        })
      );

      const montadas = rows.map(r => {
        const tamanho = tamanhos.get(r.storage_path) ?? null;
        let acao = 'converter';
        let motivo = '';
        if (r.storage_path.endsWith('-c.jpg')) {
          acao = 'pular'; motivo = 'já convertida';
        } else if (tamanho == null) {
          acao = 'pular'; motivo = 'arquivo não encontrado no storage';
        } else if (tamanho <= LIMIAR_TAMANHO) {
          acao = 'pular'; motivo = 'já está pequena';
        }
        return {
          id: r.id,
          path: r.storage_path,
          nome: r.paciente?.nome ?? '—',
          antes: tamanho,
          depois: null,
          acao,
          motivo,
          status: null,
        };
      });

      setLinhas(montadas);
      setProgresso(null);
    } catch (e) {
      setErro(e.message);
      setProgresso(null);
    } finally {
      setRodando(false);
    }
  }

  // ── UMA FOTO. A ordem importa: o UPDATE do ponteiro é o último passo, e é
  // o único momento em que a foto muda de identidade para o app.
  async function converterUma(linha) {
    const { data: sig, error: sigErr } = await supabase.storage
      .from(BUCKET).createSignedUrl(linha.path, 300);
    if (sigErr) return { ...linha, status: 'erro', motivo: 'URL: ' + sigErr.message };

    const resp = await fetch(sig.signedUrl);
    if (!resp.ok) return { ...linha, status: 'erro', motivo: `download HTTP ${resp.status}` };
    const original = await resp.blob();

    const comprimida = await comprimirImagem(original);

    // Guarda dupla: descarta conversão inútil e cobre o caso de
    // comprimirImagem() cair no fallback e devolver o próprio original.
    if (comprimida.size >= original.size * LIMIAR_GANHO) {
      return {
        ...linha, status: 'pulada', depois: comprimida.size,
        motivo: 'não encolheu 20%',
      };
    }

    // upsert no caminho "-c": seguro, porque esse caminho nunca guarda um
    // original — se sobrou um órfão de uma execução interrompida, é ele que
    // está sendo sobrescrito.
    const novoPath = caminhoComprimido(linha.path);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(
      novoPath, comprimida,
      { contentType: comprimida.type || 'image/jpeg', upsert: true }
    );
    if (upErr) return { ...linha, status: 'erro', motivo: 'upload: ' + upErr.message };

    const { error: updErr } = await supabase
      .from('feed_pratos').update({ storage_path: novoPath }).eq('id', linha.id);
    if (updErr) return { ...linha, status: 'erro', motivo: 'update: ' + updErr.message };

    return { ...linha, status: 'ok', depois: comprimida.size, path: novoPath };
  }

  // ── CONVERTER: uma de cada vez, atualizando a tabela conforme termina.
  async function converter() {
    if (!linhas) return;
    setErro(null);
    setRodando(true);

    const fila = linhas.filter(l => l.acao === 'converter' && l.status !== 'ok')
      .slice(0, Math.max(1, Number(quantidade) || 1));

    for (let i = 0; i < fila.length; i++) {
      setProgresso(`Convertendo ${i + 1} de ${fila.length}…`);
      let resultado;
      try {
        resultado = await converterUma(fila[i]);
      } catch (e) {
        resultado = { ...fila[i], status: 'erro', motivo: e.message };
      }
      setLinhas(ls => ls.map(l => (l.id === resultado.id ? resultado : l)));
    }

    setProgresso(null);
    setRodando(false);
  }

  const aConverter = linhas?.filter(l => l.acao === 'converter' && l.status !== 'ok') ?? [];
  const convertidas = linhas?.filter(l => l.status === 'ok') ?? [];
  const comErro = linhas?.filter(l => l.status === 'erro') ?? [];
  const totalAntes = aConverter.reduce((s, l) => s + (l.antes ?? 0), 0);

  return (
    <>
      <div className="page-title">Backfill de fotos de prato</div>
      <div className="page-sub">Tela temporária — não faz parte do painel</div>

      <div className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 14 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)' }}>
          Os arquivos originais <strong>não são apagados nem sobrescritos</strong>. A versão
          comprimida vai para um caminho novo terminado em <code>-c.jpg</code> e o
          <code> storage_path</code> passa a apontar para ela. Para desfazer, basta devolver
          o <code>storage_path</code> anterior — o original continua no bucket.
          Apagar os originais é um passo separado, feito só depois da sua conferência.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={simular} disabled={rodando}>
            <i className="ti ti-eye" aria-hidden="true"></i> Simular
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 13, color: 'var(--text3)' }}>converter</label>
            <input
              type="number" min={1} value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              style={{
                width: 70, padding: '6px 8px', fontSize: 13,
                border: '0.5px solid var(--border)', borderRadius: 6, outline: 'none',
              }} />
          </div>

          <button className="btn" onClick={converter}
            disabled={rodando || !linhas || aConverter.length === 0}>
            <i className="ti ti-player-play" aria-hidden="true"></i> Converter
          </button>

          {progresso && (
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>{progresso}</span>
          )}
        </div>

        {linhas && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
            <div>Pendentes: <strong>{aConverter.length}</strong> · {kb(totalAntes)} no total</div>
            <div>
              A pular: <strong>{linhas.filter(l => l.acao === 'pular').length}</strong>
              {' · '}Convertidas nesta sessão: <strong>{convertidas.length}</strong>
              {comErro.length > 0 && (
                <span style={{ color: 'var(--red)' }}> · Com erro: <strong>{comErro.length}</strong></span>
              )}
            </div>
          </div>
        )}

        {erro && (
          <div style={{
            marginTop: 10, fontSize: 13, color: 'var(--red)',
            background: 'var(--red-bg, #fdf0ee)', padding: '8px 10px', borderRadius: 6,
          }}>{erro}</div>
        )}
      </div>

      {linhas && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Paciente</th>
                <th style={{ padding: '8px 10px' }}>Arquivo</th>
                <th style={{ padding: '8px 10px' }}>Antes</th>
                <th style={{ padding: '8px 10px' }}>Depois</th>
                <th style={{ padding: '8px 10px' }}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px' }}>{l.nome}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>
                    {l.path.split('/').pop()}
                  </td>
                  <td style={{ padding: '7px 10px' }}>{kb(l.antes)}</td>
                  <td style={{ padding: '7px 10px' }}>{kb(l.depois)}</td>
                  <td style={{ padding: '7px 10px' }}>
                    {l.status === 'ok' ? (
                      <span style={{ color: 'var(--green, #2e7d32)' }}>
                        convertida
                        {l.antes && l.depois
                          ? ` (${Math.round((1 - l.depois / l.antes) * 100)}% menor)` : ''}
                      </span>
                    ) : l.status === 'erro' ? (
                      <span style={{ color: 'var(--red)' }}>erro — {l.motivo}</span>
                    ) : l.status === 'pulada' ? (
                      <span style={{ color: 'var(--text3)' }}>pulada — {l.motivo}</span>
                    ) : l.acao === 'pular' ? (
                      <span style={{ color: 'var(--text3)' }}>pular — {l.motivo}</span>
                    ) : (
                      <span style={{ color: 'var(--text3)' }}>pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
