/* eslint-disable vitest/prefer-called-with */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { IProfileEmailWriter } from "@pagopa/io-functions-commons/dist/src/utils/unique_email_enforcement";
import { BlobService } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { ValidationError } from "io-ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { AuthenticationLockServiceMock } from "../../__mocks__/authenticationLockService.mock";
// eslint-disable-next-line vitest/no-mocks-import
import {
  aFiscalCode,
  aMessageContent,
  aRetrievedMessageStatus,
  aRetrievedMessageView,
  aRetrievedMessageWithContent,
  aRetrievedNotification,
  aRetrievedNotificationStatus,
  aRetrievedProfile,
  aRetrievedServicePreferences
} from "../../__mocks__/mocks";
import { MessageDeletableModel } from "../../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../../utils/extensions/models/message_status";
import { MessageViewDeletableModel } from "../../utils/extensions/models/message_view";
import { NotificationDeletableModel } from "../../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../../utils/extensions/models/profile";
import { ServicePreferencesDeletableModel } from "../../utils/extensions/models/service_preferences";
import { backupAndDeleteAllUserData } from "../backupAndDelete";
import { IBlobServiceInfo } from "../types";

export async function* asyncIteratorOf<T>(items: T[]) {
  for (const item of items) {
    yield [item];
  }
}

export async function* errorMessageIterator(error: any) {
  //Sonarcloud requires at least one `yield` before `throw` operation
  yield [E.right(aRetrievedMessageWithContent)];
  throw error;
}

// MessageContentBlobService
const messageContentBlobService = {} as unknown as BlobService;

// Message Model
const mockGetContentFromBlob = vi.fn(() => TE.of(some(aMessageContent)));
const mockFindMessages = vi.fn(() =>
  TE.of(asyncIteratorOf([E.right(aRetrievedMessageWithContent)]))
);
const mockDeleteContentFromBlob = vi.fn(() => TE.of(true));
const mockDeleteMessage = vi.fn(() => TE.of(true));
const messageModel = {
  deleteContentFromBlob: mockDeleteContentFromBlob,
  deleteMessage: mockDeleteMessage,
  findMessages: mockFindMessages,
  getContentFromBlob: mockGetContentFromBlob
} as unknown as MessageDeletableModel;

const mockDeleteMessageView = vi.fn(() => TE.of(true));
const mockFindMessageView = vi.fn(() => TE.of(some(aRetrievedMessageView)));
const messageViewModel = {
  deleteMessageView: mockDeleteMessageView,
  find: mockFindMessageView
} as unknown as MessageViewDeletableModel;

// ServicePreferences Model
const mockDeleteServicePreferences = vi.fn(() => TE.of("anything"));
const mockFindAllServPreferencesByFiscalCode = vi.fn(() =>
  asyncIteratorOf([E.right(aRetrievedServicePreferences)])
);
const servicePreferencesModel = {
  delete: mockDeleteServicePreferences,
  findAllByFiscalCode: mockFindAllServPreferencesByFiscalCode
} as unknown as ServicePreferencesDeletableModel;

// MessageStatusModel
const mockMessageStatusFindAllVersionsByModelId = vi.fn(() =>
  asyncIteratorOf([E.right(aRetrievedMessageStatus)])
);
const mockDeleteMessageStatusVersion = vi.fn(() => TE.of(true));
const messageStatusModel = {
  deleteMessageStatusVersion: mockDeleteMessageStatusVersion,
  findAllVersionsByModelId: mockMessageStatusFindAllVersionsByModelId
} as unknown as MessageStatusDeletableModel;

// NotificationModel
const mockFindNotificationForMessage = vi.fn(() =>
  TE.of(some(aRetrievedNotification))
);
const mockDeleteNotification = vi.fn(() => TE.of(true));
const notificationModel = {
  deleteNotification: mockDeleteNotification,
  findNotificationForMessage: mockFindNotificationForMessage
} as unknown as NotificationDeletableModel;

// NotificationStatusModel
const mockFindAllVersionsByNotificationId = vi.fn(() =>
  asyncIteratorOf([E.right(aRetrievedNotificationStatus)])
);
const mockDeleteNotificationStatusVersion = vi.fn(() => TE.of(true));
const notificationStatusModel = {
  deleteNotificationStatusVersion: mockDeleteNotificationStatusVersion,
  findAllVersionsByNotificationId: mockFindAllVersionsByNotificationId
} as unknown as NotificationStatusDeletableModel;

// ProfileModel
const mockProfileFindAllVersionsByModelId = vi.fn(() =>
  asyncIteratorOf([E.right(aRetrievedProfile)])
);
const mockDeleteProfileVersion = vi.fn(() => TE.of(true));
const mockFindLastVersionByModelId = vi.fn(() =>
  TE.of(some(aRetrievedProfile))
);
const profileModel = {
  deleteProfileVersion: mockDeleteProfileVersion,
  findAllVersionsByModelId: mockProfileFindAllVersionsByModelId,
  findLastVersionByModelId: mockFindLastVersionByModelId
} as unknown as ProfileDeletableModel;

// backup BlobService
const mockCreateBlockBlobFromText = vi.fn((_, __, ___, cb) => cb(null, "any"));
const userDataBackup = {
  blobService: {
    createBlockBlobFromText: mockCreateBlockBlobFromText
  } as unknown as BlobService,
  containerName: "container",
  folder: "folder"
} as IBlobServiceInfo;

const authenticationLockService = AuthenticationLockServiceMock;

// ProfileEmailsRepository
const mockDelete = vi.fn(() => Promise.resolve(undefined));
const profileEmailsRepository = {
  delete: mockDelete
} as unknown as IProfileEmailWriter;

// eslint-disable-next-line max-lines-per-function
describe(`backupAndDeleteAllUserData`, () => {
  beforeEach(() => vi.clearAllMocks());
  it("should work if there are no errors", async () => {
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDeleteServicePreferences).toHaveBeenCalled();
    expect(mockDeleteMessage).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
    expect(mockDeleteNotification).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
  });

  it("should not stop if a content is not found for a message", async () => {
    mockGetContentFromBlob.mockImplementationOnce(() => TE.of(none));
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDeleteServicePreferences).toHaveBeenCalled();
    expect(mockDeleteMessage).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
    expect(mockDeleteNotification).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
  });

  it("should not stop if  there is an error while looking for a message content", async () => {
    mockGetContentFromBlob.mockImplementationOnce(
      () => TE.left(new Error("")) as any
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);
  });

  it("should not stop if a notification is not found for a message (none)", async () => {
    mockFindNotificationForMessage.mockImplementationOnce(() => TE.of(none));
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);
  });

  it("should stop if there is an error while looking for a notification (404)", async () => {
    mockFindNotificationForMessage.mockImplementationOnce(
      () =>
        TE.left({
          error: { code: 404, message: "", name: "" },
          kind: "COSMOS_ERROR_RESPONSE"
        }) as any
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);
  });

  it("should stop if an error occurred retrieving messages", async () => {
    const cosmosError = { kind: "COSMOS_ERROR_RESPONSE" };
    mockFindMessages.mockImplementationOnce(() =>
      TE.of(errorMessageIterator(cosmosError))
    );

    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(result).toEqual(
      E.left({
        kind: "QUERY_FAILURE",
        reason: `CosmosError: ${JSON.stringify(cosmosError)}`
      })
    );
  });

  it("should stop if there is an error while looking for a message View (404)", async () => {
    mockFindMessageView.mockImplementationOnce(
      () =>
        TE.left({
          error: { code: 404, message: "", name: "" },
          kind: "COSMOS_ERROR_RESPONSE"
        }) as any
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);
    expect(mockDeleteMessageView).not.toHaveBeenCalled();
  });

  it("should not stop if no servicePreferences were found", async () => {
    mockFindAllServPreferencesByFiscalCode.mockImplementationOnce(() =>
      asyncIteratorOf([])
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDeleteServicePreferences).not.toHaveBeenCalled();
    expect(mockDeleteMessage).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
    expect(mockDeleteNotification).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
  });

  it("should not stop if service Preferences asyncIterator returns an error", async () => {
    mockFindAllServPreferencesByFiscalCode.mockImplementationOnce(
      () => asyncIteratorOf([E.left([{} as ValidationError])]) as any
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDeleteServicePreferences).not.toHaveBeenCalled();
    expect(mockDeleteMessage).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
    expect(mockDeleteNotification).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
  });

  it("should not stop if a CosmosError is raised for delete", async () => {
    mockDeleteServicePreferences.mockImplementationOnce(
      () => TE.left(toCosmosErrorResponse("") as CosmosErrors) as any
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDeleteMessage).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
    expect(mockDeleteNotification).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
  });

  it("should not stop and should not call `profileEmailsRepository.delete` when a CosmosErrors is raised in getting the last validated email", async () => {
    mockFindLastVersionByModelId.mockImplementationOnce(
      () => TE.left(toCosmosErrorResponse("") as CosmosErrors) as any
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("should not call `profileEmailsRepository.delete` when `profileModel.findLastVersionByModelId` returns a profile with `isEmailValidated` equal to false", async () => {
    mockFindLastVersionByModelId.mockImplementationOnce(() =>
      TE.of(some({ ...aRetrievedProfile, isEmailValidated: false }))
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("should not call `profileEmailsRepository.delete` when `profileModel.findLastVersionByModelId` returns a profile with missing email", async () => {
    mockFindLastVersionByModelId.mockImplementationOnce(() =>
      TE.of(some({ ...aRetrievedProfile, email: undefined }))
    );
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDeleteMessage).toHaveBeenCalled();
    expect(mockDeleteNotification).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("should call `profileEmailsRepository.delete` when `profileModel.findLastVersionByModelId` returns a profile with a valid and validated email", async () => {
    const result = await backupAndDeleteAllUserData({
      authenticationLockService,
      fiscalCode: aFiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      profileEmailsRepository,
      profileModel,
      servicePreferencesModel,
      userDataBackup
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalled();
  });
});
