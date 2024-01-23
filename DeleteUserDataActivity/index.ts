import { createBlobService } from "azure-storage";
import { TableClient } from "@azure/data-tables";
import { MESSAGE_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/message";
import { MESSAGE_STATUS_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MESSAGE_VIEW_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { NOTIFICATION_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NOTIFICATION_STATUS_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { PROFILE_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { SERVICE_PREFERENCES_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { DataTableProfileEmailsRepository } from "@pagopa/io-functions-commons/dist/src/utils/unique_email_enforcement/storage";
import { cosmosdbClient } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";
import { ServicePreferencesDeletableModel } from "../utils/extensions/models/service_preferences";
import { MessageViewDeletableModel } from "../utils/extensions/models/message_view";
import { createDeleteUserDataActivityHandler } from "./handler";
import AuthenticationLockService from "./authenticationLockService";

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

const messageViewContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(MESSAGE_VIEW_COLLECTION_NAME);

const messageViewModel = new MessageViewDeletableModel(messageViewContainer);

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

const tableClient = TableClient.fromConnectionString(
  config.LOCKED_PROFILES_STORAGE_CONNECTION_STRING,
  config.LOCKED_PROFILES_TABLE_NAME
);
const authenticationLockService = new AuthenticationLockService(tableClient);

const profileEmailsTableClient = TableClient.fromConnectionString(
  config.PROFILE_EMAILS_STORAGE_CONNECTION_STRING,
  config.PROFILE_EMAILS_TABLE_NAME
);

const profileEmailsRepository = new DataTableProfileEmailsRepository(
  profileEmailsTableClient
);

const activityFunctionHandler = createDeleteUserDataActivityHandler({
  authenticationLockService,
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  messageViewModel,
  notificationModel,
  notificationStatusModel,
  profileEmailsRepository,
  profileModel,
  servicePreferencesModel,
  userDataBackupBlobService,
  userDataBackupContainerName
});

export default activityFunctionHandler;
