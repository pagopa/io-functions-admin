import { EmailAddress } from "io-functions-commons/dist/generated/definitions/EmailAddress";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";

/**
 * A middleware that extracts the serviceid value from the URL path parameter.
 */
export const EmailMiddleware = RequiredParamMiddleware("email", EmailAddress);
