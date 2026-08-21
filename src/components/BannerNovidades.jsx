import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import novidades from '../data/novidades.json';

/**
 * Banner de novidades do painel da nutri.
 *
 * A fonte é o `src/data/novidades.json`, editado à mão a cada mudança que
 * valha contar. Import estático: entra no bundle, não custa requisição.
 *
 * Cada tela mostra a novidade mais recente DELA — não a mais recente do app.
 * Assim a nutri vai encontrando uma novidade por tela, conforme visita cada
 * uma ao longo dos dias, em vez de uma só engolir todas as outras.
 *
 * Só o painel da nutri monta este componente (NutriLayout), então "toda tela"
 * aqui quer dizer toda tela da nutri. A paciente nunca vê banner.
 *
 * O "já visto" é por dispositivo, de propósito — a alternativa era uma coluna
 * em `nutris` e um update no banco a cada X clicado.
 */

const CHAVE = 'novidades_vistas';        // objeto: um id por balde
const CHAVE_ANTIGA = 'novidades_vista';  // formato anterior: um id solto
const GLOBAL = '*';

/**
 * O balde de uma novidade no localStorage: a rota dela, ou '*' se for global.
 *
 * É a ROTA DA NOVIDADE, nunca a rota onde a nutri está. Para as novidades de
 * tela as duas coincidem; para as globais, não — e chavear pela tela atual
 * faria a mesma novidade global reaparecer em cada uma das outras telas,
 * exigindo dispensá-la uma vez por tela.
 */
const balde = n => n.rota ?? GLOBAL;

/**
 * Esta novidade vale para esta tela?
 *
 * `rota` nula OU ausente → toda tela do painel; o `== null` cobre as duas, então
 * esquecer o campo faz a novidade aparecer demais, nunca sumir.
 *
 * Senão, igualdade exata ou prefixo seguido de '/', para cobrir as rotas com id
 * embutido: /nutri/pacientes pega /nutri/pacientes/<uuid>. O '/' é o que impede
 * /nutri/chat de casar com um futuro /nutri/chatbot.
 */
function valeAqui(n, pathname) {
  if (n.rota == null) return true;
  return pathname === n.rota || pathname.startsWith(n.rota + '/');
}

/** Tolerante a lixo: formato antigo, JSON quebrado ou modo privado viram {}. */
function lerVistas() {
  try {
    const cru = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    return cru && typeof cru === 'object' && !Array.isArray(cru) ? cru : {};
  } catch { return {}; }
}

/**
 * "2026-08-20" → "20/08". Recortado na mão porque `new Date('2026-08-20')` é
 * lido como UTC e, no fuso de São Paulo, voltaria para o dia 19.
 */
function fmtData(iso) {
  const [, mes, dia] = String(iso ?? '').split('-');
  return mes && dia ? `${dia}/${mes}` : '';
}

export default function BannerNovidades() {
  const { pathname } = useLocation();
  const [vistas, setVistas] = useState(lerVistas);

  // Maior id entre as que valem aqui — a ordem dentro do arquivo não decide
  // nada. Global e específica disputam juntas: se as duas estiverem pendentes
  // na mesma tela, a mais recente vem primeiro e a outra na sequência, ao
  // dispensar. Nenhuma se perde; elas se enfileiram.
  const novidade = (Array.isArray(novidades) ? novidades : [])
    .filter(n => valeAqui(n, pathname))
    .reduce((a, b) => (a == null || b.id > a.id ? b : a), null);

  // Comparação por !==, nunca por >: se um dia um id sair fora de ordem, o
  // pior caso é o banner aparecer uma vez a mais, não sumir para sempre.
  if (!novidade || String(novidade.id) === vistas[balde(novidade)]) return null;

  function dispensar() {
    const proximo = { ...vistas, [balde(novidade)]: String(novidade.id) };
    try {
      localStorage.setItem(CHAVE, JSON.stringify(proximo));
      localStorage.removeItem(CHAVE_ANTIGA);  // o formato antigo não volta a ser lido
    } catch { /* modo privado */ }
    setVistas(proximo);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', marginBottom: 16,
      background: 'var(--bg2)',
      border: '0.5px solid var(--border)',
      borderLeft: '2px solid var(--amber)',
      borderRadius: 10,
    }}>
      <i className="ti ti-sparkles"
        style={{ fontSize: 15, color: 'var(--amber)', marginTop: 2, flexShrink: 0 }}
        aria-hidden="true"></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          {novidade.texto}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {fmtData(novidade.data)}
        </div>
      </div>
      <button type="button" onClick={dispensar} aria-label="Dispensar novidade"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', fontSize: 15, lineHeight: 1, padding: 4,
          flexShrink: 0,
        }}>
        <i className="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  );
}
