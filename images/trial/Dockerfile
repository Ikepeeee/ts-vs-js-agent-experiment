# Image the agent works in during trials (experiment-design.md chapter 5). Everything that affects results is pinned here.
# The evaluation image (images/eval/Dockerfile) starts from the same base and git.
#   Base: node:24-trixie-slim (Node.js 24.22.2, Debian 13), by digest
#   git:  1:2.47.3-0+deb13u1 (Debian package)
#   Claude Code: 2.1.302
FROM node:24-trixie-slim@sha256:54f84b4cf8432b21aaffd5d3ce8d41e12cea0d10d33c09d2f3c9879d49d6b446

RUN apt-get update \
 && apt-get install -y --no-install-recommends git=1:2.47.3-0+deb13u1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code@2.1.302 && npm cache clean --force

# The agent's git settings, so its home starts empty. System-level: tgit's difftest runs
# with GIT_CONFIG_NOSYSTEM=1, so its comparisons never see them. safe.directory: the home
# is created by the host and can appear in the container under another owner.
RUN git config --system init.defaultBranch main \
 && git config --system core.autocrlf false \
 && git config --system user.name 'tgit agent' \
 && git config --system user.email agent@example.com \
 && git config --system safe.directory '*'

USER node
WORKDIR /home/node
