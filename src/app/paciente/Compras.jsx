import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

// Parseia um item string ("Frango — 800g" ou "Frango") num objeto { nome, quantidade }.
// Retorna null se for substituto ou inválido.
function parsearItem(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (/\(\s*substitui/i.test(raw)) return null;
  const partes = raw.split(/\s+[—–]\s+/);
  const nome = partes[0].replace(/\s*\([^)]*\)/g, '').trim();
  const quantidade = partes[1]?.trim() || null;
  return nome ? { nome, quantidade } : null;
}

// Normaliza a lista: parseia itens, deduplica por nome (case-insensitive).
// Aceita tanto { lista: [...] } quanto { lista_compras: [...] }.
function limparLista(compras) {
  const lista = compras?.lista ?? compras?.lista_compras;
  if (!lista) return compras;
  const novasCategorias = lista
    .map(cat => {
      const vistos = new Set();
      const itens = (cat.itens ?? [])
        .map(parsearItem)
        .filter(Boolean)
        .filter(({ nome }) => {
          const k = nome.toLowerCase();
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
      return { ...cat, itens };
    })
    .filter(cat => cat.itens.length > 0);
  return { ...compras, lista: novasCategorias };
}

export default function Compras() {
  const { user } = useSession();
  const [compras, setCompras] = useState(undefined);
  const [marcados, setMarcados] = useState({});

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) return;
      const { data } = await supabase
        .from('listas_compras')
        .select('dados, publicado_em')
        .eq('paciente_id', user.id)
        .order('publicado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setCompras(data?.dados ?? null);
    }
    load();
    return () => { active = false; };
  }, [user]);

  // Lista limpa: sem quantidades, sem substitutos, sem duplicados.
  const comprasLimpas = useMemo(() => compras ? limparLista(compras) : compras, [compras]);

  if (compras === undefined) {
    return <div className="empty-state"><div className="empty-sub">Carregando…</div></div>;
  }

  if (!compras) {
    return (
      <div className="empty-state">
        <i className="ti ti-shopping-cart empty-icon" aria-hidden="true"></i>
        <div className="empty-title">Lista não enviada ainda</div>
        <div className="empty-sub">
          Sua nutricionista enviará a lista de compras junto com o plano alimentar.
        </div>
      </div>
    );
  }

  const totalItens = comprasLimpas.lista?.reduce((a, c) => a + (c.itens?.length ?? 0), 0) ?? 0;
  const totalMarcados = Object.values(marcados).filter(Boolean).length;

  const toggle = (key) => setMarcados(m => ({ ...m, [key]: !m[key] }));

  return (
    <>
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
            Progresso
          </span>
          <span className="pill ghost">{totalMarcados}/{totalItens} itens</span>
        </div>
        <div className="bar">
          <i style={{ width: `${totalItens > 0 ? (totalMarcados / totalItens) * 100 : 0}%`, background: 'var(--green)' }}></i>
        </div>
      </div>

      {comprasLimpas.lista?.map((cat, ci) => (
        <div key={ci} className="card" style={{ padding: '12px 16px' }}>
          <div style={{
            fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
            color: 'var(--gold-deep)', fontWeight: 500, marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            {cat.emoji && <span>{cat.emoji}</span>}
            <span>{cat.categoria}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>{cat.itens?.length ?? 0} itens</span>
          </div>
          {cat.itens?.map((item, ii) => {
            const key = `${ci}-${ii}`;
            const done = !!marcados[key];
            return (
              <div key={ii} className={`compra-item ${done ? 'done' : ''}`} onClick={() => toggle(key)}>
                <button className={`check ${done ? 'done' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggle(key); }}
                  aria-label={done ? 'Desmarcar' : 'Marcar'}>
                  <i className="ti ti-check"></i>
                </button>
                <span className="compra-nome">{item.nome}</span>
                {item.quantidade && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>
                    {item.quantidade}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {totalMarcados === totalItens && totalItens > 0 && (
        <div style={{ margin: '0 16px 16px', textAlign: 'center', padding: 16, background: 'var(--green-soft)', borderRadius: 12 }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>🎉</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>Lista completa!</div>
        </div>
      )}
    </>
  );
}
