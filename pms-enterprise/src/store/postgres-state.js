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
    await upsertState(client, state);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMissing(client, table, ids) {
  if (!ids.length) {
    await client.query(`DELETE FROM ${table}`);
    return;
  }
  await client.query(`DELETE FROM ${table} WHERE NOT (id = ANY($1::text[]))`, [ids]);
}

async function deleteMissingSequence(client, names) {
  if (!names.length) {
    await client.query("DELETE FROM pms_sequence");
    return;
  }
  await client.query("DELETE FROM pms_sequence WHERE NOT (name = ANY($1::text[]))", [names]);
}

async function bulk(client, sql, rows) {
  if (!rows.length) return;
  await client.query(sql, [JSON.stringify(rows)]);
}

async function upsertState(client, state) {
  const tables = [
    ["pms_audit_event", state.auditEvents],
    ["pms_folio_transaction", state.folioTransactions],
    ["pms_folio", state.folios],
    ["pms_room_assignment", state.roomAssignments],
    ["pms_stay", state.stays],
    ["pms_reservation_night", state.reservationNights],
    ["pms_reservation", state.reservations],
    ["pms_guest", state.guests],
    ["pms_inventory_day", state.inventoryDays],
    ["pms_rate_rule", state.rateRules],
    ["pms_rate_plan", state.ratePlans],
    ["pms_room", state.rooms],
    ["pms_room_type", state.roomTypes],
    ["pms_property", state.properties],
    ["pms_holding", [state.holding]]
  ];

  for (const [table, rows] of tables) {
    await deleteMissing(client, table, rows.map((row) => row.id));
  }
  await deleteMissingSequence(client, Object.keys(state.sequences));

  await bulk(client, `
    INSERT INTO pms_holding (id, name, base_currency)
    SELECT id, name, base_currency
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, base_currency char(3))
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, base_currency = EXCLUDED.base_currency
  `, [{ id: state.holding.id, name: state.holding.name, base_currency: state.holding.baseCurrency }]);

  await bulk(client, `
    INSERT INTO pms_property (id, holding_id, code, name, property_type, timezone, default_currency, business_date)
    SELECT id, holding_id, code, name, property_type, timezone, default_currency, business_date::date
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, holding_id text, code text, name text, property_type text, timezone text, default_currency char(3), business_date text)
    ON CONFLICT (id) DO UPDATE SET
      holding_id = EXCLUDED.holding_id, code = EXCLUDED.code, name = EXCLUDED.name,
      property_type = EXCLUDED.property_type, timezone = EXCLUDED.timezone,
      default_currency = EXCLUDED.default_currency, business_date = EXCLUDED.business_date
  `, state.properties.map((row) => ({
    id: row.id, holding_id: row.holdingId, code: row.code, name: row.name,
    property_type: row.propertyType, timezone: row.timezone,
    default_currency: row.defaultCurrency, business_date: row.businessDate
  })));

  await bulk(client, `
    INSERT INTO pms_room_type (id, property_id, code, name, max_occupancy, base_adults)
    SELECT id, property_id, code, name, max_occupancy, base_adults
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, property_id text, code text, name text, max_occupancy int, base_adults int)
    ON CONFLICT (id) DO UPDATE SET
      property_id = EXCLUDED.property_id, code = EXCLUDED.code, name = EXCLUDED.name,
      max_occupancy = EXCLUDED.max_occupancy, base_adults = EXCLUDED.base_adults
  `, state.roomTypes.map((row) => ({
    id: row.id, property_id: row.propertyId, code: row.code, name: row.name,
    max_occupancy: row.maxOccupancy, base_adults: row.baseAdults
  })));

  await bulk(client, `
    INSERT INTO pms_room (id, property_id, room_type_id, room_number, floor, status, version)
    SELECT id, property_id, room_type_id, room_number, floor, status, version
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, property_id text, room_type_id text, room_number text, floor text, status text, version int)
    ON CONFLICT (id) DO UPDATE SET
      property_id = EXCLUDED.property_id, room_type_id = EXCLUDED.room_type_id,
      room_number = EXCLUDED.room_number, floor = EXCLUDED.floor,
      status = EXCLUDED.status, version = EXCLUDED.version
  `, state.rooms.map((row) => ({
    id: row.id, property_id: row.propertyId, room_type_id: row.roomTypeId,
    room_number: row.roomNumber, floor: row.floor, status: row.status, version: row.version
  })));

  await bulk(client, `
    INSERT INTO pms_rate_plan (id, property_id, code, name, currency)
    SELECT id, property_id, code, name, currency
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, property_id text, code text, name text, currency char(3))
    ON CONFLICT (id) DO UPDATE SET
      property_id = EXCLUDED.property_id, code = EXCLUDED.code, name = EXCLUDED.name, currency = EXCLUDED.currency
  `, state.ratePlans.map((row) => ({
    id: row.id, property_id: row.propertyId, code: row.code, name: row.name, currency: row.currency
  })));

  await bulk(client, `
    INSERT INTO pms_rate_rule (id, rate_plan_id, room_type_id, valid_from, valid_to, amount, tax_rate, min_los, closed_to_arrival, closed_to_departure, stop_sell)
    SELECT id, rate_plan_id, room_type_id, valid_from::date, valid_to::date, amount, tax_rate, min_los, closed_to_arrival, closed_to_departure, stop_sell
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, rate_plan_id text, room_type_id text, valid_from text, valid_to text, amount numeric, tax_rate numeric, min_los int, closed_to_arrival boolean, closed_to_departure boolean, stop_sell boolean)
    ON CONFLICT (id) DO UPDATE SET
      rate_plan_id = EXCLUDED.rate_plan_id, room_type_id = EXCLUDED.room_type_id,
      valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to,
      amount = EXCLUDED.amount, tax_rate = EXCLUDED.tax_rate, min_los = EXCLUDED.min_los,
      closed_to_arrival = EXCLUDED.closed_to_arrival, closed_to_departure = EXCLUDED.closed_to_departure,
      stop_sell = EXCLUDED.stop_sell
  `, state.rateRules.map((row) => ({
    id: row.id, rate_plan_id: row.ratePlanId, room_type_id: row.roomTypeId,
    valid_from: row.validFrom, valid_to: row.validTo, amount: row.amount, tax_rate: row.taxRate,
    min_los: row.minLos || null, closed_to_arrival: Boolean(row.closedToArrival),
    closed_to_departure: Boolean(row.closedToDeparture), stop_sell: Boolean(row.stopSell)
  })));

  await bulk(client, `
    INSERT INTO pms_inventory_day (id, property_id, room_type_id, stay_date, physical_count, out_of_order_count, reserved_count, overbooking_limit, version)
    SELECT id, property_id, room_type_id, stay_date::date, physical_count, out_of_order_count, reserved_count, overbooking_limit, version
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, property_id text, room_type_id text, stay_date text, physical_count int, out_of_order_count int, reserved_count int, overbooking_limit int, version int)
    ON CONFLICT (id) DO UPDATE SET
      property_id = EXCLUDED.property_id, room_type_id = EXCLUDED.room_type_id, stay_date = EXCLUDED.stay_date,
      physical_count = EXCLUDED.physical_count, out_of_order_count = EXCLUDED.out_of_order_count,
      reserved_count = EXCLUDED.reserved_count, overbooking_limit = EXCLUDED.overbooking_limit, version = EXCLUDED.version
  `, state.inventoryDays.map((row) => ({
    id: row.id, property_id: row.propertyId, room_type_id: row.roomTypeId, stay_date: row.stayDate,
    physical_count: row.physicalCount, out_of_order_count: row.outOfOrderCount,
    reserved_count: row.reservedCount, overbooking_limit: row.overbookingLimit, version: row.version
  })));

  await bulk(client, `
    INSERT INTO pms_guest (id, holding_id, first_name, last_name, email, phone, document_type, document_number, language_code, vip_level, risk_status, gdpr_consent_at, created_at)
    SELECT id, holding_id, first_name, last_name, email, phone, document_type, document_number, language_code, vip_level, risk_status, gdpr_consent_at::timestamptz, created_at::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, holding_id text, first_name text, last_name text, email text, phone text, document_type text, document_number text, language_code text, vip_level text, risk_status text, gdpr_consent_at text, created_at text)
    ON CONFLICT (id) DO UPDATE SET
      holding_id = EXCLUDED.holding_id, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
      email = EXCLUDED.email, phone = EXCLUDED.phone, document_type = EXCLUDED.document_type,
      document_number = EXCLUDED.document_number, language_code = EXCLUDED.language_code,
      vip_level = EXCLUDED.vip_level, risk_status = EXCLUDED.risk_status,
      gdpr_consent_at = EXCLUDED.gdpr_consent_at, created_at = EXCLUDED.created_at
  `, state.guests.map((row) => ({
    id: row.id, holding_id: row.holdingId, first_name: row.firstName, last_name: row.lastName,
    email: row.email, phone: row.phone, document_type: row.documentType,
    document_number: row.documentNumber, language_code: row.languageCode,
    vip_level: row.vipLevel, risk_status: row.riskStatus,
    gdpr_consent_at: row.gdprConsentAt, created_at: row.createdAt
  })));

  await bulk(client, `
    INSERT INTO pms_reservation (id, property_id, confirmation_number, status, arrival_date, departure_date, room_type_id, rate_plan_id, source, adults, children, guest_name, guest_email, guarantee_type, version, created_at)
    SELECT id, property_id, confirmation_number, status, arrival_date::date, departure_date::date, room_type_id, rate_plan_id, source, adults, children, guest_name, guest_email, guarantee_type, version, created_at::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, property_id text, confirmation_number text, status text, arrival_date text, departure_date text, room_type_id text, rate_plan_id text, source text, adults int, children int, guest_name text, guest_email text, guarantee_type text, version int, created_at text)
    ON CONFLICT (id) DO UPDATE SET
      property_id = EXCLUDED.property_id, confirmation_number = EXCLUDED.confirmation_number,
      status = EXCLUDED.status, arrival_date = EXCLUDED.arrival_date, departure_date = EXCLUDED.departure_date,
      room_type_id = EXCLUDED.room_type_id, rate_plan_id = EXCLUDED.rate_plan_id,
      source = EXCLUDED.source, adults = EXCLUDED.adults, children = EXCLUDED.children,
      guest_name = EXCLUDED.guest_name, guest_email = EXCLUDED.guest_email,
      guarantee_type = EXCLUDED.guarantee_type, version = EXCLUDED.version, created_at = EXCLUDED.created_at
  `, state.reservations.map((row) => ({
    id: row.id, property_id: row.propertyId, confirmation_number: row.confirmationNumber,
    status: row.status, arrival_date: row.arrivalDate, departure_date: row.departureDate,
    room_type_id: row.roomTypeId, rate_plan_id: row.ratePlanId, source: row.source,
    adults: row.adults, children: row.children, guest_name: row.guestName,
    guest_email: row.guestEmail, guarantee_type: row.guaranteeType,
    version: row.version, created_at: row.createdAt
  })));

  await bulk(client, `
    INSERT INTO pms_reservation_night (id, reservation_id, stay_date, amount, tax_amount, currency)
    SELECT id, reservation_id, stay_date::date, amount, tax_amount, currency
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, reservation_id text, stay_date text, amount numeric, tax_amount numeric, currency char(3))
    ON CONFLICT (id) DO UPDATE SET
      reservation_id = EXCLUDED.reservation_id, stay_date = EXCLUDED.stay_date,
      amount = EXCLUDED.amount, tax_amount = EXCLUDED.tax_amount, currency = EXCLUDED.currency
  `, state.reservationNights.map((row) => ({
    id: row.id, reservation_id: row.reservationId, stay_date: row.stayDate,
    amount: row.amount, tax_amount: row.taxAmount, currency: row.currency
  })));

  await bulk(client, `
    INSERT INTO pms_stay (id, reservation_id, property_id, status, checked_in_at, checked_out_at)
    SELECT id, reservation_id, property_id, status, checked_in_at::timestamptz, checked_out_at::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, reservation_id text, property_id text, status text, checked_in_at text, checked_out_at text)
    ON CONFLICT (id) DO UPDATE SET
      reservation_id = EXCLUDED.reservation_id, property_id = EXCLUDED.property_id,
      status = EXCLUDED.status, checked_in_at = EXCLUDED.checked_in_at, checked_out_at = EXCLUDED.checked_out_at
  `, state.stays.map((row) => ({
    id: row.id, reservation_id: row.reservationId, property_id: row.propertyId,
    status: row.status, checked_in_at: row.checkedInAt, checked_out_at: row.checkedOutAt
  })));

  await bulk(client, `
    INSERT INTO pms_room_assignment (id, stay_id, room_id, assigned_from, assigned_to, is_current)
    SELECT id, stay_id, room_id, assigned_from::date, assigned_to::date, is_current
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, stay_id text, room_id text, assigned_from text, assigned_to text, is_current boolean)
    ON CONFLICT (id) DO UPDATE SET
      stay_id = EXCLUDED.stay_id, room_id = EXCLUDED.room_id,
      assigned_from = EXCLUDED.assigned_from, assigned_to = EXCLUDED.assigned_to, is_current = EXCLUDED.is_current
  `, state.roomAssignments.map((row) => ({
    id: row.id, stay_id: row.stayId, room_id: row.roomId,
    assigned_from: row.assignedFrom, assigned_to: row.assignedTo, is_current: row.isCurrent
  })));

  await bulk(client, `
    INSERT INTO pms_folio (id, stay_id, property_id, folio_type, status, currency, opened_at, closed_at)
    SELECT id, stay_id, property_id, folio_type, status, currency, opened_at::timestamptz, closed_at::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, stay_id text, property_id text, folio_type text, status text, currency char(3), opened_at text, closed_at text)
    ON CONFLICT (id) DO UPDATE SET
      stay_id = EXCLUDED.stay_id, property_id = EXCLUDED.property_id, folio_type = EXCLUDED.folio_type,
      status = EXCLUDED.status, currency = EXCLUDED.currency, opened_at = EXCLUDED.opened_at, closed_at = EXCLUDED.closed_at
  `, state.folios.map((row) => ({
    id: row.id, stay_id: row.stayId, property_id: row.propertyId, folio_type: row.folioType,
    status: row.status, currency: row.currency, opened_at: row.openedAt, closed_at: row.closedAt
  })));

  await bulk(client, `
    INSERT INTO pms_folio_transaction (id, folio_id, property_id, business_date, transaction_type, description, amount, currency, source_module, source_reference, posted_at, voids_transaction_id)
    SELECT id, folio_id, property_id, business_date::date, transaction_type, description, amount, currency, source_module, source_reference, posted_at::timestamptz, voids_transaction_id
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, folio_id text, property_id text, business_date text, transaction_type text, description text, amount numeric, currency char(3), source_module text, source_reference text, posted_at text, voids_transaction_id text)
    ON CONFLICT (id) DO UPDATE SET
      folio_id = EXCLUDED.folio_id, property_id = EXCLUDED.property_id, business_date = EXCLUDED.business_date,
      transaction_type = EXCLUDED.transaction_type, description = EXCLUDED.description,
      amount = EXCLUDED.amount, currency = EXCLUDED.currency, source_module = EXCLUDED.source_module,
      source_reference = EXCLUDED.source_reference, posted_at = EXCLUDED.posted_at,
      voids_transaction_id = EXCLUDED.voids_transaction_id
  `, state.folioTransactions.map((row) => ({
    id: row.id, folio_id: row.folioId, property_id: row.propertyId, business_date: row.businessDate,
    transaction_type: row.transactionType, description: row.description, amount: row.amount,
    currency: row.currency, source_module: row.sourceModule, source_reference: row.sourceReference,
    posted_at: row.postedAt, voids_transaction_id: row.voidsTransactionId
  })));

  await bulk(client, `
    INSERT INTO pms_audit_event (id, holding_id, property_id, actor, entity_type, entity_id, action, before_data, after_data, created_at)
    SELECT id, holding_id, property_id, actor, entity_type, entity_id, action, before_data, after_data, created_at::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, holding_id text, property_id text, actor text, entity_type text, entity_id text, action text, before_data jsonb, after_data jsonb, created_at text)
    ON CONFLICT (id) DO UPDATE SET
      holding_id = EXCLUDED.holding_id, property_id = EXCLUDED.property_id, actor = EXCLUDED.actor,
      entity_type = EXCLUDED.entity_type, entity_id = EXCLUDED.entity_id, action = EXCLUDED.action,
      before_data = EXCLUDED.before_data, after_data = EXCLUDED.after_data, created_at = EXCLUDED.created_at
  `, state.auditEvents.map((row) => ({
    id: row.id, holding_id: row.holdingId, property_id: row.propertyId, actor: row.actor,
    entity_type: row.entityType, entity_id: row.entityId, action: row.action,
    before_data: row.before, after_data: row.after, created_at: row.createdAt
  })));

  await bulk(client, `
    INSERT INTO pms_sequence (name, value)
    SELECT name, value
    FROM jsonb_to_recordset($1::jsonb) AS x(name text, value int)
    ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value
  `, Object.entries(state.sequences).map(([name, value]) => ({ name, value })));
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
