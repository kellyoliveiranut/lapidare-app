-- Contrato Essentia 1.1 — atualização aprovada pela Kelly com revisão de advogado.
--
-- Duas mudanças em relação à 1.0 (2026-08-22b_contrato_essentia.sql). Todo o
-- resto do corpo é idêntico, linha por linha:
--   1. Cláusula Sexta, parágrafo final: o limite de 10% de remarcações passa a
--      dizer que a consulta não comparecida entra no total de 6 da Terceira.
--   2. Cláusula Sétima: os §1º a §4º, o parágrafo "A contratação implica..." e o
--      de "boa-fé, transparência" saem, e entram quatro parágrafos novos. O
--      caput (duração de 6 consultas em 3 meses) fica como estava.
--
-- A 1.0 NÃO é sobrescrita: ela vira ativo=false e continua na tabela como
-- registro do que esteve em vigor de 2026-08-22 até aqui.
--
-- A ORDEM IMPORTA: existe índice único parcial (contratos_templates_ativo_unq,
-- "where ativo") que permite no máximo um template ativo por nutri. Por isso o
-- update da 1.0 vem ANTES do insert da 1.1 — inverter estoura o índice.
-- Sem begin/commit de propósito: os dois statements enviados juntos no SQL
-- Editor já rodam em transação implícita.

update public.contratos_templates t
   set ativo = false
  from public.nutris n
 where n.email = 'kellynut01@gmail.com'
   and t.nutri_id = n.id
   and t.versao = '1.0';

insert into public.contratos_templates (nutri_id, versao, corpo_html, ativo)
select n.id, '1.1', $html$
<h2>CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS EM NUTRIÇÃO</h2>

<p>
  Pelo presente instrumento, e na melhor forma de direito, doravante denominada
  NUTRICIONISTA, Kelly Cristina Oliveira Albuquerque, Estado civil: casada, do
  RG.: 4591186, inscrita no CPF:82652996215 e no CRN nº 3801, residente e
  domiciliada em: Travessa Rui Barbosa, número 1797, Edifício Paola, apartamento
  1102, Belém, PA. Doravante denominada cliente, {{NOME}}, {{IDENTIFICACAO}},
  decidem celebrar o presente contrato de prestação de serviços de NUTRIÇÃO, nos
  seguintes termos:
</p>

<h3>CLÁUSULA PRIMEIRA. DA PRESTAÇÃO DE SERVIÇOS.</h3>
<p>
  O serviço abrangido pelo presente contrato será o de prestação de serviços de
  nutrição, visando à melhora no perfil nutricional, auxílio no tratamento
  oncológico e melhora na qualidade de vida e desenvolvimento de plano e/ou
  estratégia para o alcance dos objetivos do tratamento nutricional oncológico,
  de forma a aumentar seus resultados positivos.
</p>

<h3>CLÁUSULA SEGUNDA. DO SIGILO PROFISSIONAL.</h3>
<p>
  O PROFISSIONAL obriga-se a manter o sigilo de todas as informações a que tenha
  acesso, em razão da prestação dos serviços ora convencionados, objeto deste
  contrato, sob as penas da lei, com as ressalvas legais.
</p>
<p>
  Parágrafo único. O PROFISSIONAL se reserva ao direito de comentar assuntos
  tratados nas consultas com outros profissionais, também da área de nutrição ou
  outros profissionais de saúde como médicos visando buscar opiniões diversas, a
  fim de melhor orientar o CLIENTE para o alcance de seus objetivos.
</p>

<h3>CLÁUSULA TERCEIRA. DO PAGAMENTO PELOS SERVIÇOS PRESTADOS.</h3>
<p>
  Em remuneração aos serviços prestados, o CLIENTE pagará o valor de total de
  R$ {{VALOR}} pelo acompanhamento, composto por 6 consultas por 3 meses
  prestados, pelo prazo previsto na cláusula sétima.
</p>
<p>FORMA DE PAGAMENTO: Pix ou cartão de crédito</p>
<p>FORMA DE PARCELAMENTO: Parcelamento via cartão de crédito em até 10x.</p>

<h3>CLÁUSULA QUARTA. DO LOCAL DE PAGAMENTO.</h3>
<p>
  O pagamento a que se refere à cláusula anterior será realizado por meio de
  dinheiro, pix, débito ou por meio de cartão de crédito.
</p>

<h3>CLÁUSULA QUINTA. OUTRAS OBRIGAÇÕES DO CLIENTE.</h3>
<p>
  I – A contratação, quando necessário, de outros serviços que não abrangidos
  pelos serviços prestados, e que sejam essenciais para o alcance das metas
  estipuladas durante as consultas.
</p>
<p>
  II – Comprometer-se a comparecer às consultas, de acordo com as datas e
  horários pré-agendados, sejam estas presenciais ou à distância, estando ciente
  de que o seu comprometimento é um fator fundamental ao processo.
</p>

<h3>CLÁUSULA SEXTA. CANCELAMENTOS.</h3>
<p>
  O cancelamento das consultas agendadas junto ao PROFISSIONAL deverá ser feito
  com, no mínimo, 24 horas de antecedência, podendo a mesma a ser remarcada para
  um horário diverso, sem ônus para o CLIENTE.
</p>
<p>
  §1º. No caso de não comparecimento às consultas agendadas, sem aviso
  antecipado, por duas vezes consecutivas, entender-se-á que a mesma foi
  realizada.
</p>
<p>
  O CLIENTE pode remarcar até 10% do total de consultas contratadas sem
  qualquer ônus. Ultrapassado esse limite, a consulta não comparecida é
  contabilizada como realizada, dentro do total de 6 consultas previsto na
  Cláusula Terceira.
</p>

<h3>DISPOSIÇÕES FINAIS. CLÁUSULA SÉTIMA. DA DURAÇÃO E RESCISÃO DO CONTRATO.</h3>
<p>
  O contrato terá duração de 6 Consultas num período de 3 meses, a serem
  contados (as) da data de assinatura do presente instrumento. Qualquer serviço
  de assessoria prestado após o encerramento deste contrato não estará incluído
  nas obrigações decorrentes do presente instrumento, a não ser por renovação de
  contrato.
</p>
<p>
  §1º. Este contrato tem prazo determinado (caput desta cláusula). Qualquer das
  partes que desejar rescindi-lo antes do término deve comunicar a outra com no
  mínimo 7 (sete) dias de antecedência.
</p>
<p>
  §2º. Superado o prazo de reflexão de 7 (sete) dias previsto em lei desde a
  assinatura, a rescisão por vontade do CLIENTE não gera devolução dos valores
  pagos, em razão do caráter personalizado do serviço e dos recursos técnicos já
  empregados desde o início da execução.
</p>
<p>
  §3º. Em caso de impossibilidade superveniente de cumprimento por qualquer das
  partes, o contrato poderá ser extinto sem ônus adicional para nenhuma delas.
</p>
<p>
  §4º. Em caso de falecimento do CLIENTE, pelos mesmos motivos do §2º, os
  valores pagos não serão devolvidos. Os materiais e planejamentos
  disponibilizados poderão permanecer acessíveis ao familiar ou responsável
  previamente indicado, apenas para consulta, vedada sua transferência ou
  comercialização.
</p>

<h3>CLÁUSULA OITAVA. ASPECTOS GERAIS DA PRESTAÇÃO DE SERVIÇOS.</h3>
<p>
  Para resolução de qualquer controvérsia oriundas deste CONTRATO, as partes
  elegem o foro da comarca de Belém-PA.
</p>

<p style="margin-top:28px">BELÉM, {{DATA_EXTENSO}}</p>

<p style="margin-top:28px">NUTRICIONISTA</p>
<p style="margin-top:20px">CLIENTE</p>
$html$, true
from public.nutris n
where n.email = 'kellynut01@gmail.com'
on conflict (nutri_id, versao) do update
  set corpo_html = excluded.corpo_html,
      ativo      = excluded.ativo;

-- Conferência (rodar depois, separado):
--   select versao, ativo, length(corpo_html) as tamanho
--     from public.contratos_templates order by versao;
--   -- esperado: 1.0 / false  e  1.1 / true
