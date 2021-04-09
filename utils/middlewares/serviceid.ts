import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";

/**
 * A middleware that extracts the serviceid value from the URL path parameter.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ServiceIdMiddleware = RequiredParamMiddleware(
  "serviceid",
  ServiceId
);
