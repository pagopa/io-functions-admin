import { right } from "fp-ts/lib/Either";
import { context as contextMock } from "../../__mocks__/durable-functions";
import {
  aFiscalCode,
  aUserDataProcessing,
  aUserDataProcessingStatus
} from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultInvalidInputFailure,
  ActivityResultNotFoundFailure,
  ActivityResultQueryFailure,
  ActivityResultSuccess,
  createUserDataProcessingCheckLastStatusActivityHandler
} from "../handler";

import { none, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import { UserDataProcessingModel } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";

const aChoice = aUserDataProcessing.choice;

describe("UserDataProcessingCheckLastStatusActivity", () => {
  it("should handle a result", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() =>
        TE.fromEither(right(some(aUserDataProcessing)))
      )
    } as any) as UserDataProcessingModel;

    const handler = createUserDataProcessingCheckLastStatusActivityHandler(
      mockModel
    );
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    const decodedResult = ActivityResultSuccess.decode(result);
    expect(E.isRight(decodedResult)).toBe(true);
    if (E.isRight(decodedResult)) {
      expect(decodedResult.right).toEqual({
        kind: "SUCCESS",
        value: aUserDataProcessingStatus
      });
    }
  });

  it("should handle a record not found failure", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() => TE.fromEither(right(none)))
    } as any) as UserDataProcessingModel;

    const handler = createUserDataProcessingCheckLastStatusActivityHandler(
      mockModel
    );
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultNotFoundFailure.decode(result))).toBe(true);
  });

  it("should handle a query error", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() =>
        TE.left(toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" }))
      )
    } as any) as UserDataProcessingModel;

    const handler = createUserDataProcessingCheckLastStatusActivityHandler(
      mockModel
    );
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultQueryFailure.decode(result))).toBe(true);
  });

  it("should handle a rejection", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() => TE.fromEither(right(none)))
    } as any) as UserDataProcessingModel;

    const handler = createUserDataProcessingCheckLastStatusActivityHandler(
      mockModel
    );
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultNotFoundFailure.decode(result))).toBe(true);
  });

  it("should handle an invalid input", async () => {
    const mockModel = ({} as any) as UserDataProcessingModel;

    const handler = createUserDataProcessingCheckLastStatusActivityHandler(
      mockModel
    );

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      invalid: "input"
    });

    expect(E.isRight(ActivityResultInvalidInputFailure.decode(result))).toBe(
      true
    );
  });
});
