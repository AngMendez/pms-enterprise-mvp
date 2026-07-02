import { createSeedData } from "./seed.js";
import { createRepository } from "./repository.js";

function sslConfig() {
  if (process.env.PGSSLMODE === "disable") return false;
  return process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false };
}

const ddl = `
CREATE TABLE IF NOT EXISTS pms_migration (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_holding (
  id text PRIMARY KEY,
  name text NOT NULL,
  base_currency char(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS pms_property (
  id text PRIMARY KEY,
  holding_id text NOT NULL REFERENCES pms_holding(id),
  code text NOT NULL,
  name text NOT NULL,
  property_type text NOT NULL,
  timezone text NOT NULL,
  default_currency char(3) NOT NULL,
  business_date date NOT NULL,
  UNIQUE (holding_id, code)
);

CREATE TABLE IF NOT EXISTS pms_room_type (
  id text PRIMARY KEY,
  property_id text NOT NULL REFERENCES pms_property(id),
  code text NOT NULL,
  name text NOT NULL,
  max_occupancy int NOT NULL,
  base_adults int NOT NULL,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS pms_room (
  id text PRIMARY KEY,
  property_id text NOT NULL REFERENCES pms_property(id),
  room_type_id text NOT NULL REFERENCES pms_room_type(id),
  room_number text NOT NULL,
  floor text,
  status text NOT NULL,
  version int NOT NULL DEFAULT 1,
  UNIQUE (property_id, room_number)
);

CREATE TABLE IF NOT EXISTS pms_rate_plan (
  id text PRIMARY KEY,
  property_id text NOT NULL REFERENCES pms_property(id),
  code text NOT NULL,
  name text NOT NULL,
  currency char(3) NOT NULL,
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS pms_rate_rule (
  id text PRIMARY KEY,
  rate_plan_id text NOT NULL REFERENCES pms_rate_plan(id),
  room_type_id text NOT NULL REFERENCES pms_room_type(id),
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  amount numeric(14,2) NOT NULL,
  tax_rate numeric(7,4) NOT NULL DEFAULT 0,
  min_los int,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  stop_sell boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS pms_inventory_day (
  id text PRIMARY KEY,
  property_id text NOT NULL REFERENCES pms_property(id),
  room_type_id text NOT NULL REFERENCES pms_room_type(id),
  stay_date date NOT NULL,
  physical_count int NOT NULL,
  out_of_order_count int NOT NULL DEFAULT 0,
  reserved_count int NOT NULL DEFAULT 0,
  overbooking_limit int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  UNIQUE (property_id, room_type_id, stay_date),
  CHECK (reserved_count <= physical_count - out_of_order_count + overbooking_limit)
);

CREATE TABLE IF NOT EXISTS pms_guest (
  id text PRIMARY KEY,
  holding_id text NOT NULL REFERENCES pms_holding(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  document_type text,
  document_number text,
  language_code text,
  vip_level text,
  risk_status text,
  gdpr_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_reservation (
  id text PRIMARY KEY,
  property_id text NOT NULL REFERENCES pms_property(id),
  confirmation_number text NOT NULL,
  status text NOT NULL,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  room_type_id text NOT NULL REFERENCES pms_room_type(id),
  rate_plan_id text NOT NULL REFERENCES pms_rate_plan(id),
  source text NOT NULL,
  adults int NOT NULL DEFAULT 1,
  children int NOT NULL DEFAULT 0,
  guest_name text,
  guest_email text,
  guarantee_type text,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, confirmation_number)
);

CREATE TABLE IF NOT EXISTS pms_reservation_night (
  id text PRIMARY KEY,
  reservation_id text NOT NULL REFERENCES pms_reservation(id),
  stay_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL,
  UNIQUE (reservation_id, stay_date)
);

CREATE TABLE IF NOT EXISTS pms_stay (
  id text PRIMARY KEY,
  reservation_id text NOT NULL REFERENCES pms_reservation(id),
  property_id text NOT NULL REFERENCES pms_property(id),
  status text NOT NULL,
  checked_in_at timestamptz,
  checked_out_at timestamptz
);

CREATE TABLE IF NOT EXISTS pms_room_assignment (
  id text PRIMARY KEY,
  stay_id text NOT NULL REFERENCES pms_stay(id),
  room_id text NOT NULL REFERENCES pms_room(id),
  assigned_from date NOT NULL,
  assigned_to date NOT NULL,
  is_current boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pms_folio (
  id text PRIMARY KEY,
  stay_id text REFERENCES pms_stay(id),
  property_id text NOT NULL REFERENCES pms_property(id),
  folio_type text NOT NULL,
  status text NOT NULL,
  currency char(3) NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS pms_folio_transaction (
  id text PRIMARY KEY,
  folio_id text NOT NULL REFERENCES pms_folio(id),
  property_id text NOT NULL REFERENCES pms_property(id),
  business_date date NOT NULL,
  transaction_type text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency char(3) NOT NULL,
  source_module text NOT NULL,
  source_reference text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  voids_transaction_id text
);

CREATE TABLE IF NOT EXISTS pms_audit_event (
  id text PRIMARY KEY,
  holding_id text NOT NULL REFERENCES pms_holding(id),
  property_id text REFERENCES pms_property(id),
  actor text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_sequence (
  name text PRIMARY KEY,
  value int NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pms_inventory_lookup ON pms_inventory_day (property_id, room_type_id, stay_date);
CREATE INDEX IF NOT EXISTS idx_pms_reservation_dates ON pms_reservation (property_id, arrival_date, departure_date, status);
CREATE INDEX IF NOT EXISTS idx_pms_folio_txn_business_day ON pms_folio_transaction (property_id, business_date, folio_id);
CREATE INDEX IF NOT EXISTS idx_pms_room_status ON pms_room (property_id, room_type_id, status);
`;

const dateOnly = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;
const iso = (value) => value ? new Date(value).toISOString() : null;
const number = (value) => Number(value || 0);

async function hasRows(client) {
  const result = await client.query("SELECT EXISTS (SELECT 1 FROM pms_holding) AS exists");
  return result.rows[0].exists;
}

async function legacyState(client) {
  const table = await client.query("SELECT to_regclass('public.pms_app_state') AS name");
  if (!table.rows[0].name) return null;
  const result = await client.query("SELECT data FROM pms_app_state WHERE state_key = 'default'");
  return result.rows[0]?.data || null;
}

async function loadState(client) {
  const holdingRow = await client.query("SELECT * FROM pms_holding LIMIT 1");
  const holding = holdingRow.rows[0];
  const [
    properties,
    roomTypes,
    rooms,
    ratePlans,
    rateRules,
    inventoryDays,
    guests,
    reservations,
    reservationNights,
    stays,
    roomAssignments,
    folios,
    folioTransactions,
    auditEvents,
    sequences
  ] = await Promise.all([
    client.query("SELECT * FROM pms_property ORDER BY code"),
    client.query("SELECT * FROM pms_room_type ORDER BY code"),
    client.query("SELECT * FROM pms_room ORDER BY room_number"),
    client.query("SELECT * FROM pms_rate_plan ORDER BY code"),
    client.query("SELECT * FROM pms_rate_rule ORDER BY id"),
    client.query("SELECT * FROM pms_inventory_day ORDER BY stay_date, room_type_id"),
    client.query("SELECT * FROM pms_guest ORDER BY created_at"),
    client.query("SELECT * FROM pms_reservation ORDER BY created_at"),
    client.query("SELECT * FROM pms_reservation_night ORDER BY stay_date"),
    client.query("SELECT * FROM pms_stay ORDER BY checked_in_at NULLS LAST"),
    client.query("SELECT * FROM pms_room_assignment ORDER BY assigned_from"),
    client.query("SELECT * FROM pms_folio ORDER BY opened_at"),
    client.query("SELECT * FROM pms_folio_transaction ORDER BY posted_at"),
    client.query("SELECT * FROM pms_audit_event ORDER BY created_at"),
    client.query("SELECT * FROM pms_sequence")
  ]);

  return {
    holding: {
      id: holding.id,
      name: holding.name,
      baseCurrency: holding.base_currency
    },
    properties: properties.rows.map((row) => ({
      id: row.id,
      holdingId: row.holding_id,
      code: row.code,
      name: row.name,
      propertyType: row.property_type,
      timezone: row.timezone,
      defaultCurrency: row.default_currency,
      businessDate: dateOnly(row.business_date)
    })),
    roomTypes: roomTypes.rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      code: row.code,
      name: row.name,
      maxOccupancy: row.max_occupancy,
      baseAdults: row.base_adults
    })),
    rooms: rooms.rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      roomTypeId: row.room_type_id,
      roomNumber: row.room_number,
      floor: row.floor,
      status: row.status,
      version: row.version
    })),
    ratePlans: ratePlans.rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      code: row.code,
      name: row.name,
      currency: row.currency
    })),
    rateRules: rateRules.rows.map((row) => ({
      id: row.id,
      ratePlanId: row.rate_plan_id,
      roomTypeId: row.room_type_id,
      validFrom: dateOnly(row.valid_from),
      validTo: dateOnly(row.valid_to),
      amount: number(row.amount),
      taxRate: number(row.tax_rate),
      minLos: row.min_los,
      closedToArrival: row.closed_to_arrival,
      closedToDeparture: row.closed_to_departure,
      stopSell: row.stop_sell
    })),
    inventoryDays: inventoryDays.rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      roomTypeId: row.room_type_id,
      stayDate: dateOnly(row.stay_date),
      physicalCount: row.physical_count,
      outOfOrderCount: row.out_of_order_count,
      reservedCount: row.reserved_count,
      overbookingLimit: row.overbooking_limit,
      version: row.version
    })),
    guests: guests.rows.map((row) => ({
      id: row.id,
      holdingId: row.holding_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      documentType: row.document_type,
      documentNumber: row.document_number,
      languageCode: row.language_code,
      vipLevel: row.vip_level,
      riskStatus: row.risk_status,
      gdprConsentAt: iso(row.gdpr_consent_at),
      createdAt: iso(row.created_at)
    })),
    reservations: reservations.rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      confirmationNumber: row.confirmation_number,
      status: row.status,
      arrivalDate: dateOnly(row.arrival_date),
      departureDate: dateOnly(row.departure_date),
      roomTypeId: row.room_type_id,
      ratePlanId: row.rate_plan_id,
      source: row.source,
      adults: row.adults,
      children: row.children,
      guestName: row.guest_name,
      guestEmail: row.guest_email,
      guaranteeType: row.guarantee_type,
      version: row.version,
      createdAt: iso(row.created_at)
    })),
    reservationNights: reservationNights.rows.map((row) => ({
      id: row.id,
      reservationId: row.reservation_id,
      stayDate: dateOnly(row.stay_date),
      amount: number(row.amount),
      taxAmount: number(row.tax_amount),
      currency: row.currency
    })),
    stays: stays.rows.map((row) => ({
      id: row.id,
      reservationId: row.reservation_id,
      propertyId: row.property_id,
      status: row.status,
      checkedInAt: iso(row.checked_in_at),
      checkedOutAt: iso(row.checked_out_at)
    })),
    roomAssignments: roomAssignments.rows.map((row) => ({
      id: row.id,
      stayId: row.stay_id,
      roomId: row.room_id,
      assignedFrom: dateOnly(row.assigned_from),
      assignedTo: dateOnly(row.assigned_to),
      isCurrent: row.is_current
    })),
    folios: folios.rows.map((row) => ({
      id: row.id,
      stayId: row.stay_id,
      propertyId: row.property_id,
      folioType: row.folio_type,
      status: row.status,
      currency: row.currency,
      openedAt: iso(row.opened_at),
      closedAt: iso(row.closed_at)
    })),
    folioTransactions: folioTransactions.rows.map((row) => ({
      id: row.id,
      folioId: row.folio_id,
      propertyId: row.property_id,
      businessDate: dateOnly(row.business_date),
      transactionType: row.transaction_type,
      description: row.description,
      amount: number(row.amount),
      currency: row.currency,
      sourceModule: row.source_module,
      sourceReference: row.source_reference,
      postedAt: iso(row.posted_at),
      voidsTransactionId: row.voids_transaction_id
    })),
    auditEvents: auditEvents.rows.map((row) => ({
      id: row.id,
      holdingId: row.holding_id,
      propertyId: row.property_id,
      actor: row.actor,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      before: row.before_data,
      after: row.after_data,
      createdAt: iso(row.created_at)
    })),
    sequences: Object.fromEntries(sequences.rows.map((row) => [row.name, row.value]))
  };
}

async function deleteAll(client) {
  for (const table of [
    "pms_audit_event",
    "pms_folio_transaction",
    "pms_folio",
    "pms_room_assignment",
    "pms_stay",
    "pms_reservation_night",
    "pms_reservation",
    "pms_guest",
    "pms_inventory_day",
    "pms_rate_rule",
    "pms_rate_plan",
    "pms_room",
    "pms_room_type",
    "pms_property",
    "pms_holding",
    "pms_sequence"
  ]) {
    await client.query(`DELETE FROM ${table}`);
  }
}

async function insertState(client, state) {
  await client.query("INSERT INTO pms_holding (id, name, base_currency) VALUES ($1, $2, $3)", [
    state.holding.id,
    state.holding.name,
    state.holding.baseCurrency
  ]);

  for (const row of state.properties) {
    await client.query(
      `INSERT INTO pms_property (id, holding_id, code, name, property_type, timezone, default_currency, business_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, row.holdingId, row.code, row.name, row.propertyType, row.timezone, row.defaultCurrency, row.businessDate]
    );
  }

  for (const row of state.roomTypes) {
    await client.query(
      "INSERT INTO pms_room_type (id, property_id, code, name, max_occupancy, base_adults) VALUES ($1, $2, $3, $4, $5, $6)",
      [row.id, row.propertyId, row.code, row.name, row.maxOccupancy, row.baseAdults]
    );
  }

  for (const row of state.rooms) {
    await client.query(
      "INSERT INTO pms_room (id, property_id, room_type_id, room_number, floor, status, version) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [row.id, row.propertyId, row.roomTypeId, row.roomNumber, row.floor, row.status, row.version]
    );
  }

  for (const row of state.ratePlans) {
    await client.query(
      "INSERT INTO pms_rate_plan (id, property_id, code, name, currency) VALUES ($1, $2, $3, $4, $5)",
      [row.id, row.propertyId, row.code, row.name, row.currency]
    );
  }

  for (const row of state.rateRules) {
    await client.query(
      `INSERT INTO pms_rate_rule (id, rate_plan_id, room_type_id, valid_from, valid_to, amount, tax_rate, min_los, closed_to_arrival, closed_to_departure, stop_sell)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [row.id, row.ratePlanId, row.roomTypeId, row.validFrom, row.validTo, row.amount, row.taxRate, row.minLos || null, Boolean(row.closedToArrival), Boolean(row.closedToDeparture), Boolean(row.stopSell)]
    );
  }

  for (const row of state.inventoryDays) {
    await client.query(
      `INSERT INTO pms_inventory_day (id, property_id, room_type_id, stay_date, physical_count, out_of_order_count, reserved_count, overbooking_limit, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, row.propertyId, row.roomTypeId, row.stayDate, row.physicalCount, row.outOfOrderCount, row.reservedCount, row.overbookingLimit, row.version]
    );
  }

  for (const row of state.guests) {
    await client.query(
      `INSERT INTO pms_guest (id, holding_id, first_name, last_name, email, phone, document_type, document_number, language_code, vip_level, risk_status, gdpr_consent_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [row.id, row.holdingId, row.firstName, row.lastName, row.email, row.phone, row.documentType, row.documentNumber, row.languageCode, row.vipLevel, row.riskStatus, row.gdprConsentAt, row.createdAt]
    );
  }

  for (const row of state.reservations) {
    await client.query(
      `INSERT INTO pms_reservation (id, property_id, confirmation_number, status, arrival_date, departure_date, room_type_id, rate_plan_id, source, adults, children, guest_name, guest_email, guarantee_type, version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [row.id, row.propertyId, row.confirmationNumber, row.status, row.arrivalDate, row.departureDate, row.roomTypeId, row.ratePlanId, row.source, row.adults, row.children, row.guestName, row.guestEmail, row.guaranteeType, row.version, row.createdAt]
    );
  }

  for (const row of state.reservationNights) {
    await client.query(
      "INSERT INTO pms_reservation_night (id, reservation_id, stay_date, amount, tax_amount, currency) VALUES ($1, $2, $3, $4, $5, $6)",
      [row.id, row.reservationId, row.stayDate, row.amount, row.taxAmount, row.currency]
    );
  }

  for (const row of state.stays) {
    await client.query(
      "INSERT INTO pms_stay (id, reservation_id, property_id, status, checked_in_at, checked_out_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [row.id, row.reservationId, row.propertyId, row.status, row.checkedInAt, row.checkedOutAt]
    );
  }

  for (const row of state.roomAssignments) {
    await client.query(
      "INSERT INTO pms_room_assignment (id, stay_id, room_id, assigned_from, assigned_to, is_current) VALUES ($1, $2, $3, $4, $5, $6)",
      [row.id, row.stayId, row.roomId, row.assignedFrom, row.assignedTo, row.isCurrent]
    );
  }

  for (const row of state.folios) {
    await client.query(
      "INSERT INTO pms_folio (id, stay_id, property_id, folio_type, status, currency, opened_at, closed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [row.id, row.stayId, row.propertyId, row.folioType, row.status, row.currency, row.openedAt, row.closedAt]
    );
  }

  for (const row of state.folioTransactions) {
    await client.query(
      `INSERT INTO pms_folio_transaction (id, folio_id, property_id, business_date, transaction_type, description, amount, currency, source_module, source_reference, posted_at, voids_transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [row.id, row.folioId, row.propertyId, row.businessDate, row.transactionType, row.description, row.amount, row.currency, row.sourceModule, row.sourceReference, row.postedAt, row.voidsTransactionId]
    );
  }

  for (const row of state.auditEvents) {
    await client.query(
      `INSERT INTO pms_audit_event (id, holding_id, property_id, actor, entity_type, entity_id, action, before_data, after_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [row.id, row.holdingId, row.propertyId, row.actor, row.entityType, row.entityId, row.action, JSON.stringify(row.before), JSON.stringify(row.after), row.createdAt]
    );
  }

  for (const [name, value] of Object.entries(state.sequences)) {
    await client.query("INSERT INTO pms_sequence (name, value) VALUES ($1, $2)", [name, value]);
  }
}

async function saveState(pool, state) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await deleteAll(client);
    await insertState(client, state);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createPostgresRepository() {
  if (!process.env.DATABASE_URL) {
    return { repo: createRepository(), persistence: { enabled: false, mode: "memory", save: async () => {} } };
  }

  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig()
  });

  await pool.query(ddl);

  let initialState;
  if (await hasRows(pool)) {
    initialState = await loadState(pool);
  } else {
    initialState = await legacyState(pool) || createSeedData();
    await saveState(pool, initialState);
  }

  const repo = createRepository(initialState);

  return {
    repo,
    persistence: {
      enabled: true,
      mode: "postgres-relational",
      save: () => saveState(pool, repo.state),
      close: () => pool.end()
    }
  };
}
