import MensagemPorFase from './_MensagemPorFase.jsx';

// Aba Neutras — o fallback da mensagem motivacional: vale para toda paciente
// que não é 'Emagrecimento' nem 'Oncologia'. Hipertrofia, saúde geral,
// performance esportiva, reeducação alimentar, preparo pré-cirúrgico, 'Outro'
// e também quem está sem objetivo definido (o campo aceita nulo, e a
// importação por CSV grava nulo quando não reconhece o texto).
//
// Criada em 2026-08-20. Antes disso essas pacientes recebiam a mensagem da
// então "Demais objetivos", cujo conteúdo é de ciclo de tratamento — ou seja,
// uma paciente de hipertrofia podia ler "hoje é dia de químio".
//
// Por isso a regra dos exemplos abaixo: NENHUMA menção a tratamento, químio,
// imunidade, ciclo ou equipe médica. Se o texto só faz sentido para quem está
// em tratamento, ele pertence à aba Oncologia, não a esta.
const EXEMPLOS = [
  '{nome}, mais uma semana pra cuidar de você 💚 Capriche na hidratação e na comida de verdade — um passo de cada vez.',
  '{nome}, orgulho da sua constância! Continue no seu ritmo, sem pressa e sem se cobrar demais 💚',
  '{nome}, lembre: alimentação boa não é perfeição, é o que dá pra sustentar no dia a dia. Estou com você',
  '{nome}, qualquer dúvida sobre o seu plano é só me chamar aqui pelo app 💚 Bora pra mais uma semana!',
];

export default function MensagemNeutras() {
  return (
    <MensagemPorFase
      fase="neutra"
      titulo="💚 Mensagens neutras"
      descricao={
        <>
          As mensagens aparecem no topo do app para{' '}
          <strong>todas as outras pacientes</strong> — hipertrofia, saúde geral,
          performance, reeducação alimentar e quem está sem objetivo definido —,
          uma por semana, girando entre as ativas. Emagrecimento e Oncologia têm
          mensagens próprias, nas outras abas. O nome de cada uma entra no lugar
          de <code style={{ fontSize: 11 }}>{'{nome}'}</code>. Para segurar uma
          mensagem específica por até 3 dias, use o 📌.
        </>
      }
      biblioteca={[{ itens: EXEMPLOS }]}
    />
  );
}
