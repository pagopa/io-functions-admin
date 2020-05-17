FROM node:10.14.2-alpine

WORKDIR /opt/cosmosdb

RUN npm install -g ts-node typescript && \
    npm install documentdb @types/documentdb io-functions-commons \
                io-ts@1.8.5 fp-ts@1.12.0 italia-ts-commons

COPY docker/fixtures/index.ts /opt/cosmosdb

CMD ["sh", "-c", "ts-node index"]
