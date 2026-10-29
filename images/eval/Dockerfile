# Image for validating the tests and evaluating trial results (experiment-design.md 13.4).
# Same base and git as the trial image (images/trial/Dockerfile), plus TypeScript for `tsc --checkJs`.
# TypeScript is kept out of the trial image so that the JavaScript condition has no global tsc.
#   TypeScript: 7.0.2, @types/node: 24.19.2
FROM node:24-trixie-slim@sha256:54f84b4cf8432b21aaffd5d3ce8d41e12cea0d10d33c09d2f3c9879d49d6b446

RUN apt-get update \
 && apt-get install -y --no-install-recommends git=1:2.47.3-0+deb13u1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g typescript@7.0.2 @types/node@24.19.2 && npm cache clean --force

USER node
WORKDIR /home/node
