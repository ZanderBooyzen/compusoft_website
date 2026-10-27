CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS business_records (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'sale', 'invoice')),
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  record_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS business_records_customer_idx ON business_records(customer_id);
CREATE INDEX IF NOT EXISTS business_records_kind_date_idx ON business_records(kind, record_date DESC);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('contact', 'product_quote')),
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'converted', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS inquiries_created_idx ON inquiries(created_at DESC);
