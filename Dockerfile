FROM node:14.18.0

## TEMPORAL WORKER DOCKERFILE

COPY . .
RUN yarn build
RUN yarn install --frozen-lockfile

CMD ["yarn", "run", "temporal-worker"]
