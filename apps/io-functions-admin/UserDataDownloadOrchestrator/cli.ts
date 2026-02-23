/**
 * Exposes ExtractUserDataActivity as a cli command for local usage
 */

// eslint-disable no-console

import * as dotenv from "dotenv";
dotenv.config();

import { InvocationContext } from "@azure/functions";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
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
import { SERVICE_PREFERENCES_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  makeUserDataProcessingId,
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { createBlobService } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as t from "io-ts";

import {
  createExtractUserDataActivityHandler,
  ActivityResult as ExtractActivityResult
} from "../ExtractUserDataActivity/handler";
import { getActivityFunction as getSendUserDataDownloadMessageActivityFunction } from "../SendUserDataDownloadMessageActivity/handler";
import {
  createSetUserDataProcessingStatusActivityHandler,
  ActivityResult as SetStatusActivityResult
} from "../SetUserDataProcessingStatusActivity/handler";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { ServicePreferencesDeletableModel } from "../utils/extensions/models/service_preferences";
import { timeoutFetch } from "../utils/fetch";

const config = getConfigOrThrow();

const context = {
  debug: console.log,

  error: console.error,

  log: console.log,

  warn: console.warn
} as unknown as InvocationContext;

const database = cosmosdbClient.database(config.COSMOSDB_NAME);

const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

const setUserDataProcessingStatusActivity =
  createSetUserDataProcessingStatusActivityHandler(userDataProcessingModel);

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

const extractUserDataActivity = createExtractUserDataActivityHandler({
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

const sendUserDataDownloadMessageActivity =
  getSendUserDataDownloadMessageActivityFunction(
    config.PUBLIC_API_URL,
    config.PUBLIC_API_KEY,
    config.PUBLIC_DOWNLOAD_BASE_URL,
    timeoutFetch
  );

async function run(): Promise<unknown> {
  const fiscalCode = pipe(
    process.argv[2],
    FiscalCode.decode,
    E.getOrElseW((reason: t.Errors) => {
      throw new Error(`Invalid input: ${readableReport(reason)}`);
    })
  );

  const errorOrMaybeRetrievedUserDataProcessing =
    await userDataProcessingModel.findLastVersionByModelId([
      makeUserDataProcessingId(
        UserDataProcessingChoiceEnum.DOWNLOAD,
        fiscalCode
      ),
      fiscalCode
    ])();

  if (E.isLeft(errorOrMaybeRetrievedUserDataProcessing)) {
    throw new Error(
      `Cannot retrieve user data processing ${errorOrMaybeRetrievedUserDataProcessing.left.kind}`
    );
  }

  const maybeUserDataProcessing = errorOrMaybeRetrievedUserDataProcessing.right;

  if (O.isNone(maybeUserDataProcessing)) {
    throw new Error("Cannot retrieve user data processing.");
  }

  const currentUserDataProcessing = maybeUserDataProcessing.value;

  console.log(
    "Found user data processing request (v=%d) with status %s",
    currentUserDataProcessing.version,
    currentUserDataProcessing.status
  );

  if (
    currentUserDataProcessing.status !== UserDataProcessingStatusEnum.PENDING &&
    currentUserDataProcessing.status !== UserDataProcessingStatusEnum.FAILED
  ) {
    throw new Error("User data processing status !== PENDING & != FAILED");
  }

  return setUserDataProcessingStatusActivity(
    {
      currentRecord: currentUserDataProcessing,
      nextStatus: UserDataProcessingStatusEnum.WIP
    },
    context
  )
    .then((userData: SetStatusActivityResult) => {
      if (userData.kind === "SUCCESS") {
        return extractUserDataActivity(
          {
            fiscalCode
          },
          context
        );
      } else {
        throw new Error(userData.kind);
      }
    })
    .then((bundle: ExtractActivityResult) => {
      if (bundle.kind === "SUCCESS") {
        return sendUserDataDownloadMessageActivity(
          {
            blobName: bundle.value.blobName,
            fiscalCode: currentUserDataProcessing.fiscalCode,
            password: bundle.value.password
          },
          context
        );
      } else {
        throw new Error(String(bundle));
      }
    })
    .then(() =>
      setUserDataProcessingStatusActivity(
        {
          currentRecord: currentUserDataProcessing,
          nextStatus: UserDataProcessingStatusEnum.CLOSED
        },
        context
      )
    )
    .catch((err: unknown) => {
      console.error(err);
      return setUserDataProcessingStatusActivity(
        {
          currentRecord: currentUserDataProcessing,
          nextStatus: UserDataProcessingStatusEnum.FAILED
        },
        context
      );
    });
}

run()
  .then(result => console.log("OK", result))

  .catch(ex => console.error("KO", ex));
