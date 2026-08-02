/**
 * Fonte única do texto de convite / acesso da paciente.
 *
 * Antes este texto existia em três cópias divergentes — PacientePerfil
 * (enviarAcessoWhatsApp, dois ramos) e Cadastrar (mensagemWhats), esta última
 * com redação própria ("Oi {nome}! 😊", "app de acompanhamento nutricional").
 * A base canônica é a de PacientePerfil; a variante de Cadastrar foi descartada.
 * Qualquer ajuste de redação acontece só aqui.
 *
 * Devolve texto puro, sem encode. Quem monta URL de wa.me aplica
 * encodeURIComponent no resultado.
 */

// Rodapé de instalação do PWA — idêntico em todos os casos.
const RODAPE_INSTALACAO = `Pra instalar o app no seu celular:

No iPhone (precisa ser pelo Safari):
1. Abra este link no Safari.
2. Toque no botão de compartilhar (o quadradinho com a seta para cima, na barra de baixo).
3. Role para baixo e toque em "Adicionar à Tela de Início".
4. Toque em "Adicionar". Depois, abra o app pelo ícone que apareceu na tela.

No Android:
1. Abra este link no Chrome.
2. Toque no menu (os três pontinhos no canto superior direito).
3. Toque em "Instalar app" (ou "Adicionar à tela inicial").
4. Confirme. Depois, abra o app pelo ícone que apareceu na tela.

Instalar assim deixa o app na sua tela como qualquer outro aplicativo — e é o que permite receber os avisos e lembretes direto no celular.`;

const ORIENTACAO_ONCOLOGIA =
  'Depois de entrar, duas coisas todos os dias, de dois minutos cada: o check-in na aba Tratamento e os seus hábitos do dia. São esses registros que eu leio — é por eles que eu acompanho como você está passando entre as consultas, e não só no dia da consulta. Dúvidas sobre o plano ou a rotina, me escreva pelo Chat com a Dra.';

const ORIENTACAO_PADRAO =
  'Depois de entrar, duas coisas todos os dias, de dois minutos cada: marcar seus hábitos do dia e registrar como você está, nas carinhas da tela de Início. São esses registros que eu leio — é por eles que eu acompanho sua rotina entre as consultas. Dúvidas sobre o plano ou a rotina, me escreva pelo Chat com a Dra.';

/**
 * Orientação de uso, ramificada pelo objetivo da paciente.
 *
 * O teste é `=== 'Oncologia'` de propósito: só esse valor recebe o texto de
 * tratamento. NÃO troque por "diferente de Emagrecimento" — foi esse padrão
 * que fez paciente de 'Reeducação alimentar' cair no ramo de quimioterapia.
 * Todo o resto (null, '', 'Emagrecimento', 'Hipertrofia', 'Outro', …) cai no
 * texto padrão.
 */
function orientacaoDeUso(objetivo) {
  return objetivo === 'Oncologia' ? ORIENTACAO_ONCOLOGIA : ORIENTACAO_PADRAO;
}

/**
 * Monta a mensagem completa de acesso ao app.
 *
 * Ordem final: abertura, orientação de uso, separador ---, rodapé de instalação.
 *
 * @param primeiroNome  primeiro nome da paciente
 * @param objetivo      pacientes.objetivo (ou pacientes_pendentes.objetivo).
 *                      'Oncologia' liga a orientação de tratamento; qualquer
 *                      outro valor, inclusive null, cai na orientação padrão.
 * @param link          sem conta: /signup-paciente/{nutri_id}/{token};
 *                      com conta: URL do app (origin).
 * @param temConta      false = precisa criar senha; true = já tem login.
 * @returns {string}    texto pronto, sem encode
 */
export function mensagemAcesso({ primeiroNome, objetivo, link, temConta = false }) {
  const abertura = temConta
    ? `Olá, ${primeiroNome}! Para entrar no app do Essentia, acesse: ${link ?? ''}\n\n` +
      `Use o seu e-mail ou o número do telefone e a senha que você criou. Se esquecer a senha, toque em "Esqueci minha senha".`
    : `Olá, ${primeiroNome}! Aqui é a Equipe da Dra Kelly Oliveira. Preparei o seu espaço no app do Essentia, onde você vai acompanhar seu plano alimentar e seu cuidado de pertinho.\n\n` +
      `Para criar o seu acesso, clique neste link e escolha a sua senha: ${link ?? ''}\n\n` +
      `Qualquer dúvida, é só me chamar por aqui.`;

  return `${abertura}\n\n${orientacaoDeUso(objetivo)}\n\n---\n\n${RODAPE_INSTALACAO}`;
}
