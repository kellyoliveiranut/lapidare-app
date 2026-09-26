import { TZ_CLINICA, dataConsultaBR } from '../../lib/utils.js';

/**
 * Jornada Essentia da paciente: trilha completa (TrilhaJornada) e card
 * resumido do Início (CardJornadaResumo). Os dois recebem o que o
 * useJornada (lib/useJornada.js) devolve.
 *
 * O cálculo mora em lib/jornada.js, puro e testado no Node. Aqui só entra a
 * aparência — nenhuma regra de estado é decidida neste arquivo.
 */

// ─── Aparência dos estados ──────────────────────────────────────────
//
// PROVISÓRIO: rótulo e ícone de cancelada, pulado e encerrado ainda não foram
// decididos (Kelly, 2026-09-25) — estão aqui só para a trilha não quebrar.
// Mudar é mexer SÓ neste mapa e em linhaDetalhe; o cálculo não muda.
const VISUAL = {
  feito:     { icone: 'check',     fundo: 'var(--green)',       cor: '#fff',           borda: 'var(--green)' },
  atual:     { icone: 'map-pin',   fundo: 'var(--gold-deep)',   cor: '#fff',           borda: 'var(--gold-deep)' },
  pendente:  { icone: 'hourglass', fundo: 'var(--orange-soft)', cor: 'var(--orange)',  borda: 'var(--orange)' },
  futuro:    { icone: null,        fundo: 'var(--paper)',       cor: 'var(--muted-2)', borda: 'var(--hair)' },
  cancelada: { icone: 'x',         fundo: 'var(--bg-soft)',     cor: 'var(--muted)',   borda: 'var(--hair)' },
  pulado:    { icone: 'minus',     fundo: 'var(--paper)',       cor: 'var(--muted-2)', borda: 'var(--muted-2)', tracejado: true },
  encerrado: { icone: 'flag',      fundo: 'var(--bg-soft)',     cor: 'var(--muted)',   borda: 'var(--muted-2)' },
};

// Consulta é mostrada no fuso da clínica, como no resto da área da paciente.
const FMT_DIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ_CLINICA, day: '2-digit', month: '2-digit', year: 'numeric',
});
function diaBR(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? FMT_DIA.format(d) : null;
}

// O título vem do cálculo ("Consulta 6", sem "de N"). Só o fim troca de nome
// conforme a situação, porque "Fim do acompanhamento" num pacote encerrado
// por cancelamento diria que ele terminou.
function tituloPasso(p, situacao) {
  if (p.chave !== 'fim') return p.titulo;
  if (situacao === 'concluido') return 'Acompanhamento concluído';
  if (situacao === 'encerrado') return 'Acompanhamento encerrado';
  return p.titulo;
}

// Linha de baixo de cada passo. null = passo sem detalhe.
function linhaDetalhe(p) {
  const dia = diaBR(p.data);
  switch (p.estado) {
    case 'feito':
      return dia;
    case 'atual':
      // Slot do pacote ainda sem linha, ou consulta criada sem data.
      return p.data ? dataConsultaBR(p.data) : 'A agendar';
    case 'pendente':
      return p.chave === 'plano' ? 'Em preparo' : 'Aguardando assinatura';
    case 'cancelada':
      return dia ? `Cancelada · ${dia}` : 'Cancelada';
    case 'pulado':
      return 'Não realizada';
    case 'encerrado':
      return 'As consultas restantes foram canceladas';
    default:
      return p.data ? dataConsultaBR(p.data) : null;
  }
}

function Marcador({ estado }) {
  const v = VISUAL[estado] ?? VISUAL.futuro;
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: v.fundo, color: v.cor,
      border: `1.5px ${v.tracejado ? 'dashed' : 'solid'} ${v.borda}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box',
    }}>
      {v.icone && <i className={`ti ti-${v.icone}`} style={{ fontSize: 14 }} aria-hidden="true" />}
    </div>
  );
}

function Contador({ jornada }) {
  if (jornada.situacao === 'concluido') return 'Acompanhamento concluído';
  if (jornada.situacao === 'encerrado') return 'Acompanhamento encerrado';
  return (
    <>
      {jornada.realizadas}
      <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>
        {' '}de {jornada.total} consulta{jornada.total === 1 ? '' : 's'}
      </span>
    </>
  );
}

function BarraProgresso({ jornada }) {
  const pct = jornada.total > 0 ? Math.round((jornada.realizadas / jornada.total) * 100) : 0;
  return (
    <div style={{ height: 3, borderRadius: 2, background: 'var(--hair)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%', borderRadius: 2, width: `${pct}%`,
        background: jornada.situacao === 'concluido' ? 'var(--green)' : 'var(--gold-deep)',
        transition: 'width .3s ease',
      }} />
    </div>
  );
}

/**
 * Trilha completa: contrato → consulta 1 → plano → consultas 2..6 → fim.
 * Props: jornada, carregando, erro — direto do useJornada.
 */
export function TrilhaJornada({ jornada, carregando, erro }) {
  if (carregando) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Carregando sua jornada…</div>;
  }
  if (erro) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--red)' }}>
        Não foi possível carregar sua jornada agora. Tente de novo em instantes.
      </div>
    );
  }
  if (!jornada || jornada.vazia) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>
        Sua jornada aparece aqui assim que a primeira consulta do pacote for marcada.
      </div>
    );
  }

  return (
    <div style={{
      padding: 16, background: 'var(--paper)',
      border: '0.5px solid var(--hair)', borderRadius: 16,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: '.22em', textTransform: 'uppercase',
        color: 'var(--muted)', fontWeight: 500,
      }}>Sua jornada</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>
        <Contador jornada={jornada} />
      </div>
      <BarraProgresso jornada={jornada} />

      <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
        {jornada.passos.map((p, i) => {
          const ultimo = i === jornada.passos.length - 1;
          const detalhe = linhaDetalhe(p);
          const apagado = p.estado === 'cancelada' || p.estado === 'pulado';
          return (
            <li key={p.chave} aria-current={p.estado === 'atual' ? 'step' : undefined}
              style={{ display: 'flex', gap: 12 }}>
              {/* Coluna do marcador + fio até o próximo passo */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Marcador estado={p.estado} />
                {!ultimo && (
                  <div style={{ flex: 1, width: 1.5, minHeight: 14, background: 'var(--hair)', margin: '2px 0' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: ultimo ? 0 : 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 26 }}>
                  <span style={{
                    fontSize: 13, fontWeight: p.estado === 'atual' ? 600 : 500,
                    color: apagado || p.estado === 'futuro' ? 'var(--muted)' : 'var(--ink)',
                    textDecoration: p.estado === 'cancelada' ? 'line-through' : 'none',
                  }}>{tituloPasso(p, jornada.situacao)}</span>
                  {p.estado === 'atual' && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: 'var(--gold-deep)', color: '#fff',
                    }}>Você está aqui</span>
                  )}
                </div>
                {detalhe && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{detalhe}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Card compacto do Início. Some em silêncio enquanto carrega, com erro ou
 * sem trilha: é um atalho, e o Início não pode ganhar um buraco ou um aviso
 * de erro por causa dele. O erro aparece na trilha completa.
 *
 * Props: jornada (do useJornada), onAbrir (opcional — sem ele o card não é
 * clicável; a rota da trilha completa é decisão da integração).
 */
export function CardJornadaResumo({ jornada, onAbrir }) {
  if (!jornada || jornada.vazia) return null;
  const atual = jornada.passos.find(p => p.estado === 'atual');
  const fechado = jornada.situacao !== 'em_andamento';

  return (
    <div
      onClick={onAbrir}
      role={onAbrir ? 'button' : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      onKeyDown={onAbrir ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } } : undefined}
      style={{
        margin: '0 0 12px', padding: '12px 16px',
        background: jornada.situacao === 'concluido' ? 'var(--green-soft)' : 'var(--paper)',
        border: `0.5px solid ${jornada.situacao === 'concluido' ? 'var(--green)' : 'var(--hair)'}`,
        borderRadius: 14, cursor: onAbrir ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: jornada.situacao === 'concluido' ? 'var(--green)' : 'var(--bg-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <i className={`ti ti-${jornada.situacao === 'concluido' ? 'check' : 'route'}`}
           style={{ fontSize: 20, color: jornada.situacao === 'concluido' ? '#fff' : 'var(--muted)' }}
           aria-hidden="true" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase',
          color: 'var(--muted)', fontWeight: 500, marginBottom: 3,
        }}>Sua jornada Essentia</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
          <Contador jornada={jornada} />
        </div>
        {!fechado && <BarraProgresso jornada={jornada} />}
        {atual && (
          <div style={{
            fontSize: 11, color: 'var(--muted)', marginTop: 5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            Próximo: {atual.titulo} · {linhaDetalhe(atual)}
          </div>
        )}
      </div>
      {onAbrir && (
        <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />
      )}
    </div>
  );
}
