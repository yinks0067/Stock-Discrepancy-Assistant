-- Expected vs counted stock for every product, biggest £ gaps first.
-- expected = opening count + received deliveries - sales - recorded wastage
WITH
opening AS (SELECT sku, qty_counted AS opening FROM stock_counts WHERE count_day = 0),
closing AS (SELECT sku, qty_counted AS closing FROM stock_counts WHERE count_day = 90),
recv    AS (SELECT sku, SUM(qty_received) AS received FROM deliveries GROUP BY sku),
sold    AS (SELECT sku, SUM(qty_sold) AS sold FROM sales GROUP BY sku),
waste   AS (SELECT sku, SUM(qty_wasted) AS wasted FROM wastage GROUP BY sku)
SELECT
  p.sku,
  p.name,
  p.category,
  o.opening,
  COALESCE(r.received, 0)                                            AS received,
  COALESCE(s.sold, 0)                                                AS sold,
  COALESCE(w.wasted, 0)                                              AS wasted,
  o.opening + COALESCE(r.received,0) - COALESCE(s.sold,0) - COALESCE(w.wasted,0) AS expected,
  c.closing                                                          AS counted,
  (o.opening + COALESCE(r.received,0) - COALESCE(s.sold,0) - COALESCE(w.wasted,0)) - c.closing AS units_missing,
  ROUND(((o.opening + COALESCE(r.received,0) - COALESCE(s.sold,0) - COALESCE(w.wasted,0)) - c.closing) * p.unit_cost, 2) AS value_missing_gbp
FROM products p
JOIN opening o USING (sku)
JOIN closing c USING (sku)
LEFT JOIN recv  r USING (sku)
LEFT JOIN sold  s USING (sku)
LEFT JOIN waste w USING (sku)
WHERE (o.opening + COALESCE(r.received,0) - COALESCE(s.sold,0) - COALESCE(w.wasted,0)) - c.closing <> 0
ORDER BY ABS(((o.opening + COALESCE(r.received,0) - COALESCE(s.sold,0) - COALESCE(w.wasted,0)) - c.closing) * p.unit_cost) DESC;
