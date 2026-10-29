// Dados da paciente exigidos para emitir a nota fiscal. Funções puras.

export const CAMPOS_ENDERECO = [
  'end_cep', 'end_logradouro', 'end_numero', 'end_complemento', 'end_bairro', 'end_cidade', 'end_uf',
];

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const texto = (v) => String(v ?? '').trim();

export function formatarCep(v) {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// Dígitos verificadores do CPF (rejeita 000.000.000-00 e afins).
export function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/** Rótulos do que ainda falta para a nota. [] = completo. */
export function faltandoParaNota(p) {
  const falta = [];
  if (!cpfValido(p?.cpf)) falta.push('CPF');
  if (soDigitos(p?.end_cep).length !== 8) falta.push('CEP');
  if (!texto(p?.end_logradouro)) falta.push('rua');
  if (!texto(p?.end_numero)) falta.push('número');
  if (!texto(p?.end_bairro)) falta.push('bairro');
  if (!texto(p?.end_cidade)) falta.push('cidade');
  if (!/^[A-Za-z]{2}$/.test(texto(p?.end_uf))) falta.push('UF');
  return falta;
}

/**
 * Valida o formulário e devolve { erro } ou { payload } pronto para gravar:
 * CEP só com dígitos, UF em maiúsculas, CPF só com dígitos, vazio vira null.
 * Campos em branco são permitidos (a nota só exige tudo na hora de emitir).
 */
export function montarPayloadNota(f) {
  const cpf = soDigitos(f.cpf);
  if (cpf && !cpfValido(cpf)) return { erro: 'CPF inválido. Confira os 11 números.' };
  const cep = soDigitos(f.end_cep);
  if (cep && cep.length !== 8) return { erro: 'CEP inválido. São 8 números.' };
  const uf = texto(f.end_uf).toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) return { erro: 'UF inválida. Use 2 letras (ex.: PA).' };
  const ou = (v) => texto(v) || null;
  return {
    payload: {
      cpf: cpf || null,
      end_cep: cep || null,
      end_logradouro: ou(f.end_logradouro),
      end_numero: ou(f.end_numero),
      end_complemento: ou(f.end_complemento),
      end_bairro: ou(f.end_bairro),
      end_cidade: ou(f.end_cidade),
      end_uf: uf || null,
    },
  };
}
