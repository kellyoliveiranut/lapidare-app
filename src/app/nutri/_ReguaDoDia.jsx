import { useEffect, useMemo, useState } from 'react';
import { partesLocaisISO, isoLocalDeData } from '../../lib/utils.js';
import { tipoColor, modalidadeInfo } from '../../lib/consultaVisual.js';
import {
  MIN_INICIO, MIN_FIM, ALTURA_HORA, ALTURA_TOTAL, HORAS_CHEIAS,
  DURACAO_TAREFA_MIN, topoDe, alturaDe, minutosDeHHMM, hhmm,
  recortar, distribuirEmFaixas,
} from '../../lib/reguaDoDia.js';

/* ============================================================
   RÉGUA DO DIA — a visão por horário da Agenda

   Alternativa à lista "Consultas em {dia}" / "Tarefas de {dia}". A lista
   continua sendo o padrão; quem escolhe é o alternador na Agenda.

   O QUE ENTRA E O QUE NÃO ENTRA:
     consulta com data_hora ......... bloco na altura da hora
     consulta sem data_hora ......... NÃO entra (é "A definir", não tem dia)
     tarefa com data + hora ......... bloco na altura da hora
     tarefa com data, sem hora ...... faixa "dia inteiro", no topo
     tarefa sem data ................ NÃO entra (fica no bloco fixo da Agenda)

   A geometria toda mora em src/lib/reguaDoDia.js, testada no node. Aqui só
   tem desenho.

   CORES: nunca concatenar alpha em cor daqui — tipoColor devolve
   `var(--blue)`, e `var(--blue)` + '20' é CSS inválido (a armadilha que já
   existe no Servicos.jsx). O fundo claro do bloco é uma camada absoluta
   com opacity, que funciona com custom property.
   ============================================================ */

const LARGURA_CALHA = 52;   // coluna dos rótulos de hora, cabe "08:00"

export default function ReguaDoDia({
  consultas, tarefas, diaSelecionado,
  onAbrirConsulta, onAbrirTarefa, onAlternarTarefa,
}) {
  // ── "agora" no relógio da CLÍNICA ──
  // Reposiciona de minuto em minuto. O mesmo partesLocaisISO que posiciona
  // as consultas, para a linha e os blocos nunca discordarem entre si.
  const [agora, setAgora] = useState(() => partesLocaisISO(new Date().toISOString()));
  useEffect(() => {
    const t = setInterval(() => setAgora(partesLocaisISO(new Date().toISOString())), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const diaISO = isoLocalDeData(diaSelecionado);
  const ehHoje = agora.data === diaISO;
  const minAgora = minutosDeHHMM(agora.hora);
  const agoraVisivel = ehHoje && minAgora != null && minAgora >= MIN_INICIO && minAgora <= MIN_FIM;

  // Tarefas sem hora: faixa do topo, não a régua.
  const tarefasDiaInteiro = useMemo(
    () => (tarefas ?? []).filter(t => !t.hora),
    [tarefas],
  );

  // Consultas e tarefas entram JUNTAS na distribuição em faixas. Se fossem
  // separadas, uma tarefa das 14:00 cairia por cima da consulta das 14:00.
  const { dentro, fora } = useMemo(() => {
    const brutos = [];

    for (const c of consultas ?? []) {
      if (!c.data_hora) continue;                    // "A definir" não tem dia
      const inicio = minutosDeHHMM(partesLocaisISO(c.data_hora).hora);
      if (inicio == null) continue;
      brutos.push({
        chave: `c-${c.id}`, kind: 'consulta', dado: c,
        inicio, fim: inicio + (c.duracao_min ?? 30),
      });
    }

    for (const t of tarefas ?? []) {
      if (!t.hora) continue;                         // vai para a faixa do topo
      const inicio = minutosDeHHMM(t.hora);          // 'HH:MM:SS' do PostgREST
      if (inicio == null) continue;
      brutos.push({
        chave: `t-${t.id}`, kind: 'tarefa', dado: t,
        inicio, fim: inicio + DURACAO_TAREFA_MIN,
      });
    }

    const emCima = [], deFora = [];
    for (const it of brutos) {
      const corte = recortar(it.inicio, it.fim);
      // Inteiramente fora da faixa: não some da tela, vai para a tira do pé.
      if (!corte) { deFora.push(it); continue; }
      emCima.push({ ...it, ...corte });
    }
    return {
      dentro: distribuirEmFaixas(emCima),
      fora: deFora.sort((a, b) => a.inicio - b.inicio),
    };
  }, [consultas, tarefas]);

  return (
    <div>
      {/* ── FAIXA "DIA INTEIRO" ── */}
      {tarefasDiaInteiro.length > 0 && (
        <div className="card" style={{
          padding: '8px 10px', marginBottom: 8,
          display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em',
            color: 'var(--text3)', marginRight: 2,
          }}>
            Dia inteiro
          </span>
          {tarefasDiaInteiro.map(t => (
            <ChipTarefa key={t.id} t={t}
              onAbrir={() => onAbrirTarefa(t)}
              onAlternar={onAlternarTarefa} />
          ))}
        </div>
      )}

      {/* ── RÉGUA ── */}
      <div className="card" style={{ padding: '10px 12px 12px' }}>
        <div style={{ position: 'relative', height: ALTURA_TOTAL }}>

          {/* Linhas e rótulos das horas */}
          {HORAS_CHEIAS.map(h => {
            const y = topoDe(h * 60);
            return (
              <div key={h}>
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: y,
                  borderTop: '0.5px solid var(--hair-soft)',
                }} />
                <div style={{
                  position: 'absolute', left: LARGURA_CALHA, right: 0, top: y + ALTURA_HORA / 2,
                  borderTop: '0.5px dashed var(--hair-soft)', opacity: .5,
                }} />
                <div style={{
                  position: 'absolute', left: 0, top: y - 6, width: LARGURA_CALHA - 8,
                  textAlign: 'right', fontSize: 10, color: 'var(--text3)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {String(h).padStart(2, '0')}:00
                </div>
              </div>
            );
          })}

          {/* Borda final — 19:30 */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: ALTURA_TOTAL,
            borderTop: '0.5px solid var(--hair-soft)',
          }} />

          {/* Linha do "agora" — só quando o dia selecionado é hoje */}
          {agoraVisivel && (
            <div style={{
              position: 'absolute', left: LARGURA_CALHA - 4, right: 0, top: topoDe(minAgora),
              borderTop: '1.5px solid var(--orange)', zIndex: 3, pointerEvents: 'none',
            }}>
              <span style={{
                position: 'absolute', left: -3, top: -4,
                width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)',
              }} />
            </div>
          )}

          {/* Blocos */}
          {dentro.map(it => {
            const largura = 100 / it.nFaixas;
            const estilo = {
              position: 'absolute',
              top: topoDe(it.inicio),
              height: Math.max(alturaDe(it.fim - it.inicio), 22),
              left: `calc(${LARGURA_CALHA}px + ${it.faixa * largura}%)`,
              width: `calc(${largura}% - ${LARGURA_CALHA * largura / 100}px - 4px)`,
              zIndex: 2,
            };
            return it.kind === 'consulta'
              ? <BlocoConsulta key={it.chave} it={it} estilo={estilo} onAbrir={() => onAbrirConsulta(it.dado)} />
              : <BlocoTarefa key={it.chave} it={it} estilo={estilo} onAbrir={() => onAbrirTarefa(it.dado)} />;
          })}
        </div>

        {/* ── TIRA "FORA DA RÉGUA" ──
            Sumir em silêncio é o único desfecho inaceitável: item fora de
            08:00-19:30 aparece aqui em vez de desaparecer. */}
        {fora.length > 0 && (
          <div style={{
            marginTop: 10, paddingTop: 8, borderTop: '0.5px solid var(--hair-soft)',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <span style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em',
              color: 'var(--text3)',
            }}>
              Fora da régua ({fora.length})
            </span>
            {fora.map(it => (
              <button key={it.chave}
                onClick={() => (it.kind === 'consulta' ? onAbrirConsulta(it.dado) : onAbrirTarefa(it.dado))}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font-sans)',
                  fontSize: 12, color: 'var(--text2)',
                }}>
                {rotuloHora(it.inicio)} · {it.kind === 'consulta' ? (it.dado.paciente?.nome ?? '—') : it.dado.texto}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Minutos desde a meia-noite → 'HH:MM', para a tira de fora da régua. */
function rotuloHora(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function BlocoConsulta({ it, estilo, onAbrir }) {
  const c = it.dado;
  const cor = tipoColor(c.tipo);
  const mod = modalidadeInfo(c.modalidade);
  const hora = partesLocaisISO(c.data_hora).hora;
  const baixo = it.fim - it.inicio <= 30;   // 30 min: só cabe uma linha

  return (
    <button onClick={onAbrir} title={`${hora} · ${c.paciente?.nome ?? ''} · ${mod.label}`}
      style={{
        ...estilo, overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
        padding: '3px 6px 3px 9px', fontFamily: 'var(--font-sans)',
        background: 'var(--white)', border: '0.5px solid var(--border)',
        // Cantos retos do lado cortado: sinalizam que o bloco continua além.
        borderRadius: 6,
        borderTopLeftRadius: it.cortadoTopo ? 0 : 6,
        borderTopRightRadius: it.cortadoTopo ? 0 : 6,
        borderBottomLeftRadius: it.cortadoBase ? 0 : 6,
        borderBottomRightRadius: it.cortadoBase ? 0 : 6,
      }}>
      {/* Camada de cor com opacity, e não alpha concatenado: `cor` é uma
          custom property, e var(--x) + '20' não é CSS válido. */}
      <span style={{ position: 'absolute', inset: 0, background: cor, opacity: .10, pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: cor }} />
      <div style={{ position: 'relative', display: 'flex', gap: 5, alignItems: 'baseline', minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {hora}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 500, color: 'var(--dark)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {c.paciente?.nome ?? '—'}
        </span>
      </div>
      {!baixo && (
        <div style={{ position: 'relative', fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
          <i className={`ti ${mod.icone}`} aria-hidden="true" style={{ fontSize: 11, marginRight: 3 }} />
          {mod.label}
        </div>
      )}
    </button>
  );
}

function BlocoTarefa({ it, estilo, onAbrir }) {
  const t = it.dado;
  const concluida = !!t.concluido_em;
  return (
    <button onClick={onAbrir} title={`${hhmm(t.hora)} · ${t.texto}`}
      style={{
        ...estilo, overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
        padding: '3px 6px 3px 9px', fontFamily: 'var(--font-sans)',
        background: 'var(--white)', border: '0.5px solid var(--border)',
        borderRadius: 3,               // quadrado: mesma linguagem do calendário
        opacity: concluida ? .55 : 1,
      }}>
      <span style={{ position: 'absolute', inset: 0, background: 'var(--gold-deep)', opacity: .10, pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--gold-deep)' }} />
      <div style={{ position: 'relative', display: 'flex', gap: 5, alignItems: 'baseline', minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {hhmm(t.hora)}
        </span>
        <span style={{
          fontSize: 12, color: 'var(--text2)',
          textDecoration: concluida ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {t.texto}
        </span>
      </div>
    </button>
  );
}

/** Tarefa sem hora, na faixa do topo: caixinha + texto clicável para editar. */
function ChipTarefa({ t, onAbrir, onAlternar }) {
  const concluida = !!t.concluido_em;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 6px', borderRadius: 3,
      border: '0.5px solid var(--border)', background: 'var(--white)',
      position: 'relative', maxWidth: '100%',
    }}>
      <span style={{
        position: 'absolute', inset: 0, background: 'var(--gold-deep)',
        opacity: .10, borderRadius: 3, pointerEvents: 'none',
      }} />
      {/* stopPropagation: sem ele, marcar a caixinha abriria o modal de
          edição por cima — mesma armadilha do ConsultaRow. */}
      <input type="checkbox" checked={concluida}
        onClick={e => e.stopPropagation()}
        onChange={e => { e.stopPropagation(); onAlternar(t.id, !concluida); }}
        aria-label={concluida ? `Reabrir: ${t.texto}` : `Concluir: ${t.texto}`}
        style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }} />
      <button onClick={onAbrir}
        style={{
          position: 'relative', background: 'none', border: 'none', padding: 0,
          cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12,
          color: 'var(--text2)', maxWidth: 220,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textDecoration: concluida ? 'line-through' : 'none',
        }}>
        {t.texto}
      </button>
    </span>
  );
}
