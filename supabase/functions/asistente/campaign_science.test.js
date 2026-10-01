// Pruebas unitarias para el Motor Científico de Campañas V4
import test from 'node:test';
import assert from 'node:assert/strict';

import { validarEstructuraExperimentoV4 } from './campaign_science.ts';
import { ADS_TOOL_DEFS } from './ads.ts';

test('29. validarEstructuraExperimentoV4 rechaza experimentos sin hipótesis o sin variable a probar', () => {
  const invalido = {
    name: 'Campaña CPF Test',
    service: 'CPF',
    hypothesis: '',
    variable_tested: '',
    control_description: 'Anuncio estándar',
    treatment_description: 'Nuevo hook',
    objective: 'OUTCOME_MESSAGES',
    primary_metric: 'cost_per_customer',
    daily_budget: 50,
    variants: [
      { variant_name: 'Control', hook: 'H1', copy: 'C1', cta: 'WhatsApp' },
      { variant_name: 'Tratamiento A', hook: 'H2', copy: 'C2', cta: 'WhatsApp' },
    ],
    decision_rules: { scale_condition: 'ROAS > 3', pause_condition: 'Sin tracción', iterate_condition: 'Empate' },
  };

  const res = validarEstructuraExperimentoV4(invalido);
  assert.equal(res.valid, false);
  assert.match(res.error, /Faltan campos obligatorios/);
});

test('30. validarEstructuraExperimentoV4 exige al menos una variante Control explícita', () => {
  const sinControl = {
    name: 'Campaña CPF Test',
    service: 'CPF',
    hypothesis: 'El hook de burocracia aumentará la tasa de pago un 20%',
    variable_tested: 'Ángulo creativo',
    control_description: 'Anuncio estándar',
    treatment_description: 'Nuevo hook',
    objective: 'OUTCOME_MESSAGES',
    primary_metric: 'cost_per_customer',
    daily_budget: 50,
    variants: [
      { variant_name: 'Tratamiento A', hook: 'H1', copy: 'C1', cta: 'WhatsApp' },
      { variant_name: 'Tratamiento B', hook: 'H2', copy: 'C2', cta: 'WhatsApp' },
    ],
    decision_rules: { scale_condition: 'ROAS > 3', pause_condition: 'Sin tracción', iterate_condition: 'Empate' },
  };

  const res = validarEstructuraExperimentoV4(sinControl);
  assert.equal(res.valid, false);
  assert.match(res.error, /Control/);
});

test('31. validarEstructuraExperimentoV4 rechaza experimentos con menos de 2 variantes', () => {
  const unaSolaVariante = {
    name: 'Campaña CPF Test',
    service: 'CPF',
    hypothesis: 'El hook de burocracia aumentará la tasa de pago un 20%',
    variable_tested: 'Ángulo creativo',
    control_description: 'Anuncio estándar',
    treatment_description: 'Nuevo hook',
    objective: 'OUTCOME_MESSAGES',
    primary_metric: 'cost_per_customer',
    daily_budget: 50,
    variants: [
      { variant_name: 'Control', hook: 'H1', copy: 'C1', cta: 'WhatsApp' },
    ],
    decision_rules: { scale_condition: 'ROAS > 3', pause_condition: 'Sin tracción', iterate_condition: 'Empate' },
  };

  const res = validarEstructuraExperimentoV4(unaSolaVariante);
  assert.equal(res.valid, false);
  assert.match(res.error, /al menos 2 variantes/);
});

test('32. validarEstructuraExperimentoV4 valida correctamente un experimento científico V4 completo', () => {
  const valido = {
    name: 'Experimento CPF — Ángulo Burocracia vs Tradicional',
    service: 'CPF',
    question: '¿Los inmigrantes argentinos responden mejor a eliminación de burocracia o a precio bajo?',
    hypothesis: 'Los creativos que enfatizan eliminación de burocracia tendrán 25% mayor tasa de conversión a pago.',
    variable_tested: 'Hook y ángulo de dolor en los primeros 3 segundos',
    control_description: 'Creativo tradicional orientado a precio y rapidez',
    treatment_description: 'Creativo enfocado en no hacer filas ni lidiar con la Receita Federal',
    objective: 'OUTCOME_MESSAGES',
    primary_metric: 'cost_per_customer',
    secondary_metrics: ['cost_per_lead', 'ctr', 'cpc', 'tasa_conversion_pago'],
    audience_definition: { pais: 'Brasil', origen: 'Argentina', intereses: ['Migración', 'Trámites'] },
    daily_budget: 60,
    variants: [
      { variant_name: 'Control', hook: '¿Necesitas tu CPF en Brasil?', copy: 'Trámite rápido y seguro sin demoras.', cta: 'Contactar por WhatsApp' },
      { variant_name: 'Tratamiento A', hook: 'No hagas filas en la Receita Federal.', copy: 'Obtén tu CPF 100% online y sin burocracia.', cta: 'Iniciar trámite ahora' },
    ],
    decision_rules: {
      scale_condition: 'Costo por cliente < R$ 50 y ROAS > 3.0',
      pause_condition: 'Costo por conversación > R$ 15 tras R$ 100 invertidos',
      iterate_condition: 'Diferencia en tasa de pago inferior al 10%',
    },
  };

  const res = validarEstructuraExperimentoV4(valido);
  assert.equal(res.valid, true);
});

test('33. ADS_TOOL_DEFS incluye todas las herramientas del Motor Científico V4', () => {
  const toolNames = ADS_TOOL_DEFS.map(t => t.function.name);
  assert.ok(toolNames.includes('diagnosticar_funnel_campanas'), 'debe incluir diagnosticar_funnel_campanas');
  assert.ok(toolNames.includes('consultar_aprendizajes_campanas'), 'debe incluir consultar_aprendizajes_campanas');
  assert.ok(toolNames.includes('disenar_campana_v4'), 'debe incluir disenar_campana_v4');
  assert.ok(toolNames.includes('medir_experimento_v4'), 'debe incluir medir_experimento_v4');
  assert.ok(toolNames.includes('listar_experimentos_v4'), 'debe incluir listar_experimentos_v4');
});
