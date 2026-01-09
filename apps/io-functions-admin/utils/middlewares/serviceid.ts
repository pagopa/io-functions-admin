import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";

/**
 * A middleware that extracts the serviceid value from the URL path parameter.
 */
export const ServiceIdMiddleware = RequiredParamMiddleware(
  "serviceid",
  ServiceId
);
