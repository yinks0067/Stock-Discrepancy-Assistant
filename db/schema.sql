-- Stock Discrepancy Assistant schema (PostgreSQL)

DROP TABLE IF EXISTS wastage, sales, deliveries, stock_counts, products CASCADE;

CREATE TABLE products (
  sku          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  unit_cost    NUMERIC(8,2) NOT NULL,   -- GBP
  unit_price   NUMERIC(8,2) NOT NULL,   -- GBP
  perishable   BOOLEAN NOT NULL DEFAULT false
);

-- Physical counts. day 0 = opening count, day 90 = closing count.
CREATE TABLE stock_counts (
  sku          TEXT NOT NULL REFERENCES products(sku),
  count_day    INT  NOT NULL,
  qty_counted  INT  NOT NULL,
  PRIMARY KEY (sku, count_day)
);

CREATE TABLE deliveries (
  delivery_id   SERIAL PRIMARY KEY,
  sku           TEXT NOT NULL REFERENCES products(sku),
  delivery_day  INT  NOT NULL,
  supplier_ref  TEXT NOT NULL,           -- invoice/delivery note number
  qty_invoiced  INT  NOT NULL,
  qty_received  INT  NOT NULL            -- what the store booked in
);

CREATE TABLE sales (
  sku       TEXT NOT NULL REFERENCES products(sku),
  sale_day  INT  NOT NULL,
  qty_sold  INT  NOT NULL,
  PRIMARY KEY (sku, sale_day)
);

CREATE TABLE wastage (
  sku          TEXT NOT NULL REFERENCES products(sku),
  waste_day    INT  NOT NULL,
  qty_wasted   INT  NOT NULL,
  reason       TEXT NOT NULL             -- 'out_of_date' | 'damaged'
);

CREATE INDEX ON deliveries (sku);
CREATE INDEX ON sales (sku);
CREATE INDEX ON wastage (sku);
