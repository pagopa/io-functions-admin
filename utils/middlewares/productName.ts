import { IRequestMiddleware } from "italia-ts-commons/lib/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";
import { ProductNamePayload } from "../../generated/definitions/ProductNamePayload";

/**
 * A middleware that extracts a Subscription key type payload from a request
 */
export const ProductNameMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ProductNamePayload
> = request =>
  Promise.resolve(
    ProductNamePayload.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(ProductNamePayload)
    )
  );
