// A lógica pura (nivelExame, textoRef, fmtNumExame) mora em
// exames_referencia.js: lá ela roda no node e pode ser testada, e este
// arquivo fica só com componentes — que é o que o react-refresh exige.
import { fmtNumExame, nivelExame, textoRef } from '../data/exames_referencia.js';

/* ============================================================
   VALOR DE EXAME COM REFERÊNCIA — usado pela nutri E pela paciente

   Substitui o ExamVal que morava dentro de _TratamentoOncologico.jsx e só
   servia à nutri. As cores são exatamente as de lá; o que mudou é que
   agora existe também o NÚMERO da faixa, e que a paciente passa a ver os
   dois.

   REGRA DESTE ARQUIVO: nada de tokens de uma tela só. --text2/--text3 são
   definidos em nutri.css e não existem no lado da paciente; --ink/--muted
   são o contrário. Por isso as cores de nível são hex literais (as mesmas
   de antes) e o estado vazio herda a cor de quem chamou.
   ============================================================ */

const CORES_NIVEL = {
  critico: '#dc2626',
  atencao: '#d97706',
  normal:  '#16a34a',
};

/**
 * O valor colorido, opcionalmente seguido da faixa de referência.
 *
 * `mostrarRef` existe porque os dois lados mostram a faixa em lugares
 * diferentes: na tabela da nutri ela vai UMA vez no cabeçalho da coluna
 * (por célula repetiria em toda linha do histórico), e no card da paciente
 * vai em cada linha, porque ela lê um exame de cada vez.
 */
export default function ValorExame({ campo, valor, sexo, mostrarRef = false, mostrarUnidade = false }) {
  if (valor == null) {
    return <span style={{ opacity: .45 }}>—</span>;
  }
  const nivel = nivelExame(campo, valor);
  const cor = CORES_NIVEL[nivel] ?? 'inherit';
  const ref = mostrarRef ? textoRef(campo, sexo) : null;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: cor, fontWeight: nivel === 'normal' ? 400 : 600 }}>
        {fmtNumExame(valor, campo.dec ?? 0)}
      </span>
      {mostrarUnidade && campo.unidade && (
        <span style={{ fontSize: '.85em', opacity: .6, marginLeft: 3 }}>{campo.unidade}</span>
      )}
      {ref && (
        <span style={{ fontSize: '.82em', opacity: .55, marginLeft: 5, whiteSpace: 'nowrap' }}>
          ref. {ref}
        </span>
      )}
    </span>
  );
}

/**
 * Uma linha explicando as três cores. Antes deste arquivo a cor existia sem
 * legenda nenhuma: a nutri via vermelho e tinha que lembrar o porquê.
 */
export function LegendaExames({ style }) {
  const itens = [
    ['normal',  'dentro do alerta'],
    ['atencao', 'atenção'],
    ['critico', 'crítico'],
  ];
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
      fontSize: 11, opacity: .7, ...style,
    }}>
      {itens.map(([nivel, label]) => (
        <span key={nivel} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: CORES_NIVEL[nivel] }} />
          {label}
        </span>
      ))}
    </div>
  );
}
