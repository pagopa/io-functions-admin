/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonar/sonar-max-lines-per-function */

import * as df from "durable-functions";
import * as lolex from "lolex";

import { left, right } from "fp-ts/lib/Either";

import { fromEither, fromLeft } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  aNewService,
  aRetrievedService,
  aSeralizedService,
  aServicePayload
} from "../../__mocks__/mocks";
import { UpsertServiceEvent } from "../../utils/UpsertServiceEvent";
import { CreateServiceHandler } from "../handler";

// eslint-disable-next-line functional/no-let
let clock: lolex.InstalledClock;

beforeEach(() => {
  (df.getClient as any).mockClear();
  (df as any).mockStartNew.mockClear();
  clock = lolex.install({ now: Date.now() });
});
afterEach(() => {
  clock.uninstall();
});

describe("CreateServiceHandler", () => {
  it("should return a query error if the service fails to be created", async () => {
    const mockServiceModel = {
      create: jest.fn(_ => {
        return fromLeft(
          toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" })
        );
      })
    };

    const createServiceHandler = CreateServiceHandler(mockServiceModel as any);

    const response = await createServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload
    );

    expect(mockServiceModel.create).toHaveBeenCalledWith(aNewService);
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("should create a new service using the payload and return the created service", async () => {
    const mockServiceModel = {
      create: jest.fn(_ => {
        return fromEither(right(aRetrievedService));
      })
    };

    const createServiceHandler = CreateServiceHandler(mockServiceModel as any);

    const response = await createServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload
    );

    expect(mockServiceModel.create).toHaveBeenCalledWith(aNewService);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aSeralizedService);
    }
  });

  it("should start the orchestrator with an appropriate event after the service is created", async () => {
    const mockServiceModel = {
      create: jest.fn(_ => {
        return fromEither(right(aRetrievedService));
      })
    };

    const contextMock = {
      log: jest.fn()
    };

    const createServiceHandler = CreateServiceHandler(mockServiceModel as any);

    await createServiceHandler(
      contextMock as any, // Not used
      undefined as any, // Not used
      aServicePayload
    );

    const upsertServiceEvent = UpsertServiceEvent.encode({
      newService: aRetrievedService,
      updatedAt: new Date()
    });

    expect(df.getClient).toHaveBeenCalledTimes(1);

    const dfClient = df.getClient(contextMock);
    expect(dfClient.startNew).toHaveBeenCalledTimes(1);
    expect(dfClient.startNew).toHaveBeenCalledWith(
      "UpsertServiceOrchestrator",
      undefined,
      upsertServiceEvent
    );
  });
});
