// Quem recebe o lembrete "volte ao app". Função pura: sem banco, sem relógio —
// quem chama traz a paciente e o instante de agora.
//
// Regras (valores em CONFIG, para mudar num lugar só):
//  - paciente ativa, com conta, acesso não pausado e plano que não seja avulsa
//    (mesmo critério do push de aniversário: avulsa não usa o app todo);
//  - sem abrir o app há DIAS_SEM_ACESSO dias ou mais (pacientes.ultimo_acesso,
//    carimbado em session.jsx a cada vez que o app abre logada);
//  - no máximo MAX_ENVIOS lembretes por ausência, com INTERVALO_DIAS entre eles.
//    Quando ela volta (ultimo_acesso depois do último lembrete), a contagem
//    recomeça;
//  - quem nunca abriu o app (sem ultimo_acesso) não entra: para ela o contato
//    é o convite da nutri, não um "volte".
const CONFIG = { DIAS_SEM_ACESSO: 7, INTERVALO_DIAS: 14, MAX_ENVIOS: 3 };
const DIA_MS = 24 * 3600 * 1000;

function enviosDaAusencia(p) {
  const env = p.volta_app_enviado_em ? Date.parse(p.volta_app_enviado_em) : NaN;
  const ult = Date.parse(p.ultimo_acesso);
  // Último lembrete é anterior ao último acesso: ela voltou, conta do zero.
  if (!Number.isFinite(env) || env < ult) return 0;
  return Number(p.volta_app_envios) || 0;
}

function deveLembrar(p, agora, cfg = CONFIG) {
  if (!p || p.status_paciente !== 'ativo' || !p.user_id || p.acesso_pausado) return false;
  if (p.tipo_plano?.trim().toLowerCase() === 'avulsa') return false;
  if (!p.ultimo_acesso) return false;
  const ult = Date.parse(p.ultimo_acesso);
  if (!Number.isFinite(ult)) return false;
  if (agora - ult < cfg.DIAS_SEM_ACESSO * DIA_MS) return false;
  const envios = enviosDaAusencia(p);
  if (envios >= cfg.MAX_ENVIOS) return false;
  if (envios > 0) {
    const env = Date.parse(p.volta_app_enviado_em);
    if (agora - env < cfg.INTERVALO_DIAS * DIA_MS) return false;
  }
  return true;
}

// Sem promessa, sem cobrança, sem conteúdo clínico (CFN 856). Dois textos que
// se alternam: `envios` é quantos lembretes ela já recebeu nesta ausência (0 =
// primeiro), para quem não voltou não ler a mesma frase duas vezes seguidas.
const TEXTOS = [
  (n) => `${n}, sua nutri está por aqui quando você precisar. Que tal passar no app hoje?`,
  (n) => `${n}, no seu tempo: seu espaço no Essentia está pronto para quando você quiser voltar.`,
];
const SEM_NOME = ['Sua nutri está por aqui quando você precisar. Que tal passar no app hoje?',
  'No seu tempo: seu espaço no Essentia está pronto para quando você quiser voltar.'];

function textoPush(nome, envios = 0) {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  const i = Math.abs(Number(envios) || 0) % TEXTOS.length;
  return { title: 'Essentia', body: primeiro ? TEXTOS[i](primeiro) : SEM_NOME[i], url: '/paciente/inicio' };
}

module.exports = { CONFIG, deveLembrar, enviosDaAusencia, textoPush };
