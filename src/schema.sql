CREATE TABLE IF NOT EXISTS products (
  id          integer PRIMARY KEY,
  name        text        NOT NULL,
  price_cents integer     NOT NULL CHECK (price_cents >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO products (id, name, price_cents) VALUES
  (1, 'Notebook', 450),
  (2, 'Pen set', 1200),
  (3, 'Desk lamp', 3500),
  (4, 'Backpack', 6900),
  (5, 'Water bottle', 1800)
ON CONFLICT (id) DO NOTHING;
