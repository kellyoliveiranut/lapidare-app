// node netlify/functions/volta-ao-app/decidir.teste.mjs
import { createRequire } from 'node:module';
const { deveLembrar, textoPush, CONFIG } = createRequire(import.meta.url)('./decidir.js');
let ok = 0, ruim = 0;
const t = (n, o, e) => { const p = JSON.stringify(o) === JSON.stringify(e); p ? ok++ : ruim++; console.log(`${p ? 'PASS' : 'FALHA'}  ${n}${p ? '' : `  (esperado ${JSON.stringify(e)}, obteve ${JSON.stringify(o)})`}`); };
const D = 24 * 3600 * 1000, AGORA = Date.parse('2026-10-27T13:30:00Z');
const dias = (n) => new Date(AGORA - n * D).toISOString();
const base = { status_paciente: 'ativo', user_id: 'u', acesso_pausado: false, tipo_plano: 'trimestral', ultimo_acesso: dias(10), volta_app_enviado_em: null, volta_app_envios: 0 };

t('10 dias sem acesso → lembra', deveLembrar(base, AGORA), true);
t('exatamente 7 dias → lembra', deveLembrar({ ...base, ultimo_acesso: dias(7) }, AGORA), true);
t('6 dias → não', deveLembrar({ ...base, ultimo_acesso: dias(6) }, AGORA), false);
t('nunca abriu o app → não', deveLembrar({ ...base, ultimo_acesso: null }, AGORA), false);
t('sem conta → não', deveLembrar({ ...base, user_id: null }, AGORA), false);
t('acesso pausado → não', deveLembrar({ ...base, acesso_pausado: true }, AGORA), false);
t('arquivada/inativa → não', deveLembrar({ ...base, status_paciente: 'arquivado' }, AGORA), false);
t('avulsa (com espaço e maiúscula) → não', deveLembrar({ ...base, tipo_plano: ' Avulsa ' }, AGORA), false);
t('enviou há 5 dias, mesma ausência → não', deveLembrar({ ...base, volta_app_enviado_em: dias(5), volta_app_envios: 1 }, AGORA), false);
t('enviou há 14 dias → lembra de novo', deveLembrar({ ...base, ultimo_acesso: dias(20), volta_app_enviado_em: dias(14), volta_app_envios: 1 }, AGORA), true);
t('já 3 envios → para', deveLembrar({ ...base, ultimo_acesso: dias(60), volta_app_enviado_em: dias(20), volta_app_envios: 3 }, AGORA), false);
t('voltou depois do último lembrete e sumiu de novo: conta do zero',
  deveLembrar({ ...base, ultimo_acesso: dias(8), volta_app_enviado_em: dias(30), volta_app_envios: 3 }, AGORA), true);
t('ultimo_acesso inválido → não', deveLembrar({ ...base, ultimo_acesso: 'x' }, AGORA), false);
t('config padrão', CONFIG, { DIAS_SEM_ACESSO: 7, INTERVALO_DIAS: 14, MAX_ENVIOS: 3 });
t('1º lembrete', textoPush('Maria da Silva', 0).body, 'Maria, sua nutri acompanha o que você registra no app. Conta como você está hoje?');
t('2º lembrete', textoPush('Maria', 1).body, 'Maria, no seu ritmo: quando puder, registre como você está no app. Sua nutri acompanha.');
t('3º lembrete', textoPush('Maria', 2).body, 'Maria, seu acompanhamento continua no app. Sua nutri vê seus registros e cuida do seu plano com eles.');
t('4º (não ocorre, máx. 3) volta ao primeiro', textoPush('Maria', 3).body === textoPush('Maria', 0).body, true);
t('sem nome (1º)', textoPush(null, 0).body, 'Sua nutri acompanha o que você registra no app. Conta como você está hoje?');
t('sem nome (2º)', textoPush('  ', 1).body.startsWith('No seu ritmo'), true);
t('sem nome (3º)', textoPush('', 2).body.startsWith('Seu acompanhamento continua'), true);
t('envios inválido cai no 1º', textoPush('Ana', undefined).body.startsWith('Ana, sua nutri acompanha'), true);
t('nenhum texto fala em "disponível" ou "está por aqui"', [0,1,2].every(i => !/dispon|está por aqui/i.test(textoPush('Ana', i).body)), true);
t('abre a tela inicial da paciente', textoPush('A').url, '/paciente/inicio');
console.log(`${ok} passaram, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
