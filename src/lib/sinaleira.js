/* Estilo e regras de cor compartilhados pelas telas de evolução (paciente, nutri, apresentação). */
import { METRICAS, sentidoDaVariacao } from './evolucaoAvaliacoes.js';

export const CARD = {
  background: 'var(--paper, #fff)', border: '0.5px solid var(--hair, #d9d3c9)',
  borderRadius: 16, boxShadow: 'var(--shadow-sm, none)',
};

/* Sinaleira: só para Emagrecimento. Verde = foi no sentido desejado, amarelo = estável,
   terracota = foi no sentido contrário. Sempre com seta/sinal (cor não é o único aviso).
   Oncologia: sem semáforo — o foco é função e força. */
export const SINAL = {
  bom:    { cor: '#5f8a4b', fundo: '#e6f0df', nome: 'no caminho' },
  neutro: { cor: '#b8902f', fundo: '#f8efd2', nome: 'estável' },
  ruim:   { cor: '#c0704f', fundo: '#f6e3db', nome: 'mudou ao contrário' },
};
export function sinalDe(campo, comp, pesoNeutro) {
  if (!comp) return null;
  const sentido = sentidoDaVariacao(campo, comp.dif);
  if (pesoNeutro || METRICAS[campo].melhorMenor == null) return null; // sem sentido definido: sem cor
  return SINAL[sentido];
}

/** "4 meses e 12 dias", "3 semanas", "5 dias". */
export function tempoDe(dias) {
  if (dias < 1) return 'hoje';
  if (dias < 14) return `${dias} dia${dias === 1 ? '' : 's'}`;
  if (dias < 60) { const s = Math.floor(dias / 7); return `${s} semanas`; }
  const m = Math.floor(dias / 30);
  return `${m} meses`;
}


