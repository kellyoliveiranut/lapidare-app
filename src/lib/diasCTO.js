/**
 * Dias em que a Kelly atende no CTO: segunda (1) e sexta (5).
 * Recebe um Date no horário local da tela (o mesmo que o calendário usa).
 */
export const DIAS_CTO = [1, 5];
export const ehDiaCTO = (data) => DIAS_CTO.includes(data.getDay());
