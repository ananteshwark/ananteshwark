-- Idempotently provision a LEAST-PRIVILEGE login role and the database it owns
-- for a Contract Management System instance. Run as the Postgres admin
-- (erp_user) against the maintenance DB; the CMS itself then connects as this
-- non-superuser role — never as erp_user — so a compromised CMS cannot read or
-- write the ERP database or any other tenant's database.
--
-- Parameters (psql -v):
--   role  role name       (cms_app, or cms_<slug> per tenant)
--   pw    role password
--   db    database name    (cms, or cms_<slug> per tenant)
--
-- Uses \gexec so CREATE ROLE/DATABASE run only when missing (neither supports
-- IF NOT EXISTS), and format('%I', ...) to safely quote identifiers.

SELECT format('CREATE ROLE %I LOGIN', :'role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec

ALTER ROLE :"role" WITH LOGIN PASSWORD :'pw';

SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db')
\gexec
