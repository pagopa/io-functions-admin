/* tslint:disable: no-any no-identical-functions */

import { left, right } from "fp-ts/lib/Either";

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultFailure,
  createSetUserDataProcessingStatusActivityHandler
} from "../handler";

import { QueryError } from "documentdb";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessingModel } from "io-functions-commons/dist/src/models/user_data_processing";

describe("SetUserDataProcessingStatusActivityHandler", () => {
  it("should handle a correct status change", async () => {
    const mockModel = ({
      createOrUpdateByNewOne: jest.fn(async () =>
        right({
          ...aUserDataProcessing,
          status: UserDataProcessingStatusEnum.WIP
        })
      )
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      currentRecord: {
        ...aUserDataProcessing,
        status: UserDataProcessingStatusEnum.PENDING
      },
      nextStatus: UserDataProcessingStatusEnum.WIP
    };
    const result = await handler(contextMock, input);

    result.fold(
      response => fail(`Failing result, reason: ${response.reason}`),
      response => {
        expect(response.value.status).toEqual(UserDataProcessingStatusEnum.WIP);
      }
    );
  });

  it("should handle a query error", async () => {
    const mockModel = ({
      createOrUpdateByNewOne: jest.fn(async () =>
        left(({
          body: "my mock query error"
        } as any) as QueryError)
      )
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      currentRecord: {
        ...aUserDataProcessing,
        status: UserDataProcessingStatusEnum.PENDING
      },
      nextStatus: UserDataProcessingStatusEnum.WIP
    };
    const result = await handler(contextMock, input);

    result.fold(
      response => {
        ActivityResultFailure.decode(response).fold(
          err =>
            fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
          failure => {
            expect(failure.kind).toEqual(expect.any(String));
          }
        );
      },
      _ => fail(`Should not consider this a Right`)
    );
  });

  it("should handle a rejection", async () => {
    const mockModel = ({
      createOrUpdateByNewOne: jest.fn(async () => {
        throw new Error("my unhandled rejection");
      })
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      currentRecord: {
        ...aUserDataProcessing,
        status: UserDataProcessingStatusEnum.PENDING
      },
      nextStatus: UserDataProcessingStatusEnum.WIP
    };
    const result = await handler(contextMock, input);

    result.fold(
      response => {
        ActivityResultFailure.decode(response).fold(
          err =>
            fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
          failure => {
            expect(failure.kind).toEqual(expect.any(String));
          }
        );
      },
      _ => fail(`Should not consider this a Right`)
    );
  });

  it("should handle an invalid input", async () => {
    const mockModel = ({} as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      invalid: "input"
    });

    result.fold(
      response => {
        ActivityResultFailure.decode(response).fold(
          err =>
            fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
          failure => {
            expect(failure.kind).toEqual(expect.any(String));
          }
        );
      },
      _ => fail(`Should not consider this a Right`)
    );
  });
});
