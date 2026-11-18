/* Venda com ENTRADA: uma parcela paga na hora + o restante, que pode virar
   parcelas mensais iguais ou ficar "a combinar" (sem parcelas por enquanto).

   Exemplos reais da Kelly:
     • total 1900, entrada 500, 4 parcelas  → 500 (paga) + 4 × 350
     • total 2700, entrada 1000, a combinar → 1000 (paga) + restante 1700 a combinar

   O "a combinar" NÃO é gravado em lugar nenhum: é a diferença entre o valor
   total da venda e a soma das parcelas (restanteACombinar). Quando a Kelly
   define o pagamento, as parcelas entram e a diferença some sozinha.
   Funções puras (rodam no node; ver parcelasEntrada.teste.mjs). */

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

/**
 * Parcelas da venda com entrada. A entrada é a parcela 1, já paga na data da
 * venda. `nRestante` 0 = restante a combinar (só a entrada é criada).
 * Devolve [] quando os números não fecham — quem chama valida antes com
 * validarEntrada() e mostra a frase.
 */
export function gerarParcelasComEntrada({ valorTotal, entrada, dataVenda, nRestante }) {
  if (validarEntrada({ valorTotal, entrada, nRestante })) return [];
  const linhas = [{
    numero: 1, valor: emReais(cent(entrada)), vencimento: dataVenda,
    status: 'pago', data_pgto: dataVenda,
  }];
  const resto = cent(valorTotal) - cent(entrada);
  if (nRestante > 0 && resto > 0) {
    linhas.push(...dividirEmParcelas({
      valor: emReais(resto), n: nRestante,
      primeiroVencimento: somarMeses(dataVenda, 1), numeroInicial: 2,
    }));
  }
  return linhas;
}

/** Frase de erro, ou null se a entrada está ok. */
export function validarEntrada({ valorTotal, entrada, nRestante }) {
  const t = cent(valorTotal), e = cent(entrada);
  if (!(t > 0)) return 'Informe o valor total.';
  if (!(e > 0)) return 'Informe o valor da entrada.';
  if (e >= t) return 'A entrada tem que ser menor que o valor total. Para pagar tudo de uma vez, use a forma de pagamento normal.';
  if (!Number.isInteger(nRestante) || nRestante < 0 || nRestante > 12) return 'Número de parcelas do restante inválido.';
  return null;
}

/** Quanto da venda ainda não tem parcela (a combinar). 0 quando fecha. */
export function restanteACombinar(valorTotal, parcelas) {
  const soma = (parcelas ?? []).reduce((a, p) => a + cent(p.valor), 0);
  const falta = cent(valorTotal) - soma;
  return falta > 0 ? emReais(falta) : 0;
}
