import { Context } from "@azure/functions";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";
import { ResponseErrorInternal } from "@pagopa/ts-commons/lib/responses";

const genericErrorDetail = "An error occurred while performing the operation";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const genericInternalErrorHandler = (
  context: Context,
  logMessage: string,
  error: Error,
  errorDetail = genericErrorDetail
) => {
  context.log.error(logMessage, error);
  return ResponseErrorInternal(errorDetail);
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const genericInternalValidationErrorHandler = (
  context: Context,
  logMessage: string,
  error: Errors,
  errorDetail = genericErrorDetail
) => {
  context.log.error(logMessage, errorsToReadableMessages(error).join(" / "));
  return ResponseErrorInternal(errorDetail);
};

export const errorsToError = (errors: Errors): Error =>
  new Error(errorsToReadableMessages(errors).join(" / "));
