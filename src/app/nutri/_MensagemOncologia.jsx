import MensagemPorFase from './_MensagemPorFase.jsx';

// Aba Oncologia da mensagem motivacional — a faixa que a paciente vê no topo
// do app (ver paciente/Inicio.jsx).
//
// Até 2026-08-20 esta aba se chamava "Demais objetivos" e sua mensagem ia para
// TODA paciente cujo objetivo não fosse 'Emagrecimento'. O conteúdo, porém,
// sempre foi de ciclo de tratamento. Na prática uma paciente de hipertrofia
// podia ler "hoje é dia de químio". Daí a separação: esta aba passa a valer só
// para objetivo 'Oncologia', e quem não é nem oncologia nem emagrecimento
// recebe a aba Neutras.
//
// Os seis rótulos de exemplo ("Dia da químio", "Início da piora"…) eram, até
// aqui, só organização visual — o banco guardava uma linha por nutri. Agora
// eles viram SEÇÕES DENTRO dos quatro grupos que existem de verdade em
// mensagens_ciclo.grupo_ciclo. Nenhum texto foi reescrito, só reagrupado.
//
// Por que quatro e não seis: ver protocoloCiclo.GRUPOS_CICLO. "Início da
// piora" e "Fim da janela" são os dois 'alerta'; "Janela" e "Pico" são os dois
// 'risco'. Casar mensagem pelo `desc` do marco falharia calado em BEP, Taxol
// Semanal, FLOX, R-CHOP, T-DD e FOLFIRINOX.

// ORDEM DE TELA, que é a cronologia do ciclo — e NÃO a ordem de
// protocoloCiclo.GRUPOS_CICLO, que é de precedência (lá 'risco' vem antes de
// 'alerta' porque tem que ganhar quando os marcos se sobrepõem). As duas
// divergem de propósito; não "arrume" uma para bater com a outra.
const GRUPOS = [
  { id: null,           label: 'Genéricas' },
  { id: 'infusao',      label: 'Dia da infusão' },
  { id: 'alerta',       label: 'Alerta' },
  { id: 'risco',        label: 'Risco' },
  { id: 'recuperacao',  label: 'Recuperação' },
];

// Chaveado por grupo_ciclo, com '' no lugar do nulo — mesma convenção do
// coalesce(grupo_ciclo, '') do índice mensagens_ciclo_uma_fixada.
const BIBLIOTECA = {
  // Genéricas: vão para quem NÃO tem ciclo identificável — sem aplicação
  // cadastrada, tratamento encerrado, ou data que não dá para afirmar nada
  // (faseDoDia devolve null). Por isso não podem citar dia de químio, janela
  // de imunidade nem contagem de ciclo: seriam falsas para essa paciente.
  '': [
    {
      itens: [
        '{nome}, seguimos juntas nessa 💚 Capriche na hidratação e nas proteínas ao longo do dia — e qualquer sintoma, me conte por aqui.',
        '{nome}, o seu ritmo é o ritmo certo. Coma o que conseguir, em pequenas porções, e beba água com frequência. Estou aqui do seu lado 💚',
        '{nome}, obrigada pela confiança de sempre. Se alguma coisa mudar no apetite, no sono ou no intestino, me escreve — a gente ajusta juntas 💚',
      ],
    },
  ],

  infusao: [
    {
      label: 'Dia da químio',
      itens: [
        '{nome}, hoje é dia de químio 💚 Vá com calma, capriche na hidratação e lembre: cada sessão é um passo. Estou com você.',
        '{nome}, dia de tratamento hoje. Hidrate-se bem, coma algo leve antes e descanse depois. Você é mais forte do que imagina',
        'Força hoje, {nome}! 💚 Beba bastante água e respeite seu corpo. Qualquer sintoma, me conte pelo app.',
      ],
    },
  ],

  alerta: [
    {
      label: 'Início da piora',
      itens: [
        '{nome}, nos próximos dias seu corpo pode pedir mais descanso — tudo bem. Coma em pequenas porções e mantenha a hidratação',
        'Se bater enjoo ou cansaço agora, {nome}, é esperado. Vá no seu ritmo, prefira alimentos leves e fracionados. Estou por aqui 💚',
        '{nome}, fase de adaptação. Hidrate-se, descanse e não se cobre demais. Pequenos passos contam.',
      ],
    },
    {
      label: 'Fim da janela',
      itens: [
        '{nome}, o período mais sensível está passando 💚 Continue se cuidando e aos poucos retome o que te faz bem.',
        'Você atravessou a parte mais difícil do ciclo, {nome}. Mantenha a alimentação e a hidratação — a recuperação está a caminho',
        '{nome}, fase de recuperação. Capriche nas proteínas e no descanso pra repor as energias. Orgulho de você!',
      ],
    },
  ],

  risco: [
    {
      label: 'Janela de risco',
      itens: [
        '{nome}, estamos na janela de maior atenção à imunidade. Capriche na higiene dos alimentos, evite aglomerações e, se tiver febre, avise sua equipe 💚',
        'Fase de cuidado redobrado, {nome}: alimentos bem cozidos, mãos higienizadas e hidratação em dia.',
        '{nome}, atenção extra com a imunidade agora. Comida bem lavada e cozida, e bastante descanso',
      ],
    },
    {
      label: 'Pico de risco',
      itens: [
        '{nome}, este é o período de menor imunidade do ciclo. Redobre os cuidados com a alimentação e evite contato com pessoas doentes. Febre, contate sua equipe na hora 💚',
        'Cuidado máximo nesses dias, {nome}: alimentos seguros, ambientes arejados e muito repouso. Você está indo bem.',
        '{nome}, fase mais sensível da imunidade. Hidrate, descanse e fique atenta a sinais como febre. Conte comigo',
      ],
    },
  ],

  recuperacao: [
    {
      label: 'Próximo ciclo / fase boa',
      itens: [
        '{nome}, em breve um novo ciclo. Aproveite esses dias pra se fortalecer: alimentação caprichada, hidratação e descanso 💚',
        'Reta final antes do próximo ciclo, {nome}. Vamos chegar bem preparadas — qualquer dúvida, me chama pelo app',
        '{nome}, fase boa pra recuperar o pique antes da próxima sessão. Continue firme, você está mandando muito bem!',
      ],
    },
  ],
};

export default function MensagemOncologia() {
  return (
    <MensagemPorFase
      fase="oncologia"
      titulo="💚 Mensagem para Oncologia"
      descricao={
        <>
          As mensagens aparecem no topo do app para as pacientes de{' '}
          <strong>objetivo Oncologia</strong>, uma por semana, girando entre as
          ativas do momento em que cada paciente está no ciclo. O nome dela entra
          no lugar de <code style={{ fontSize: 11 }}>{'{nome}'}</code>. Para
          segurar uma mensagem específica por até 3 dias, use o 📌.
        </>
      }
      grupos={GRUPOS}
      biblioteca={BIBLIOTECA}
    />
  );
}
