/**
 * This activity extracts all the data about a user contained in our db.
 */

import * as t from "io-ts";

import { fromEither } from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { BlobService } from "azure-storage";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";
import { backupAndDeleteAllUserData } from "./backupAndDelete";
import {
  ActivityInput,
  ActivityResult,
  ActivityResultFailure,
  ActivityResultSuccess,
  InvalidInputFailure
} from "./types";
import { logFailure } from "./utils";

const logPrefix = `DeleteUserDataActivity`;

export interface IActivityHandlerInput {
  readonly messageModel: MessageDeletableModel;
  readonly messageStatusModel: MessageStatusDeletableModel;
  readonly notificationModel: NotificationDeletableModel;
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly profileModel: ProfileDeletableModel;
  readonly messageContentBlobService: BlobService;
  readonly userDataBackupBlobService: BlobService;
  readonly userDataBackupContainerName: NonEmptyString;
}

/**
 * Factory methods that builds an activity function
 */
export function createDeleteUserDataActivityHandler({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  userDataBackupBlobService,
  userDataBackupContainerName
}: IActivityHandlerInput): (
  context: Context,
  input: unknown
) => Promise<ActivityResult> {
  return (context: Context, input: unknown) =>
    // validates the input
    fromEither(
      ActivityInput.decode(input).mapLeft<ActivityResultFailure>(
        (reason: t.Errors) =>
          InvalidInputFailure.encode({
            kind: "INVALID_INPUT_FAILURE",
            reason: readableReport(reason)
          })
      )
    )
      // then perform backup&delete on all user data
      .chain(({ fiscalCode, backupFolder }) =>
        backupAndDeleteAllUserData({
          fiscalCode,
          messageContentBlobService,
          messageModel,
          messageStatusModel,
          notificationModel,
          notificationStatusModel,
          profileModel,
          userDataBackup: {
            blobService: userDataBackupBlobService,
            containerName: userDataBackupContainerName,
            folder: backupFolder
          }
        })
      )
      .bimap(
        failure => {
          logFailure(context, logPrefix)(failure);
          return failure;
        },
        _ =>
          ActivityResultSuccess.encode({
            kind: "SUCCESS"
          })
      )
      .run()
      // unfold the value from the either
      .then(e => e.value);
}
