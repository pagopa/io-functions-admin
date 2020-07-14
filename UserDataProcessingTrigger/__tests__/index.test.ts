// tslint:disable: no-any

import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../__mocks__/mocks";
import { index } from "../index";

const aProcessableDownload = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DOWNLOAD,
  status: UserDataProcessingStatusEnum.PENDING
};

const aProcessableDelete = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DELETE,
  status: UserDataProcessingStatusEnum.PENDING
};

const aNonProcessableDownloadWrongStatus = {
  ...aUserDataProcessing,
  status: UserDataProcessingStatusEnum.WIP
};

const aNonProcessableDownloadWrongChoice = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DELETE
};

describe("UserDataProcessingTrigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail on invalid input", async () => {
    const input = "invalid";

    try {
      await index(context, input);
      fail("it should throw");
    } catch (error) {
      expect(mockStartNew).not.toHaveBeenCalled();
    }
  });

  it("should process every processable document", async () => {
    const processableDocs: ReadonlyArray<UserDataProcessing> = [
      aProcessableDownload,
      aProcessableDownload,
      aProcessableDelete
    ];

    const input: ReadonlyArray<any> = [
      ...processableDocs,
      aNonProcessableDownloadWrongStatus,
      aNonProcessableDownloadWrongChoice
    ];

    await index(context, input);

    expect(mockStartNew).toHaveBeenCalledTimes(processableDocs.length);
  });
});
