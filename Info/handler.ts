import * as express from "express";
import { toError, tryCatch2v } from "fp-ts/lib/Either";
import { wrapRequestHandler } from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseSuccessJson,
  IResponseErrorInternal,
  ResponseErrorInternal
} from "italia-ts-commons/lib/responses";
import * as packageJson from "../package.json";
import { IConfig } from "../utils/config";

interface IInfo {
  version: string;
}

type InfoHandler = () => Promise<
  IResponseSuccessJson<IInfo> | IResponseErrorInternal
>;

export function InfoHandler({
  getConfig
}: {
  getConfig: () => IConfig;
}): InfoHandler {
  return async () => {
    return tryCatch2v(getConfig, toError).fold<
      IResponseSuccessJson<IInfo> | IResponseErrorInternal
    >(
      problem => ResponseErrorInternal(problem.message),
      _ =>
        ResponseSuccessJson({
          version: packageJson.version
        })
    );
  };
}

export function Info({
  getConfig
}: {
  getConfig: () => IConfig;
}): express.RequestHandler {
  const handler = InfoHandler({ getConfig: getConfig });

  return wrapRequestHandler(handler);
}
