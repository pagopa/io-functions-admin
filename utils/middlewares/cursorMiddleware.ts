/**
 * A middleware that extracts a cursor value from a request query string.
 */
import { right } from "fp-ts/lib/Either";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { IRequestMiddleware } from "@pagopa/ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "@pagopa/ts-commons/lib/responses";

export const CursorMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  NonNegativeInteger
> = request =>
  Promise.resolve(
    request.query.cursor
      ? NonNegativeInteger.decode(Number(request.query.cursor)).mapLeft(
          ResponseErrorFromValidationErrors(NonNegativeInteger)
        )
      : right(undefined)
  );
