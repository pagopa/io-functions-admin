import { Context } from "@azure/functions";
import {
  errorsToReadableMessages,
  readableReportSimplified
} from "@pagopa/ts-commons/lib/reporters";
import { ResponseErrorInternal } from "@pagopa/ts-commons/lib/responses";
import { Errors } from "io-ts";

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

export const errorsToError = (errors: Errors): Error =>
  new Error(readableReportSimplified(errors));
