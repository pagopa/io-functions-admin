import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";

import { ServiceId } from "../../generated/definitions/ServiceId";

/**
 * A middleware that extracts the serviceid value from the URL path parameter.
 */
export const ServiceIdMiddleware = RequiredParamMiddleware(
  "serviceid",
  ServiceId
);
