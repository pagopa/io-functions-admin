import { cosmosdbClient } from "../utils/cosmosdb";

import { createDeleteUserDataActivityHandler } from "./handler";

import { createBlobService } from "azure-storage";
import { MESSAGE_COLLECTION_NAME } from "io-functions-commons/dist/src/models/message";
import { MESSAGE_STATUS_COLLECTION_NAME } from "io-functions-commons/dist/src/models/message_status";
import { NOTIFICATION_COLLECTION_NAME } from "io-functions-commons/dist/src/models/notification";
import { NOTIFICATION_STATUS_COLLECTION_NAME } from "io-functions-commons/dist/src/models/notification_status";
import { PROFILE_COLLECTION_NAME } from "io-functions-commons/dist/src/models/profile";
import { getConfig } from "../utils/config";
import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";

const config = getConfig();
const cosmosDbName = config.COSMOSDB_NAME;

const messagesContainer = cosmosdbClient
  .database(cosmosDbName)
  .container(MESSAGE_COLLECTION_NAME);

const messageModel = new MessageDeletableModel(
  messagesContainer,
  config.MESSAGE_CONTAINER_NAME
);

const messageStatusesContainer = cosmosdbClient
  .database(cosmosDbName)
  .container(MESSAGE_STATUS_COLLECTION_NAME);

const messageStatusModel = new MessageStatusDeletableModel(
  messageStatusesContainer
);

const notificationsContainer = cosmosdbClient
  .database(cosmosDbName)
  .container(NOTIFICATION_COLLECTION_NAME);

const notificationModel = new NotificationDeletableModel(
  notificationsContainer
);

const notificationStatusesContainer = cosmosdbClient
  .database(cosmosDbName)
  .container(NOTIFICATION_STATUS_COLLECTION_NAME);

const notificationStatusModel = new NotificationStatusDeletableModel(
  notificationStatusesContainer
);

const profilesContainer = cosmosdbClient
  .database(cosmosDbName)
  .container(PROFILE_COLLECTION_NAME);

const profileModel = new ProfileDeletableModel(profilesContainer);

const userDataBackupBlobService = createBlobService(
  config.UserDataBackupStorageConnection
);

const messageContentBlobService = createBlobService(config.StorageConnection);

const userDataBackupContainerName = config.USER_DATA_BACKUP_CONTAINER_NAME;

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
