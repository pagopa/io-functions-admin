/* tslint:disable: no-any no-identical-functions */

import { right } from "fp-ts/lib/Either";

import { context as contextMock } from "../../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultFailure,
  createGetUserDataProcessingHandler
} from "../handler";

import { none, some } from "fp-ts/lib/Option";
import { fromEither, fromLeft } from "fp-ts/lib/TaskEither";
import { UserDataProcessingModel } from "io-functions-commons/dist/src/models/user_data_processing";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";

const aFiscalCode = aUserDataProcessing.fiscalCode;
const aChoice = aUserDataProcessing.choice;

describe("GetUserDataProcessingHandler", () => {
  it("should retrieve an existing record", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() =>
        fromEither(right(some(aUserDataProcessing)))
      )
    } as any) as UserDataProcessingModel;

    const handler = createGetUserDataProcessingHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(result.kind).toEqual("SUCCESS");
  });

  it("should handle a query error", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() =>
        fromLeft(toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" }))
      )
    } as any) as UserDataProcessingModel;

    const handler = createGetUserDataProcessingHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    ActivityResultFailure.decode(result).fold(
      err => fail(`Failing decoding result, response: ${JSON.stringify(err)}`),
      failure => {
        expect(failure.kind).toEqual(expect.any(String));
      }
    );
  });

  it("should handle a record not found", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() => fromEither(right(none)))
    } as any) as UserDataProcessingModel;

    const handler = createGetUserDataProcessingHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
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

    const handler = createGetUserDataProcessingHandler(mockModel);

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
});
