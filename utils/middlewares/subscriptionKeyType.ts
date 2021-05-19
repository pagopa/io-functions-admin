import { IRequestMiddleware } from "@pagopa/ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "@pagopa/ts-commons/lib/responses";
import { SubscriptionKeyTypePayload } from "../../generated/definitions/SubscriptionKeyTypePayload";

/**
 * A middleware that extracts a Subscription key type payload from a request
 */
export const SubscriptionKeyTypeMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  SubscriptionKeyTypePayload
> = request =>
  Promise.resolve(
    SubscriptionKeyTypePayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(SubscriptionKeyTypePayload)
    )
  );
