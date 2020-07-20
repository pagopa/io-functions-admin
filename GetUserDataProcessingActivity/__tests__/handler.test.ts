/* tslint:disable: no-any no-identical-functions */

import { left, right } from "fp-ts/lib/Either";

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aFiscalCode, aUserDataProcessing } from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultInvalidInputFailure,
  ActivityResultNotFoundFailure,
  ActivityResultQueryFailure,
  ActivityResultSuccess,
  createSetUserDataProcessingStatusActivityHandler
} from "../handler";

import { QueryError } from "documentdb";
import { none, some } from "fp-ts/lib/Option";
import { UserDataProcessingModel } from "io-functions-commons/dist/src/models/user_data_processing";

const aChoice = aUserDataProcessing.choice;

describe("SetUserDataProcessingStatusActivityHandler", () => {
  it("should handle a result", async () => {
    const mockModel = ({
      findOneUserDataProcessingById: jest.fn(async () =>
        right(some(aUserDataProcessing))
      )
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(ActivityResultSuccess.decode(result).isRight()).toBe(true);
  });

  it("should handle a record not found failure", async () => {
    const mockModel = ({
      findOneUserDataProcessingById: jest.fn(async () => right(none))
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(ActivityResultNotFoundFailure.decode(result).isRight()).toBe(true);
  });

  it("should handle a query error", async () => {
    const mockModel = ({
      findOneUserDataProcessingById: jest.fn(async () =>
        left(({
          body: "my mock query error"
        } as any) as QueryError)
      )
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(ActivityResultQueryFailure.decode(result).isRight()).toBe(true);
  });

  it("should handle a rejection", async () => {
    const mockModel = ({
      findOneUserDataProcessingById: jest.fn(async () => {
        throw new Error("my unhandled rejection");
      })
    } as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(ActivityResultQueryFailure.decode(result).isRight()).toBe(true);
  });

  it("should handle an invalid input", async () => {
    const mockModel = ({} as any) as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      invalid: "input"
    });

    expect(ActivityResultInvalidInputFailure.decode(result).isRight()).toBe(
      true
    );
  });
});
