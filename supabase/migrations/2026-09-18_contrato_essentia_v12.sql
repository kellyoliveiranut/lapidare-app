-- Contrato Essentia 1.2 — texto aprovado pela Kelly.
--
-- Duas mudanças em relação à 1.1 (2026-09-06_contrato_essentia_v11.sql). Todo o
-- resto do corpo é idêntico, conferido por diff bloco a bloco (31 blocos, 2
-- diferentes):
--   1. Cláusula Sétima, §2º: a rescisão por vontade do CLIENTE deixa de ser
--      "não gera devolução" e passa a dar direito a 30% do valor pago, com
--      prazo de 20 dias úteis contados da solicitação.
--   2. Cláusula Sétima, §4º: falecimento continua sem devolução, mas a razão
--      deixa de ser a remissão "pelos mesmos motivos do §2º" — que viraria
--      contradição agora que o §2º devolve — e passa a ser autônoma: a
--      execução do serviço não está sob o controle da PROFISSIONAL.
--
-- A 1.1 NÃO é sobrescrita: vira ativo=false e fica na tabela como registro do
-- que esteve em vigor de 2026-09-06 até aqui.
--
-- NÃO afeta contrato já assinado: contratos_essentia guarda o snapshot do
-- corpo no aceite, cópia independente do template.
--
-- A ORDEM IMPORTA: existe índice único parcial (contratos_templates_ativo_unq,
-- "where ativo") que permite no máximo um template ativo por nutri. Por isso o
-- update vem ANTES do insert — inverter estoura o índice.
--
-- O update desativa POR ativo, não por versão (a 1.1 nomeava '1.0'). Se o banco
-- não estiver onde a gente acha, nomear a versão desativaria a errada e deixaria
-- uma ativa de pé, e o insert estouraria o índice. "where ativo" desativa o que
-- estiver ativo, e o próprio índice garante que é no máximo um.
--
-- Sem begin/commit de propósito: os dois statements enviados juntos no SQL
-- Editor já rodam em transação implícita.

update public.contratos_templates t
   set ativo = false
  from public.nutris n
 where n.email = 'kellynut01@gmail.com'
   and t.nutri_id = n.id
   and t.ativo;

insert into public.contratos_templates (nutri_id, versao, corpo_html, ativo)
select n.id, '1.2', $html$
<h2>CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS EM NUTRIÇÃO</h2>
<p>Pelo presente instrumento, e na melhor forma de direito, doravante denominada NUTRICIONISTA, Kelly Cristina Oliveira Albuquerque, Estado civil: casada, do RG.: 4591186, inscrita no CPF:82652996215 e no CRN nº 3801, residente e domiciliada em: Travessa Rui Barbosa, número 1797, Edifício Paola, apartamento 1102, Belém, PA. Doravante denominada cliente, {{NOME}}, {{IDENTIFICACAO}}, decidem celebrar o presente contrato de prestação de serviços de NUTRIÇÃO, nos seguintes termos:</p>
<h3>CLÁUSULA PRIMEIRA. DA PRESTAÇÃO DE SERVIÇOS.</h3>
<p>O serviço abrangido pelo presente contrato será o de prestação de serviços de nutrição, visando à melhora no perfil nutricional, auxílio no tratamento oncológico e melhora na qualidade de vida e desenvolvimento de plano e/ou estratégia para o alcance dos objetivos do tratamento nutricional oncológico, de forma a aumentar seus resultados positivos.</p>
<h3>CLÁUSULA SEGUNDA. DO SIGILO PROFISSIONAL.</h3>
<p>O PROFISSIONAL obriga-se a manter o sigilo de todas as informações a que tenha acesso, em razão da prestação dos serviços ora convencionados, objeto deste contrato, sob as penas da lei, com as ressalvas legais.</p>
<p>Parágrafo único. O PROFISSIONAL se reserva ao direito de comentar assuntos tratados nas consultas com outros profissionais, também da área de nutrição ou outros profissionais de saúde como médicos visando buscar opiniões diversas, a fim de melhor orientar o CLIENTE para o alcance de seus objetivos.</p>
<h3>CLÁUSULA TERCEIRA. DO PAGAMENTO PELOS SERVIÇOS PRESTADOS.</h3>
<p>Em remuneração aos serviços prestados, o CLIENTE pagará o valor de total de R$ {{VALOR}} pelo acompanhamento, composto por 6 consultas por 3 meses prestados, pelo prazo previsto na cláusula sétima.</p>
<p>FORMA DE PAGAMENTO: Pix ou cartão de crédito</p>
<p>FORMA DE PARCELAMENTO: Parcelamento via cartão de crédito em até 10x.</p>
<h3>CLÁUSULA QUARTA. DO LOCAL DE PAGAMENTO.</h3>
<p>O pagamento a que se refere à cláusula anterior será realizado por meio de dinheiro, pix, débito ou por meio de cartão de crédito.</p>
<h3>CLÁUSULA QUINTA. OUTRAS OBRIGAÇÕES DO CLIENTE.</h3>
<p>I – A contratação, quando necessário, de outros serviços que não abrangidos pelos serviços prestados, e que sejam essenciais para o alcance das metas estipuladas durante as consultas.</p>
<p>II – Comprometer-se a comparecer às consultas, de acordo com as datas e horários pré-agendados, sejam estas presenciais ou à distância, estando ciente de que o seu comprometimento é um fator fundamental ao processo.</p>
<h3>CLÁUSULA SEXTA. CANCELAMENTOS.</h3>
<p>O cancelamento das consultas agendadas junto ao PROFISSIONAL deverá ser feito com, no mínimo, 24 horas de antecedência, podendo a mesma a ser remarcada para um horário diverso, sem ônus para o CLIENTE.</p>
<p>§1º. No caso de não comparecimento às consultas agendadas, sem aviso antecipado, por duas vezes consecutivas, entender-se-á que a mesma foi realizada.</p>
<p>O CLIENTE pode remarcar até 10% do total de consultas contratadas sem qualquer ônus. Ultrapassado esse limite, a consulta não comparecida é contabilizada como realizada, dentro do total de 6 consultas previsto na Cláusula Terceira.</p>
<h3>DISPOSIÇÕES FINAIS. CLÁUSULA SÉTIMA. DA DURAÇÃO E RESCISÃO DO CONTRATO.</h3>
<p>O contrato terá duração de 6 Consultas num período de 3 meses, a serem contados (as) da data de assinatura do presente instrumento. Qualquer serviço de assessoria prestado após o encerramento deste contrato não estará incluído nas obrigações decorrentes do presente instrumento, a não ser por renovação de contrato.</p>
<p>§1º. Este contrato tem prazo determinado (caput desta cláusula). Qualquer das partes que desejar rescindi-lo antes do término deve comunicar a outra com no mínimo 7 (sete) dias de antecedência.</p>
<p>§2º. Superado o prazo de reflexão de 7 (sete) dias previsto em lei desde a assinatura, a rescisão por vontade do CLIENTE dá direito à devolução de 30% (trinta por cento) do valor total pago até a data do cancelamento, em razão do caráter personalizado do serviço e dos recursos técnicos já empregados desde o início da execução. A devolução será realizada em até 20 (vinte) dias úteis contados da solicitação, pela forma de pagamento a ser definida entre as partes no momento da rescisão.</p>
<p>§3º. Em caso de impossibilidade superveniente de cumprimento por qualquer das partes, o contrato poderá ser extinto sem ônus adicional para nenhuma delas.</p>
<p>§4º. Em caso de falecimento do CLIENTE, os valores pagos não serão devolvidos, tendo em vista que a execução do serviço não está sob o controle da PROFISSIONAL. Os materiais e planejamentos disponibilizados poderão permanecer acessíveis ao familiar ou responsável previamente indicado, apenas para consulta, vedada sua transferência ou comercialização.</p>
<h3>CLÁUSULA OITAVA. ASPECTOS GERAIS DA PRESTAÇÃO DE SERVIÇOS.</h3>
<p>Para resolução de qualquer controvérsia oriundas deste CONTRATO, as partes elegem o foro da comarca de Belém-PA.</p>
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
--   -- esperado: 1.0 / false / 5668
--   --           1.1 / false / 5210
--   --           1.2 / true  / 5226  (ou 5194 — ver nota)
--
-- NOTA SOBRE O TAMANHO: length() conta CARACTERES, não bytes — a 1.1 tem 5256
-- bytes e 5088 caracteres, porque acento, § e º ocupam 2 bytes cada. O valor
-- gravado inclui as quebras de linha, então depende da convenção com que o
-- texto chega no SQL Editor: 5226 com CRLF (foi como a 1.1 entrou, conferido
-- contra os 5210 que o banco reporta) e 5194 com LF. Os dois estão certos.
-- Qualquer OUTRO número significa que o corpo não é o que foi conferido.
