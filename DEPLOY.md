# Deploying the online demo

The demo is the normal Docker stack on a small Linux VM, published through a free
Cloudflare quick tunnel (`https://<random>.trycloudflare.com`):
- No ports are opened on the VM besides SSH.
- The default IRIS passwords are replaced.
- Judges sign in with a published `demo` account.
- A nightly reset rebuilds IRIS from scratch, so the demo recovers from anything a
  visitor changes.

## 1. Create the VM

- Ubuntu 24.04 LTS, **x86-64**, **2 vCPU, 4 GB RAM** (the Docker build needs it), 30 GB disk.
  For example Hetzner CX22, DigitalOcean 4 GB Droplet, or AWS Lightsail 4 GB.
- Add your SSH key, then connect: `ssh root@<vm-ip>`.

## 2. Install Docker and lock down the firewall

```bash
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw --force enable
```

Only SSH is allowed in. The tunnel connects *out* to Cloudflare, so no web port is needed.

## 3. Get the code and set the passwords

```bash
git clone https://github.com/Fruitkwan/IRIS_Mission_Control.git /opt/irisops
cd /opt/irisops
cat > .env.demo <<EOF
IRISOPS_ADMIN_PASSWORD=$(openssl rand -base64 18)
IRISOPS_DEMO_PASSWORD=choose-a-demo-password
EOF
chmod 600 .env.demo
```

- `IRISOPS_ADMIN_PASSWORD` replaces the `_SYSTEM`, `Admin` and `SuperUser`
  passwords. Keep it private; it's stored only in `.env.demo`.
- `IRISOPS_DEMO_PASSWORD` is the password you **publish** for the `demo` account
  (8+ characters).

## 4. Start the stack

```bash
set -a; . ./.env.demo; set +a
docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build
```

The first build takes 5–10 minutes. Wait until IRIS reports healthy:

```bash
docker inspect -f '{{.State.Health.Status}}' irisops
```

Then replace the default passwords and create the demo account:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml exec -T \
  -e IRISOPS_ADMIN_PASSWORD -e IRISOPS_DEMO_PASSWORD iris \
  iris session IRIS -U %SYS < scripts/demo-setup.script
```

It should print "password replaced" for the three built-in accounts and
`demo: ready (%Manager)`.

## 5. Get the public URL

```bash
docker logs irisops-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```

The demo is at **`<that URL>/irisops/`**. Sign in as `demo` with the demo password.

## 6. Nightly reset

```bash
chmod +x scripts/demo-reset.sh
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/irisops/scripts/demo-reset.sh >> /var/log/irisops-demo-reset.log 2>&1") | crontab -
```

The reset replaces the IRIS data volume and re-applies the passwords. It leaves the
tunnel running, so **the URL stays the same**. Run `scripts/demo-reset.sh` by hand at
any time if the demo gets broken.

## 7. Publish the link

Put `<URL>/irisops/` and the demo credentials (`demo` / your demo password) in:
- the README (the placeholder under the badges)
- the Open Exchange **Demo URL** field
- the article

## Permanent URL on your own domain (recommended)

A quick tunnel's URL changes whenever the tunnel restarts. A named tunnel keeps a
fixed address such as `https://demo.yourdomain.com`. It needs a domain in your
Cloudflare account; you can buy one under **Domain Registration** in the Cloudflare
dashboard. Dashboard labels may differ slightly.

1. **Create the tunnel:** Cloudflare dashboard → **Zero Trust** → **Networks →
   Tunnels** → **Create a tunnel** → type **Cloudflared** → name it `irisops-demo`.
2. **Copy the token.** On the install page, copy only the long token after
   `--token` in any of the install commands. Don't run the install command; Docker
   runs cloudflared for you.
3. **Add a public hostname:**
   - Subdomain `demo`
   - Your domain
   - Service type **HTTP**
   - URL **`iris:52773`** (the IRIS container's name on the Docker network)
4. **On the VM,** add the token to `.env.demo` and start with the extra override
   file. Use this instead of the step 4 command; the rest of the steps are the same:

   ```bash
   echo 'TUNNEL_TOKEN=<paste the token>' >> .env.demo
   set -a; . ./.env.demo; set +a
   docker compose -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.named-tunnel.yml up -d --build
   ```

The demo is then at `https://demo.yourdomain.com/irisops/`. `scripts/demo-reset.sh`
picks up the named tunnel automatically when `TUNNEL_TOKEN` is in `.env.demo`. Skip
step 5; the URL is the hostname you chose.

## Things to know

- **A quick-tunnel URL changes if the tunnel container restarts** (a VM reboot, or
  `docker compose down`). Run step 5 again and update the links, or use a named
  tunnel (above).
- **Quick tunnels have no uptime guarantee.** Cloudflare intends them for testing.
  They're fine for a contest demo; check the link now and then during voting.
- **`demo` is an administrator (`%Manager`),** so judges can try the safe fixes.
  That also means a visitor can change or break things until the next reset.
- **Brief window during a reset:** for about a minute, while IRIS starts, the
  default password is active until the setup script runs. Schedule the reset at
  a quiet hour.
- **The MCP page won't reach MCP.** MCP is not exposed publicly, so the portal's MCP
  Server page will show it as unreachable. The video demonstrates MCP.
