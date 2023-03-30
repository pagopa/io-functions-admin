import { getConfigOrThrow } from "../../utils/config";
import { cosmosdbClient } from "../../utils/cosmosdb";
import {
  UserDataProcessingModel,
  USER_DATA_PROCESSING_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { createBlobService } from "azure-storage";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  MessageViewModel,
  MESSAGE_VIEW_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { SERVICE_PREFERENCES_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { ServicePreferencesDeletableModel } from "../../utils/extensions/models/service_preferences";

const config = getConfigOrThrow();

export const database = cosmosdbClient.database(config.COSMOSDB_NAME);

export const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

export const messageModel = new MessageModel(
  database.container(MESSAGE_COLLECTION_NAME),
  config.MESSAGE_CONTAINER_NAME
);

export const messageStatusModel = new MessageStatusModel(
  database.container(MESSAGE_STATUS_COLLECTION_NAME)
);

export const messageViewContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(MESSAGE_VIEW_COLLECTION_NAME);

export const messageViewModel = new MessageViewModel(messageViewContainer);

export const notificationModel = new NotificationModel(
  database.container(NOTIFICATION_COLLECTION_NAME)
);

export const notificationStatusModel = new NotificationStatusModel(
  database.container(NOTIFICATION_STATUS_COLLECTION_NAME)
);

export const profileModel = new ProfileModel(
  database.container(PROFILE_COLLECTION_NAME)
);

export const servicePreferencesModel = new ServicePreferencesDeletableModel(
  database.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

export const userDataBlobService = createBlobService(
  config.UserDataArchiveStorageConnection
);

export const messageContentBlobService = createBlobService(
  config.StorageConnection
);

export const userDataContainerName = config.USER_DATA_CONTAINER_NAME;

export const publicApiUrl = config.PUBLIC_API_URL;
export const publicApiKey = config.PUBLIC_API_KEY;
export const publicDownloadBaseUrl = config.PUBLIC_DOWNLOAD_BASE_URL;
