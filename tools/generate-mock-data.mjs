#!/usr/bin/env node
/**
 * Deterministic generator for the FleetOps MZ demo fixtures.
 *
 * All companies, people, plates and amounts are fictional. The output is fully
 * reproducible (seeded PRNG, fixed reference date), so dashboard figures and
 * unit tests stay stable. Run with:  node tools/generate-mock-data.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'core', 'mock-data');
const ORG_ID = 'org-kuyenda';
/** Must match DEMO_REFERENCE_DATE in src/app/core/services/clock.service.ts */
const TODAY = '2026-10-24';
const TZ = '+02:00';

// ---------------------------------------------------------------- utilities
let seed = 20261024;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min, max) => min + rand() * (max - min);
const int = (min, max) => Math.floor(between(min, max + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const jitter = (value, pct) => value * (1 + between(-pct, pct));
const round = (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;
const pad = (n, len = 2) => String(n).padStart(len, '0');

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function ts(date, hour = 8, minute = 0) {
  return `${date}T${pad(hour)}:${pad(minute)}:00${TZ}`;
}
/** Adds fractional hours to a local timestamp produced by ts(). */
function addHours(stamp, hours) {
  const d = new Date(stamp);
  d.setTime(d.getTime() + hours * 3600_000);
  const local = new Date(d.getTime() + 2 * 3600_000);
  return `${local.toISOString().slice(0, 16)}:00${TZ}`;
}
const dateOf = (stamp) => stamp.slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000);

function containerNumber(owner) {
  const letters = '0123456789A?BCDEFGHIJK?LMNOPQRSTU?VWXYZ';
  const serial = String(int(100000, 999999));
  const code = `${owner}${serial}`;
  let sum = 0;
  for (let i = 0; i < code.length; i++) sum += letters.indexOf(code[i]) * 2 ** i;
  return `${code}${(sum % 11) % 10}`;
}

// ---------------------------------------------------------------- reference data
const BEIRA = { city: 'Beira', country: 'MZ', site: 'Porto da Beira — Terminal de Carga' };
const loc = (city, country, site) => ({ city, country, site });

const routes = [
  { id: 'r-bei-don', origin: BEIRA, destination: loc('Dondo', 'MZ', 'Parque Industrial de Dondo'), distanceKm: 32, typicalDurationHours: 1.5, crossBorder: false, borderPost: null, revenue: ['MZN', 9800], waypoints: [] },
  { id: 'r-bei-chi', origin: BEIRA, destination: loc('Chimoio', 'MZ', 'Zona Industrial de Chimoio'), distanceKm: 200, typicalDurationHours: 4.5, crossBorder: false, borderPost: null, revenue: ['MZN', 33500], waypoints: ['Dondo', 'Nhamatanda', 'Inchope'] },
  { id: 'r-bei-tet', origin: BEIRA, destination: loc('Tete', 'MZ', 'Moatize — Terminal Mineiro'), distanceKm: 590, typicalDurationHours: 14, crossBorder: false, borderPost: null, revenue: ['USD', 1290], waypoints: ['Inchope', 'Catandica', 'Changara'] },
  { id: 'r-bei-mpm', origin: BEIRA, destination: loc('Maputo', 'MZ', 'Machava — Centro de Distribuição'), distanceKm: 1190, typicalDurationHours: 24, crossBorder: false, borderPost: null, revenue: ['MZN', 162000], waypoints: ['Inchope', 'Muxúnguè', 'Maxixe', 'Xai-Xai'] },
  { id: 'r-bei-mut', origin: BEIRA, destination: loc('Mutare', 'ZW', 'Mutare — Armazém Sakubva'), distanceKm: 300, typicalDurationHours: 9, crossBorder: true, borderPost: 'Machipanda / Forbes', revenue: ['USD', 1020], waypoints: ['Inchope', 'Chimoio', 'Machipanda'] },
  { id: 'r-bei-hre', origin: BEIRA, destination: loc('Harare', 'ZW', 'Harare — Workington'), distanceKm: 560, typicalDurationHours: 17, crossBorder: true, borderPost: 'Machipanda / Forbes', revenue: ['USD', 1780], waypoints: ['Chimoio', 'Machipanda', 'Mutare', 'Rusape'] },
  { id: 'r-bei-bly', origin: BEIRA, destination: loc('Blantyre', 'MW', 'Blantyre — Makata'), distanceKm: 830, typicalDurationHours: 26, crossBorder: true, borderPost: 'Zóbuè / Mwanza', revenue: ['USD', 2780], waypoints: ['Inchope', 'Changara', 'Tete', 'Zóbuè'] },
  { id: 'r-bei-lun', origin: BEIRA, destination: loc('Lusaka', 'ZM', 'Lusaka — Zona Industrial'), distanceKm: 1060, typicalDurationHours: 36, crossBorder: true, borderPost: 'Cassacatiza / Chanida', revenue: ['USD', 3080], waypoints: ['Inchope', 'Tete', 'Cassacatiza', 'Chipata'] },
  { id: 'r-bei-jnb', origin: BEIRA, destination: loc('Joanesburgo', 'ZA', 'Germiston — Armazém Logístico'), distanceKm: 1620, typicalDurationHours: 34, crossBorder: true, borderPost: 'Ressano Garcia / Lebombo', revenue: ['ZAR', 52500], waypoints: ['Inchope', 'Maxixe', 'Maputo', 'Ressano Garcia', 'Mbombela'] },
  { id: 'r-tet-bei', origin: loc('Tete', 'MZ', 'Moatize — Terminal Mineiro'), destination: loc('Beira', 'MZ', 'Porto da Beira — Terminal de Granéis'), distanceKm: 590, typicalDurationHours: 14, crossBorder: false, borderPost: null, revenue: ['USD', 1290], waypoints: ['Changara', 'Catandica', 'Inchope'] },
  { id: 'r-chi-bei', origin: loc('Chimoio', 'MZ', 'Zona Industrial de Chimoio'), destination: loc('Beira', 'MZ', 'Porto da Beira — Terminal de Carga'), distanceKm: 200, typicalDurationHours: 4.5, crossBorder: false, borderPost: null, revenue: ['MZN', 29500], waypoints: ['Inchope', 'Nhamatanda', 'Dondo'] },
];
const routeById = Object.fromEntries(routes.map((r) => [r.id, r]));

const RATES_TO_MZN = { MZN: 1, USD: 63.9, ZAR: 3.55, ZWL: 0.0021 };

const fuelPriceAt = {
  MZ: () => ({ amount: round(between(88.2, 89.4), 2), currency: 'MZN' }),
  ZW: () => ({ amount: round(between(1.55, 1.64), 2), currency: 'USD' }),
  MW: () => ({ amount: round(between(1.86, 1.95), 2), currency: 'USD' }),
  ZM: () => ({ amount: round(between(1.41, 1.49), 2), currency: 'USD' }),
  ZA: () => ({ amount: round(between(22.6, 23.3), 2), currency: 'ZAR' }),
};
const stations = {
  Beira: ['Posto Munhava', 'Posto Manga Mascarenhas', 'Posto Inhamízua'],
  Dondo: ['Posto Dondo Cruzamento'],
  Chimoio: ['Posto Chimoio Centro', 'Posto Soalpo'],
  Inchope: ['Posto Inchope Cruzamento'],
  Tete: ['Posto Matundo', 'Posto Moatize'],
  Changara: ['Posto Changara'],
  Maputo: ['Posto Machava', 'Posto Matola Gare'],
  Maxixe: ['Posto Maxixe EN1'],
  Mutare: ['Mutare Truck Stop'],
  Harare: ['Harare Workington Fuel'],
  Blantyre: ['Blantyre Makata Fuel'],
  Lusaka: ['Lusaka Kafue Road Fuel'],
  Joanesburgo: ['Germiston Truck Stop'],
  Mbombela: ['Mbombela N4 Truck Stop'],
  Machipanda: ['Posto Machipanda'],
  Muxúnguè: ['Posto Muxúnguè'],
};
const countryOfCity = {
  Mutare: 'ZW', Harare: 'ZW', Rusape: 'ZW', Blantyre: 'MW', Lusaka: 'ZM', Chipata: 'ZM', Joanesburgo: 'ZA', Mbombela: 'ZA',
};
const countryOf = (city) => countryOfCity[city] ?? 'MZ';

// ---------------------------------------------------------------- organization & users
const organization = {
  id: ORG_ID,
  displayName: 'Kuyenda Transportes',
  legalName: 'Kuyenda Transportes e Logística, Lda (fictícia)',
  taxId: '400 812 337',
  email: 'operacoes@kuyenda.example',
  phone: '+258 23 300 145',
  address: 'Av. das Indústrias, Parcela 214, Munhava',
  city: 'Beira',
  country: 'MZ',
  reportingCurrency: 'MZN',
  defaultLanguage: 'pt-MZ',
  timeZone: 'Africa/Maputo',
  dateFormat: 'dd/MM/yyyy',
  distanceUnit: 'km',
  volumeUnit: 'l',
  notificationSettings: {
    maintenanceDueDays: 14,
    documentExpiryDays: 30,
    tripDelayAlerts: true,
    fuelAnomalyAlerts: true,
    expenseApprovalAlerts: true,
    emailDigest: false,
  },
  createdAt: ts('2021-03-15', 9),
};

const userSeeds = [
  ['Helena Tembe', 'owner', 'active', 'Directora-Geral'],
  ['Rui Massingue', 'admin', 'active', 'Administrador de Sistemas'],
  ['Telma Cossa', 'fleet_manager', 'active', 'Gestora de Frota'],
  ['Abel Nhantumbo', 'fleet_manager', 'active', 'Supervisor de Oficina'],
  ['Neusa Langa', 'dispatcher', 'active', 'Despachante de Operações'],
  ['Fernando Chongo', 'dispatcher', 'active', 'Despachante de Operações'],
  ['Marta Zandamela', 'finance', 'active', 'Responsável Financeira'],
  ['Edson Matsinhe', 'viewer', 'active', 'Auditor Interno'],
  ['Dércio Bila', 'dispatcher', 'invited', 'Despachante (Tete)'],
  ['Paula Mucavele', 'finance', 'inactive', 'Assistente Financeira'],
];
const slug = (name) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.');
const phone = (prefix = '84') => `+258 ${prefix} ${int(200, 899)} ${pad(int(0, 9999), 4)}`;
const users = userSeeds.map(([fullName, role, status, jobTitle], i) => ({
  id: `u${pad(i + 1)}`,
  organizationId: ORG_ID,
  fullName,
  email: `${slug(fullName)}@kuyenda.example`,
  phone: phone(pick(['82', '84', '85', '86', '87'])),
  jobTitle,
  role,
  status,
  lastActiveAt: status === 'active' ? ts(addDays(TODAY, -int(0, 6)), int(7, 18), int(0, 59)) : status === 'inactive' ? ts('2026-06-30', 16, 12) : null,
  invitedAt: status === 'invited' ? ts(addDays(TODAY, -3), 10, 5) : null,
  createdAt: ts(addDays('2021-04-01', i * 97), 9),
}));

// ---------------------------------------------------------------- vehicles
const plate = (province) => `A${pick('BCDEFGHJKLMN')}${pick('ABCDEFGHJKLMNPRSTUVWXYZ')}-${int(100, 999)}-${province}`;
const vehicleSeeds = [
  // [type, make, model, year, payload, tank, consumption]
  ['truck_tractor', 'Scania', 'R 450 6x4', 2021, 34, 900, 40.5],
  ['truck_tractor', 'Volvo', 'FH 480 6x4', 2022, 34, 900, 39.8],
  ['truck_tractor', 'Scania', 'G 410 6x4', 2019, 32, 900, 41.6],
  ['truck_tractor', 'MAN', 'TGS 33.440 6x4', 2020, 33, 900, 42.2],
  ['truck_tractor', 'Mercedes-Benz', 'Actros 2645 6x4', 2021, 34, 900, 40.9],
  ['truck_tractor', 'Volvo', 'FH 440 6x4', 2018, 32, 900, 42.8],
  ['truck_tractor', 'Scania', 'R 500 6x4', 2023, 35, 900, 39.4],
  ['truck_tractor', 'MAN', 'TGX 26.480 6x4', 2022, 34, 900, 40.2],
  ['truck_tractor', 'Sinotruk', 'HOWO A7 6x4', 2019, 32, 800, 44.5],
  ['truck_tractor', 'Mercedes-Benz', 'Actros 2651 6x4', 2023, 35, 900, 39.6],
  ['truck_tractor', 'FAW', 'J6P 6x4', 2020, 30, 800, 45.1],
  ['truck_tractor', 'Volvo', 'FMX 440 6x4', 2021, 33, 900, 42.0],
  ['truck_tractor', 'Scania', 'P 410 6x4', 2018, 31, 800, 42.9],
  ['truck_tractor', 'MAN', 'TGS 26.440 6x4', 2017, 31, 800, 43.7],
  ['truck_tractor', 'Sinotruk', 'HOWO A7 6x4', 2018, 31, 800, 45.3],
  ['truck_tractor', 'Mercedes-Benz', 'Actros 2644 6x4', 2016, 31, 800, 44.0],
  ['truck_tractor', 'FAW', 'J5P 6x4', 2015, 28, 700, 46.5],
  ['truck_tractor', 'Volvo', 'FH 460 6x4', 2020, 33, 900, 41.0],
  ['rigid_truck', 'Isuzu', 'FVZ 1400 Carga', 2021, 14, 400, 30.5],
  ['tanker', 'Mercedes-Benz', 'Axor 3340 Cisterna 18 000 l', 2019, 18, 400, 33.0],
  ['rigid_truck', 'Hino', '500 FM 2632', 2022, 16, 400, 31.2],
  ['tanker', 'MAN', 'TGS 33.400 Cisterna 20 000 l', 2020, 20, 400, 34.1],
  ['tanker', 'Isuzu', 'FVZ 1400 Cisterna 12 000 l', 2018, 12, 300, 29.8],
  ['tipper', 'Sinotruk', 'HOWO 371 Basculante', 2021, 25, 400, 38.5],
  ['tipper', 'Shacman', 'X3000 Basculante', 2022, 25, 400, 37.9],
  ['light_vehicle', 'Toyota', 'Hilux 2.4 GD-6 Cabine Dupla', 2023, 1, 80, 9.8],
];
const provinces = ['SF', 'SF', 'SF', 'MC', 'MN', 'TT', 'SF'];
const vehicles = vehicleSeeds.map(([type, make, model, year, payloadTonnes, tankCapacityL, expectedConsumptionL100km], i) => {
  const age = 2026 - year;
  return {
    id: `v${pad(i + 1)}`,
    organizationId: ORG_ID,
    plateNumber: plate(pick(provinces)),
    fleetNumber: `KT-${pad(i + 1, 3)}`,
    make,
    model,
    year,
    type,
    status: 'available',
    fuelType: 'diesel',
    vin: `${make.slice(0, 2).toUpperCase()}${pick('XYZW')}${int(10000000, 99999999)}${pad(int(0, 99999), 5)}`,
    odometerKm: type === 'light_vehicle' ? int(38000, 52000) : int(70000, 115000) * Math.max(1, age) * 0.9 + int(0, 5000),
    tankCapacityL,
    expectedConsumptionL100km,
    payloadTonnes,
    assignedDriverId: null,
    linkedTrailerId: null,
    acquisitionDate: `${year}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
    notes: '',
    statusHistory: [],
    createdAt: ts(`${Math.max(year, 2021)}-0${int(1, 9)}-1${int(0, 9)}`, 10),
    updatedAt: ts(addDays(TODAY, -int(1, 30)), 9),
  };
});
vehicles.forEach((v) => (v.odometerKm = Math.round(v.odometerKm)));
const vehicle = (id) => vehicles.find((v) => v.id === id);

// ---------------------------------------------------------------- trailers
const trailerSeeds = [
  ['skeletal', 'Henred', 2020, 3, 34, null],
  ['skeletal', 'Afrit', 2021, 3, 34, null],
  ['flatbed', 'SA Truck Bodies', 2019, 3, 32, null],
  ['skeletal', 'Henred', 2018, 3, 34, null],
  ['tanker', 'GRW', 2020, 3, 30, 38000],
  ['tautliner', 'Serco', 2021, 3, 30, null],
  ['tautliner', 'Henred', 2022, 3, 30, null],
  ['skeletal', 'Afrit', 2022, 3, 34, null],
  ['flatbed', 'Afrit', 2017, 3, 32, null],
  ['skeletal', 'SA Truck Bodies', 2023, 3, 34, null],
  ['refrigerated', 'Serco', 2021, 3, 26, null],
  ['tanker', 'GRW', 2019, 3, 30, 38000],
  ['lowbed', 'Henred', 2016, 4, 45, null],
  ['flatbed', 'SA Truck Bodies', 2016, 3, 32, null],
  ['skeletal', 'Afrit', 2019, 3, 34, null],
];
const trailers = trailerSeeds.map(([type, make, year, axles, capacityTonnes, capacityLitres], i) => {
  const lastInspectionDate = addDays(TODAY, -int(40, 300));
  return {
    id: `t${pad(i + 1)}`,
    organizationId: ORG_ID,
    plateNumber: `RB-${int(1000, 9999)}-SF`,
    fleetNumber: `KR-${pad(i + 1, 3)}`,
    make,
    year,
    type,
    axles,
    capacityTonnes,
    capacityLitres,
    status: 'available',
    assignedVehicleId: i < 13 ? `v${pad(i + 1)}` : null,
    lastInspectionDate,
    inspectionExpiry: addDays(lastInspectionDate, 365),
    notes: '',
    createdAt: ts(`${Math.max(year, 2021)}-05-0${int(1, 9)}`, 10),
    updatedAt: ts(addDays(TODAY, -int(1, 30)), 9),
  };
});
trailers[13].status = 'maintenance';
trailers[13].notes = 'Substituição de suspensão pneumática no eixo traseiro.';
trailers[2].inspectionExpiry = addDays(TODAY, 12);
trailers[8].inspectionExpiry = addDays(TODAY, -9);
trailers.forEach((t) => {
  if (t.assignedVehicleId) vehicle(t.assignedVehicleId).linkedTrailerId = t.id;
});
const trailer = (id) => trailers.find((t) => t.id === id);

// ---------------------------------------------------------------- drivers
const driverSeeds = [
  ['Alberto', 'Machava'], ['Celso', 'Sitoe'], ['Ernesto', 'Nhaca'], ['Hélio', 'Muianga'], ['Inácio', 'Manjate'],
  ['Jacinto', 'Tivane'], ['Lourenço', 'Cumbe'], ['Narciso', 'Mazive'], ['Orlando', 'Fumo'], ['Tomás', 'Ngovene'],
  ['Zacarias', 'Mabote'], ['Lurdes', 'Novela'], ['Aníbal', 'Sambo'], ['Félix', 'Chirindza'], ['Domingos', 'Gove'],
  ['Armando', 'Sumbana'], ['Benedito', 'Macuácua'], ['Sónia', 'Bento'], ['Custódio', 'Jamal'], ['Elias', 'Mucavele'],
];
// Primary vehicle per driver (index-aligned); null means a relief/floating driver.
const driverVehicle = ['v01', 'v02', 'v03', 'v04', 'v05', 'v06', 'v07', 'v08', 'v09', 'v10', 'v11', 'v12', 'v13', 'v18', 'v19', 'v20', 'v22', 'v21', 'v24', null];
const drivers = driverSeeds.map(([firstName, lastName], i) => {
  const hireDate = `${int(2014, 2024)}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
  return {
    id: `d${pad(i + 1)}`,
    organizationId: ORG_ID,
    employeeNumber: `MOT-${pad(i + 101, 4)}`,
    firstName,
    lastName,
    phone: phone(pick(['82', '84', '86', '87'])),
    email: `${slug(`${firstName} ${lastName}`)}@kuyenda.example`,
    city: pick(['Beira', 'Beira', 'Dondo', 'Chimoio', 'Nhamatanda', 'Tete']),
    nationalId: `${int(100, 999)}${int(100000, 999999)}${pick('ABCDMNPQ')}`,
    licenceNumber: `${pad(int(10, 99))}${int(1000000, 9999999)}`,
    licenceCategory: i >= 14 && i <= 18 ? pick(['C', 'C+E']) : 'C+E',
    licenceExpiry: `${int(2027, 2030)}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
    crossBorderAuthorized: i < 14,
    hireDate,
    status: 'active',
    assignedVehicleId: driverVehicle[i],
    emergencyContactName: `${pick(['Maria', 'Ana', 'Rosa', 'Joana', 'Carlos', 'Paulo'])} ${lastName}`,
    emergencyContactPhone: phone('84'),
    incidents: [],
    notes: '',
    createdAt: ts(hireDate < '2021-03-15' ? '2021-03-15' : hireDate, 9),
    updatedAt: ts(addDays(TODAY, -int(1, 40)), 9),
  };
});
drivers[4].licenceExpiry = addDays(TODAY, 15);
drivers[10].licenceExpiry = addDays(TODAY, 22);
drivers[16].status = 'on_leave';
drivers[16].notes = 'Licença anual até 02/11/2026.';
drivers[19].status = 'inactive';
drivers[19].licenceExpiry = '2026-08-31';
drivers[19].notes = 'Carta de condução expirada — aguarda renovação no INATRO.';
drivers[18].licenceCategory = 'C';
drivers.forEach((d) => {
  if (d.assignedVehicleId) vehicle(d.assignedVehicleId).assignedDriverId = d.id;
});
const driver = (id) => drivers.find((d) => d.id === id);

// ---------------------------------------------------------------- customers
const customerSeeds = [
  // name, segment, city, country, currency, terms, routes
  ['Moatize Carvão & Minerais, Lda', 'mining', 'Tete', 'MZ', 'USD', 45, ['r-bei-tet', 'r-tet-bei']],
  ['Agro-Púnguè Exportadora, SA', 'agriculture', 'Chimoio', 'MZ', 'MZN', 30, ['r-chi-bei', 'r-bei-chi']],
  ['Cimentos do Índico, Lda', 'construction', 'Dondo', 'MZ', 'MZN', 30, ['r-bei-don']],
  ['Combustíveis Chiveve, Lda', 'fuel', 'Beira', 'MZ', 'MZN', 15, ['r-bei-chi', 'r-bei-tet']],
  ['Mabvazuva Freight (Pvt) Ltd', 'freight_forwarding', 'Harare', 'ZW', 'USD', 30, ['r-bei-hre', 'r-bei-mut']],
  ['Mulanje Agri Traders Ltd', 'agriculture', 'Blantyre', 'MW', 'USD', 45, ['r-bei-bly']],
  ['Chongwe Mining Supplies Ltd', 'mining', 'Lusaka', 'ZM', 'USD', 60, ['r-bei-lun']],
  ['Distribuidora Marracuene, Lda', 'retail', 'Maputo', 'MZ', 'MZN', 30, ['r-bei-mpm']],
  ['Ngwenya Packaging (Pty) Ltd', 'manufacturing', 'Joanesburgo', 'ZA', 'ZAR', 30, ['r-bei-jnb']],
  ['Doce Búzi Agroindústria, Lda', 'agriculture', 'Búzi', 'MZ', 'MZN', 30, ['r-bei-don', 'r-bei-chi']],
  ['Beira Trânsito & Despacho, Lda', 'freight_forwarding', 'Beira', 'MZ', 'USD', 30, ['r-bei-hre', 'r-bei-bly', 'r-bei-mut']],
  ['Serração Vanduzi, Lda', 'manufacturing', 'Chimoio', 'MZ', 'MZN', 30, ['r-chi-bei']],
  ['Metalúrgica Zambeze Norte, Lda', 'construction', 'Tete', 'MZ', 'USD', 45, ['r-bei-tet']],
  ['Cafés Serra Choa, Lda', 'agriculture', 'Catandica', 'MZ', 'MZN', 30, ['r-chi-bei']],
  ['Fertilizantes Inhamízua, SA', 'agriculture', 'Beira', 'MZ', 'MZN', 30, ['r-bei-chi', 'r-bei-tet']],
  ['Bvumba Timber (Pvt) Ltd', 'manufacturing', 'Mutare', 'ZW', 'USD', 30, ['r-bei-mut']],
  ['Mwembeshi Agro Inputs Ltd', 'agriculture', 'Lusaka', 'ZM', 'USD', 45, ['r-bei-lun']],
  ['Arroz de Nhamatanda, Lda', 'agriculture', 'Nhamatanda', 'MZ', 'MZN', 30, ['r-bei-chi']],
  ['Bebidas do Caia Distribuição, Lda', 'retail', 'Caia', 'MZ', 'MZN', 30, ['r-bei-mpm', 'r-bei-chi']],
  ['Mpumalanga Steel Traders (Pty) Ltd', 'manufacturing', 'Mbombela', 'ZA', 'ZAR', 30, ['r-bei-jnb']],
  ['Gases Industriais Munhava, Lda', 'manufacturing', 'Beira', 'MZ', 'MZN', 15, ['r-bei-don']],
  ['Hortícolas Machipanda, Lda', 'agriculture', 'Manica', 'MZ', 'MZN', 15, ['r-bei-mut']],
  ['Savane Pescas e Frio, Lda', 'retail', 'Beira', 'MZ', 'MZN', 30, ['r-bei-hre', 'r-bei-chi']],
  ['Limbe Petroleum Distributors Ltd', 'fuel', 'Blantyre', 'MW', 'USD', 30, ['r-bei-bly']],
];
const contactNames = ['Isabel Chauque', 'Nelson Mapanzene', 'Graça Mondjane', 'Tendai Moyo', 'Chikondi Banda', 'Mwila Phiri',
  'Rita Macamo', 'Thabo Nkosi', 'Américo Nhamuave', 'Teresa Simbine', 'Vasco Nhabinde', 'Lina Mussa', 'Tatenda Dube',
  'Joaquim Mutemba', 'Chipo Mutasa', 'Bwalya Mulenga', 'Albertina Cuna', 'Sipho Dlamini', 'Gilda Matavele', 'Esperança Chilaule',
  'Kudzai Ncube', 'Carolina Mavie', 'Grace Chirwa', 'Mateus Ubisse'];
const countryPhone = { MZ: '+258 2', ZW: '+263 24', MW: '+265 1', ZM: '+260 211', ZA: '+27 11' };
const customers = customerSeeds.map(([name, segment, city, country, currency, terms, preferredRoutes], i) => {
  const short = name.split(/[ ,(&]/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return {
    id: `c${pad(i + 1)}`,
    organizationId: ORG_ID,
    code: `CLI-${pad(i + 1, 3)}`,
    name: name.replace(/, (Lda|SA)$| \((Pvt|Pty)\) Ltd$| Ltd$/, ''),
    legalName: name,
    taxId: country === 'MZ' ? `${int(400, 499)} ${int(100, 999)} ${int(100, 999)}` : `${country}-${int(10000000, 99999999)}`,
    segment,
    status: i === 17 || i === 21 ? 'inactive' : 'active',
    contactName: contactNames[i],
    contactRole: pick(['Gestor de Logística', 'Directora de Compras', 'Coordenador de Expedição', 'Supply Chain Manager', 'Responsável de Armazém']),
    email: `logistica@${short}.example`,
    phone: `${countryPhone[country]}${int(1000000, 9999999)}`.replace(/(\d{3})(\d{4})$/, ' $1 $2'),
    city,
    country,
    billingAddress: `${pick(['Rua', 'Av.', 'Estrada'])} ${pick(['Principal', 'Industrial', 'do Porto', 'da Liberdade', 'Comercial'])}, ${int(10, 980)}, ${city}`,
    billingEmail: `facturacao@${short}.example`,
    paymentTermsDays: terms,
    preferredCurrency: currency,
    creditLimit: { amount: currency === 'MZN' ? int(8, 40) * 100000 : currency === 'ZAR' ? int(3, 9) * 100000 : int(2, 9) * 10000, currency },
    outstandingBalance: { amount: 0, currency },
    notes: '',
    preferredRoutes,
    createdAt: ts(addDays('2021-05-01', i * 41), 11),
    updatedAt: ts(addDays(TODAY, -int(1, 60)), 11),
  };
});
const customersForRoute = (routeId) => customers.filter((c) => c.status === 'active' && c.preferredRoutes.includes(routeId));

// ---------------------------------------------------------------- trips
const cargoForRoute = {
  'r-bei-don': [['bulk', 'Clínquer a granel', 28], ['general', 'Paletes de sacos de cimento vazios', 12], ['general', 'Cilindros de gás industrial', 9]],
  'r-bei-chi': [['fuel', 'Gasóleo — 18 000 l', 15], ['general', 'Fertilizante NPK ensacado', 30], ['container', 'Contentor 40\' — bens de consumo', 24]],
  'r-bei-tet': [['container', 'Contentor 40\' — peças de equipamento mineiro', 26], ['abnormal', 'Componente de escavadora (carga excepcional)', 38], ['general', 'Perfis metálicos e vergalhão', 32]],
  'r-bei-mpm': [['container', 'Contentor 40\' — mercadoria diversa', 25], ['general', 'Bebidas paletizadas', 30]],
  'r-bei-mut': [['general', 'Madeira serrada (retorno de contentor)', 28], ['container', 'Contentor 20\' — produtos hortícolas', 18]],
  'r-bei-hre': [['container', 'Contentor 40\' — maquinaria agrícola', 27], ['refrigerated', 'Pescado congelado', 22], ['general', 'Fertilizante ensacado', 32]],
  'r-bei-bly': [['general', 'Fertilizante ureia ensacado', 32], ['fuel', 'Gasóleo — 38 000 l', 32], ['container', 'Contentor 40\' — bens de consumo', 26]],
  'r-bei-lun': [['container', 'Contentor 40\' — reagentes mineiros', 28], ['general', 'Sementes e insumos agrícolas', 30]],
  'r-bei-jnb': [['container', 'Contentor 40\' — embalagens', 24], ['general', 'Bobinas de aço', 32]],
  'r-tet-bei': [['bulk', 'Carvão metalúrgico a granel', 34]],
  'r-chi-bei': [['general', 'Milho ensacado para exportação', 32], ['general', 'Madeira serrada', 28], ['general', 'Café verde ensacado', 20]],
};
const containerOwners = ['KUYU', 'BEIU', 'CRDU', 'ZMBU', 'PNGU'];

const trips = [];
let tripSeq = 0;
function makeTrip({ status, routeId, vehicleId, driverId, trailerId, customerId, departure, cargoIndex, delayReason = null, progress = 1 }) {
  tripSeq += 1;
  const route = routeById[routeId];
  const [type, description, weight] = cargoForRoute[routeId][cargoIndex ?? int(0, cargoForRoute[routeId].length - 1)];
  const v = vehicle(vehicleId);
  const t = trailerId ? trailer(trailerId) : null;
  const customer = customers.find((c) => c.id === customerId) ?? pick(customersForRoute(routeId));
  const plannedArrival = addHours(departure, route.typicalDurationHours + (route.crossBorder ? 6 : 1));
  const departed = ['in_transit', 'delayed', 'delivered', 'completed'].includes(status);
  const actualDeparture = departed ? addHours(departure, between(-0.4, 1.6)) : null;
  const arrived = ['delivered', 'completed'].includes(status);
  const actualArrival = arrived ? addHours(plannedArrival, between(-2, route.crossBorder ? 7 : 2.5)) : null;
  const [currency, base] = route.revenue;
  const revenueAmount = currency === 'MZN' || currency === 'ZAR' ? Math.round(jitter(base, 0.07) / 50) * 50 : Math.round(jitter(base, 0.07) / 10) * 10;
  const capacity = Math.min(v.type === 'truck_tractor' && t ? t.capacityTonnes : v.payloadTonnes, weight);
  const trip = {
    id: `trp${pad(tripSeq, 3)}`,
    organizationId: ORG_ID,
    reference: `VG-2026-${pad(tripSeq + 400, 4)}`,
    customerId: customer.id,
    vehicleId,
    driverId,
    trailerId,
    routeId,
    origin: route.origin,
    destination: route.destination,
    plannedDistanceKm: route.distanceKm,
    actualDistanceKm: arrived ? Math.round(route.distanceKm * between(1.0, 1.04)) : null,
    cargo: {
      type,
      description,
      weightTonnes: round(jitter(capacity, 0.05), 1),
      containerRef: type === 'container' ? containerNumber(pick(containerOwners)) : null,
      sealNumber: type === 'container' ? `SL${int(100000, 999999)}` : null,
    },
    plannedDeparture: departure,
    plannedArrival,
    actualDeparture,
    actualArrival,
    status,
    revenue: { amount: revenueAmount, currency },
    customerReference: `${customer.code.replace('CLI-', 'PO')}-${int(1000, 9999)}`,
    delayReason,
    notes: '',
    timeline: [],
    createdAt: addHours(departure, -int(24, 120)),
    updatedAt: departure,
    _progress: progress,
  };
  trips.push(trip);
  return trip;
}

// Historic trips (completed / cancelled), chronological rotation over the fleet.
const longHaul = ['v01', 'v02', 'v03', 'v04', 'v05', 'v06', 'v07', 'v08', 'v09', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16'];
const historicPlan = [
  ['2026-05-04', 'r-bei-tet', 'v01'], ['2026-05-09', 'r-bei-hre', 'v02'], ['2026-05-15', 'r-bei-mpm', 'v04'],
  ['2026-05-21', 'r-bei-chi', 'v20'], ['2026-05-27', 'r-bei-lun', 'v03'], ['2026-06-03', 'r-tet-bei', 'v05'],
  ['2026-06-09', 'r-bei-bly', 'v07'], ['2026-06-14', 'r-bei-don', 'v24'], ['2026-06-19', 'r-bei-jnb', 'v08'],
  ['2026-06-26', 'r-bei-mut', 'v09'], ['2026-07-02', 'r-bei-tet', 'v14'], ['2026-07-08', 'r-bei-hre', 'v11'],
  ['2026-07-14', 'r-chi-bei', 'v12'], ['2026-07-21', 'r-bei-mpm', 'v10'], ['2026-07-28', 'r-bei-lun', 'v15'],
  ['2026-08-04', 'r-bei-chi', 'v22'], ['2026-08-11', 'r-bei-tet', 'v06'], ['2026-08-18', 'r-bei-bly', 'v13'],
  ['2026-08-26', 'r-bei-hre', 'v16'], ['2026-09-02', 'r-bei-don', 'v21'], ['2026-09-09', 'r-tet-bei', 'v02'],
  ['2026-09-16', 'r-bei-jnb', 'v04'], ['2026-09-24', 'r-bei-mut', 'v01'], ['2026-10-01', 'r-bei-tet', 'v03'],
  ['2026-10-08', 'r-bei-chi', 'v19'],
];
historicPlan.forEach(([date, routeId, vehicleId], i) => {
  const v = vehicle(vehicleId);
  const driverId = v.assignedDriverId ?? (v.type === 'tanker' ? 'd16' : 'd19');
  const cancelled = i === 7 || i === 19;
  makeTrip({
    status: cancelled ? 'cancelled' : 'completed',
    routeId,
    vehicleId,
    driverId: driverId === 'd20' ? 'd19' : driverId,
    trailerId: v.linkedTrailerId,
    departure: ts(date, int(4, 8), pick([0, 15, 30, 45])),
  });
});
// Tankers and fuel cargo are aligned: tanker routes always carry fuel.
trips.forEach((t) => {
  const v = vehicle(t.vehicleId);
  if (v.type === 'tanker') {
    t.cargo = { type: 'fuel', description: `Gasóleo — ${pad(v.payloadTonnes * 1000, 0).replace(/(\d)(?=(\d{3})+$)/g, '$1 ')} l`, weightTonnes: round(v.payloadTonnes * 0.84, 1), containerRef: null, sealNumber: null };
  }
});

// Current operational picture around the reference date.
const activePlan = [
  { status: 'in_transit', routeId: 'r-bei-hre', vehicleId: 'v01', departure: ts('2026-10-22', 7, 0), customerId: 'c05', cargoIndex: 0, progress: 0.85 },
  { status: 'in_transit', routeId: 'r-bei-tet', vehicleId: 'v02', departure: ts('2026-10-23', 5, 30), customerId: 'c01', cargoIndex: 0, progress: 0.7 },
  { status: 'in_transit', routeId: 'r-bei-lun', vehicleId: 'v03', departure: ts('2026-10-20', 6, 0), customerId: 'c07', cargoIndex: 0, progress: 0.75 },
  { status: 'in_transit', routeId: 'r-bei-mpm', vehicleId: 'v04', departure: ts('2026-10-23', 4, 0), customerId: 'c08', cargoIndex: 0, progress: 0.6 },
  { status: 'in_transit', routeId: 'r-tet-bei', vehicleId: 'v05', departure: ts('2026-10-24', 3, 0), customerId: 'c01', cargoIndex: 0, progress: 0.45 },
  { status: 'in_transit', routeId: 'r-bei-chi', vehicleId: 'v20', departure: ts('2026-10-24', 9, 30), customerId: 'c04', cargoIndex: 0, progress: 0.5 },
  { status: 'delayed', routeId: 'r-bei-bly', vehicleId: 'v07', departure: ts('2026-10-19', 6, 0), customerId: 'c06', cargoIndex: 0, progress: 0.8, delayReason: 'Fila prolongada na fronteira de Zóbuè e inspecção fitossanitária adicional à carga.' },
  { status: 'delayed', routeId: 'r-bei-jnb', vehicleId: 'v08', departure: ts('2026-10-18', 5, 0), customerId: 'c09', cargoIndex: 0, progress: 0.4, delayReason: 'Avaria no sistema de travagem perto de Xai-Xai; viatura aguarda peça de substituição.' },
  { status: 'delayed', routeId: 'r-bei-mut', vehicleId: 'v09', departure: ts('2026-10-22', 6, 30), customerId: 'c16', cargoIndex: 0, progress: 0.9, delayReason: 'Documento Único (DU) incompleto; carga retida pelas alfândegas em Machipanda.' },
  { status: 'preparing', routeId: 'r-bei-tet', vehicleId: 'v10', departure: ts('2026-10-24', 16, 0), customerId: 'c13', cargoIndex: 2 },
  { status: 'preparing', routeId: 'r-bei-hre', vehicleId: 'v11', departure: ts('2026-10-25', 5, 0), customerId: 'c23', cargoIndex: 1 },
  { status: 'preparing', routeId: 'r-bei-don', vehicleId: 'v19', departure: ts('2026-10-24', 14, 30), customerId: 'c03', cargoIndex: 1 },
  { status: 'delivered', routeId: 'r-bei-chi', vehicleId: 'v12', departure: ts('2026-10-23', 6, 0), customerId: 'c15', cargoIndex: 1 },
  { status: 'delivered', routeId: 'r-chi-bei', vehicleId: 'v13', departure: ts('2026-10-21', 7, 0), customerId: 'c02', cargoIndex: 0 },
  { status: 'delivered', routeId: 'r-bei-mut', vehicleId: 'v06', departure: ts('2026-10-19', 6, 0), customerId: 'c22', cargoIndex: 1 },
  { status: 'delivered', routeId: 'r-bei-don', vehicleId: 'v21', departure: ts('2026-10-23', 8, 0), customerId: 'c21', cargoIndex: 2 },
  { status: 'planned', routeId: 'r-bei-bly', vehicleId: 'v06', departure: ts('2026-10-27', 5, 0), customerId: 'c24', cargoIndex: 0 },
  { status: 'planned', routeId: 'r-bei-mpm', vehicleId: 'v12', departure: ts('2026-10-28', 4, 30), customerId: 'c19', cargoIndex: 1 },
  { status: 'planned', routeId: 'r-bei-lun', vehicleId: 'v18', trailerId: 't15', departure: ts('2026-10-30', 5, 0), customerId: 'c17', cargoIndex: 1 },
  { status: 'planned', routeId: 'r-bei-tet', vehicleId: 'v22', driverId: 'd16', departure: ts('2026-10-26', 6, 0), customerId: 'c04' },
  { status: 'planned', routeId: 'r-bei-don', vehicleId: 'v24', departure: ts('2026-10-26', 7, 30), customerId: 'c03', cargoIndex: 0 },
  { status: 'planned', routeId: 'r-bei-hre', vehicleId: 'v01', departure: ts('2026-11-02', 5, 0), customerId: 'c11', cargoIndex: 2 },
];
activePlan.forEach((p) => {
  const v = vehicle(p.vehicleId);
  const trip = makeTrip({
    ...p,
    driverId: p.driverId ?? v.assignedDriverId,
    trailerId: p.trailerId ?? v.linkedTrailerId,
  });
  if (v.type === 'tanker') {
    trip.cargo = { type: 'fuel', description: `Gasóleo — ${v.payloadTonnes} 000 l`, weightTonnes: round(v.payloadTonnes * 0.84, 1), containerRef: null, sealNumber: null };
  }
});
// Trips still "in transit" must have an ETA after "now"; overdue ones are modelled as "delayed".
// (Deterministic adjustment: no PRNG calls, so the rest of the dataset is unchanged.)
const NOW = ts(TODAY, 12, 0);
trips
  .filter((t) => t.status === 'in_transit' && new Date(t.plannedArrival) <= new Date(NOW))
  .forEach((t, i) => {
    t.plannedArrival = addHours(NOW, 4 + i * 5);
  });
trips.forEach((t) => {
  if (t.status === 'delivered' && t.actualArrival && dateOf(t.actualArrival) > TODAY) {
    t.actualArrival = ts(TODAY, 8, 40);
  }
});

// Timelines
let eventSeq = 0;
const event = (timestamp, type, status, location, note = '') => ({ id: `ev${pad(++eventSeq, 4)}`, timestamp, type, status, location, note });
trips.forEach((t) => {
  const route = routeById[t.routeId];
  const tl = [event(t.createdAt, 'created', 'planned', t.origin.city, `Pedido do cliente ${t.customerReference}.`)];
  if (t.status === 'cancelled') {
    tl.push(event(addHours(t.plannedDeparture, -10), 'status_change', 'cancelled', t.origin.city, 'Cancelada a pedido do cliente — carga não disponibilizada no terminal.'));
  }
  if (['preparing', 'in_transit', 'delayed', 'delivered', 'completed'].includes(t.status)) {
    tl.push(event(addHours(t.plannedDeparture, -5), 'status_change', 'preparing', t.origin.site, 'Carregamento e verificação de documentos.'));
  }
  if (t.actualDeparture) {
    tl.push(event(t.actualDeparture, 'status_change', 'in_transit', t.origin.city, 'Partida confirmada pelo despacho.'));
    const reached = ['delivered', 'completed'].includes(t.status) ? 1 : t._progress;
    route.waypoints.forEach((wp, i) => {
      const fraction = (i + 1) / (route.waypoints.length + 1);
      if (fraction > reached) return;
      const isBorder = route.borderPost && route.borderPost.toLowerCase().includes(wp.toLowerCase().slice(0, 5));
      tl.push(event(addHours(t.actualDeparture, route.typicalDurationHours * fraction), isBorder ? 'border_crossing' : 'checkpoint', null, wp,
        isBorder ? `Fronteira ${route.borderPost}: despacho aduaneiro concluído.` : 'Passagem registada.'));
    });
  }
  if (t.status === 'delayed') {
    tl.push(event(addHours(t.plannedArrival, -3), 'delay', 'delayed', route.waypoints[Math.min(route.waypoints.length - 1, Math.floor(route.waypoints.length * t._progress))] ?? t.destination.city, t.delayReason));
  }
  if (t.actualArrival) {
    tl.push(event(t.actualArrival, 'status_change', 'delivered', t.destination.site, 'Entrega confirmada com guia assinada.'));
  }
  if (t.status === 'completed') {
    tl.push(event(addHours(t.actualArrival, int(30, 70)), 'status_change', 'completed', t.origin.city, 'Viagem encerrada e documentos entregues à contabilidade.'));
  }
  tl.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  t.timeline = tl;
  t.updatedAt = tl[tl.length - 1].timestamp;
});
trips.find((t) => t.status === 'delayed' && t.routeId === 'r-bei-jnb').notes = 'Seguradora notificada. Cliente informado do novo prazo estimado.';
trips.find((t) => t.status === 'in_transit' && t.routeId === 'r-bei-lun').notes = 'Escolta não necessária. Contacto do destinatário: armazém turno da noite.';

// Statuses derived from the trip picture
trips.forEach((t) => {
  if (['in_transit', 'delayed'].includes(t.status)) {
    vehicle(t.vehicleId).status = 'in_transit';
    driver(t.driverId).status = 'on_trip';
    if (t.trailerId) trailer(t.trailerId).status = 'in_use';
  }
  if (t.status === 'preparing' && t.trailerId) trailer(t.trailerId).status = 'in_use';
});
['v14', 'v15', 'v16'].forEach((id) => (vehicle(id).status = 'maintenance'));
vehicle('v17').status = 'inactive';
vehicle('v17').notes = 'Retirada de operação — avaliação para venda.';
vehicle('v17').assignedDriverId = null;

// ---------------------------------------------------------------- odometer, fuel, expenses
const fuelRecords = [];
const expenses = [];
let fuelSeq = 0;
let expenseSeq = 0;
const approvers = ['u03', 'u05', 'u06', 'u07'];

function addFuel({ v, trip, stamp, city, km, driverId }) {
  const country = countryOf(city);
  const price = fuelPriceAt[country]();
  const litres = round(km * (v.expectedConsumptionL100km / 100) * between(0.95, 1.06), 1);
  fuelSeq += 1;
  const record = {
    id: `f${pad(fuelSeq, 3)}`,
    organizationId: ORG_ID,
    reference: `ABS-${pad(fuelSeq + 2100, 5)}`,
    timestamp: stamp,
    vehicleId: v.id,
    driverId,
    tripId: trip ? trip.id : null,
    odometerKm: v._odo,
    litres,
    pricePerLitre: price,
    totalAmount: { amount: round(litres * price.amount, 2), currency: price.currency },
    fullTank: true,
    station: pick(stations[city] ?? [`Posto ${city}`]),
    location: city,
    receiptFileName: rand() > 0.25 ? `recibo-abs-${pad(fuelSeq + 2100, 5)}.jpg` : null,
    notes: '',
    createdAt: stamp,
    updatedAt: stamp,
  };
  fuelRecords.push(record);
  return record;
}

function addExpense({ date, category, amount, currency, vehicleId = null, tripId = null, driverId = null, vendor, description, paymentMethod = 'cash', status = 'approved' }) {
  expenseSeq += 1;
  const stamp = ts(date, int(8, 18), int(0, 59));
  expenses.push({
    id: `e${pad(expenseSeq, 3)}`,
    organizationId: ORG_ID,
    reference: `DSP-${pad(expenseSeq + 5300, 5)}`,
    date,
    category,
    amount: { amount, currency },
    vehicleId,
    tripId,
    driverId,
    vendor,
    description,
    paymentMethod,
    approvalStatus: status,
    submittedByUserId: pick(approvers),
    receiptFileName: rand() > 0.3 ? `recibo-dsp-${pad(expenseSeq + 5300, 5)}.pdf` : null,
    notes: '',
    createdAt: stamp,
    updatedAt: stamp,
  });
}

vehicles.forEach((v) => {
  // Start-of-period odometer, then replay the vehicle's trips.
  v._odo = Math.round(v.odometerKm - 18000 * between(0.6, 1));
  v._sinceFuel = 0;
});
const chronological = [...trips].sort((a, b) => a.plannedDeparture.localeCompare(b.plannedDeparture));
chronological.forEach((t) => {
  if (!t.actualDeparture) return;
  const v = vehicle(t.vehicleId);
  const route = routeById[t.routeId];
  const d = route.distanceKm;
  const kmPerTank = (v.tankCapacityL * 0.85) / (v.expectedConsumptionL100km / 100);
  const reached = ['delivered', 'completed'].includes(t.status) ? 1 : t._progress;
  // Vehicles leave base with a full tank (filled after the previous return), so every
  // refuel below is attributable to this trip: outbound at destination, return at base.
  const local = int(15, 80);
  v._odo += local;
  v._sinceFuel += local;
  const shortRoute = d <= 250;
  const legs = d > kmPerTank * 0.7 ? [0.5, 1] : [1];
  let done = 0;
  legs.forEach((fraction) => {
    const target = Math.min(fraction, reached);
    if (target <= done) return;
    const km = Math.round(d * (target - done));
    v._odo += km;
    v._sinceFuel += km;
    done = target;
    if (target < fraction || shortRoute) return;
    const city = target === 1 ? t.destination.city : route.waypoints[Math.floor(route.waypoints.length * target)];
    addFuel({ v, trip: t, stamp: addHours(t.actualDeparture, route.typicalDurationHours * target + 0.5), city, km: v._sinceFuel, driverId: t.driverId });
    v._sinceFuel = 0;
  });
  if (reached === 1) {
    const returnedAt = addHours(t.actualArrival, route.typicalDurationHours + 4);
    if (new Date(returnedAt) < new Date(ts(TODAY, 12, 0))) {
      const back = d + int(5, 40);
      v._odo += back;
      v._sinceFuel += back;
      const base = t.origin.city === 'Beira' ? 'Beira' : t.destination.city;
      addFuel({ v, trip: t, stamp: returnedAt, city: base, km: v._sinceFuel, driverId: t.driverId });
      v._sinceFuel = 0;
    }
  }

  // Direct trip expenses
  const depDate = dateOf(t.actualDeparture);
  const days = Math.max(1, Math.ceil((route.typicalDurationHours + (route.crossBorder ? 8 : 2)) / 12));
  const recent = daysBetween(depDate, TODAY) <= 6;
  if (d >= 500) {
    const crossBorder = route.crossBorder;
    addExpense({
      date: depDate,
      category: 'driver_allowance',
      amount: crossBorder ? days * 35 : days * 1500,
      currency: crossBorder ? 'USD' : 'MZN',
      vehicleId: v.id,
      tripId: t.id,
      driverId: t.driverId,
      vendor: 'Kuyenda Transportes — Tesouraria',
      description: `Ajudas de custo — ${days} ${days === 1 ? 'dia' : 'dias'}`,
      paymentMethod: 'mobile_money',
      status: recent && rand() > 0.5 ? 'pending' : 'approved',
    });
  }
  if (route.crossBorder) {
    const isZa = route.destination.country === 'ZA';
    addExpense({
      date: addDays(depDate, 1),
      category: 'border_fees',
      amount: isZa ? int(2600, 3200) : int(140, 260),
      currency: isZa ? 'ZAR' : 'USD',
      vehicleId: v.id,
      tripId: t.id,
      driverId: t.driverId,
      vendor: `Agente de Despacho — ${route.borderPost.split(' / ')[0]}`,
      description: 'Taxas fronteiriças, despacho aduaneiro e licença de trânsito.',
      paymentMethod: 'bank_transfer',
      status: recent && rand() > 0.6 ? 'pending' : 'approved',
    });
  } else if (d >= 500) {
    addExpense({
      date: depDate,
      category: 'tolls',
      amount: d > 1000 ? 4850 : 2400,
      currency: 'MZN',
      vehicleId: v.id,
      tripId: t.id,
      driverId: t.driverId,
      vendor: d > 1000 ? 'Portagens EN1 — Maputo' : 'Portagem EN6 — Dondo',
      description: 'Portagens do percurso (ida).',
      paymentMethod: 'company_card',
    });
  }
});

// Delay-related costs make the delayed trips visibly less profitable.
const jnbDelayed = trips.find((t) => t.status === 'delayed' && t.routeId === 'r-bei-jnb');
addExpense({ date: '2026-10-21', category: 'repairs', amount: 38500, currency: 'MZN', vehicleId: jnbDelayed.vehicleId, tripId: jnbDelayed.id, driverId: jnbDelayed.driverId, vendor: 'Oficina Móvel Xai-Xai', description: 'Reboque e reparação de emergência do sistema de travagem.', paymentMethod: 'bank_transfer', status: 'pending' });
addExpense({ date: '2026-10-22', category: 'parking', amount: 1800, currency: 'MZN', vehicleId: jnbDelayed.vehicleId, tripId: jnbDelayed.id, driverId: jnbDelayed.driverId, vendor: 'Parque de Camiões Xai-Xai', description: 'Parqueamento vigiado durante a imobilização (3 noites).', status: 'pending' });
const blyDelayed = trips.find((t) => t.status === 'delayed' && t.routeId === 'r-bei-bly');
addExpense({ date: '2026-10-22', category: 'parking', amount: 45, currency: 'USD', vehicleId: blyDelayed.vehicleId, tripId: blyDelayed.id, driverId: blyDelayed.driverId, vendor: 'Parque Fronteiriço de Zóbuè', description: 'Parqueamento na fila da fronteira.', status: 'approved' });
const mutDelayed = trips.find((t) => t.status === 'delayed' && t.routeId === 'r-bei-mut');
addExpense({ date: '2026-10-23', category: 'fines', amount: 120, currency: 'USD', vehicleId: mutDelayed.vehicleId, tripId: mutDelayed.id, driverId: mutDelayed.driverId, vendor: 'Autoridade Tributária — Machipanda', description: 'Multa por documentação aduaneira incompleta.', status: 'rejected' });

// Fleet-level (non-trip) costs
addExpense({ date: '2026-06-02', category: 'insurance', amount: 186000, currency: 'MZN', vehicleId: 'v07', vendor: 'Seguradora Pungué (fictícia)', description: 'Prémio anual — seguro de responsabilidade civil e mercadorias.', paymentMethod: 'bank_transfer' });
addExpense({ date: '2026-08-20', category: 'permits', amount: 650, currency: 'USD', vehicleId: 'v01', vendor: 'Ministério dos Transportes (Zimbabwe)', description: 'Licença de transporte rodoviário internacional — renovação.', paymentMethod: 'bank_transfer' });
addExpense({ date: '2026-09-11', category: 'fines', amount: 4000, currency: 'MZN', vehicleId: 'v13', driverId: 'd13', vendor: 'PRM — Polícia de Trânsito', description: 'Multa por excesso de velocidade em Nhamatanda.', status: 'approved' });
addExpense({ date: '2026-10-20', category: 'tyres', amount: 12400, currency: 'ZAR', vehicleId: 'v15', vendor: 'Truck Tyres Mbombela (Pty) Ltd', description: 'Jogo de pneus de direcção (importação).', paymentMethod: 'bank_transfer', status: 'pending' });
addExpense({ date: '2026-10-23', category: 'other', amount: 7600, currency: 'MZN', vehicleId: 'v26', vendor: 'Ferragem Munhava', description: 'Material de amarração e lonas de reserva.', paymentMethod: 'cash', status: 'pending' });

// Local refuels for vehicles without long-haul trips (light vehicle, tippers, rigid trucks).
[
  ['v26', '2026-08-03', 'Chimoio', 460], ['v26', '2026-10-06', 'Beira', 510],
  ['v25', '2026-09-30', 'Dondo', 820], ['v24', '2026-10-15', 'Dondo', 640],
].forEach(([id, date, city, km]) => {
  const v = vehicle(id);
  v._odo += km;
  addFuel({ v, trip: null, stamp: ts(date, int(7, 16), int(0, 59)), city, km: km + v._sinceFuel, driverId: v.assignedDriverId });
  v._sinceFuel = 0;
});

// Odometer readings after replay, rounded to the vehicle record.
vehicles.forEach((v) => {
  v.odometerKm = Math.round(v._odo + v._sinceFuel * 0.1);
});

// Inconsistent readings for the fuel-anomaly UI. They are flagged for review, never labelled as fraud.
fuelRecords.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
fuelRecords.forEach((f, i) => (f.reference = `ABS-${pad(i + 2101, 5)}`));
const byVehicle = (id) => fuelRecords.filter((f) => f.vehicleId === id);
{
  const recs = byVehicle('v03');
  const r = recs[Math.floor(recs.length / 2)];
  r.odometerKm -= 10000;
  r.notes = 'Leitura do conta-quilómetros introduzida manualmente.';
}
{
  const recs = byVehicle('v08');
  const r = recs[recs.length - 1];
  r.litres = vehicle('v08').tankCapacityL + 120;
  r.totalAmount.amount = round(r.litres * r.pricePerLitre.amount, 2);
}
{
  const recs = byVehicle('v07');
  const r = recs[recs.length - 1];
  r.litres = round(r.litres * 1.42, 1);
  r.totalAmount.amount = round(r.litres * r.pricePerLitre.amount, 2);
}
{
  const recs = byVehicle('v11');
  const r = recs[recs.length - 1];
  r.fullTank = false;
  r.notes = 'Abastecimento parcial — bomba com limite de volume.';
}

// ---------------------------------------------------------------- maintenance
const workshops = ['Oficina Própria — Munhava', 'Diesel Centro Beira, Lda', 'Auto Pneus Dondo', 'Electro Auto Manga', 'Chimoio Truck Service', 'Oficina Pesados Inhamízua'];
let woSeq = 0;
const maintenanceRecords = [];
function addMaintenance({ vehicleId, type, status, plannedDate, description, workshop, partsCost, labourCost, downtimeHours, currency = 'MZN', startedDate = null, completedDate = null, notes = '' }) {
  woSeq += 1;
  const v = vehicle(vehicleId);
  const preventive = type === 'preventive';
  const odo = status === 'completed' ? Math.round(v.odometerKm - daysBetween(completedDate, TODAY) * 260) : v.odometerKm;
  maintenanceRecords.push({
    id: `m${pad(woSeq, 3)}`,
    organizationId: ORG_ID,
    workOrderNumber: `OT-2026-${pad(woSeq + 140, 4)}`,
    vehicleId,
    type,
    status,
    description,
    workshop,
    odometerKm: odo,
    plannedDate,
    startedDate,
    completedDate,
    currency,
    partsCost,
    labourCost,
    downtimeHours,
    nextServiceKm: preventive && status === 'completed' ? odo + 30000 : null,
    nextServiceDate: preventive && status === 'completed' ? addDays(completedDate, 120) : null,
    notes,
    createdAt: ts(addDays(plannedDate, -int(5, 20)), 10),
    updatedAt: ts(completedDate ?? startedDate ?? addDays(plannedDate, -2), 15),
  });
}
const completedPlan = [
  ['v01', 'preventive', '2026-05-18', 'Revisão 30 000 km: óleo, filtros e lubrificação.', 0, 38200, 9600, 10],
  ['v04', 'tyres', '2026-05-29', 'Substituição de 4 pneus de tracção.', 2, 168400, 6200, 8],
  ['v09', 'corrective', '2026-06-08', 'Substituição de embraiagem.', 4, 96500, 28400, 52],
  ['v02', 'preventive', '2026-06-22', 'Revisão 30 000 km e afinação de travões.', 1, 41800, 11200, 12],
  ['v07', 'electrical', '2026-07-06', 'Diagnóstico e reparação do alternador.', 3, 27600, 8900, 14],
  ['v13', 'bodywork', '2026-07-19', 'Reparação de pára-choques e degrau da cabine.', 5, 18900, 14600, 20],
  ['v05', 'preventive', '2026-07-30', 'Revisão 60 000 km: óleo de caixa e diferencial.', 0, 64300, 15800, 16],
  ['v08', 'corrective', '2026-08-14', 'Reparação de fuga no sistema de arrefecimento.', 1, 2950, 1100, 30, 'ZAR'],
  ['v11', 'inspection', '2026-08-27', 'Inspecção periódica obrigatória.', 0, 0, 4500, 4],
  ['v03', 'preventive', '2026-09-07', 'Revisão 30 000 km e substituição de correias.', 1, 45200, 10400, 12],
  ['v12', 'corrective', '2026-09-18', 'Substituição de bomba injectora.', 4, 122000, 24600, 60],
  ['v06', 'tyres', '2026-10-03', 'Alinhamento e substituição de 2 pneus de direcção.', 2, 71800, 5400, 6],
];
completedPlan.forEach(([vehicleId, type, plannedDate, description, workshopIdx, partsCost, labourCost, downtimeHours, currency = 'MZN']) => {
  const completedDate = addDays(plannedDate, Math.ceil(downtimeHours / 24));
  addMaintenance({ vehicleId, type, status: 'completed', plannedDate, description, workshop: workshops[workshopIdx], partsCost, labourCost, downtimeHours, currency, startedDate: plannedDate, completedDate });
});
addMaintenance({ vehicleId: 'v01', type: 'corrective', status: 'completed', plannedDate: '2026-09-28', description: 'Reparação da suspensão após a viagem a Mutare.', workshop: 'Harare Heavy Diesel (Pvt) Ltd', partsCost: 640, labourCost: 210, downtimeHours: 18, currency: 'USD', startedDate: '2026-09-28', completedDate: '2026-09-29', notes: 'Reparação feita no destino para evitar regresso sem carga.' });
addMaintenance({ vehicleId: 'v14', type: 'corrective', status: 'in_progress', plannedDate: '2026-10-20', startedDate: '2026-10-20', description: 'Revisão da caixa de velocidades — ruído na 3.ª mudança.', workshop: workshops[1], partsCost: 148000, labourCost: 36000, downtimeHours: 96 });
addMaintenance({ vehicleId: 'v15', type: 'tyres', status: 'in_progress', plannedDate: '2026-10-22', startedDate: '2026-10-22', description: 'Substituição de pneus de direcção e pastilhas de travão.', workshop: workshops[2], partsCost: 58600, labourCost: 7400, downtimeHours: 30, notes: 'Pneus importados — ver despesa DSP correspondente.' });
addMaintenance({ vehicleId: 'v16', type: 'preventive', status: 'in_progress', plannedDate: '2026-10-23', startedDate: '2026-10-23', description: 'Revisão 150 000 km com substituição de embraiagem.', workshop: workshops[0], partsCost: 112000, labourCost: 22000, downtimeHours: 48 });
addMaintenance({ vehicleId: 'v05', type: 'preventive', status: 'scheduled', plannedDate: '2026-10-18', description: 'Revisão 90 000 km: óleo, filtros e verificação de travões.', workshop: workshops[0], partsCost: 46000, labourCost: 11000, downtimeHours: 12, notes: 'Adiada por necessidade operacional.' });
addMaintenance({ vehicleId: 'v19', type: 'inspection', status: 'scheduled', plannedDate: '2026-10-15', description: 'Inspecção periódica obrigatória.', workshop: 'Centro de Inspecção Beira', partsCost: 0, labourCost: 4500, downtimeHours: 4 });
addMaintenance({ vehicleId: 'v22', type: 'inspection', status: 'scheduled', plannedDate: '2026-10-29', description: 'Inspecção da cisterna e certificado de estanquidade.', workshop: 'Centro de Inspecção Beira', partsCost: 0, labourCost: 9800, downtimeHours: 6 });
addMaintenance({ vehicleId: 'v01', type: 'preventive', status: 'scheduled', plannedDate: '2026-10-29', description: 'Revisão 60 000 km após regresso de Harare.', workshop: workshops[0], partsCost: 52000, labourCost: 12500, downtimeHours: 14 });
addMaintenance({ vehicleId: 'v04', type: 'electrical', status: 'scheduled', plannedDate: '2026-11-05', description: 'Verificação do sistema de iluminação do semi-reboque.', workshop: workshops[3], partsCost: 8600, labourCost: 3200, downtimeHours: 4 });
addMaintenance({ vehicleId: 'v12', type: 'preventive', status: 'scheduled', plannedDate: '2026-11-10', description: 'Revisão 30 000 km.', workshop: workshops[4], partsCost: 39000, labourCost: 9800, downtimeHours: 10 });
addMaintenance({ vehicleId: 'v17', type: 'bodywork', status: 'cancelled', plannedDate: '2026-09-15', description: 'Pintura da cabine — cancelada (viatura retirada de operação).', workshop: workshops[5], partsCost: 0, labourCost: 0, downtimeHours: 0 });
maintenanceRecords.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
vehicles.forEach((v) => {
  const service = maintenanceRecords.filter((m) => m.vehicleId === v.id && m.status === 'in_progress')[0];
  if (service) {
    v.statusHistory.push({ date: service.startedDate, from: 'available', to: 'maintenance', reason: `Ordem de trabalho ${service.workOrderNumber}` });
  }
  if (v.status === 'in_transit') {
    const trip = trips.find((t) => t.vehicleId === v.id && ['in_transit', 'delayed'].includes(t.status));
    v.statusHistory.push({ date: dateOf(trip.actualDeparture), from: 'available', to: 'in_transit', reason: `Viagem ${trip.reference}` });
  }
});
vehicle('v17').statusHistory.push({ date: '2026-09-12', from: 'available', to: 'inactive', reason: 'Retirada de operação para avaliação de venda.' });
vehicle('v09').statusHistory.unshift({ date: '2026-06-08', from: 'available', to: 'maintenance', reason: 'Substituição de embraiagem' }, { date: '2026-06-11', from: 'maintenance', to: 'available', reason: 'Trabalho concluído' });

// ---------------------------------------------------------------- driver incidents
drivers[6].incidents.push({ id: 'inc01', date: '2026-07-14', type: 'late_delivery', severity: 'low', description: 'Entrega em Blantyre com 9 h de atraso por espera na fronteira.', tripId: trips.find((t) => t.routeId === 'r-bei-bly' && t.vehicleId === 'v07')?.id ?? null });
drivers[12].incidents.push({ id: 'inc02', date: '2026-09-11', type: 'speeding', severity: 'medium', description: 'Excesso de velocidade registado pela PRM em Nhamatanda (92 km/h em zona de 60).', tripId: null });
drivers[7].incidents.push({ id: 'inc03', date: '2026-10-21', type: 'other', severity: 'medium', description: 'Avaria de travões em viagem; viatura imobilizada em segurança.', tripId: jnbDelayed.id });
drivers[2].incidents.push({ id: 'inc04', date: '2026-05-30', type: 'cargo_damage', severity: 'low', description: 'Duas paletes danificadas na descarga em Lusaka; reclamação resolvida.', tripId: null });
drivers[19].incidents.push({ id: 'inc05', date: '2026-08-02', type: 'accident', severity: 'high', description: 'Colisão ligeira em manobra no parque do porto. Sem feridos.', tripId: null });

// ---------------------------------------------------------------- documents
const documents = [];
let docSeq = 0;
function addDocument({ type, title, entityType, entityId, issuer, issueDate, expiryDate = null, file = true, notes = '' }) {
  docSeq += 1;
  documents.push({
    id: `doc${pad(docSeq, 3)}`,
    organizationId: ORG_ID,
    reference: `DOC-${pad(docSeq + 880, 5)}`,
    type,
    title,
    entityType,
    entityId,
    issuer,
    issueDate,
    expiryDate,
    fileName: file ? `${type.replace(/_/g, '-')}-${pad(docSeq + 880, 5)}.pdf` : null,
    fileSizeKb: file ? int(120, 2400) : null,
    notes,
    createdAt: ts(issueDate, 10),
    updatedAt: ts(issueDate, 10),
  });
}
const plateOf = (id) => vehicle(id).plateNumber;
[
  ['v01', 120], ['v02', 18], ['v03', 240], ['v04', -6], ['v05', 75], ['v07', 9], ['v08', 300], ['v10', 160],
].forEach(([id, days]) => addDocument({ type: 'insurance', title: `Seguro — ${plateOf(id)}`, entityType: 'vehicle', entityId: id, issuer: 'Seguradora Pungué (fictícia)', issueDate: addDays(TODAY, days - 365), expiryDate: addDays(TODAY, days) }));
[['v01', 41], ['v03', -3], ['v07', 26], ['v08', 190]].forEach(([id, days]) =>
  addDocument({ type: 'cross_border_permit', title: `Licença de transporte internacional — ${plateOf(id)}`, entityType: 'vehicle', entityId: id, issuer: 'INATRO', issueDate: addDays(TODAY, days - 365), expiryDate: addDays(TODAY, days) }));
[['v02', 210], ['v06', 140], ['v19', -9]].forEach(([id, days]) =>
  addDocument({ type: 'inspection', title: `Inspecção periódica — ${plateOf(id)}`, entityType: 'vehicle', entityId: id, issuer: 'Centro de Inspecção Beira', issueDate: addDays(TODAY, days - 365), expiryDate: addDays(TODAY, days) }));
addDocument({ type: 'vehicle_registration', title: `Livrete — ${plateOf('v10')}`, entityType: 'vehicle', entityId: 'v10', issuer: 'INATRO', issueDate: '2023-04-11' });
addDocument({ type: 'road_tax', title: `Imposto sobre veículos 2026 — ${plateOf('v05')}`, entityType: 'vehicle', entityId: 'v05', issuer: 'Autoridade Tributária', issueDate: '2026-01-20', expiryDate: '2026-12-31' });
addDocument({ type: 'driver_licence', title: `Carta de condução — ${drivers[4].firstName} ${drivers[4].lastName}`, entityType: 'driver', entityId: 'd05', issuer: 'INATRO', issueDate: addDays(drivers[4].licenceExpiry, -1826), expiryDate: drivers[4].licenceExpiry });
addDocument({ type: 'driver_licence', title: `Carta de condução — ${drivers[10].firstName} ${drivers[10].lastName}`, entityType: 'driver', entityId: 'd11', issuer: 'INATRO', issueDate: addDays(drivers[10].licenceExpiry, -1826), expiryDate: drivers[10].licenceExpiry });
addDocument({ type: 'driver_licence', title: `Carta de condução — ${drivers[19].firstName} ${drivers[19].lastName}`, entityType: 'driver', entityId: 'd20', issuer: 'INATRO', issueDate: '2021-08-31', expiryDate: drivers[19].licenceExpiry });
addDocument({ type: 'driver_licence', title: `Carta de condução — ${drivers[0].firstName} ${drivers[0].lastName}`, entityType: 'driver', entityId: 'd01', issuer: 'INATRO', issueDate: addDays(drivers[0].licenceExpiry, -1826), expiryDate: drivers[0].licenceExpiry });
addDocument({ type: 'medical_certificate', title: `Atestado médico — ${drivers[2].firstName} ${drivers[2].lastName}`, entityType: 'driver', entityId: 'd03', issuer: 'Clínica Ocupacional Beira', issueDate: addDays(TODAY, -340), expiryDate: addDays(TODAY, 25) });
addDocument({ type: 'medical_certificate', title: `Atestado médico — ${drivers[7].firstName} ${drivers[7].lastName}`, entityType: 'driver', entityId: 'd08', issuer: 'Clínica Ocupacional Beira', issueDate: addDays(TODAY, -120), expiryDate: addDays(TODAY, 245) });
addDocument({ type: 'inspection', title: `Inspecção do semi-reboque — ${trailers[2].plateNumber}`, entityType: 'trailer', entityId: 't03', issuer: 'Centro de Inspecção Beira', issueDate: addDays(trailers[2].inspectionExpiry, -365), expiryDate: trailers[2].inspectionExpiry });
addDocument({ type: 'inspection', title: `Inspecção do semi-reboque — ${trailers[8].plateNumber}`, entityType: 'trailer', entityId: 't09', issuer: 'Centro de Inspecção Beira', issueDate: addDays(trailers[8].inspectionExpiry, -365), expiryDate: trailers[8].inspectionExpiry });
const hreActive = trips.find((t) => t.status === 'in_transit' && t.routeId === 'r-bei-hre');
addDocument({ type: 'waybill', title: `Guia de remessa — ${hreActive.reference}`, entityType: 'trip', entityId: hreActive.id, issuer: 'Kuyenda Transportes', issueDate: dateOf(hreActive.plannedDeparture) });
addDocument({ type: 'customs_declaration', title: `Documento Único (DU) — ${mutDelayed.reference}`, entityType: 'trip', entityId: mutDelayed.id, issuer: 'Autoridade Tributária — Alfândegas', issueDate: dateOf(mutDelayed.plannedDeparture), notes: 'Falta a factura comercial assinada pelo exportador.' });
const chiDelivered = trips.find((t) => t.status === 'delivered' && t.routeId === 'r-bei-chi');
addDocument({ type: 'delivery_note', title: `Guia de entrega assinada — ${chiDelivered.reference}`, entityType: 'trip', entityId: chiDelivered.id, issuer: customers.find((c) => c.id === chiDelivered.customerId).name, issueDate: dateOf(chiDelivered.actualArrival) });
addDocument({ type: 'contract', title: 'Contrato de transporte 2026 — Moatize Carvão & Minerais', entityType: 'customer', entityId: 'c01', issuer: 'Kuyenda Transportes', issueDate: '2026-01-05', expiryDate: '2026-12-31' });
addDocument({ type: 'contract', title: 'Acordo-quadro de serviços — Mabvazuva Freight', entityType: 'customer', entityId: 'c05', issuer: 'Kuyenda Transportes', issueDate: '2025-11-10', expiryDate: addDays(TODAY, 17), notes: 'Renovação em negociação.' });
addDocument({ type: 'waybill', title: `Guia de remessa — ${jnbDelayed.reference}`, entityType: 'trip', entityId: jnbDelayed.id, issuer: 'Kuyenda Transportes', issueDate: dateOf(jnbDelayed.plannedDeparture), file: false, notes: 'Cópia digital por carregar.' });

// ---------------------------------------------------------------- customer balances (demonstration only)
customers.forEach((c) => {
  const recent = trips.filter((t) => t.customerId === c.id && ['delivered', 'completed'].includes(t.status) && t.revenue.currency === c.preferredCurrency && daysBetween(dateOf(t.actualArrival), TODAY) <= c.paymentTermsDays + 15);
  c.outstandingBalance.amount = round(recent.reduce((sum, t) => sum + t.revenue.amount, 0), 2);
});

// ---------------------------------------------------------------- notifications
const anomalyRecord = fuelRecords.find((f) => f.vehicleId === 'v08' && f.litres > vehicle('v08').tankCapacityL);
const expiringInsurance = documents.find((d) => d.type === 'insurance' && d.entityId === 'v07');
const expiredPermit = documents.find((d) => d.type === 'cross_border_permit' && d.entityId === 'v03');
const overdue = maintenanceRecords.find((m) => m.vehicleId === 'v05' && m.status === 'scheduled');
const upcoming = maintenanceRecords.find((m) => m.vehicleId === 'v22' && m.status === 'scheduled');
const pendingCount = expenses.filter((e) => e.approvalStatus === 'pending').length;
const n = (i, category, severity, key, params, hoursAgo, read, link) => ({
  id: `n${pad(i, 3)}`,
  organizationId: ORG_ID,
  category,
  severity,
  titleKey: `notifications.messages.${key}.title`,
  messageKey: `notifications.messages.${key}.body`,
  params,
  createdAt: addHours(ts(TODAY, 12, 0), -hoursAgo),
  read,
  link,
});
const notifications = [
  n(1, 'trip_delay', 'critical', 'tripDelayed', { trip: jnbDelayed.reference, route: 'Beira → Joanesburgo' }, 1.5, false, ['/trips', jnbDelayed.id]),
  n(2, 'trip_delay', 'warning', 'tripDelayed', { trip: mutDelayed.reference, route: 'Beira → Mutare' }, 4, false, ['/trips', mutDelayed.id]),
  n(3, 'fuel_anomaly', 'warning', 'fuelAnomaly', { vehicle: plateOf('v08'), record: anomalyRecord.reference }, 6, false, ['/fuel'], ),
  n(4, 'expense_approval', 'info', 'expensesPending', { count: pendingCount }, 8, false, ['/expenses']),
  n(5, 'document', 'critical', 'documentExpired', { document: expiredPermit.title }, 20, false, ['/documents']),
  n(6, 'document', 'warning', 'documentExpiring', { document: expiringInsurance.title, days: 9 }, 26, false, ['/documents']),
  n(7, 'maintenance', 'warning', 'maintenanceOverdue', { vehicle: plateOf('v05'), workOrder: overdue.workOrderNumber }, 30, true, ['/maintenance']),
  n(8, 'maintenance', 'info', 'maintenanceUpcoming', { vehicle: plateOf('v22'), workOrder: upcoming.workOrderNumber, date: upcoming.plannedDate }, 34, true, ['/maintenance']),
  n(9, 'trip_delay', 'warning', 'tripDelayed', { trip: blyDelayed.reference, route: 'Beira → Blantyre' }, 46, true, ['/trips', blyDelayed.id]),
  n(10, 'document', 'warning', 'licenceExpiring', { driver: `${drivers[4].firstName} ${drivers[4].lastName}`, days: 15 }, 52, true, ['/drivers', 'd05']),
  n(11, 'maintenance', 'info', 'maintenanceStarted', { vehicle: plateOf('v16'), workOrder: maintenanceRecords.find((m) => m.vehicleId === 'v16').workOrderNumber }, 28, true, ['/vehicles', 'v16']),
  n(12, 'system', 'info', 'userInvited', { user: 'Dércio Bila' }, 72, true, ['/users']),
  n(13, 'fuel_anomaly', 'info', 'fuelAnomaly', { vehicle: plateOf('v03'), record: fuelRecords.find((f) => f.notes.startsWith('Leitura')).reference }, 96, true, ['/fuel']),
  n(14, 'document', 'warning', 'documentExpired', { document: documents.find((d) => d.entityId === 'v19' && d.type === 'inspection').title }, 120, true, ['/documents']),
];

// ---------------------------------------------------------------- write
const clean = (list) => list.map((item) => Object.fromEntries(Object.entries(item).filter(([k]) => !k.startsWith('_') && k !== 'preferredRoutes')));
const routesOut = routes.map(({ revenue, waypoints, ...r }) => r);
const files = {
  'organizations.json': [organization],
  'users.json': users,
  'routes.json': routesOut,
  'vehicles.json': clean(vehicles),
  'drivers.json': drivers,
  'trailers.json': trailers,
  'customers.json': clean(customers),
  'trips.json': clean(trips),
  'fuel-records.json': fuelRecords,
  'expenses.json': expenses.sort((a, b) => a.date.localeCompare(b.date)),
  'maintenance-records.json': maintenanceRecords,
  'documents.json': documents,
  'notifications.json': notifications,
};
mkdirSync(OUT_DIR, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${name.padEnd(28)} ${Array.isArray(data) ? data.length : 1}`);
}
