// Login por telefone DESATIVADO (pedido da Kelly, 2026-11-06): o app entra só
// com e-mail e senha. O endpoint fica respondendo 410 para que nenhum cliente
// antigo (aba aberta, app instalado) consiga tentar senhas por telefone.
exports.handler = async () => ({
  statusCode: 410,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: 'Login por telefone desativado. Entre com o e-mail e a senha.' }),
});
