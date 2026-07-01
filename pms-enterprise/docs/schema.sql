CREATE TABLE holding (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  base_currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE property (
  id uuid PRIMARY KEY,
  holding_id uuid NOT NULL REFERENCES holding(id),
  code text NOT NULL,
  name text NOT NULL,
  property_type text NOT NULL CHECK (property_type IN ('hotel', 'villa', 'marina', 'restaurant', 'mixed')),
  timezone text NOT NULL,
  default_currency char(3) NOT NULL,
  business_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (holding_id, code)
);

CREATE TABLE room_type (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES property(id),
  code text NOT NULL,
  name text NOT NULL,
  max_occupancy int NOT NULL,
  base_adults int NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (property_id, code)
);

CREATE TABLE room (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES property(id),
  room_type_id uuid NOT NULL REFERENCES room_type(id),
  room_number text NOT NULL,
  floor text,
  status text NOT NULL CHECK (status IN ('vacant_clean', 'vacant_dirty', 'occupied_clean', 'occupied_dirty', 'ooo', 'oos')),
  is_active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  UNIQUE (property_id, room_number)
);

CREATE TABLE rate_plan (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES property(id),
  code text NOT NULL,
  name text NOT NULL,
  currency char(3) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (property_id, code)
);

CREATE TABLE rate_rule (
  id uuid PRIMARY KEY,
  rate_plan_id uuid NOT NULL REFERENCES rate_plan(id),
  room_type_id uuid NOT NULL REFERENCES room_type(id),
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  amount numeric(14,2) NOT NULL,
  tax_rate numeric(7,4) NOT NULL DEFAULT 0,
  min_los int,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  stop_sell boolean NOT NULL DEFAULT false,
  CHECK (valid_to >= valid_from)
);

CREATE TABLE inventory_day (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES property(id),
  room_type_id uuid NOT NULL REFERENCES room_type(id),
  stay_date date NOT NULL,
  physical_count int NOT NULL,
  out_of_order_count int NOT NULL DEFAULT 0,
  reserved_count int NOT NULL DEFAULT 0,
  overbooking_limit int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  UNIQUE (property_id, room_type_id, stay_date),
  CHECK (reserved_count <= physical_count - out_of_order_count + overbooking_limit)
);

CREATE TABLE guest (
  id uuid PRIMARY KEY,
  holding_id uuid NOT NULL REFERENCES holding(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  document_type text,
  document_number text,
  language_code text,
  vip_level text,
  risk_status text CHECK (risk_status IN ('normal', 'watchlist', 'blacklisted')),
  gdpr_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservation (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES property(id),
  confirmation_number text NOT NULL,
  status text NOT NULL CHECK (status IN ('tentative', 'confirmed', 'waitlisted', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  room_type_id uuid NOT NULL REFERENCES room_type(id),
  rate_plan_id uuid NOT NULL REFERENCES rate_plan(id),
  source text NOT NULL,
  adults int NOT NULL DEFAULT 1,
  children int NOT NULL DEFAULT 0,
  guarantee_type text,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, confirmation_number),
  CHECK (departure_date > arrival_date)
);

CREATE TABLE reservation_night (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservation(id),
  stay_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL,
  UNIQUE (reservation_id, stay_date)
);

CREATE TABLE stay (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservation(id),
  property_id uuid NOT NULL REFERENCES property(id),
  status text NOT NULL CHECK (status IN ('due_in', 'in_house', 'due_out', 'checked_out')),
  checked_in_at timestamptz,
  checked_out_at timestamptz
);

CREATE TABLE room_assignment (
  id uuid PRIMARY KEY,
  stay_id uuid NOT NULL REFERENCES stay(id),
  room_id uuid NOT NULL REFERENCES room(id),
  assigned_from date NOT NULL,
  assigned_to date NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  CHECK (assigned_to > assigned_from)
);

CREATE TABLE folio (
  id uuid PRIMARY KEY,
  stay_id uuid REFERENCES stay(id),
  property_id uuid NOT NULL REFERENCES property(id),
  folio_type text NOT NULL CHECK (folio_type IN ('guest', 'room', 'group', 'house')),
  status text NOT NULL CHECK (status IN ('open', 'closed', 'voided')),
  currency char(3) NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE folio_transaction (
  id uuid PRIMARY KEY,
  folio_id uuid NOT NULL REFERENCES folio(id),
  property_id uuid NOT NULL REFERENCES property(id),
  business_date date NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('charge', 'tax', 'payment', 'deposit', 'refund', 'adjustment', 'transfer', 'void')),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency char(3) NOT NULL,
  source_module text NOT NULL,
  source_reference text,
  posted_by uuid,
  posted_at timestamptz NOT NULL DEFAULT now(),
  voids_transaction_id uuid REFERENCES folio_transaction(id)
);

CREATE TABLE audit_event (
  id uuid PRIMARY KEY,
  holding_id uuid NOT NULL REFERENCES holding(id),
  property_id uuid REFERENCES property(id),
  actor_user_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_lookup ON inventory_day (property_id, room_type_id, stay_date);
CREATE INDEX idx_reservation_dates ON reservation (property_id, arrival_date, departure_date, status);
CREATE INDEX idx_folio_txn_business_day ON folio_transaction (property_id, business_date, folio_id);
CREATE INDEX idx_room_status ON room (property_id, room_type_id, status);

-- Transitional MVP persistence table.
-- The running demo stores its full application state here while the domain is
-- migrated from the in-memory repository to the normalized schema above.
CREATE TABLE pms_app_state (
  state_key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
