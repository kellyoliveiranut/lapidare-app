// Janelas de confirmação do app (no lugar de window.confirm).
// `confirmar(texto)` devolve uma Promise<boolean>; a janela é desenhada
// por <DialogoHost /> (src/components/DialogoHost.jsx), montado uma vez no App.
let ouvinte = null;
let fila = [];

export function _ligar(fn) {
  ouvinte = fn;
  if (fn && fila.length) { const f = fila; fila = []; f.forEach(p => fn(p)); }
  return () => { if (ouvinte === fn) ouvinte = null; };
}

export function confirmar(texto, { confirmarRotulo = 'Confirmar', cancelarRotulo = 'Voltar' } = {}) {
  return new Promise(resolve => {
    const pedido = { texto, confirmarRotulo, cancelarRotulo, resolve };
    // Sem host montado (testes, tela fora do App): cai no confirm do navegador.
    if (!ouvinte) {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        resolve(window.confirm(texto));
      } else {
        resolve(false);
      }
      return;
    }
    ouvinte(pedido);
  });
}

// Aviso com um único botão (no lugar de window.alert). Devolve uma Promise que resolve quando a
// pessoa fecha; quem não precisa esperar pode ignorá-la. Sem host montado, cai no alert do navegador.
export function avisar(texto, { rotulo = 'OK' } = {}) {
  return new Promise(resolve => {
    const pedido = { texto, confirmarRotulo: rotulo, cancelarRotulo: null, aviso: true, resolve: () => resolve() };
    if (!ouvinte) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(texto);
      resolve();
      return;
    }
    ouvinte(pedido);
  });
}
