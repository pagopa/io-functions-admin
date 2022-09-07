/* eslint-disable @typescript-eslint/no-explicit-any */
import * as E from "fp-ts/lib/Either";
import { some } from "fp-ts/lib/Option";

import * as stream from "stream";
import * as yaml from "yaml";
import * as zipstream from "../../utils/zip";

import { context as contextMock } from "../../__mocks__/durable-functions";
import {
  aFiscalCode,
  aMessageView,
  aProfile,
  aRetrievedMessageStatus,
  aRetrievedNotificationStatus,
  aRetrievedServicePreferences
} from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultSuccess,
  createExtractUserDataActivityHandler
} from "../handler";

import archiver = require("archiver");
import { BlobService } from "azure-storage";
import * as TE from "fp-ts/lib/TaskEither";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import { MessageStatusModel } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NotificationModel,
  RetrievedNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NotificationStatusModel } from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { ProfileModel } from "@pagopa/io-functions-commons/dist/src/models/profile";
import * as asyncI from "@pagopa/io-functions-commons/dist/src/utils/async";
import { DeferredPromise } from "@pagopa/ts-commons/lib/promises";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  aMessageContent,
  aRetrievedMessageWithoutContent,
  aRetrievedNotification
} from "../../__mocks__/mocks";
import { AllUserData } from "../../utils/userData";
import { none } from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/function";
import { MessageViewModel } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { ServicePreferencesDeletableModel } from "../../utils/extensions/models/service_preferences";

const anotherRetrievedNotification: RetrievedNotification = {
  ...aRetrievedNotification,
  id: "ANOTHER_NOTIFICATION_ID" as NonEmptyString
};

const messageIteratorMock = {
  next: jest.fn(() =>
    Promise.resolve({
      value: jest.fn(() => [E.right(aRetrievedMessageWithoutContent)])
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
        E.right(aRetrievedNotification),
        E.right(anotherRetrievedNotification)
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
  .mockImplementationOnce(() =>
    Promise.resolve([
      [E.right(aRetrievedNotification)],
      [E.right(anotherRetrievedNotification)]
    ])
  );

// eslint-disable-next-line sonarjs/no-identical-functions
jest.spyOn(asyncI, "mapAsyncIterable").mockImplementationOnce(() => {
  return {
    [Symbol.asyncIterator]: () => messageIteratorMock
  };
});

jest
  .spyOn(asyncI, "asyncIteratorToArray")
  .mockImplementation(() =>
    Promise.resolve([[E.right(aRetrievedMessageWithoutContent)]])
  );

const mockGetContentFromBlob = jest.fn(() => TE.of(some(aMessageContent)));
const messageModelMock = ({
  findMessages: jest.fn(() => TE.fromEither(E.right(messageIteratorMock))),
  getContentFromBlob: mockGetContentFromBlob
} as any) as MessageModel;

// ServicePreferences Model
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

const mockDeleteServicePreferences = jest.fn<
  ReturnType<InstanceType<typeof ServicePreferencesDeletableModel>["delete"]>,
  Parameters<InstanceType<typeof ServicePreferencesDeletableModel>["delete"]>
>(() => TE.of("anything"));
const mockFindAllServPreferencesByFiscalCode = jest.fn<
  ReturnType<
    InstanceType<typeof ServicePreferencesDeletableModel>["findAllByFiscalCode"]
  >,
  Parameters<
    InstanceType<typeof ServicePreferencesDeletableModel>["findAllByFiscalCode"]
  >
>(() => asyncIteratorOf([E.right(aRetrievedServicePreferences)]));

const servicePreferencesModelMock = ({
  delete: mockDeleteServicePreferences,
  findAllByFiscalCode: mockFindAllServPreferencesByFiscalCode
} as unknown) as ServicePreferencesDeletableModel;

const iteratorGenMock = async function*(arr: any[]) {
  for (let a of arr) yield a;
};

const messageViewModelMock = ({
  getQueryIterator: jest.fn(() => iteratorGenMock([E.right(aMessageView)]))
} as any) as MessageViewModel;

const messageStatusModelMock = ({
  findLastVersionByModelId: jest.fn(() =>
    TE.fromEither(E.right(some(aRetrievedMessageStatus)))
  )
} as any) as MessageStatusModel;

const profileModelMock = ({
  findLastVersionByModelId: jest.fn(() =>
    TE.fromEither(E.right(some(aProfile)))
  )
} as any) as ProfileModel;

const mockFindNotificationForMessage = jest.fn(() =>
  TE.of(some(aRetrievedNotification))
);
const notificationModelMock = ({
  findNotificationForMessage: mockFindNotificationForMessage,
  getQueryIterator: jest.fn(() => notificationIteratorMock)
} as any) as NotificationModel;

const notificationStatusModelMock = ({
  findOneNotificationStatusByNotificationChannel: jest.fn(() =>
    TE.fromEither(E.right(some(aRetrievedNotificationStatus)))
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
  // eslint-disable-next-line functional/immutable-data
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
      messageViewModel: messageViewModelMock,
      notificationModel: notificationModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName,
      servicePreferencesModel: servicePreferencesModelMock
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    const result = await handler(contextMock, input);
    pipe(
      result,
      ActivityResultSuccess.decode,
      E.fold(
        err =>
          fail(`Failing decoding result, response: ${readableReport(err)}`),
        e => expect(e.kind).toBe("SUCCESS")
      )
    );
  });

  it("should not export webhook notification data", async () => {
    const { blobServiceMock, aZipStream } = setupStreamMocks();
    const appendSpy = jest.spyOn(aZipStream, "append");

    const notificationWebhookModelMock = ({
      findNotificationForMessage: jest.fn(() =>
        TE.fromEither(E.right(some(aRetrievedNotification)))
      ),
      getQueryIterator: jest.fn(() => notificationIteratorMock)
    } as any) as NotificationModel;

    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      messageViewModel: messageViewModelMock,
      notificationModel: notificationWebhookModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName,
      servicePreferencesModel: servicePreferencesModelMock
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
      messageViewModel: messageViewModelMock,
      notificationModel: notificationModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName,
      servicePreferencesModel: servicePreferencesModelMock
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    await handler(contextMock, input);

    expect(messageModelMock.getContentFromBlob).toHaveBeenCalledWith(
      blobServiceMock,
      aRetrievedMessageWithoutContent.id
    );
    expect(messageModelMock.findMessages).toHaveBeenCalledWith(aFiscalCode);
    expect(
      messageStatusModelMock.findLastVersionByModelId
    ).toHaveBeenCalledWith([aRetrievedMessageWithoutContent.id]);
    expect(
      notificationModelMock.findNotificationForMessage
    ).toHaveBeenCalledWith(aRetrievedMessageWithoutContent.id);
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

  it("should handle export when some messages have no notification", async () => {
    const { blobServiceMock } = setupStreamMocks();
    mockFindNotificationForMessage.mockImplementationOnce(() => TE.of(none));
    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      messageViewModel: messageViewModelMock,
      notificationModel: notificationModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName,
      servicePreferencesModel: servicePreferencesModelMock
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultSuccess.decode(result))).toBe(true);
  });

  it("should handle export when some messages have no message content", async () => {
    const { blobServiceMock } = setupStreamMocks();
    mockGetContentFromBlob.mockImplementationOnce(() => TE.of(none));
    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      messageViewModel: messageViewModelMock,
      notificationModel: notificationModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName,
      servicePreferencesModel: servicePreferencesModelMock
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultSuccess.decode(result))).toBe(true);
  });
});
