/**
 * Cartão "Chás do meu tratamento" da paciente. Recebe o objeto de
 * montarChas() (lib/chasProtocolo.js) e desenha as seções da base e depois
 * as do protocolo. O único texto próprio é o título: todo o resto vem dos
 * dados validados pela Kelly. `chas` null não desenha nada.
 *
 * Mesmo visual do cartão da linha do tempo do Monitoramento (estilos em
 * linha, como lá), sem CSS novo.
 */
export default function CartaoChas({ chas }) {
  if (!chas) return null;
  const secoes = [...(chas.base?.secoes ?? []), ...(chas.protocolo?.secoes ?? [])];

  return (
    <section style={{
      background: 'var(--paper)', borderRadius: 14,
      border: '0.5px solid var(--hair)',
      padding: '14px 16px 16px',
    }}>
      <h2 style={{
        fontSize: 11, fontWeight: 600, color: 'var(--muted)', margin: '0 0 12px',
        textTransform: 'uppercase', letterSpacing: '.05em',
      }}>
        Chás do meu tratamento
      </h2>
      {secoes.map((s, i) => (
        <div key={i} style={{ marginTop: i === 0 ? 0 : 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '0 0 6px' }}>
            {s.titulo}
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
            {(s.itens ?? []).map((item, j) => <li key={j}>{item}</li>)}
          </ul>
        </div>
      ))}
    </section>
  );
}
