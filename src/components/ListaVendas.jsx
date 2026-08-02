import { useState } from 'react';
import {
  brl, dataBR, statusParcela,
  labelFormaPgto, iconFormaPgto, STATUS_PARCELA_INFO,
} from '../lib/utils.js';

/**
 * Lista de vendas com as parcelas expansíveis.
 *
 * Extraída do Financeiro.jsx para ser compartilhada com a aba Financeiro do
 * perfil da paciente. Cuida só da renderização e do estado de expandir/colapsar
 * — quem chama é dono dos dados, do filtro, do estado vazio e das ações.
 *
 * @param vendas            já filtradas e ordenadas pelo chamador
 * @param parcelasPorVenda  mapa { [venda.id]: parcelas[] }
 * @param mostrarPaciente   false dentro do perfil, onde o nome é redundante
 */
export default function ListaVendas({
  vendas,
  parcelasPorVenda,
  mostrarPaciente = true,
  onEditarParcela,
  onEditarVenda,
  onExcluirVenda,
}) {
  const [expandidas, setExpandidas] = useState({});
  const toggleExpand = (id) => setExpandidas(s => ({ ...s, [id]: !s[id] }));

  return vendas.map(v => {
    const ps = parcelasPorVenda[v.id] ?? [];
    const aberta = expandidas[v.id];
    const totalPago = ps.filter(p => p.status === 'pago').reduce((a, p) => a + Number(p.valor), 0);
    const pagas = ps.filter(p => p.status === 'pago').length;
    return (
      <div key={v.id} className="card" style={{ padding: 0 }}>
        <div
          onClick={() => toggleExpand(v.id)}
          style={{
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer',
            borderBottom: aberta ? '0.5px solid #f5f0e8' : 'none',
          }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className={`ti ti-${iconFormaPgto(v.forma_pgto)}`} style={{ fontSize: 17 }} aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {mostrarPaciente ? `${v.paciente?.nome ?? 'Avulso'} · ${v.servico}` : v.servico}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {dataBR(v.data_venda)} · {labelFormaPgto(v.forma_pgto)} · {ps.length} parcela{ps.length === 1 ? '' : 's'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{brl(v.valor_total)}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {pagas}/{ps.length} · {brl(totalPago)}
            </div>
          </div>
          <i className="ti ti-chevron-right" style={{
            fontSize: 16, color: 'var(--text3)',
            transform: aberta ? 'rotate(90deg)' : 'none', transition: 'transform .2s',
          }} aria-hidden="true" />
        </div>

        {aberta && (
          <div style={{ padding: '4px 16px 10px' }}>
            {ps.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', margin: '4px 0 2px' }}>
                Parcelas (clique pra editar)
              </div>
            )}
            {ps.map((p, i) => {
              const info = STATUS_PARCELA_INFO[statusParcela(p)];
              return (
                <div
                  key={p.id}
                  onClick={() => onEditarParcela(p, v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 0', fontSize: 13,
                    borderBottom: i === ps.length - 1 ? 'none' : '0.5px solid #f5f0e8',
                    cursor: 'pointer',
                  }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: info.bg, color: info.color,
                    fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>{p.numero}</div>
                  <div style={{ flex: 1 }}>
                    <div>Venc. {dataBR(p.vencimento)}</div>
                    {p.data_pgto && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        pago em {dataBR(p.data_pgto)}
                      </div>
                    )}
                    {p.obs && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontStyle: 'italic' }}>"{p.obs}"</div>
                    )}
                  </div>
                  <div style={{ fontWeight: 500 }}>{brl(p.valor)}</div>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 20,
                    fontWeight: 500, background: info.bg, color: info.color,
                  }}>
                    {info.label}
                  </span>
                </div>
              );
            })}

            {/* Ações da venda inteira */}
            <div style={{
              display: 'flex', gap: 8, marginTop: 12,
              paddingTop: 10, borderTop: '0.5px solid #f5f0e8',
            }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEditarVenda(v); }}
                style={{
                  flex: 1, padding: '8px 12px',
                  background: 'transparent', color: 'var(--text2)',
                  border: '0.5px solid var(--border)', borderRadius: 7,
                  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                <i className="ti ti-pencil" aria-hidden="true" /> Editar venda
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onExcluirVenda(v); }}
                style={{
                  flex: 1, padding: '8px 12px',
                  background: 'transparent', color: 'var(--red)',
                  border: '0.5px solid var(--red)', borderRadius: 7,
                  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                <i className="ti ti-trash" aria-hidden="true" /> Excluir venda
              </button>
            </div>
          </div>
        )}
      </div>
    );
  });
}
