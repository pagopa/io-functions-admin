/* eslint-disable vitest/prefer-called-with */
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  UserDataProcessing,
  UserDataProcessingId,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { none, Option, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { context } from "../../__mocks__/functions";
// eslint-disable-next-line vitest/no-mocks-import
import {
  aFiscalCode,
  aUserDataProcessing,
  aUserDataProcessingChoice
} from "../../__mocks__/mocks";
import { setUserDataProcessingStatusHandler } from "../handler";

const throwError = vi.fn(() => false);

const makeUserDataProcessingId = vi.fn(
  (
    choice: UserDataProcessingChoice,
    fiscalCode: FiscalCode
  ): UserDataProcessingId =>
    pipe(
      `${fiscalCode}-${choice}`,
      UserDataProcessingId.decode,
      E.getOrElseW(errors => {
        throw new Error("");
      })
    )
);

const mockUserDataProcessingModel = {
  createOrUpdateByNewOne: vi.fn((u: UserDataProcessing) =>
    throwError()
      ? TE.left<CosmosErrors, UserDataProcessing>({
          kind: "COSMOS_ERROR_RESPONSE"
        } as CosmosErrors)
      : TE.of<CosmosErrors, UserDataProcessing>(aUserDataProcessing)
  ),
  findLastVersionByModelId: vi.fn(([modelId, partitionKey]) =>
    TE.of<CosmosErrors, Option<UserDataProcessing>>(
      aUserDataProcessing.fiscalCode == partitionKey
        ? some(aUserDataProcessing)
        : none
    )
  )
} as any as UserDataProcessingModel;

describe("setUserDataProcessingStatusHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return IResponseErrorNotFound if no record has been found", async () => {
    const notExistingFiscalCode = "DSRMHL99T99C999D" as FiscalCode;

    const result = await setUserDataProcessingStatusHandler(
      mockUserDataProcessingModel
    )(
      context,
      aUserDataProcessingChoice,
      notExistingFiscalCode,
      UserDataProcessingStatusEnum.CLOSED
    );

    expect(result.kind).toEqual("IResponseErrorNotFound");

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalled();

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalledTimes(1);

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalledWith([
      makeUserDataProcessingId(
        aUserDataProcessingChoice,
        notExistingFiscalCode
      ),
      notExistingFiscalCode
    ]);

    expect(
      mockUserDataProcessingModel.createOrUpdateByNewOne
    ).not.toHaveBeenCalled();
  });

  it("should return IResponseSuccessAccepted if new record version has been created successfully", async () => {
    const result = await setUserDataProcessingStatusHandler(
      mockUserDataProcessingModel
    )(
      context,
      aUserDataProcessingChoice,
      aFiscalCode,
      UserDataProcessingStatusEnum.CLOSED
    );

    expect(result.kind).toEqual("IResponseSuccessAccepted");

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalled();

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalledTimes(1);

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalledWith([
      makeUserDataProcessingId(aUserDataProcessingChoice, aFiscalCode),
      aFiscalCode
    ]);

    expect(
      mockUserDataProcessingModel.createOrUpdateByNewOne
    ).toHaveBeenCalled();

    expect(
      mockUserDataProcessingModel.createOrUpdateByNewOne
    ).toHaveBeenCalledTimes(1);

    expect(
      mockUserDataProcessingModel.createOrUpdateByNewOne
    ).toHaveBeenCalledWith({
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.CLOSED,
      updatedAt: expect.any(Object)
    });
  });

  it("should return IResponseErrorInternal if any error has been thrown", async () => {
    throwError.mockImplementationOnce(() => true);

    const result = await setUserDataProcessingStatusHandler(
      mockUserDataProcessingModel
    )(
      context,
      aUserDataProcessingChoice,
      aFiscalCode,
      UserDataProcessingStatusEnum.CLOSED
    );

    expect(result.kind).toEqual("IResponseErrorInternal");

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalled();

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalledTimes(1);

    expect(
      mockUserDataProcessingModel.findLastVersionByModelId
    ).toHaveBeenCalledWith([
      makeUserDataProcessingId(aUserDataProcessingChoice, aFiscalCode),
      aFiscalCode
    ]);

    expect(
      mockUserDataProcessingModel.createOrUpdateByNewOne
    ).toHaveBeenCalled();

    expect(
      mockUserDataProcessingModel.createOrUpdateByNewOne
    ).toHaveBeenCalledTimes(1);

    expect(
      mockUserDataProcessingModel.createOrUpdateByNewOne
    ).toHaveBeenCalledWith({
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.CLOSED,
      updatedAt: expect.any(Object)
    });
  });

  it("should return IResponseErrorInternal if given status is not allowed", async () => {
    throwError.mockImplementationOnce(() => true);

    const result = await setUserDataProcessingStatusHandler(
      mockUserDataProcessingModel
    )(
      context,
      aUserDataProcessingChoice,
      aFiscalCode,
      // @ts-ignore to force bad behavior
      UserDataProcessingStatusEnum.WIP
    );

    expect(result.kind).toEqual("IResponseErrorInternal");
  });
});
