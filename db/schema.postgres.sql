-- PostgreSQL schema for the planned AWS RDS/Aurora PostgreSQL backend.
-- Not connected to the browser-local demo. All money values are integer cents.
BEGIN;
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 display_name text NOT NULL,
 role text NOT NULL CHECK (role IN ('admin','seller','buyer')),
 identity_subject text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sellers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 slug text NOT NULL UNIQUE,
 display_name text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended'))
);
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id uuid NOT NULL REFERENCES sellers(id),
 slug text NOT NULL UNIQUE,
 category text NOT NULL,
 price_cents integer NOT NULL CHECK (price_cents >= 0),
 currency char(3) NOT NULL DEFAULT 'USD',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 cover_object_key text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_translations (
 product_id uuid NOT NULL REFERENCES products(id),
 locale text NOT NULL CHECK (locale IN ('en','ko')),
 title text NOT NULL,
 description text NOT NULL,
 PRIMARY KEY (product_id,locale)
);
CREATE TABLE product_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES products(id),
 s3_object_key text NOT NULL,
 filename text NOT NULL,
 content_type text NOT NULL,
 bytes bigint NOT NULL CHECK(bytes>=0),
 version integer NOT NULL DEFAULT 1
);
CREATE TABLE share_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES products(id),
 code text UNIQUE NOT NULL,
 campaign text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buyer_id uuid NOT NULL REFERENCES users(id),
 product_id uuid NOT NULL REFERENCES products(id),
 share_link_id uuid REFERENCES share_links(id),
 amount_cents integer NOT NULL CHECK(amount_cents>=0),
 currency char(3) NOT NULL DEFAULT 'USD',
 status text NOT NULL CHECK(status IN ('pending','paid','failed','refunded')),
 idempotency_key text NOT NULL UNIQUE,
 provider_payment_id text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz
);
CREATE TABLE entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 buyer_id uuid NOT NULL REFERENCES users(id),
 product_id uuid NOT NULL REFERENCES products(id),
 revoked_at timestamptz,
 granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid REFERENCES users(id),
 action text NOT NULL,
 resource_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_seller ON products(seller_id,status);
CREATE INDEX idx_orders_buyer ON orders(buyer_id,created_at DESC);
CREATE INDEX idx_orders_product ON orders(product_id,created_at DESC);
CREATE INDEX idx_entitlements_buyer ON entitlements(buyer_id,product_id);
COMMIT;
