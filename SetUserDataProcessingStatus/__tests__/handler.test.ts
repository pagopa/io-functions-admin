import { setUserDataProcessingStatusHandler } from "../handler";
import {
  UserDataProcessing,
  UserDataProcessingId,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import {
  aUserDataProcessing,
  aFiscalCode,
  aUserDataProcessingChoice
} from "../../__mocks__/mocks";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { none, Option, some } from "fp-ts/lib/Option";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";

let throwError = jest.fn(() => false);

const makeUserDataProcessingId = jest.fn(
  (
    choice: UserDataProcessingChoice,
    fiscalCode: FiscalCode
  ): UserDataProcessingId =>
    UserDataProcessingId.decode(`${fiscalCode}-${choice}`).getOrElseL(
      errors => {
        throw new Error("");
      }
    )
);

const mockUserDataProcessingModel = ({
  findLastVersionByModelId: jest.fn(([modelId, partitionKey]) => {
    return taskEither.of<CosmosErrors, Option<UserDataProcessing>>(
      aUserDataProcessing.fiscalCode == partitionKey
        ? some(aUserDataProcessing)
        : none
    );
  }),
  createOrUpdateByNewOne: jest.fn((u: UserDataProcessing) => {
    return throwError()
      ? fromLeft<CosmosErrors, UserDataProcessing>({
          kind: "COSMOS_ERROR_RESPONSE"
        } as CosmosErrors)
      : taskEither.of<CosmosErrors, UserDataProcessing>(aUserDataProcessing);
  })
} as any) as UserDataProcessingModel;

describe("setUserDataProcessingStatusHandler", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return IResponseErrorNotFound if no record has been found", async () => {
    const notExistingFiscalCode = "DSRMHL99T99C999D" as FiscalCode;

    const result = await setUserDataProcessingStatusHandler(
      mockUserDataProcessingModel
    )(
      null,
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
      makeUserDataProcessingId(aUserDataProcessingChoice, notExistingFiscalCode),
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
      null,
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
      null,
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
      null,
      aUserDataProcessingChoice,
      aFiscalCode,
      // @ts-ignore to force bad behavior
      UserDataProcessingStatusEnum.WIP
    );

    expect(result.kind).toEqual("IResponseErrorInternal");
  });
});
