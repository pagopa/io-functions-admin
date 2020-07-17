// tslint:disable: no-any

import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../__mocks__/mocks";
import {
  index,
  ProcessableUserDataDelete,
  ProcessableUserDataDownload
} from "../index";

// converts a UserDataProcessing object in a form as it would come from the database
const toUndecoded = (doc: UserDataProcessing) => ({
  ...doc,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : undefined
});

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
  choice: UserDataProcessingChoiceEnum.DOWNLOAD,
  status: UserDataProcessingStatusEnum.WIP
};

const aNonProcessableDeleteWrongStatus = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DELETE,
  status: UserDataProcessingStatusEnum.WIP
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
      aNonProcessableDeleteWrongStatus
    ];

    await index(context, input);

    expect(mockStartNew).toHaveBeenCalledTimes(processableDocs.length);
  });

  it("should process every processable document (with undecoded data)", async () => {
    const processableDocs: ReadonlyArray<UserDataProcessing> = [
      aProcessableDownload,
      aProcessableDownload,
      aProcessableDelete
    ];

    const input: ReadonlyArray<any> = [
      ...processableDocs,
      aNonProcessableDownloadWrongStatus,
      aNonProcessableDeleteWrongStatus
    ].map(toUndecoded);

    await index(context, input);

    expect(mockStartNew).toHaveBeenCalledTimes(processableDocs.length);
  });
});

describe("ProcessableUserDataDownload", () => {
  it("should map processable download records", () => {
    expect(
      ProcessableUserDataDownload.decode(aProcessableDownload).isRight()
    ).toBe(true);
  });
  it.each`
    name                       | value
    ${"delete wrong status"}   | ${aNonProcessableDeleteWrongStatus}
    ${"download wrong status"} | ${aNonProcessableDownloadWrongStatus}
    ${"processable delete"}    | ${aProcessableDelete}
  `("should not map unprocessable record '$name'", ({ value }) => {
    expect(ProcessableUserDataDownload.decode(value).isLeft()).toBe(true);
  });
});

describe("ProcessableUserDataDelete", () => {
  it("should map processable delete records", () => {
    expect(ProcessableUserDataDelete.decode(aProcessableDelete).isRight()).toBe(
      true
    );
  });
  it.each`
    name                       | value
    ${"delete wrong status"}   | ${aNonProcessableDeleteWrongStatus}
    ${"download wrong status"} | ${aNonProcessableDownloadWrongStatus}
    ${"processable download"}  | ${aProcessableDownload}
  `("should not map unprocessable record '$name'", ({ value }) => {
    expect(ProcessableUserDataDelete.decode(value).isLeft()).toBe(true);
  });
});
