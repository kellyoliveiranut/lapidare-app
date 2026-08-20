import { useState } from 'react';
import novidades from '../data/novidades.json';

/**
 * Banner de novidades do painel da nutri.
 *
 * A fonte é o `src/data/novidades.json`, editado à mão a cada mudança que
 * valha contar. Import estático: entra no bundle, não custa requisição.
 *
 * Mostra UMA novidade — a mais recente — e some quando dispensada. Guarda no
 * localStorage o id dessa novidade, não uma lista de dispensadas: assim uma
 * entrada nova com id diferente traz o banner de volta sozinha, sem nenhum
 * controle extra. É por dispositivo, de propósito — a alternativa era uma
 * coluna em `nutris` e um update no banco a cada X clicado.
 */

const CHAVE = 'novidades_vista';

/** Maior id vence — a ordem dentro do arquivo não decide nada. */
function maisRecente() {
  if (!Array.isArray(novidades) || novidades.length === 0) return null;
  return novidades.reduce((a, b) => (b.id > a.id ? b : a));
}

/**
 * "2026-08-20" → "20/08". Recortado na mão porque `new Date('2026-08-20')` é
 * lido como UTC e, no fuso de São Paulo, voltaria para o dia 19.
 */
function fmtData(iso) {
  const [, mes, dia] = String(iso ?? '').split('-');
  return mes && dia ? `${dia}/${mes}` : '';
}

export default function BannerNovidades() {
  const novidade = maisRecente();
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem(CHAVE); } catch { return null; }
  });

  // Comparação por !==, nunca por >: se um dia um id sair fora de ordem, o
  // pior caso é o banner aparecer uma vez a mais, não sumir para sempre.
  if (!novidade || String(novidade.id) === vista) return null;

  function dispensar() {
    try { localStorage.setItem(CHAVE, String(novidade.id)); } catch { /* modo privado */ }
    setVista(String(novidade.id));
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', marginBottom: 16,
      background: 'var(--bg2)',
      border: '0.5px solid var(--border)',
      borderLeft: '2px solid var(--amber)',
      borderRadius: 10,
    }}>
      <i className="ti ti-sparkles"
        style={{ fontSize: 15, color: 'var(--amber)', marginTop: 2, flexShrink: 0 }}
        aria-hidden="true"></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          {novidade.texto}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {fmtData(novidade.data)}
        </div>
      </div>
      <button type="button" onClick={dispensar} aria-label="Dispensar novidade"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', fontSize: 15, lineHeight: 1, padding: 4,
          flexShrink: 0,
        }}>
        <i className="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  );
}
