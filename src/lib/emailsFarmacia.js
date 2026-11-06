/**
 * E-mails de destino da farmácia (até 2). Tira espaços e repetidos, descarta
 * vazios e devolve a lista pronta para o envio.
 */
export function emailsFarmacia(...emails) {
  const vistos = new Set();
  const lista = [];
  for (const e of emails) {
    const v = String(e ?? '').trim();
    if (!v || vistos.has(v.toLowerCase())) continue;
    vistos.add(v.toLowerCase());
    lista.push(v);
  }
  return lista;
}
