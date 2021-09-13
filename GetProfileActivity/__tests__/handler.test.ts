/* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-identical-functions */

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aFiscalCode, aRetrievedProfile } from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultInvalidInputFailure,
  ActivityResultNotFoundFailure,
  ActivityResultQueryFailure,
  ActivityResultSuccess,
  createGetProfileActivityHandler
} from "../handler";

import { none, some } from "fp-ts/lib/Option";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { ProfileModel } from "@pagopa/io-functions-commons/dist/src/models/profile";

describe("GetProfileActivityHandler", () => {
  it("should handle a result", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() =>
        TE.fromEither(E.right(some(aRetrievedProfile)))
      )
    } as any) as ProfileModel;

    const handler = createGetProfileActivityHandler(mockModel);
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultSuccess.decode(result))).toBe(true);
  });

  it("should handle a record not found failure", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() => TE.fromEither(E.right(none)))
    } as any) as ProfileModel;

    const handler = createGetProfileActivityHandler(mockModel);
    const input: ActivityInput = {
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
    } as any) as ProfileModel;

    const handler = createGetProfileActivityHandler(mockModel);
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultQueryFailure.decode(result))).toBe(true);
  });

  it("should handle a rejection", async () => {
    const mockModel = ({
      findLastVersionByModelId: jest.fn(() => TE.fromEither(E.right(none)))
    } as any) as ProfileModel;

    const handler = createGetProfileActivityHandler(mockModel);
    const input: ActivityInput = {
      fiscalCode: aFiscalCode
    };
    const result = await handler(contextMock, input);

    expect(E.isRight(ActivityResultNotFoundFailure.decode(result))).toBe(true);
  });

  it("should handle an invalid input", async () => {
    const mockModel = ({} as any) as ProfileModel;

    const handler = createGetProfileActivityHandler(mockModel);

    // @ts-ignore to force bad behavior
    const result = await handler(contextMock, {
      invalid: "input"
    });

    expect(E.isRight(ActivityResultInvalidInputFailure.decode(result))).toBe(
      true
    );
  });
});
