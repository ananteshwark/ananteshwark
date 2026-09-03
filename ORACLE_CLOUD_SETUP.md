# Oracle Cloud Always Free — VM Setup From Scratch

Creating the $0 server that runs this stack (see `DEPLOYMENT.md` for what to
do once you can SSH in). Console labels drift over time — written against the
OCI console as of early 2026; the concepts are stable even if a button moves.

**What you get free, forever (Always Free tier):**

- Ampere ARM (`VM.Standard.A1.Flex`): up to **4 OCPUs + 24 GB RAM total**,
  split across 1–4 VMs. One VM with 2 OCPU / 12 GB is ideal for this stack.
- 2× `VM.Standard.E2.1.Micro` x86 VMs (1 GB RAM each — too small for this
  app; ignore them).
- **200 GB** total block/boot volume storage, 10 TB/month egress,
  1 reserved public IP, plus assorted free services.

---

## 1. Create the account

1. Go to **signup.oraclecloud.com** (or cloud.oracle.com → *Sign up*).
2. Enter email + country. **The country determines your home region and
   cannot be changed later.**
3. Verify the email, then fill in name and choose a **home region**.
   Choose deliberately — Always Free resources can only be created in your
   home region, and it is permanent:
   - pick a region close to your users;
   - popular regions (Frankfurt, Ashburn, Mumbai, Singapore) often have
     A1 capacity waits; a slightly less popular nearby region (e.g.
     Zurich/Amsterdam vs Frankfurt, Phoenix vs Ashburn, Hyderabad vs
     Mumbai) is frequently easier.
4. Address, phone/SMS verification, then **payment card verification** —
   a temporary ~$1 authorization for identity; you are not billed on the
   free tier. Prepaid/virtual cards are usually rejected.
5. Account activates (minutes to a few hours). You start on a **30-day
   trial with $300 credits + Always Free**; when the trial lapses you keep
   Always Free automatically — no action needed, nothing starts billing.

> **Optional but worth knowing:** upgrading the account to *Pay As You Go*
> (Billing → Upgrade) keeps every Always Free resource free, but gives your
> tenancy priority for A1 capacity and exempts your VM from Oracle's
> idle-instance reclamation of free tenancies. If you do this, immediately
> create a **Budget** (Billing & Cost Management → Budgets) of $1 with an
> email alert at 1% so any accidental paid usage screams at you.

## 2. Generate an SSH key (on your own machine)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oracle_erp -C "erp-server"
cat ~/.ssh/oracle_erp.pub   # you'll paste this in step 3
```

## 3. Create the VM

1. Sign in at **cloud.oracle.com** (enter your tenancy/cloud account name,
   then your credentials).
2. Hamburger menu (☰) → **Compute → Instances** → **Create instance**.
3. **Name**: `erp-server`. Compartment: root is fine.
4. **Placement**: leave default (if creation fails later, this is where you
   retry other availability domains).
5. **Image and shape**:
   - *Change image* → **Canonical Ubuntu 24.04**. If you select the A1
     shape first, the console switches to the **aarch64** build
     automatically — double-check it says aarch64/ARM.
   - *Change shape* → Instance type **Virtual machine** → shape series
     **Ampere** → **VM.Standard.A1.Flex** → sliders: **2 OCPU, 12 GB RAM**
     (anything up to 4/24 total across your free VMs is $0; the console
     shows an "Always Free eligible" badge).
6. **Networking**:
   - *Create new virtual cloud network* → "VCN with internet connectivity"
     (the wizard creates the VCN, a public subnet, an internet gateway and
     route rules in one go).
   - **Assign a public IPv4 address: Yes** (don't skip; fixing it later is
     an extra VNIC step).
7. **Add SSH keys**: *Paste public keys* → paste the `.pub` content from
   step 2.
8. **Boot volume**: default (~47 GB) is fine; you may raise it — your free
   total across boot volumes is 200 GB.
9. **Create**. Provisioning takes ~1 minute; note the **Public IP** on the
   instance page.

### If you get "Out of capacity for shape VM.Standard.A1.Flex"

This is the famous A1 lottery, not an error in your setup. In order of
effectiveness:

1. Retry with a **different availability domain** (regions with multiple
   ADs) and/or **smaller shape** (1 OCPU / 6 GB — you can resize up later:
   instance → *Edit* → shape, needs a reboot).
2. Retry at off-peak hours; capacity is released daily. Many people simply
   retry each morning for a few days.
3. **Upgrade to Pay As You Go** (step 1 note) — PAYG tenancies almost never
   see the capacity error, and A1 within free limits still costs $0.
4. Fall back to a paid ~€4/month VPS (Hetzner et al., `DEPLOYMENT.md`
   Option B) and stop fighting the lottery.

## 4. Make the public IP permanent (recommended, still free)

The default ephemeral IP is lost if the instance is ever terminated. To
reserve it: instance page → **Attached VNICs** → the VNIC → **IPv4
Addresses** → ⋮ on the address → *Edit* → change **Ephemeral** to
**Reserved public IP** (create new). One reserved IP is Always Free.
Point your DNS `A` record at it now (Caddy needs DNS resolving before
first launch).

## 5. Open ports 80 and 443 — in BOTH firewalls

Oracle has two layers; forgetting either is the #1 "site unreachable" cause.

**Cloud layer (VCN security list):**

1. ☰ → **Networking → Virtual cloud networks** → your VCN → **Subnets** →
   the public subnet → its **Security List**.
2. **Add Ingress Rules**, twice:
   - Source CIDR `0.0.0.0/0`, protocol TCP, destination port **80**
   - Source CIDR `0.0.0.0/0`, protocol TCP, destination port **443**
   (Port 22 already has a rule from the wizard.)

**Host layer (Ubuntu iptables — Oracle images ship restrictive rules):**

```bash
ssh -i ~/.ssh/oracle_erp ubuntu@<PUBLIC_IP>

sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(`-I INPUT 6` inserts above the default REJECT rule; plain `-I INPUT` also
works.)

## 6. Sanity checks, then deploy

```bash
uname -m        # aarch64  (ARM — the app's Docker images build fine on it)
free -h         # ~12 GB
df -h /         # your boot volume
```

From here, continue with **`DEPLOYMENT.md` step 2**: install Docker, clone
the repo, `cp .env.production.example .env`, fill in `DOMAIN`, the database
password and JWT secrets, and
`docker compose -f docker-compose.prod.yml up -d --build`.

## 7. Free-tier housekeeping

- **Idle reclamation**: Oracle may reclaim Always Free A1 instances on
  *free* (non-PAYG) tenancies that sit under ~15–20% CPU/network use for a
  week. A live deployment with the hourly scheduler plus real users usually
  clears the bar, but a completely idle demo may not. The PAYG upgrade
  (still $0 for free shapes) removes this risk entirely.
- **Budget alert**: even on a pure free account, set Billing & Cost
  Management → Budgets → $1 with an alert — free insurance against ever
  being surprised.
- **Don't terminate casually**: terminating the instance releases an
  ephemeral IP (see step 4) and, if you check "delete boot volume",
  your data. Backups: `DEPLOYMENT.md` step 6.
