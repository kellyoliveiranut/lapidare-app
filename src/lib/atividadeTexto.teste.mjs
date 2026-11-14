import { descreverAtividade } from './atividadeTexto.js';
let ok = 0, f = 0;
const t = (n, a, b) => { if (a === b) { ok++; console.log('PASS ', n); } else { f++; console.log('FALHA', n, '\n ', a, '\n ', b); } };
t('abriu ficha', descreverAtividade({ acao: 'abriu_ficha', tabela: 'pacientes' }, 'Lorena'), 'abriu a ficha de Lorena');
t('alterou cadastro', descreverAtividade({ acao: 'alterou', tabela: 'pacientes' }, 'Lorena'), 'alterou o cadastro de Lorena');
t('criou consulta', descreverAtividade({ acao: 'criou', tabela: 'consultas' }, 'Ana'), 'criou uma consulta de Ana');
t('serviço sem paciente', descreverAtividade({ acao: 'alterou', tabela: 'servicos' }, null), 'alterou um serviço');
t('tabela desconhecida', descreverAtividade({ acao: 'excluiu', tabela: 'xyz' }, null), 'excluiu dados (xyz)');
console.log(`\n${ok} PASS, ${f} FALHA`); process.exit(f ? 1 : 0);
