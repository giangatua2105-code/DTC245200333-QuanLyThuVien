FROM node:22.16.0-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /logs && chown node:node /logs
COPY --chown=node:node app ./app
USER node
EXPOSE 3000
CMD ["sh","-c","node app/init.js && exec node app/server.js"]
