/* Leitura automática do laudo (PDF/foto) → campos do formulário de exame.
   Funções puras (rodam no node; ver lerExamePdf.teste.mjs). Quem chama a IA é
   o _TratamentoOncologico.jsx; aqui ficam o pedido e a conferência da resposta.

   Regras: o que o laudo traz entra como veio. Nada é calculado nem convertido
   (diferencial só em % não vira valor absoluto) e nenhum número é inventado. */
import { CAMPOS_EXAME, CAMPOS_EXAME_EXTRA } from '../data/exames_referencia.js';

const TODOS = [
  ...CAMPOS_EXAME.map(c => ({ ...c, chave: c.key, estado: c.key })),
  ...CAMPOS_EXAME_EXTRA.map(c => ({ ...c, chave: c.key, estado: 'x_' + c.key })),
];

export function montarPedidoExame() {
  const linhas = TODOS.map(c => `  "${c.chave}": "number ou null"   // ${c.label}, em ${c.unidade}`).join('\n');
  return `Analise este exame laboratorial e devolva APENAS um JSON puro (sem markdown, sem explicações) neste formato:
{
  "data_exame": "YYYY-MM-DD, data da coleta, ou null",
${linhas},
  "com_sinal": { "chave": "texto exatamente como impresso, só para valores impressos com < ou >" },
  "outros": [ { "nome": "string", "valor": "string com unidade" } ]
}
Regras:
- Use o valor numérico do laudo, na unidade indicada acima, com ponto decimal. Não arredonde, não calcule e não converta unidade.
- Contagens do diferencial (neutrófilos, linfócitos, eosinófilos, basófilos, monócitos, bastões) devem vir em valor ABSOLUTO (/mm³), como o laudo imprime. Se o laudo traz só a porcentagem, use null. Não calcule.
- Se o valor vier impresso com "<" ou ">" (ex.: ">1504"), ponha o número em seu campo e o texto original em "com_sinal".
- Item que não existe como chave acima (ex.: ferritina, TSH) vai em "outros", com o valor e a unidade como impressos. Não repita nesse array o que já foi para uma chave.
- Item que não está no laudo: null. Nunca invente valor.`;
}

const comoNumero = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Resposta da IA (objeto) → { dataExame, valores (chaves do formulário → texto),
 *  comSinal [{ rotulo, texto }], outros [{ nome, valor }] }. */
export function interpretarExame(parsed) {
  const valores = {};
  const comSinal = [];
  for (const c of TODOS) {
    const n = comoNumero(parsed?.[c.chave]);
    if (n == null) continue;
    valores[c.estado] = String(n);
    const t = parsed?.com_sinal?.[c.chave];
    if (t) comSinal.push({ rotulo: c.label, texto: String(t) });
  }
  const outros = (Array.isArray(parsed?.outros) ? parsed.outros : [])
    .filter(o => o && o.nome && o.valor != null && String(o.valor).trim() !== '')
    .map(o => ({ nome: String(o.nome).trim(), valor: String(o.valor).trim() }));
  const d = parsed?.data_exame;
  return { dataExame: /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? d : null, valores, comSinal, outros };
}
