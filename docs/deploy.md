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
   - Secret: `DEPLOY_SSH_KEY` (the private key)
4. Create a GitHub **Environment** named `production` (optionally with required reviewers).
5. Put app secrets (`JWT_SECRET`, API keys) in `~/aurafit/backend.env` on the server and keep it out of git.

The deploy job is skipped, not failed, while `DEPLOY_HOST` is unset.

## Rollback

Re-run an earlier successful workflow, or on the server:
`IMAGE_PREFIX=ghcr.io/<owner>/<repo> TAG=<old sha> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build`
