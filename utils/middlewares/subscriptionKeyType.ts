import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { SubscriptionKeyTypePayload } from "../../generated/definitions/SubscriptionKeyTypePayload";

/**
 * A middleware that extracts a Subscription key type payload from a request
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SubscriptionKeyTypeMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  SubscriptionKeyTypePayload
> = request =>
  Promise.resolve(
    SubscriptionKeyTypePayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(SubscriptionKeyTypePayload)
    )
  );
