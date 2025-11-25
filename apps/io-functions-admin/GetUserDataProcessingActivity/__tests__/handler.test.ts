/* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-identical-functions */

import { UserDataProcessingModel } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import * as E from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

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

const aChoice = aUserDataProcessing.choice;

describe("GetUserDataProcessingActivityHandler", () => {
  it("should handle a result", async () => {
    const mockModel = {
      findLastVersionByModelId: vi.fn(() =>
        TE.fromEither(E.right(some(aUserDataProcessing)))
      )
    } as any as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultSuccess.decode(result))).toBe(true);
  });

  it("should handle a record not found failure", async () => {
    const mockModel = {
      findLastVersionByModelId: vi.fn(() => TE.fromEither(E.right(none)))
    } as any as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultNotFoundFailure.decode(result))).toBe(true);
  });

  it("should handle a query error", async () => {
    const mockModel = {
      findLastVersionByModelId: vi.fn(() =>
        TE.left(toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" }))
      )
    } as any as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultQueryFailure.decode(result))).toBe(true);
  });

  it("should handle a rejection", async () => {
    const mockModel = {
      findLastVersionByModelId: vi.fn(() => TE.fromEither(E.right(none)))
    } as any as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultNotFoundFailure.decode(result))).toBe(true);
  });

  it("should handle an invalid input", async () => {
    const mockModel = {} as any as UserDataProcessingModel;

    const handler = createSetUserDataProcessingStatusActivityHandler(mockModel);

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      invalid: "input"
    });

    expect(E.isRight(ActivityResultInvalidInputFailure.decode(result))).toBe(
      true
    );
  });
});
