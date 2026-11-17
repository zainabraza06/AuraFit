# Deployment

Every push to `main` runs: **test -> build and publish images -> end-to-end crash test -> deploy**.
The deploy job SSHes to a Docker host, pulls the images built for that exact commit
(`ghcr.io/<owner>/<repo>/{api,pipeline}:<git sha>`), restarts the stack with
`docker-compose.prod.yml`, then smoke-tests `/api/health` and Prometheus.

## One-time setup

On any Linux server with Docker + the compose plugin (a small VPS is enough for the whole stack, ~4 GB RAM):

1. Open ports 5000 (API), 3000 (Grafana), 9090 (Prometheus). Restrict 9090 and 3000 to your IP if the server is public.
2. Create an SSH key pair, add the public key to the server user's `authorized_keys`.
3. In the GitHub repo: **Settings -> Secrets and variables -> Actions**
   - Variables: `DEPLOY_HOST` (server IP/hostname), `DEPLOY_USER`
   - Secrets: `DEPLOY_SSH_KEY` (the private key), `METRICS_TOKEN` (protects the API's `/metrics`), `GRAFANA_ADMIN_PASSWORD`.
     The deploy job refuses to run without the last two, so a server is never exposed with the dev defaults.
     Use alphanumeric values: Docker Compose interpolates `$` inside `.env` files.
4. Create a GitHub **Environment** named `production` (optionally with required reviewers).
5. Put app secrets (`JWT_SECRET`, API keys) in `~/aurafit/backend/.env` on the server and keep it out of git.

The deploy job is skipped, not failed, while `DEPLOY_HOST` is unset.

## Rollback

Re-run an earlier successful workflow, or on the server:
`IMAGE_PREFIX=ghcr.io/<owner>/<repo> TAG=<old sha> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build`

## Alerts and what to expose

Prometheus evaluates the rules in `observability/alerts.yml` and sends firing alerts to Alertmanager (in `docker-compose.yml`).
Alertmanager sends notifications only if you set one of these in the server's environment (for example in the deploy `.env`):

| Variable | Sends to |
|---|---|
| `ALERT_SLACK_WEBHOOK_URL` | a Slack channel (incoming webhook) |
| `ALERT_WEBHOOK_URL` | any HTTP endpoint (Alertmanager's JSON webhook payload; use it for Discord/Teams relays, PagerDuty adapters, your own handler) |

With neither set, alerts are still evaluated and visible at `:9093` and in Prometheus, but nothing is sent. Webhook delivery was verified with a
synthetic alert; Slack delivery was not (no workspace was available).

**Do not publish ports 9090 (Prometheus), 9093 (Alertmanager) or 3000 (Grafana) to the internet.** Prometheus and Alertmanager have no login; the compose
file maps them for local use. On a server, firewall them or bind them to `127.0.0.1` and reach them through an SSH tunnel or a reverse proxy with authentication.
