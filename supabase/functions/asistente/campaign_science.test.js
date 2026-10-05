// Pruebas unitarias para el Motor Científico de Campañas V4 y V5
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validarEstructuraExperimentoV4, generarConceptosCreativos, SERVICIOS_SOPORTADOS } from './campaign_science.ts';
import { ADS_TOOL_DEFS } from './ads.ts';

// Raíz del repo: este archivo vive en supabase/functions/asistente/
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

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

// ── Motor Científico V5: Creador de Creativos y Biblioteca de Prompts ──

test('34. generarConceptosCreativos devuelve todos los campos obligatorios para publicidad', () => {
  const resultado = generarConceptosCreativos('CPF', 'persona_documentacion', '1:1');

  assert.ok(typeof resultado.prompt_imagen === 'string' && resultado.prompt_imagen.length > 20, 'debe generar un prompt detallado para la imagen');
  assert.ok(typeof resultado.headline === 'string' && resultado.headline.length > 5, 'debe generar un titular del anuncio');
  assert.ok(typeof resultado.primary_text === 'string' && resultado.primary_text.length > 20, 'debe generar el texto principal persuasivo');
  assert.ok(typeof resultado.cta === 'string' && resultado.cta.length > 0, 'debe incluir la llamada a la acción');
  assert.equal(resultado.service, 'CPF', 'debe preservar el servicio seleccionado');
  assert.equal(resultado.visual_concept, 'persona_documentacion', 'debe preservar el concepto visual');
  assert.equal(resultado.format, '1:1', 'debe preservar el formato');
});

test('35. generarConceptosCreativos adapta el prompt al formato 9:16 para Stories y Reels', () => {
  const resultado = generarConceptosCreativos('RNM', 'problema_solucion', '9:16');
  assert.ok(resultado.prompt_imagen.includes('9:16'), 'el prompt debe mencionar el formato 9:16');
  assert.ok(resultado.headline.includes('RNM'), 'el titular debe mencionar el servicio RNM');
});

test('36. generarConceptosCreativos mantiene servicios separados sin mezclar intenciones', () => {
  const cpf = generarConceptosCreativos('CPF', 'servicio_directo', '1:1');
  const rnm = generarConceptosCreativos('RNM', 'servicio_directo', '1:1');

  assert.ok(cpf.headline.includes('CPF'), 'el headline de CPF debe mencionar CPF');
  assert.ok(rnm.headline.includes('RNM'), 'el headline de RNM debe mencionar RNM');
  assert.notEqual(cpf.headline, rnm.headline, 'los headlines de servicios distintos no deben ser iguales');
  assert.notEqual(cpf.primary_text, rnm.primary_text, 'los copies de servicios distintos deben ser diferentes');
});

test('37. generarConceptosCreativos fallback a servicio_directo cuando el concepto es desconocido', () => {
  const resultado = generarConceptosCreativos('Agendamento PF', 'concepto_inexistente', '4:5');
  assert.ok(typeof resultado.headline === 'string' && resultado.headline.length > 5, 'debe devolver un headline aunque el concepto sea desconocido');
  assert.ok(typeof resultado.prompt_imagen === 'string' && resultado.prompt_imagen.length > 20, 'debe devolver un prompt aunque el concepto sea desconocido');
});

test('38. ADS_TOOL_DEFS incluye las 4 herramientas del Motor Científico V5 de Creativos', () => {
  const toolNames = ADS_TOOL_DEFS.map(t => t.function.name);
  assert.ok(toolNames.includes('ranking_creativos_ads'), 'debe incluir ranking_creativos_ads');
  assert.ok(toolNames.includes('consultar_biblioteca_prompts'), 'debe incluir consultar_biblioteca_prompts');
  assert.ok(toolNames.includes('generar_concepto_creativo'), 'debe incluir generar_concepto_creativo');
  assert.ok(toolNames.includes('comparar_creativos_ads'), 'debe incluir comparar_creativos_ads');
});

test('39. generar_concepto_creativo en ADS_TOOL_DEFS tiene todos los conceptos visuales como enum', () => {
  const tool = ADS_TOOL_DEFS.find(t => t.function.name === 'generar_concepto_creativo');
  assert.ok(tool, 'la herramienta generar_concepto_creativo debe existir');
  const conceptoEnum = tool.function.parameters.properties.concepto.enum;
  assert.ok(conceptoEnum.includes('persona_documentacion'), 'debe incluir persona_documentacion');
  assert.ok(conceptoEnum.includes('problema_solucion'), 'debe incluir problema_solucion');
  assert.ok(conceptoEnum.includes('servicio_directo'), 'debe incluir servicio_directo');
  assert.ok(conceptoEnum.includes('institucional'), 'debe incluir institucional');
  assert.ok(conceptoEnum.includes('ganador_historico'), 'debe incluir ganador_historico');
});

test('40. generar_concepto_creativo en ADS_TOOL_DEFS tiene los 3 formatos publicitarios como enum', () => {
  const tool = ADS_TOOL_DEFS.find(t => t.function.name === 'generar_concepto_creativo');
  assert.ok(tool, 'la herramienta generar_concepto_creativo debe existir');
  const formatoEnum = tool.function.parameters.properties.formato.enum;
  assert.ok(formatoEnum.includes('1:1'), 'debe incluir formato 1:1 (Feed cuadrado)');
  assert.ok(formatoEnum.includes('4:5'), 'debe incluir formato 4:5 (Portrait)');
  assert.ok(formatoEnum.includes('9:16'), 'debe incluir formato 9:16 (Stories/Reels)');
});

test('41. SERVICIOS_SOPORTADOS exporta todos los servicios de Flujo de Migração', () => {
  assert.ok(Array.isArray(SERVICIOS_SOPORTADOS), 'debe ser un arreglo');
  assert.ok(SERVICIOS_SOPORTADOS.includes('CPF'), 'debe incluir CPF');
  assert.ok(SERVICIOS_SOPORTADOS.includes('RNM'), 'debe incluir RNM');
  assert.ok(SERVICIOS_SOPORTADOS.includes('Refúgio'), 'debe incluir Refúgio');
  assert.ok(SERVICIOS_SOPORTADOS.length >= 5, 'debe tener al menos 5 servicios');
});

test('42. assistantService.js exporta las funciones V5 de creativos y prompts', () => {
  const src = readFileSync(join(RAIZ, 'src', 'features', 'assistant', 'services', 'assistantService.js'), 'utf8');

  assert.ok(src.includes('export async function getCampaignCreatives'), 'debe exportar getCampaignCreatives');
  assert.ok(src.includes('export async function getCreativePrompts'), 'debe exportar getCreativePrompts');
  assert.ok(src.includes('export async function saveCampaignCreative'), 'debe exportar saveCampaignCreative');
  assert.ok(src.includes('export async function saveCreativePrompt'), 'debe exportar saveCreativePrompt');
  assert.ok(src.includes("from('campaign_creatives')"), 'debe leer de campaign_creatives');
  assert.ok(src.includes("from('creative_prompts')"), 'debe leer de creative_prompts');
});

