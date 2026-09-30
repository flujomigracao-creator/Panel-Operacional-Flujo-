// Pruebas unitarias para el módulo de Meta Ads del Asistente de Inteligencia
import test from 'node:test';
import assert from 'node:assert/strict';

// Funciones a testear (re-implementadas / exportables para el runner de Node)
import {
  calculateAdsMetrics,
  validateAdsOperation,
  DEFAULT_ADS_LIMITS,
  ADS_TOOL_DEFS,
} from './ads.ts';

test('1. calculateAdsMetrics calcula correctamente CTR, CPC, CPM y costo por conversación', () => {
  const input = {
    spend: 150.5,
    impressions: 10000,
    clicks: 250,
    conversations: 15,
    leads: 3,
    revenueAttributed: 600,
    hasAttribution: true,
  };

  const res = calculateAdsMetrics(input);

  assert.equal(res.spend, 150.5);
  assert.equal(res.impressions, 10000);
  assert.equal(res.clicks, 250);
  assert.equal(res.ctr, 2.5); // (250 / 10000) * 100
  assert.equal(res.cpc, 0.6); // 150.5 / 250 = 0.602 -> 0.6
  assert.equal(res.cpm, 15.05); // (150.5 / 10000) * 1000
  assert.equal(res.conversations, 15);
  assert.equal(res.costPerConversation, 10.03); // 150.5 / 15 = 10.033 -> 10.03
  assert.equal(res.costPerLead, 50.17); // 150.5 / 3 = 50.166 -> 50.17
  assert.equal(res.roas, 3.99); // 600 / 150.5 = 3.9867 -> 3.99
  assert.equal(res.attributionStatus, 'confirmed');
});

test('2. calculateAdsMetrics maneja divisiones por cero sin producir NaN ni Infinity', () => {
  const zeroInput = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversations: 0,
    leads: 0,
  };

  const res = calculateAdsMetrics(zeroInput);

  assert.equal(res.spend, 0);
  assert.equal(res.ctr, 0);
  assert.equal(res.cpc, 0);
  assert.equal(res.cpm, 0);
  assert.equal(res.costPerConversation, null);
  assert.equal(res.costPerLead, null);
  assert.equal(res.conversationRate, null);
  assert.equal(res.roas, null);
  assert.equal(res.attributionStatus, 'unavailable');
});

test('3. validateAdsOperation bloquea operaciones en cuentas no autorizadas', () => {
  const limits = {
    ...DEFAULT_ADS_LIMITS,
    allowedAdAccountId: 'act_123456789',
  };

  const op = {
    tipo: 'cambiar_presupuesto_campana',
    accountId: 'act_999999999',
    presupuestoActual: 50,
    presupuestoNuevo: 60,
  };

  const res = validateAdsOperation(op, limits);
  assert.equal(res.valid, false);
  assert.match(res.error, /no coincide con la cuenta autorizada/);
});

test('4. validateAdsOperation valida límites de cambio absoluto de presupuesto', () => {
  const limits = {
    ...DEFAULT_ADS_LIMITS,
    maxDailyBudgetChange: 100, // Max R$ 100 de delta
  };

  // Cambio válido: R$ 50 -> R$ 120 (delta 70 <= 100)
  const opValida = {
    tipo: 'cambiar_presupuesto_campana',
    presupuestoActual: 50,
    presupuestoNuevo: 70, // +40%
  };
  assert.equal(validateAdsOperation(opValida, limits).valid, true);

  // Cambio inválido: delta R$ 150 > 100
  const opExcesiva = {
    tipo: 'cambiar_presupuesto_campana',
    presupuestoActual: 50,
    presupuestoNuevo: 200, // delta 150 > 100
  };
  const res = validateAdsOperation(opExcesiva, limits);
  assert.equal(res.valid, false);
  assert.match(res.error, /supera el límite máximo por operación/);
});

test('5. validateAdsOperation valida límites de porcentaje de incremento', () => {
  const limits = {
    ...DEFAULT_ADS_LIMITS,
    maxBudgetIncreasePercent: 50, // Max +50%
  };

  // Aumento de 100 a 160 (+60% > 50%)
  const opPorcentajeExcesivo = {
    tipo: 'cambiar_presupuesto_campana',
    presupuestoActual: 100,
    presupuestoNuevo: 160,
  };

  const res = validateAdsOperation(opPorcentajeExcesivo, limits);
  assert.equal(res.valid, false);
  assert.match(res.error, /supera el límite máximo permitido de \+50%/);
});

test('6. validateAdsOperation rechaza presupuestos negativos o cero', () => {
  const opCero = {
    tipo: 'cambiar_presupuesto_campana',
    presupuestoActual: 50,
    presupuestoNuevo: 0,
  };

  const res = validateAdsOperation(opCero, DEFAULT_ADS_LIMITS);
  assert.equal(res.valid, false);
  assert.match(res.error, /debe ser mayor a 0/);
});

test('7. validateAdsOperation valida presupuesto de creación de campaña', () => {
  const limits = {
    ...DEFAULT_ADS_LIMITS,
    maxCampaignCreationBudget: 200,
  };

  const opCrearOk = {
    tipo: 'crear_campana_ads',
    montoCreacion: 80,
  };
  assert.equal(validateAdsOperation(opCrearOk, limits).valid, true);

  const opCrearExcesivo = {
    tipo: 'crear_campana_ads',
    montoCreacion: 350,
  };
  const res = validateAdsOperation(opCrearExcesivo, limits);
  assert.equal(res.valid, false);
  assert.match(res.error, /supera el límite de creación/);
});

test('8. ADS_TOOL_DEFS tiene todas las definiciones requeridas con esquemas válidos', () => {
  assert.ok(Array.isArray(ADS_TOOL_DEFS));
  assert.equal(ADS_TOOL_DEFS.length >= 7, true);

  const toolNames = ADS_TOOL_DEFS.map(t => t.function.name);
  assert.ok(toolNames.includes('listar_campanas_ads'));
  assert.ok(toolNames.includes('analizar_rendimiento_ads'));
  assert.ok(toolNames.includes('comparar_periodos_ads'));
  assert.ok(toolNames.includes('metricas_atribucion_ads'));
  assert.ok(toolNames.includes('proponer_cambiar_estado_campana'));
  assert.ok(toolNames.includes('proponer_cambiar_presupuesto_campana'));
  assert.ok(toolNames.includes('proponer_crear_campana_ads'));

  for (const tool of ADS_TOOL_DEFS) {
    assert.equal(tool.type, 'function');
    assert.ok(tool.function.name);
    assert.ok(tool.function.description);
    assert.ok(tool.function.parameters);
  }
});
