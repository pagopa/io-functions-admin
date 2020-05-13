import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { documentClient } from "../utils/cosmosdb";

import { createExtractUserDataActivityHandler } from "./handler";

import { createBlobService } from "azure-storage";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "io-functions-commons/dist/src/models/message";
import {
  NOTIFICATION_COLLECTION_NAME // we use the extended, local-defined model
} from /* NotificationModel */ "io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "io-functions-commons/dist/src/models/notification_status";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import {
  SENDER_SERVICE_COLLECTION_NAME,
  SenderServiceModel
} from "io-functions-commons/dist/src/models/sender_service";
import { NotificationModel } from "./notification";

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

const messageModel = new MessageModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    MESSAGE_COLLECTION_NAME
  ),
  getRequiredStringEnv("MESSAGE_CONTAINER_NAME")
);

const notificationModel = new NotificationModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    NOTIFICATION_COLLECTION_NAME
  )
);

const notificationStatusModel = new NotificationStatusModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    NOTIFICATION_STATUS_COLLECTION_NAME
  )
);

const profileModel = new ProfileModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    PROFILE_COLLECTION_NAME
  )
);

const senderServiceModel = new SenderServiceModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    SENDER_SERVICE_COLLECTION_NAME
  )
);

const blobService = createBlobService(
  getRequiredStringEnv("UserDataArchiveStorageConnection")
);

const activityFunctionHandler = createExtractUserDataActivityHandler(
  messageModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  senderServiceModel,
  blobService
);

export default activityFunctionHandler;
