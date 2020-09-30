import * as express from "express";
import { wrapRequestHandler } from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseSuccessJson,
  IResponseErrorInternal,
  ResponseErrorInternal
} from "italia-ts-commons/lib/responses";
import * as packageJson from "../package.json";
import { checkApplicationHealth, HealthCheck } from "../utils/healthcheck";

interface IInfo {
  version: string;
}

type InfoHandler = () => Promise<
  IResponseSuccessJson<IInfo> | IResponseErrorInternal
>;

export function InfoHandler(healthCheck: () => HealthCheck): InfoHandler {
  return () =>
    healthCheck()
      .fold<IResponseSuccessJson<IInfo> | IResponseErrorInternal>(
        problems => ResponseErrorInternal(problems.join("\n")),
        _ =>
          ResponseSuccessJson({
            version: packageJson.version
          })
      )
      .run();
}

export function Info(): express.RequestHandler {
  const handler = InfoHandler(checkApplicationHealth);

  return wrapRequestHandler(handler);
}
