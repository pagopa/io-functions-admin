/* eslint-disable @typescript-eslint/no-explicit-any */
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import { MessageStatusModel } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageViewModel } from "@pagopa/io-functions-commons/dist/src/models/message_view";
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
import archiver = require("archiver");
import { BlobService } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { some } from "fp-ts/lib/Option";
import { none } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as stream from "stream";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import * as yaml from "yaml";

// eslint-disable-next-line vitest/no-mocks-import
import { context as contextMock } from "../../__mocks__/durable-functions";
// eslint-disable-next-line vitest/no-mocks-import
import {
  aFiscalCode,
  aMessageView,
  aProfile,
  aRetrievedMessageStatus,
  aRetrievedNotificationStatus,
  aRetrievedServicePreferences
} from "../../__mocks__/mocks";
// eslint-disable-next-line vitest/no-mocks-import
import {
  aMessageContent,
  aRetrievedMessageWithoutContent,
  aRetrievedNotification
} from "../../__mocks__/mocks";
import { ServicePreferencesDeletableModel } from "../../utils/extensions/models/service_preferences";
import { AllUserData } from "../../utils/userData";
import * as zipstream from "../../utils/zip";
import {
  ActivityInput,
  ActivityResultSuccess,
  createExtractUserDataActivityHandler
} from "../handler";

const anotherRetrievedNotification: RetrievedNotification = {
  ...aRetrievedNotification,
  id: "ANOTHER_NOTIFICATION_ID" as NonEmptyString
};

const messageIteratorMock = {
  next: vi.fn(() =>
    Promise.resolve({
      value: vi.fn(() => [E.right(aRetrievedMessageWithoutContent)])
    })
  )
};

vi.spyOn(asyncI, "mapAsyncIterable").mockImplementationOnce(() => ({
  [Symbol.asyncIterator]: () => messageIteratorMock
}));

const notificationIteratorMock = {
  next: vi.fn(() =>
    Promise.resolve({
      value: vi.fn(() => [
        E.right(aRetrievedNotification),
        E.right(anotherRetrievedNotification)
      ])
    })
  )
};

vi.spyOn(asyncI, "mapAsyncIterable").mockImplementationOnce(() => ({
  [Symbol.asyncIterator]: () => notificationIteratorMock
}));

vi.spyOn(asyncI, "asyncIterableToArray").mockImplementationOnce(() =>
  Promise.resolve([
    [E.right(aRetrievedNotification)],
    [E.right(anotherRetrievedNotification)]
  ])
);

vi.spyOn(asyncI, "mapAsyncIterable").mockImplementationOnce(() => ({
  [Symbol.asyncIterator]: () => messageIteratorMock
}));

vi.spyOn(asyncI, "asyncIteratorToArray").mockImplementation(() =>
  Promise.resolve([[E.right(aRetrievedMessageWithoutContent)]])
);

const mockGetContentFromBlob = vi.fn(() => TE.of(some(aMessageContent)));
const messageModelMock = {
  findMessages: vi.fn(() => TE.fromEither(E.right(messageIteratorMock))),
  getContentFromBlob: mockGetContentFromBlob
} as unknown as MessageModel;

// ServicePreferences Model
export async function* asyncIteratorOf<T>(items: T[]) {
  for (const item of items) {
    yield [item];
  }
}

const mockDeleteServicePreferences = vi.fn(() => TE.of("anything"));
const mockFindAllServPreferencesByFiscalCode = vi.fn(() =>
  asyncIteratorOf([E.right(aRetrievedServicePreferences)])
);

const servicePreferencesModelMock = {
  delete: mockDeleteServicePreferences,
  findAllByFiscalCode: mockFindAllServPreferencesByFiscalCode
} as unknown as ServicePreferencesDeletableModel;

const iteratorGenMock = async function* (arr: any[]) {
  for (const a of arr) yield a;
};

const messageViewModelMock = {
  getQueryIterator: vi.fn(() => iteratorGenMock([E.right(aMessageView)]))
} as unknown as MessageViewModel;

const messageStatusModelMock = {
  findLastVersionByModelId: vi.fn(() =>
    TE.fromEither(E.right(some(aRetrievedMessageStatus)))
  )
} as unknown as MessageStatusModel;

const profileModelMock = {
  findLastVersionByModelId: vi.fn(() => TE.fromEither(E.right(some(aProfile))))
} as unknown as ProfileModel;

const mockFindNotificationForMessage = vi.fn(() =>
  TE.of(some(aRetrievedNotification))
);
const notificationModelMock = {
  findNotificationForMessage: mockFindNotificationForMessage,
  getQueryIterator: vi.fn(() => notificationIteratorMock)
} as unknown as NotificationModel;

const notificationStatusModelMock = {
  findOneNotificationStatusByNotificationChannel: vi.fn(() =>
    TE.fromEither(E.right(some(aRetrievedNotificationStatus)))
  )
} as unknown as NotificationStatusModel;

// this is a little bit convoluted as we're mocking
// two synchronized streams that end with a promise (zip)
// and a callback (blob) that must be called after the promise resolves
const setupStreamMocks = () => {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const { e1: errorOrResult, e2: resolve } = DeferredPromise<void>();
  const aBlobStream = new stream.PassThrough();
  const blobServiceMock = {
    createWriteStreamToBlockBlob: vi.fn((_, __, ___, cb) => {
      // the following callback must be executed after zipStream.finalize
      errorOrResult.then(cb).catch();
      return aBlobStream;
    })
  } as unknown as BlobService;
  const aZipStream = archiver.create("zip");
  const origFinalize = aZipStream.finalize.bind(aZipStream);

  vi.spyOn(aZipStream, "finalize").mockImplementationOnce(() =>
    origFinalize().then(resolve)
  );
  vi.spyOn(zipstream, "getEncryptedZipStream").mockReturnValueOnce(aZipStream);
  return { aZipStream, blobServiceMock };
};

const aUserDataContainerName = "aUserDataContainerName" as NonEmptyString;

describe("createExtractUserDataActivityHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      servicePreferencesModel: servicePreferencesModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName
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
          assert.fail(
            `Failing decoding result, response: ${readableReport(err)}`
          ),
        e => expect(e.kind).toBe("SUCCESS")
      )
    );
  });

  it("should not export webhook notification data", async () => {
    const { aZipStream, blobServiceMock } = setupStreamMocks();
    const appendSpy = vi.spyOn(aZipStream, "append");

    const notificationWebhookModelMock = {
      findNotificationForMessage: vi.fn(() =>
        TE.fromEither(E.right(some(aRetrievedNotification)))
      ),
      getQueryIterator: vi.fn(() => notificationIteratorMock)
    } as unknown as NotificationModel;

    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      messageViewModel: messageViewModelMock,
      notificationModel: notificationWebhookModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      servicePreferencesModel: servicePreferencesModelMock,
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
    const { aZipStream, blobServiceMock } = setupStreamMocks();
    const appendSpy = vi.spyOn(aZipStream, "append");

    const handler = createExtractUserDataActivityHandler({
      messageContentBlobService: blobServiceMock,
      messageModel: messageModelMock,
      messageStatusModel: messageStatusModelMock,
      messageViewModel: messageViewModelMock,
      notificationModel: notificationModelMock,
      notificationStatusModel: notificationStatusModelMock,
      profileModel: profileModelMock,
      servicePreferencesModel: servicePreferencesModelMock,
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
      servicePreferencesModel: servicePreferencesModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName
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
      servicePreferencesModel: servicePreferencesModelMock,
      userDataBlobService: blobServiceMock,
      userDataContainerName: aUserDataContainerName
    });
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };

    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultSuccess.decode(result))).toBe(true);
  });
});
