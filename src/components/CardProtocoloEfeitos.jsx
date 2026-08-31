import protocolosEfeitosData from '../data/protocolos_efeitos.json';

/**
 * Card de referência de efeitos colaterais de UM protocolo do catálogo.
 *
 * Não sabe nada de paciente: recebe o objeto do catálogo e desenha. É o mesmo
 * card em dois lugares — a aba "Ref. Efeitos" do perfil da paciente, onde o
 * protocolo vem de um <select>, e a tela /nutri/protocolos, onde vem de uma
 * busca digitada. O controle de escolha entra por `children`, porque é a única
 * coisa que difere entre os dois.
 *
 * `proto` null é estado legítimo (ninguém escolheu ainda), não erro.
 */
export default function CardProtocoloEfeitos({
  proto,
  children,
  // Nó opcional à direita do título. Existe para o botão da lâmina caber nas
  // duas telas sem que o card precise saber qual delas é — .card-header já é
  // flex com space-between, então não há CSS novo.
  acoes = null,
  mensagemVazio = 'Selecione um protocolo para ver os efeitos colaterais e orientações nutricionais.',
}) {
  const temConteudo = !!(proto && (proto.conduta_base || proto.fases_ciclo?.length ||
    proto.efeitos?.length || proto.sinais_alerta?.length));

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Banner interno */}
      <div style={{
        padding: '7px 16px',
        background: 'var(--amber-bg, #fdf8ee)',
        borderBottom: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: 'var(--gold-deep, #a08456)',
        fontFamily: 'var(--font-sans)',
      }}>
        <i className="ti ti-lock" style={{ fontSize: 12 }} aria-hidden="true" />
        Visível apenas para a nutri — revise antes de usar
      </div>

      <div className="card-header">
        <div>
          <div className="card-title">Efeitos colaterais do protocolo</div>
          <div className="card-sub">Referência nutricional interna · {protocolosEfeitosData.meta.aviso}</div>
        </div>
        {acoes}
      </div>

      <div className="card-body">
        {children && <div style={{ marginBottom: 16 }}>{children}</div>}

        {!proto && (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
            {mensagemVazio}
          </div>
        )}

        {proto && !temConteudo && (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
            Nenhum efeito registrado para este protocolo no momento.
          </div>
        )}

        {proto && temConteudo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Aviso de rascunho gerado por IA */}
          {proto.rascunho && (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              border: '1px solid #f59e0b', borderLeft: '3px solid #d97706',
              background: '#fffbeb',
              display: 'flex', gap: 9, alignItems: 'center',
            }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: '#d97706', flexShrink: 0 }} aria-hidden="true" />
              <span style={{
                fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 700,
                color: '#b45309', textTransform: 'uppercase', letterSpacing: '.05em',
              }}>
                Rascunho
              </span>
            </div>
          )}

          {/* Conduta nutricional-base */}
          {proto.conduta_base && (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              border: '0.5px solid var(--border)', borderLeft: '3px solid var(--green, #16a34a)',
              background: 'var(--green-bg, #f0fdf4)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--green, #16a34a)',
                textTransform: 'uppercase', letterSpacing: '.05em',
                marginBottom: 6, fontFamily: 'var(--font-sans)',
              }}>
                Conduta nutricional-base
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, fontFamily: 'var(--font-sans)' }}>
                {proto.conduta_base}
              </div>
            </div>
          )}

          {/* Fases do ciclo */}
          {proto.fases_ciclo?.length > 0 && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '.05em',
                marginBottom: 8, fontFamily: 'var(--font-sans)',
              }}>
                Fases do ciclo
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {proto.fases_ciclo.map((fase, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: 8,
                    border: '0.5px solid var(--border)', borderLeft: '3px solid var(--primary, #6366f1)',
                    background: 'var(--bg2)',
                  }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 700, color: 'var(--dark)',
                      marginBottom: 3, fontFamily: 'var(--font-sans)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '1px 6px',
                        background: 'var(--primary, #6366f1)', color: '#fff', flexShrink: 0,
                      }}>{i + 1}</span>
                      {fase.fase}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--font-sans)' }}>
                      {fase.drogas}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 3, lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>
                      <strong style={{ color: 'var(--dark)', fontWeight: 600 }}>Sintomas: </strong>{fase.sintomas}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>
                      <strong style={{ color: 'var(--dark)', fontWeight: 600 }}>Foco: </strong>{fase.foco}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Efeitos colaterais */}
          {proto.efeitos?.length > 0 && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '.05em',
                marginBottom: 8, fontFamily: 'var(--font-sans)',
              }}>
                Efeitos colaterais e manejo
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {proto.efeitos.map((ef, i) => (
                  <div key={i} style={{
                    padding: '11px 14px', borderRadius: 8,
                    border: '0.5px solid var(--border)', background: 'var(--bg2)',
                  }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--dark)', marginBottom: 4,
                      fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center',
                      gap: 6, flexWrap: 'wrap',
                    }}>
                      <i className="ti ti-alert-circle" style={{ fontSize: 13, color: 'var(--gold-deep, #a08456)', flexShrink: 0 }} aria-hidden="true" />
                      {ef.efeito}
                      {ef.relacionado_a && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 500, borderRadius: 20, padding: '1px 8px',
                          background: 'var(--amber-bg, #fdf8ee)', color: 'var(--gold-deep, #a08456)',
                          border: '0.5px solid var(--gold-deep, #a08456)',
                        }}>{ef.relacionado_a}</span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55,
                      fontFamily: 'var(--font-sans)', paddingLeft: 19,
                    }}>
                      {ef.manejo}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sinais de alerta */}
          {proto.sinais_alerta?.length > 0 && (
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              border: '1px solid #fca5a5', borderLeft: '3px solid var(--red, #dc2626)',
              background: '#fef2f2',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--red, #dc2626)',
                textTransform: 'uppercase', letterSpacing: '.05em',
                marginBottom: 8, fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 13 }} aria-hidden="true" />
                Sinais de alerta — contato com a equipe
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 4px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {proto.sinais_alerta.map((s, i) => (
                  <li key={i} style={{
                    fontSize: 12.5, color: '#991b1b', lineHeight: 1.5,
                    fontFamily: 'var(--font-sans)', display: 'flex', gap: 7, alignItems: 'flex-start',
                  }}>
                    <span style={{ flexShrink: 0, fontWeight: 700, color: '#dc2626' }}>·</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
        )}
      </div>
    </div>
  );
}
