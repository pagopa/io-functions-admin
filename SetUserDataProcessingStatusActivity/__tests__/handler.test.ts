/* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-identical-functions */

import { left, right } from "fp-ts/lib/Either";

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultFailure,
  ActivityResultSuccess,
  createSetUserDataProcessingStatusActivityHandler
} from "../handler";

import { fromEither, fromLeft } from "fp-ts/lib/TaskEither";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  UserDataProcessing,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";

describe("SetUserDataProcessingStatusActivityHandler", () => {
  it("should handle a correct status change", async () => {
    const mockModel = ({
      createOrUpdateByNewOne: jest.fn(() =>
        fromEither(
          right({
            ...aUserDataProcessing,
            status: UserDataProcessingStatusEnum.WIP
          })
        )
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

    expect(result.kind).toEqual("SUCCESS");
  });

  it("should handle a query error", async () => {
    const mockModel = ({
      createOrUpdateByNewOne: jest.fn(() =>
        fromLeft(toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" }))
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

    ActivityResultFailure.decode(result).fold(
      err => fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
      failure => {
        expect(failure.kind).toEqual(expect.any(String));
      }
    );
  });

  it("should handle an invalid input", async () => {
    const mockModel = ({} as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      invalid: "input"
    });

    ActivityResultFailure.decode(result).fold(
      err => fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
      failure => {
        expect(failure.kind).toEqual(expect.any(String));
      }
    );
  });

  it("should handle transitions from FAILED to another status", async () => {
    const reason = "any reason";
    const aFailedUserDataProcessing = {
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.FAILED,
      reason
    } as UserDataProcessing;
    const nextStatus = UserDataProcessingStatusEnum.PENDING;
    const mockModel = ({
      createOrUpdateByNewOne: jest.fn(() =>
        fromEither(
          right({
            ...aUserDataProcessing,
            status: nextStatus
          })
        )
      )
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      currentRecord: aFailedUserDataProcessing,
      nextStatus: UserDataProcessingStatusEnum.PENDING
    });
    console.log(result);
    ActivityResultSuccess.decode(result).fold(
      err => fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
      res => {
        expect(res.kind).toBe("SUCCESS");
      }
    );
  });

  it("should handle transitions from any status to FAILED", async () => {
    const aFailedUserDataProcessing = {
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.PENDING
    } as UserDataProcessing;
    const nextStatus = UserDataProcessingStatusEnum.FAILED;
    const mockModel = ({
      createOrUpdateByNewOne: jest.fn(() =>
        fromEither(
          right({
            ...aUserDataProcessing,
            status: nextStatus
          })
        )
      )
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      currentRecord: aFailedUserDataProcessing,
      nextStatus: UserDataProcessingStatusEnum.PENDING
    });
    console.log(result);
    ActivityResultSuccess.decode(result).fold(
      err => fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
      res => {
        expect(res.kind).toBe("SUCCESS");
      }
    );
  });
});
