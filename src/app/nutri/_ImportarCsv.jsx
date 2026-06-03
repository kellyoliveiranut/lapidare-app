import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

// Mapeamento de aliases conhecidos para nossos campos canônicos
const ALIASES = {
  nome:       ['nome', 'name', 'paciente', 'cliente', 'nome completo', 'full name'],
  email:      ['email', 'e-mail', 'mail'],
  whatsapp:   ['whatsapp', 'celular', 'telefone', 'phone', 'tel', 'fone'],
  cpf:        ['cpf'],
  nascimento: ['nascimento', 'data de nascimento', 'dt nascimento', 'data nascimento', 'birthday', 'born'],
  objetivo:   ['objetivo', 'goal', 'meta'],
  tipo_plano: ['plano', 'tipo de plano', 'tipo_plano', 'tipo plano', 'pacote'],
  modalidade: ['modalidade', 'atendimento', 'modo'],
  obs:        ['obs', 'observacao', 'observação', 'notas', 'notes'],
};

const CAMPOS = [
  { id: 'nome',       label: 'Nome',       obrig: true },
  { id: 'email',      label: 'Email',      obrig: true },
  { id: 'whatsapp',   label: 'WhatsApp',   obrig: false },
  { id: 'cpf',        label: 'CPF',        obrig: false },
  { id: 'nascimento', label: 'Nascimento', obrig: false },
  { id: 'objetivo',   label: 'Objetivo',   obrig: false },
  { id: 'tipo_plano', label: 'Tipo de plano', obrig: false },
  { id: 'modalidade', label: 'Modalidade', obrig: false },
  { id: 'obs',        label: 'Observação', obrig: false },
];

/**
 * Parser CSV simples — suporta vírgula, ponto-e-vírgula, tab.
 * Não trata todos os edge cases mas serve pra exports de Webdiet/planilhas comuns.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { header: [], rows: [] };

  // Detecta separador
  const sample = lines[0];
  const sep = sample.includes(';') ? ';' : sample.includes('\t') ? '\t' : ',';

  const parseLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQ = !inQ; continue; }
      if (c === sep && !inQ) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const header = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { header, rows };
}

function adivinharMapeamento(header) {
  const map = {};
  for (const campo of Object.keys(ALIASES)) {
    const aliases = ALIASES[campo].map(a => a.toLowerCase());
    const idx = header.findIndex(h => aliases.includes(h.trim().toLowerCase()));
    if (idx >= 0) map[campo] = idx;
  }
  return map;
}

export default function ImportarCsv({ onClose, onImported }) {
  const { user } = useSession();
  const [step, setStep] = useState('upload'); // upload | mapear | preview | salvando | feito
  const [arquivo, setArquivo] = useState(null);
  const [csv, setCsv] = useState({ header: [], rows: [] });
  const [mapa, setMapa] = useState({});  // { nome: 0, email: 1, ... }
  const [erros, setErros] = useState([]);
  const [resultado, setResultado] = useState({ ok: 0, falhas: 0, msgs: [] });

  async function escolherArquivo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    const text = await f.text();
    const parsed = parseCsv(text);
    setCsv(parsed);
    setMapa(adivinharMapeamento(parsed.header));
    setStep('mapear');
  }

  const linhasValidas = useMemo(() => {
    if (mapa.nome === undefined || mapa.email === undefined) return [];
    const out = [];
    const errs = [];
    csv.rows.forEach((row, i) => {
      const nome = (row[mapa.nome] ?? '').trim();
      const email = (row[mapa.email] ?? '').trim();
      if (!nome) { errs.push(`Linha ${i + 2}: sem nome`); return; }
      if (!email || !email.includes('@')) { errs.push(`Linha ${i + 2}: email inválido (${email || 'vazio'})`); return; }
      const obj = {
        nome, email,
        whatsapp:   mapa.whatsapp   != null ? (row[mapa.whatsapp]   ?? '').trim() || null : null,
        cpf:        mapa.cpf        != null ? (row[mapa.cpf]        ?? '').trim() || null : null,
        nascimento: mapa.nascimento != null ? parseDataBR(row[mapa.nascimento])           : null,
        objetivo:   mapa.objetivo   != null ? (row[mapa.objetivo]   ?? '').trim() || null : null,
        tipo_plano: mapa.tipo_plano != null ? (row[mapa.tipo_plano] ?? '').trim() || null : null,
        modalidade: mapa.modalidade != null ? (row[mapa.modalidade] ?? '').trim() || null : null,
        obs:        mapa.obs        != null ? (row[mapa.obs]        ?? '').trim() || null : null,
      };
      out.push(obj);
    });
    return { rows: out, errors: errs };
  }, [csv, mapa]);

  async function importar() {
    setStep('salvando');
    const { rows } = linhasValidas;
    const result = { ok: 0, falhas: 0, msgs: [] };

    for (const r of rows) {
      const { error } = await supabase.from('pacientes_pendentes').upsert({
        nutri_id: user.id,
        ...r,
      }, { onConflict: 'nutri_id,email' });
      if (error) {
        result.falhas++;
        result.msgs.push(`${r.email}: ${error.message}`);
      } else {
        result.ok++;
      }
    }
    setResultado(result);
    setStep('feito');
    if (result.ok > 0) onImported?.();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(28,23,18,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--white)', borderRadius: 12, padding: 22,
        width: 640, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto',
        border: '0.5px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginBottom: 4 }}>
          Importar pacientes
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
          Aceita CSV exportado de Webdiet, planilha Excel/Sheets, ou qualquer fonte com colunas nome + email
        </div>

        {step === 'upload' && (
          <>
            <div style={{
              border: '1.5px dashed var(--border)', borderRadius: 12,
              padding: 28, textAlign: 'center', background: 'var(--bg2)',
            }}>
              <i className="ti ti-file-upload" style={{ fontSize: 32, color: 'var(--text3)', display: 'block', marginBottom: 8 }}></i>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                Selecione um arquivo CSV
              </div>
              <input type="file" accept=".csv,.txt" onChange={escolherArquivo}
                style={{ padding: 6 }} />
            </div>

            <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
              <strong>Dica:</strong> no Webdiet, em Pacientes → ⋮ → Exportar dados, escolha CSV.
              O sistema vai detectar automaticamente as colunas. Você confere e ajusta no próximo passo.
            </div>
          </>
        )}

        {step === 'mapear' && (
          <>
            <div className="al-b" style={{ marginBottom: 14, background: 'var(--bg2)', borderLeftColor: 'var(--text3)' }}>
              <i className="ti ti-info-circle" style={{ fontSize: 16, marginTop: 1 }} aria-hidden="true"></i>
              <div>
                <div className="al-t">{csv.rows.length} linha{csv.rows.length === 1 ? '' : 's'} no arquivo</div>
                <div className="al-d">
                  Confira qual coluna do CSV corresponde a cada campo. Nome e email são obrigatórios — o resto é opcional.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              {CAMPOS.map(c => (
                <div key={c.id} style={{
                  display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 8,
                  alignItems: 'center', marginBottom: 6,
                }}>
                  <label style={{ fontSize: 12, fontWeight: 500 }}>
                    {c.label} {c.obrig && <span style={{ color: 'var(--red)' }}>*</span>}
                  </label>
                  <select
                    value={mapa[c.id] ?? ''}
                    onChange={e => setMapa(m => ({ ...m, [c.id]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    style={{ margin: 0 }}>
                    <option value="">— Não importar —</option>
                    {csv.header.map((h, i) => (
                      <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                    {mapa[c.id] != null && csv.rows[0] ? `ex: "${csv.rows[0][mapa[c.id]] ?? ''}"` : '—'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-outline" onClick={() => setStep('upload')}>← Voltar</button>
              <button className="btn"
                disabled={mapa.nome == null || mapa.email == null}
                onClick={() => setStep('preview')}>
                Conferir preview →
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="al-b" style={{ marginBottom: 14, background: 'var(--green-bg)', borderLeftColor: 'var(--green)' }}>
              <i className="ti ti-check" style={{ fontSize: 16, marginTop: 1, color: 'var(--green)' }} aria-hidden="true"></i>
              <div>
                <div className="al-t" style={{ color: 'var(--green)' }}>
                  {linhasValidas.rows.length} paciente{linhasValidas.rows.length === 1 ? '' : 's'} pronta{linhasValidas.rows.length === 1 ? '' : 's'} para importar
                </div>
                {linhasValidas.errors.length > 0 && (
                  <div className="al-d">
                    {linhasValidas.errors.length} linha{linhasValidas.errors.length === 1 ? '' : 's'} ignorada{linhasValidas.errors.length === 1 ? '' : 's'} (ver abaixo)
                  </div>
                )}
              </div>
            </div>

            <div style={{ maxHeight: 240, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 6 }}>
              <table className="table">
                <thead>
                  <tr><th>Nome</th><th>Email</th><th>Whatsapp</th><th>Objetivo</th></tr>
                </thead>
                <tbody>
                  {linhasValidas.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td>{r.nome}</td>
                      <td>{r.email}</td>
                      <td>{r.whatsapp ?? '—'}</td>
                      <td>{r.objetivo ?? '—'}</td>
                    </tr>
                  ))}
                  {linhasValidas.rows.length > 20 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
                      …mais {linhasValidas.rows.length - 20} linha{linhasValidas.rows.length - 20 === 1 ? '' : 's'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {linhasValidas.errors.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 11, color: 'var(--red)', cursor: 'pointer' }}>
                  Ver {linhasValidas.errors.length} linha{linhasValidas.errors.length === 1 ? '' : 's'} ignorada{linhasValidas.errors.length === 1 ? '' : 's'}
                </summary>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 6, maxHeight: 100, overflowY: 'auto' }}>
                  {linhasValidas.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              </details>
            )}

            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 14, lineHeight: 1.6 }}>
              <strong>O que acontece depois:</strong> as pacientes ficam em uma <strong>lista de pendentes</strong>.
              Você envia para cada uma o link de cadastro em <strong>Cadastrar paciente</strong>.
              Quando elas se cadastrarem, os dados importados (objetivo, plano, modalidade) já vêm pré-preenchidos.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn-outline" onClick={() => setStep('mapear')}>← Ajustar mapeamento</button>
              <button className="btn" onClick={importar}
                disabled={linhasValidas.rows.length === 0}>
                <i className="ti ti-check" aria-hidden="true"></i>
                Importar {linhasValidas.rows.length} paciente{linhasValidas.rows.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        {step === 'salvando' && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            Importando…
          </div>
        )}

        {step === 'feito' && (
          <>
            <div className="al-b" style={{
              background: resultado.falhas > 0 ? 'var(--orange-bg)' : 'var(--green-bg)',
              borderLeftColor: resultado.falhas > 0 ? 'var(--orange)' : 'var(--green)',
              marginBottom: 14,
            }}>
              <i className={`ti ti-${resultado.falhas > 0 ? 'alert-triangle' : 'check'}`}
                 style={{ fontSize: 16, marginTop: 1 }} aria-hidden="true"></i>
              <div>
                <div className="al-t">
                  ✓ {resultado.ok} importada{resultado.ok === 1 ? '' : 's'} com sucesso
                  {resultado.falhas > 0 && ` · ${resultado.falhas} falha${resultado.falhas === 1 ? '' : 's'}`}
                </div>
                <div className="al-d">
                  Próximo passo: envie o link de cadastro pra cada uma em <strong>Cadastrar paciente</strong> ou direto da lista de pendentes.
                </div>
              </div>
            </div>

            {resultado.msgs.length > 0 && (
              <details style={{ marginBottom: 14 }}>
                <summary style={{ fontSize: 11, color: 'var(--red)', cursor: 'pointer' }}>
                  Ver erros ({resultado.msgs.length})
                </summary>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 6 }}>
                  {resultado.msgs.map((m, i) => <div key={i}>{m}</div>)}
                </div>
              </details>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function parseDataBR(s) {
  if (!s) return null;
  const txt = String(s).trim();
  // Tenta YYYY-MM-DD direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = txt.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
