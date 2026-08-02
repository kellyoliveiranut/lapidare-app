import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

// Casca das duas telas de mensagem motivacional — a faixa que a paciente vê no
// topo do app (ver paciente/Inicio.jsx:137-184).
//
// As duas abas mantêm TABELAS E LÓGICAS SEPARADAS de propósito. Isto aqui é
// unificação de interface, não de dado:
//   - Demais objetivos → mensagens_ciclo, uma linha por nutri, upsert
//   - Emagrecimento    → mensagens_emagrecimento, lista com rotação e fixação
//
// A divisão real NÃO é oncologia vs emagrecimento. Inicio.jsx:142 pergunta se
// o objetivo é 'Emagrecimento'; qualquer outro valor — oncologia, hipertrofia,
// reeducação alimentar — cai na primeira aba. Por isso o rótulo é "Demais
// objetivos" e não "Oncologia": já existe paciente de hipertrofia na base, e
// "Oncologia" mentiria hoje, não daqui a um ano.

const DemaisObjetivos = lazy(() => import('./_MensagemDemaisObjetivos.jsx'));
const Emagrecimento = lazy(() => import('./_MensagemEmagrecimento.jsx'));

const ABAS = [
  {
    id: 'demais',
    label: 'Demais objetivos',
    sub: 'Aparece para todas as pacientes, exceto as de objetivo Emagrecimento — oncologia, hipertrofia, reeducação alimentar e qualquer outro.',
  },
  {
    id: 'emagrecimento',
    label: 'Emagrecimento',
    sub: 'Aparece só para pacientes com objetivo Emagrecimento.',
  },
];

export default function MensagemMotivacional() {
  // A aba vive na URL: sobrevive ao recarregar e deixa as rotas antigas
  // redirecionarem direto para a aba certa.
  const [params, setParams] = useSearchParams();
  const abaAtiva = params.get('publico') === 'emagrecimento' ? 'emagrecimento' : 'demais';

  function trocarAba(id) {
    if (id === 'emagrecimento') setParams({ publico: 'emagrecimento' }, { replace: true });
    else setParams({}, { replace: true });
  }

  const meta = ABAS.find(a => a.id === abaAtiva);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => trocarAba(a.id)}
            className={abaAtiva === a.id ? 'btn' : 'btn-outline'}
            style={{ fontSize: 13, padding: '7px 16px' }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 16 }}>
        {meta.sub}
      </div>

      {/* Só a aba ativa fica montada: trocar refaz a consulta, que é uma linha
          de um lado e uma lista curta do outro. Manter as duas montadas
          dobraria as consultas na abertura para exibir uma aba só. */}
      <Suspense
        fallback={
          <div className="card">
            <div className="card-body" style={{ color: 'var(--text3)', fontSize: 13 }}>
              Carregando…
            </div>
          </div>
        }
      >
        {abaAtiva === 'emagrecimento' ? <Emagrecimento /> : <DemaisObjetivos />}
      </Suspense>
    </div>
  );
}
