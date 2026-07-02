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
