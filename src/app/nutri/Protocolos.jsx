import { useState, useMemo, useRef, useEffect } from 'react';
import CardProtocoloEfeitos from '../../components/CardProtocoloEfeitos.jsx';
import { buscarProtocolos, chaveProtocolo } from '../../lib/protocoloCiclo.js';
import protocolosEfeitosData from '../../data/protocolos_efeitos.json';

const TOTAL = protocolosEfeitosData.protocolos.length;

/**
 * Consulta ao catálogo de efeitos por protocolo, sem passar por paciente.
 *
 * O mesmo card da aba "Ref. Efeitos" do perfil, só que a escolha vem de busca
 * digitada em vez de um <select> de 74 opções. Não toca no banco: o catálogo é
 * um JSON importado.
 */
export default function Protocolos() {
  const [termo, setTermo] = useState('');
  const [escolhido, setEscolhido] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixaRef = useRef(null);

  const sugestoes = useMemo(() => buscarProtocolos(termo), [termo]);

  // Clique fora fecha a lista. Sem isso ela fica pendurada sobre o card depois
  // que a nutri desiste da busca.
  useEffect(() => {
    function fora(e) {
      if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  function digitar(v) {
    setTermo(v);
    setAtivo(0);
    setAberto(true);
    // Some com o card assim que o texto deixa de ser o protocolo escolhido —
    // senão a nutri apaga a busca e continua lendo o card antigo, achando que
    // é o novo.
    if (escolhido && v !== escolhido.nome) setEscolhido(null);
  }

  function escolher(proto) {
    setEscolhido(proto);
    setTermo(proto.nome);
    setAberto(false);
    setAtivo(0);
  }

  function limpar() {
    setTermo('');
    setEscolhido(null);
    setAberto(false);
    setAtivo(0);
  }

  function teclado(e) {
    if (e.key === 'Escape') { setAberto(false); return; }
    if (!aberto || sugestoes.length === 0) return;
    // `ativo` pode ter ficado além do fim se a lista encolheu entre um caractere
    // e outro; o clamp evita escolher undefined no Enter.
    const i = Math.min(ativo, sugestoes.length - 1);
    if (e.key === 'ArrowDown')      { e.preventDefault(); setAtivo((i + 1) % sugestoes.length); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setAtivo((i - 1 + sugestoes.length) % sugestoes.length); }
    else if (e.key === 'Enter')     { e.preventDefault(); escolher(sugestoes[i].proto); }
  }

  const mostrarLista = aberto && termo.trim() !== '' && !escolhido;

  return (
    <div>
      <div className="page-title">Protocolos</div>
      <div className="page-sub">
        Consulta rápida aos efeitos colaterais e à conduta nutricional dos {TOTAL} protocolos
        do catálogo — sem precisar abrir uma paciente
      </div>

      <CardProtocoloEfeitos
        proto={escolhido}
        mensagemVazio="Digite o nome do protocolo ou de uma droga para ver os efeitos colaterais e orientações nutricionais."
        acoes={escolhido && (
          // <a> de verdade, não window.open: link nunca é barrado por bloqueador
          // de pop-up, ao contrário do window.open + document.write que os
          // impressos internos usam e que já precisou do aviso "permita pop-ups".
          <a
            className="btn-outline"
            href={`/nutri/lamina/${chaveProtocolo(escolhido.nome)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="ti ti-printer" style={{ fontSize: 15 }} aria-hidden="true" />
            Lâmina da paciente
          </a>
        )}
      >
        <label className="field-label" htmlFor="busca-protocolo">Protocolo</label>
        <div ref={caixaRef} style={{ position: 'relative' }}>
          <input
            id="busca-protocolo"
            value={termo}
            onChange={e => digitar(e.target.value)}
            onFocus={() => setAberto(true)}
            onKeyDown={teclado}
            placeholder="Ex.: FOLFOX, Datroway, oxaliplatina…"
            autoComplete="off"
            role="combobox"
            aria-expanded={mostrarLista}
            aria-controls="lista-protocolos"
            style={{ width: '100%', margin: 0, paddingRight: 30, boxSizing: 'border-box', fontFamily: 'var(--font-sans)' }}
          />
          {termo !== '' && (
            <button
              type="button"
              onClick={limpar}
              title="Limpar busca"
              aria-label="Limpar busca"
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', padding: 0, fontSize: 14, lineHeight: 1,
              }}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          )}

          {mostrarLista && (
            <div
              id="lista-protocolos"
              role="listbox"
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                marginTop: 4, maxHeight: 300, overflowY: 'auto',
                background: 'var(--bg)', border: '0.5px solid var(--border)',
                borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.10)',
              }}
            >
              {sugestoes.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
                  Nenhum protocolo com esse nome no catálogo.
                </div>
              ) : sugestoes.map(({ proto, via }, i) => (
                <div
                  key={proto.nome}
                  role="option"
                  aria-selected={i === ativo}
                  onMouseEnter={() => setAtivo(i)}
                  onMouseDown={e => { e.preventDefault(); escolher(proto); }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer',
                    background: i === ativo ? 'var(--bg2)' : 'transparent',
                    borderBottom: i < sugestoes.length - 1 ? '0.5px solid var(--border)' : 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{proto.nome}</div>
                  {/* Sem esta linha, digitar "oxali" e ver "FOLFOX" na lista
                      parece defeito — ela diz de onde veio o casamento. */}
                  {via && (
                    <div style={{ fontSize: 11, color: 'var(--gold-deep, #a08456)', marginTop: 1 }}>
                      via {via}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{proto.indicacao}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardProtocoloEfeitos>
    </div>
  );
}
