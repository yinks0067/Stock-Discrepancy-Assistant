-- Load generated CSVs. Run from the project root:
--   psql "$DATABASE_URL" -f db/schema.sql -f db/load.sql
\copy products (sku, name, category, unit_cost, unit_price, perishable) FROM 'data/products.csv' WITH (FORMAT csv, HEADER true)
\copy stock_counts (sku, count_day, qty_counted) FROM 'data/stock_counts.csv' WITH (FORMAT csv, HEADER true)
\copy deliveries (sku, delivery_day, supplier_ref, qty_invoiced, qty_received) FROM 'data/deliveries.csv' WITH (FORMAT csv, HEADER true)
\copy sales (sku, sale_day, qty_sold) FROM 'data/sales.csv' WITH (FORMAT csv, HEADER true)
\copy wastage (sku, waste_day, qty_wasted, reason) FROM 'data/wastage.csv' WITH (FORMAT csv, HEADER true)
