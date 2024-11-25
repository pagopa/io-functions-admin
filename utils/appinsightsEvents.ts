// eslint-disable sonarjs/no-duplicate-string

import { UserDataProcessing } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";
import {
  trackEvent,
  trackException,
  USER_DATA_PROCESSING_ID_KEY
} from "./appinsights";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const trackUserDataDeleteException = (
  eventName: string,
  exception: Error,
  userDataProcessing: UserDataProcessing,
  context: IOrchestrationFunctionContext,
  isSampled: boolean = true
) =>
  trackException({
    exception,
    properties: {
      [USER_DATA_PROCESSING_ID_KEY]: userDataProcessing.userDataProcessingId,
      isReplay: context.df.isReplaying,
      name: `user.data.delete.${eventName}`
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId,
      samplingEnabled: String(isSampled)
    }
  });

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const trackUserDataDownloadException = (
  eventName: string,
  exception: Error,
  userDataProcessing: UserDataProcessing
) =>
  trackException({
    exception,
    properties: {
      [USER_DATA_PROCESSING_ID_KEY]: userDataProcessing.userDataProcessingId,
      name: `user.data.download.${eventName}`
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId
    }
  });
