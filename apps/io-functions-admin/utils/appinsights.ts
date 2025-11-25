import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { IntegerFromString } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as ai from "applicationinsights";
import {
  Data,
  EventTelemetry,
  ExceptionTelemetry
} from "applicationinsights/out/Declarations/Contracts";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";

// the internal function runtime has MaxTelemetryItem per second set to 20 by default
// @see https://github.com/Azure/azure-functions-host/blob/master/src/WebJobs.Script/Config/ApplicationInsightsLoggerOptionsSetup.cs#L29
const DEFAULT_SAMPLING_PERCENTAGE = 20;

export const USER_DATA_PROCESSING_ID_KEY = "userDataProcessingId";
const maskUserProcessingIdPreprocessor = (
  envelope: ai.Contracts.Envelope,
  _context?: Readonly<Record<string, unknown>>
): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (envelope.data as Data<any>).baseData;
    const userDataProcessingId = data.properties[USER_DATA_PROCESSING_ID_KEY];
    if (
      userDataProcessingId !== undefined &&
      typeof userDataProcessingId === "string"
    ) {
      const maskedUserDataProcessingId = userDataProcessingId.replace(
        /^([A-Z]{6})(.{10})(-DOWNLOAD|-DELETE)$/,
        "$1$3"
      );
      // eslint-disable-next-line functional/immutable-data
      data.properties[USER_DATA_PROCESSING_ID_KEY] = maskedUserDataProcessingId;
      // eslint-disable-next-line functional/immutable-data
      envelope.tags[
        ai.defaultClient.context.keys.operationId
      ] = maskedUserDataProcessingId;
      // eslint-disable-next-line functional/immutable-data
      envelope.tags[
        ai.defaultClient.context.keys.operationParentId
      ] = maskedUserDataProcessingId;
    }
  } catch (e) {
    // ignore errors caused by missing properties
  }
  // sending the event
  return true;
};

// Avoid to initialize Application Insights more than once

export const initTelemetryClient = (
  env = process.env
): ai.TelemetryClient | undefined =>
  ai.defaultClient
    ? ai.defaultClient
    : pipe(
        env.APPINSIGHTS_INSTRUMENTATIONKEY,
        NonEmptyString.decode,
        E.fold(
          _ => undefined,
          instrumentationKey => {
            initAppInsights(instrumentationKey, {
              disableAppInsights: env.APPINSIGHTS_DISABLE === "true",
              samplingPercentage: pipe(
                env.APPINSIGHTS_SAMPLING_PERCENTAGE,
                IntegerFromString.decode,
                E.getOrElse(() => DEFAULT_SAMPLING_PERCENTAGE)
              )
            });
            ai.defaultClient.addTelemetryProcessor(
              maskUserProcessingIdPreprocessor
            );
            return ai.defaultClient;
          }
        )
      );

export const trackEvent = (event: EventTelemetry) => {
  pipe(
    initTelemetryClient(),
    O.fromNullable,
    O.chain(_ => O.tryCatch(() => _.trackEvent(event)))
  );
};

export const trackException = (event: ExceptionTelemetry) => {
  pipe(
    initTelemetryClient(),
    O.fromNullable,
    O.chain(_ => O.tryCatch(() => _.trackException(event)))
  );
};
