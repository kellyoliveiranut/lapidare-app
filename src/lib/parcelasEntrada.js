/* Venda com ENTRADA: uma parcela paga na hora + o restante, que pode virar
   parcelas mensais iguais ou ficar "a combinar" (sem parcelas por enquanto).

   Exemplos reais da Kelly:
     • total 1900, entrada 500, 4 parcelas  → 500 (paga) + 4 × 350
     • total 2700, entrada 1000, a combinar → 1000 (paga) + restante 1700 a combinar

   O "a combinar" NÃO é gravado em lugar nenhum: é a diferença entre o valor
   total da venda e a soma das parcelas (restanteACombinar). Quando a Kelly
   define o pagamento, as parcelas entram e a diferença some sozinha.
   O restante pode ir para Pix/dinheiro (parcelas mensais sem taxa) ou para o
   CARTÃO (crédito 1x ou parcelado, com taxa da maquininha só nessas parcelas);
   a entrada é sempre paga na data da venda, em dinheiro ou Pix.
   Funções puras (rodam no node; ver parcelasEntrada.teste.mjs). */
import { gerarParcelas, distribuirTaxa } from './utils.js';

const cent = (v) => Math.round(Number(v) * 100);
const emReais = (c) => Number((c / 100).toFixed(2));

// Soma meses sem estourar o fim do mês (31/01 + 1 mês = 28/02), igual ao utils.
function somarMeses(iso, m) {
  const d = new Date(iso + 'T00:00:00');
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + m);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimo));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Divide `valor` em n parcelas mensais; a última absorve os centavos. */
export function dividirEmParcelas({ valor, n, primeiroVencimento, numeroInicial = 1 }) {
  const total = cent(valor);
  const q = Math.max(1, Math.floor(Number(n) || 1));
  const base = Math.floor(total / q);
  return Array.from({ length: q }, (_, i) => ({
    numero: numeroInicial + i,
    valor: emReais(i === q - 1 ? total - base * (q - 1) : base),
    vencimento: somarMeses(primeiroVencimento, i),
    status: 'pendente',
  }));
}

const ROTULO_ENTRADA = { dinheiro: 'Entrada em dinheiro', pix: 'Entrada no Pix' };

/**
 * Parcelas da venda com entrada. A entrada é a parcela 1, já paga na data da
 * venda. `nRestante` 0 = restante a combinar (só a entrada é criada).
 * `forma`: pix/dinheiro (restante em parcelas mensais pendentes, sem taxa) ou
 * parcelado/credito1x (restante no cartão: linhas com `cartao: true`, que são
 * as únicas a receber taxa; `antecipado` marca todas como recebidas na venda).
 * Devolve [] quando os números não fecham — quem chama valida antes com
 * validarEntrada() e mostra a frase.
 */
export function gerarParcelasComEntrada({
  valorTotal, entrada, dataVenda, nRestante, forma = 'pix', formaEntrada, antecipado = false,
}) {
  if (validarEntrada({ valorTotal, entrada, nRestante, forma })) return [];
  const fe = formaEntrada ?? (forma === 'dinheiro' ? 'dinheiro' : forma === 'pix' ? 'pix' : 'dinheiro');
  const linhas = [{
    numero: 1, valor: emReais(cent(entrada)), vencimento: dataVenda,
    status: 'pago', data_pgto: dataVenda, obs: ROTULO_ENTRADA[fe] ?? 'Entrada', cartao: false,
  }];
  const resto = cent(valorTotal) - cent(entrada);
  if (nRestante > 0 && resto > 0) {
    if (forma === 'parcelado' || forma === 'credito1x') {
      gerarParcelas({
        forma_pgto: forma, valor_total: emReais(resto), data_venda: dataVenda,
        n_parcelas: nRestante, antecipado,
      }).forEach((p, i) => linhas.push({ ...p, numero: 2 + i, cartao: true }));
    } else {
      linhas.push(...dividirEmParcelas({
        valor: emReais(resto), n: nRestante,
        primeiroVencimento: somarMeses(dataVenda, 1), numeroInicial: 2,
      }).map(p => ({ ...p, cartao: false })));
    }
  }
  return linhas;
}

/** Taxa da maquininha repartida só entre as parcelas do cartão; 0 nas demais. */
export function taxasPorLinha(taxaTotal, linhas) {
  const idx = linhas.map((l, i) => (l.cartao ? i : -1)).filter(i => i >= 0);
  const parte = distribuirTaxa(taxaTotal, idx.map(i => linhas[i]));
  const out = linhas.map(() => 0);
  idx.forEach((i, k) => { out[i] = parte[k] ?? 0; });
  return out;
}

/** Frase de erro, ou null se a entrada está ok. */
export function validarEntrada({ valorTotal, entrada, nRestante, forma = 'pix' }) {
  const t = cent(valorTotal), e = cent(entrada);
  if (!(t > 0)) return 'Informe o valor total.';
  if (!(e > 0)) return 'Informe o valor da entrada.';
  if (e >= t) return 'A entrada tem que ser menor que o valor total. Para pagar tudo de uma vez, use a forma de pagamento normal.';
  if (!Number.isInteger(nRestante) || nRestante < 0 || nRestante > 12) return 'Número de parcelas do restante inválido.';
  if (forma === 'parcelado' && nRestante === 1) return 'No cartão parcelado, escolha 2 parcelas ou mais (ou use o crédito 1x).';
  if (forma === 'credito1x' && nRestante > 1) return 'No crédito 1x o restante é uma parcela só.';
  return null;
}

/** Quanto da venda ainda não tem parcela (a combinar). 0 quando fecha. */
export function restanteACombinar(valorTotal, parcelas) {
  const soma = (parcelas ?? []).reduce((a, p) => a + cent(p.valor), 0);
  const falta = cent(valorTotal) - soma;
  return falta > 0 ? emReais(falta) : 0;
}
