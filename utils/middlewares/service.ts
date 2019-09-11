import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { IRequestMiddleware } from "io-functions-commons/dist/src/utils/request_middleware";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";

/**
 * A middleware that extracts a Service payload from a request.
 */
export const ServicePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ApiService
> = request =>
  Promise.resolve(
    ApiService.decode(request.body).mapLeft(
      ResponseErrorFromValidationErrors(ApiService)
    )
  );
