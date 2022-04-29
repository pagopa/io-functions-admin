/**
 * This activity extracts all the data about a user contained in our db.
 */

import * as TE from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { BlobService } from "azure-storage";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { pipe } from "fp-ts/lib/function";
import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";
import { ServicePreferencesDeletableModel } from "../utils/extensions/models/service_preferences";
import { MessageViewDeletableModel } from "../utils/extensions/models/message_view";
import { backupAndDeleteAllUserData } from "./backupAndDelete";
import {
  ActivityInput,
  ActivityResult,
  ActivityResultSuccess,
  InvalidInputFailure
} from "./types";
import { logFailure } from "./utils";

const logPrefix = `DeleteUserDataActivity`;

export interface IActivityHandlerInput {
  readonly messageModel: MessageDeletableModel;
  readonly messageStatusModel: MessageStatusDeletableModel;
  readonly messageViewModel: MessageViewDeletableModel;
  readonly notificationModel: NotificationDeletableModel;
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly profileModel: ProfileDeletableModel;
  readonly servicePreferencesModel: ServicePreferencesDeletableModel;
  readonly messageContentBlobService: BlobService;
  readonly userDataBackupBlobService: BlobService;
  readonly userDataBackupContainerName: NonEmptyString;
}

/**
 * Factory methods that builds an activity function
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function createDeleteUserDataActivityHandler({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  messageViewModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  servicePreferencesModel,
  userDataBackupBlobService,
  userDataBackupContainerName
}: IActivityHandlerInput): (
  context: Context,
  input: unknown
) => Promise<ActivityResult> {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return (context: Context, input: unknown) =>
    pipe(
      input,
      ActivityInput.decode,
      // validates the input
      TE.fromEither,
      TE.mapLeft(reason =>
        InvalidInputFailure.encode({
          kind: "INVALID_INPUT_FAILURE",
          reason: readableReport(reason)
        })
      ),

      // then perform backup&delete on all user data
      TE.chainW(({ fiscalCode, backupFolder }) =>
        pipe(
          backupAndDeleteAllUserData({
            fiscalCode,
            messageContentBlobService,
            messageModel,
            messageStatusModel,
            messageViewModel,
            notificationModel,
            notificationStatusModel,
            profileModel,
            servicePreferencesModel,
            userDataBackup: {
              blobService: userDataBackupBlobService,
              containerName: userDataBackupContainerName,
              folder: backupFolder
            }
          }),
          TE.mapLeft(failure => {
            logFailure(context, logPrefix)(failure);
            return failure;
          })
        )
      ),
      TE.map(_ =>
        ActivityResultSuccess.encode({
          kind: "SUCCESS"
        })
      ),
      TE.toUnion
    )();
}
