# Use the official lightweight Node.js image.
# https://hub.docker.com/_/node
FROM docker.io/node:lts-slim

ENV NODE_ENV production

ARG DEBIAN_FRONTEND="noninteractive"
RUN apt-get update -y \
	&& apt-get install -y tini

WORKDIR /usr/src/app
RUN npm install -g npm@latest

COPY dist/apps/fetcher/package*.json ./
RUN npm install --omit=dev

COPY dist/apps/fetcher/main.js ./

ENTRYPOINT ["/usr/bin/tini", "--"]

RUN chown -R node:node .
USER node

# Restart the fetcher every 24h for memory leaks.
CMD [ "node", "main.js", "-e", "24" ]