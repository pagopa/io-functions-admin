// eslint-disable sonarjs/no-duplicate-string

import { UserDataProcessing } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";

import {
  trackEvent,
  trackException,
  USER_DATA_PROCESSING_ID_KEY
} from "./appinsights";

export const trackUserDataDeleteEvent = (
  eventName: string,
  userDataProcessing: UserDataProcessing
) =>
  trackEvent({
    // eslint-disable-next-line sonarjs/no-duplicate-string
    name: `user.data.delete.${eventName}`,
    properties: {
      [USER_DATA_PROCESSING_ID_KEY]: userDataProcessing.userDataProcessingId
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId
    }
  });

export const trackUserDataDeleteException = (
  eventName: string,
  exception: Error,
  userDataProcessing: UserDataProcessing,
  context: IOrchestrationFunctionContext,
  isSampled = true
) =>
  // avoiding duplicate exceptions
  context.df.isReplaying
    ? void 0
    : trackException({
        exception,
        properties: {
          name: `user.data.delete.${eventName}`,
          [USER_DATA_PROCESSING_ID_KEY]: userDataProcessing.userDataProcessingId
        },
        tagOverrides: {
          "ai.operation.id": userDataProcessing.userDataProcessingId,
          "ai.operation.parentId": userDataProcessing.userDataProcessingId,
          samplingEnabled: String(isSampled)
        }
      });

export const trackUserDataDownloadEvent = (
  eventName: string,
  userDataProcessing: UserDataProcessing
) =>
  trackEvent({
    // eslint-disable-next-line sonarjs/no-duplicate-string
    name: `user.data.download.${eventName}`,
    properties: {
      [USER_DATA_PROCESSING_ID_KEY]: userDataProcessing.userDataProcessingId
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId
    }
  });

export const trackUserDataDownloadException = (
  eventName: string,
  exception: Error,
  userDataProcessing: UserDataProcessing,
  context: IOrchestrationFunctionContext,
  isSampled = true
) =>
  // avoiding duplicate exceptions
  context.df.isReplaying
    ? void 0
    : trackException({
        exception,
        properties: {
          name: `user.data.download.${eventName}`,
          [USER_DATA_PROCESSING_ID_KEY]: userDataProcessing.userDataProcessingId
        },
        tagOverrides: {
          "ai.operation.id": userDataProcessing.userDataProcessingId,
          "ai.operation.parentId": userDataProcessing.userDataProcessingId,
          samplingEnabled: String(isSampled)
        }
      });
