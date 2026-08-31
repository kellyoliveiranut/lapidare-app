import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getProtocolo } from '../../lib/protocoloCiclo.js';
import { dataBR } from '../../lib/utils.js';
import '../../styles/lamina.css';

/**
 * Lâmina imprimível de um protocolo — documento para ENTREGAR À PACIENTE.
 *
 * Mora fora do NutriLayout de propósito (ver App.jsx): a página é o documento,
 * então não há sidebar nem topbar para desmontar na impressão.
 *
 * O que o card interno mostra e esta lâmina NÃO mostra, de propósito:
 *   • o banner "Visível apenas para a nutri";
 *   • o meta.aviso do catálogo, que começa com "Rascunho para revisao...";
 *   • o selo `rascunho` de cada protocolo;
 *   • `indicacao` — em 52 dos valores termina em "verificar indicação", que é
 *     anotação de trabalho;
 *   • `fases_ciclo` — só o BEP tem, e os campos são drogas/sintomas/foco;
 *   • `relacionado_a` de cada efeito — nome de droga não ajuda quem vai ler.
 *
 * O parâmetro da URL é a CHAVE normalizada, não o nome: "CAPOX / XELOX" tem
 * barra e "ZOLADEX 3,6MG" tem vírgula, e barra não sobrevive a um path param
 * nem escapada. getProtocolo() casa por chave e faz o caminho de volta.
 */
export default function LaminaProtocolo() {
  const { chave } = useParams();
  const [params] = useSearchParams();
  const paciente = (params.get('paciente') ?? '').trim();

  const proto = getProtocolo(chave);

  if (!proto) {
    return (
      <div className="lamina-pagina">
        <div className="la-vazio">
          <p style={{ marginBottom: 12 }}>Protocolo não encontrado no catálogo.</p>
          <Link className="la-btn" to="/nutri/protocolos">Voltar para os protocolos</Link>
        </div>
      </div>
    );
  }

  const efeitos = proto.efeitos ?? [];
  const alertas = proto.sinais_alerta ?? [];

  return (
    <div className="lamina-pagina">
      <div className="la-acoes">
        {/* Sem impressão automática: os documentos internos do projeto disparam
            window.print() sozinhos porque a janela existe só para isso. Esta
            página tem valor de prévia — a nutri lê antes de gastar papel. */}
        <button type="button" className="la-btn primaria" onClick={() => window.print()}>
          <i className="ti ti-printer" aria-hidden="true" /> Imprimir
        </button>
        <Link className="la-btn" to="/nutri/protocolos">
          <i className="ti ti-arrow-left" aria-hidden="true" /> Voltar
        </Link>
      </div>

      <div className="la-folha">
        <div className="la-marca">Essentia</div>
        <div className="la-credencial">
          Nutrição em Oncologia e Genética · Kelly Oliveira · CRN 3801
        </div>

        <div className="la-titulo">Orientações nutricionais durante seu tratamento</div>
        <div className="la-protocolo">{proto.nome}</div>
        {paciente && <div className="la-paciente">Preparado para {paciente}</div>}

        {/* Seção ausente é omitida INTEIRA, título junto — 14 dos 74 protocolos
            não têm conduta_base e 13 não têm sinais_alerta. */}
        {proto.conduta_base && (
          <div className="la-conduta">{proto.conduta_base}</div>
        )}

        {efeitos.length > 0 && (
          <>
            <div className="la-secao">O que pode acontecer e como cuidar</div>
            <div>
              {efeitos.map((ef, i) => (
                <div className="la-efeito" key={i}>
                  <div className="la-efeito-nome">{ef.efeito}</div>
                  <div className="la-efeito-manejo">{ef.manejo}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {alertas.length > 0 && (
          <div className="la-alerta">
            <div className="la-alerta-titulo">Procure a equipe se aparecer</div>
            <ul className="la-alerta-lista">
              {alertas.map((s, i) => (
                <li className="la-alerta-item" key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="la-rodape">
          Kelly Oliveira · CRN 3801 · Essentia — Nutrição em Oncologia e Genética
          <br />
          Impresso em {dataBR(new Date())}
        </div>
      </div>
    </div>
  );
}
