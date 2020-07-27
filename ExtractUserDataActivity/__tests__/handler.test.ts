/* tslint:disable: no-any */
import { right } from "fp-ts/lib/Either";
import { some } from "fp-ts/lib/Option";

import * as stream from "stream";
import * as yaml from "yaml";
import * as zipstream from "../../utils/zip";

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

import archiver = require("archiver");
import { BlobService } from "azure-storage";
import { fromEither } from "fp-ts/lib/TaskEither";
import { MessageModel } from "io-functions-commons/dist/src/models/message";
import { MessageStatusModel } from "io-functions-commons/dist/src/models/message_status";
import {
  NotificationModel,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
import { NotificationStatusModel } from "io-functions-commons/dist/src/models/notification_status";
import { ProfileModel } from "io-functions-commons/dist/src/models/profile";
import * as asyncI from "io-functions-commons/dist/src/utils/async";
import { DeferredPromise } from "italia-ts-commons/lib/promises";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import {
  aMessageContent,
  aRetrievedMessageWithoutContent,
  aRetrievedNotification
} from "../../__mocks__/mocks";
import { AllUserData } from "../../utils/userData";

const anotherRetrievedNotification: RetrievedNotification = {
  ...aRetrievedNotification,
  id: "ANOTHER_NOTIFICATION_ID" as NonEmptyString
};

const messageIteratorMock = {
  next: jest.fn(() =>
    Promise.resolve({
      value: jest.fn(() => [right(aRetrievedMessageWithoutContent)])
    })
  )
};

jest.spyOn(asyncI, "mapAsyncIterable").mockImplementationOnce(() => {
  return {
    [Symbol.asyncIterator]: () => messageIteratorMock
  };
});

const notificationIteratorMock = {
  next: jest.fn(() =>
    Promise.resolve({
      value: jest.fn(() => [
        right(aRetrievedNotification),
        right(anotherRetrievedNotification)
      ])
    })
  )
};

jest.spyOn(asyncI, "mapAsyncIterable").mockImplementationOnce(() => {
  return {
    [Symbol.asyncIterator]: () => notificationIteratorMock
  };
});

jest
  .spyOn(asyncI, "asyncIterableToArray")
  .mockImplementation(() =>
    Promise.resolve([
      [right(aRetrievedNotification)],
      [right(anotherRetrievedNotification)]
    ])
  );

const messageModelMock = ({
  findAllByQuery: jest.fn(() =>
    fromEither(right(some([aRetrievedMessageWithoutContent])))
  ),
  getContentFromBlob: jest.fn(() => fromEither(right(some(aMessageContent))))
} as any) as MessageModel;

const messageStatusModelMock = ({
  findLastVersionByModelId: jest.fn(() =>
    fromEither(right(some(aRetrievedMessageStatus)))
  )
} as any) as MessageStatusModel;

const profileModelMock = ({
  findLastVersionByModelId: jest.fn(() => fromEither(right(some(aProfile))))
} as any) as ProfileModel;

const notificationModelMock = ({
  getQueryIterator: jest.fn(() => notificationIteratorMock)
} as any) as NotificationModel;

const notificationStatusModelMock = ({
  findOneNotificationStatusByNotificationChannel: jest.fn(() =>
    fromEither(right(some(aRetrievedNotificationStatus)))
  )
} as any) as NotificationStatusModel;

// this is a little bit convoluted as we're mocking
// two synchronized streams that end with a promise (zip)
// and a callback (blob) that must be called after the promise resolves
const setupStreamMocks = () => {
  const { e1: errorOrResult, e2: resolve } = DeferredPromise<void>();
  const aBlobStream = new stream.PassThrough();
  const blobServiceMock = ({
    createWriteStreamToBlockBlob: jest.fn((_, __, ___, cb) => {
      // the following callback must be executed after zipStream.finalize
      errorOrResult.then(cb).catch();
      return aBlobStream;
    })
  } as any) as BlobService;
  const aZipStream = archiver.create("zip");
  const origFinalize = aZipStream.finalize.bind(aZipStream);
  // tslint:disable-next-line: no-object-mutation
  aZipStream.finalize = jest.fn().mockImplementationOnce(() => {
    return origFinalize().then(resolve);
  });
  jest
    .spyOn(zipstream, "getEncryptedZipStream")
    .mockReturnValueOnce(aZipStream);
  return { blobServiceMock, aZipStream };
};

const aUserDataContainerName = "aUserDataContainerName" as NonEmptyString;

describe("createExtractUserDataActivityHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle export for existing user", async () => {
    const { blobServiceMock } = setupStreamMocks();
    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      notificationModel: notificationModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    const result = await handler(contextMock, input);

    ActivityResultSuccess.decode(result).fold(
      err => fail(`Failing decoding result, response: ${readableReport(err)}`),
      e => expect(e.kind).toBe("SUCCESS")
    );
  });

  it("should not export webhook notification data", async () => {
    const { blobServiceMock, aZipStream } = setupStreamMocks();
    const appendSpy = jest.spyOn(aZipStream, "append");

    const notificationWebhookModelMock = ({
      getQueryIterator: jest.fn(() => notificationIteratorMock)
    } as any) as NotificationModel;

    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      notificationModel: notificationWebhookModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    await handler(contextMock, input);

    expect(aZipStream.finalize).toHaveBeenCalledTimes(1);
    const allUserData: AllUserData = yaml.parse(
      appendSpy.mock.calls[0][0].toString()
    );
    expect(allUserData.notifications[0].channels.WEBHOOK).toEqual({
      url: null
    });
  });

  it("should query using correct data", async () => {
    const { blobServiceMock, aZipStream } = setupStreamMocks();
    const appendSpy = jest.spyOn(aZipStream, "append");

    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      notificationModel: notificationModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    await handler(contextMock, input);

    expect(messageModelMock.getContentFromBlob).toHaveBeenCalledWith(
      blobServiceMock,
      aRetrievedMessageWithoutContent.id
    );
    expect(messageModelMock.findAllByQuery).toHaveBeenCalledWith({
      parameters: [{ name: "@fiscaCode", value: aFiscalCode }],
      query: "SELECT * FROM m WHERE m.fiscalCode = @fiscalCode"
    });
    expect(
      messageStatusModelMock.findLastVersionByModelId
    ).toHaveBeenCalledWith(aRetrievedMessageWithoutContent.id);
    expect(notificationModelMock.getQueryIterator).toHaveBeenCalledWith(
      {
        parameters: [
          { name: "@messageId", value: aRetrievedMessageWithoutContent.id }
        ],
        query: "SELECT * FROM m WHERE m.messageId = @messageId"
      },
      { partitionKey: aRetrievedMessageWithoutContent.id }
    );
    expect(
      notificationStatusModelMock.findOneNotificationStatusByNotificationChannel
    ).toHaveBeenCalledWith(aRetrievedNotification.id, "WEBHOOK");
    expect(
      notificationStatusModelMock.findOneNotificationStatusByNotificationChannel
    ).toHaveBeenCalledWith(aRetrievedNotification.id, "EMAIL");

    expect(appendSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object)
    );
  });
});
