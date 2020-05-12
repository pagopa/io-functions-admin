/* tslint:disable: no-any */

import { Either, right } from "fp-ts/lib/Either";
import { fromNullable, Option, some } from "fp-ts/lib/Option";

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aFiscalCode, aProfile } from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultSuccess,
  createExtractUserDataActivityHandler
} from "../handler";

import { BlobService } from "azure-storage";
import { QueryError } from "documentdb";
import { MessageModel } from "io-functions-commons/dist/src/models/message";
import { ProfileModel } from "io-functions-commons/dist/src/models/profile";
import { SenderServiceModel } from "io-functions-commons/dist/src/models/sender_service";
import { readableReport } from "italia-ts-commons/lib/reporters";
import {
  aMessageContent,
  aRetrievedMessageWithContent,
  aRetrievedNotification,
  aRetrievedSenderService
} from "../../__mocks__/mocks";
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
    createMockIterator([aRetrievedMessageWithContent])
  ),
  getContentFromBlob: jest.fn(async () => right(some(aMessageContent)))
} as any) as MessageModel;

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

const blobServiceMock = ({} as any) as BlobService;

describe("createExtractUserDataActivityHandler", () => {
  it("should handle export for existing user", async () => {
    const handler = createExtractUserDataActivityHandler(
      messageModelMock,
      notificationModelMock,
      profileModelMock,
      senderServiceModelMock,
      blobServiceMock
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
          e => {
            expect(e.kind).toBe("SUCCESS");
            // tslint:disable-next-line: no-commented-code
            /* expect(e.value.profile).toEqual(aProfile);
            expect(e.value.messages).toEqual([aRetrievedMessageWithContent]);
            expect(e.value.senderServices).toEqual([aRetrievedSenderService]);
            expect(e.value.notifications).toEqual([aRetrievedNotification]); */
          }
        );
      }
    );
  });
});
