# Image the agent works in during GitHub Copilot trials. The same base, git and git
# settings as images/trial/Dockerfile, with GitHub Copilot CLI in place of Claude Code.
#   Base: node:24-trixie-slim (Node.js 24.22.2, Debian 13), by digest
#   git:  1:2.47.3-0+deb13u1 (Debian package)
#   GitHub Copilot CLI: 1.0.105
FROM node:24-trixie-slim@sha256:54f84b4cf8432b21aaffd5d3ce8d41e12cea0d10d33c09d2f3c9879d49d6b446

RUN apt-get update \
 && apt-get install -y --no-install-recommends git=1:2.47.3-0+deb13u1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @github/copilot@1.0.105 && npm cache clean --force

# The agent's git settings, as in images/trial/Dockerfile.
RUN git config --system init.defaultBranch main \
 && git config --system core.autocrlf false \
 && git config --system user.name 'tgit agent' \
 && git config --system user.email agent@example.com \
 && git config --system safe.directory '*'

USER node
WORKDIR /home/node
