/* tslint:disable: no-any no-identical-functions */

import { left, right } from "fp-ts/lib/Either";

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultFailure,
  createGetUserDataProcessingActivityHandler
} from "../handler";

import { QueryError } from "documentdb";
import { none, some } from "fp-ts/lib/Option";
import { UserDataProcessingModel } from "io-functions-commons/dist/src/models/user_data_processing";

const aFiscalCode = aUserDataProcessing.fiscalCode;
const aChoice = aUserDataProcessing.choice;

describe("GetUserDataProcessingActivityHandler", () => {
  it("should retrieve an existing record", async () => {
    const mockModel = ({
      findOneUserDataProcessingById: jest.fn(async () =>
        right(some(aUserDataProcessing))
      )
    } as any) as UserDataProcessingModel;

    const handler = createGetUserDataProcessingActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(result.kind).toEqual("SUCCESS");
  });

  it("should handle a query error", async () => {
    const mockModel = ({
      findOneUserDataProcessingById: jest.fn(async () =>
        left(({
          body: "my mock query error"
        } as any) as QueryError)
      )
    } as any) as UserDataProcessingModel;

    const handler = createGetUserDataProcessingActivityHandler(mockModel);
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
      findOneUserDataProcessingById: jest.fn(async () => right(none))
    } as any) as UserDataProcessingModel;

    const handler = createGetUserDataProcessingActivityHandler(mockModel);
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

    const handler = createGetUserDataProcessingActivityHandler(mockModel);

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
