import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../lib/session.jsx';

const TOTAL_STEPS = 11;

const REFEICOES = [
  { key: 'ref_cafe',         label: 'Café da manhã',   emoji: '☕' },
  { key: 'ref_lanche_manha', label: 'Lanche da manhã', emoji: '🍎' },
  { key: 'ref_almoco',       label: 'Almoço',          emoji: '🍽️' },
  { key: 'ref_lanche_tarde', label: 'Lanche da tarde', emoji: '🥪' },
  { key: 'ref_jantar',       label: 'Jantar',          emoji: '🌙' },
  { key: 'ref_ceia',         label: 'Ceia',            emoji: '🥛' },
];

const PROTEINAS = [
  { k: 'ovos',         l: 'Ovos',        e: '🥚' },
  { k: 'frango',       l: 'Frango',      e: '🍗' },
  { k: 'carne',        l: 'Carne',       e: '🥩' },
  { k: 'peixe',        l: 'Peixe',       e: '🐟' },
  { k: 'iogurte',      l: 'Iogurte',     e: '🍦' },
  { k: 'queijo',       l: 'Queijo',      e: '🧀' },
  { k: 'leite',        l: 'Leite',       e: '🥛' },
  { k: 'suplemento',   l: 'Suplemento',  e: '💊' },
  { k: 'feijao',       l: 'Feijão',      e: '🫘' },
  { k: 'nao_consegui', l: 'Não consegui', e: '😔' },
];

const HIDRATACAO_OPTS = [
  { v: 0, l: '0 a 2 copos' },
  { v: 1, l: '3 a 4 copos' },
  { v: 2, l: '5 a 6 copos' },
  { v: 3, l: '7 ou mais' },
];

const IMPEDIMENTOS = [
  { k: 'enjoo',                   l: 'Enjoo' },
  { k: 'dor',                     l: 'Dor' },
  { k: 'cansaco',                 l: 'Cansaço' },
  { k: 'sem_fome',                l: 'Sem fome' },
  { k: 'medo_passar_mal',         l: 'Medo de passar mal' },
  { k: 'nao_tinha_quem_preparasse', l: 'Ninguém pra preparar' },
  { k: 'alteracao_paladar',       l: 'Alteração no paladar' },
  { k: 'outro',                   l: 'Outro' },
];

const OPCOES_REF = [
  { v: 3, l: 'Comi tudo',    cor: '#16a34a', bg: '#dcfce7' },
  { v: 2, l: 'Metade',       cor: '#d97706', bg: '#fef3c7' },
  { v: 1, l: 'Comi pouco',   cor: '#ea580c', bg: '#ffedd5' },
  { v: 0, l: 'Não consegui', cor: '#dc2626', bg: '#fee2e2' },
];

export default function MonitoramentoOncologico() {
  const { user, profile } = useSession();
  const [step, setStep]           = useState(null); // null = carregando
  const [registroHoje, setRegistroHoje] = useState(null);
  const [salvando, setSalvando]   = useState(false);
  const [salvo, setSalvo]         = useState(false);
  const [erro, setErro]           = useState(null);

  // Estado do formulário
  const [apetite,     setApetite]     = useState(null);
  const [refeicoes,   setRefeicoes]   = useState({});
  const [proteinas,   setProteinas]   = useState([]);
  const [suplemento,  setSuplemento]  = useState(null);
  const [hidratacao,  setHidratacao]  = useState(null);
  const [urinaEscura, setUrinaEscura] = useState(null);
  const [nausea,      setNausea]      = useState(null);
  const [vomito,      setVomito]      = useState(null);
  const [diarreia,    setDiarreia]    = useState(null);
  const [constipacao, setConstipacao] = useState(null);
  const [energia,     setEnergia]     = useState(null);
  const [dor_engolir,  setDorEngolir]  = useState(null);
  const [mucosite,     setMucosite]    = useState(null);
  const [boca_seca,    setBocaSeca]    = useState(null);
  const [paladar_alt,  setPaladarAlt]  = useState(null);
  const [febre,        setFebre]       = useState(null);
  const [disposicao,   setDisposicao]  = useState(null);
  const [mobilidade,   setMobilidade]  = useState(null);
  const [impedimentos, setImpedimentos] = useState([]);

  useEffect(() => {
    if (!user) return;
    const hoje = new Date().toISOString().split('T')[0];
    supabase
      .from('monitoramento_oncologico')
      .select('*')
      .eq('paciente_id', user.id)
      .eq('data', hoje)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setRegistroHoje(data); setStep(0); }
        else       { setStep(1); }
      });
  }, [user]);

  function preencherForm(r) {
    setApetite(r.apetite);
    const refs = {};
    REFEICOES.forEach(({ key }) => { refs[key] = r[key]; });
    setRefeicoes(refs);
    setProteinas(r.proteinas ?? []);
    setSuplemento(r.suplemento);
    setHidratacao(r.hidratacao);
    setUrinaEscura(r.urina_escura);
    setNausea(r.nausea);
    setVomito(r.vomito);
    setDiarreia(r.diarreia);
    setConstipacao(r.constipacao);
    setEnergia(r.energia);
    setDorEngolir(r.dor_engolir);
    setMucosite(r.mucosite);
    setBocaSeca(r.boca_seca);
    setPaladarAlt(r.paladar_alt);
    setFebre(r.febre);
    setDisposicao(r.disposicao);
    setMobilidade(r.mobilidade);
    setImpedimentos(r.impedimentos ?? []);
  }

  function toggleProteina(k) {
    if (k === 'nao_consegui') {
      setProteinas(p => p.includes('nao_consegui') ? [] : ['nao_consegui']);
    } else {
      setProteinas(p => {
        const sem = p.filter(x => x !== 'nao_consegui');
        return sem.includes(k) ? sem.filter(x => x !== k) : [...sem, k];
      });
    }
  }

  function toggleImpedimento(k) {
    setImpedimentos(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const hoje = new Date().toISOString().split('T')[0];
    const payload = {
      paciente_id:  user.id,
      nutri_id:     profile.nutri_id,
      data:         hoje,
      apetite,
      ...Object.fromEntries(REFEICOES.map(r => [r.key, refeicoes[r.key] ?? null])),
      proteinas:    proteinas.length ? proteinas : null,
      suplemento,
      hidratacao,
      urina_escura: urinaEscura,
      nausea,
      vomito,
      diarreia,
      constipacao,
      energia,
      dor_engolir,
      mucosite,
      boca_seca,
      paladar_alt,
      febre,
      disposicao,
      mobilidade,
      impedimentos: impedimentos.length ? impedimentos : null,
      updated_at:   new Date().toISOString(),
    };
    const { error } = await supabase
      .from('monitoramento_oncologico')
      .upsert(payload, { onConflict: 'paciente_id,data' });
    setSalvando(false);
    if (error) { setErro('Erro ao salvar: ' + error.message); return; }
    setSalvo(true);
  }

  // ── Estados especiais ──────────────────────────────────────────
  if (step === null) {
    return (
      <Wrap>
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Carregando…</div>
      </Wrap>
    );
  }

  if (salvo) return <Concluido />;

  if (step === 0 && registroHoje) {
    return (
      <JaPreenchidoHoje
        registro={registroHoje}
        onEditar={() => { preencherForm(registroHoje); setStep(1); }}
      />
    );
  }

  // ── Formulário multi-step ──────────────────────────────────────
  const progresso = step / TOTAL_STEPS;

  return (
    <Wrap>
      {/* Barra de progresso */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
          <span>Passo {step} de {TOTAL_STEPS}</span>
          <span>{Math.round(progresso * 100)}% completo</span>
        </div>
        <div style={{ height: 6, background: 'var(--hair, #e8e2d8)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progresso * 100}%`,
            background: 'var(--gold)', borderRadius: 3,
            transition: 'width .35s ease',
          }} />
        </div>
      </div>

      {/* ── Step 1: Apetite ── */}
      {step === 1 && (
        <StepShell
          title="Como está seu apetite hoje?"
          subtitle="0 = sem vontade nenhuma, 10 = apetite ótimo"
          onNext={() => setStep(2)}
          nextDisabled={apetite === null}
        >
          <Scale010 value={apetite} onChange={setApetite} lowLabel="0 · Sem apetite" highLabel="10 · Apetite ótimo" />
        </StepShell>
      )}

      {/* ── Step 2: Refeições ── */}
      {step === 2 && (
        <StepShell
          title="Como foram suas refeições?"
          subtitle="Marque o quanto conseguiu comer em cada momento do dia."
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {REFEICOES.map(({ key, label, emoji }) => (
              <div key={key}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--ink)' }}>
                  {emoji} {label}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {OPCOES_REF.map(op => {
                    const sel = refeicoes[key] === op.v;
                    return (
                      <button
                        key={op.v}
                        onClick={() => setRefeicoes(prev => ({ ...prev, [key]: op.v }))}
                        style={{
                          flex: '1 1 auto', minWidth: 70,
                          padding: '10px 8px', borderRadius: 10,
                          border: sel ? `2px solid ${op.cor}` : '1.5px solid var(--hair)',
                          background: sel ? op.bg : 'var(--paper)',
                          color: sel ? op.cor : 'var(--ink)',
                          fontSize: 12, fontWeight: sel ? 600 : 400,
                          cursor: 'pointer', transition: 'all .15s',
                        }}
                      >{op.l}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </StepShell>
      )}

      {/* ── Step 3: Proteínas ── */}
      {step === 3 && (
        <StepShell
          title="Consumiu proteína hoje?"
          subtitle="Selecione tudo que comeu. Pode marcar mais de um."
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {PROTEINAS.map(({ k, l, e }) => {
              const sel = proteinas.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleProteina(k)}
                  style={{
                    padding: '12px 8px', borderRadius: 12,
                    border: sel ? '2px solid var(--gold-deep, #a08456)' : '1.5px solid var(--hair)',
                    background: sel ? 'var(--gold-soft, #fdf6e3)' : 'var(--paper)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    fontSize: 22, cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  <span>{e}</span>
                  <span style={{ fontSize: 11, color: sel ? 'var(--gold-deep)' : 'var(--ink)', fontWeight: sel ? 600 : 400 }}>{l}</span>
                </button>
              );
            })}
          </div>
        </StepShell>
      )}

      {/* ── Step 4: Suplemento ── */}
      {step === 4 && (
        <StepShell
          title="Tomou seu suplemento hoje?"
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
          nextDisabled={suplemento === null}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { v: 'todos',         l: 'Sim, todos', e: '✅', cor: '#16a34a', bg: '#dcfce7' },
              { v: 'parcialmente',  l: 'Parcialmente', e: '⚡', cor: '#d97706', bg: '#fef3c7' },
              { v: 'nao',           l: 'Não', e: '❌', cor: '#dc2626', bg: '#fee2e2' },
            ].map(op => {
              const sel = suplemento === op.v;
              return (
                <button
                  key={op.v}
                  onClick={() => setSuplemento(op.v)}
                  style={{
                    padding: '16px 20px', borderRadius: 14,
                    border: sel ? `2px solid ${op.cor}` : '1.5px solid var(--hair)',
                    background: sel ? op.bg : 'var(--paper)',
                    display: 'flex', alignItems: 'center', gap: 14,
                    fontSize: 14, fontWeight: sel ? 600 : 400,
                    color: sel ? op.cor : 'var(--ink)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                  }}
                >
                  <span style={{ fontSize: 24 }}>{op.e}</span>
                  {op.l}
                </button>
              );
            })}
          </div>
        </StepShell>
      )}

      {/* ── Step 5: Hidratação + urina ── */}
      {step === 5 && (
        <StepShell
          title="Hidratação do dia"
          subtitle="Água, chás, sucos e caldos contam."
          onBack={() => setStep(4)}
          onNext={() => setStep(6)}
          nextDisabled={hidratacao === null || urinaEscura === null}
        >
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>
              💧 Quantos copos de líquido você bebeu?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {HIDRATACAO_OPTS.map(op => {
                const sel = hidratacao === op.v;
                return (
                  <button
                    key={op.v}
                    onClick={() => setHidratacao(op.v)}
                    style={{
                      padding: '14px 18px', borderRadius: 12, textAlign: 'left',
                      border: sel ? '2px solid var(--gold-deep)' : '1.5px solid var(--hair)',
                      background: sel ? 'var(--gold-soft)' : 'var(--paper)',
                      fontSize: 14, fontWeight: sel ? 600 : 400,
                      color: sel ? 'var(--gold-deep)' : 'var(--ink)',
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                  >{op.l}</button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>
              🟡 Urina muito escura hoje?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { v: 'sim',         l: 'Sim' },
                { v: 'nao',         l: 'Não' },
                { v: 'nao_observei', l: 'Não observei' },
              ].map(op => {
                const sel = urinaEscura === op.v;
                return (
                  <button
                    key={op.v}
                    onClick={() => setUrinaEscura(op.v)}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 12,
                      border: sel ? '2px solid var(--gold-deep)' : '1.5px solid var(--hair)',
                      background: sel ? 'var(--gold-soft)' : 'var(--paper)',
                      fontSize: 13, fontWeight: sel ? 600 : 400,
                      color: sel ? 'var(--gold-deep)' : 'var(--ink)',
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                  >{op.l}</button>
                );
              })}
            </div>
          </div>
        </StepShell>
      )}

      {/* ── Step 6: Náusea + vômito ── */}
      {step === 6 && (
        <StepShell
          title="Enjoo e vômito"
          subtitle="0 = nenhum, 10 = muito intenso"
          onBack={() => setStep(5)}
          onNext={() => setStep(7)}
          nextDisabled={nausea === null || vomito === null}
        >
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: 'var(--ink)' }}>🤢 Náusea (enjoo)</div>
            <Scale010 value={nausea} onChange={setNausea} lowLabel="0 · Nenhuma" highLabel="10 · Muito forte" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: 'var(--ink)' }}>🤮 Vômito</div>
            <Scale010 value={vomito} onChange={setVomito} lowLabel="0 · Nenhum" highLabel="10 · Muito forte" />
          </div>
        </StepShell>
      )}

      {/* ── Step 7: Sintomas orais ── */}
      {step === 7 && (
        <StepShell
          title="Sintomas na boca e garganta"
          subtitle="0 = nenhum, 10 = muito intenso"
          onBack={() => setStep(6)}
          onNext={() => setStep(8)}
          nextDisabled={dor_engolir === null || mucosite === null || boca_seca === null || paladar_alt === null}
        >
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>🫁 Dor ao engolir</div>
            <Scale010 value={dor_engolir} onChange={setDorEngolir} lowLabel="0 · Nenhuma" highLabel="10 · Muito forte" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>🔴 Mucosite (feridas na boca)</div>
            <Scale010 value={mucosite} onChange={setMucosite} lowLabel="0 · Nenhuma" highLabel="10 · Muito intensa" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>👄 Boca seca</div>
            <Scale010 value={boca_seca} onChange={setBocaSeca} lowLabel="0 · Normal" highLabel="10 · Muito seca" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>👅 Alteração no paladar</div>
            <Scale010 value={paladar_alt} onChange={setPaladarAlt} lowLabel="0 · Normal" highLabel="10 · Muito alterado" />
          </div>
        </StepShell>
      )}

      {/* ── Step 8: Diarreia + constipação + febre ── */}
      {step === 8 && (
        <StepShell
          title="Intestino e febre"
          subtitle="0 = nenhum, 10 = muito intenso"
          onBack={() => setStep(7)}
          onNext={() => setStep(9)}
          nextDisabled={diarreia === null || constipacao === null || febre === null}
        >
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>💧 Diarreia</div>
            <Scale010 value={diarreia} onChange={setDiarreia} lowLabel="0 · Nenhuma" highLabel="10 · Muito forte" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>🔒 Constipação (prisão de ventre)</div>
            <Scale010 value={constipacao} onChange={setConstipacao} lowLabel="0 · Nenhuma" highLabel="10 · Muito forte" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>🌡️ Teve febre hoje?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{v:true,l:'Sim, tive febre'},{v:false,l:'Não'}].map(op => {
                const sel = febre === op.v;
                return (
                  <button key={String(op.v)} onClick={() => setFebre(op.v)} style={{
                    flex: 1, padding: '14px', borderRadius: 14,
                    border: sel ? `2px solid ${op.v ? '#dc2626' : '#16a34a'}` : '1.5px solid var(--hair)',
                    background: sel ? (op.v ? '#fee2e2' : '#dcfce7') : 'var(--paper)',
                    fontSize: 14, fontWeight: sel ? 600 : 400,
                    color: sel ? (op.v ? '#dc2626' : '#16a34a') : 'var(--ink)',
                    cursor: 'pointer',
                  }}>{op.l}</button>
                );
              })}
            </div>
            {febre === true && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
                ⚠️ Informe sua nutricionista o mais rápido possível.
              </div>
            )}
          </div>
        </StepShell>
      )}

      {/* ── Step 9: Energia + disposição ── */}
      {step === 9 && (
        <StepShell
          title="Energia e disposição hoje"
          subtitle="0 = sem forças nenhuma, 10 = muito disposta"
          onBack={() => setStep(8)}
          onNext={() => setStep(10)}
          nextDisabled={energia === null || disposicao === null}
        >
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>⚡ Energia física</div>
            <Scale010 value={energia} onChange={setEnergia} lowLabel="0 · Sem forças" highLabel="10 · Muita energia" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--ink)' }}>😊 Disposição e humor</div>
            <Scale010 value={disposicao} onChange={setDisposicao} lowLabel="0 · Muito baixa" highLabel="10 · Ótima" />
          </div>
        </StepShell>
      )}

      {/* ── Step 10: Mobilidade ── */}
      {step === 10 && (
        <StepShell
          title="Conseguiu se movimentar hoje?"
          onBack={() => setStep(9)}
          onNext={() => setStep(11)}
          nextDisabled={mobilidade === null}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { v: 'deitada',         l: 'Fiquei deitada a maior parte do tempo',   e: '🛏️' },
              { v: 'sentada',         l: 'Fiquei sentada, sem me levantar muito',    e: '🪑' },
              { v: 'caminhei_casa',   l: 'Caminhei dentro de casa',                 e: '🚶' },
              { v: 'caminhei_fora',   l: 'Caminhei do lado de fora',               e: '🌳' },
              { v: 'exercicio',       l: 'Fiz exercício orientado',                 e: '🏃' },
            ].map(op => {
              const sel = mobilidade === op.v;
              return (
                <button key={op.v} onClick={() => setMobilidade(op.v)} style={{
                  padding: '14px 16px', borderRadius: 14, textAlign: 'left',
                  border: sel ? '2px solid var(--gold-deep)' : '1.5px solid var(--hair)',
                  background: sel ? 'var(--gold-soft)' : 'var(--paper)',
                  display: 'flex', alignItems: 'center', gap: 14,
                  fontSize: 14, fontWeight: sel ? 600 : 400,
                  color: sel ? 'var(--gold-deep)' : 'var(--ink)',
                  cursor: 'pointer', transition: 'all .15s',
                }}>
                  <span style={{ fontSize: 22 }}>{op.e}</span>
                  {op.l}
                </button>
              );
            })}
          </div>
        </StepShell>
      )}

      {/* ── Step 11: Impedimentos ── */}
      {step === 11 && (
        <StepShell
          title="O que te impediu de comer melhor?"
          subtitle="Pode marcar mais de um. Se não houve impedimento, clique em Concluir."
          onBack={() => setStep(10)}
          onSalvar={salvar}
          salvando={salvando}
          erro={erro}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {IMPEDIMENTOS.map(({ k, l }) => {
              const sel = impedimentos.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleImpedimento(k)}
                  style={{
                    padding: '10px 16px', borderRadius: 999,
                    border: sel ? '2px solid var(--gold-deep)' : '1.5px solid var(--hair)',
                    background: sel ? 'var(--gold-soft)' : 'var(--paper)',
                    fontSize: 13, fontWeight: sel ? 600 : 400,
                    color: sel ? 'var(--gold-deep)' : 'var(--ink)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >{l}</button>
              );
            })}
          </div>
        </StepShell>
      )}
    </Wrap>
  );
}

// ── Tela "já preencheu hoje" ──────────────────────────────────────
function JaPreenchidoHoje({ registro, onEditar }) {
  const dataBR = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Wrap>
      <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          Check-in de hoje registrado!
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
          {dataBR.charAt(0).toUpperCase() + dataBR.slice(1)}<br />
          Sua nutricionista já consegue ver como você está. 💛
        </div>
        <div style={{ background: 'var(--bg2, #f5f1e8)', borderRadius: 14, padding: '16px 18px', textAlign: 'left', marginBottom: 20 }}>
          <ResumoRow label="Apetite" value={registro.apetite != null ? `${registro.apetite}/10` : '—'} />
          <ResumoRow label="Energia" value={registro.energia != null ? `${registro.energia}/10` : '—'} />
          <ResumoRow label="Náusea"  value={registro.nausea  != null ? `${registro.nausea}/10`  : '—'} />
          <ResumoRow label="Hidratação" value={
            registro.hidratacao === 0 ? '0–2 copos'
            : registro.hidratacao === 1 ? '3–4 copos'
            : registro.hidratacao === 2 ? '5–6 copos'
            : registro.hidratacao === 3 ? '7+ copos' : '—'
          } />
          <ResumoRow label="Suplemento" value={
            registro.suplemento === 'todos' ? 'Tomou todos'
            : registro.suplemento === 'parcialmente' ? 'Parcialmente'
            : registro.suplemento === 'nao' ? 'Não tomou' : '—'
          } last />
        </div>
        <button onClick={onEditar} style={{
          background: 'none', border: '1.5px solid var(--hair)',
          borderRadius: 12, padding: '10px 20px',
          fontSize: 13, color: 'var(--muted)', cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}>
          Corrigir alguma informação
        </button>
      </div>
    </Wrap>
  );
}

function ResumoRow({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0',
      borderBottom: last ? 'none' : '0.5px solid var(--hair)',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ── Tela de conclusão ─────────────────────────────────────────────
function Concluido() {
  return (
    <Wrap>
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>💛</div>
        <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink)', marginBottom: 12 }}>
          Pronto, obrigada!
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 320, margin: '0 auto' }}>
          Suas respostas foram salvas e sua nutricionista já consegue acompanhar como você está.
          Cada check-in faz diferença no seu cuidado. 🌿
        </div>
      </div>
    </Wrap>
  );
}

// ── Shell de cada passo ───────────────────────────────────────────
function StepShell({ title, subtitle, children, onBack, onNext, nextDisabled, onSalvar, salvando, erro }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink)', lineHeight: 1.3, marginBottom: subtitle ? 8 : 0 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{subtitle}</div>
        )}
      </div>

      <div style={{ marginBottom: 32 }}>{children}</div>

      {erro && (
        <div style={{
          fontSize: 12, padding: '8px 14px', borderRadius: 8, marginBottom: 14,
          background: '#fee2e2', color: '#dc2626',
        }}>{erro}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{
            padding: '14px 20px', borderRadius: 14,
            border: '1.5px solid var(--hair)', background: 'var(--paper)',
            fontSize: 14, color: 'var(--ink)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>← Anterior</button>
        )}
        {onNext && (
          <button onClick={onNext} disabled={nextDisabled} style={{
            flex: 1, padding: '14px', borderRadius: 14,
            background: nextDisabled ? 'var(--hair)' : 'var(--ink)',
            color: nextDisabled ? 'var(--muted)' : '#fff',
            border: 'none', fontSize: 15, fontWeight: 500,
            cursor: nextDisabled ? 'default' : 'pointer',
            fontFamily: 'var(--font-sans)', transition: 'background .15s',
          }}>Próximo →</button>
        )}
        {onSalvar && (
          <button onClick={onSalvar} disabled={salvando} style={{
            flex: 1, padding: '14px', borderRadius: 14,
            background: salvando ? 'var(--hair)' : '#16a34a',
            color: salvando ? 'var(--muted)' : '#fff',
            border: 'none', fontSize: 15, fontWeight: 500,
            cursor: salvando ? 'default' : 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>
            {salvando ? 'Salvando…' : 'Concluir ✓'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Escala 0-10 ───────────────────────────────────────────────────
function Scale010({ value, onChange, lowLabel, highLabel }) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        {Array.from({ length: 11 }, (_, i) => {
          const sel = value === i;
          return (
            <button
              key={i}
              onClick={() => onChange(i)}
              style={{
                width: 52, height: 52, borderRadius: 14,
                border: sel ? '2px solid var(--gold-deep, #a08456)' : '1.5px solid var(--hair)',
                background: sel ? 'var(--gold, #c9a96e)' : 'var(--paper)',
                fontSize: 18, fontWeight: sel ? 700 : 400,
                color: sel ? '#fff' : 'var(--ink)',
                cursor: 'pointer', transition: 'all .15s',
              }}
            >{i}</button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

// ── Wrapper de layout ─────────────────────────────────────────────
function Wrap({ children }) {
  return (
    <div style={{ maxWidth: 540, margin: '0 auto', paddingBottom: 32 }}>
      {children}
    </div>
  );
}
