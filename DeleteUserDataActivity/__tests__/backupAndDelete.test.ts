import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { BlobService } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { ValidationError } from "io-ts";
import { MessageDeletableModel } from "../../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../../utils/extensions/models/profile";
import { ServicePreferencesDeletableModel } from "../../utils/extensions/models/service_preferences";
import {
  aFiscalCode,
  aMessageContent,
  aRetrievedMessageStatus,
  aRetrievedMessageWithContent,
  aRetrievedNotification,
  aRetrievedNotificationStatus,
  aRetrievedProfile,
  aRetrievedServicePreferences
} from "../../__mocks__/mocks";
import { backupAndDeleteAllUserData } from "../backupAndDelete";
import { IBlobServiceInfo } from "../types";

const asyncIteratorOf = <T>(items: T[]): AsyncIterator<T[]> => {
  const data = [...items];
  return {
    next: async () => {
      const value = data.shift();
      return {
        done: typeof value === "undefined",
        value: [value]
      };
    }
  };
};

// MessageContentBlobService
const messageContentBlobService = ({} as unknown) as BlobService;

// Message Model
const mockGetContentFromBlob = jest.fn<
  ReturnType<InstanceType<typeof MessageDeletableModel>["getContentFromBlob"]>,
  Parameters<InstanceType<typeof MessageDeletableModel>["getContentFromBlob"]>
>(() => TE.of(some(aMessageContent)));
const mockFindMessages = jest.fn(() =>
  TE.of(asyncIteratorOf([E.right(aRetrievedMessageWithContent)]))
);
const mockDeleteContentFromBlob = jest.fn(() => TE.of(true));
const mockDeleteMessage = jest.fn(() => TE.of(true));
const messageModel = ({
  getContentFromBlob: mockGetContentFromBlob,
  findMessages: mockFindMessages,
  deleteContentFromBlob: mockDeleteContentFromBlob,
  deleteMessage: mockDeleteMessage
} as unknown) as MessageDeletableModel;

// ServicePreferences Model
const mockDeleteServicePreferences = jest.fn<
  ReturnType<InstanceType<typeof ServicePreferencesDeletableModel>["delete"]>,
  Parameters<InstanceType<typeof ServicePreferencesDeletableModel>["delete"]>
>(() =>
  // @ts-ignore
  TE.of(true)
);
const mockFindAllServPreferencesByFiscalCode = jest.fn<
  ReturnType<
    InstanceType<typeof ServicePreferencesDeletableModel>["findAllByFiscalCode"]
  >,
  Parameters<
    InstanceType<typeof ServicePreferencesDeletableModel>["findAllByFiscalCode"]
  >
>(() => asyncIteratorOf([E.right(aRetrievedServicePreferences)]));
const servicePreferencesModel = ({
  delete: mockDeleteServicePreferences,
  findAllByFiscalCode: mockFindAllServPreferencesByFiscalCode
} as unknown) as ServicePreferencesDeletableModel;

// MessageStatusModel
const mockMessageStatusFindAllVersionsByModelId = jest.fn(() =>
  asyncIteratorOf([E.right(aRetrievedMessageStatus)])
);
const mockDeleteMessageStatusVersion = jest.fn(() => TE.of(true));
const messageStatusModel = ({
  findAllVersionsByModelId: mockMessageStatusFindAllVersionsByModelId,
  deleteMessageStatusVersion: mockDeleteMessageStatusVersion
} as unknown) as MessageStatusDeletableModel;

// NotificationModel
const mockFindNotificationForMessage = jest.fn<
  ReturnType<
    InstanceType<
      typeof NotificationDeletableModel
    >["findNotificationForMessage"]
  >,
  Parameters<
    InstanceType<
      typeof NotificationDeletableModel
    >["findNotificationForMessage"]
  >
>(() => TE.of(some(aRetrievedNotification)));
const mockDeleteNotification = jest.fn(() => TE.of(true));
const notificationModel = ({
  deleteNotification: mockDeleteNotification,
  findNotificationForMessage: mockFindNotificationForMessage
} as unknown) as NotificationDeletableModel;

// NotificationStatusModel
const mockFindAllVersionsByNotificationId = jest.fn(() =>
  asyncIteratorOf([E.right(aRetrievedNotificationStatus)])
);
const mockDeleteNotificationStatusVersion = jest.fn(() => TE.of(true));
const notificationStatusModel = ({
  findAllVersionsByNotificationId: mockFindAllVersionsByNotificationId,
  deleteNotificationStatusVersion: mockDeleteNotificationStatusVersion
} as unknown) as NotificationStatusDeletableModel;

// ProfileModel
const mockProfileFindAllVersionsByModelId = jest.fn(() =>
  asyncIteratorOf([E.right(aRetrievedProfile)])
);
const mockDeleteProfileVersion = jest.fn(() => TE.of(true));
const profileModel = ({
  findAllVersionsByModelId: mockProfileFindAllVersionsByModelId,
  deleteProfileVersion: mockDeleteProfileVersion
} as unknown) as ProfileDeletableModel;

// backup BlobService
const mockCreateBlockBlobFromText = jest.fn((_, __, ___, cb) =>
  cb(null, "any")
);
const userDataBackup = {
  blobService: ({
    createBlockBlobFromText: mockCreateBlockBlobFromText
  } as unknown) as BlobService,
  containerName: "container",
  folder: "folder"
} as IBlobServiceInfo;

describe(`backupAndDeleteAllUserData`, () => {
  beforeEach(() => jest.clearAllMocks());
  it("should work if there are no errors", async () => {
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      servicePreferencesModel,
      userDataBackup,
      fiscalCode: aFiscalCode
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
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      servicePreferencesModel,
      fiscalCode: aFiscalCode
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
    mockGetContentFromBlob.mockImplementationOnce(() => TE.left(new Error("")));
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      servicePreferencesModel,
      fiscalCode: aFiscalCode
    })();

    expect(E.isRight(result)).toBe(true);
  });

  it("should not stop if a notification is not found for a message (none)", async () => {
    mockFindNotificationForMessage.mockImplementationOnce(() => TE.of(none));
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      servicePreferencesModel,
      fiscalCode: aFiscalCode
    })();

    expect(E.isRight(result)).toBe(true);
  });

  it("should stop if there is an error while looking for a notification (404)", async () => {
    mockFindNotificationForMessage.mockImplementationOnce(() =>
      TE.left({
        kind: "COSMOS_ERROR_RESPONSE",
        error: { code: 404, name: "", message: "" }
      })
    );
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      servicePreferencesModel,
      fiscalCode: aFiscalCode
    })();

    expect(E.isRight(result)).toBe(true);
  });

  it("should not stop if no servicePreferences were found", async () => {
    mockFindAllServPreferencesByFiscalCode.mockImplementationOnce(() =>
      asyncIteratorOf([])
    );
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      servicePreferencesModel,
      fiscalCode: aFiscalCode
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
    mockFindAllServPreferencesByFiscalCode.mockImplementationOnce(() =>
      asyncIteratorOf([E.left([{} as ValidationError])])
    );
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      servicePreferencesModel,
      fiscalCode: aFiscalCode
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
    mockDeleteServicePreferences.mockImplementationOnce(() =>
      TE.left(toCosmosErrorResponse("") as CosmosErrors)
    );
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      servicePreferencesModel,
      fiscalCode: aFiscalCode
    })();

    expect(E.isRight(result)).toBe(true);

    expect(mockDeleteProfileVersion).toHaveBeenCalled();
    expect(mockDeleteMessage).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
    expect(mockDeleteNotification).toHaveBeenCalled();
    expect(mockDeleteMessageStatusVersion).toHaveBeenCalled();
  });
});
