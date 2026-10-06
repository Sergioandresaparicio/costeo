/**
 * app.js
 * DevCost - Sistema Interno de Cotización & Costeo de Software
 * Incluye Benchmark de Mercado Colombia para PYMES, Opciones por Módulo y Planes VPS Hostinger (1 y 2 años)
 * Vanilla JS Puro (Sin dependencias externas)
 */

const CURRENT_CATALOG_VERSION = "3.0"; // Versión para forzar migración limpia en localStorage

// ==========================================
// 1. MOTORES DE NEGOCIO & HELPERS (CORE)
// ==========================================

const SuggestionEngine = {
  normalizeText(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ');
  },

  suggestModules(promptText, catalog, minScoreThreshold = 1) {
    if (!promptText || !Array.isArray(catalog)) return [];
    const normalizedPrompt = this.normalizeText(promptText);
    const words = normalizedPrompt.split(/\s+/).filter(w => w.length > 2);

    return catalog
      .map(module => {
        let score = 0;
        const matchedKeywords = [];

        (module.keywords || []).forEach(kw => {
          const normalizedKw = this.normalizeText(kw);
          if (normalizedPrompt.includes(normalizedKw)) {
            score += 2;
            matchedKeywords.push(kw);
          } else {
            const parts = normalizedKw.split(' ');
            if (parts.some(p => words.includes(p))) {
              score += 1;
              matchedKeywords.push(kw);
            }
          }
        });

        if (normalizedPrompt.includes(this.normalizeText(module.name))) {
          score += 3;
        }

        if (module.layer && normalizedPrompt.includes(this.normalizeText(module.layer))) {
          score += 2;
        }

        return {
          ...module,
          score,
          matchedKeywords: [...new Set(matchedKeywords)]
        };
      })
      .filter(item => item.score >= minScoreThreshold)
      .sort((a, b) => b.score - a.score);
  }
};

const CostingEngine = {
  /**
   * Calcula el costo interno de mano de obra del equipo de juniors
   */
  calculateModuleLaborCost(hours, hourlyRate, multiplier = 1.0) {
    const h = Math.max(0, Number(hours) || 0);
    const r = Math.max(0, Number(hourlyRate) || 0);
    const m = Math.max(0.5, Number(multiplier) || 1.0);
    return Math.round(h * r * m);
  },

  /**
   * Calcula el balance financiero total de la cotización
   */
  calculateQuoteTotals({
    modules = [],
    hourlyRate = 15000,
    infraMonthlyCost = 0,
    infraMonths = 1,
    profitMarginPercent = 35.0,
    teamDevelopersCount = 3
  }) {
    if (!modules || modules.length === 0) {
      return {
        modules: [],
        summary: {
          totalLaborHours: 0,
          hourlyRate,
          internalLaborCost: 0,
          totalInfraCost: 0,
          totalInternalCost: 0,
          totalMarketBenchmark: 0,
          clientFinalPrice: 0,
          netProfitAmount: 0,
          effectiveMarginPercent: 0,
          savingsVsMarketPercent: 0,
          estimatedDeliveryWeeks: 0
        }
      };
    }

    let totalLaborHours = 0;
    let internalLaborCost = 0;
    let totalMarketBenchmark = 0;
    let totalClientModulesPrice = 0;

    const marginMultiplier = 1 + (Math.max(0, Number(profitMarginPercent) || 0) / 100);

    const computedModules = modules.map(mod => {
      const hours = Math.max(0, Number(mod.hours) || 0);
      const multiplier = Math.max(0.5, Number(mod.multiplier) || 1.0);
      const laborCost = this.calculateModuleLaborCost(hours, hourlyRate, multiplier);

      totalLaborHours += hours;
      internalLaborCost += laborCost;

      const benchmark = Math.max(0, Number(mod.marketPriceCOP) || 0);
      totalMarketBenchmark += benchmark;

      let clientModulePrice = 0;
      if (mod.pricingMode === "market") {
        clientModulePrice = mod.customClientPrice !== undefined && mod.customClientPrice !== null 
          ? Number(mod.customClientPrice) 
          : benchmark;
      } else {
        clientModulePrice = Math.round(laborCost * marginMultiplier);
      }

      totalClientModulesPrice += clientModulePrice;

      return {
        ...mod,
        hours,
        multiplier,
        internalCost: laborCost,
        marketBenchmark: benchmark,
        clientPrice: clientModulePrice,
        profitMarginAmount: clientModulePrice - laborCost
      };
    });

    const totalInfraCost = Math.round(
      (Math.max(0, Number(infraMonthlyCost)) || 0) * 
      (Math.max(1, Number(infraMonths)) || 1)
    );

    const totalInternalCost = internalLaborCost + totalInfraCost;
    const clientFinalPrice = totalClientModulesPrice + totalInfraCost;
    const netProfitAmount = Math.max(0, clientFinalPrice - totalInternalCost);
    const effectiveMarginPercent = totalInternalCost > 0 
      ? Math.round((netProfitAmount / totalInternalCost) * 100) 
      : 0;

    let savingsVsMarketPercent = 0;
    if (totalMarketBenchmark > 0) {
      savingsVsMarketPercent = Math.round(((totalMarketBenchmark - clientFinalPrice) / totalMarketBenchmark) * 100);
    }

    const weeklyTeamCapacity = teamDevelopersCount * 30;
    const estimatedDeliveryWeeks = totalLaborHours > 0
      ? Math.max(1, Math.ceil(totalLaborHours / weeklyTeamCapacity))
      : 0;

    return {
      modules: computedModules,
      summary: {
        totalLaborHours,
        hourlyRate,
        internalLaborCost,
        totalInfraCost,
        totalInternalCost,
        totalMarketBenchmark,
        clientFinalPrice,
        netProfitAmount,
        effectiveMarginPercent,
        savingsVsMarketPercent,
        estimatedDeliveryWeeks
      }
    };
  },

  formatCOP(value) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }
};

// ==========================================
// 2. CONFIGURACIÓN Y CATÁLOGO CON OPCIONES / VARIANTES
// ==========================================

const DEFAULT_CONFIG = {
  version: "3.0",
  hourlyRate: 15000,
  defaultProfitMargin: 35.0,
  adminPassword: "admin",
  complexityMultipliers: {
    baja: 1.0,
    media: 1.25,
    alta: 1.5,
    integracion: 1.75
  }
};

/**
 * Catálogo Maestro con Opciones para TODOS los módulos
 * Incluye tarifas oficiales de Hostinger VPS KVM para 1 y 2 años
 */
const DEFAULT_MARKET_CATALOG = [
  // --- 1. FRONTEND WEB & UI/UX ---
  {
    id: "mod_frontend",
    name: "Frontend Web & Diseño UI/UX",
    layer: "frontend",
    category: "Frontend UI/UX",
    description: "Interfaces modernas, responsivas y accesibles para usuarios y administradores.",
    keywords: ["frontend", "ui", "ux", "interfaz", "responsive", "pantallas", "diseño", "componentes", "web"],
    options: [
      {
        id: "opt_fe_essential",
        name: "Opción 1: Esencial (Landing Page, Layout Base & Formularios)",
        hours: 18,
        complexity: "baja",
        marketPriceCOP: 850000,
        description: "Maquetación responsive mobile-first, barra de navegación, tipografías y formularios de contacto validados."
      },
      {
        id: "opt_fe_standard",
        name: "Opción 2: Completo (Panel Dashboard, Tablas CRUD, Filtros & Modales) [Recomendado]",
        hours: 30,
        complexity: "media",
        marketPriceCOP: 1450000,
        description: "Vistas de gestión con tablas interactivas, ordenamiento, paginación, filtros multicriterio y modales reactivos."
      },
      {
        id: "opt_fe_premium",
        name: "Opción 3: Premium (Dashboard Analítico con KPIs & Gráficos Interactivos)",
        hours: 42,
        complexity: "alta",
        marketPriceCOP: 2100000,
        description: "Dashboard avanzado con gráficos dinámicos (Chart.js/ApexCharts), comparativas temporales y diseño de alta gama."
      }
    ]
  },

  // --- 2. BACKEND & APIS REST ---
  {
    id: "mod_backend",
    name: "Backend, APIs RESTful & Servicios",
    layer: "backend",
    category: "Backend & APIs",
    description: "Lógica de servidor, endpoints seguros, validaciones DTO y controladores.",
    keywords: ["backend", "api", "rest", "endpoints", "servicios", "controladores", "servidor", "node", "express"],
    options: [
      {
        id: "opt_be_basic",
        name: "Opción 1: API REST Básica (Endpoints CRUD & Validaciones Estándar)",
        hours: 22,
        complexity: "baja",
        marketPriceCOP: 1100000,
        description: "Endpoints CRUD estructurados, validación de datos de entrada y manejo de errores estandarizado."
      },
      {
        id: "opt_be_standard",
        name: "Opción 2: Backend Empresarial (Lógica de Negocio Compleja & Transacciones) [Recomendado]",
        hours: 36,
        complexity: "media",
        marketPriceCOP: 1850000,
        description: "Capa de servicios desacoplada, reglas de negocio para órdenes/historias, transacciones atómicas y seguridad."
      },
      {
        id: "opt_be_advanced",
        name: "Opción 3: Arquitectura Modular (Colas Asíncronas, Workers & Webhooks)",
        hours: 48,
        complexity: "alta",
        marketPriceCOP: 2600000,
        description: "Manejo de eventos en background, colas de procesamiento, webhooks y arquitectura escalable."
      }
    ]
  },

  // --- 3. BASES DE DATOS & ARQUITECTURA DE DATOS ---
  {
    id: "mod_database",
    name: "Base de Datos & Arquitectura de Datos",
    layer: "database",
    category: "Bases de Datos",
    description: "Modelado relacional/NoSQL, diagramas ER, schemas, índices y políticas de persistencia.",
    keywords: ["base de datos", "postgresql", "mysql", "sql", "modelado", "esquema", "tablas", "indices", "migraciones", "redis"],
    options: [
      {
        id: "opt_db_standard",
        name: "Opción 1: Modelado Relacional Estándar (PostgreSQL/MySQL + Schemas) [Recomendado]",
        hours: 18,
        complexity: "media",
        marketPriceCOP: 800000,
        description: "Diseño de diagramas ER, schemas con claves foráneas, restricciones de integridad y migraciones automatizadas."
      },
      {
        id: "opt_db_redis",
        name: "Opción 2: Alto Rendimiento (Índices Optimizados + Caching con Redis)",
        hours: 26,
        complexity: "alta",
        marketPriceCOP: 1350000,
        description: "Capa de caché de alta velocidad con Redis, optimización de queries pesadas y vistas materializadas."
      },
      {
        id: "opt_db_ha",
        name: "Opción 3: Alta Disponibilidad (Snapshots Diarios Cifrados en S3 & Réplicas)",
        hours: 34,
        complexity: "alta",
        marketPriceCOP: 1850000,
        description: "Estrategia automatizada de respaldos cifrados en AWS S3, pruebas de restauración y monitoreo de almacenamiento."
      }
    ]
  },

  // --- 4. SEGURIDAD & AUTENTICACIÓN ---
  {
    id: "mod_auth",
    name: "Autenticación, Seguridad & Roles",
    layer: "security",
    category: "Seguridad & Auth",
    description: "Control de acceso, contraseñas seguras, tokens y gestión de permisos.",
    keywords: ["login", "autenticación", "auth", "registro", "contraseña", "jwt", "recuperación", "seguridad", "roles", "rbac"],
    options: [
      {
        id: "opt_auth_basic",
        name: "Opción 1: Login Básico JWT (Email, Contraseña Cifrada & Reset)",
        hours: 16,
        complexity: "baja",
        marketPriceCOP: 650000,
        description: "Inicio de sesión seguro con bcrypt, tokens JWT con expiración y recuperación de contraseña vía correo."
      },
      {
        id: "opt_auth_rbac",
        name: "Opción 2: Roles & Permisos RBAC Granular (Admin, Colaborador, Cliente) [Recomendado]",
        hours: 24,
        complexity: "media",
        marketPriceCOP: 1150000,
        description: "Control de accesos estricto por vistas y acciones (RBAC), auditoría de cambios y gestión de usuarios."
      },
      {
        id: "opt_auth_enterprise",
        name: "Opción 3: Corporativa (OAuth Google/Microsoft + 2FA + Control de Sesiones)",
        hours: 34,
        complexity: "alta",
        marketPriceCOP: 1750000,
        description: "Inicio de sesión social con Google/Microsoft, autenticación de dos factores (2FA) y bloqueo por intentos fallidos."
      }
    ]
  },

  // --- 5. PAGOS & FACTURACIÓN (COLOMBIA) ---
  {
    id: "mod_payments",
    name: "Pagos & Facturación en Colombia",
    layer: "payments",
    category: "Pagos & Facturación",
    description: "Cobros en línea, pasarelas colombianas, recibos y facturación electrónica.",
    keywords: ["pasarela", "pagos", "wompi", "pse", "tarjeta", "checkout", "epayco", "payu", "cobros", "dian", "facturación"],
    options: [
      {
        id: "opt_pay_gateway",
        name: "Opción 1: Pasarela de Pagos (Wompi / PSE / Tarjetas con Webhooks) [Recomendado]",
        hours: 28,
        complexity: "integracion",
        marketPriceCOP: 1450000,
        description: "Integración con Wompi/PayU: pagos por PSE, tarjetas, verificación de firmas criptográficas y confirmación automática."
      },
      {
        id: "opt_pay_pdf",
        name: "Opción 2: Facturación Interna (Generación de Recibos y PDFs con Logo)",
        hours: 22,
        complexity: "media",
        marketPriceCOP: 1050000,
        description: "Emisión de facturas y recibos con consecutivo, cálculo de IVA/retenciones y descarga de PDFs para clientes."
      },
      {
        id: "opt_pay_dian",
        name: "Opción 3: Facturación Electrónica DIAN Oficial (Proveedor Tecnológico API)",
        hours: 48,
        complexity: "integracion",
        marketPriceCOP: 3400000,
        description: "Integración con API autorizada por la DIAN (Factus/Siigo/Alegra) con generación de XML, CUFE y validación previa."
      }
    ]
  },

  // --- 6. AUTOMATIZACIÓN & WHATSAPP (n8n) ---
  {
    id: "mod_automation",
    name: "Automatización & WhatsApp (n8n)",
    layer: "automation",
    category: "Automatizaciones",
    description: "Flujos de mensajería automatizada por WhatsApp, correo y disparadores de eventos.",
    keywords: ["whatsapp", "recordatorios", "notificaciones", "n8n", "mensajes", "alertas", "automatización", "citas"],
    options: [
      {
        id: "opt_auto_reminders",
        name: "Opción 1: Recordatorios Básicos por WhatsApp / Email (Citas y Avisos)",
        hours: 18,
        complexity: "media",
        marketPriceCOP: 850000,
        description: "Envío programado de mensajes de recordatorio de citas y avisos automáticos de estado."
      },
      {
        id: "opt_auto_n8n",
        name: "Opción 2: Flujos Automatizados con n8n (Integración Bidireccional) [Recomendado]",
        hours: 28,
        complexity: "integracion",
        marketPriceCOP: 1450000,
        description: "Instancia y workflows en n8n conectados a base de datos y WhatsApp Cloud API para flujos complejos."
      },
      {
        id: "opt_auto_omnichannel",
        name: "Opción 3: Automatización Multicanal (WhatsApp + Email Transaccional + SMS)",
        hours: 38,
        complexity: "integracion",
        marketPriceCOP: 2100000,
        description: "Workflows multicanal unificados con fallback automático por SMS o email ante fallos de entrega."
      }
    ]
  },

  // --- 7. REPORTERÍA & ANALÍTICA ---
  {
    id: "mod_reports",
    name: "Reportería & Exportación de Datos",
    layer: "analytics",
    category: "Reportería",
    description: "Generación de balances, listados y exportaciones ejecutivas.",
    keywords: ["reportes", "excel", "pdf", "exportar", "informes", "descargar", "balance", "financiero"],
    options: [
      {
        id: "opt_rep_excel",
        name: "Opción 1: Exportación Rápida a Excel (.xlsx) y CSV con Filtros",
        hours: 14,
        complexity: "baja",
        marketPriceCOP: 600000,
        description: "Exportación de tablas y datos limpios con encabezados a Excel y CSV con un solo clic."
      },
      {
        id: "opt_rep_pdf",
        name: "Opción 2: Reportes Ejecutivos en PDF con Gráficos y Plantilla Corporativa [Recomendado]",
        hours: 22,
        complexity: "media",
        marketPriceCOP: 1050000,
        description: "Generación de informes gerenciales en PDF dinámico con logotipo, gráficos y resúmenes tabulares."
      },
      {
        id: "opt_rep_bi",
        name: "Opción 3: Tableros de Inteligencia Comercial & Exportación Masiva",
        hours: 32,
        complexity: "alta",
        marketPriceCOP: 1650000,
        description: "Consultas analíticas consolidadas, segmentación por sucursales y descargas masivas de históricos."
      }
    ]
  },

  // --- 8. INFRAESTRUCTURA CLOUD & VPS HOSTINGER (1 Y 2 AÑOS) ---
  {
    id: "mod_vps_hostinger",
    name: "Infraestructura Cloud & Despliegue en VPS Hostinger",
    layer: "devops",
    category: "DevOps & Cloud",
    description: "Aprovisionamiento en servidores VPS KVM de Hostinger con tarifas oficiales a 1 y 2 años.",
    keywords: ["hostinger", "vps", "despliegue", "kvm", "cloud", "docker", "ssl", "servidor", "dominio", "infraestructura"],
    options: [
      {
        id: "opt_vps_kvm1_1y",
        name: "Hostinger KVM 1 (4GB RAM, 1 vCPU, 50GB NVMe) - 1 Año [$238.800 COP Hostinger]",
        hours: 14,
        complexity: "media",
        marketPriceCOP: 950000,
        infraCostCOP: 238800,
        durationMonths: 12,
        description: "Despliegue con Docker, Nginx proxy, SSL gratuito y 1 año de VPS Hostinger KVM 1 ($238.800 COP prepagado)."
      },
      {
        id: "opt_vps_kvm1_2y",
        name: "Hostinger KVM 1 (4GB RAM, 1 vCPU, 50GB NVMe) - 2 Años [$477.600 COP Hostinger]",
        hours: 14,
        complexity: "media",
        marketPriceCOP: 1350000,
        infraCostCOP: 477600,
        durationMonths: 24,
        description: "Despliegue completo con 2 años de VPS Hostinger KVM 1 prepagado ($477.600 COP) a tarifa de máximo ahorro."
      },
      {
        id: "opt_vps_kvm2_1y",
        name: "Hostinger KVM 2 (8GB RAM, 2 vCPU, 100GB NVMe) - 1 Año [$406.800 COP Hostinger] [Recomendado PYMES]",
        hours: 16,
        complexity: "media",
        marketPriceCOP: 1250000,
        infraCostCOP: 406800,
        durationMonths: 12,
        description: "Plan ideal para PYMES: 8GB RAM, 2 vCPU y 1 año de VPS Hostinger KVM 2 ($406.800 COP prepagado)."
      },
      {
        id: "opt_vps_kvm2_2y",
        name: "Hostinger KVM 2 (8GB RAM, 2 vCPU, 100GB NVMe) - 2 Años [$693.600 COP Hostinger] [Recomendado PYMES]",
        hours: 16,
        complexity: "media",
        marketPriceCOP: 1750000,
        infraCostCOP: 693600,
        durationMonths: 24,
        description: "Plan PYME a 2 años en Hostinger KVM 2 prepagado ($693.600 COP) con estabilidad garantizada para producción."
      },
      {
        id: "opt_vps_kvm4_1y",
        name: "Hostinger KVM 4 (16GB RAM, 4 vCPU, 200GB NVMe) - 1 Año [$562.800 COP Hostinger] [Startups / Alto Tráfico]",
        hours: 20,
        complexity: "alta",
        marketPriceCOP: 1650000,
        infraCostCOP: 562800,
        durationMonths: 12,
        description: "Alta potencia para Startups: 16GB RAM, 4 núcleos vCPU y 1 año de VPS Hostinger KVM 4 ($562.800 COP prepagado)."
      },
      {
        id: "opt_vps_kvm4_2y",
        name: "Hostinger KVM 4 (16GB RAM, 4 vCPU, 200GB NVMe) - 2 Años [$933.600 COP Hostinger] [Startups / Alto Tráfico]",
        hours: 20,
        complexity: "alta",
        marketPriceCOP: 2250000,
        infraCostCOP: 933600,
        durationMonths: 24,
        description: "VPS de alto tráfico por 2 años en Hostinger KVM 4 prepagado ($933.600 COP) con máxima capacidad y rendimiento."
      }
    ]
  }
];

// ==========================================
// 3. ESTADO DE LA APLICACIÓN (STATE)
// ==========================================

const State = {
  config: null,
  catalog: [],
  activeQuote: {
    clientName: "",
    clientContact: "",
    requirementText: "",
    marginPercent: 35.0,
    infraMonthly: 0,
    infraMonths: 12,
    hostingerPreset: "none",
    modules: [],
    lastCalculated: null
  },
  isAdminAuthenticated: false,
  selectedLayerFilter: "all",

  init() {
    // Configuración
    const savedConfig = localStorage.getItem("costeo_config");
    this.config = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };
    if (!savedConfig) {
      localStorage.setItem("costeo_config", JSON.stringify(this.config));
    }

    // Versionamiento estricto de catálogo para garantizar que aparezcan todos los módulos (incluido UI/UX y Hostinger)
    const savedVersion = localStorage.getItem("costeo_catalog_version");
    const savedCatalog = localStorage.getItem("costeo_catalog");

    if (!savedCatalog || savedVersion !== CURRENT_CATALOG_VERSION) {
      // Forzar carga limpia del catálogo completo con opciones
      this.catalog = JSON.parse(JSON.stringify(DEFAULT_MARKET_CATALOG));
      localStorage.setItem("costeo_catalog", JSON.stringify(this.catalog));
      localStorage.setItem("costeo_catalog_version", CURRENT_CATALOG_VERSION);
    } else {
      this.catalog = JSON.parse(savedCatalog);
    }

    this.activeQuote.marginPercent = this.config.defaultProfitMargin;
  },

  resetCatalogToDefaults() {
    this.catalog = JSON.parse(JSON.stringify(DEFAULT_MARKET_CATALOG));
    localStorage.setItem("costeo_catalog", JSON.stringify(this.catalog));
    localStorage.setItem("costeo_catalog_version", CURRENT_CATALOG_VERSION);
  },

  resetAll() {
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.catalog = JSON.parse(JSON.stringify(DEFAULT_MARKET_CATALOG));
    this.activeQuote = {
      clientName: "",
      clientContact: "",
      requirementText: "",
      marginPercent: DEFAULT_CONFIG.defaultProfitMargin,
      infraMonthly: 0,
      infraMonths: 12,
      hostingerPreset: "none",
      modules: [],
      lastCalculated: null
    };
    localStorage.setItem("costeo_config", JSON.stringify(this.config));
    localStorage.setItem("costeo_catalog", JSON.stringify(this.catalog));
    localStorage.setItem("costeo_catalog_version", CURRENT_CATALOG_VERSION);
    localStorage.removeItem("costeo_quotes");
  },

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem("costeo_config", JSON.stringify(this.config));
  },

  saveCatalog(newCatalog) {
    this.catalog = newCatalog;
    localStorage.setItem("costeo_catalog", JSON.stringify(this.catalog));
  }
};

// ==========================================
// 4. CONTROLADOR DE UI & EVENTOS
// ==========================================

const UI = {
  elements: {},

  init() {
    this.cacheElements();
    this.bindEvents();
    this.renderAdminConfig();
    this.renderAdminCatalog();
    this.recalculateQuote();
  },

  cacheElements() {
    this.elements = {
      // Pestañas & Cabecera
      navBtnQuote: document.getElementById("nav-btn-quote"),
      navBtnAdmin: document.getElementById("nav-btn-admin"),
      btnOpenProposal: document.getElementById("btn-open-proposal"),
      btnSyncCatalog: document.getElementById("btn-sync-catalog"),
      btnResetAll: document.getElementById("btn-reset-all"),
      viewQuote: document.getElementById("view-quote"),
      viewAdmin: document.getElementById("view-admin"),

      // Cotizador
      clientName: document.getElementById("client-name"),
      clientContact: document.getElementById("client-contact"),
      promptText: document.getElementById("prompt-requirement-text"),
      btnRunSuggestions: document.getElementById("btn-run-suggestions"),
      suggestionsContainer: document.getElementById("suggestions-container"),
      quoteModulesTbody: document.getElementById("quote-modules-tbody"),
      emptyModulesNotice: document.getElementById("empty-modules-notice"),
      btnAddCustomModule: document.getElementById("btn-add-custom-module"),
      btnOpenMarketExplorer: document.getElementById("btn-open-market-explorer"),

      // Parámetros e Infraestructura Hostinger
      quoteMargin: document.getElementById("quote-margin"),
      hostingerPresetSelect: document.getElementById("hostinger-preset-select"),
      quoteInfraCost: document.getElementById("quote-infra-cost"),
      quoteInfraMonths: document.getElementById("quote-infra-months"),

      // Métricas
      metricMarketBenchmark: document.getElementById("metric-market-benchmark"),
      metricTotalHours: document.getElementById("metric-total-hours"),
      metricHourlyRate: document.getElementById("metric-hourly-rate"),
      metricLaborCost: document.getElementById("metric-labor-cost"),
      metricInfraCost: document.getElementById("metric-infra-cost"),
      metricInternalTotal: document.getElementById("metric-internal-total"),
      metricProfitAmount: document.getElementById("metric-profit-amount"),
      metricProfitPercent: document.getElementById("metric-profit-percent"),
      metricClientPrice: document.getElementById("metric-client-price"),
      metricCompetitivenessTitle: document.getElementById("metric-competitiveness-title"),
      metricCompetitivenessDesc: document.getElementById("metric-competitiveness-desc"),
      metricDeliveryTime: document.getElementById("metric-delivery-time"),
      btnSaveQuote: document.getElementById("btn-save-quote"),

      // Explorador de Mercado
      modalMarketExplorer: document.getElementById("modal-market-explorer"),
      marketFilterChips: document.getElementById("market-filter-chips"),
      marketExplorerGrid: document.getElementById("market-explorer-grid"),
      btnCloseMarketExplorer: document.getElementById("btn-close-market-explorer"),
      btnDoneMarketExplorer: document.getElementById("btn-done-market-explorer"),

      // Admin Auth
      adminAuthLock: document.getElementById("admin-auth-lock"),
      adminProtectedContent: document.getElementById("admin-protected-content"),
      adminPasswordInput: document.getElementById("admin-password-input"),
      btnAdminLogin: document.getElementById("btn-admin-login"),
      adminAuthError: document.getElementById("admin-auth-error"),

      // Admin Config
      adminHourlyRate: document.getElementById("admin-hourly-rate"),
      adminDefaultMargin: document.getElementById("admin-default-margin"),
      adminMultBaja: document.getElementById("admin-mult-baja"),
      adminMultAlta: document.getElementById("admin-mult-alta"),
      btnSaveAdminConfig: document.getElementById("btn-save-admin-config"),
      adminCatalogTbody: document.getElementById("admin-catalog-tbody"),
      btnAdminOpenNewModule: document.getElementById("btn-admin-open-new-module"),
      btnAdminResetCatalog: document.getElementById("btn-admin-reset-catalog"),

      // Modal Catálogo Admin
      modalCatalogModule: document.getElementById("modal-catalog-module"),
      formCatalogModule: document.getElementById("form-catalog-module"),
      btnCloseModalModule: document.getElementById("btn-close-modal-module"),
      btnCancelModalModule: document.getElementById("btn-cancel-modal-module")
    };
  },

  bindEvents() {
    this.elements.navBtnQuote.addEventListener("click", () => this.switchView("quote"));
    this.elements.navBtnAdmin.addEventListener("click", () => this.switchView("admin"));

    if (this.elements.btnSyncCatalog) {
      this.elements.btnSyncCatalog.addEventListener("click", () => this.handleSyncCatalog());
    }

    if (this.elements.btnResetAll) {
      this.elements.btnResetAll.addEventListener("click", () => this.handleResetAll());
    }

    this.elements.btnRunSuggestions.addEventListener("click", () => this.handleRunSuggestions());

    this.elements.quoteMargin.addEventListener("input", () => this.recalculateQuote());
    this.elements.quoteInfraCost.addEventListener("input", () => this.recalculateQuote());
    this.elements.quoteInfraMonths.addEventListener("input", () => this.recalculateQuote());

    // Selector de Preajustes Hostinger VPS
    if (this.elements.hostingerPresetSelect) {
      this.elements.hostingerPresetSelect.addEventListener("change", (e) => this.handleHostingerPresetChange(e.target.value));
    }

    this.elements.btnAddCustomModule.addEventListener("click", () => this.handleAddCustomModule());
    this.elements.btnSaveQuote.addEventListener("click", () => this.handleSaveQuote());

    // Explorador de Mercado
    this.elements.btnOpenMarketExplorer.addEventListener("click", () => this.openMarketExplorer());
    this.elements.btnCloseMarketExplorer.addEventListener("click", () => this.elements.modalMarketExplorer.close());
    this.elements.btnDoneMarketExplorer.addEventListener("click", () => this.elements.modalMarketExplorer.close());

    // Chips de filtros de mercado
    if (this.elements.marketFilterChips) {
      this.elements.marketFilterChips.addEventListener("click", (e) => {
        if (e.target.classList.contains("chip-btn")) {
          this.elements.marketFilterChips.querySelectorAll(".chip-btn").forEach(btn => btn.classList.remove("active"));
          e.target.classList.add("active");
          State.selectedLayerFilter = e.target.dataset.layer || "all";
          this.renderMarketExplorerGrid();
        }
      });
    }

    // Admin Auth
    this.elements.btnAdminLogin.addEventListener("click", () => this.handleAdminLogin());
    this.elements.adminPasswordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleAdminLogin();
    });

    this.elements.btnSaveAdminConfig.addEventListener("click", () => this.handleSaveAdminConfig());
    this.elements.btnAdminOpenNewModule.addEventListener("click", () => this.openCatalogModal());
    if (this.elements.btnAdminResetCatalog) {
      this.elements.btnAdminResetCatalog.addEventListener("click", () => this.handleSyncCatalog());
    }
    this.elements.btnCloseModalModule.addEventListener("click", () => this.elements.modalCatalogModule.close());
    this.elements.btnCancelModalModule.addEventListener("click", () => this.elements.modalCatalogModule.close());
    this.elements.formCatalogModule.addEventListener("submit", (e) => this.handleSaveCatalogModule(e));
  },

  handleSyncCatalog() {
    if (confirm("¿Deseas restaurar y sincronizar el Catálogo Maestro Completo (con Frontend UI/UX, Backend, Bases de Datos, Opciones y Planes Hostinger VPS)?")) {
      State.resetCatalogToDefaults();
      this.renderAdminCatalog();
      if (this.elements.modalMarketExplorer.open) {
        this.renderMarketExplorerGrid();
      }
      this.recalculateQuote();
      alert("✅ Catálogo sincronizado con éxito. Ya puedes ver todas las capas, opciones y módulos actualizados.");
    }
  },

  handleResetAll() {
    const confirmReset = confirm(
      "⚠️ ¿Deseas restaurar TODO a los valores de fábrica?\n\n" +
      "Esta acción:\n" +
      "• Limpiará el cliente, requerimientos y módulos de la cotización actual.\n" +
      "• Restablecerá los parámetros financieros a valores iniciales (35% margen, VPS KVM 2 Recomendado).\n" +
      "• Restaurará el catálogo maestro con todos los módulos y opciones de fábrica.\n" +
      "• Restablecerá las tarifas y configuraciones globales de administrador."
    );

    if (!confirmReset) return;

    State.resetAll();

    // Limpiar campos del Cotizador
    if (this.elements.clientName) this.elements.clientName.value = "";
    if (this.elements.clientContact) this.elements.clientContact.value = "";
    if (this.elements.promptText) this.elements.promptText.value = "";

    // Ocultar sugerencias
    if (this.elements.suggestionsContainer) {
      this.elements.suggestionsContainer.style.display = "none";
      this.elements.suggestionsContainer.innerHTML = "";
    }

    // Restablecer parámetros de cotización
    if (this.elements.quoteMargin) {
      this.elements.quoteMargin.value = State.config.defaultProfitMargin;
    }
    if (this.elements.hostingerPresetSelect) {
      this.elements.hostingerPresetSelect.value = "none";
    }
    if (this.elements.quoteInfraCost) {
      this.elements.quoteInfraCost.value = 0;
    }
    if (this.elements.quoteInfraMonths) {
      this.elements.quoteInfraMonths.value = 12;
    }

    // Refrescar vistas
    this.renderQuoteModules();
    this.renderAdminConfig();
    this.renderAdminCatalog();
    if (this.elements.modalMarketExplorer && this.elements.modalMarketExplorer.open) {
      this.renderMarketExplorerGrid();
    }
    this.recalculateQuote();

    alert("✨ Todo el sistema ha sido restaurado exitosamente a sus valores originales de fábrica.");
  },

  handleHostingerPresetChange(presetKey) {
    const presets = {
      "none": { monthlyCost: 0, months: 12, label: "Sin Servidor VPS" },
      "kvm1_1y": { monthlyCost: 19900, months: 12, label: "Hostinger KVM 1 (1 Año - $238.800 COP)" },
      "kvm1_2y": { monthlyCost: 19900, months: 24, label: "Hostinger KVM 1 (2 Años - $477.600 COP)" },
      "kvm2_1y": { monthlyCost: 33900, months: 12, label: "Hostinger KVM 2 (1 Año - $406.800 COP)" },
      "kvm2_2y": { monthlyCost: 28900, months: 24, label: "Hostinger KVM 2 (2 Años - $693.600 COP)" },
      "kvm4_1y": { monthlyCost: 46900, months: 12, label: "Hostinger KVM 4 (1 Año - $562.800 COP)" },
      "kvm4_2y": { monthlyCost: 38900, months: 24, label: "Hostinger KVM 4 (2 Años - $933.600 COP)" },
    };

    if (presetKey === "custom") return;

    const selected = presets[presetKey];
    if (selected) {
      this.elements.quoteInfraCost.value = selected.monthlyCost;
      this.elements.quoteInfraMonths.value = selected.months;
      this.recalculateQuote();
    }
  },

  switchView(viewName) {
    if (viewName === "quote") {
      this.elements.viewQuote.classList.add("active");
      this.elements.viewAdmin.classList.remove("active");
      this.elements.navBtnQuote.classList.add("active");
      this.elements.navBtnAdmin.classList.remove("active");
    } else {
      this.elements.viewQuote.classList.remove("active");
      this.elements.viewAdmin.classList.add("active");
      this.elements.navBtnQuote.classList.remove("active");
      this.elements.navBtnAdmin.classList.add("active");

      if (!State.isAdminAuthenticated) {
        this.elements.adminAuthLock.style.display = "block";
        this.elements.adminProtectedContent.style.display = "none";
        this.elements.adminPasswordInput.focus();
      }
    }
  },

  // ================= EXPLORADOR DE MERCADO =================
  openMarketExplorer() {
    this.renderMarketExplorerGrid();
    this.elements.modalMarketExplorer.showModal();
  },

  renderMarketExplorerGrid() {
    const grid = this.elements.marketExplorerGrid;
    grid.innerHTML = "";

    const filtered = State.catalog.filter(mod => {
      if (State.selectedLayerFilter === "all") return true;
      return mod.layer === State.selectedLayerFilter;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<p class="text-muted" style="grid-column: 1/-1; padding: 20px; text-align: center;">No hay módulos en esta categoría.</p>`;
      return;
    }

    filtered.forEach(item => {
      const isAlreadyAdded = State.activeQuote.modules.some(m => m.id === item.id);
      const card = document.createElement("div");
      card.className = `market-module-card ${isAlreadyAdded ? 'selected' : ''}`;

      // Opciones del módulo
      const options = item.options || [
        {
          id: "opt_default",
          name: "Opción Estándar",
          hours: item.baseHours || 20,
          complexity: item.defaultComplexity || "media",
          marketPriceCOP: item.marketPriceCOP || 1000000,
          description: item.description
        }
      ];

      // Opciones para el select
      const optionsHtml = options.map((opt, idx) => `
        <option value="${opt.id}" ${idx === 1 ? 'selected' : (idx === 0 ? 'selected' : '')}>
          ${opt.name} (${opt.hours}h - ${CostingEngine.formatCOP(opt.marketPriceCOP)})
        </option>
      `).join("");

      const initialOption = options[1] || options[0];
      const defaultMultiplier = State.config.complexityMultipliers[initialOption.complexity || "media"] || 1.25;
      const laborCost = CostingEngine.calculateModuleLaborCost(initialOption.hours, State.config.hourlyRate, defaultMultiplier);

      card.innerHTML = `
        <div class="market-card-top">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="layer-badge layer-${item.layer || 'frontend'}">${item.category}</span>
            <small class="text-muted card-hours-badge">${initialOption.hours} hrs desarrollo</small>
          </div>
          <h4 class="market-card-title">${item.name}</h4>
          <p class="market-card-desc card-desc-text">${initialOption.description}</p>
          
          <div style="margin: 10px 0;">
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">Selecciona Opción / Nivel:</label>
            <select class="select-control card-option-select" style="padding: 6px 8px; font-size: 12px;">
              ${optionsHtml}
            </select>
          </div>
        </div>

        <div>
          <div class="market-pricing-comparison">
            <div class="pricing-comp-item">
              <span class="pricing-comp-label">Mercado Colombia</span>
              <span class="pricing-comp-val col-market card-market-price">${CostingEngine.formatCOP(initialOption.marketPriceCOP)}</span>
            </div>
            <div class="pricing-comp-item">
              <span class="pricing-comp-label">Costo Interno (Devs)</span>
              <span class="pricing-comp-val text-warning card-labor-cost">${CostingEngine.formatCOP(laborCost)}</span>
            </div>
          </div>

          <div class="market-card-actions">
            <button class="btn btn-primary flex-1 btn-add-market" data-id="${item.id}" data-mode="market">
              ${isAlreadyAdded ? '✓ Agregado' : '+ Cobrar Precio Mercado'}
            </button>
            <button class="btn btn-secondary btn-add-hourly" data-id="${item.id}" data-mode="hourly" title="Cotizar por horas del equipo">
              Por Horas
            </button>
          </div>
        </div>
      `;

      // Evento al cambiar opción dentro de la tarjeta
      const selectOpt = card.querySelector(".card-option-select");
      selectOpt.addEventListener("change", (e) => {
        const selectedOpt = options.find(o => o.id === e.target.value) || options[0];
        card.querySelector(".card-hours-badge").textContent = `${selectedOpt.hours} hrs desarrollo`;
        card.querySelector(".card-desc-text").textContent = selectedOpt.description;
        card.querySelector(".card-market-price").textContent = CostingEngine.formatCOP(selectedOpt.marketPriceCOP);

        const mult = State.config.complexityMultipliers[selectedOpt.complexity || "media"] || 1.25;
        const newLabor = CostingEngine.calculateModuleLaborCost(selectedOpt.hours, State.config.hourlyRate, mult);
        card.querySelector(".card-labor-cost").textContent = CostingEngine.formatCOP(newLabor);
      });

      card.querySelector(".btn-add-market").addEventListener("click", () => {
        const chosenOptId = selectOpt.value;
        const chosenOpt = options.find(o => o.id === chosenOptId) || options[0];
        this.addModuleToQuote(item, "market", chosenOpt);
        this.renderMarketExplorerGrid();
      });

      card.querySelector(".btn-add-hourly").addEventListener("click", () => {
        const chosenOptId = selectOpt.value;
        const chosenOpt = options.find(o => o.id === chosenOptId) || options[0];
        this.addModuleToQuote(item, "hourly", chosenOpt);
        this.renderMarketExplorerGrid();
      });

      grid.appendChild(card);
    });
  },

  // ================= SUGERENCIAS DE MÓDULOS =================
  handleRunSuggestions() {
    const prompt = this.elements.promptText.value.trim();
    if (!prompt) {
      alert("Por favor ingresa un requerimiento o necesidad del cliente.");
      return;
    }

    const suggestions = SuggestionEngine.suggestModules(prompt, State.catalog);
    const container = this.elements.suggestionsContainer;
    container.innerHTML = "";

    if (suggestions.length === 0) {
      container.style.display = "block";
      container.innerHTML = `<p class="text-muted" style="grid-column: 1/-1; padding: 10px;">No se encontraron coincidencias directas. Abre el <strong>Catálogo de Mercado</strong> para seleccionar módulos.</p>`;
      return;
    }

    container.style.display = "grid";

    suggestions.forEach(item => {
      const isAlreadyAdded = State.activeQuote.modules.some(m => m.id === item.id);
      const card = document.createElement("div");
      card.className = `suggestion-card ${isAlreadyAdded ? 'selected' : ''}`;
      
      const opt = (item.options && item.options[1]) || (item.options && item.options[0]) || {
        hours: item.baseHours || 20,
        complexity: item.defaultComplexity || "media",
        marketPriceCOP: item.marketPriceCOP || 1000000,
        description: item.description
      };

      const defaultMultiplier = State.config.complexityMultipliers[opt.complexity || "media"] || 1.25;
      const internalCost = CostingEngine.calculateModuleLaborCost(opt.hours, State.config.hourlyRate, defaultMultiplier);

      card.innerHTML = `
        <div>
          <div class="suggestion-header">
            <span class="layer-badge layer-${item.layer || 'frontend'}">${item.category}</span>
            <span class="match-tag">+${item.score} Coincidencias</span>
          </div>
          <strong style="display:block; margin: 4px 0;">${item.name}</strong>
          <small class="text-muted" style="display:block; margin-bottom: 6px;">${opt.description}</small>
          
          <div class="market-price-pill">
            Mercado Colombia: ${CostingEngine.formatCOP(opt.marketPriceCOP)}
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; gap: 8px;">
          <small class="text-secondary">${opt.hours} hrs (Costo Dev: ${CostingEngine.formatCOP(internalCost)})</small>
          <button class="btn btn-outline-sm btn-add-suggested" data-id="${item.id}">
            ${isAlreadyAdded ? '✓ Agregado' : '+ Agregar'}
          </button>
        </div>
      `;

      card.querySelector(".btn-add-suggested").addEventListener("click", () => {
        this.addModuleToQuote(item, "market", opt);
        this.handleRunSuggestions();
      });

      container.appendChild(card);
    });
  },

  // ================= GESTIÓN DE MÓDULOS EN COTIZACIÓN =================
  addModuleToQuote(catalogModule, pricingMode = "market", selectedOption = null) {
    const exists = State.activeQuote.modules.find(m => m.id === catalogModule.id);
    if (exists) return;

    const opt = selectedOption || (catalogModule.options ? (catalogModule.options[1] || catalogModule.options[0]) : {
      id: "opt_default",
      name: "Opción Estándar",
      hours: catalogModule.baseHours || 20,
      complexity: catalogModule.defaultComplexity || "media",
      marketPriceCOP: catalogModule.marketPriceCOP || 1000000,
      description: catalogModule.description
    });

    const complexity = opt.complexity || catalogModule.defaultComplexity || "media";
    const multiplier = State.config.complexityMultipliers[complexity] || 1.25;

    State.activeQuote.modules.push({
      id: catalogModule.id,
      name: catalogModule.name,
      layer: catalogModule.layer || "frontend",
      category: catalogModule.category,
      selectedOptionId: opt.id,
      selectedOptionName: opt.name,
      hours: opt.hours,
      complexity: complexity,
      multiplier: multiplier,
      pricingMode: pricingMode,
      marketPriceCOP: opt.marketPriceCOP,
      customClientPrice: opt.marketPriceCOP,
      options: catalogModule.options || [opt]
    });

    // Si es el módulo de VPS Hostinger y tiene costo de infraestructura prepagada
    if (opt.infraCostCOP && opt.durationMonths) {
      this.elements.quoteInfraCost.value = Math.round(opt.infraCostCOP / opt.durationMonths);
      this.elements.quoteInfraMonths.value = opt.durationMonths;
    }

    this.renderQuoteModules();
    this.recalculateQuote();
  },

  handleAddCustomModule() {
    const customName = prompt("Nombre del módulo personalizado:");
    if (!customName) return;

    const customHours = Number(prompt("Horas base estimadas de desarrollo:", "20")) || 20;
    const customMarketPrice = Number(prompt("Precio sugerido para el cliente en COP (ej. 1200000):", "1200000")) || 1200000;

    State.activeQuote.modules.push({
      id: "mod_custom_" + Date.now(),
      name: customName,
      layer: "backend",
      category: "Personalizado",
      selectedOptionId: "opt_custom",
      selectedOptionName: "Personalizado a Medida",
      hours: customHours,
      complexity: "media",
      multiplier: State.config.complexityMultipliers.media || 1.25,
      pricingMode: "market",
      marketPriceCOP: customMarketPrice,
      customClientPrice: customMarketPrice,
      options: [
        {
          id: "opt_custom",
          name: "Personalizado a Medida",
          hours: customHours,
          complexity: "media",
          marketPriceCOP: customMarketPrice,
          description: "Requerimiento personalizado a medida."
        }
      ]
    });

    this.renderQuoteModules();
    this.recalculateQuote();
  },

  removeModuleFromQuote(moduleId) {
    State.activeQuote.modules = State.activeQuote.modules.filter(m => m.id !== moduleId);
    this.renderQuoteModules();
    this.recalculateQuote();
    if (this.elements.suggestionsContainer.style.display !== "none") {
      this.handleRunSuggestions();
    }
  },

  renderQuoteModules() {
    const tbody = this.elements.quoteModulesTbody;
    tbody.innerHTML = "";

    if (State.activeQuote.modules.length === 0) {
      this.elements.emptyModulesNotice.style.display = "block";
      return;
    }

    this.elements.emptyModulesNotice.style.display = "none";

    State.activeQuote.modules.forEach((mod, index) => {
      const tr = document.createElement("tr");

      const laborCost = CostingEngine.calculateModuleLaborCost(
        mod.hours,
        State.config.hourlyRate,
        mod.multiplier
      );

      const marginMultiplier = 1 + (Number(this.elements.quoteMargin.value || 35) / 100);
      const computedHourlyPrice = Math.round(laborCost * marginMultiplier);
      const displayClientPrice = mod.pricingMode === "market" 
        ? (mod.customClientPrice !== undefined ? mod.customClientPrice : mod.marketPriceCOP) 
        : computedHourlyPrice;

      // Opciones para el select de variantes de la fila
      const options = mod.options || [];
      const optionsSelectHtml = options.length > 1 ? `
        <select class="select-control row-option-select" data-index="${index}" style="padding: 4px 6px; font-size: 11px; margin-top: 4px;">
          ${options.map(o => `
            <option value="${o.id}" ${o.id === mod.selectedOptionId ? 'selected' : ''}>
              ${o.name}
            </option>
          `).join("")}
        </select>
      ` : `<small class="text-muted" style="display:block; margin-top: 2px;">${mod.selectedOptionName || ''}</small>`;

      tr.innerHTML = `
        <td>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <strong>${mod.name}</strong>
            <span class="layer-badge layer-${mod.layer || 'frontend'}" style="width: fit-content;">${mod.category}</span>
            ${optionsSelectHtml}
          </div>
        </td>
        <td>
          <input type="number" min="1" value="${mod.hours}" class="input-control mod-hours-input" data-index="${index}" style="padding: 6px 8px;">
        </td>
        <td>
          <select class="select-control mod-complexity-select" data-index="${index}" style="padding: 6px 8px;">
            <option value="baja" ${mod.complexity === 'baja' ? 'selected' : ''}>Baja (x${State.config.complexityMultipliers.baja})</option>
            <option value="media" ${mod.complexity === 'media' ? 'selected' : ''}>Media (x${State.config.complexityMultipliers.media})</option>
            <option value="alta" ${mod.complexity === 'alta' ? 'selected' : ''}>Alta (x${State.config.complexityMultipliers.alta})</option>
            <option value="integracion" ${mod.complexity === 'integracion' ? 'selected' : ''}>Integración (x${State.config.complexityMultipliers.integracion})</option>
          </select>
        </td>
        <td>
          <select class="select-control mod-pricing-mode-select" data-index="${index}" style="padding: 6px 8px; font-weight: 600;">
            <option value="market" ${mod.pricingMode === 'market' ? 'selected' : ''}>Precio Mercado</option>
            <option value="hourly" ${mod.pricingMode === 'hourly' ? 'selected' : ''}>Por Horas + Margen</option>
          </select>
        </td>
        <td>
          ${mod.pricingMode === 'market' 
            ? `<input type="number" step="50000" value="${displayClientPrice}" class="input-control mod-client-price-input" data-index="${index}" style="padding: 6px 8px; color: #60A5FA; font-weight: 700;">`
            : `<span class="col-market" style="font-weight: 700; padding: 6px 8px; display: block;">${CostingEngine.formatCOP(displayClientPrice)}</span>`
          }
        </td>
        <td class="col-internal text-right font-weight-bold">
          ${CostingEngine.formatCOP(laborCost)}
        </td>
        <td class="text-right">
          <button class="btn-icon text-error btn-remove-module" data-id="${mod.id}" title="Eliminar">&times;</button>
        </td>
      `;

      // Evento al cambiar variante de opción dentro de la tabla
      const rowOptSelect = tr.querySelector(".row-option-select");
      if (rowOptSelect) {
        rowOptSelect.addEventListener("change", (e) => {
          const selectedOptId = e.target.value;
          const opt = options.find(o => o.id === selectedOptId);
          if (opt) {
            State.activeQuote.modules[index].selectedOptionId = opt.id;
            State.activeQuote.modules[index].selectedOptionName = opt.name;
            State.activeQuote.modules[index].hours = opt.hours;
            State.activeQuote.modules[index].complexity = opt.complexity || "media";
            State.activeQuote.modules[index].multiplier = State.config.complexityMultipliers[opt.complexity || "media"] || 1.25;
            State.activeQuote.modules[index].marketPriceCOP = opt.marketPriceCOP;
            State.activeQuote.modules[index].customClientPrice = opt.marketPriceCOP;

            if (opt.infraCostCOP && opt.durationMonths) {
              this.elements.quoteInfraCost.value = Math.round(opt.infraCostCOP / opt.durationMonths);
              this.elements.quoteInfraMonths.value = opt.durationMonths;
            }

            this.renderQuoteModules();
            this.recalculateQuote();
          }
        });
      }

      tr.querySelector(".mod-hours-input").addEventListener("input", (e) => {
        const val = Math.max(1, Number(e.target.value) || 1);
        State.activeQuote.modules[index].hours = val;
        this.renderQuoteModules();
        this.recalculateQuote();
      });

      tr.querySelector(".mod-complexity-select").addEventListener("change", (e) => {
        const complexity = e.target.value;
        State.activeQuote.modules[index].complexity = complexity;
        State.activeQuote.modules[index].multiplier = State.config.complexityMultipliers[complexity] || 1.0;
        this.renderQuoteModules();
        this.recalculateQuote();
      });

      tr.querySelector(".mod-pricing-mode-select").addEventListener("change", (e) => {
        State.activeQuote.modules[index].pricingMode = e.target.value;
        this.renderQuoteModules();
        this.recalculateQuote();
      });

      const clientPriceInput = tr.querySelector(".mod-client-price-input");
      if (clientPriceInput) {
        clientPriceInput.addEventListener("input", (e) => {
          State.activeQuote.modules[index].customClientPrice = Number(e.target.value) || 0;
          this.recalculateQuote();
        });
      }

      tr.querySelector(".btn-remove-module").addEventListener("click", () => {
        this.removeModuleFromQuote(mod.id);
      });

      tbody.appendChild(tr);
    });
  },

  // ================= CÁLCULO FINANCIERO REACTIVO & BENCHMARK =================
  recalculateQuote() {
    const hourlyRate = State.config.hourlyRate;
    const marginPercent = Number(this.elements.quoteMargin.value) || 0;
    const infraMonthly = Number(this.elements.quoteInfraCost.value) || 0;
    const infraMonths = Number(this.elements.quoteInfraMonths.value) || 1;

    const calculation = CostingEngine.calculateQuoteTotals({
      modules: State.activeQuote.modules,
      hourlyRate: hourlyRate,
      infraMonthlyCost: infraMonthly,
      infraMonths: infraMonths,
      profitMarginPercent: marginPercent,
      teamDevelopersCount: 3
    });

    const sum = calculation.summary;

    this.elements.metricMarketBenchmark.textContent = CostingEngine.formatCOP(sum.totalMarketBenchmark);
    this.elements.metricTotalHours.textContent = `${sum.totalLaborHours} hrs`;
    this.elements.metricHourlyRate.textContent = CostingEngine.formatCOP(hourlyRate);
    this.elements.metricLaborCost.textContent = CostingEngine.formatCOP(sum.internalLaborCost);
    this.elements.metricInfraCost.textContent = CostingEngine.formatCOP(sum.totalInfraCost);
    this.elements.metricInternalTotal.textContent = CostingEngine.formatCOP(sum.totalInternalCost);
    this.elements.metricProfitAmount.textContent = `+${CostingEngine.formatCOP(sum.netProfitAmount)}`;
    this.elements.metricProfitPercent.textContent = `${sum.effectiveMarginPercent}%`;
    this.elements.metricClientPrice.textContent = CostingEngine.formatCOP(sum.clientFinalPrice);
    this.elements.metricDeliveryTime.textContent = `${sum.estimatedDeliveryWeeks} ${sum.estimatedDeliveryWeeks === 1 ? 'semana' : 'semanas'}`;

    const compTitle = this.elements.metricCompetitivenessTitle;
    const compDesc = this.elements.metricCompetitivenessDesc;

    if (State.activeQuote.modules.length === 0) {
      compTitle.textContent = "Posicionamiento en Colombia";
      compDesc.textContent = "Agrega módulos para comparar tus números con el mercado de agencias de software.";
    } else if (sum.savingsVsMarketPercent > 10) {
      compTitle.textContent = `¡${sum.savingsVsMarketPercent}% más económico que el promedio de agencias!`;
      compDesc.textContent = `Propuesta sumamente atractiva para PYMES en Colombia. Ahorro sustancial frente a agencias tradicionales con una rentabilidad para el equipo del ${sum.effectiveMarginPercent}%.`;
    } else if (sum.savingsVsMarketPercent >= 0) {
      compTitle.textContent = "Alineado con el estándar del mercado";
      compDesc.textContent = `Tu precio está balanceado con los estándares del mercado colombiano (${sum.savingsVsMarketPercent}% de ahorro para el cliente).`;
    } else {
      compTitle.textContent = "Precio premium / Alto valor agregado";
      compDesc.textContent = `Tu cotización supera el valor promedio por un ${Math.abs(sum.savingsVsMarketPercent)}%. Asegúrate de justificar soporte extendido o entregables de alta gama.`;
    }

    State.activeQuote.lastCalculated = calculation;
  },

  handleSaveQuote() {
    if (State.activeQuote.modules.length === 0) {
      alert("Debes agregar al menos un módulo a la cotización.");
      return;
    }

    const quotes = JSON.parse(localStorage.getItem("costeo_quotes") || "[]");
    const quoteRecord = {
      id: "COT-" + Date.now().toString().slice(-6),
      clientName: this.elements.clientName.value || "Cliente Sin Nombre",
      clientContact: this.elements.clientContact.value || "N/A",
      createdAt: new Date().toISOString(),
      ...State.activeQuote.lastCalculated
    };

    quotes.push(quoteRecord);
    localStorage.setItem("costeo_quotes", JSON.stringify(quotes));

    alert(`¡Cotización guardada exitosamente con ID ${quoteRecord.id}!`);
  },

  // ================= ADMIN: AUTH & CONFIGURACIÓN =================
  handleAdminLogin() {
    const pass = this.elements.adminPasswordInput.value;
    if (pass === State.config.adminPassword) {
      State.isAdminAuthenticated = true;
      this.elements.adminAuthLock.style.display = "none";
      this.elements.adminProtectedContent.style.display = "flex";
      this.elements.adminAuthError.style.display = "none";
      this.elements.adminPasswordInput.value = "";
    } else {
      this.elements.adminAuthError.style.display = "block";
    }
  },

  renderAdminConfig() {
    this.elements.adminHourlyRate.value = State.config.hourlyRate;
    this.elements.adminDefaultMargin.value = State.config.defaultProfitMargin;
    this.elements.adminMultBaja.value = State.config.complexityMultipliers.baja;
    this.elements.adminMultAlta.value = State.config.complexityMultipliers.integracion;
  },

  handleSaveAdminConfig() {
    State.config.hourlyRate = Number(this.elements.adminHourlyRate.value) || 15000;
    State.config.defaultProfitMargin = Number(this.elements.adminDefaultMargin.value) || 35;
    State.config.complexityMultipliers.baja = Number(this.elements.adminMultBaja.value) || 1.0;
    State.config.complexityMultipliers.integracion = Number(this.elements.adminMultAlta.value) || 1.75;

    State.saveConfig(State.config);
    this.recalculateQuote();
    alert("Configuración de Administrador guardada correctamente.");
  },

  // ================= ADMIN: CATÁLOGO =================
  renderAdminCatalog() {
    const tbody = this.elements.adminCatalogTbody;
    tbody.innerHTML = "";

    State.catalog.forEach((item, index) => {
      const tr = document.createElement("tr");
      const optCount = item.options ? item.options.length : 1;
      const refPrice = (item.options && item.options[1]) ? item.options[1].marketPriceCOP : (item.marketPriceCOP || 1000000);

      tr.innerHTML = `
        <td>
          <strong>${item.name}</strong><br>
          <small class="text-muted">${item.description}</small>
        </td>
        <td><span class="layer-badge layer-${item.layer || 'frontend'}">${item.category}</span></td>
        <td><span class="badge-internal" style="background: rgba(37, 99, 235, 0.15); color: #60A5FA; border:none;">${optCount} Opciones</span></td>
        <td class="col-market font-weight-bold">${CostingEngine.formatCOP(refPrice)}</td>
        <td class="text-right">
          <button class="btn-outline-sm btn-delete-cat" data-index="${index}" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4);">
            Eliminar
          </button>
        </td>
      `;

      tr.querySelector(".btn-delete-cat").addEventListener("click", () => {
        if (confirm(`¿Eliminar "${item.name}" del catálogo?`)) {
          State.catalog.splice(index, 1);
          State.saveCatalog(State.catalog);
          this.renderAdminCatalog();
        }
      });

      tbody.appendChild(tr);
    });
  },

  openCatalogModal() {
    this.elements.formCatalogModule.reset();
    document.getElementById("modal-mod-id").value = "";
    document.getElementById("modal-module-title").textContent = "Nuevo Módulo de Catálogo";
    this.elements.modalCatalogModule.showModal();
  },

  handleSaveCatalogModule(e) {
    e.preventDefault();
    const name = document.getElementById("modal-mod-name").value.trim();
    const layer = document.getElementById("modal-mod-layer").value;
    const category = document.getElementById("modal-mod-category").value.trim();
    const hours = Number(document.getElementById("modal-mod-hours").value) || 20;
    const complexity = document.getElementById("modal-mod-complexity").value;
    const marketPrice = Number(document.getElementById("modal-mod-market-price").value) || 1200000;
    const desc = document.getElementById("modal-mod-desc").value.trim();
    const rawKeywords = document.getElementById("modal-mod-keywords").value;

    const keywords = rawKeywords
      .split(",")
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const newModule = {
      id: "mod_" + Date.now().toString().slice(-5),
      name,
      layer,
      category,
      description: desc,
      baseHours: hours,
      defaultComplexity: complexity,
      marketPriceCOP: marketPrice,
      keywords,
      options: [
        {
          id: "opt_std",
          name: "Opción Estándar",
          hours: hours,
          complexity: complexity,
          marketPriceCOP: marketPrice,
          description: desc
        }
      ]
    };

    State.catalog.push(newModule);
    State.saveCatalog(State.catalog);
    this.renderAdminCatalog();
    this.elements.modalCatalogModule.close();
  }
};

// ==========================================
// 5. CONTROLADOR DE PROPUESTA COMERCIAL
// ==========================================

const ProposalController = {
  overlay: null,
  btnPrint: null,
  btnClose: null,
  btnOpen: null,

  init() {
    this.overlay = document.getElementById("proposal-modal-overlay");
    this.btnPrint = document.getElementById("btn-print-proposal");
    this.btnClose = document.getElementById("btn-close-proposal");
    this.btnOpen = document.getElementById("btn-open-proposal");

    if (!this.overlay || !this.btnOpen) return;

    this.btnOpen.addEventListener("click", () => this.openProposal());
    this.btnClose.addEventListener("click", () => this.closeProposal());
    this.btnPrint.addEventListener("click", () => window.print());

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlay.style.display !== "none") {
        this.closeProposal();
      }
    });
  },

  openProposal() {
    const activeQuote = State.activeQuote;

    if (!activeQuote.modules || activeQuote.modules.length === 0) {
      alert("Debes agregar al menos un módulo a la cotización antes de generar la propuesta.");
      return;
    }

    const totals = CostingEngine.calculateQuoteTotals({
      modules: activeQuote.modules,
      hourlyRate: State.config.hourlyRate,
      infraMonthlyCost: Number(document.getElementById("quote-infra-cost").value) || 0,
      infraMonths: Number(document.getElementById("quote-infra-months").value) || 1,
      profitMarginPercent: Number(document.getElementById("quote-margin").value) || 35,
      teamDevelopersCount: 3
    });

    const clientName = document.getElementById("client-name").value.trim() || "Empresa Cliente";
    const clientContact = document.getElementById("client-contact").value.trim() || "Representante Legal";
    const promptText = document.getElementById("prompt-requirement-text").value.trim();

    document.getElementById("prop-quote-code").textContent = "PROP-" + Date.now().toString().slice(-5);
    document.getElementById("prop-date").textContent = new Date().toLocaleDateString("es-CO");
    document.getElementById("prop-client-name").textContent = clientName;
    document.getElementById("prop-client-contact").textContent = `Contacto: ${clientContact}`;
    document.getElementById("prop-sign-client").textContent = `Aceptado: ${clientName}`;

    if (promptText) {
      document.getElementById("prop-project-summary").textContent = promptText;
    }

    const tbody = document.getElementById("prop-modules-tbody");
    tbody.innerHTML = "";

    totals.modules.forEach((mod, idx) => {
      const catItem = State.catalog.find(c => c.id === mod.id);
      let desc = "Implementación funcional, arquitectura escalable y parametrización a medida.";
      
      if (mod.options && mod.selectedOptionId) {
        const opt = mod.options.find(o => o.id === mod.selectedOptionId);
        if (opt && opt.description) desc = opt.description;
      } else if (catItem && catItem.description) {
        desc = catItem.description;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 700; color: #64748B;">0${idx + 1}</td>
        <td>
          <strong>${mod.name}</strong><br>
          <small style="color: #475569; font-weight: 500;">${mod.selectedOptionName || ''}</small>
        </td>
        <td><span class="layer-badge layer-${mod.layer || 'frontend'}">${mod.category}</span></td>
        <td>${desc}</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("prop-delivery-weeks").textContent = 
      `${totals.summary.estimatedDeliveryWeeks} ${totals.summary.estimatedDeliveryWeeks === 1 ? 'Semana' : 'Semanas'}`;
    
    document.getElementById("prop-final-price").textContent = 
      CostingEngine.formatCOP(totals.summary.clientFinalPrice);

    this.overlay.style.display = "flex";
  },

  closeProposal() {
    this.overlay.style.display = "none";
  }
};

// ==========================================
// INICIALIZACIÓN GLOBAL
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  State.init();
  UI.init();
  ProposalController.init();
});
