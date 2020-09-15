import { BlobService } from "azure-storage";
import { right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { taskEither, fromLeft } from "fp-ts/lib/TaskEither";
import { MessageDeletableModel } from "../../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../../utils/extensions/models/profile";
import {
  aFiscalCode,
  aMessageContent,
  aRetrievedMessageStatus,
  aRetrievedMessageWithContent,
  aRetrievedNotification,
  aRetrievedNotificationStatus,
  aRetrievedProfile
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
const mockGetContentFromBlob = jest.fn(() =>
  taskEither.of(some(aMessageContent))
);
const mockFindMessages = jest.fn(() =>
  taskEither.of(asyncIteratorOf([right(aRetrievedMessageWithContent)]))
);
const mockDeleteContentFromBlob = jest.fn(() => taskEither.of(true));
const mockDeleteMessage = jest.fn(() => taskEither.of(true));
const messageModel = ({
  getContentFromBlob: mockGetContentFromBlob,
  findMessages: mockFindMessages,
  deleteContentFromBlob: mockDeleteContentFromBlob,
  deleteMessage: mockDeleteMessage
} as unknown) as MessageDeletableModel;

// MessageStatusModel
const mockMessageStatusFindAllVersionsByModelId = jest.fn(() =>
  asyncIteratorOf([right(aRetrievedMessageStatus)])
);
const mockDeleteMessageStatusVersion = jest.fn(() => taskEither.of(true));
const messageStatusModel = ({
  findAllVersionsByModelId: mockMessageStatusFindAllVersionsByModelId,
  deleteMessageStatusVersion: mockDeleteMessageStatusVersion
} as unknown) as MessageStatusDeletableModel;

// NotificationModel
const mockFindNotificationForMessage = jest.fn(() =>
  taskEither.of(some(aRetrievedNotification))
);
const mockDeleteNotification = jest.fn(() => taskEither.of(true));
const notificationModel = ({
  deleteNotification: mockDeleteNotification,
  findNotificationForMessage: mockFindNotificationForMessage
} as unknown) as NotificationDeletableModel;

// NotificationStatusModel
const mockFindAllVersionsByNotificationId = jest.fn(() =>
  asyncIteratorOf([right(aRetrievedNotificationStatus)])
);
const mockDeleteNotificationStatusVersion = jest.fn(() => taskEither.of(true));
const notificationStatusModel = ({
  findAllVersionsByNotificationId: mockFindAllVersionsByNotificationId,
  deleteNotificationStatusVersion: mockDeleteNotificationStatusVersion
} as unknown) as NotificationStatusDeletableModel;

// ProfileModel
const mockProfileFindAllVersionsByModelId = jest.fn(() =>
  asyncIteratorOf([right(aRetrievedProfile)])
);
const mockDeleteProfileVersion = jest.fn(() => taskEither.of(true));
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
  it("should work if there are no errors", async () => {
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      fiscalCode: aFiscalCode
    }).run();

    expect(result.isRight()).toBe(true);
  });

  it("should not stop if a content is not found for a message", async () => {
    mockGetContentFromBlob.mockImplementationOnce(() => taskEither.of(none));
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      fiscalCode: aFiscalCode
    }).run();

    expect(result.isRight()).toBe(true);
  });

  it("should not stop if  there is an error while looking for a message content", async () => {
    mockGetContentFromBlob.mockImplementationOnce(() =>
      fromLeft(new Error(""))
    );
    const result = await backupAndDeleteAllUserData({
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      notificationModel,
      notificationStatusModel,
      profileModel,
      userDataBackup,
      fiscalCode: aFiscalCode
    }).run();

    expect(result.isRight()).toBe(true);
  });
});
