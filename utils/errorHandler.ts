import { Context } from "@azure/functions";
import { Errors } from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { ResponseErrorInternal } from "italia-ts-commons/lib/responses";

const genericErrorDetail = "An error occurred while performing the operation";

export const genericInternalErrorHandler = (
  context: Context,
  logMessage: string,
  error: Error,
  errorDetail = genericErrorDetail
) => {
  context.log.error(logMessage, error);
  return ResponseErrorInternal(errorDetail);
};

export const genericInternalValidationErrorHandler = (
  context: Context,
  logMessage: string,
  error: Errors,
  errorDetail = genericErrorDetail
) => {
  context.log.error(logMessage, errorsToReadableMessages(error).join(" / "));
  return ResponseErrorInternal(errorDetail);
};
