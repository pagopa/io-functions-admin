// eslint-disable sonarjs/no-duplicate-string

import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import { trackEvent, trackException } from "./appinsights";

export const trackUserDataDeleteEvent = (
  eventName: string,
  userDataProcessing: UserDataProcessing
) =>
  trackEvent({
    // eslint-disable-next-line sonarjs/no-duplicate-string
    name: `user.data.delete.${eventName}`,
    properties: {
      userDataProcessingId: userDataProcessing.userDataProcessingId
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId
    }
  });

export const trackUserDataDeleteException = (
  eventName: string,
  exception: Error,
  userDataProcessing: UserDataProcessing
) =>
  trackException({
    exception,
    properties: {
      name: `user.data.delete.${eventName}`,
      userDataProcessingId: userDataProcessing.userDataProcessingId
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId
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
      userDataProcessingId: userDataProcessing.userDataProcessingId
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId
    }
  });

export const trackUserDataDownloadException = (
  eventName: string,
  exception: Error,
  userDataProcessing: UserDataProcessing
) =>
  trackException({
    exception,
    properties: {
      name: `user.data.download.${eventName}`,
      userDataProcessingId: userDataProcessing.userDataProcessingId
    },
    tagOverrides: {
      "ai.operation.id": userDataProcessing.userDataProcessingId,
      "ai.operation.parentId": userDataProcessing.userDataProcessingId
    }
  });
