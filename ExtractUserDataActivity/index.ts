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
import { cosmosdbClient } from "../utils/cosmosdb";
import { getConfigOrThrow } from "../utils/config";
import { ServicePreferencesDeletableModel } from "../utils/extensions/models/service_preferences";
import { createExtractUserDataActivityHandler } from "./handler";

const config = getConfigOrThrow();

const database = cosmosdbClient.database(config.COSMOSDB_NAME);

const messageModel = new MessageModel(
  database.container(MESSAGE_COLLECTION_NAME),
  config.MESSAGE_CONTAINER_NAME
);

const messageStatusModel = new MessageStatusModel(
  database.container(MESSAGE_STATUS_COLLECTION_NAME)
);

const messageViewContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(MESSAGE_VIEW_COLLECTION_NAME);

const messageViewModel = new MessageViewModel(messageViewContainer);

const notificationModel = new NotificationModel(
  database.container(NOTIFICATION_COLLECTION_NAME)
);

const notificationStatusModel = new NotificationStatusModel(
  database.container(NOTIFICATION_STATUS_COLLECTION_NAME)
);

const profileModel = new ProfileModel(
  database.container(PROFILE_COLLECTION_NAME)
);

const servicePreferencesModel = new ServicePreferencesDeletableModel(
  database.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

const userDataBlobService = createBlobService(
  config.UserDataArchiveStorageConnection
);

const messageContentBlobService = createBlobService(config.StorageConnection);

const userDataContainerName = config.USER_DATA_CONTAINER_NAME;

const activityFunctionHandler = createExtractUserDataActivityHandler({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  messageViewModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  servicePreferencesModel,
  userDataBlobService,
  userDataContainerName
});

export default activityFunctionHandler;
