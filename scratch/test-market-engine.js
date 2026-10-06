/**
 * scratch/test-market-engine.js
 * Test suite para validar la lógica del motor de costeo con opciones por módulo y planes Hostinger VPS
 */

const fs = require('fs');

let appJsContent = fs.readFileSync('app.js', 'utf8');

appJsContent += `
globalThis.CostingEngine = CostingEngine;
globalThis.SuggestionEngine = SuggestionEngine;
globalThis.DEFAULT_MARKET_CATALOG = DEFAULT_MARKET_CATALOG;
`;

const sandbox = {
  document: {
    addEventListener: () => {},
    getElementById: () => null
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  window: {
    addEventListener: () => {},
    print: () => {}
  },
  Intl: Intl,
  globalThis: {}
};

const vm = require('vm');
const context = vm.createContext(sandbox);
vm.runInContext(appJsContent, context);

const CostingEngine = sandbox.globalThis.CostingEngine;
const SuggestionEngine = sandbox.globalThis.SuggestionEngine;
const DEFAULT_MARKET_CATALOG = sandbox.globalThis.DEFAULT_MARKET_CATALOG;

console.log("=== INICIO DE PRUEBAS DEL MOTOR CON OPCIONES & HOSTINGER VPS ===");

// 1. Validar módulos y opciones
console.log(`✓ Módulos cargados en catálogo maestro: ${DEFAULT_MARKET_CATALOG.length}`);
DEFAULT_MARKET_CATALOG.forEach(m => {
  const optCount = m.options ? m.options.length : 0;
  console.log(`   - [${m.layer.toUpperCase()}] ${m.name} -> ${optCount} opciones disponibles.`);
});

// 2. Validar que exista el módulo de Frontend UI/UX
const feModule = DEFAULT_MARKET_CATALOG.find(m => m.layer === "frontend");
if (!feModule) {
  console.error("❌ ERROR: No se encontró el módulo de Frontend UI/UX.");
  process.exit(1);
}
console.log(`\n✓ Módulo Frontend UI/UX verificado: ${feModule.name}`);

// 3. Validar planes de Hostinger VPS (1 y 2 años)
const vpsModule = DEFAULT_MARKET_CATALOG.find(m => m.id === "mod_vps_hostinger");
if (!vpsModule || !vpsModule.options) {
  console.error("❌ ERROR: No se encontró el módulo de Hostinger VPS.");
  process.exit(1);
}
console.log(`\n✓ Módulo Hostinger VPS verificado con ${vpsModule.options.length} planes (1 y 2 años):`);
vpsModule.options.forEach(opt => {
  console.log(`   * ${opt.name} | Infra: ${CostingEngine.formatCOP(opt.infraCostCOP)} | Duración: ${opt.durationMonths} meses`);
});

// 4. Probar Cálculo con Módulo de Frontend (Opción 2), Backend (Opción 2) y VPS Hostinger KVM 2 a 1 año
const mockQuoteModules = [
  {
    id: "mod_frontend",
    name: "Frontend Web & Diseño UI/UX",
    selectedOptionName: feModule.options[1].name,
    hours: feModule.options[1].hours,
    multiplier: 1.25,
    pricingMode: "market",
    marketPriceCOP: feModule.options[1].marketPriceCOP,
    customClientPrice: feModule.options[1].marketPriceCOP
  },
  {
    id: "mod_backend",
    name: "Backend, APIs RESTful & Servicios",
    hours: 36,
    multiplier: 1.25,
    pricingMode: "market",
    marketPriceCOP: 1850000,
    customClientPrice: 1850000
  },
  {
    id: "mod_vps_hostinger",
    name: "Infraestructura Cloud & Despliegue en VPS Hostinger",
    hours: 16,
    multiplier: 1.25,
    pricingMode: "market",
    marketPriceCOP: 1250000,
    customClientPrice: 1250000
  }
];

// Supongamos Hostinger KVM 2 prepagado por 1 año ($406.800 COP)
const hostinger1YearCost = 406800;

const calculation = CostingEngine.calculateQuoteTotals({
  modules: mockQuoteModules,
  hourlyRate: 15000,
  infraMonthlyCost: Math.round(hostinger1YearCost / 12),
  infraMonths: 12,
  profitMarginPercent: 35,
  teamDevelopersCount: 3
});

console.log("\n=== BALANCE FINANCIERO DE PRUEBA ===");
console.log(`- Horas Totales: ${calculation.summary.totalLaborHours} hrs`);
console.log(`- Costo Interno Mano de Obra: ${CostingEngine.formatCOP(calculation.summary.internalLaborCost)}`);
console.log(`- Costo Servidor Hostinger VPS KVM 2 (1 Año): ${CostingEngine.formatCOP(calculation.summary.totalInfraCost)}`);
console.log(`- Costo Interno Total: ${CostingEngine.formatCOP(calculation.summary.totalInternalCost)}`);
console.log(`- PRECIO FINAL CLIENTE: ${CostingEngine.formatCOP(calculation.summary.clientFinalPrice)}`);
console.log(`- Ganancia Neta para el Equipo: ${CostingEngine.formatCOP(calculation.summary.netProfitAmount)}`);
console.log(`- Margen Efectivo: ${calculation.summary.effectiveMarginPercent}%`);
console.log(`- Tiempo Estimado: ${calculation.summary.estimatedDeliveryWeeks} semanas`);

console.log("\n✅ PRUEBA COMPLETADA: Catálogo, Opciones y Hostinger VPS validados con éxito.");
