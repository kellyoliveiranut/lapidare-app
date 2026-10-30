/* ============================================================
   CATÁLOGO DOS EXAMES DO EMAGRECIMENTO / RECOMPOSIÇÃO CORPORAL

   Fonte: tabela técnica enviada pela Kelly em 2026-10-29 ("banco de exames
   laboratoriais"). Os números são os dela, sem alteração.

   TRÊS CAMADAS, que não se confundem:
     1. `ref`      — referência laboratorial ORIENTATIVA (min/max, por sexo quando
                     a tabela separa). Não substitui a faixa do laudo do laboratório.
     2. `criterio` — classificação por diretriz (HbA1c, vitamina D, PCR-us). Só
                     escreve o rótulo; não pinta de "crítico".
     3. faixa PERSONALIZADA da Kelly (tabela exames_emag_referencias): quando ela
                     preenche, substitui a referência orientativa daquele marcador,
                     com a fonte/justificativa dela.

   Marcador SEM `ref` é de propósito: a tabela diz "meta individualizada",
   "dependente do método" ou "dependente da fase do ciclo". Nesses o app não
   inventa faixa; a Kelly define a dela, se quiser.

   `calculado` = valor derivado (HOMA-IR), sem faixa universal.
   ============================================================ */

export const AVISO_GERAL_EXAMES =
  'Valores orientativos para adultos não gestantes; não substituem os intervalos do laboratório, que variam por método, sexo, idade e população. '
  + 'Valor fora da referência não significa deficiência: interprete no contexto do paciente.';

export const GRUPOS_EXAME_EMAG = [
  { id: 'glicemia', label: 'Glicemia e resistência à insulina',
    nota: 'Glicemia e HbA1c: acompanhamento da homeostase glicêmica. A insulina ajuda a avaliar o contexto insulinêmico, mas não tem ponto de corte universal para resistência à insulina. '
      + 'HOMA-IR = glicemia (mg/dL) × insulina (µUI/mL) / 405: cálculo educacional, sem limite universal. Classificação de glicemia, HbA1c e TTGO: critérios da Sociedade Brasileira de Diabetes.' },
  { id: 'lipidios', label: 'Perfil lipídico e risco cardiometabólico',
    nota: 'Triglicerídeos podem acompanhar alterações no metabolismo de carboidratos e lipídios. HDL: transporte reverso do colesterol. LDL e ApoB: partículas aterogênicas. Lipoproteína(a): importante componente genético.',
    aviso: 'Não use uma faixa única de LDL como ideal para todos: a meta depende da estratificação de risco cardiovascular.' },
  { id: 'hemograma', label: 'Hemograma completo',
    nota: 'Hemoglobina e hematócrito contribuem para a investigação de anemia. VCM e HCM caracterizam a morfologia das hemácias. RDW pode se alterar em diferentes deficiências nutricionais. Leucócitos: interpretar no contexto imunológico e inflamatório. Plaquetas podem se alterar em processos inflamatórios e hematológicos.' },
  { id: 'ferro', label: 'Ferro e seu metabolismo',
    nota: 'Nutrientes relacionados: ferro, vitamina C, vitamina B12, folato e cobre.',
    aviso: 'A ferritina também é proteína de fase aguda: processos inflamatórios podem elevá-la independentemente dos estoques de ferro.' },
  { id: 'hepatica', label: 'Função hepática',
    nota: 'AST e ALT auxiliam na investigação de alterações hepatocelulares. GGT pode estar relacionada a alterações hepatobiliares e fatores metabólicos. Albumina: considerar síntese hepática, inflamação, perdas renais e hidratação.' },
  { id: 'renal', label: 'Função renal e eletrólitos',
    nota: 'A avaliação renal pode ser complementada pela relação albumina/creatinina urinária (recomendações KDIGO).',
    aviso: 'Com maior massa muscular, uso de creatina ou ingestão elevada de proteínas, a creatinina tem particularidades de interpretação. A eTFG também precisa ser contextualizada.' },
  { id: 'urina', label: 'Urina tipo 1 (EAS)',
    nota: 'Parâmetros físicos, químicos e do sedimento urinário. Os resultados qualitativos são digitados como vêm no laudo (por exemplo, "Negativo").',
    aviso: 'Os limites microscópicos variam conforme técnica, equipamento, centrifugação e forma de apresentação do resultado.' },
  { id: 'tireoide', label: 'Função tireoidiana',
    nota: 'Os hormônios tireoidianos participam da regulação do metabolismo energético, termogênese, frequência cardíaca e metabolismo de proteínas, lipídios e carboidratos.',
    aviso: 'Considerar medicamentos, gestação, idade, biotina e histórico tireoidiano. T3 reverso não é exame de rotina para avaliar função tireoidiana.' },
  { id: 'vitaminas', label: 'Vitaminas',
    nota: 'B12: aminoácidos, síntese de DNA e células sanguíneas. Folato: divisão celular e metabolismo de um carbono. Vitamina D: metabolismo ósseo, muscular e cálcio. A: diferenciação celular e imunidade. E: antioxidante de membranas. B6: aminoácidos e neurotransmissores. C: colágeno e absorção de ferro não heme.',
    aviso: 'Cadastre B12, folato e vitaminas lipossolúveis conforme o método do laboratório. Para vitamina D, não adote automaticamente 40–60 ng/mL como faixa obrigatória.' },
  { id: 'minerais', label: 'Minerais e oligoelementos',
    nota: 'Magnésio: metabolismo energético e função neuromuscular. Zinco: síntese proteica, imunidade e hormônios. Cobre: metabolismo do ferro. Selênio: enzimas antioxidantes e tireoide.',
    aviso: 'Concentrações séricas nem sempre refletem os estoques corporais. O magnésio eritrocitário também não tem faixa universal validada.' },
  { id: 'inflamatorio', label: 'Perfil inflamatório',
    nota: 'PCR: marcador inespecífico de inflamação. PCR-us: estratificação de risco cardiovascular. Fibrinogênio: proteína de fase aguda. Homocisteína: metabolismo de folato, B12 e B6. CK: lesão muscular.',
    aviso: 'Não interpretar PCR-us durante infecção ou inflamação aguda como marcador isolado de risco. A CK deve ser contextualizada com treino, esforço recente e sintomas musculares.' },
  { id: 'hormonal', label: 'Perfil hormonal',
    nota: 'Testosterona, SHBG, LH e FSH ajudam a compreender o eixo hipotálamo-hipófise-gonadal, sobretudo com sintomas ou suspeita de alteração.',
    aviso: 'Em mulheres, registre a fase do ciclo, uso de contraceptivos hormonais, gestação e menopausa: alteram a interpretação. A testosterona depende de horário da coleta, sintomas, idade e método; não use um valor isolado como indicador de capacidade de ganho de massa muscular.' },
  { id: 'outros', label: 'Outros exames complementares',
    nota: 'Úteis em investigações específicas; não precisam compor o painel de todo paciente em emagrecimento ou recomposição corporal.' },
];

const MF = (masc, fem) => ({ masculino: masc, feminino: fem });
function c(key, grupo, label, curto, unidade, dec, extra = {}) {
  return { key, grupo, label, curto, unidade, dec, ...extra };
}

// Parâmetro de texto (urina tipo 1): o valor é o que está no laudo. `esperado` = o resultado
// de referência; igual → "dentro da referência", diferente → "fora". Sem `esperado`, só mostra.
function t(key, label, curto, refTexto, extra = {}) {
  return c(key, 'urina', label, curto, '', 0, { tipo: 'texto', refTexto, ...extra });
}

export const CAMPOS_EMAG = [
  // ── Glicemia e resistência à insulina ──
  c('glicemia_jejum', 'glicemia', 'Glicemia de jejum', 'Glic', 'mg/dL', 0, { ref: { min: 70, max: 99 } }),
  c('hba1c', 'glicemia', 'Hemoglobina glicada (HbA1c)', 'HbA1c', '%', 1, {
    criterio: [
      { ate: 5.7, rotulo: 'Normal' },
      { ate: 6.5, rotulo: 'Pré-diabetes' },
      { rotulo: 'Critério para diabetes' },
    ] }),
  c('ttgo_1h', 'glicemia', 'Glicemia 1h pós-TTGO', 'TTGO 1h', 'mg/dL', 0, { ref: { max: 155 } }),
  c('ttgo_2h', 'glicemia', 'Glicemia 2h pós-TTGO', 'TTGO 2h', 'mg/dL', 0, { ref: { max: 140 } }),
  c('insulina_jejum', 'glicemia', 'Insulina basal', 'Ins', 'µUI/mL', 1, {
    ref: { min: 2, max: 25 }, refNota: 'Depende do método; frequentemente 2–25. Sem ponto de corte universal para resistência à insulina.' }),
  c('homa_ir', 'glicemia', 'HOMA-IR', 'HOMA', '', 2, { calculado: true, refNota: 'Sem limite universal de HOMA-IR para todas as populações.' }),
  c('peptideo_c', 'glicemia', 'Peptídeo C', 'Pept C', 'ng/mL', 1, { ref: { min: 0.8, max: 3.9 }, refNota: 'Aproximadamente 0,8–3,9.' }),
  c('frutosamina', 'glicemia', 'Frutosamina', 'Frut', 'µmol/L', 0, { ref: { min: 205, max: 285 }, refNota: 'Aproximadamente 205–285.' }),
  c('acido_urico', 'glicemia', 'Ácido úrico', 'Ác. úrico', 'mg/dL', 1, { ref: MF({ min: 3.5, max: 7.2 }, { min: 2.6, max: 6.0 }) }),

  // ── Perfil lipídico ──
  c('colesterol_total', 'lipidios', 'Colesterol total', 'CT', 'mg/dL', 0, { ref: { max: 190 }, refNota: 'Desejável abaixo de 190.' }),
  c('hdl', 'lipidios', 'HDL', 'HDL', 'mg/dL', 0, { ref: MF({ min: 40 }, { min: 50 }), refNota: 'Acima de 40 (homens) e acima de 50 (mulheres).' }),
  c('ldl', 'lipidios', 'LDL', 'LDL', 'mg/dL', 0, { refNota: 'Meta individualizada pelo risco cardiovascular.' }),
  c('triglicerideos', 'lipidios', 'Triglicerídeos', 'TG', 'mg/dL', 0, { ref: { max: 150 }, refNota: 'Em jejum: abaixo de 150. Sem jejum: abaixo de 175.' }),
  c('vldl', 'lipidios', 'VLDL', 'VLDL', 'mg/dL', 0, { refNota: 'Calculado ou dependente do método.' }),
  c('nao_hdl', 'lipidios', 'Colesterol não-HDL', 'Não-HDL', 'mg/dL', 0, { refNota: 'Meta individualizada pelo risco cardiovascular.' }),
  c('apoa1', 'lipidios', 'ApoA1', 'ApoA1', 'mg/dL', 0, { ref: { min: 110, max: 180 }, refNota: 'Aproximadamente 110–180.' }),
  c('apob', 'lipidios', 'ApoB', 'ApoB', 'mg/dL', 0, { refNota: 'Meta individualizada pelo risco cardiovascular.' }),
  c('lipoproteina_a', 'lipidios', 'Lipoproteína(a)', 'Lp(a)', 'mg/dL', 0, { ref: { max: 30 } }),

  // ── Hemograma ──
  c('hemacias', 'hemograma', 'Hemácias', 'Hem', 'milhões/µL', 2, { ref: MF({ min: 4.5, max: 5.9 }, { min: 4.0, max: 5.2 }) }),
  c('hemoglobina', 'hemograma', 'Hemoglobina', 'Hb', 'g/dL', 1, { ref: MF({ min: 13.5, max: 17.5 }, { min: 12.0, max: 16.0 }) }),
  c('hematocrito', 'hemograma', 'Hematócrito', 'Ht', '%', 0, { ref: MF({ min: 41, max: 53 }, { min: 36, max: 46 }) }),
  c('vcm', 'hemograma', 'VCM', 'VCM', 'fL', 0, { ref: { min: 80, max: 100 } }),
  c('hcm', 'hemograma', 'HCM', 'HCM', 'pg', 0, { ref: { min: 27, max: 33 } }),
  c('chcm', 'hemograma', 'CHCM', 'CHCM', 'g/dL', 0, { ref: { min: 32, max: 36 } }),
  c('rdw', 'hemograma', 'RDW', 'RDW', '%', 1, { ref: { min: 11.5, max: 14.5 } }),
  c('leucocitos', 'hemograma', 'Leucócitos totais', 'Leuco', '/µL', 0, { ref: { min: 4000, max: 11000 } }),
  c('neutrofilos_pct', 'hemograma', 'Neutrófilos', 'Neutro', '%', 0, { ref: { min: 40, max: 70 } }),
  c('linfocitos_pct', 'hemograma', 'Linfócitos', 'Linfo', '%', 0, { ref: { min: 20, max: 40 } }),
  c('monocitos_pct', 'hemograma', 'Monócitos', 'Mono', '%', 0, { ref: { min: 2, max: 8 } }),
  c('eosinofilos_pct', 'hemograma', 'Eosinófilos', 'Eos', '%', 0, { ref: { min: 1, max: 4 } }),
  c('basofilos_pct', 'hemograma', 'Basófilos', 'Baso', '%', 0, { ref: { min: 0, max: 1 } }),
  c('plaquetas', 'hemograma', 'Plaquetas', 'Plaq', '/µL', 0, { ref: { min: 150000, max: 450000 } }),

  // ── Ferro ──
  c('ferro_serico', 'ferro', 'Ferro sérico', 'Ferro', 'µg/dL', 0, { ref: MF({ min: 65, max: 175 }, { min: 50, max: 170 }) }),
  c('ferritina', 'ferro', 'Ferritina', 'Ferr', 'ng/mL', 0, { ref: MF({ min: 30, max: 400 }, { min: 15, max: 150 }) }),
  c('transferrina', 'ferro', 'Transferrina', 'Transf', 'mg/dL', 0, { ref: { min: 200, max: 360 } }),
  c('ctlf', 'ferro', 'CTLF / TIBC', 'CTLF', 'µg/dL', 0, { ref: { min: 250, max: 450 } }),
  c('sat_transferrina', 'ferro', 'Saturação de transferrina', 'Sat transf', '%', 0, { ref: { min: 20, max: 50 } }),
  c('receptor_transferrina', 'ferro', 'Receptor solúvel de transferrina', 'sTfR', 'mg/L', 1, { refNota: 'Dependente do método.' }),

  // ── Hepática ──
  c('tgo', 'hepatica', 'TGO (AST)', 'TGO', 'U/L', 0, { ref: { min: 10, max: 40 } }),
  c('tgp', 'hepatica', 'TGP (ALT)', 'TGP', 'U/L', 0, { ref: { min: 7, max: 56 } }),
  c('ggt', 'hepatica', 'GGT', 'GGT', 'U/L', 0, { ref: MF({ min: 8, max: 61 }, { min: 5, max: 36 }) }),
  c('fosfatase_alcalina', 'hepatica', 'Fosfatase alcalina', 'FA', 'U/L', 0, { ref: { min: 40, max: 130 } }),
  c('bilirrubina_total', 'hepatica', 'Bilirrubina total', 'BT', 'mg/dL', 1, { ref: { min: 0.2, max: 1.2 } }),
  c('bilirrubina_direta', 'hepatica', 'Bilirrubina direta', 'BD', 'mg/dL', 1, { ref: { min: 0, max: 0.3 } }),
  c('bilirrubina_indireta', 'hepatica', 'Bilirrubina indireta', 'BI', 'mg/dL', 1, { ref: { min: 0.2, max: 0.9 } }),
  c('albumina', 'hepatica', 'Albumina', 'Alb', 'g/dL', 1, { ref: { min: 3.5, max: 5.0 } }),
  c('proteinas_totais', 'hepatica', 'Proteínas totais', 'Prot tot', 'g/dL', 1, { ref: { min: 6.0, max: 8.3 } }),

  // ── Renal e eletrólitos ──
  c('ureia', 'renal', 'Ureia', 'Ureia', 'mg/dL', 0, { ref: { min: 15, max: 45 } }),
  c('creatinina', 'renal', 'Creatinina', 'Creat', 'mg/dL', 2, { ref: MF({ min: 0.7, max: 1.3 }, { min: 0.6, max: 1.1 }) }),
  c('etfg', 'renal', 'eTFG', 'eTFG', 'mL/min/1,73 m²', 0, { ref: { min: 90 }, refNota: 'Acima de 90.' }),
  c('sodio', 'renal', 'Sódio', 'Na', 'mmol/L', 0, { ref: { min: 135, max: 145 } }),
  c('potassio', 'renal', 'Potássio', 'K', 'mmol/L', 1, { ref: { min: 3.5, max: 5.1 } }),
  c('cloro', 'renal', 'Cloro', 'Cl', 'mmol/L', 0, { ref: { min: 98, max: 107 } }),
  c('calcio_total', 'renal', 'Cálcio total', 'Ca', 'mg/dL', 1, { ref: { min: 8.5, max: 10.5 } }),
  c('calcio_ionizado', 'renal', 'Cálcio ionizado', 'Ca iôn', 'mmol/L', 2, { ref: { min: 1.12, max: 1.32 } }),
  c('fosforo', 'renal', 'Fósforo', 'P', 'mg/dL', 1, { ref: { min: 2.5, max: 4.5 } }),
  c('rac_urinaria', 'renal', 'Relação albumina/creatinina urinária', 'RAC', 'mg/g', 0, { ref: { max: 30 }, refNota: 'Abaixo de 30.' }),

  // ── Urina tipo 1 (EAS) ──
  t('urina_cor', 'Cor', 'Cor', 'Amarelo', { esperado: ['amarelo'] }),
  t('urina_aspecto', 'Aspecto', 'Aspecto', 'Límpido', { esperado: ['limpido'] }),
  c('urina_densidade', 'urina', 'Densidade', 'Dens', '', 3, { ref: { min: 1.005, max: 1.030 }, densidade: true }),
  c('urina_ph', 'urina', 'pH', 'pH', '', 1, { ref: { min: 5.0, max: 8.0 } }),
  t('urina_proteinas', 'Proteínas', 'Prot', 'Negativo', { esperado: ['negativo'], opcoes: ['Negativo', 'Positivo'] }),
  t('urina_glicose', 'Glicose', 'Gli', 'Negativo', { esperado: ['negativo'], opcoes: ['Negativo', 'Positivo'] }),
  t('urina_cetonicos', 'Corpos cetônicos', 'Cetonas', 'Negativo', { esperado: ['negativo'], opcoes: ['Negativo', 'Positivo'] }),
  t('urina_bilirrubina', 'Bilirrubina', 'Bili', 'Negativo', { esperado: ['negativo'], opcoes: ['Negativo', 'Positivo'] }),
  t('urina_urobilinogenio', 'Urobilinogênio', 'Urobil', 'Normal', { esperado: ['normal'] }),
  t('urina_nitrito', 'Nitrito', 'Nitrito', 'Negativo', { esperado: ['negativo'], opcoes: ['Negativo', 'Positivo'] }),
  t('urina_hemoglobina', 'Hemoglobina', 'Hb urina', 'Negativo', { esperado: ['negativo'], opcoes: ['Negativo', 'Positivo'] }),
  c('urina_hemacias', 'urina', 'Hemácias (sedimento)', 'Hem/campo', '/campo', 0, { ref: { min: 0, max: 2 }, refNota: 'Geralmente 0–2 por campo.' }),
  c('urina_leucocitos', 'urina', 'Leucócitos (sedimento)', 'Leuc/campo', '/campo', 0, { ref: { min: 0, max: 5 }, refNota: 'Geralmente 0–5 por campo.' }),
  t('urina_celulas_epiteliais', 'Células epiteliais', 'Céls epit', 'Ausentes ou raras'),
  t('urina_cilindros', 'Cilindros', 'Cilindros', 'Ausentes ou ocasionais hialinos'),
  t('urina_cristais', 'Cristais', 'Cristais', 'Ausentes ou conforme contexto'),
  t('urina_bacterias', 'Bactérias', 'Bactérias', 'Ausentes ou raras'),
  t('urina_muco', 'Muco', 'Muco', 'Ausente ou discreto'),
  t('urina_leveduras', 'Leveduras', 'Leveduras', 'Ausentes', { esperado: ['ausentes', 'ausente'] }),

  // ── Tireoide ──
  c('tsh', 'tireoide', 'TSH', 'TSH', 'µUI/mL', 2, { ref: { min: 0.4, max: 4.5 } }),
  c('t4_livre', 'tireoide', 'T4 livre', 'T4L', 'ng/dL', 2, { ref: { min: 0.8, max: 1.8 } }),
  c('t3_livre', 'tireoide', 'T3 livre', 'T3L', 'pg/mL', 1, { ref: { min: 2.0, max: 4.4 } }),
  c('t4_total', 'tireoide', 'T4 total', 'T4', 'µg/dL', 1, { ref: { min: 4.5, max: 12.0 } }),
  c('t3_total', 'tireoide', 'T3 total', 'T3', 'ng/dL', 0, { ref: { min: 80, max: 200 } }),
  c('anti_tpo', 'tireoide', 'Anti-TPO', 'Anti-TPO', 'UI/mL', 0, { ref: { max: 35 }, refNota: 'Geralmente abaixo de 35.' }),
  c('anti_tireoglobulina', 'tireoide', 'Anti-tireoglobulina', 'Anti-Tg', 'UI/mL', 0, { refNota: 'Dependente do método.' }),
  c('tireoglobulina', 'tireoide', 'Tireoglobulina', 'Tg', 'ng/mL', 1, { refNota: 'Dependente do método.' }),

  // ── Vitaminas ──
  c('vitamina_b12', 'vitaminas', 'Vitamina B12', 'B12', 'pg/mL', 0, { ref: { min: 200, max: 900 } }),
  c('folato', 'vitaminas', 'Folato sérico', 'Folato', 'ng/mL', 1, { ref: { min: 4 }, refNota: 'Acima de 4.' }),
  c('vitamina_d', 'vitaminas', 'Vitamina D (25-OH)', 'Vit D', 'ng/mL', 0, {
    criterio: [
      { ate: 12, rotulo: 'Deficiência importante' },
      { ate: 20, rotulo: 'Inadequação' },
      { ate: 50, incl: true, rotulo: 'Adequada para a maioria dos adultos saudáveis' },
      { rotulo: 'Atenção: possibilidade de efeitos adversos' },
    ] }),
  c('vitamina_a', 'vitaminas', 'Vitamina A (retinol)', 'Vit A', 'µg/dL', 0, { ref: { min: 20, max: 60 } }),
  c('vitamina_e', 'vitaminas', 'Vitamina E (alfa-tocoferol)', 'Vit E', 'mg/L', 1, { ref: { min: 5.5, max: 17 } }),
  c('vitamina_b6', 'vitaminas', 'Vitamina B6 (PLP)', 'B6', 'µg/L', 0, { ref: { min: 5, max: 50 } }),
  c('vitamina_c', 'vitaminas', 'Vitamina C', 'Vit C', 'mg/dL', 1, { ref: { min: 0.4, max: 2.0 } }),

  // ── Minerais ──
  c('magnesio', 'minerais', 'Magnésio sérico', 'Mg', 'mg/dL', 1, { ref: { min: 1.7, max: 2.4 } }),
  c('zinco', 'minerais', 'Zinco sérico', 'Zn', 'µg/dL', 0, { ref: { min: 70, max: 120 } }),
  c('cobre', 'minerais', 'Cobre sérico', 'Cu', 'µg/dL', 0, { ref: { min: 70, max: 140 } }),
  c('selenio', 'minerais', 'Selênio sérico', 'Se', 'µg/L', 0, { ref: { min: 70, max: 150 } }),

  // ── Inflamatório ──
  c('pcr', 'inflamatorio', 'PCR convencional', 'PCR', 'mg/L', 1, { ref: { max: 5 }, refNota: 'Abaixo de 5.' }),
  c('pcr_us', 'inflamatorio', 'PCR ultrassensível', 'PCR-us', 'mg/L', 1, {
    criterio: [
      { ate: 1, rotulo: 'Menor categoria de risco cardiovascular' },
      { ate: 3, incl: true, rotulo: 'Categoria intermediária' },
      { rotulo: 'Categoria elevada' },
    ] }),
  c('vhs', 'inflamatorio', 'VHS', 'VHS', 'mm/h', 0, { ref: MF({ min: 0, max: 15 }, { min: 0, max: 20 }) }),
  c('fibrinogenio', 'inflamatorio', 'Fibrinogênio', 'Fibrin', 'mg/dL', 0, { ref: { min: 200, max: 400 } }),
  c('homocisteina', 'inflamatorio', 'Homocisteína', 'Hcy', 'µmol/L', 1, { ref: { min: 5, max: 15 } }),
  c('ck', 'inflamatorio', 'CK / CPK', 'CK', 'U/L', 0, { ref: MF({ min: 40, max: 200 }, { min: 30, max: 150 }), refNota: 'Aproximadamente 40–200 (homens) e 30–150 (mulheres).' }),

  // ── Hormonal (faixas separadas por sexo; onde a tabela diz "depende da fase do ciclo", não há faixa) ──
  c('testosterona_total', 'hormonal', 'Testosterona total', 'Testo', 'ng/dL', 0, { ref: MF({ min: 300, max: 1000 }, { min: 15, max: 70 }), refNota: 'Mulheres: aproximadamente 15–70.' }),
  c('testosterona_livre', 'hormonal', 'Testosterona livre', 'Testo livre', 'pg/mL', 1, { refNota: 'Dependente do método e da idade.' }),
  c('shbg', 'hormonal', 'SHBG', 'SHBG', 'nmol/L', 0, { ref: MF({ min: 10, max: 57 }, { min: 18, max: 144 }) }),
  c('lh', 'hormonal', 'LH', 'LH', 'mUI/mL', 1, { ref: MF({ min: 1.7, max: 8.6 }, null), refNota: 'Mulheres: depende da fase do ciclo e da idade.' }),
  c('fsh', 'hormonal', 'FSH', 'FSH', 'mUI/mL', 1, { ref: MF({ min: 1.5, max: 12.4 }, null), refNota: 'Mulheres: depende da fase do ciclo e da idade.' }),
  c('estradiol', 'hormonal', 'Estradiol', 'E2', 'pg/mL', 0, { ref: MF({ min: 10, max: 40 }, null), refNota: 'Mulheres: depende da fase do ciclo.' }),
  c('progesterona', 'hormonal', 'Progesterona', 'Prog', 'ng/mL', 1, { refNota: 'Depende da fase do ciclo.' }),
  c('prolactina', 'hormonal', 'Prolactina', 'PRL', 'ng/mL', 1, { ref: MF({ min: 4, max: 15 }, { min: 4, max: 25 }), refNota: 'Mulheres: aproximadamente 4–25.' }),
  c('dhea_s', 'hormonal', 'DHEA-S', 'DHEA-S', 'µg/dL', 0, { refNota: 'Dependente de idade e sexo.' }),

  // ── Outros ──
  c('pth', 'outros', 'PTH intacto', 'PTH', 'pg/mL', 0, { ref: { min: 15, max: 65 } }),
  c('amilase', 'outros', 'Amilase', 'Amil', 'U/L', 0, { ref: { min: 30, max: 110 } }),
  c('lipase', 'outros', 'Lipase', 'Lip', 'U/L', 0, { ref: { min: 13, max: 60 } }),
  c('ldh', 'outros', 'LDH', 'LDH', 'U/L', 0, { ref: { min: 140, max: 280 } }),
  c('cortisol_matinal', 'outros', 'Cortisol sérico matinal', 'Cortisol', 'µg/dL', 1, { ref: { min: 5, max: 25 } }),
  c('folato_eritrocitario', 'outros', 'Ácido fólico eritrocitário', 'Fol eritro', 'ng/mL', 0, { refNota: 'Dependente do método.' }),
  c('rpc_urinaria', 'outros', 'Relação proteína/creatinina urinária', 'RPC', 'mg/g', 0, { refNota: 'Abaixo de 150–200.' }),
];

export const CHAVES_EMAG = CAMPOS_EMAG.map(c => c.key);

/**
 * Painel prioritário da tabela da Kelly (seção 3). Ao abrir uma paciente que
 * nunca teve marcadores escolhidos, começa por estes três painéis; os demais
 * exames entram "conforme indicação e contexto individual".
 */
export const PAINEIS_EMAG = [
  { id: 'metabolico', label: 'Painel metabólico',
    chaves: ['glicemia_jejum', 'hba1c', 'insulina_jejum', 'homa_ir', 'colesterol_total', 'ldl', 'hdl', 'triglicerideos', 'acido_urico'] },
  { id: 'nutricional', label: 'Painel nutricional',
    chaves: ['hemacias', 'hemoglobina', 'hematocrito', 'vcm', 'hcm', 'chcm', 'rdw', 'leucocitos', 'plaquetas',
      'ferritina', 'ferro_serico', 'vitamina_b12', 'folato', 'vitamina_d', 'magnesio'] },
  { id: 'complementar', label: 'Painel complementar',
    chaves: ['tsh', 't4_livre', 'tgo', 'tgp', 'ggt', 'fosfatase_alcalina', 'albumina', 'ureia', 'creatinina', 'etfg',
      'pcr_us', 'sodio', 'potassio', 'cloro', 'calcio_total', 'fosforo'] },
];
export const CHAVES_PADRAO_EMAG = [...new Set(PAINEIS_EMAG.flatMap(p => p.chaves))];

/** Pré-seleção do pedido de exames de emagrecimento (itens do catálogo de solicitação). */
export const PEDIDO_EMAGRECIMENTO = [
  'Glicemia de jejum',
  'Hemoglobina glicada (HbA1c)',
  'Insulina de jejum e HOMA-IR',
  'Perfil lipídico completo (colesterol total, HDL, LDL, triglicerídeos)',
  'Hemograma completo',
  'Ferritina',
  'Vitamina B12',
  'Vitamina D (25-OH)',
  'Hepático (TGO/AST, TGP/ALT, gama-GT, fosfatase alcalina, bilirrubinas)',
  'Função renal (ureia, creatinina, taxa de filtração glomerular)',
  'Eletrólitos e minerais séricos (sódio, potássio, cálcio, magnésio, fósforo)',
  'TSH',
  'T4 livre',
  'PCR ultrassensível',
  'Urina tipo 1 (EAS)',
];
