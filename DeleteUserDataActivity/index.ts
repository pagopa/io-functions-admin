import { createBlobService } from "azure-storage";
import { MESSAGE_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/message";
import { MESSAGE_STATUS_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { NOTIFICATION_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NOTIFICATION_STATUS_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { PROFILE_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { SERVICE_PREFERENCES_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";
import { ServicePreferencesDeletableModel } from "../utils/extensions/models/service_preferences";
import { createDeleteUserDataActivityHandler } from "./handler";

const config = getConfigOrThrow();

const messagesContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(MESSAGE_COLLECTION_NAME);

const messageModel = new MessageDeletableModel(
  messagesContainer,
  config.MESSAGE_CONTAINER_NAME
);

const messageStatusesContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(MESSAGE_STATUS_COLLECTION_NAME);

const messageStatusModel = new MessageStatusDeletableModel(
  messageStatusesContainer
);

const notificationsContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(NOTIFICATION_COLLECTION_NAME);

const notificationModel = new NotificationDeletableModel(
  notificationsContainer
);

const notificationStatusesContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(NOTIFICATION_STATUS_COLLECTION_NAME);

const notificationStatusModel = new NotificationStatusDeletableModel(
  notificationStatusesContainer
);

const profilesContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(PROFILE_COLLECTION_NAME);

const profileModel = new ProfileDeletableModel(profilesContainer);

const userDataBackupBlobService = createBlobService(
  config.UserDataBackupStorageConnection
);

const servicePreferencesModel = new ServicePreferencesDeletableModel(
  cosmosdbClient
    .database(config.COSMOSDB_NAME)
    .container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
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
  servicePreferencesModel,
  userDataBackupBlobService,
  userDataBackupContainerName
});

export default activityFunctionHandler;
