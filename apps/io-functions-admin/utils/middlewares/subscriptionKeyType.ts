import { IRequestMiddleware } from "@pagopa/ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "@pagopa/ts-commons/lib/responses";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

import { SubscriptionKeyTypePayload } from "../../generated/definitions/SubscriptionKeyTypePayload";

/**
 * A middleware that extracts a Subscription key type payload from a request
 */
export const SubscriptionKeyTypeMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  SubscriptionKeyTypePayload
> = async request =>
  pipe(
    SubscriptionKeyTypePayload.decode(request.body),
    E.mapLeft(ResponseErrorFromValidationErrors(SubscriptionKeyTypePayload))
  );
