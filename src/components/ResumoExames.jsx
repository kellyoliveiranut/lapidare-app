import { useState } from 'react';
import { dataBR, dataLocalISO } from '../lib/utils.js';
import { avisoDesatualizado, resumirExame, textoValor, textoFaixa } from '../lib/examesResumo.js';

const CHAVE_PRAZO = 'exames_aviso_prazo_dias';
const PRAZOS = [30, 60, 90, 120, 180, 365];

function lerPrazo() {
  try {
    const n = Number(localStorage.getItem(CHAVE_PRAZO));
    return PRAZOS.includes(n) ? n : 90;
  } catch { return 90; }
}

/**
 * Faixa de resumo no topo da área de Exames: data do último exame, aviso de exame antigo
 * (prazo escolhido pela nutri) e quantos marcadores estão fora da referência.
 * Só descreve — não interpreta: "fora da referência", nunca "crítico".
 * `exames`: lista plana ({data_exame, ...valores}); `campos`: marcadores a avaliar.
 */
export default function ResumoExames({ exames, campos, sexo }) {
  const [prazo, setPrazo] = useState(lerPrazo);
  const ultimo = [...(exames ?? [])].sort((a, b) => String(b.data_exame).localeCompare(String(a.data_exame)))[0] ?? null;
  const aviso = avisoDesatualizado(ultimo?.data_exame, dataLocalISO(), prazo);
  const r = ultimo ? resumirExame(campos, ultimo, sexo) : null;

  function mudarPrazo(v) {
    const n = Number(v);
    setPrazo(n);
    try { localStorage.setItem(CHAVE_PRAZO, String(n)); } catch { /* sem armazenamento: vale só nesta tela */ }
  }

  return (
    <div className="card card-body" style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>
          {ultimo
            ? <>Último exame: {dataBR(ultimo.data_exame)}{aviso.dias != null && <span style={{ fontWeight: 400, opacity: 0.7 }}> · há {aviso.dias} dia{aviso.dias === 1 ? '' : 's'}</span>}</>
            : 'Nenhum exame registrado'}
        </div>
        <label style={{ fontSize: 11, opacity: 0.75 }}>
          Avisar após{' '}
          <select value={prazo} onChange={e => mudarPrazo(e.target.value)} style={{ fontSize: 11 }}>
            {PRAZOS.map(p => <option key={p} value={p}>{p} dias</option>)}
          </select>
        </label>
      </div>

      {aviso.tipo === 'sem' && (
        <div style={{ background: '#fdf1e7', color: '#b45309', borderRadius: 8, padding: '7px 10px' }}>
          Esta paciente ainda não tem exame registrado.
        </div>
      )}
      {aviso.tipo === 'antigo' && (
        <div style={{ background: '#fdf1e7', color: '#b45309', borderRadius: 8, padding: '7px 10px' }}>
          O último exame tem mais de {prazo} dias. Considere solicitar novos exames.
        </div>
      )}

      {r && r.avaliados > 0 && (
        <div>
          {r.fora.length === 0
            ? <span style={{ opacity: 0.8 }}>No último exame, os {r.avaliados} marcadores com faixa de referência estão dentro dela.</span>
            : (
              <>
                <div style={{ marginBottom: 4 }}>
                  <strong>{r.fora.length} de {r.avaliados}</strong> marcadores fora da referência no último exame:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.fora.map(f => (
                    <span key={f.campo.key} style={{ border: '0.5px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 12 }}>
                      {f.campo.curto || f.campo.label} {textoValor(f.campo, f.valor)}{f.campo.unidade ? ` ${f.campo.unidade}` : ''}
                      <span style={{ opacity: 0.6 }}> · ref. {textoFaixa(f.campo, sexo)}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
            “Fora da referência” é só a comparação com a faixa; a interpretação depende do contexto clínico.
          </div>
        </div>
      )}
    </div>
  );
}
