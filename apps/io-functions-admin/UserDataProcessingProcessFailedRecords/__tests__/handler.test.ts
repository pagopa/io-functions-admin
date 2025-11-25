import { FeedOptions, SqlQuerySpec } from "@azure/cosmos";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  UserDataProcessing,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/durableorchestrationstatus";
import * as E from "fp-ts/lib/Either";
import { Branded } from "io-ts";
import * as t from "io-ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { context } from "../../__mocks__/functions";
import { processFailedUserDataProcessingHandler } from "../handler";

vi.mock("durable-functions", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getClient: (_context: unknown) => ({
    getStatus: async (orchestratorId: string) =>
      ({
        createdTime: new Date(),
        input: null,
        instanceId: orchestratorId,
        lastUpdatedTime: new Date(),
        name: orchestratorId,
        output: null,
        runtimeStatus: "Completed"
      }) as DurableOrchestrationStatus,
    startNew: async (
      orchestratorName: string,
      orchestratorId: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      orchestratorInput: string
    ) => orchestratorId
  }),
  OrchestrationRuntimeStatus: {
    Running: "Running"
  }
}));

const userDataProcessingRecords = [
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "GCPMNL86A24H501K" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "IOOWZZ43A99Y618X" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "RLDBSV36A78Y792X" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "UEEFON48A55Y758T" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "ICNLFF02A39Y185X" as FiscalCode,
    status: UserDataProcessingStatusEnum.PENDING
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "CMFYIL20A76Y100X" as FiscalCode,
    status: UserDataProcessingStatusEnum.WIP
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "CMFYIL20A76Y100X" as FiscalCode,
    status: UserDataProcessingStatusEnum.CLOSED
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "ADSHTY00A31Y974X" as FiscalCode,
    status: UserDataProcessingStatusEnum.CLOSED
  },
  {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode: "EVVAXG86A51Y127X" as FiscalCode,
    status: UserDataProcessingStatusEnum.CLOSED
  },
  {
    choice: UserDataProcessingChoiceEnum.DOWNLOAD,
    fiscalCode: "LVDNGK37A81Y071X" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DOWNLOAD,
    fiscalCode: "MMPPLG60A34Y945X" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DOWNLOAD,
    fiscalCode: "GDNNWA12H81Y874F" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DOWNLOAD,
    fiscalCode: "VOPGTY34A40Y240T" as FiscalCode,
    status: UserDataProcessingStatusEnum.FAILED
  },
  {
    choice: UserDataProcessingChoiceEnum.DOWNLOAD,
    fiscalCode: "DSRMHL85T06C640D" as FiscalCode,
    status: UserDataProcessingStatusEnum.CLOSED
  }
];

const recordMock = (
  choice: UserDataProcessingChoiceEnum,
  fiscalCode: FiscalCode,
  status: UserDataProcessingStatusEnum,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  version: NonNegativeInteger
): UserDataProcessing => ({
  choice: choice,
  createdAt: new Date(),
  fiscalCode: fiscalCode,
  status: status,
  userDataProcessingId: `${fiscalCode}-${choice}` as Branded<
    string,
    { readonly IUserDataProcessingIdTag: symbol }
  >
});

const recordsIterator = (query: SqlQuerySpec | string) => ({
  async *[Symbol.asyncIterator]() {
    // I don't care for string queries, but I manage it to keep signatures coherent
    const queriedRecords = userDataProcessingRecords.filter(r =>
      typeof query === "string" || query.parameters === undefined
        ? false
        : r.status === query.parameters[0].value
    );
    for (const record of queriedRecords) {
      // wait for 100ms to not pass the 5000ms limit of jest
      // and keep the asynchrounous behaviour
      await new Promise(resolve => setTimeout(resolve, 100));
      yield [
        E.tryCatch(
          () =>
            recordMock(
              record.choice,
              record.fiscalCode,
              record.status,
              1 as NonNegativeInteger
            ),
          _ => [
            {
              message: "error"
            } as t.ValidationError
          ]
        )
      ];
    }
  }
});

const getQueryIteratorMock = vi.fn(
  (
    query: SqlQuerySpec | string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: FeedOptions
  ): AsyncIterable<readonly t.Validation<UserDataProcessing>[]> =>
    recordsIterator(query)
);

// this mocked model returns an async iterable for getQueryIterator
// that returns only records that respect a query by status value
const userDataProcessingModelMock = {
  getQueryIterator: getQueryIteratorMock
} as unknown as UserDataProcessingModel;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FindFailedRecords", () => {
  it("should start orchestrator only for failed results", async () => {
    const results = await processFailedUserDataProcessingHandler(
      userDataProcessingModelMock
    )(context);

    // eslint-disable-next-line vitest/prefer-called-with
    expect(getQueryIteratorMock).toHaveBeenCalled();

    // expect result to contain only orchestrator ids for failed records
    expect(results).toEqual(
      expect.objectContaining({
        kind: "IResponseSuccessJson",
        value: [
          "DELETE-GCPMNL86A24H501K-FAILED-USER-DATA-PROCESSING-RECOVERY",
          "DELETE-IOOWZZ43A99Y618X-FAILED-USER-DATA-PROCESSING-RECOVERY",
          "DELETE-RLDBSV36A78Y792X-FAILED-USER-DATA-PROCESSING-RECOVERY",
          "DELETE-UEEFON48A55Y758T-FAILED-USER-DATA-PROCESSING-RECOVERY",
          "DOWNLOAD-LVDNGK37A81Y071X-FAILED-USER-DATA-PROCESSING-RECOVERY",
          "DOWNLOAD-MMPPLG60A34Y945X-FAILED-USER-DATA-PROCESSING-RECOVERY",
          "DOWNLOAD-GDNNWA12H81Y874F-FAILED-USER-DATA-PROCESSING-RECOVERY",
          "DOWNLOAD-VOPGTY34A40Y240T-FAILED-USER-DATA-PROCESSING-RECOVERY"
        ]
      })
    );
  });
});
