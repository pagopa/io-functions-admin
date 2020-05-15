/* tslint:disable: no-any */
import { Either, right } from "fp-ts/lib/Either";
import { fromNullable, Option, some } from "fp-ts/lib/Option";

import { context as contextMock } from "../../__mocks__/durable-functions";
import {
  aFiscalCode,
  aProfile,
  aRetrievedMessageStatus,
  aRetrievedNotificationStatus
} from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultSuccess,
  createExtractUserDataActivityHandler
} from "../handler";

import { BlobService } from "azure-storage";
import { QueryError } from "documentdb";
import { MessageModel } from "io-functions-commons/dist/src/models/message";
import { MessageStatusModel } from "io-functions-commons/dist/src/models/message_status";
import { NotificationStatusModel } from "io-functions-commons/dist/src/models/notification_status";
import { ProfileModel } from "io-functions-commons/dist/src/models/profile";
import { SenderServiceModel } from "io-functions-commons/dist/src/models/sender_service";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  aMessageContent,
  aRetrievedMessageWithoutContent,
  aRetrievedNotification,
  aRetrievedSenderService,
  aRetrievedWebhookNotification
} from "../../__mocks__/mocks";
import { AllUserData } from "../../utils/userData";
import { createCompressedStream } from "../../utils/zip";
import { NotificationModel } from "../notification"; // we use the local-defined model

const createMockIterator = <T>(a: ReadonlyArray<T>) => {
  const data = Array.from(a);
  return {
    async executeNext(): Promise<Either<QueryError, Option<readonly T[]>>> {
      const next = data.shift();
      return right(fromNullable(next ? [next] : undefined));
    }
  };
};

const messageModelMock = ({
  findMessages: jest.fn(() =>
    createMockIterator([aRetrievedMessageWithoutContent])
  ),
  getContentFromBlob: jest.fn(async () => right(some(aMessageContent)))
} as any) as MessageModel;

const messageStatusModelMock = ({
  findOneByMessageId: jest.fn(async () => right(some(aRetrievedMessageStatus)))
} as any) as MessageStatusModel;

const senderServiceModelMock = ({
  findSenderServicesForRecipient: jest.fn(() =>
    createMockIterator([aRetrievedSenderService])
  )
} as any) as SenderServiceModel;

const profileModelMock = ({
  findOneProfileByFiscalCode: jest.fn(async () => right(some(aProfile)))
} as any) as ProfileModel;

const notificationModelMock = ({
  findNotificationsForMessage: jest.fn(() =>
    createMockIterator([aRetrievedNotification])
  )
} as any) as NotificationModel;

const notificationStatusModelMock = ({
  findOneNotificationStatusByNotificationChannel: jest.fn(async () =>
    right(some(aRetrievedNotificationStatus))
  )
} as any) as NotificationStatusModel;

const blobServiceMock = ({
  createWriteStreamToBlockBlob: jest.fn((_, __, cb) => cb(null))
} as any) as BlobService;

const aUserDataContainerName = "aUserDataContainerName" as NonEmptyString;

jest.mock("../../utils/zip", () => ({
  createCompressedStream: jest.fn(() => ({
    pipe: jest.fn()
  }))
}));

describe("createExtractUserDataActivityHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle export for existing user", async () => {
    const handler = createExtractUserDataActivityHandler(
      messageModelMock,
      messageStatusModelMock,
      notificationModelMock,
      notificationStatusModelMock,
      profileModelMock,
      senderServiceModelMock,
      blobServiceMock,
      aUserDataContainerName
    );
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    const result = await handler(contextMock, input);

    result.fold(
      response => fail(`Failing result, response: ${JSON.stringify(response)}`),
      response => {
        ActivityResultSuccess.decode(response).fold(
          err =>
            fail(`Failing decoding result, response: ${readableReport(err)}`),
          e => expect(e.kind).toBe("SUCCESS")
        );
      }
    );
  });

  it("should not export webhook notification data", async () => {
    const notificationWebhookModelMock = ({
      findNotificationsForMessage: jest.fn(() =>
        createMockIterator([aRetrievedWebhookNotification])
      )
    } as any) as NotificationModel;

    const handler = createExtractUserDataActivityHandler(
      messageModelMock,
      messageStatusModelMock,
      notificationWebhookModelMock,
      notificationStatusModelMock,
      profileModelMock,
      senderServiceModelMock,
      blobServiceMock,
      aUserDataContainerName
    );
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    await handler(contextMock, input);

    // @ts-ignore as
    const mockCall = createCompressedStream.mock.calls[0];
    const allUserData: AllUserData = mockCall[0][`${aFiscalCode}.json`];

    expect(allUserData.notifications[0].channels.WEBHOOK).toEqual({});
  });

  it("should query using correct data", async () => {
    const handler = createExtractUserDataActivityHandler(
      messageModelMock,
      messageStatusModelMock,
      notificationModelMock,
      notificationStatusModelMock,
      profileModelMock,
      senderServiceModelMock,
      blobServiceMock,
      aUserDataContainerName
    );
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    await handler(contextMock, input);

    expect(messageModelMock.getContentFromBlob).toHaveBeenCalledWith(
      blobServiceMock,
      aRetrievedMessageWithoutContent.id
    );
    expect(messageModelMock.findMessages).toHaveBeenCalledWith(aFiscalCode);
    expect(messageStatusModelMock.findOneByMessageId).toHaveBeenCalledWith(
      aRetrievedMessageWithoutContent.id
    );
    expect(
      notificationModelMock.findNotificationsForMessage
    ).toHaveBeenCalledWith(aRetrievedMessageWithoutContent.id);
    expect(
      notificationStatusModelMock.findOneNotificationStatusByNotificationChannel
    ).toHaveBeenCalledWith(aRetrievedNotification.id, "WEBHOOK");
    expect(
      notificationStatusModelMock.findOneNotificationStatusByNotificationChannel
    ).toHaveBeenCalledWith(aRetrievedNotification.id, "EMAIL");
    expect(
      senderServiceModelMock.findSenderServicesForRecipient
    ).toHaveBeenCalledWith(aFiscalCode);

    expect(createCompressedStream).toHaveBeenCalledWith(
      {
        [`${aFiscalCode}.json`]: expect.any(Object)
      },
      expect.any(String)
    );
  });
});
