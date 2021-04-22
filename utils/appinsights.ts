import * as ai from "applicationinsights";
import {
  EventTelemetry,
  ExceptionTelemetry
} from "applicationinsights/out/Declarations/Contracts";
import { fromNullable } from "fp-ts/lib/Option";
import { tryCatch } from "fp-ts/lib/Option";
import { initAppInsights } from "@pagopa/ts-commons/lib/appinsights";
import { IntegerFromString } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

// the internal function runtime has MaxTelemetryItem per second set to 20 by default
// @see https://github.com/Azure/azure-functions-host/blob/master/src/WebJobs.Script/Config/ApplicationInsightsLoggerOptionsSetup.cs#L29
const DEFAULT_SAMPLING_PERCENTAGE = 20;

// Avoid to initialize Application Insights more than once
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const initTelemetryClient = (env = process.env) =>
  ai.defaultClient
    ? ai.defaultClient
    : NonEmptyString.decode(env.APPINSIGHTS_INSTRUMENTATIONKEY).fold(
        _ => undefined,
        k =>
          initAppInsights(k, {
            disableAppInsights: env.APPINSIGHTS_DISABLE === "true",
            samplingPercentage: IntegerFromString.decode(
              env.APPINSIGHTS_SAMPLING_PERCENTAGE
            ).getOrElse(DEFAULT_SAMPLING_PERCENTAGE)
          })
      );

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const trackEvent = (event: EventTelemetry) => {
  fromNullable(initTelemetryClient()).map(_ =>
    tryCatch(() => _.trackEvent(event))
  );
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const trackException = (event: ExceptionTelemetry) => {
  fromNullable(initTelemetryClient()).map(_ =>
    tryCatch(() => _.trackException(event))
  );
};
