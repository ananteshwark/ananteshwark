# Codebase review — bugs, logic errors, and enhancements

A full pass over the backend and frontend looking for defects rather than
missing features. Every claim below was reproduced before being fixed and
re-measured afterwards; each fix carries a regression test that fails on the
old code.

Suite: **651 passing, 2 skipped** (was 636 before this review; +15 regression
tests), verified over three consecutive full runs — single runs repeatedly
reported the wrong thing here, in both directions. `pyflakes` clean; frontend
lint clean of errors.

---

## 1. Defects found and fixed

### 1.1 Legal hold was enforced on 2 of 31 write paths — **data integrity**

A legal hold exists to freeze a record for litigation or audit. The guard was
attached to `PUT /contracts/{sr_no}` and `DELETE /contracts/{sr_no}` only.
Everything else that writes to a held contract went straight through.

Probe against a contract under hold, before the fix:

```
PUT  /contracts/{id}   -> 423 (expected 423)
POST /validate         -> 200 (expected 423)   <-- rewrote notice_period
POST /milestones       -> 200 (expected 423)
PUT  /assignee         -> 200 (expected 423)
POST /payments         -> 200 (expected 423)
notice_period now: 'CHANGED BY VALIDATE'
```

Validation is the serious one: it writes through the same field-setting path as
an edit, so a held contract could be silently rewritten by the ordinary
validation screen — the exact outcome a hold is meant to prevent.

**Fix.** `_assert_writable()` at the top of `_apply_update()`, which is the
shared path validation and editing both use, plus `_get_contract_for_write()`
on the remaining 11 contract endpoints, the four sub-entity mutators
(attachments, notes, milestones), and a `for_write` guard in `payments_api`.
Reads and hold-release are deliberately still permitted — the hold protects the
record, it does not lock people out of it.

`test_legal_hold_covers_every_write_path` now asserts 423 on every one of those
routes and that the field is unchanged afterwards.

### 1.2 OIDC rejected about one valid SSO login in sixteen — **authentication**

`make_state()` signs a timestamp and packs it as `payload + b"." + sig`, where
`sig` is 16 **raw** bytes of an HMAC. `verify_state()` recovered the two halves
with `raw.rsplit(b".", 1)`.

A raw 16-byte signature contains the byte `0x2e` (`.`) with probability
`1 - (255/256)**16` ≈ **6.1%**. Measured over 10,000 timestamps: **6.5%**. When
it happens the split lands inside the signature, the payload is corrupted, and
a perfectly valid login is bounced back to the sign-in page with an
invalid-state error the user cannot act on. It is intermittent and
unreproducible on demand, which is exactly why it survived.

**Fix.** The signature is a fixed width, so the split is taken by offset rather
than by delimiter. This also reads every token the current code already emits —
including the ones it could not read itself — so there is no format change and
nothing in flight breaks.

Verified: of 40 colliding states in one TTL window, the old code rejected all
40 and the new code accepts all 40.

### 1.3 Retrieval — document length decided relevance

The concept embedding hashed concept tokens and character trigrams into one
256-dim bag and normalized the result. A clause carries ~6 concept tokens
against ~100 trigrams, so after a shared normalization the trigrams set the
score.

Measured on the query `"indemnity obligations"` against a genuine paraphrase
("hold the Customer harmless") and unrelated text (cafeteria catering), across
300 draws:

| | paraphrase | unrelated | unrelated wins |
|---|---|---|---|
| one shared bag | 0.135 | 0.130 | **13%** |
| two channels | **0.529** | **0.011** | 0% |

On the concept channel alone the separation was always perfect (0.398 vs
0.000) — the signal was there and was being averaged away.

**Fix.** Two independently normalized channels (192 semantic + 64 lexical)
concatenated with weights whose squares sum to one, so the cosine reads as
`0.76 * semantic + 0.24 * lexical` and length cannot dilute the concept signal.
Also added sublinear term frequency (`1 + log tf`) so a boilerplate word
repeated through a long contract stops dominating, and a function-word stop
list. Total width stays 256, so an existing pgvector column remains valid; the
`concept` embedding version is bumped 2 → 4 so deployed indexes are recognised
as stale and rebuilt.

This was surfacing as a test that failed roughly one run in six. The random
marker in the fixture was landing in a favourable hash bucket often enough to
flip the ranking — noise, not the property under test, was deciding the result.

### 1.4 The lexicon missed ordinary inflections

`CONCEPTS` lists citation forms, and matching was exact-surface. So a query
written in the third person emitted **no concept token at all** and silently
fell back to lexical matching:

```
"who indemnifies whom for third party claims"  -> NO CONCEPTS   (score 0.122)
"the vendor shall indemnify the company"       -> indemnity     (score 0.588)
```

Same for `terminates`, `warrants`, `confidentially`, `subcontracts`,
`payable`, `indemnified`.

**Fix.** A stem pass (`_STEMS`) over 16 families where the prefix is
unambiguous in contract language — `indemnif|indemnit`, `terminat|cancel`,
`payment|payable|invoic`, and so on. Broader families are deliberately left to
phrase matching, because a loose stem is how a lexicon starts mislabelling.
The inflected query went 0.122 → **0.584**, with the golden-set noise pairs
unchanged (weakest true match 0.588, strongest non-match 0.241).

### 1.5 The keyword half of hybrid search was not a ranking

`hybrid_search` fuses two lists by reciprocal rank, which reads position as
relevance. The keyword side was a `set`, which the fusion then ordered with
`sorted()` — i.e. **by primary key**. The oldest contract matching any single
term outranked a recent one matching all of them. Compounding it, the
underlying query applied `.limit(60)` with no `ORDER BY`, so which 60 rows came
back was arbitrary.

**Fix.** `_keyword_ids` now returns an ordered list scored by how many distinct
query terms a row matches, then by how often, over a deterministic
over-fetched candidate set. `hybrid_search` preserves caller order and still
accepts a set for compatibility.

### 1.6 The abstention thresholds were left behind by 1.3 — **found by a flaky test**

Changing the vector space (1.3) silently invalidated every number calibrated
against the old one. `ABSTAIN_BELOW = 0.22` had been measured when unrelated
text topped out around 0.17; in the new space unrelated text reaches 0.467, so
the floor sat well below the noise and the system would answer confidently from
documents that matched nothing.

This surfaced as one test failing in roughly one run in six. It would have been
easy to dismiss as flake — the first fix attempt (raise the floor) and the
second (treat any keyword match as evidence) both looked right and both were
wrong, the second one deterministically so.

Re-measured over a 482-contract corpus with 25 questions, 10 off-domain and 15
about contracts:

| | min | median | max |
|---|---|---|---|
| off-domain questions | 0.135 | 0.216 | **0.467** |
| contract questions | **0.247** | 0.509 | 0.779 |

The ranges **overlap**, so no absolute floor separates them — the earlier
four-query sample that suggested a clean gap was simply too small. What does
separate them is not the score: **0 of the 10 off-domain questions produced a
single concept token**, including the two highest scorers that would slip past
any floor set low enough to answer real questions.

The `STANDOUT_RATIO` rule turned out to be worse than useless. It required the
top hit to beat the median of the rest by 1.35×; measured, genuine questions
ran 1.00–1.33 and off-domain ones 1.04–1.10. It could not separate them, and it
fired hardest on questions the repository *could* answer — a homogeneous
contract set should return many similar scores when asked about indemnity.
Refusing to answer looks identical to having no data, so that failure mode
would never have been reported.

**Fix.** Abstention now asks three questions in order: does the question name a
specific contract by identifier (a term shaped like a reference *and* narrowing
the repository to a handful of rows — rarity alone is not enough, since an
unusual ordinary word like "gibberish" can appear in one or two contracts); does
anything clear the absolute floor; and does the question speak the domain's
language at all, with a much higher bar if it does not. The standout rule is
gone.

### 1.7 Q&A could never be rated

`ask_contracts` read `run_id = run.get("id")` **inside** the `with record(...)`
block, but `record()` stamps `run["id"]` in its `finally` — after the body
exits. So `run_id` was always `None`, and the UI could never attach an
accept/reject verdict to an answer. The acceptance statistics that the AI
governance work exists to produce were structurally unreachable for this
feature.

### 1.8 Obligation reminders over-reported

`run_obligation_reminders` incremented `notified` for obligations with no owner
and no assignee — nobody was contacted, but the run reported a notification.
Now skipped and logged.

### 1.9 Bulk delete without a synchronize strategy

`issue_token`'s `query(...).delete()` ran without `synchronize_session=False`,
leaving the session's identity map to guess. Made explicit.

### 1.10 Dead imports

20 unused imports across 12 modules, and a redundant `from datetime import ...`
inside a loop body in `internal_entities_api`. Removed; `pyflakes` is clean.

---

### 1.11 An exact reference could be crowded out of its own search

Asking "which contract mentions ZANTHUM-4192" returned six vaguely related
contracts and not the one contract containing that reference.

Reciprocal rank fusion weights the two channels: a keyword hit at rank 1
contributes `(1-w)/(k+1)`, a semantic near-miss at vector rank 1 contributes
`w/(k+1)`, and with `w = 0.6` the semantic side wins every slot. In a small
repository the identifier survived because there was nothing to crowd it out;
past a few hundred contracts it disappeared from the results entirely.

This was invisible until an unrelated set of new tests enlarged the shared test
corpus — the test that caught it had been passing for the same reason
production would have looked fine at first: not enough data.

**Fix.** The strongest keyword hits are reserved slots in the result set.
Neither channel's misses should be able to erase the other's hits, which is the
entire reason for searching both. The regression test seeds a deliberately
crowded corpus, because in a small one the bug cannot reproduce.

### 1.12 A page that crashed on open, found by turning the linter on

The frontend had no lint configuration at all. Adding one surfaced
`RepositoryAI.jsx` calling `useEffect` without importing it — a `ReferenceError`
on render, so the Repository AI page white-screened. Nothing else in the build
or the test suite could see it.

Two cautions worth recording, because both nearly went the wrong way:

* The first config reported **186 problems, 132 of them false**. Without
  `eslint-plugin-react`, `no-unused-vars` does not count a JSX reference as a
  use, so every component imported for markup looked dead. An automated pass
  acting on that would have deleted imports that are load-bearing; it did, and
  was reverted. With `react/jsx-uses-vars` enabled the count is 47.
* Of the genuinely unused declarations, one was not dead code but a missing
  wire-up: `markReviewed()` posts an internal-review sign-off that no control
  ever called. The endpoint existed, the handler existed, the button did not.
  It is now in the share dialog, alongside the sign-off state.

Remaining: 0 errors, 42 warnings — 23 components declared inside other
components (they remount and lose state on every render) and 13 effects that
set state synchronously. Both are refactors rather than fixes, so they are
warnings, recorded here so they stay visible rather than quietly becoming the
norm.

### 1.13 An admin setting that gated nothing

Admin Settings offered "Require internal review sign-off before sharing". No
code read it. An administrator could switch it on and believe external sharing
was gated when it was not.

The first fix was to enforce it — which a pre-existing test immediately
contradicted: internal review is advisory *by design*, and that test pins it.
So the defect is not the missing gate but the control that promised one. The
control is gone; the setting key stays so saved values still load, marked
legacy where it is defined.

---

## 2. Enhancements recommended, not made

These are correctness-neutral — the code does the right thing, at a cost that
will matter later. They are listed rather than changed because each one is a
design decision worth making deliberately.

### 2.1 Portfolio queries loaded the whole table into Python — **done**

`portfolio_api.query`, `portfolio_api.exposure` and `report_builder.run_report`
each read every validated contract — including `extracted_text`, the largest
column in the schema — then filtered, sorted and sliced in Python, applying the
limit only after the whole set was in memory.

Now: those paths name the columns they need, so the contract body is never
loaded to answer a question about a small JSON field; attribute filters push a
superset predicate into SQL (the key must exist) while the exact comparison
stays in Python, so the SQL and the matcher cannot disagree about types;

That push-down was itself wrong on the first attempt, and instructively so.
Indexing a JSON column without a type coercion compiles to
`JSON_QUOTE(JSON_EXTRACT(...))` under SQLite — and `JSON_QUOTE(NULL)` returns
the *string* `'null'`, so `IS NOT NULL` held for every row and the filter
narrowed nothing. Postgres compiled to `->` and behaved correctly. A
dialect-specific no-op that only misbehaves on the development database is
precisely the kind of thing that reaches production unnoticed; `.as_string()`
fixes both, and the test now asserts that every row Python examined actually
matched, which is what "the database did the filtering" means.

`exposure` counts unextracted rows in SQL instead of loading and discarding
them; the report caps at 10,000 rows in SQL and eager-loads the two
relationships its columns touch. `query` reports `scanned` and `truncated` so a
partial answer says so.

The regression tests assert the emitted SQL, not the shape of the result, since
a result-shape test would pass just as happily with the body loaded.

### 2.2 Audit rows could be rolled back with the transaction they audited — **done, with a limit**

`ai_audit.record()` promised a run is recorded "whether it succeeds, falls back
or fails", but wrote into the caller's session without committing. A failed AI
call that rolled the request back took its own audit record with it.

Audit rows now commit on an independent session — **except under SQLite**,
where they deliberately do not. SQLite permits one writer, so a second
connection writing while the request holds an open write transaction does not
fail, it waits out the busy timeout. Measured: **5.0s per audit write**, which
turned the 100s test suite into 952s. The review had flagged this exact risk
and the first implementation shipped it anyway; it is caught by a test that
asserts recording completes in under a second with dirty caller state.

So the durability guarantee holds on Postgres, where the product runs, and the
development database keeps the old behaviour as a documented limitation.

### 2.3 The frontend had no lint configuration — **done**

See 1.11: a flat config with the hooks and react plugins, an `npm run lint`
script, and the crash it found on first run.

### 2.4 A note on hash collisions in short queries

With 192 semantic dimensions, a query of four or five tokens can collide into a
matching bucket and score higher than it should — one off-topic probe reached
0.391. The `should_abstain` standout rule limits the damage, and genuine
queries now score 0.58–0.82 so the margin is wide. If the corpus grows past a
few thousand contracts it is worth revisiting the width, which means migrating
the pgvector column rather than just re-indexing.

---

## 3. What was checked and found sound

- Multi-role RBAC: `require_roles` intersects correctly and the multi-role
  union helper is used consistently at the call sites.
- Tokenized sealed routes (`/vendor/:token`, `/contract-action/:token`,
  `/approve/:token`): single-use, scoped to one entity, TTL-checked, and
  superseded tokens are retired on re-issue.
- Soft-delete filtering (`deleted_at.is_(None)`) is applied consistently on
  list and detail queries.
- Migrations remain additive; new columns are appended to `_ADD_COLUMNS` and
  new tables come from `create_all`.
- Secret masking in the settings API covers every key in `SECRET_KEYS`.
