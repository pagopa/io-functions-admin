/**
 * A middleware that extracts a skip value from a request query string.
 */
import { right } from "fp-ts/lib/Either";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";

export const SkipMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  NonNegativeInteger
> = request =>
  Promise.resolve(
    request.query.skip
      ? NonNegativeInteger.decode(Number(request.query.skip)).mapLeft(
          ResponseErrorFromValidationErrors(NonNegativeInteger)
        )
      : right(undefined)
  );
