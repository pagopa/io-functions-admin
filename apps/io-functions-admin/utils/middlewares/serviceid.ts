import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";

/**
 * A middleware that extracts the serviceId value from the URL path parameter.
 */
export const ServiceIdMiddleware = RequiredParamMiddleware(
  "serviceId",
  ServiceId
);
