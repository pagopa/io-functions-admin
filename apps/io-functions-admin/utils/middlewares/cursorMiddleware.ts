import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { IRequestMiddleware } from "@pagopa/ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "@pagopa/ts-commons/lib/responses";
/**
 * A middleware that extracts a cursor value from a request query string.
 */
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

export const CursorMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  NonNegativeInteger | undefined
> = async request =>
  request.query.cursor
    ? pipe(
        Number(request.query.cursor),
        NonNegativeInteger.decode,
        E.mapLeft(ResponseErrorFromValidationErrors(NonNegativeInteger))
      )
    : E.right(undefined);
