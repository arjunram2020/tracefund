# Deploying Covenant on AWS EC2

This is the hands-on runbook for deploying Covenant's **Next.js frontend** and
**event indexer/API** on one Amazon Linux 2023 EC2 instance.

If AWS is new to you, first read [Learning AWS by deploying Covenant](./AWS_FOR_BEGINNERS.md).
It explains what every component does and why this architecture was chosen.

## Target architecture

```text
Base Mainnet ──events──► Covenant indexer :4000 ──► SQLite on EBS
       ▲                         ▲
       │                         │ /api/*
       │ RPC                     │
Browser ──HTTP/HTTPS──► Nginx :80/:443 ──/──► Next.js :3000
```

Everything inside the right side of the diagram runs on one EC2 instance. Only
Nginx and SSH are reachable from the internet. Ports 3000 and 4000 remain
private to the machine.

## Before touching AWS

Confirm the application works locally and that everything needed by the server
has been committed and pushed. EC2 can only clone files that exist in the
remote repository; it cannot see uncommitted files on your laptop.

From the repository root on your Mac:

```bash
git status
yarn install --frozen-lockfile
yarn workspace @covenant/nextjs build
yarn workspace @covenant/nextjs typecheck
```

> **Resolved (June 30, 2026):** an earlier incomplete rename used to fail the
> typecheck — `useCovenant.ts` imported `getTraceFund`/`traceFundAbi` and exported
> `useTraceFundWrite`, while the rest of the frontend expected the Covenant names.
> These were aligned to `getCovenant`/`covenantAbi`/`useCovenantWrite` and
> `yarn workspace @covenant/nextjs typecheck` now passes. Always run the preflight
> commands above before deploying: AWS cannot turn a failing local build into a
> working production build.

Also confirm:

- the Base deployment exists in
  `packages/nextjs/contracts/deployedContracts.json` under chain ID `8453`;
- `packages/indexer` is committed and pushed;
- you know the Base contract address and deployment block;
- you have a WalletConnect project ID if mobile wallet connections are needed;
- you have a Base RPC URL for the frontend and indexer.

Do **not** copy a deployer private key, seed phrase, or donor key to this server.
The website and indexer do not need them.

## Stage 0 — Protect the account and costs

1. Enable MFA on the AWS root user.
2. Create an administrative IAM Identity Center user or IAM user for daily work.
3. Open **Billing and Cost Management → Budgets → Create budget**.
4. Create a small monthly cost budget with email alerts at multiple thresholds.
5. Select one Region in the console. This guide uses **US East (N. Virginia),
   `us-east-1`**. Keep every Covenant resource in that Region.

Do not assume EC2 is free because a tutorial says so. AWS account promotions,
credits, and prices change. The console shows what your account currently
qualifies for. A budget alerts you; it does not automatically stop all spending.

## Stage 1 — Launch the EC2 instance

In the AWS Console, search for **EC2**, open it, and choose **Launch instance**.

### Instance choices

| Setting | Choose | Why |
|---|---|---|
| Name | `covenant-learning` | Clear resource name |
| AMI | Amazon Linux 2023, 64-bit x86 | Current AWS Linux and compatible with `t3` |
| Instance type | `t3.small` recommended | 2 GiB RAM makes installing and building Next.js less frustrating |
| Cheaper alternative | `t3.micro` | 1 GiB RAM; add swap before building |
| Key pair | New RSA `.pem`, named `covenant-ec2` | Used for SSH from macOS/Linux |
| Storage | 20 GiB `gp3`, encrypted | Holds the OS, repo, builds, logs, and SQLite |

`t3.small` is the smoother first deployment. Use `t3.micro` if minimizing cost
matters more than build speed; Stage 4 shows how to add swap.

Add tags if the launch screen exposes them:

```text
Project = Covenant
Environment = learning
```

### Network and firewall

Use the default VPC and a public subnet for this first deployment. Enable a
public IPv4 address.

Create a Security Group named `covenant-web-sg` with exactly these inbound
rules:

| Type | Port | Source | Reason |
|---|---:|---|---|
| SSH | 22 | **My IP** | Only your current network can administer the server |
| HTTP | 80 | `0.0.0.0/0` and `::/0` | Public website and certificate validation |
| HTTPS | 443 | `0.0.0.0/0` and `::/0` | Encrypted public website |

Do not open 3000 or 4000. Nginx reaches those ports locally.

Launch the instance. Wait until its state is **Running** and both status checks
pass.

## Stage 2 — Connect with SSH

AWS stored the public half of the key on EC2. Your downloaded `.pem` is the
private half. Keep it private and do not commit it.

On your Mac, from the directory containing the key:

```bash
chmod 400 covenant-ec2.pem
ssh -i covenant-ec2.pem ec2-user@<PUBLIC_IPV4>
```

Find `<PUBLIC_IPV4>` on the EC2 instance details page. If SSH times out:

- confirm the instance is running;
- confirm you copied the current public IP;
- update the Security Group's SSH source if your home/public IP changed;
- confirm the key pair name matches the instance.

When your terminal prompt changes to something like
`[ec2-user@ip-... ~]$`, commands run on AWS, not your Mac.

## Stage 3 — Update Linux and install the runtime

Run these commands through the SSH session:

```bash
sudo dnf update -y
sudo dnf install -y git nginx gcc-c++ make python3 python3-devel augeas-libs

# Install nvm, then Node.js 22.
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22

# This repository uses Yarn 1, and PM2 supervises the Node processes.
npm install --global yarn@1.22.22 pm2

node --version
yarn --version
pm2 --version
nginx -v
```

Why Node 22? It is a maintained LTS line compatible with this application.
Node 20 reached end of life in 2026 and should not be the basis of a new server.

## Stage 4 — Add swap on a `t3.micro`

Skip this stage on `t3.small` unless a build actually runs out of memory.

Swap lets Linux use disk as slow overflow memory. It is not a substitute for
RAM under steady load, but it prevents occasional Next.js builds from being
killed on a 1 GiB learning instance.

```bash
sudo dd if=/dev/zero of=/swapfile bs=128M count=16
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
free -h
```

The final command should show approximately 2 GiB of swap.

## Stage 5 — Clone and install Covenant

The GitHub repository still uses its historical `tracefund` URL. Clone it into
a directory named `covenant`; the repository URL does not determine the product
name.

```bash
cd ~
git clone https://github.com/arjunram2020/tracefund.git covenant
cd ~/covenant
yarn install --frozen-lockfile
```

Verify that the server received both applications:

```bash
test -f packages/nextjs/package.json && echo "frontend present"
test -f packages/indexer/src/index.js && echo "indexer present"
```

If the second check prints nothing, the indexer was not committed and pushed.
Do not invent missing files on EC2; return to the laptop, commit/push them, then
pull again.

## Stage 6 — Configure and start the indexer

The indexer is read-only. It reads public Covenant events from Base, writes a
local SQLite cache, and exposes an HTTP API.

```bash
cd ~/covenant/packages/indexer
cp .env.example .env
chmod 600 .env
nano .env
```

The production values should look like this:

```dotenv
BASE_RPC_URL=https://your-base-rpc-provider.example/v2/your-key
CONTRACT_ADDRESS=0xYourDeployedCovenantAddress
DEPLOY_BLOCK=YourDeploymentBlock
PORT=4000
DB_PATH=./covenant.db
CHUNK_SIZE=5000
POLL_INTERVAL_MS=12000
```

Check the contract address and deployment block against the Base deployment.
Starting too early wastes RPC requests; starting too late omits earlier events
from the cache until you reset and rebuild it.

Start the process:

```bash
cd ~/covenant/packages/indexer
pm2 start src/index.js --name covenant-indexer --time
pm2 logs covenant-indexer --lines 100
```

Press `Ctrl-C` to stop watching logs; PM2 keeps the process running. Test it
from inside EC2:

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/stats
```

A healthy response contains `"ok":true`. The indexed block may advance while
the initial backfill runs.

## Stage 7 — Configure, build, and start Next.js

Create the frontend environment before building because Next.js embeds
`NEXT_PUBLIC_*` values into the browser bundle at build time.

```bash
cd ~/covenant/packages/nextjs
touch .env.local
chmod 600 .env.local
nano .env.local
```

Add:

```dotenv
NEXT_PUBLIC_DEFAULT_CHAIN_ID=8453
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_BASE_RPC_URL=https://your-base-rpc-provider.example/v2/your-key
# Base URL of the indexer. Because Nginx serves both apps from one origin,
# a relative path works in production and avoids CORS:
NEXT_PUBLIC_INDEXER_URL=/api
```

`NEXT_PUBLIC_INDEXER_URL` tells the frontend's `useActivity` hook where to load
campaign history. When set, history comes from the indexer in one request; if it
is empty or the indexer is down, the hook falls back to scanning Base directly.
Using the relative `/api` means the browser calls the same Nginx that served the
page, so there is no cross-origin request to configure.

These `NEXT_PUBLIC_*` values are browser-visible. Never put a wallet private key
or seed phrase in one of them.

Build and start the production server:

```bash
cd ~/covenant
yarn workspace @covenant/nextjs build

pm2 start yarn \
  --name covenant-web \
  --time \
  --cwd /home/ec2-user/covenant/packages/nextjs \
  -- start

pm2 status
curl -I http://127.0.0.1:3000
```

The curl command should return an HTTP response. Port 3000 is deliberately not
public; we are proving the frontend works from inside the instance.

## Stage 8 — Make PM2 survive reboot

```bash
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

PM2 prints a `sudo ...` command. Copy and run that exact generated command,
then run:

```bash
pm2 save
```

This creates a systemd service that restores the saved PM2 process list after
the EC2 instance reboots.

## Stage 9 — Configure Nginx

Amazon Linux ships a default Nginx server block in `/etc/nginx/nginx.conf`.
Back it up, then edit that existing block rather than creating a competing
default server.

```bash
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
sudo nano /etc/nginx/nginx.conf
```

Inside the `http { ... }` section, find the uncommented default `server { ... }`
block that listens on port 80. Replace that **server block only** with:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location /api/ {
        # The trailing slash strips /api before forwarding:
        # /api/health becomes /health on the indexer.
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Validate before reloading. Never reload a broken Nginx configuration.

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

curl -I http://127.0.0.1/
curl http://127.0.0.1/api/health
```

Now open `http://<PUBLIC_IPV4>` in a browser. Also test:

```text
http://<PUBLIC_IPV4>/api/health
```

If you see the default Nginx page, re-check that you replaced the active
uncommented server block and use `sudo nginx -T` to inspect the loaded config.

## Stage 10 — Give the server a stable address

An automatically assigned public IP can change when EC2 is stopped and started.
For a real domain, allocate an Elastic IP:

1. EC2 → **Elastic IP addresses** → **Allocate Elastic IP address**.
2. Select it → **Actions → Associate Elastic IP address**.
3. Associate it with `covenant-learning`.
4. Test the new IP in the browser.

Public IPv4 addresses can incur hourly charges whether they are ordinary EC2
public addresses or Elastic IPs. Release an Elastic IP when it is no longer
needed; do not leave it unattached.

## Stage 11 — Add DNS

You need a domain before issuing a normal browser-trusted HTTPS certificate.

If the domain uses Route 53:

1. Open **Route 53 → Hosted zones** and select the domain.
2. Choose **Create record**.
3. Create an `A` record such as `app.yourdomain.com` pointing to the Elastic IP.
4. Wait for DNS to propagate.
5. Verify from your Mac:

   ```bash
   dig +short app.yourdomain.com
   ```

The result should be the Elastic IP. If the domain is registered elsewhere,
create the same `A` record at that DNS provider instead.

Return to `/etc/nginx/nginx.conf` and change:

```nginx
server_name _;
```

to:

```nginx
server_name app.yourdomain.com;
```

Then validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Stage 12 — Add HTTPS with Certbot

Only do this after the domain resolves to EC2 and port 80 works publicly.
Amazon Linux 2023 does not use the old Amazon Linux 2 EPEL instructions found
in many tutorials. Use Certbot's Python virtual-environment installation:

```bash
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install --upgrade pip
sudo /opt/certbot/bin/pip install certbot certbot-nginx
sudo ln -s /opt/certbot/bin/certbot /usr/local/bin/certbot

sudo certbot --nginx -d app.yourdomain.com
```

Choose the HTTPS redirect when prompted. Then test renewal:

```bash
sudo certbot renew --dry-run
```

Schedule renewal twice daily. Certbot exits quickly when nothing needs renewal:

```bash
sudo dnf install -y cronie
sudo systemctl enable --now crond
sudo crontab -e
```

Add this one line to root's crontab, save, and exit:

```cron
17 3,15 * * * /usr/local/bin/certbot renew --quiet
```

Use [Certbot's official Nginx instructions](https://certbot.eff.org/instructions?ws=nginx&os=pip)
as the authority if its installation or renewal guidance changes. Certificate
issuance is not complete until `renew --dry-run` succeeds.

Finally open:

```text
https://app.yourdomain.com
https://app.yourdomain.com/api/health
```

## Stage 13 — Prove recovery works

A process appearing once is not enough. Reboot the server:

```bash
sudo reboot
```

Wait a minute, SSH back in, then run:

```bash
pm2 status
sudo systemctl status nginx --no-pager
curl http://127.0.0.1:4000/health
curl -I http://127.0.0.1:3000
curl http://127.0.0.1/api/health
```

The frontend, indexer, and Nginx should all return without being manually
started. This validates PM2's saved process list and Nginx's systemd service.

## Updating Covenant later

Before every deployment, understand what changed. Database or environment
changes may need extra steps. For a normal code update:

```bash
ssh -i covenant-ec2.pem ec2-user@<ELASTIC_IP>
cd ~/covenant

git pull --ff-only
yarn install --frozen-lockfile
yarn workspace @covenant/nextjs build

pm2 restart covenant-indexer
pm2 restart covenant-web
pm2 save

curl http://127.0.0.1/api/health
curl -I http://127.0.0.1/
```

If `.env.local` changed, rebuild before restarting the frontend. If the indexer
`.env` changed, restart `covenant-indexer` with:

```bash
pm2 restart covenant-indexer --update-env
```

## Logs and troubleshooting

```bash
# Process state and application output
pm2 status
pm2 logs covenant-web --lines 100
pm2 logs covenant-indexer --lines 100

# Nginx configuration, service, and errors
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo tail -n 100 /var/log/nginx/error.log

# Listening ports
sudo ss -lntp

# Memory and disk
free -h
df -h
```

Debug from the inside out:

1. `curl 127.0.0.1:3000` — is Next.js alive?
2. `curl 127.0.0.1:4000/health` — is the indexer alive?
3. `curl 127.0.0.1/api/health` — is Nginx routing correctly?
4. Request the public IP/domain — are DNS and the Security Group correct?

A `502 Bad Gateway` usually means Nginx is alive but the upstream process is
not. A timeout usually points toward EC2 state, IP/DNS, or the Security Group.

### Gotchas hit during the first deployment

These are real issues from the initial bring-up; check them when symptoms match.

- **Public requests time out (no error, just hang).** The inbound rule was not on
  the Security Group actually attached to the instance, or its source was left as
  "My IP" instead of `0.0.0.0/0`. Confirm the attached group from inside the box,
  then fix that exact group:
  ```bash
  TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 120")
  curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/security-groups
  ```
- **Nginx serves a styled default 404 instead of your routes.** Amazon Linux's
  `/etc/nginx/nginx.conf` ships an uncommented default `server {}` on port 80 that
  wins over `conf.d/*.conf`. Remove that default server block, then confirm only
  your block is loaded with `sudo nginx -T | grep -n "server\|listen\|proxy_pass"`.
- **`npm: command not found` / `pm2: command not found` after installing Node via
  `dnf`.** The `nodejs20` RPM places binaries outside `/usr/bin`. Either install
  Node through nvm (recommended, Stage 3) or symlink the binaries:
  ```bash
  sudo ln -sf /usr/bin/npm-20 /usr/bin/npm
  sudo ln -sf /usr/lib/nodejs20/lib/node_modules/pm2/bin/pm2 /usr/local/bin/pm2
  ```

## Backups and cleanup

The SQLite file normally lives at:

```text
/home/ec2-user/covenant/packages/indexer/covenant.db
```

The blockchain can rebuild it, but an EBS snapshot saves time and preserves the
rest of the server configuration. In the EC2 console, select the instance's EBS
volume and choose **Actions → Create snapshot** before risky infrastructure
changes.

Know the lifecycle terms:

- **Reboot:** same instance and disk; processes should return automatically.
- **Stop:** compute billing stops, EBS remains, and a non-Elastic public IP can
  change at next start.
- **Terminate:** deletes the instance; the root EBS volume is commonly deleted
  too. Treat termination as destructive and verify snapshots first.

## Verified deployment record

The runbook above is the clean, recommended path. For transparency, this is what
the first working deployment actually used, so the architecture is demonstrably
real and not just theoretical:

| Item | Value |
|---|---|
| Region | `us-east-2` |
| Instance type | `t3.micro` (1 GiB RAM) + 2 GiB swap |
| OS | Amazon Linux 2023 (x86) |
| Node | 20.x via `dnf` (the runbook now recommends nvm/Node 22 instead) |
| Reverse proxy | Nginx :80 → `/api/` → indexer :4000, `/` → Next.js :3000 |
| Process supervision | PM2 7 (`indexer` + `frontend`) with `pm2 startup systemd` (survives reboot) |
| Frontend build | `NODE_OPTIONS=--max-old-space-size=2048 yarn workspace @covenant/nextjs build` (see OOM note) |
| HTTPS / domain | Not yet configured (Stages 10–12 are the next milestone) |

> **OOM during the frontend build (real gotcha).** On the 1 GiB instance the
> first `yarn build` died with *"JavaScript heap out of memory"* at ~460 MB —
> Node auto-sizes its old-space heap to roughly half of physical RAM, so it hit
> its self-imposed ceiling and aborted *before* using the 2 GiB swap. Raising the
> ceiling with `NODE_OPTIONS=--max-old-space-size=2048` let V8 grow into swap and
> the build completed (slower, but it finished). Swap is necessary but not
> sufficient: Node also has to be allowed to use it.

Live indexer endpoints proven during bring-up:

```text
GET /api/health         → {"ok":true,"lastIndexedBlock":<n>}
GET /api/stats          → total event count and per-type counts
GET /api/campaigns/:id  → a campaign's full chronological audit trail
```

All historical Covenant events were backfilled from `DEPLOY_BLOCK` using the
public Base RPC (`https://mainnet.base.org`, 10,000-block `getLogs` ranges)
because Alchemy's free tier caps ranges at 10 blocks. The frontend's `useActivity`
hook reads `/api/campaigns/:id` first and falls back to direct on-chain scanning
if the indexer is unavailable.

When the learning environment is finished, review and deliberately delete or
retain the EC2 instance, EBS volume, snapshots, Elastic IP, Route 53 hosted zone,
and domain. Stopping one resource does not automatically remove the others.

## What this deployment does not provide

This one-server version has no automatic horizontal scaling, load balancer,
multi-instance failover, managed database, immutable releases, or centralized
CloudWatch logs. It is an excellent first deployment because every layer is
visible.

After this works and you can explain it, the next architecture lesson is:

```text
Docker → ECR → ECS/Fargate → Application Load Balancer
       → CloudWatch → durable shared database
```

That evolution is explained in [Learning AWS by deploying Covenant](./AWS_FOR_BEGINNERS.md).

## Official references

- [Amazon EC2 security groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html)
- [Amazon EC2 key pairs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html)
- [Amazon Linux 2023 on EC2](https://docs.aws.amazon.com/linux/al2023/ug/ec2.html)
- [Creating an AWS cost budget](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html)
- [Creating EBS snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-create-snapshot.html)
- [Public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
