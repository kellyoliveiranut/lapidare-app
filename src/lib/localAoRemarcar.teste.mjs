process.env.TZ = process.env.TZ_TESTE || 'America/Belem';
import assert from 'node:assert/strict';
const { localAoRemarcar, localDivergente } = await import('./opcoesPaciente.js');
const CTO = { id: 'cto', nome: 'CTO', ativo: true, dias_semana: [1, 5] };
const VIL = { id: 'vil', nome: 'Village', ativo: true, dias_semana: [2, 3, 4] };
const L = [CTO, VIL];
const seg = '2026-11-09', ter = '2026-11-10', sex = '2026-11-13', sab = '2026-11-14';
const base = { modalidade: 'presencial', locais: L };
// CTO remarcada para terça -> Village
assert.equal(localAoRemarcar({ ...base, localId: 'cto', dataISO: ter }), 'vil');
// continua em dia do CTO -> não mexe
assert.equal(localAoRemarcar({ ...base, localId: 'cto', dataISO: sex }), null);
// sem local ganha o da regra
assert.equal(localAoRemarcar({ ...base, localId: '', dataISO: seg }), 'cto');
// sábado: regra não decide -> não mexe
assert.equal(localAoRemarcar({ ...base, localId: 'cto', dataISO: sab }), null);
// online nunca
assert.equal(localAoRemarcar({ ...base, modalidade: 'online', localId: 'cto', dataISO: ter }), null);
// local inativo gravado não atende
assert.equal(localAoRemarcar({ ...base, locais: [{ ...CTO, ativo: false }, VIL], localId: 'cto', dataISO: ter }), 'vil');
// divergente: devolve o local previsto
assert.equal(localDivergente({ ...base, localId: 'cto', dataISO: ter })?.id, 'vil');
assert.equal(localDivergente({ ...base, localId: 'cto', dataISO: seg }), null);
assert.equal(localDivergente({ ...base, localId: '', dataISO: ter }), null);
console.log('ok localAoRemarcar');
