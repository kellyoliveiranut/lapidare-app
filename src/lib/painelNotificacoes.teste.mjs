import assert from 'node:assert/strict';
import { classificar, telefoneWhatsapp, mensagemAtivarAvisos, linkWhatsapp } from './painelNotificacoes.js';

const base = { tipo_plano: 'Essentia', volta_app_envios: 0, volta_app_enviado_em: null, tem_push: true };
const linhas = [
  { ...base, id: 1, nome: 'Ana', tem_push: false, ultimo_acesso: null },                       // nunca abriu
  { ...base, id: 2, nome: 'Bia', tem_push: false, ultimo_acesso: '2026-10-01T10:00:00Z' },     // abriu, sem push
  { ...base, id: 3, nome: 'Cléo', tem_push: false, tipo_plano: 'Avulsa', ultimo_acesso: null }, // avulsa: fora
  { ...base, id: 4, nome: 'Dani', ultimo_acesso: '2026-10-01T10:00:00Z', volta_app_envios: 1, volta_app_enviado_em: '2026-10-20T10:00:00Z' }, // pendente
  { ...base, id: 5, nome: 'Eva', ultimo_acesso: '2026-10-25T10:00:00Z', volta_app_envios: 2, volta_app_enviado_em: '2026-10-20T10:00:00Z' },  // voltou
  { ...base, id: 6, nome: 'Fê', ultimo_acesso: '2026-10-25T10:00:00Z' },                       // normal
];
const r = classificar(linhas);
assert.deepEqual(r.semNotificacao.map(p => p.id), [1, 2]);
assert.equal(r.semNotificacao[0].situacao, 'nunca_abriu');
assert.equal(r.semNotificacao[1].situacao, 'abriu');
assert.deepEqual(r.convitePendente.map(p => p.id), [4]);
assert.deepEqual(r.voltaram.map(p => p.id), [5]);
assert.deepEqual(classificar([]), { semNotificacao: [], convitePendente: [], voltaram: [] });
assert.deepEqual(classificar(undefined).semNotificacao, []);

assert.equal(telefoneWhatsapp('(91) 99999-8888'), '5591999998888');
assert.equal(telefoneWhatsapp('+55 91 99999-8888'), '5591999998888');
assert.equal(telefoneWhatsapp('091 99999-8888'), '5591999998888');
assert.equal(telefoneWhatsapp(''), null);
assert.equal(telefoneWhatsapp(null), null);

const m = mensagemAtivarAvisos('Maria Souza');
assert.ok(m.startsWith('Oi, Maria!'));
assert.ok(!/dispon|está por aqui/i.test(m));
assert.ok(mensagemAtivarAvisos('').startsWith('Oi!'));
assert.equal(linkWhatsapp({ nome: 'A', telefone: '' }), null);
assert.ok(linkWhatsapp({ nome: 'A', telefone: '91999998888' }).startsWith('https://wa.me/5591999998888?text='));
console.log('painelNotificacoes: ok');
