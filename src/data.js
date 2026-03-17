// ═══════════════════════════════════════════════════════════════════════════════
// DATA.JS — Estado Inicial ("Banco de Dados" JSON) com dados reais dos PDFs
//   Regions, Questions, Tasks, Rules, History, Scenarios
// ═══════════════════════════════════════════════════════════════════════════════

export const INITIAL_STATE = {
  // ── REGIÕES ──
  regions: [
    { id: 'fortaleza', name: 'Fortaleza', state: 'CE' },
    { id: 'sao_paulo', name: 'São Paulo', state: 'SP' },
  ],

  // ── PERGUNTAS ──
  questions: [
    // ═══ Fortaleza/CE ═══
    { id: 'q1', text: 'Haverá demolição no terreno?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },
    { id: 'q2', text: 'A área total construída é acima de 40.000m²?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },
    { id: 'q3', text: 'Haverá supressão de mais de 49 árvores?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },
    { id: 'q4', text: 'O projeto tem mais de 300 unidades?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },
    {
      id: 'q5', text: 'Qual a zona do terreno?', type: 'select', region_id: 'fortaleza', visible_when: null, eliminatory: null,
      options: [
        { value: 'zo', label: 'Zona de Ocupação (ZO)' },
        { value: 'zia', label: 'Zona de Interesse Ambiental (ZIA)' },
        { value: 'zrm', label: 'Zona Residencial Mista (ZRM)' },
        { value: 'zc', label: 'Zona Comercial (ZC)' },
      ],
    },
    { id: 'q6', text: 'O terreno está em Área de Preservação Permanente (APP)?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: { value: true, message: '⛔ Projeto INVIÁVEL: Terrenos em APP não podem receber edificações. A aquisição deve ser descartada.' }, options: null },
    { id: 'q7', text: 'Existe imóvel tombado ou de interesse histórico (IPHAN) no lote ou entorno?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },
    { id: 'q8', text: 'O empreendimento necessita de Estudo de Impacto de Vizinhança (EIV)?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },
    { id: 'q9', text: 'O empreendimento gera significativo impacto no trânsito (EIT)?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },
    {
      id: 'q10', text: 'Tipo de empreendimento?', type: 'select', region_id: 'fortaleza', visible_when: null, eliminatory: null,
      options: [
        { value: 'residencial', label: 'Residencial' },
        { value: 'comercial', label: 'Comercial' },
        { value: 'misto', label: 'Uso Misto' },
      ],
    },
    { id: 'q11', text: 'O terreno possui matrícula regularizada?', type: 'boolean', region_id: 'fortaleza', visible_when: null, eliminatory: null, options: null },

    // ═══ São Paulo/SP ═══
    { id: 'q_sp1', text: 'Haverá demolição no terreno?', type: 'boolean', region_id: 'sao_paulo', visible_when: null, eliminatory: null, options: null },
    { id: 'q_sp2', text: 'A área total construída é acima de 20.000m²?', type: 'boolean', region_id: 'sao_paulo', visible_when: null, eliminatory: null, options: null },
    { id: 'q_sp3', text: 'O terreno está em Zona Especial de Proteção Ambiental (ZEPAM)?', type: 'boolean', region_id: 'sao_paulo', visible_when: null, eliminatory: { value: true, message: '⛔ Projeto INVIÁVEL em ZEPAM: Não é permitida nova edificação nesta zona.' }, options: null },
    { id: 'q_sp4', text: 'O projeto necessita de outorga onerosa do direito de construir?', type: 'boolean', region_id: 'sao_paulo', visible_when: null, eliminatory: null, options: null },
    { id: 'q_sp5', text: 'O terreno está em Operação Urbana Consorciada?', type: 'boolean', region_id: 'sao_paulo', visible_when: null, eliminatory: null, options: null },
  ],

  // ── ETAPAS (TASKS) ──
  tasks: [
    // ═══ Fortaleza/CE ═══
    { id: 't_comite', name: 'Comitê de Aquisição', default_duration_months: 0, min_duration_months: 0, max_duration_months: 0, internal_months: 0, external_months: 0, estimated_cost: 0, region_id: 'fortaleza' },
    { id: 't_demolicao', name: 'Demolição', default_duration_months: 6, min_duration_months: 4, max_duration_months: 8, internal_months: 1, external_months: 5, estimated_cost: 150000, region_id: 'fortaleza' },
    { id: 't_projetos', name: 'Projetos Iniciais', default_duration_months: 2, min_duration_months: 1.5, max_duration_months: 3, internal_months: 2, external_months: 0, estimated_cost: 200000, region_id: 'fortaleza' },
    { id: 't_bombeiros', name: 'Aprovação Bombeiros (CBMCE)', default_duration_months: 4.5, min_duration_months: 3, max_duration_months: 6, internal_months: 0.5, external_months: 4, estimated_cost: 15000, region_id: 'fortaleza' },
    { id: 't_las', name: 'Licença Ambiental Simplificada (LAS)', default_duration_months: 7, min_duration_months: 5, max_duration_months: 10, internal_months: 1, external_months: 6, estimated_cost: 25000, region_id: 'fortaleza' },
    { id: 't_lp_li', name: 'Licença Ambiental Regular (LP+LI)', default_duration_months: 10, min_duration_months: 8, max_duration_months: 14, internal_months: 2, external_months: 8, estimated_cost: 80000, region_id: 'fortaleza' },
    { id: 't_aop', name: 'Análise de Orientação Prévia (AOP/SEUMA)', default_duration_months: 3.5, min_duration_months: 2, max_duration_months: 5.7, internal_months: 0.5, external_months: 3, estimated_cost: 10000, region_id: 'fortaleza' },
    { id: 't_alvara', name: 'Alvará de Construção', default_duration_months: 3, min_duration_months: 2, max_duration_months: 5, internal_months: 0.5, external_months: 2.5, estimated_cost: 30000, region_id: 'fortaleza' },
    { id: 't_ri', name: 'Registro de Incorporação (RI)', default_duration_months: 1, min_duration_months: 0.5, max_duration_months: 2, internal_months: 0.5, external_months: 0.5, estimated_cost: 20000, region_id: 'fortaleza' },
    { id: 't_iphan', name: 'Aprovação IPHAN', default_duration_months: 6, min_duration_months: 4, max_duration_months: 12, internal_months: 1, external_months: 5, estimated_cost: 35000, region_id: 'fortaleza' },
    { id: 't_eiv', name: 'Estudo de Impacto de Vizinhança (EIV)', default_duration_months: 4, min_duration_months: 3, max_duration_months: 8, internal_months: 2, external_months: 2, estimated_cost: 60000, region_id: 'fortaleza' },
    { id: 't_eit', name: 'Estudo de Impacto no Trânsito (EIT)', default_duration_months: 3, min_duration_months: 2, max_duration_months: 5, internal_months: 1, external_months: 2, estimated_cost: 40000, region_id: 'fortaleza' },
    { id: 't_regularizacao', name: 'Regularização da Matrícula', default_duration_months: 4, min_duration_months: 2, max_duration_months: 8, internal_months: 1, external_months: 3, estimated_cost: 25000, region_id: 'fortaleza' },
    { id: 't_zia_estudo', name: 'Estudo Ambiental ZIA (SEUMA)', default_duration_months: 5, min_duration_months: 3, max_duration_months: 8, internal_months: 2, external_months: 3, estimated_cost: 45000, region_id: 'fortaleza' },

    // ═══ São Paulo/SP ═══
    { id: 't_sp_comite', name: 'Comitê de Aquisição', default_duration_months: 0, min_duration_months: 0, max_duration_months: 0, internal_months: 0, external_months: 0, estimated_cost: 0, region_id: 'sao_paulo' },
    { id: 't_sp_demolicao', name: 'Demolição', default_duration_months: 5, min_duration_months: 3, max_duration_months: 7, internal_months: 1, external_months: 4, estimated_cost: 200000, region_id: 'sao_paulo' },
    { id: 't_sp_projetos', name: 'Projetos Iniciais', default_duration_months: 3, min_duration_months: 2, max_duration_months: 4, internal_months: 3, external_months: 0, estimated_cost: 350000, region_id: 'sao_paulo' },
    { id: 't_sp_bombeiros', name: 'AVCB (Corpo de Bombeiros SP)', default_duration_months: 3, min_duration_months: 2, max_duration_months: 5, internal_months: 0.5, external_months: 2.5, estimated_cost: 20000, region_id: 'sao_paulo' },
    { id: 't_sp_lic_ambiental', name: 'Licença Ambiental (CETESB)', default_duration_months: 8, min_duration_months: 6, max_duration_months: 12, internal_months: 2, external_months: 6, estimated_cost: 50000, region_id: 'sao_paulo' },
    { id: 't_sp_alvara', name: 'Alvará de Aprovação e Execução', default_duration_months: 4, min_duration_months: 3, max_duration_months: 6, internal_months: 1, external_months: 3, estimated_cost: 40000, region_id: 'sao_paulo' },
    { id: 't_sp_ri', name: 'Registro de Incorporação (RI)', default_duration_months: 1.5, min_duration_months: 1, max_duration_months: 3, internal_months: 0.5, external_months: 1, estimated_cost: 25000, region_id: 'sao_paulo' },
    { id: 't_sp_outorga', name: 'Outorga Onerosa (SMUL)', default_duration_months: 3, min_duration_months: 2, max_duration_months: 5, internal_months: 0.5, external_months: 2.5, estimated_cost: 500000, region_id: 'sao_paulo' },
    { id: 't_sp_operacao', name: 'Aprovação Op. Urbana Consorciada', default_duration_months: 6, min_duration_months: 4, max_duration_months: 10, internal_months: 1, external_months: 5, estimated_cost: 100000, region_id: 'sao_paulo' },
  ],

  // ── REGRAS (GATILHOS) ──
  // Nota: a ORDEM das regras "add" importa para mesma task (última vence).
  //       Regras "only_if_active" ADICIONAM deps ao invés de substituir.
  rules: [
    // ═══ Fortaleza/CE — Incondicionais (sempre ativas) ═══
    { id: 'r01', if_question_id: null, equals_value: null, then_add_task_id: 't_comite', depends_on_task_ids: [], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r02', if_question_id: null, equals_value: null, then_add_task_id: 't_projetos', depends_on_task_ids: ['t_comite'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r03', if_question_id: null, equals_value: null, then_add_task_id: 't_bombeiros', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r04', if_question_id: null, equals_value: null, then_add_task_id: 't_las', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r05', if_question_id: null, equals_value: null, then_add_task_id: 't_alvara', depends_on_task_ids: ['t_bombeiros', 't_las', 't_lp_li'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r06', if_question_id: null, equals_value: null, then_add_task_id: 't_ri', depends_on_task_ids: ['t_alvara'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — Demolição (q1 = Sim) ═══
    { id: 'r07', if_question_id: 'q1', equals_value: true, then_add_task_id: 't_demolicao', depends_on_task_ids: ['t_comite'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r08', if_question_id: 'q1', equals_value: true, then_add_task_id: 't_projetos', depends_on_task_ids: ['t_demolicao'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — Licença Regular por área (q2 = Sim, q3 = Sim) ═══
    { id: 'r09', if_question_id: 'q2', equals_value: true, then_add_task_id: 't_lp_li', depends_on_task_ids: ['t_projetos'], replaces_task_id: 't_las', only_if_active: false, region_id: 'fortaleza' },
    { id: 'r10', if_question_id: 'q3', equals_value: true, then_add_task_id: 't_lp_li', depends_on_task_ids: ['t_projetos'], replaces_task_id: 't_las', only_if_active: false, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — AOP obrigatória > 300 unidades (q4 = Sim) ═══
    { id: 'r11', if_question_id: 'q4', equals_value: true, then_add_task_id: 't_aop', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r12', if_question_id: 'q4', equals_value: true, then_add_task_id: 't_las', depends_on_task_ids: ['t_aop'], replaces_task_id: null, only_if_active: true, region_id: 'fortaleza' },
    { id: 'r13', if_question_id: 'q4', equals_value: true, then_add_task_id: 't_lp_li', depends_on_task_ids: ['t_aop'], replaces_task_id: null, only_if_active: true, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — ZIA (q5 = 'zia') ═══
    { id: 'r14', if_question_id: 'q5', equals_value: 'zia', then_add_task_id: 't_zia_estudo', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r15', if_question_id: 'q5', equals_value: 'zia', then_add_task_id: 't_alvara', depends_on_task_ids: ['t_zia_estudo'], replaces_task_id: null, only_if_active: true, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — IPHAN (q7 = Sim) ═══
    { id: 'r16', if_question_id: 'q7', equals_value: true, then_add_task_id: 't_iphan', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r17', if_question_id: 'q7', equals_value: true, then_add_task_id: 't_alvara', depends_on_task_ids: ['t_iphan'], replaces_task_id: null, only_if_active: true, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — EIV (q8 = Sim) ═══
    { id: 'r18', if_question_id: 'q8', equals_value: true, then_add_task_id: 't_eiv', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r19', if_question_id: 'q8', equals_value: true, then_add_task_id: 't_alvara', depends_on_task_ids: ['t_eiv'], replaces_task_id: null, only_if_active: true, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — EIT (q9 = Sim) ═══
    { id: 'r20', if_question_id: 'q9', equals_value: true, then_add_task_id: 't_eit', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r21', if_question_id: 'q9', equals_value: true, then_add_task_id: 't_alvara', depends_on_task_ids: ['t_eit'], replaces_task_id: null, only_if_active: true, region_id: 'fortaleza' },

    // ═══ Fortaleza/CE — Regularização de Matrícula (q11 = Não) ═══
    { id: 'r22', if_question_id: 'q11', equals_value: false, then_add_task_id: 't_regularizacao', depends_on_task_ids: ['t_comite'], replaces_task_id: null, only_if_active: false, region_id: 'fortaleza' },
    { id: 'r23', if_question_id: 'q11', equals_value: false, then_add_task_id: 't_projetos', depends_on_task_ids: ['t_regularizacao'], replaces_task_id: null, only_if_active: true, region_id: 'fortaleza' },

    // ═══ São Paulo/SP — Incondicionais ═══
    { id: 'r_sp01', if_question_id: null, equals_value: null, then_add_task_id: 't_sp_comite', depends_on_task_ids: [], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp02', if_question_id: null, equals_value: null, then_add_task_id: 't_sp_projetos', depends_on_task_ids: ['t_sp_comite'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp03', if_question_id: null, equals_value: null, then_add_task_id: 't_sp_bombeiros', depends_on_task_ids: ['t_sp_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp04', if_question_id: null, equals_value: null, then_add_task_id: 't_sp_lic_ambiental', depends_on_task_ids: ['t_sp_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp05', if_question_id: null, equals_value: null, then_add_task_id: 't_sp_alvara', depends_on_task_ids: ['t_sp_bombeiros', 't_sp_lic_ambiental'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp06', if_question_id: null, equals_value: null, then_add_task_id: 't_sp_ri', depends_on_task_ids: ['t_sp_alvara'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },

    // ═══ SP — Demolição (q_sp1 = Sim) ═══
    { id: 'r_sp07', if_question_id: 'q_sp1', equals_value: true, then_add_task_id: 't_sp_demolicao', depends_on_task_ids: ['t_sp_comite'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp08', if_question_id: 'q_sp1', equals_value: true, then_add_task_id: 't_sp_projetos', depends_on_task_ids: ['t_sp_demolicao'], replaces_task_id: null, only_if_active: true, region_id: 'sao_paulo' },

    // ═══ SP — Área > 20k (q_sp2 = Sim) → licença mais demorada ═══
    // (Em SP, acima de 20k m² a CETESB exige análise detalhada — já incluída na task base, mas o prazo sobe)
    // Sem task adicional, apenas nota. Poderia criar uma task separada se necessário.

    // ═══ SP — Outorga Onerosa (q_sp4 = Sim) ═══
    { id: 'r_sp09', if_question_id: 'q_sp4', equals_value: true, then_add_task_id: 't_sp_outorga', depends_on_task_ids: ['t_sp_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp10', if_question_id: 'q_sp4', equals_value: true, then_add_task_id: 't_sp_alvara', depends_on_task_ids: ['t_sp_outorga'], replaces_task_id: null, only_if_active: true, region_id: 'sao_paulo' },

    // ═══ SP — Operação Urbana Consorciada (q_sp5 = Sim) ═══
    { id: 'r_sp11', if_question_id: 'q_sp5', equals_value: true, then_add_task_id: 't_sp_operacao', depends_on_task_ids: ['t_sp_projetos'], replaces_task_id: null, only_if_active: false, region_id: 'sao_paulo' },
    { id: 'r_sp12', if_question_id: 'q_sp5', equals_value: true, then_add_task_id: 't_sp_alvara', depends_on_task_ids: ['t_sp_operacao'], replaces_task_id: null, only_if_active: true, region_id: 'sao_paulo' },
  ],

  // ── HISTÓRICO DE PROJETOS (mock para comparação) ──
  history: [
    {
      id: 'h1', project_name: 'Edifício Paupina I', region_id: 'fortaleza', year: 2024,
      tasks_completed: [
        { task_id: 't_projetos', actual_duration: 2.5, notes: 'Revisão de projeto pela prefeitura' },
        { task_id: 't_bombeiros', actual_duration: 5, notes: 'Atraso na análise do CBMCE' },
        { task_id: 't_las', actual_duration: 8, notes: 'SEMACE pediu laudo complementar' },
        { task_id: 't_alvara', actual_duration: 3.5, notes: '' },
        { task_id: 't_ri', actual_duration: 1, notes: '' },
      ],
    },
    {
      id: 'h2', project_name: 'Residencial Messejana', region_id: 'fortaleza', year: 2023,
      tasks_completed: [
        { task_id: 't_demolicao', actual_duration: 5, notes: '' },
        { task_id: 't_projetos', actual_duration: 2, notes: '' },
        { task_id: 't_bombeiros', actual_duration: 4, notes: '' },
        { task_id: 't_las', actual_duration: 6.5, notes: '' },
        { task_id: 't_alvara', actual_duration: 2.5, notes: '' },
        { task_id: 't_ri', actual_duration: 1.5, notes: 'Pendência no cartório' },
      ],
    },
    {
      id: 'h3', project_name: 'Condomínio Aldeota Park', region_id: 'fortaleza', year: 2025,
      tasks_completed: [
        { task_id: 't_projetos', actual_duration: 3, notes: 'Projeto complexo (uso misto)' },
        { task_id: 't_bombeiros', actual_duration: 4.5, notes: '' },
        { task_id: 't_lp_li', actual_duration: 12, notes: 'Licença Regular por área > 40k m²' },
        { task_id: 't_aop', actual_duration: 4, notes: '' },
        { task_id: 't_iphan', actual_duration: 7, notes: 'Entorno de imóvel tombado' },
        { task_id: 't_eiv', actual_duration: 5, notes: '' },
        { task_id: 't_alvara', actual_duration: 4, notes: '' },
        { task_id: 't_ri', actual_duration: 1, notes: '' },
      ],
    },
  ],

  // ── CENÁRIOS SALVOS ──
  scenarios: [],
};
