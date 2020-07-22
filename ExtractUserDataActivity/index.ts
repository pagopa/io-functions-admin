import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { cosmosdbClient } from "../utils/cosmosdb";

import { createExtractUserDataActivityHandler } from "./handler";

import { createBlobService } from "azure-storage";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "io-functions-commons/dist/src/models/message";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "io-functions-commons/dist/src/models/message_status";
import {
  NOTIFICATION_COLLECTION_NAME
  /* NotificationModel // we use the extended, local-defined model */
} from "io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "io-functions-commons/dist/src/models/notification_status";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import { NotificationModel } from "./notification";

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const database = cosmosdbClient.database(cosmosDbName);

const messageModel = new MessageModel(
  database.container(MESSAGE_COLLECTION_NAME),
  getRequiredStringEnv("MESSAGE_CONTAINER_NAME")
);

const messageStatusModel = new MessageStatusModel(
  database.container(MESSAGE_STATUS_COLLECTION_NAME)
);

const notificationModel = new NotificationModel(
  database.container(NOTIFICATION_COLLECTION_NAME)
);

const notificationStatusModel = new NotificationStatusModel(
  database.container(NOTIFICATION_STATUS_COLLECTION_NAME)
);

const profileModel = new ProfileModel(
  database.container(PROFILE_COLLECTION_NAME)
);

const userDataBlobService = createBlobService(
  getRequiredStringEnv("UserDataArchiveStorageConnection")
);

const messageContentBlobService = createBlobService(
  getRequiredStringEnv("StorageConnection")
);

const userDataContainerName = getRequiredStringEnv("USER_DATA_CONTAINER_NAME");

const activityFunctionHandler = createExtractUserDataActivityHandler({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  userDataBlobService,
  userDataContainerName
});

export default activityFunctionHandler;
