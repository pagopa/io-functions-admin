/**
 * A middleware that extracts a cursor value from a request query string.
 */
import { right } from "fp-ts/lib/Either";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";

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
