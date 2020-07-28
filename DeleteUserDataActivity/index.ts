import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { documentClient } from "../utils/cosmosdb";

import { createDeleteUserDataActivityHandler } from "./handler";

import { createBlobService } from "azure-storage";
import { MESSAGE_COLLECTION_NAME } from "io-functions-commons/dist/src/models/message";
import { MESSAGE_STATUS_COLLECTION_NAME } from "io-functions-commons/dist/src/models/message_status";
import { NOTIFICATION_COLLECTION_NAME } from "io-functions-commons/dist/src/models/notification";
import { NOTIFICATION_STATUS_COLLECTION_NAME } from "io-functions-commons/dist/src/models/notification_status";
import { PROFILE_COLLECTION_NAME } from "io-functions-commons/dist/src/models/profile";
import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);

const messageModel = new MessageDeletableModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    MESSAGE_COLLECTION_NAME
  ),
  getRequiredStringEnv("MESSAGE_CONTAINER_NAME")
);

const messageStatusModel = new MessageStatusDeletableModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    MESSAGE_STATUS_COLLECTION_NAME
  )
);

const notificationModel = new NotificationDeletableModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    NOTIFICATION_COLLECTION_NAME
  )
);

const notificationStatusModel = new NotificationStatusDeletableModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    NOTIFICATION_STATUS_COLLECTION_NAME
  )
);

const profileModel = new ProfileDeletableModel(
  documentClient,
  documentDbUtils.getCollectionUri(
    documentDbDatabaseUrl,
    PROFILE_COLLECTION_NAME
  )
);

const userDataBackupBlobService = createBlobService(
  getRequiredStringEnv("UserDataBackupStorageConnection")
);

const messageContentBlobService = createBlobService(
  getRequiredStringEnv("StorageConnection")
);

const userDataBackupContainerName = getRequiredStringEnv(
  "USER_DATA_BACKUP_CONTAINER_NAME"
);

const activityFunctionHandler = createDeleteUserDataActivityHandler({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  userDataBackupBlobService,
  userDataBackupContainerName
});

export default activityFunctionHandler;
