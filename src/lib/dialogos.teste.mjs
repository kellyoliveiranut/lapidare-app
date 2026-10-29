import assert from 'node:assert/strict';
import { confirmar, _ligar } from './dialogos.js';

// Sem host e sem window: nega por segurança.
assert.equal(await confirmar('x'), false);

// Com host: a promessa só resolve quando o host responde.
let pedido;
const desligar = _ligar(p => { pedido = p; });
const p = confirmar('Apagar?', { confirmarRotulo: 'Apagar' });
assert.equal(pedido.texto, 'Apagar?');
assert.equal(pedido.confirmarRotulo, 'Apagar');
assert.equal(pedido.cancelarRotulo, 'Voltar');
pedido.resolve(true);
assert.equal(await p, true);

// Depois de desligar, volta ao comportamento sem host.
desligar();
assert.equal(await confirmar('y'), false);
console.log('dialogos: ok');
