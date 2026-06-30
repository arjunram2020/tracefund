# Learning AWS by deploying Covenant

This guide explains **what AWS does for Covenant, why each piece exists, and
what you should learn from deploying it**. It assumes you have never used AWS.

Use this as the textbook. When you are ready to type commands, follow the
step-by-step [AWS EC2 deployment runbook](./AWS_DEPLOYMENT.md).

> This guide describes the learning architecture we chose: first deploy one
> understandable EC2 server, then evolve it toward containers and managed AWS
> services. The first version is intentionally simple, not the final form of a
> high-availability production system.

## The one idea to understand first

AWS is not the blockchain and it does not hold Covenant's funds.

Covenant is a hybrid application:

```text
                               BASE MAINNET
                         ┌─────────────────────┐
 Wallet signs transaction│ Covenant contract   │
 Browser ────────────────►│ campaigns and funds │
                         └──────────┬──────────┘
                                    │ public events
                                    ▼
 INTERNET                 AWS EC2 INSTANCE
 ┌─────────┐   HTTPS    ┌─────────────────────────────────────┐
 │ Browser │───────────►│ Nginx :80/:443                     │
 └────┬────┘            │    ├── /      → Next.js :3000      │
      │                 │    └── /api/ → indexer :4000       │
      │ Base RPC        │                                     │
      └────────────────►│ indexer → SQLite file on EBS disk  │
                        └─────────────────────────────────────┘
```

There are two different kinds of state:

| State | Real source of truth | Why |
|---|---|---|
| Campaigns, milestones, donations, escrowed ETH | Covenant contract on Base | This is the trustless, enforceable record. |
| Cached event history and API responses | SQLite on EC2 | This makes history fast to search, but it can always be rebuilt from Base events. |

If the AWS server disappears, the website and cached API go offline, but the
contract and funds remain on Base. If the SQLite file disappears, the indexer
can replay contract events from `DEPLOY_BLOCK` and rebuild it.

## What AWS is doing in this project

AWS gives us an always-on computer connected to the internet. On that computer
we run three processes:

1. **Next.js frontend** — the Covenant website. It renders the interface and
   asks wallets to sign transactions.
2. **Covenant indexer** — a read-only Node/Express process. It asks a Base RPC
   provider for Covenant events, stores them in SQLite, and exposes endpoints
   such as `/health`, `/events`, and `/campaigns/:id`.
3. **Nginx** — the public front door. It receives normal web traffic and routes
   each request to the right private process.

The frontend reads **live contract state** (current balances, milestone status)
directly from Base, because that must always be trustless and up to the second.
For **history** — the activity/audit trail of a campaign — it now calls the
indexer API first (`useActivity` fetches `/api/campaigns/:id`) and only falls
back to scanning Base directly if the indexer is unreachable. This is the whole
point of the indexer: replaying a campaign's history from the chain meant
hundreds of `getLogs` calls per page view; the indexer turns that into one fast
request, while the chain remains the source of truth the cache is rebuilt from.
Do not mistake the cache for the contract.

AWS is useful here because your laptop is not a reliable public server. It
sleeps, changes networks, closes terminals, and is usually behind a home router.
EC2 stays online at a stable location and can restart processes after failures.

## The AWS vocabulary, translated

| AWS or server term | Plain-English meaning | Covenant use |
|---|---|---|
| **Region** | A geographic AWS area | Keep all resources in one Region while learning. We use `us-east-1` in examples. |
| **EC2 instance** | A rented virtual Linux computer | Runs Next.js, the indexer, Nginx, PM2, and SQLite. |
| **AMI** | A template for the computer's operating system | We use Amazon Linux 2023. |
| **Instance type** | The CPU/RAM size of the computer | `t3.small` is comfortable for learning; `t3.micro` is cheaper but needs swap for builds. |
| **EBS volume** | The instance's virtual hard drive | Stores the repo, Next.js build, logs, and SQLite database. |
| **VPC** | Your private network inside AWS | The default VPC is enough for the first deployment. |
| **Subnet** | One section of a VPC | A public subnet lets this learning server reach and be reached from the internet. |
| **Security Group** | A stateful network firewall | Allows only SSH, HTTP, and HTTPS into the server. |
| **Key pair** | Your cryptographic server login | The `.pem` file proves you may SSH into EC2. |
| **Elastic IP** | A public IPv4 address that stays assigned | Lets DNS continue pointing at the server across stop/start cycles. |
| **Route 53** | AWS DNS | Points a domain name such as `covenant.example` to the Elastic IP. |
| **IAM** | Permissions for people and AWS workloads | Protects the AWS account. Covenant itself needs no AWS API credentials in phase one. |
| **CloudWatch** | AWS metrics, logs, and alarms | A later step for CPU alarms and centralized logs. |
| **EBS snapshot** | A point-in-time disk backup | Protects the SQLite cache and server configuration. |

PM2 and Nginx are not AWS services. They are software installed on the Linux
instance:

- **PM2** keeps the two Node processes running and restarts them after crashes
  or reboots.
- **Nginx** listens on public ports 80/443 and proxies to private ports
  3000/4000.

## Follow one request through the system

Understanding these flows makes debugging much easier.

### Flow 1: someone opens the website

```text
Domain DNS → EC2 public IP → Security Group allows 443 → Nginx
           → Nginx proxies to localhost:3000 → Next.js returns the page
```

The Security Group decides whether the packet may reach the computer. Nginx
decides which local application receives it.

### Flow 2: someone donates

```text
Browser → wallet asks for approval → wallet signs transaction
        → Base RPC broadcasts transaction → Covenant contract executes
```

EC2 does not approve the donation and never needs the user's private key. The
frontend helps construct the request; the wallet remains the signer.

### Flow 3: the indexer notices the donation

```text
Indexer → Base RPC asks for new contract events → decodes Donation event
        → inserts one SQLite row → makes it queryable through /api/events
```

This is why the indexer is safe to run without a wallet private key. It only
reads public blockchain data.

## Why we are starting with one EC2 instance

There are easier buttons for publishing a website, but EC2 exposes the useful
layers instead of hiding them. This deployment teaches you:

- what a server actually is;
- how SSH and Linux permissions work;
- how ports, DNS, firewalls, and HTTPS fit together;
- how a reverse proxy routes traffic;
- how long-running processes survive crashes and reboots;
- where application data lives and how it is backed up;
- how code moves from GitHub to a running machine.

One EC2 instance is also easy to reason about. When something breaks, there is
one machine, three processes, and a short chain of checks.

It is not highly available. The server is a single point of failure, deployments
are manual, and SQLite is tied to one disk. Those are acceptable tradeoffs for
the learning deployment, not facts we should hide.

## The learning path

### Phase 0 — Protect the AWS account

Before creating infrastructure:

1. Enable MFA on the AWS root user.
2. Do daily work through an administrative IAM Identity Center user or IAM
   user, not the root user.
3. Create a small monthly AWS Budget with email alerts.
4. Pick one Region and keep every resource there. Use `us-east-1` unless the
   team has a reason to choose another.
5. Never commit AWS access keys, wallet private keys, or seed phrases.

A budget is an alert, not a guaranteed spending cap. Check the Billing dashboard
while learning. AWS pricing and promotional credits change, so verify them in
the console rather than trusting an old tutorial's “free tier” claim.

### Phase 1 — Deploy Covenant manually on EC2

Follow [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md) and deliberately notice what
each step teaches:

| Step | What you do | What you are learning |
|---|---|---|
| Launch EC2 | Choose Linux, CPU/RAM, disk, and network | Servers are configurable resources, not magic URLs. |
| Create Security Group | Open 22, 80, and 443 only | Private-by-default networking and least exposure. |
| SSH | Log into the remote Linux machine | Key-based identity and remote administration. |
| Install Node/Nginx/PM2 | Prepare the runtime | An application needs an operating environment. |
| Clone and build | Turn source code into production output | The server runs committed code, not files sitting on your laptop. |
| Configure environment | Point the app and indexer at Base | Deployment configuration is separate from source code. |
| Start with PM2 | Keep both Node processes alive | Process supervision and restart behavior. |
| Configure Nginx | Route public traffic to local ports | Reverse proxies and one public entry point. |
| Add DNS/HTTPS | Give the server a name and encrypted connection | DNS resolution and TLS certificates. |
| Reboot and test | Prove recovery works | A deployment is not finished until it survives failure. |

### Phase 2 — Learn to operate it

Deployment is only the first day. Practice these tasks:

```bash
# What is running?
pm2 status

# What did the applications say?
pm2 logs covenant-web --lines 100
pm2 logs covenant-indexer --lines 100

# Is Nginx healthy and what did it receive?
sudo nginx -t
sudo systemctl status nginx
sudo tail -n 100 /var/log/nginx/error.log

# Is the server short on RAM or disk?
free -h
df -h

# Can each layer answer locally?
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:4000/health
curl http://127.0.0.1/api/health
```

The order matters. Test the application directly, then Nginx, then the public
internet. That tells you which layer is failing.

### Phase 3 — Make deployment repeatable

The first update is intentionally manual:

```bash
cd ~/covenant
git pull --ff-only
yarn install --frozen-lockfile
yarn workspace @covenant/nextjs build
pm2 restart covenant-indexer
pm2 restart covenant-web
```

This teaches the deployment lifecycle. After you understand it, automate the
same tested sequence with GitHub Actions or AWS CodeDeploy. Automation is much
easier to debug when you already know what it is automating.

### Phase 4 — Evolve toward a production AWS architecture

Do not migrate merely to collect AWS acronyms. Migrate when you understand the
limitation being solved.

```text
EC2 processes       → Docker images
Git checkout on EC2 → ECR image registry
PM2                 → ECS service on Fargate
Nginx               → Application Load Balancer
Certbot             → AWS Certificate Manager
PM2 log files       → CloudWatch Logs
SQLite on one disk  → RDS PostgreSQL or another durable shared store
manual deploy       → CI/CD builds and releases an immutable image
```

The likely production path is:

```text
GitHub → CI builds Docker image → ECR stores image
       → ECS/Fargate runs frontend and indexer containers
       → ALB routes HTTPS traffic
       → CloudWatch stores logs and raises alarms
```

Before running multiple indexer tasks, replace SQLite or design a single-writer
strategy. Two independent containers with separate SQLite files do not share a
consistent cache.

Lambda plus EventBridge Scheduler is another possible indexer design, but it is
a rearchitecture: the current indexer is a long-running Express server with an
in-process polling loop and local SQLite. Learn the working EC2 version before
splitting that behavior into scheduled jobs, an API, and durable storage.

## Environment variables and secrets

The names beginning with `NEXT_PUBLIC_` are deliberately sent to the browser.
They are configuration, not secrets:

| Variable | Used by | Secret? |
|---|---|---|
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID=8453` | Frontend | No |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Frontend | No; it is visible in browser JavaScript |
| `NEXT_PUBLIC_BASE_RPC_URL` | Frontend | Treat provider quotas carefully, but the URL is browser-visible |
| `NEXT_PUBLIC_INDEXER_URL` | Frontend | No; the public base URL of the indexer (e.g. `/api` when served behind the same Nginx, or `http://<IP>/api`). Empty disables the indexer and falls back to on-chain scanning |
| `BASE_RPC_URL` | Indexer | Keep out of Git; it may include a provider API key |
| `CONTRACT_ADDRESS` | Indexer | No |
| `DEPLOY_BLOCK` | Indexer | No |
| `DEPLOYER_PRIVATE_KEY` | Contract deployment only | **Yes — never place this on the EC2 web server** |

Next.js bakes `NEXT_PUBLIC_*` values into the browser bundle during
`yarn build`. Changing `.env.local` without rebuilding will not update the
deployed frontend.

The EC2 instance does not need an IAM access key because the phase-one app does
not call AWS APIs. If a later feature needs S3, CloudWatch APIs, or Secrets
Manager, attach a narrowly scoped IAM role to the instance instead of copying
long-lived AWS keys onto it.

## Networking without the fog

Only three inbound ports should be public:

| Port | Who may reach it | Purpose |
|---|---|---|
| 22 | Your current IP only | SSH administration |
| 80 | Everyone | HTTP and certificate validation; later redirect to HTTPS |
| 443 | Everyone | Normal encrypted website traffic |

Ports 3000 and 4000 should **not** be in the Security Group. They listen on the
server, but Nginx reaches them through `127.0.0.1`, which never leaves the
machine. This shrinks the public attack surface and ensures all web requests go
through one controlled front door.

The Security Group and Nginx solve different problems:

- The Security Group controls whether traffic can enter the EC2 network
  interface at all.
- Nginx accepts allowed web traffic and decides which local app receives it.

## Data, backups, and failure

The SQLite database is stored on the EBS volume. Stopping and starting the
instance preserves EBS data; terminating the instance may delete its root
volume depending on the volume setting.

For this indexer, the blockchain remains the durable source of truth, so a lost
database can be rebuilt. A snapshot is still valuable because rebuilding takes
time and the server also contains configuration. Create an EBS snapshot before
risky server changes and occasionally copy the SQLite file while the indexer is
stopped or use SQLite's backup mechanism.

Learn these failure boundaries:

| Symptom | First checks |
|---|---|
| Browser times out | EC2 state, public IP/DNS, Security Group ports 80/443 |
| Nginx `502 Bad Gateway` | `pm2 status`, then local ports 3000/4000 |
| Website loads but wallet reads fail | browser console, chain ID, Base RPC URL, deployed contract entry |
| `/api/health` fails | indexer PM2 logs, `.env`, RPC reachability, Nginx `/api/` proxy |
| Indexer repeatedly backfills | `DB_PATH`, file permissions, persisted EBS volume, cursor table |
| Build is killed | RAM pressure; add swap or temporarily resize the instance |
| Disk fills | `df -h`, PM2/Nginx logs, old builds, database growth |

## Cost guardrails

For the first deployment, expect cost sources from the running EC2 instance,
EBS storage, public IPv4 address, DNS/domain if used, snapshots, and outbound
data. Exact prices vary by Region and change over time.

Rules that prevent most beginner surprises:

1. Create a budget before launching resources.
2. Tag resources with `Project=Covenant` and `Environment=learning`.
3. Check Cost Explorer after the first day and first week.
4. Stop the instance when a temporary learning environment is not needed.
5. Release unused Elastic IPs; public IPv4 addresses can incur hourly charges.
6. Delete abandoned volumes, snapshots, load balancers, NAT gateways, and test
   databases. Stopping EC2 does not delete every related billable resource.
7. Use the AWS Pricing Calculator before adding ALB, RDS, NAT Gateway, or
   always-on Fargate tasks.

## When you can say “I understand this deployment”

You should be able to answer these without memorizing console clicks:

- Which Covenant data lives on Base, and which data lives on AWS?
- Why can the indexer run without a wallet private key?
- What is the difference between a Security Group and Nginx?
- Why are ports 3000 and 4000 not public?
- What keeps the Node processes alive after you close SSH?
- Why do frontend environment changes require a rebuild?
- What happens when EC2 reboots, stops, or is terminated?
- How would you identify which layer caused a `502`?
- What limitation would Docker/ECS solve, and what would it not solve?
- Why must SQLite change before horizontally scaling the indexer?

If you can explain those, you are learning AWS architecture—not merely
following a deployment recipe.

## What we actually deployed (session record)

This section records the real first deployment so future-us can see what was
done and, more importantly, *what tripped us up and why*. The idealized runbook
above is the clean version; reality had rough edges, and the rough edges are
where the learning is.

### Actual configuration

| Thing | What we used | Note |
|---|---|---|
| Region | `us-east-2` | Whatever the console defaulted to; keep all resources here |
| Instance | `t3.micro` (1 GiB RAM, 2 vCPU) | Free-tier; we added **2 GiB swap** so the Next.js build won't be OOM-killed |
| OS | Amazon Linux 2023 (x86) | |
| Node | 20.20.2 via `dnf install nodejs20` | The runbook prefers nvm/Node 22 — see Gotcha 2 for why |
| Process manager | PM2 7, made reboot-safe via `pm2 startup systemd` | |
| Security group | `launch-wizard-1` (`sg-0156cee43fa38483e`) | Auto-created by the launch wizard |
| Public entry | Nginx :80 → `/api/` to indexer :4000, `/` to Next.js :3000 | No HTTPS yet (next step) |

What is live now: the **full app** behind one Nginx front door.
`http://18.118.131.182/` serves the Next.js frontend and
`http://18.118.131.182/api/*` serves the indexer (`/health`, `/stats`,
`/campaigns/:id`), with all historical events backfilled from `DEPLOY_BLOCK`. Both
run under PM2 and survive reboot. HTTPS and a domain are the next milestone.

### The things that actually bit us (and the lesson each taught)

**1. RPC providers limit how much history you can read at once.**
Backfill crashed instantly on Alchemy's free tier, which caps `eth_getLogs` to a
**10-block** range — covering ~684k blocks would have meant ~68,000 requests. The
public RPC `https://mainnet.base.org` allows **10,000-block** ranges, so the same
backfill took ~75 requests. *Lesson:* the expensive part of indexing is reading
history, and your RPC plan decides that cost. The indexer auto-shrinks its block
chunk if a provider rejects the range, so it survives whatever limit it hits.

**2. How Node is installed decides whether your tools are on `PATH`.**
Installing `nodejs20` via `dnf` placed `npm`, `npx`, and the global `pm2` binary
outside `/usr/bin`, so `npm: command not found` and `pm2: command not found` even
though Node worked. We fixed it by symlinking them into `/usr/local/bin`.
*Lesson:* a Linux package's file layout is not guaranteed to match your `PATH`.
This is exactly why the runbook recommends installing Node through **nvm**, which
sets up `PATH` cleanly and avoids the whole problem.

**3. The Security Group is the firewall — and it fails silently.**
After starting Nginx, the site was unreachable from the internet and `curl` just
timed out (no error, no rejection — a dropped packet). The cause: the inbound
rule for port 80 either wasn't on the security group actually attached to the
instance, or its source was left as "My IP" instead of "Anywhere". We confirmed
the attached group from instance metadata (`launch-wizard-1`), opened port 80 to
`0.0.0.0/0` on *that* group, and it worked immediately. *Lesson:* when traffic
times out, suspect the Security Group first; verify the exact group attached to
the instance and that the source is what you intended.

**4. Amazon Linux's default Nginx server block hijacks port 80.**
Our `conf.d/tracefund.conf` was being ignored — requests hit the distro's default
server (a styled 404 page) instead. The default `server {}` block inside
`/etc/nginx/nginx.conf` was claiming port 80. We removed it so our config became
the active server. *Lesson:* only one server block can be the default listener on
a port; `sudo nginx -T` shows exactly what config is loaded.

**5. Swap alone didn't save the Next.js build — Node had to be told to use it.**
With 2 GiB swap in place, the first `yarn build` still died with *"JavaScript heap
out of memory"* at ~460 MB. Node sizes its heap to about half of physical RAM, so
on a 1 GiB box it capped itself at ~460 MB and gave up *before* touching swap. We
rebuilt with `NODE_OPTIONS=--max-old-space-size=2048`, which let the heap grow
into swap, and it completed. *Lesson:* "add swap" and "raise the heap limit" are
two different knobs — the OS has to offer the memory *and* the runtime has to be
allowed to reach for it.

**6. "My IP" security-group rules break when your IP changes.**
Mid-session, SSH suddenly timed out while the website kept working. Port 80 was
open to `0.0.0.0/0`, but the SSH rule was pinned to "My IP" — and our public IP
had changed, so port 22 was now closed to us. Re-selecting "My IP" on the SSH rule
fixed it instantly. *Lesson:* "My IP" is a moving target; re-pin it when your
network changes, or use SSM Session Manager to avoid an open SSH port entirely.

## Official references

- [Amazon EC2 security groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html)
- [Amazon EC2 key pairs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html)
- [Amazon Linux 2023 on EC2](https://docs.aws.amazon.com/linux/al2023/ug/ec2.html)
- [Creating an AWS cost budget](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html)
- [Creating EBS snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-create-snapshot.html)
- [Amazon VPC and public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [Certbot instructions for Nginx](https://certbot.eff.org/instructions?ws=nginx&os=pip)

