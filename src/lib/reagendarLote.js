// Reagendamento em lote da Agenda. Funções puras: sem banco, sem relógio.
import { intervaloConsulta, intervalosSeCruzam } from './agendaConflitos.js';
import { partesLocaisISO, dataBR } from './utils.js';

const somaDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Segunda a domingo da semana seguinte a `hojeISO` (YYYY-MM-DD). */
export function semanaQueVem(hojeISO) {
  const d = new Date(`${hojeISO}T12:00:00Z`);
  const dow = d.getUTCDay();                  // 0 = domingo
  const ateSegunda = ((8 - dow) % 7) || 7;    // dias até a próxima segunda
  const de = somaDias(hojeISO, ateSegunda);
  return { de, ate: somaDias(de, 6) };
}

/** Consultas agendadas, com data, cujo dia (fuso da clínica) cai em [de, ate]. */
export function consultasDoPeriodo(consultas, de, ate) {
  return (consultas ?? [])
    .filter(c => c.status === 'agendada' && c.data_hora)
    .map(c => ({ c, p: partesLocaisISO(c.data_hora) }))
    .filter(({ p }) => p.data >= de && p.data <= ate)
    .sort((a, b) => a.c.data_hora.localeCompare(b.c.data_hora))
    .map(({ c }) => c);
}

/** Choques entre os próprios itens do lote (qualquer paciente). Devolve textos. */
export function conflitosEntreSi(itens) {
  const validos = (itens ?? []).filter(i => i.data && i.hora);
  const textos = [];
  for (let i = 0; i < validos.length; i++) {
    for (let j = i + 1; j < validos.length; j++) {
      const a = validos[i], b = validos[j];
      if (intervalosSeCruzam(
        intervaloConsulta(a.data, a.hora, a.duracaoMin),
        intervaloConsulta(b.data, b.hora, b.duracaoMin),
      )) {
        textos.push(`${a.nome} e ${b.nome} ficaram no mesmo horário (${dataBR(a.data)}, ${a.hora}).`);
      }
    }
  }
  return textos;
}

const quando = (data, hora) => `${dataBR(data)} às ${hora}`;

// Sem conteúdo clínico (CFN 856): só avisa a mudança de agenda.
export function mensagemReagendamento({ nome, antes, depois }) {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  const abertura = primeiro ? `Oi, ${primeiro}!` : 'Oi!';
  const era = quando(antes.data, antes.hora);
  if (depois?.data && depois?.hora) {
    return `${abertura} Preciso ajustar a agenda e remarcar a sua consulta que estava para ${era}. O novo horário é ${quando(depois.data, depois.hora)}. Pode confirmar pra mim, por favor? Se não der certo, me avise que eu encontro outro horário.`;
  }
  return `${abertura} Preciso ajustar a agenda e remarcar a sua consulta que estava para ${era}. Que dia e horário ficam melhores pra você? Me conta que eu encaixo.`;
}
