import { TableClient } from "@azure/data-tables";
import { app } from "@azure/functions";
import * as H from "@pagopa/handler-kit";
import { azureFunction } from "@pagopa/handler-kit-azure-func";
import { getMailerTransporter } from "@pagopa/io-functions-commons/dist/src/mailer";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  MESSAGE_VIEW_COLLECTION_NAME,
  MessageViewModel
} from "@pagopa/io-functions-commons/dist/src/models/message_view";
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
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  SERVICE_PREFERENCES_COLLECTION_NAME,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  SUBSCRIPTION_CIDRS_COLLECTION_NAME,
  SubscriptionCIDRsModel
} from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import {
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { DataTableProfileEmailsRepository } from "@pagopa/io-functions-commons/dist/src/utils/unique_email_enforcement/storage";
import { Day } from "@pagopa/ts-commons/lib/units";
import { createBlobService, createTableService } from "azure-storage";
import * as df from "durable-functions";
import * as HtmlToText from "html-to-text";

import { CheckXmlCryptoCVESamlResponse } from "./CheckXmlCryptoCVESamlResponse";
import { CreateDevelopmentProfile } from "./CreateDevelopmentProfile/handler";
import { CreateService } from "./CreateService/handler";
import { CreateSubscription } from "./CreateSubscription/handler";
import AuthenticationLockService from "./DeleteUserDataActivity/authenticationLockService";
import {
  createDeleteUserDataActivityHandler,
  ActivityName as DeleteUserDataActivityName
} from "./DeleteUserDataActivity/handler";
import {
  createExtractUserDataActivityHandler,
  ActivityName as ExtractUserDataActivityName
} from "./ExtractUserDataActivity/handler";
import { GetFailedUserDataProcessing } from "./GetFailedUserDataProcessing/handler";
import { GetFailedUserDataProcessingList } from "./GetFailedUserDataProcessingList/handler";
import { GetImpersonateService } from "./GetImpersonateService/handler";
import {
  createGetProfileActivityHandler,
  ActivityName as GetProfileActivityName
} from "./GetProfileActivity/handler";
import { GetService } from "./GetService/handler";
import { GetServices } from "./GetServices/handler";
import {
  GetServicesPreferencesActivityHandler,
  ActivityName as GetServicesPreferencesActivityName
} from "./GetServicesPreferencesActivity/handler";
import { GetSubscription } from "./GetSubscription/handler";
import { GetSubscriptionCidrs } from "./GetSubscriptionCidrs/handler";
import { GetSubscriptionKeys } from "./GetSubscriptionKeys/handler";
import {
  createSetUserDataProcessingStatusActivityHandler as createGetUserDataProcessingActivityHandler,
  ActivityName as GetUserDataProcessingActivityName
} from "./GetUserDataProcessingActivity/handler";
import { GetUsers } from "./GetUsers/handler";
import { Info } from "./Info/handler";
import {
  IsFailedUserDataProcessing,
  ActivityName as IsFailedUserDataProcessingActivityName
} from "./IsFailedUserDataProcessingActivity/handler";
import { RegenerateSubscriptionKeys } from "./RegenerateSubscriptionKeys/handler";
import {
  ProfileToSanitize,
  sanitizeProfileEmail
} from "./SanitizeProfileEmail/handler";
import {
  getActivityFunction as getSendUserDataDeleteEmailActivityFunction,
  ActivityName as SendUserDataDeleteEmailActivityName
} from "./SendUserDataDeleteEmailActivity/handler";
import {
  getActivityFunction as getSendUserDataDownloadMessageActivityFunction,
  ActivityName as SendUserDataDownloadMessageActivityName
} from "./SendUserDataDownloadMessageActivity/handler";
import { setUserDataProcessingStatus } from "./SetUserDataProcessingStatus/handler";
import {
  createSetUserDataProcessingStatusActivityHandler,
  ActivityName as SetUserDataProcessingStatusActivityName
} from "./SetUserDataProcessingStatusActivity/handler";
import {
  createSetUserSessionLockActivityHandler,
  ActivityName as SetUserSessionLockActivityName
} from "./SetUserSessionLockActivity/handler";
import { UpdateService } from "./UpdateService/handler";
import { UpdateSubscriptionCidrs } from "./UpdateSubscriptionCidrs/handler";
import {
  updateSubscriptionFeed,
  ActivityName as UpdateSubscriptionsFeedActivityName
} from "./UpdateSubscriptionsFeedActivity/handler";
import { UpdateUserGroup } from "./UpdateUserGroups/handler";
import {
  getUpdateVisibleServicesActivityHandler,
  ActivityName as UpdateVisibleServicesActivityName
} from "./UpdateVisibleServicesActivity/handler";
import { UploadOrganizationLogo } from "./UploadOrganizationLogo/handler";
import { UploadServiceLogo } from "./UploadServiceLogo/handler";
import {
  handler as upsertServiceOrchestratorHandler,
  OrchestratorName as UpsertServiceOrchestratorName
} from "./UpsertServiceOrchestrator/handler";
import {
  createUserDataDeleteOrchestratorHandler,
  OrchestratorName as UserDataDeleteOrchestratorV2Name
} from "./UserDataDeleteOrchestratorV2/handler";
import {
  handler as userDataDownloadOrchestratorHandler,
  OrchestratorName as UserDataDownloadOrchestratorName
} from "./UserDataDownloadOrchestrator/handler";
import {
  createUserDataProcessingCheckLastStatusActivityHandler,
  ActivityName as UserDataProcessingCheckLastStatusActivityName
} from "./UserDataProcessingCheckLastStatusActivity/handler";
import {
  getFindFailureReasonActivityHandler,
  ActivityName as UserDataProcessingFindFailureReasonActivityName
} from "./UserDataProcessingFindFailureReasonActivity/handler";
import { processFailedUserDataProcessing } from "./UserDataProcessingProcessFailedRecords/handler";
import {
  handler as userDataProcessingRecoveryOrchestratorHandler,
  OrchestratorName as UserDataProcessingRecoveryOrchestratorName
} from "./UserDataProcessingRecoveryOrchestrator/handler";
import { triggerHandler } from "./UserDataProcessingTrigger/handler";
import { initTelemetryClient } from "./utils/appinsights";
import {
  getConfigOrThrow,
  isUserEligibleForInstantDelete
} from "./utils/config";
import { cosmosdbClient, cosmosdbInstance } from "./utils/cosmosdb";
import { MessageDeletableModel } from "./utils/extensions/models/message";
import { MessageStatusDeletableModel } from "./utils/extensions/models/message_status";
import { MessageViewDeletableModel } from "./utils/extensions/models/message_view";
import { NotificationDeletableModel } from "./utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "./utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "./utils/extensions/models/profile";
import { ServicePreferencesDeletableModel } from "./utils/extensions/models/service_preferences";
import { timeoutFetch } from "./utils/fetch";
import { Client, createClient } from "./utils/sm-internal/client";
import { deleteTableEntity, insertTableEntity } from "./utils/storage";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const config = getConfigOrThrow();
const database = cosmosdbClient.database(config.COSMOSDB_NAME);

// ---------------------------------------------------------------------------
// Azure APIM shared config
// ---------------------------------------------------------------------------
const azureApimConfig = {
  apim: config.AZURE_APIM,
  apimResourceGroup: config.AZURE_APIM_RESOURCE_GROUP,
  subscriptionId: config.AZURE_SUBSCRIPTION_ID
};

// ---------------------------------------------------------------------------
// Cosmos DB models
// ---------------------------------------------------------------------------
const serviceModel = new ServiceModel(
  database.container(SERVICE_COLLECTION_NAME)
);

const profileModel = new ProfileModel(
  database.container(PROFILE_COLLECTION_NAME)
);

const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

const subscriptionCIDRsModel = new SubscriptionCIDRsModel(
  database.container(SUBSCRIPTION_CIDRS_COLLECTION_NAME)
);

const servicePreferencesModel = new ServicesPreferencesModel(
  cosmosdbInstance.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

// ---------------------------------------------------------------------------
// Table services
// ---------------------------------------------------------------------------
const failedUserDataProcessingTableService = createTableService(
  config.FailedUserDataProcessingStorageConnection
);
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;

const subscriptionsFeedTableService = createTableService(
  config.SubscriptionFeedStorageConnection
);
subscriptionsFeedTableService.createTableIfNotExists(
  config.SUBSCRIPTIONS_FEED_TABLE,
  () => 0
);

// ---------------------------------------------------------------------------
// Blob services
// ---------------------------------------------------------------------------
const assetsBlobService = createBlobService(config.AssetsStorageConnection);
const logosUrl = config.LOGOS_URL;

// ---------------------------------------------------------------------------
// DeleteUserDataActivity dependencies
// ---------------------------------------------------------------------------
const messageDeletableModel = new MessageDeletableModel(
  database.container(MESSAGE_COLLECTION_NAME),
  config.MESSAGE_CONTAINER_NAME
);
const messageStatusDeletableModel = new MessageStatusDeletableModel(
  database.container(MESSAGE_STATUS_COLLECTION_NAME)
);
const messageViewDeletableModel = new MessageViewDeletableModel(
  database.container(MESSAGE_VIEW_COLLECTION_NAME)
);
const notificationDeletableModel = new NotificationDeletableModel(
  database.container(NOTIFICATION_COLLECTION_NAME)
);
const notificationStatusDeletableModel = new NotificationStatusDeletableModel(
  database.container(NOTIFICATION_STATUS_COLLECTION_NAME)
);
const profileDeletableModel = new ProfileDeletableModel(
  database.container(PROFILE_COLLECTION_NAME)
);
const servicePreferencesDeletableModel = new ServicePreferencesDeletableModel(
  database.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);
const userDataBackupBlobService = createBlobService(
  config.UserDataBackupStorageConnection
);
const messageContentBlobService = createBlobService(config.StorageConnection);
const userDataBackupContainerName = config.USER_DATA_BACKUP_CONTAINER_NAME;
const lockedProfilesTableClient = TableClient.fromConnectionString(
  config.LOCKED_PROFILES_STORAGE_CONNECTION_STRING,
  config.LOCKED_PROFILES_TABLE_NAME
);
const authenticationLockService = new AuthenticationLockService(
  lockedProfilesTableClient
);
const profileEmailsTableClient = TableClient.fromConnectionString(
  config.PROFILE_EMAILS_STORAGE_CONNECTION_STRING,
  config.PROFILE_EMAILS_TABLE_NAME
);
const profileEmailsRepository = new DataTableProfileEmailsRepository(
  profileEmailsTableClient
);

// ---------------------------------------------------------------------------
// ExtractUserDataActivity dependencies
// ---------------------------------------------------------------------------
const messageModel = new MessageModel(
  database.container(MESSAGE_COLLECTION_NAME),
  config.MESSAGE_CONTAINER_NAME
);
const messageStatusModel = new MessageStatusModel(
  database.container(MESSAGE_STATUS_COLLECTION_NAME)
);
const messageViewModel = new MessageViewModel(
  database.container(MESSAGE_VIEW_COLLECTION_NAME)
);
const notificationModel = new NotificationModel(
  database.container(NOTIFICATION_COLLECTION_NAME)
);
const notificationStatusModel = new NotificationStatusModel(
  database.container(NOTIFICATION_STATUS_COLLECTION_NAME)
);
const extractServicePreferencesDeletableModel =
  new ServicePreferencesDeletableModel(
    database.container(SERVICE_PREFERENCES_COLLECTION_NAME),
    SERVICE_PREFERENCES_COLLECTION_NAME
  );
const userDataBlobService = createBlobService(
  config.UserDataArchiveStorageConnection
);
const userDataContainerName = config.USER_DATA_CONTAINER_NAME;

// ---------------------------------------------------------------------------
// SendUserDataDeleteEmailActivity dependencies
// ---------------------------------------------------------------------------
const MAIL_FROM = config.MAIL_FROM;
const HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions = {
  ignoreImage: true,
  tables: true
};
const mailerTransporter = getMailerTransporter(config);

// ---------------------------------------------------------------------------
// SendUserDataDownloadMessageActivity dependencies
// ---------------------------------------------------------------------------
const publicApiUrl = config.PUBLIC_API_URL;
const publicApiKey = config.PUBLIC_API_KEY;
const publicDownloadBaseUrl = config.PUBLIC_DOWNLOAD_BASE_URL;

// ---------------------------------------------------------------------------
// SetUserSessionLockActivity dependencies
// ---------------------------------------------------------------------------
const sessionManagerClient: Client<"ApiKeyAuth"> = createClient<"ApiKeyAuth">({
  baseUrl: config.SESSION_MANAGER_INTERNAL_API_URL,
  fetchApi: timeoutFetch,
  withDefaults: op => params =>
    op({
      ...params,
      ApiKeyAuth: config.SESSION_MANAGER_INTERNAL_API_KEY
    })
});

// ---------------------------------------------------------------------------
// UserDataDeleteOrchestratorV2 dependencies
// ---------------------------------------------------------------------------
const waitInterval = config.USER_DATA_DELETE_DELAY_DAYS as unknown as Day;

// =============================================================================
// HTTP Functions
// =============================================================================

app.http("Info", {
  authLevel: "anonymous",
  handler: Info(),
  methods: ["GET"],
  route: "info"
});

app.http("CreateService", {
  authLevel: "function",
  handler: CreateService(serviceModel),
  methods: ["POST"],
  route: "adm/services"
});

app.http("CreateDevelopmentProfile", {
  authLevel: "function",
  handler: CreateDevelopmentProfile(profileModel),
  methods: ["POST"],
  route: "adm/development-profiles/{fiscalcode}"
});

app.http("CreateSubscription", {
  authLevel: "function",
  handler: CreateSubscription(azureApimConfig),
  methods: ["PUT"],
  route: "adm/users/{email}/subscriptions/{subscriptionId}"
});

app.http("GetFailedUserDataProcessing", {
  authLevel: "function",
  handler: GetFailedUserDataProcessing(
    failedUserDataProcessingTableService,
    failedUserDataProcessingTable
  ),
  methods: ["GET"],
  route: "adm/user-data-processing/failed/{choice}/{fiscalCode}"
});

app.http("GetFailedUserDataProcessingList", {
  authLevel: "function",
  handler: GetFailedUserDataProcessingList(
    failedUserDataProcessingTableService,
    failedUserDataProcessingTable
  ),
  methods: ["GET"],
  route: "adm/user-data-processing/failed/{choice}"
});

app.http("GetService", {
  authLevel: "function",
  handler: GetService(serviceModel),
  methods: ["GET"],
  route: "adm/services/{serviceId}"
});

app.http("GetServices", {
  authLevel: "function",
  handler: GetServices(serviceModel),
  methods: ["GET"],
  route: "adm/services"
});

app.http("GetSubscription", {
  authLevel: "function",
  handler: GetSubscription(azureApimConfig),
  methods: ["GET"],
  route: "adm/subscriptions/{subscriptionid}"
});

app.http("GetSubscriptionCidrs", {
  authLevel: "function",
  handler: GetSubscriptionCidrs(subscriptionCIDRsModel),
  methods: ["GET"],
  route: "adm/subscriptions/{subscriptionid}/cidrs"
});

app.http("GetSubscriptionKeys", {
  authLevel: "function",
  handler: GetSubscriptionKeys(azureApimConfig),
  methods: ["GET"],
  route: "adm/services/{serviceid}/keys"
});

app.http("GetImpersonateService", {
  authLevel: "function",
  handler: GetImpersonateService(azureApimConfig),
  methods: ["GET"],
  route: "adm/impersonate-service/{serviceId}"
});

app.http("GetUsers", {
  authLevel: "function",
  handler: GetUsers(
    azureApimConfig,
    config.AZURE_APIM_HOST,
    config.GET_USERS_PAGE_SIZE
  ),
  methods: ["GET"],
  route: "adm/users"
});

app.http("RegenerateSubscriptionKeys", {
  authLevel: "function",
  handler: RegenerateSubscriptionKeys(azureApimConfig),
  methods: ["PUT"],
  route: "adm/services/{serviceid}/keys"
});

app.http("SetUserDataProcessingStatus", {
  authLevel: "function",
  handler: setUserDataProcessingStatus(userDataProcessingModel),
  methods: ["PUT"],
  route: "adm/user-data-processing/{choice}/{fiscalCode}/status/{newStatus}"
});

app.http("UpdateService", {
  authLevel: "function",
  handler: UpdateService(serviceModel),
  methods: ["PUT"],
  route: "adm/services/{serviceId}"
});

app.http("UpdateSubscriptionCidrs", {
  authLevel: "function",
  handler: UpdateSubscriptionCidrs(azureApimConfig, subscriptionCIDRsModel),
  methods: ["PUT"],
  route: "adm/subscriptions/{subscriptionid}/cidrs"
});

app.http("UpdateUserGroups", {
  authLevel: "function",
  handler: UpdateUserGroup(azureApimConfig),
  methods: ["PUT"],
  route: "adm/users/{email}/groups"
});

app.http("UploadOrganizationLogo", {
  authLevel: "function",
  handler: UploadOrganizationLogo(assetsBlobService, logosUrl),
  methods: ["PUT"],
  route: "adm/organizations/{organizationFiscalCode}/logo"
});

app.http("UploadServiceLogo", {
  authLevel: "function",
  handler: UploadServiceLogo(serviceModel, assetsBlobService, logosUrl),
  methods: ["PUT"],
  route: "adm/services/{serviceId}/logo"
});

app.http("UserDataProcessingProcessFailedRecords", {
  authLevel: "function",
  extraInputs: [df.input.durableClient()],
  handler: processFailedUserDataProcessing(userDataProcessingModel),
  methods: ["GET"],
  route: "adm/user-data-processing/failed-records"
});

// =============================================================================
// Activity Functions
// =============================================================================

df.app.activity(GetProfileActivityName, {
  handler: createGetProfileActivityHandler(profileModel)
});

df.app.activity(DeleteUserDataActivityName, {
  handler: createDeleteUserDataActivityHandler({
    authenticationLockService,
    messageContentBlobService,
    messageModel: messageDeletableModel,
    messageStatusModel: messageStatusDeletableModel,
    messageViewModel: messageViewDeletableModel,
    notificationModel: notificationDeletableModel,
    notificationStatusModel: notificationStatusDeletableModel,
    profileEmailsRepository,
    profileModel: profileDeletableModel,
    servicePreferencesModel: servicePreferencesDeletableModel,
    userDataBackupBlobService,
    userDataBackupContainerName
  })
});

df.app.activity(ExtractUserDataActivityName, {
  handler: createExtractUserDataActivityHandler({
    messageContentBlobService,
    messageModel,
    messageStatusModel,
    messageViewModel,
    notificationModel,
    notificationStatusModel,
    profileModel,
    servicePreferencesModel: extractServicePreferencesDeletableModel,
    userDataBlobService,
    userDataContainerName
  })
});

df.app.activity(GetServicesPreferencesActivityName, {
  handler: GetServicesPreferencesActivityHandler(servicePreferencesModel)
});

df.app.activity(GetUserDataProcessingActivityName, {
  handler: createGetUserDataProcessingActivityHandler(userDataProcessingModel)
});

df.app.activity(IsFailedUserDataProcessingActivityName, {
  handler: IsFailedUserDataProcessing(
    failedUserDataProcessingTableService,
    failedUserDataProcessingTable
  )
});

df.app.activity(SendUserDataDeleteEmailActivityName, {
  handler: getSendUserDataDeleteEmailActivityFunction(mailerTransporter, {
    HTML_TO_TEXT_OPTIONS,
    MAIL_FROM
  })
});

df.app.activity(SendUserDataDownloadMessageActivityName, {
  handler: getSendUserDataDownloadMessageActivityFunction(
    publicApiUrl,
    publicApiKey,
    publicDownloadBaseUrl,
    timeoutFetch
  )
});

df.app.activity(SetUserDataProcessingStatusActivityName, {
  handler: createSetUserDataProcessingStatusActivityHandler(
    userDataProcessingModel
  )
});

df.app.activity(SetUserSessionLockActivityName, {
  handler: createSetUserSessionLockActivityHandler(sessionManagerClient)
});

df.app.activity(UpdateSubscriptionsFeedActivityName, {
  handler: (rawInput, context) =>
    updateSubscriptionFeed(
      rawInput,
      context,
      subscriptionsFeedTableService,
      config.SUBSCRIPTIONS_FEED_TABLE
    )
});

df.app.activity(UpdateVisibleServicesActivityName, {
  handler: getUpdateVisibleServicesActivityHandler()
});

df.app.activity(UserDataProcessingCheckLastStatusActivityName, {
  handler: createUserDataProcessingCheckLastStatusActivityHandler(
    userDataProcessingModel
  )
});

df.app.activity(UserDataProcessingFindFailureReasonActivityName, {
  handler: getFindFailureReasonActivityHandler
});

// =============================================================================
// Orchestrator Functions
// =============================================================================

df.app.orchestration(
  UserDataDeleteOrchestratorV2Name,
  createUserDataDeleteOrchestratorHandler(
    waitInterval,
    isUserEligibleForInstantDelete(config)
  )
);

df.app.orchestration(
  UserDataDownloadOrchestratorName,
  userDataDownloadOrchestratorHandler
);

df.app.orchestration(
  UserDataProcessingRecoveryOrchestratorName,
  userDataProcessingRecoveryOrchestratorHandler
);

df.app.orchestration(
  UpsertServiceOrchestratorName,
  upsertServiceOrchestratorHandler
);

// =============================================================================
// CosmosDB Trigger
// =============================================================================

app.cosmosDB("UserDataProcessingTrigger", {
  connection: "COSMOSDB_CONNECTION_STRING",
  containerName: "user-data-processing",
  createLeaseContainerIfNotExists: true,
  databaseName: "%COSMOSDB_NAME%",
  extraInputs: [df.input.durableClient()],
  handler: triggerHandler(
    insertTableEntity(
      failedUserDataProcessingTableService,
      failedUserDataProcessingTable
    ),
    deleteTableEntity(
      failedUserDataProcessingTableService,
      failedUserDataProcessingTable
    )
  ),
  leaseContainerName: "change-feed-leases",
  leaseContainerPrefix: "userDataProcessing"
});

// =============================================================================
// Queue Trigger (handler-kit)
// =============================================================================

const createSanitizeProfileEmailsFunction = azureFunction(
  H.of(sanitizeProfileEmail)
);

app.storageQueue("SanitizeProfileEmail", {
  connection: "CitizenAuthStorageConnection",
  handler: createSanitizeProfileEmailsFunction({
    inputDecoder: ProfileToSanitize,
    profileModel: new ProfileModel(
      cosmosdbInstance.container(PROFILE_COLLECTION_NAME)
    ),
    telemetryClient: initTelemetryClient()
  }),
  queueName: "%SanitizeUserProfileQueueName%"
});

// =============================================================================
// Blob Triggers
// =============================================================================

app.storageBlob("CheckXmlCryptoCVESamlResponse", {
  connection: "IOPSTLOGS_STORAGE_CONNECTION_STRING",
  handler: CheckXmlCryptoCVESamlResponse,
  path: "spidassertions/{CF}-2025-03{name}"
});

app.storageBlob("CheckIoWebXmlCryptoCVESamlResponse", {
  connection: "IOWEBLOGS_STORAGE_CONNECTION_STRING",
  handler: CheckXmlCryptoCVESamlResponse,
  path: "spidlogs/{name}"
});
