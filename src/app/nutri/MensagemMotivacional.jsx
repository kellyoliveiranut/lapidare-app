import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

// Casca das três telas de mensagem motivacional — a faixa que a paciente vê no
// topo do app (ver paciente/Inicio.jsx:137-184).
//
// As abas mantêm TABELAS E LÓGICAS SEPARADAS de propósito. Isto aqui é
// unificação de interface, não de dado:
//   - Oncologia    → mensagens_ciclo, fase 'oncologia', mensagem única
//   - Emagrecimento→ mensagens_emagrecimento, lista com rotação e fixação
//   - Neutras      → mensagens_ciclo, fase 'neutra', mensagem única
//
// A divisão é por OBJETIVO da paciente, e é o Inicio.jsx quem decide: quem é
// 'Emagrecimento' vai para a tabela própria, quem é 'Oncologia' lê a fase
// 'oncologia', e todo o resto — inclusive objetivo nulo — lê a fase 'neutra'.
//
// Até 2026-08-20 eram duas abas, e a de Oncologia se chamava "Demais
// objetivos": a mensagem dela ia para qualquer objetivo que não fosse
// Emagrecimento, embora o conteúdo fosse de ciclo de tratamento. Uma paciente
// de hipertrofia podia ler "hoje é dia de químio". A aba Neutras existe para
// fechar esse buraco.

const Oncologia = lazy(() => import('./_MensagemOncologia.jsx'));
const Emagrecimento = lazy(() => import('./_MensagemEmagrecimento.jsx'));
const Neutras = lazy(() => import('./_MensagemNeutras.jsx'));

const ABAS = [
  {
    id: 'oncologia',
    label: 'Oncologia',
    sub: 'Aparece só para pacientes com objetivo Oncologia. O conteúdo acompanha o ciclo de tratamento — dia da químio, janela de imunidade, recuperação.',
  },
  {
    id: 'emagrecimento',
    label: 'Emagrecimento',
    sub: 'Aparece só para pacientes com objetivo Emagrecimento.',
  },
  {
    id: 'neutras',
    label: 'Neutras',
    sub: 'Aparece para todas as outras — hipertrofia, saúde geral, performance, reeducação alimentar e quem está sem objetivo definido.',
  },
];

const COMPONENTES = {
  oncologia: Oncologia,
  emagrecimento: Emagrecimento,
  neutras: Neutras,
};

export default function MensagemMotivacional() {
  // A aba vive na URL: sobrevive ao recarregar e deixa as rotas antigas
  // redirecionarem direto para a aba certa.
  const [params, setParams] = useSearchParams();
  const pedida = params.get('publico');
  // Valor desconhecido cai em Oncologia, como caía antes de existirem três
  // abas: é a que tem conteúdo cadastrado hoje.
  const abaAtiva = COMPONENTES[pedida] ? pedida : 'oncologia';

  function trocarAba(id) {
    if (id === 'oncologia') setParams({}, { replace: true });
    else setParams({ publico: id }, { replace: true });
  }

  const meta = ABAS.find(a => a.id === abaAtiva);
  const Ativo = COMPONENTES[abaAtiva];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
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
          de um lado e uma lista curta do outro. Manter as três montadas
          triplicaria as consultas na abertura para exibir uma aba só. */}
      <Suspense
        fallback={
          <div className="card">
            <div className="card-body" style={{ color: 'var(--text3)', fontSize: 13 }}>
              Carregando…
            </div>
          </div>
        }
      >
        <Ativo />
      </Suspense>
    </div>
  );
}
