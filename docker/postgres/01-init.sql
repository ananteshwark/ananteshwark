-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Row Level Security helper function
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT current_setting('app.current_tenant_id', true)::uuid;
$$ LANGUAGE sql STABLE;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE erp_db TO erp_user;
