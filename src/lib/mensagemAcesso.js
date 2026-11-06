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
1. Abra o link do aplicativo (o do passo 2) no Safari. Se ele abrir dentro do WhatsApp, toque nos três pontinhos ou no ícone de compartilhar e escolha "Abrir no Safari".
2. Toque no botão de compartilhar (o quadradinho com a seta para cima, na barra de baixo).
3. Role para baixo e toque em "Adicionar à Tela de Início".
4. Toque em "Adicionar". Depois, abra o app pelo ícone que apareceu na tela.

No Android:
1. Abra o link do aplicativo (o do passo 2) no Chrome. Se ele abrir dentro do WhatsApp, toque nos três pontinhos e escolha "Abrir no Chrome".
2. Toque no menu (os três pontinhos no canto superior direito).
3. Toque em "Instalar app" (ou "Adicionar à tela inicial").
4. Confirme. Depois, abra o app pelo ícone que apareceu na tela.

Instalar assim deixa o app na sua tela como qualquer outro aplicativo — e é o que permite receber os avisos e lembretes direto no celular.`;

/**
 * Monta a mensagem completa de acesso ao app.
 *
 * Ordem final: abertura, separador ---, rodapé de instalação. (A orientação de
 * uso diário foi retirada a pedido da Kelly; `objetivo` segue no parâmetro por
 * compatibilidade com quem chama.)
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
  // Link do aplicativo (login): mesma origem do link recebido.
  let linkApp = link ?? '';
  if (!temConta) {
    try { linkApp = new URL(link).origin + '/login'; } catch { linkApp = ''; }
  }

  const abertura = temConta
    ? `Olá, ${primeiroNome}! Para entrar no app do Essentia, acesse: ${link ?? ''}\n\n` +
      `Use o seu e-mail e a senha que você criou. Se esquecer a senha, toque em "Esqueci minha senha".`
    : `Olá, ${primeiroNome}! Aqui é a Equipe da Dra. Kelly Oliveira. Preparei o seu espaço no app do Essentia, onde você vai acompanhar seu plano alimentar e seu cuidado de pertinho.\n\n` +
      `1) Criar o seu acesso (só na primeira vez)\n` +
      `Toque neste link e escolha a sua senha:\n${link ?? ''}\n` +
      `Atenção: este link serve apenas para criar o acesso.\n\n` +
      `2) Entrar no app (sempre que quiser)\n` +
      `Depois de criar a senha, entre pelo link do aplicativo:\n${linkApp}\n` +
      `Use o seu e-mail e a senha que você escolheu. Salve este link, ou instale o app na tela do celular (passo a passo abaixo).\n\n` +
      `Qualquer dúvida, é só me chamar por aqui.`;

  const rodape = temConta ? RODAPE_INSTALACAO.split(' (o do passo 2)').join('') : RODAPE_INSTALACAO;
  return `${abertura}\n\n---\n\n${rodape}`;
}

/**
 * Mensagem de senha definida PELA NUTRI — caminho de EXCEÇÃO, para quando o
 * e-mail de redefinição não chega: e-mail do cadastro divergente do e-mail de
 * auth.users, ou conta de cadastro manual, cujo endereço é sintético.
 *
 * Função própria e não um `temConta` a mais em mensagemAcesso(): as duas frases
 * daquele ramo ficariam mentindo aqui. Lá se diz "a senha que você criou" — e
 * esta ela não criou — e se manda usar "Esqueci minha senha", que cai
 * exatamente no e-mail que não chega. Errado nos dois pontos.
 *
 * Sem RODAPE_INSTALACAO e sem orientacaoDeUso DE PROPÓSITO: quem recebe isto já
 * usa o app, e a senha não pode se perder no meio de um texto longo de duas
 * telas. É a única mensagem deste arquivo que carrega uma credencial.
 *
 * @param primeiroNome  primeiro nome da paciente
 * @param link          URL do app (origin) — ela já tem conta, então é login
 * @param senha         a senha em texto puro, recém-gerada pelo servidor
 * @param emailLogin    o e-mail de auth.users, que é o que de fato entra
 * @param sintetico     true = endereço @essentia.local, só telefone serve
 * @returns {string}    texto pronto, sem encode
 */
export function mensagemSenhaDefinida({ primeiroNome, link, senha, emailLogin, sintetico = false }) {
  // O login por telefone foi retirado: só o e-mail entra (mesmo o interno).
  const comoEntrar = `Entre com o e-mail ${emailLogin} e esta senha:`;

  return `Olá, ${primeiroNome}! Criei uma senha nova para o seu acesso ao app do Essentia.\n\n`
    + `${link ?? ''}\n\n`
    + `${comoEntrar}\n\n`
    + `${senha}\n\n`
    + `Guarde essa senha. Qualquer dúvida, é só me chamar por aqui.`;
}


/**
 * Convite para o CUIDADOR da paciente criar o próprio acesso. Texto puro.
 * O link serve só para criar a senha; depois ele entra pelo link do app (/login)
 * com o e-mail e a senha.
 *
 * @param primeiroNome         primeiro nome do cuidador
 * @param pacientePrimeiroNome primeiro nome da paciente
 * @param link                 /cuidador/{token}
 */
export function mensagemConviteCuidador({ primeiroNome, pacientePrimeiroNome, link }) {
  let linkApp = '';
  try { linkApp = new URL(link).origin + '/login'; } catch { linkApp = ''; }
  return `Olá, ${primeiroNome}! Aqui é a Equipe da Dra. Kelly Oliveira. ` +
    `A ${pacientePrimeiroNome} indicou você para acompanhar o cuidado dela pelo app do Essentia, com o mesmo acesso que ela tem.\n\n` +
    `1) Criar o seu acesso (só na primeira vez)\n` +
    `Toque neste link e escolha a sua senha:\n${link ?? ''}\n` +
    `Atenção: este link serve apenas para criar o acesso.\n\n` +
    `2) Entrar no app (sempre que quiser)\n` +
    `Depois de criar a senha, entre pelo link do aplicativo:\n${linkApp}\n` +
    `Use o seu e-mail e a senha que você escolheu. Salve este link, ou instale o app na tela do celular (passo a passo abaixo).\n\n` +
    `Qualquer dúvida, é só me chamar por aqui.\n\n---\n\n${RODAPE_INSTALACAO}`;
}
