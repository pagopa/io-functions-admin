import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

import { Service as ApiService } from "@pagopa/io-functions-commons/dist/generated/definitions/Service";
import { IRequestMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { ResponseErrorFromValidationErrors } from "@pagopa/ts-commons/lib/responses";

import { Logo as ApiLogo } from "../../generated/definitions/Logo";

/**
 * A middleware that extracts a Service payload from a request.
 */
export const ServicePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiService
> = async request =>
  pipe(
    ApiService.decode(request.body),
    E.mapLeft(ResponseErrorFromValidationErrors(ApiService))
  );

/**
 * A middleware that extracts a Logo payload from a request.
 */
export const LogoPayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiLogo
> = async request =>
  pipe(
    ApiLogo.decode(request.body),
    E.mapLeft(ResponseErrorFromValidationErrors(ApiService))
  );
