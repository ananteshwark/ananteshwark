# CMS Database Schema / ERD

All timestamps are stored in **UTC**; scheduling and date display use **Asia/Kolkata**.
Destructive actions are **soft deletes** (`deleted_at`). Every change is written to `audit_log`.

```mermaid
erDiagram
    USERS ||--o{ AUDIT_LOG : writes
    USERS ||--o{ CONTRACTS : validates

    DEPARTMENTS ||--o{ CONTRACTS : "categorizes"
    DEPARTMENTS ||--o| RULE_DEPARTMENT_MAP : "has rule via"

    VENDORS ||--o{ VENDOR_ALIASES : "known as"
    VENDORS ||--o{ CONTRACTS : "party to"

    INGESTION_FILES ||--o| CONTRACTS : "produces"
    INGESTION_FILES ||--o| INGESTION_FILES : "duplicate_of"

    CONTRACTS ||--o{ CONTRACT_RECIPIENTS : "reminds"
    CONTRACTS ||--o{ REMINDER_LOG : "reminded in"
    CONTRACTS ||--o{ DUPLICATE_CANDIDATES : "flagged in"
    CONTRACTS ||--o| CONTRACTS : "renews (thread)"
    CONTRACTS }o--o| REMINDER_RULES : "rule override"

    REMINDER_RULES ||--o{ RULE_DEPARTMENT_MAP : "mapped to"
    REMINDER_RULES ||--o{ REMINDER_LOG : "fired by"

    USERS {
        int id PK
        string email UK
        string name
        string hashed_password
        enum role "ADMIN|VALIDATOR|VIEWER"
        bool is_active
        datetime deleted_at "soft delete"
    }

    DEPARTMENTS {
        int id PK
        string name UK
        string default_recipient_email
        datetime deleted_at
    }

    VENDORS {
        int id PK
        string name
        string normalized_name "suffixes stripped, for fuzzy match"
        json addresses
        json contacts
        datetime deleted_at
    }

    VENDOR_ALIASES {
        int id PK
        int vendor_id FK
        string alias
        string normalized_alias
    }

    INGESTION_FILES {
        int id PK
        text path
        string filename
        text subfolder
        string sha256 "file-level dedupe"
        enum status "QUEUED|EXTRACTING|EXTRACTED|PENDING_VALIDATION|VALIDATED|DUPLICATE|FAILED"
        text error
        int duplicate_of_id FK
        int contract_id FK
        datetime detected_at
        datetime processed_at
    }

    CONTRACTS {
        int sr_no PK "auto-increment register serial"
        string signing_entity
        int vendor_id FK
        string vendor_name_raw "as extracted"
        text vendor_address
        date start_date
        date end_date
        string contract_tenure
        int department_id FK
        string po_number
        numeric contract_value
        string currency "default INR"
        string iks_signing_authority
        string vendor_signing_authority
        string contract_service
        text service_summary
        text contract_link "system-filled file path"
        enum status "PENDING_VALIDATION|VALIDATED|REJECTED|ARCHIVED"
        enum lifecycle_status "ACTIVE|EXPIRED|RENEWED|TERMINATED"
        json raw_extracted "Claude output"
        json confidence "per-field 0-1"
        json derived_fields "e.g. end_date from tenure"
        string extraction_model
        int prompt_version
        int validated_by_id FK
        datetime validated_at
        int renews_contract_id FK "renewal chain"
        int thread_id "groups original + renewals"
        int reminder_rule_id FK "per-contract override"
        json custom_offsets "per-contract override"
        bool reminders_acknowledged
        int ingestion_file_id FK
        datetime deleted_at
    }

    CONTRACT_RECIPIENTS {
        int id PK
        int contract_id FK
        string name
        string email
        bool is_primary
        int user_id FK "optional link to users"
        datetime deleted_at
    }

    DUPLICATE_CANDIDATES {
        int id PK
        int contract_id FK
        int matched_contract_id FK
        text reason
        float score
        enum resolution "PENDING|CONFIRMED_DUPLICATE|RENEWAL|NOT_DUPLICATE"
        int resolved_by_id FK
        datetime resolved_at
    }

    REMINDER_RULES {
        int id PK
        string name UK
        json offsets "[90,60,30,15,7,1] days before expiry"
        int periodicity_days "then every N days until expiry"
        int post_expiry_days "continue after expiry until acknowledged"
        int escalation_after "CC escalation contact after N ignored"
        string escalation_email
        json channels "['email'] - pluggable"
        datetime deleted_at
    }

    RULE_DEPARTMENT_MAP {
        int id PK
        int rule_id FK
        int department_id FK "unique - one rule per department"
    }

    REMINDER_LOG {
        int id PK
        int contract_id FK
        int rule_id FK
        string recipient
        string channel
        int days_to_expiry
        bool escalated
        datetime sent_at
        string delivery_status "SENT|FAILED|SKIPPED"
        text detail
    }

    AUDIT_LOG {
        int id PK
        string entity_type
        int entity_id
        string action
        string field
        text old_value
        text new_value
        int user_id FK
        datetime created_at
    }

    PROMPT_TEMPLATES {
        int id PK
        string name
        int version "versioned Claude extraction prompt"
        text content
        bool is_active
    }

    EMAIL_TEMPLATES {
        int id PK
        string name UK
        text subject "placeholder-based"
        text body
    }

    APP_SETTINGS {
        string key PK
        text value "admin-editable runtime settings"
    }
```

## Rule resolution order (reminders)

1. `contracts.custom_offsets` (per-contract offset override)
2. `contracts.reminder_rule_id` (per-contract rule override)
3. `rule_department_map` → the contract's department's rule
4. No rule → no reminders

## Renewal chains

`thread_id` groups an original contract with all its renewals; `renews_contract_id`
points at the immediate predecessor, so chains render as
`original → renewal → renewal`. Marking a contract RENEWED/TERMINATED stops its
pending reminders automatically (the daily run skips those lifecycle states).
